import { getFirestore, isFirebaseConfigured } from "@/lib/firebaseAdmin";

export type TableStatus = "LIBRE" | "OCUPADA" | "RESERVADA" | "POR_LIMPIAR";
export type Area = "TERRAZA_FRONTAL" | "TERRAZA_LATERAL" | "INTERIOR" | "PLANTA_ALTA";
export type ReservationStatus =
  | "WAITING"
  | "WAITLIST"
  | "OFFERED"
  | "RESERVED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";
export type ReservationSource = "WALK_IN" | "CALL";

export type CafeTable = {
  id: string;
  name: string;
  area: Area;
  capacityPax?: number | null;
  status: TableStatus;
  nextReservedFor?: number | null;
  lastFreedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export async function seedUpstairsTables() {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();

  const capacities: Record<string, number> = {
    "21": 2,
    "22": 4,
    "23": 4,
    "24": 4,
    "25": 4,
    "26": 4,
    "27": 4,
    "28": 4,
    "29": 4,
    "30": 3,
    "31": 6,
    "32": 6,
    "33": 6,
    "34": 2,
    "35": 2,
    "36": 6,
    "37": 2,
    "38": 2,
    "39": 2
  };

  const batch = db.batch();
  let upserted = 0;

  for (const [name, capacityPax] of Object.entries(capacities)) {
    const ref = db.collection("tables").doc(String(name));
    batch.set(
      ref,
      {
        name: String(name),
        area: "PLANTA_ALTA",
        capacityPax,
        status: "LIBRE",
        nextReservedFor: null,
        lastFreedAt: null,
        createdAt: ts,
        updatedAt: ts
      },
      { merge: true }
    );
    upserted++;
  }

  await batch.commit();

  return { ok: true, upserted };
}

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  isRecurrent?: boolean | null;
  createdAt: number;
  updatedAt: number;
};

export type Reservation = {
  id: string;
  customerId: string;
  customerNameSnapshot?: string | null;
  waConfirmationStatus?: "SENT" | "FAILED" | "SKIPPED" | null;
  waConfirmationAt?: number | null;
  waConfirmationMessageId?: string | null;
  waConfirmationError?: string | null;
  tableId?: string | null;
  tableIds?: string[] | null;
  activeTableIds?: string[] | null;
  requestedTablesCount?: number | null;
  offeredTableIds?: string[] | null;
  offeredAt?: number | null;
  partySize?: number | null;
  reservedFor?: number | null;
  status: ReservationStatus;
  source: ReservationSource;
  createdByRole?: string | null;
  notes?: string | null;
  seatedAt?: number | null;
  completedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type SurveyResponse = {
  id: string;
  reservationId: string;
  rating: number;
  comment?: string | null;
  answers?: Record<string, string> | null;
  createdAt: number;
};

export type SurveyWithCustomer = {
  survey: SurveyResponse;
  reservation: Reservation | null;
  customer: Customer | null;
};

export type SurveyConfig = {
  questions: string[];
  recommendQuestionIndex?: number | null;
  scoringMode?: "YESNO" | "RATING";
};

export type SurveyOutboxItem = {
  id: string;
  reservationId: string;
  status: "PENDING" | "SENT";
  suggestedChannel: "WHATSAPP" | "EMAIL" | "NONE";
  createdAt: number;
  sentAt?: number | null;
};

export type FeatureFlags = {
  marketingEnabled: boolean;
};

function nowMs() {
  return Date.now();
}

function isOperationallyFreeTable(table: any, now: number) {
  const status = String(table?.status ?? "");
  if (status === "LIBRE") return true;
  if (status !== "RESERVADA") return false;

  const next = table?.nextReservedFor;
  const nextMs = typeof next === "number" ? Number(next) : null;
  if (!nextMs) return true;

  const windowMs = 3 * 60 * 60 * 1000;
  const diff = nextMs - now;
  if (Math.abs(diff) > windowMs) return true;
  return false;
}

export async function listWaitlistReservations(params?: {
  includeOffered?: boolean;
}): Promise<
  Array<{
    reservation: Reservation;
    customer: Customer;
  }>
> {
  const db = getFirestore();
  if (!db) return [];

  // FIFO must be deterministic. A where-in without orderBy + limit can return an arbitrary window.
  // Instead, query each status ordered by createdAt and merge.
  const baseQ = db.collection("reservations");
  const waitlistSnap = await baseQ.where("status", "==", "WAITLIST").orderBy("createdAt", "asc").limit(200).get();
  const offeredSnap = params?.includeOffered
    ? await baseQ.where("status", "==", "OFFERED").orderBy("createdAt", "asc").limit(200).get()
    : null;

  const mergedDocs = [...waitlistSnap.docs, ...(offeredSnap?.docs ?? [])];

  const reservationsUnsorted = mergedDocs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Reservation, "id">) }) as Reservation
  );

  const reservations = reservationsUnsorted
    .slice()
    .sort((a: Reservation, b: Reservation) => {
      const aa = Number(a.createdAt ?? 0);
      const bb = Number(b.createdAt ?? 0);
      if (aa !== bb) return aa - bb;
      return String(a.id).localeCompare(String(b.id));
    }) as Reservation[];

  const customerIds = Array.from(new Set(reservations.map((r: Reservation) => String(r.customerId))));
  const customers = new Map<string, Customer>();
  await Promise.all(
    customerIds.map(async (id) => {
      const sid = String(id);
      const doc = await db.collection("customers").doc(sid).get();
      if (doc.exists) customers.set(sid, { id: String(doc.id), ...(doc.data() as Omit<Customer, "id">) });
    })
  );

  return reservations
    .map((reservation: Reservation) => {
      const customer = customers.get(reservation.customerId);
      if (!customer) return null;
      return { reservation, customer };
    })
    .filter(Boolean) as any;
}

function normalizePhone(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const digits = s.replace(/\D/g, "");
  if (!digits) return "";

  // Mexico normalization used by this app: +52 + 10 digits.
  // Accept legacy +521XXXXXXXXXX and normalize to +52XXXXXXXXXX.
  if (digits.startsWith("521") && digits.length >= 13) {
    return `+52${digits.slice(3, 13)}`;
  }
  if (digits.startsWith("52") && digits.length >= 12) {
    return `+52${digits.slice(2, 12)}`;
  }

  // Fallback: if it already contained '+', keep E.164-ish shape.
  return s.includes("+") ? `+${digits}` : digits;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const db = getFirestore();
  if (!db) return { marketingEnabled: true };

  const doc = await db.collection("config").doc("features").get();
  const raw = doc.exists ? (doc.data() as any) : null;
  const marketingEnabled = typeof raw?.marketingEnabled === "boolean" ? raw.marketingEnabled : true;
  return { marketingEnabled };
}

export async function getSurveyConfig(): Promise<SurveyConfig> {
  const db = getFirestore();
  if (!db) return { questions: [] };

  const doc = await db.collection("config").doc("survey").get();
  const raw = doc.exists ? (doc.data() as any) : null;
  const questions = Array.isArray(raw?.questions) ? raw.questions.map((q: any) => String(q)).filter(Boolean) : [];
  const recommendQuestionIndex =
    typeof raw?.recommendQuestionIndex === "number" && Number.isFinite(raw.recommendQuestionIndex)
      ? Number(raw.recommendQuestionIndex)
      : null;
  const scoringMode = raw?.scoringMode === "YESNO" || raw?.scoringMode === "RATING" ? raw.scoringMode : undefined;
  return { questions, recommendQuestionIndex, scoringMode };
}

export async function setSurveyConfig(input: SurveyConfig) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const questions = (input.questions ?? []).map((q) => String(q).trim()).filter(Boolean);
  const recommendQuestionIndex =
    typeof input.recommendQuestionIndex === "number" && Number.isFinite(input.recommendQuestionIndex)
      ? Number(input.recommendQuestionIndex)
      : null;
  const scoringMode = input.scoringMode === "YESNO" || input.scoringMode === "RATING" ? input.scoringMode : undefined;
  await db
    .collection("config")
    .doc("survey")
    .set({ questions, recommendQuestionIndex, scoringMode, updatedAt: nowMs() }, { merge: true });
}

export async function listSurveysForDashboard(params?: { limit?: number }): Promise<SurveyResponse[]> {
  const db = getFirestore();
  if (!db) return [];

  const limit = Math.max(1, Math.min(1000, Number(params?.limit ?? 200)));
  const snap = await db.collection("surveys").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, "id">) }) as SurveyResponse);
}

export async function listSurveysWithCustomer(params?: { limit?: number; fromMs?: number }): Promise<SurveyWithCustomer[]> {
  const db = getFirestore();
  if (!db) return [];

  const limit = Math.max(1, Math.min(1500, Number(params?.limit ?? 500)));
  let q: any = db.collection("surveys").orderBy("createdAt", "desc");
  if (typeof params?.fromMs === "number") q = q.where("createdAt", ">=", params.fromMs);
  const snap = await q.limit(limit).get();
  const surveys = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, "id">) }) as SurveyResponse);

  const reservationIdsRaw: string[] = surveys.map((s: SurveyResponse) => String(s.reservationId || ""));
  const reservationIds: string[] = Array.from(
    new Set(reservationIdsRaw.filter((x: string) => Boolean(x)))
  );
  const resDocs = await Promise.all(reservationIds.map((id) => db.collection("reservations").doc(id).get()));
  const resMap = new Map<string, Reservation>();
  for (const d of resDocs) {
    if (d.exists) resMap.set(d.id, { id: d.id, ...(d.data() as Omit<Reservation, "id">) } as Reservation);
  }

  const customerIds = Array.from(
    new Set(
      Array.from(resMap.values())
        .map((r: Reservation) => String(r.customerId || ""))
        .filter(Boolean)
    )
  );
  const custDocs = await Promise.all(customerIds.map((id) => db.collection("customers").doc(id).get()));
  const custMap = new Map<string, Customer>();
  for (const d of custDocs) {
    if (d.exists) custMap.set(d.id, { id: d.id, ...(d.data() as Omit<Customer, "id">) } as Customer);
  }

  return surveys.map((survey: SurveyResponse) => {
    const reservation = resMap.get(survey.reservationId) ?? null;
    const customer = reservation ? custMap.get(String(reservation.customerId)) ?? null : null;
    return { survey, reservation, customer };
  });
}

export async function enqueueSurveyOutbox(params: {
  reservationId: string;
  suggestedChannel: "WHATSAPP" | "EMAIL" | "NONE";
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationId = String(params.reservationId || "").trim();
  if (!reservationId) throw new Error("Missing reservationId");

  const ts = nowMs();
  const ref = db.collection("surveyOutbox").doc(reservationId);
  const doc = await ref.get();
  if (doc.exists) return ref.id;

  await ref.create({
    reservationId,
    status: "PENDING",
    suggestedChannel: params.suggestedChannel,
    createdAt: ts,
    sentAt: null
  });

  return ref.id;
}

export async function listPendingSurveyOutbox(params?: { limit?: number }): Promise<SurveyOutboxItem[]> {
  const db = getFirestore();
  if (!db) return [];

  const limit = Math.max(1, Math.min(500, Number(params?.limit ?? 100)));
  const snap = await db.collection("surveyOutbox").where("status", "==", "PENDING").limit(limit).get();

  return snap.docs
    .map((d: any) => ({ id: d.id, ...(d.data() as Omit<SurveyOutboxItem, "id">) }) as SurveyOutboxItem)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export async function markSurveyOutboxSent(params: { outboxId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();
  await db.collection("surveyOutbox").doc(params.outboxId).set({ status: "SENT", sentAt: ts }, { merge: true });
}

export async function ensureTablesSeeded() {
  const db = getFirestore();
  if (!db) return;

  const snap = await db.collection("tables").limit(1).get();
  if (!snap.empty) return;

  const ts = nowMs();
  const tables: Array<Omit<CafeTable, "id">> = [
    ...Array.from({ length: 3 }, (_, i) => ({
      name: String(i + 1),
      area: "INTERIOR" as const,
      status: "LIBRE" as const,
      createdAt: ts,
      updatedAt: ts
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      name: String(i + 4),
      area: "TERRAZA_LATERAL" as const,
      status: "LIBRE" as const,
      createdAt: ts,
      updatedAt: ts
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      name: String(i + 14),
      area: "TERRAZA_FRONTAL" as const,
      status: "LIBRE" as const,
      createdAt: ts,
      updatedAt: ts
    }))
  ];

  const batch = db.batch();
  for (const t of tables) {
    const ref = db.collection("tables").doc();
    batch.set(ref, t);
  }
  await batch.commit();
}

export function firebaseReady() {
  return isFirebaseConfigured();
}

export async function listTables(): Promise<CafeTable[]> {
  const db = getFirestore();
  if (!db) return [];
  await ensureTablesSeeded();

  const snap = await db.collection("tables").orderBy("area").get();
  const tables = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<CafeTable, "id">) }));
  return tables.sort((a, b) => {
    if (a.area !== b.area) return String(a.area).localeCompare(String(b.area));
    const an = Number.parseInt(String(a.name), 10);
    const bn = Number.parseInt(String(b.name), 10);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return String(a.name).localeCompare(String(b.name));
  });
}

export async function markNoShow(params: { reservationId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationRef = db.collection("reservations").doc(params.reservationId);

  await db.runTransaction(async (tx: any) => {
    const resDoc = await tx.get(reservationRef);
    if (!resDoc.exists) throw new Error("Reservation not found");

    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;

    const ts = nowMs();
    tx.update(reservationRef, { status: "NO_SHOW", updatedAt: ts });

    const tableId = reservation.tableId ? String(reservation.tableId) : "";
    if (!tableId) return;

    const tableRef = db.collection("tables").doc(tableId);
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) return;

    // Free the table and clear the next reservation pointer if it points to this reservation's time.
    const table = tableDoc.data() as CafeTable;
    const next = (table as any).nextReservedFor as number | null | undefined;
    const reservedFor = reservation.reservedFor ? Number(reservation.reservedFor) : null;
    const clearNext = reservedFor && next && next === reservedFor;

    tx.update(tableRef, {
      status: "LIBRE",
      ...(clearNext ? { nextReservedFor: null } : {}),
      lastFreedAt: ts,
      updatedAt: ts
    });
  });
}

export async function deleteReservationAdmin(params: { reservationId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationRef = db.collection("reservations").doc(params.reservationId);

  await db.runTransaction(async (tx: any) => {
    const resDoc = await tx.get(reservationRef);
    if (!resDoc.exists) return;

    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;
    if (reservation.status === "SEATED") {
      throw new Error("No se puede borrar: la mesa está ocupada");
    }

    const ts = nowMs();

    const tableId = reservation.tableId ? String(reservation.tableId) : "";
    if (tableId) {
      const tableRef = db.collection("tables").doc(tableId);
      const tableDoc = await tx.get(tableRef);
      if (tableDoc.exists) {
        const table = { id: tableDoc.id, ...(tableDoc.data() as Omit<CafeTable, "id">) } as CafeTable;
        const next = (table as any).nextReservedFor as number | null | undefined;
        const reservedFor = reservation.reservedFor ?? null;
        const clearNext = Boolean(reservedFor && next && next === reservedFor);

        tx.update(tableRef, {
          ...(table.status === "RESERVADA" ? { status: "LIBRE" } : {}),
          ...(clearNext ? { nextReservedFor: null } : {}),
          updatedAt: ts
        });
      }
    }

    tx.delete(reservationRef);
  });
}

export async function clearTableNextReservedFor(params: { tableId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableId = String(params.tableId || "");
  if (!tableId) throw new Error("Falta mesa");

  const tableRef = db.collection("tables").doc(tableId);
  const ts = nowMs();

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) return;
    const table = tableDoc.data() as CafeTable;
    const next = (table as any).nextReservedFor as number | null | undefined;
    if (!next) return;
    tx.update(tableRef, { nextReservedFor: null, updatedAt: ts });
  });
}

export async function deleteCustomerAdmin(params: { customerId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const customerId = String(params.customerId || "");
  if (!customerId) throw new Error("Falta cliente");

  const customerRef = db.collection("customers").doc(customerId);

  const reservationsSnap = await db
    .collection("reservations")
    .where("customerId", "==", customerId)
    .limit(1000)
    .get();

  const reservationIds = reservationsSnap.docs.map((d: any) => String(d.id));

  const surveyDocs = reservationIds.length
    ? await Promise.all(reservationIds.map((id) => db.collection("surveys").doc(id).get()))
    : [];

  const toDeleteSurveys = surveyDocs.filter((d) => d.exists).map((d) => d.ref);

  const toDeleteReservations = reservationsSnap.docs.map((d: any) => d.ref);

  const toDeleteCount = 1 + toDeleteReservations.length + toDeleteSurveys.length;
  if (toDeleteCount > 1000) {
    throw new Error("Demasiados registros para borrar de una sola vez");
  }

  // Delete in a batch (Firestore limit 500 ops per batch).
  const ops = [
    ...toDeleteSurveys.map((ref) => ({ kind: "delete" as const, ref })),
    ...toDeleteReservations.map((ref) => ({ kind: "delete" as const, ref })),
    { kind: "delete" as const, ref: customerRef }
  ];

  const chunkSize = 450;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + chunkSize);
    for (const op of chunk) batch.delete(op.ref);
    await batch.commit();
  }
}

export async function migrateFloorplanV2(): Promise<{
  createdTables: number;
  updatedReservations: number;
  deletedOldTables: number;
  mappingApplied: Record<string, string>;
}> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();
  const desired = Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const area: Area = n <= 3 ? "INTERIOR" : n <= 13 ? "TERRAZA_LATERAL" : "TERRAZA_FRONTAL";
    return {
      id: String(n),
      data: {
        name: String(n),
        area,
        status: "LIBRE" as const,
        createdAt: ts,
        updatedAt: ts
      } satisfies Omit<CafeTable, "id">
    };
  });

  // Best-effort mapping from the previous MVP naming scheme to the new numeric scheme.
  // - SALON (S1..S3) -> 1..3
  // - TERRAZA_LATERAL (L1..L6) -> 4..9
  // - TERRAZA_FRONTAL (F1..F3) -> 14..16
  const mappingApplied: Record<string, string> = {
    S1: "1",
    S2: "2",
    S3: "3",
    L1: "4",
    L2: "5",
    L3: "6",
    L4: "7",
    L5: "8",
    L6: "9",
    F1: "14",
    F2: "15",
    F3: "16"
  };

  // Fetch tables + build mapping from old table document IDs to new table document IDs.
  const tablesSnap = await db.collection("tables").get();
  const oldIdToNewId = new Map<string, string>();
  const numericIds = new Set(desired.map((d) => d.id));

  tablesSnap.docs.forEach((doc: any) => {
    const data = doc.data() as Partial<CafeTable>;
    const currentId = String(doc.id);
    const name = String((data as any)?.name ?? "");

    // If it's already a numeric table 1..18, keep it as-is.
    if (numericIds.has(currentId)) return;
    if (numericIds.has(name)) {
      oldIdToNewId.set(currentId, name);
      return;
    }

    const m = mappingApplied[name];
    if (m) oldIdToNewId.set(currentId, m);
  });

  // Ensure new tables exist with stable IDs ("1".."18").
  let createdTables = 0;
  const ensureBatch = db.batch();
  const desiredRefs = desired.map((d) => db.collection("tables").doc(d.id));
  const desiredDocs = await Promise.all(desiredRefs.map((r) => r.get()));
  desiredDocs.forEach((doc: any, idx: number) => {
    if (doc.exists) return;
    ensureBatch.set(desiredRefs[idx], desired[idx].data);
    createdTables += 1;
  });
  if (createdTables > 0) await ensureBatch.commit();

  // Update reservations.tableId pointing to old table document IDs.
  let updatedReservations = 0;
  const reservationsSnap = await db.collection("reservations").where("tableId", "!=", null).get();
  const updates: Array<{ id: string; newTableId: string }> = [];
  reservationsSnap.docs.forEach((doc: any) => {
    const r = doc.data() as Reservation;
    if (!r.tableId) return;
    const newId = oldIdToNewId.get(String(r.tableId));
    if (!newId) return;
    updates.push({ id: String(doc.id), newTableId: newId });
  });

  // Batch in chunks (Firestore limit 500 ops per batch)
  const chunkSize = 450;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach((u) => {
      batch.update(db.collection("reservations").doc(u.id), {
        tableId: u.newTableId,
        updatedAt: nowMs()
      });
    });
    await batch.commit();
    updatedReservations += chunk.length;
  }

  // Delete old tables that are not part of the new numeric scheme.
  let deletedOldTables = 0;
  const deleteCandidates = tablesSnap.docs
    .map((d: any) => String(d.id))
    .filter((id: string) => !numericIds.has(id));

  for (let i = 0; i < deleteCandidates.length; i += chunkSize) {
    const chunk = deleteCandidates.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach((id: string) => batch.delete(db.collection("tables").doc(id)));
    await batch.commit();
    deletedOldTables += chunk.length;
  }

  return {
    createdTables,
    updatedReservations,
    deletedOldTables,
    mappingApplied
  };
}

export async function createCustomer(input: {
  name: string;
  phone?: string;
  email?: string | null;
}): Promise<Customer> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();
  const phone = normalizePhone(input.phone);
  const ref = await db.collection("customers").add({
    name: input.name,
    phone,
    email: input.email ?? null,
    isRecurrent: false,
    createdAt: ts,
    updatedAt: ts
  });

  return {
    id: ref.id,
    name: input.name,
    phone,
    email: input.email ?? null,
    isRecurrent: false,
    createdAt: ts,
    updatedAt: ts
  };
}

export async function findCustomerByContact(input: {
  phone?: string | null;
  email?: string | null;
}): Promise<Customer | null> {
  const db = getFirestore();
  if (!db) return null;

  const phone = normalizePhone(input.phone);
  const email = String(input.email ?? "").trim();

  if (phone) {
    const snap = await db.collection("customers").where("phone", "==", phone).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as Omit<Customer, "id">) } as Customer;
    }
  }

  if (email) {
    const snap = await db.collection("customers").where("email", "==", email).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as Omit<Customer, "id">) } as Customer;
    }
  }

  return null;
}

export async function findOrCreateCustomer(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
}): Promise<{ customer: Customer; existing: boolean }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const phone = normalizePhone(input.phone);

  const existing = await findCustomerByContact({ phone, email: input.email });
  if (!existing) {
    const customer = await createCustomer({ name: input.name, phone, email: input.email ?? null });
    return { customer, existing: false };
  }

  const ts = nowMs();
  await db
    .collection("customers")
    .doc(existing.id)
    .set(
      {
        name: input.name || existing.name,
        ...(phone ? { phone } : {}),
        ...(String(input.email ?? "").trim() ? { email: String(input.email ?? "").trim() } : {}),
        isRecurrent: true,
        updatedAt: ts
      },
      { merge: true }
    );

  const refreshed = await db.collection("customers").doc(existing.id).get();
  return {
    customer: { id: refreshed.id, ...(refreshed.data() as Omit<Customer, "id">) } as Customer,
    existing: true
  };
}

export async function createReservation(input: Omit<Reservation, "id" | "createdAt" | "updatedAt">) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();
  const ref = await db.collection("reservations").add({
    ...input,
    createdAt: ts,
    updatedAt: ts
  });
  return { id: ref.id, ...(input as any), createdAt: ts, updatedAt: ts } as Reservation;
}

export async function createWaitlistReservation(params: {
  name: string;
  phone?: string | null;
  email?: string | null;
  requestedTablesCount: number;
  notes?: string | null;
  createdByRole?: string | null;
  source: ReservationSource;
}): Promise<{ reservation: Reservation; customer: Customer }> {
  const req = Number(params.requestedTablesCount);
  if (!Number.isFinite(req) || req <= 0) throw new Error("requestedTablesCount inválido");

  const { customer } = await findOrCreateCustomer({
    name: params.name,
    phone: params.phone ?? null,
    email: params.email ?? null
  });

  const reservation = await createReservation({
    customerId: customer.id,
    customerNameSnapshot: params.name,
    tableId: null,
    tableIds: null,
    activeTableIds: null,
    requestedTablesCount: req,
    offeredTableIds: null,
    offeredAt: null,
    partySize: Math.max(1, req * 4),
    reservedFor: null,
    status: "WAITLIST",
    source: params.source,
    createdByRole: params.createdByRole ?? null,
    notes: params.notes ?? null,
    seatedAt: null,
    completedAt: null
  });

  return { reservation, customer };
}

export async function confirmWaitlistReservation(params: {
  reservationId: string;
  tableIds: string[];
  createdByRole?: string | null;
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationId = String(params.reservationId || "").trim();
  if (!reservationId) throw new Error("Falta reservationId");

  const tableIds = Array.from(new Set((params.tableIds ?? []).map((x) => String(x)).filter(Boolean)));
  if (tableIds.length === 0) throw new Error("Falta mesa");

  const reservationRef = db.collection("reservations").doc(reservationId);
  const tableRefs = tableIds.map((id) => db.collection("tables").doc(id));

  const now = nowMs();
  // When hostess confirms from waitlist, the guest is being seated now.
  // Keep a timestamp for messaging/telemetry.
  const reservedFor = now;

  await db.runTransaction(async (tx: any) => {
    const resDoc = await tx.get(reservationRef);
    if (!resDoc.exists) throw new Error("Reservation not found");
    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;

    if (reservation.status !== "WAITLIST" && reservation.status !== "OFFERED") {
      throw new Error("Reservation not in waitlist");
    }

    const requested = typeof reservation.requestedTablesCount === "number" ? Number(reservation.requestedTablesCount) : 1;
    if (tableIds.length < Math.max(1, requested)) {
      throw new Error("Faltan mesas para confirmar");
    }

    const tableDocs = await Promise.all(tableRefs.map((ref) => tx.get(ref)));
    for (const d of tableDocs) {
      if (!d.exists) throw new Error("Table not found");
    }
    const tables = tableDocs.map((d: any) => ({ id: String(d.id), ...(d.data() as Omit<CafeTable, "id">) })) as CafeTable[];
    for (const t of tables) {
      if (!isOperationallyFreeTable(t as any, now)) throw new Error("Table not free");
    }

    // Seat now: occupy tables immediately.
    for (let i = 0; i < tableRefs.length; i++) {
      const t = tables[i];
      const existingNext = (t as any).nextReservedFor as number | null | undefined;
      // If the existing next reservation was exactly this seating time, clear it.
      const nextReservedFor = existingNext && Number(existingNext) === reservedFor ? null : existingNext ?? null;
      tx.update(tableRefs[i], {
        status: "OCUPADA",
        nextReservedFor,
        currentReservationId: reservation.id,
        currentCustomerName: reservation.customerNameSnapshot ?? null,
        updatedAt: now
      });
    }

    tx.update(reservationRef, {
      tableId: tableIds[0],
      tableIds,
      activeTableIds: tableIds,
      reservedFor: null,
      status: "SEATED",
      seatedAt: now,
      offeredTableIds: null,
      offeredAt: null,
      updatedAt: now
    });
  });

  return { reservationId, reservedFor, tableIds };
}

export async function cancelWaitlistReservation(params: {
  reservationId: string;
  createdByRole?: string | null;
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationId = String(params.reservationId || "").trim();
  if (!reservationId) throw new Error("Falta reservationId");

  const reservationRef = db.collection("reservations").doc(reservationId);
  const ts = nowMs();

  await db.runTransaction(async (tx: any) => {
    const resDoc = await tx.get(reservationRef);
    if (!resDoc.exists) throw new Error("Reservation not found");
    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;

    if (reservation.status !== "WAITLIST" && reservation.status !== "OFFERED") {
      throw new Error("Reservation not in waitlist");
    }

    tx.update(reservationRef, {
      status: "CANCELLED",
      offeredTableIds: null,
      offeredAt: null,
      updatedAt: ts
    });
  });
}

export async function findExistingReservedReservation(params: {
  customerId?: string | null;
  tableId?: string | null;
  reservedFor: number;
}): Promise<{ reservationId: string | null }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservedFor = Number(params.reservedFor);
  if (!Number.isFinite(reservedFor) || reservedFor <= 0) return { reservationId: null };

  // 1) Prevent duplicate reservation for the same customer at the same time.
  if (params.customerId) {
    const snap = await db
      .collection("reservations")
      .where("status", "==", "RESERVED")
      .where("customerId", "==", String(params.customerId))
      .where("reservedFor", "==", reservedFor)
      .limit(1)
      .get();

    if (!snap.empty) return { reservationId: String(snap.docs[0].id) };
  }

  // 2) Prevent double-booking the same table at the same time.
  if (params.tableId) {
    const tid = String(params.tableId);

    const snap1 = await db
      .collection("reservations")
      .where("status", "==", "RESERVED")
      .where("tableId", "==", tid)
      .where("reservedFor", "==", reservedFor)
      .limit(1)
      .get();

    if (!snap1.empty) return { reservationId: String(snap1.docs[0].id) };

    // Multi-table reservations store an array field `tableIds`.
    // This query keeps backwards compatibility for older single-table reservations.
    const snap2 = await db
      .collection("reservations")
      .where("status", "==", "RESERVED")
      .where("tableIds", "array-contains", tid)
      .where("reservedFor", "==", reservedFor)
      .limit(1)
      .get();

    if (!snap2.empty) return { reservationId: String(snap2.docs[0].id) };
  }

  return { reservationId: null };
}

export async function listWaitingReservations(params?: {
  tableId?: string | null;
  allStatuses?: boolean;
}): Promise<
  Array<{
    reservation: Reservation;
    customer: Customer;
    table?: CafeTable | null;
    tables?: CafeTable[];
    survey?: SurveyResponse | null;
  }>
> {
  const db = getFirestore();
  if (!db) return [];

  let q: any = db.collection("reservations");
  if (!params?.allStatuses) {
    q = q.where("status", "in", ["WAITING", "RESERVED"]);
  }
  if (params?.tableId) {
    q = q.where("tableId", "==", params.tableId);
  }
  // Avoid composite index requirements by not using orderBy when filtering.
  // We always sort in-memory.
  const snap = await q.limit(200).get();

  const reservationsUnsorted = snap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Reservation, "id">) }) as Reservation
  );
  const reservations = reservationsUnsorted.sort((a: Reservation, b: Reservation) => b.createdAt - a.createdAt) as Reservation[];

  const customerIds = Array.from(new Set(reservations.map((r: Reservation) => String(r.customerId))));
  const customers = new Map<string, Customer>();
  await Promise.all(
    customerIds.map(async (id) => {
      const sid = String(id);
      const doc = await db.collection("customers").doc(sid).get();
      if (doc.exists) customers.set(sid, { id: String(doc.id), ...(doc.data() as Omit<Customer, "id">) });
    })
  );

  const tableIds = Array.from(
    new Set(
      reservations
        .flatMap((r: Reservation) => {
          const active = Array.isArray(r.activeTableIds) ? r.activeTableIds : null;
          const reserved = Array.isArray(r.tableIds) ? r.tableIds : null;
          const single = r.tableId ? [r.tableId] : [];
          const ids = (active && active.length > 0 ? active : reserved && reserved.length > 0 ? reserved : single)
            .map((x) => String(x))
            .filter(Boolean);
          return ids;
        })
        .filter(Boolean)
    )
  );
  const tables = new Map<string, CafeTable>();
  await Promise.all(
    tableIds.map(async (id) => {
      const sid = String(id);
      const doc = await db.collection("tables").doc(sid).get();
      if (doc.exists) tables.set(id, { id: doc.id, ...(doc.data() as Omit<CafeTable, "id">) });
    })
  );

  return reservations
    .map((reservation: Reservation) => {
      const customer = customers.get(reservation.customerId);
      if (!customer) return null;

      const associatedTableIds = Array.isArray(reservation.activeTableIds)
        ? reservation.activeTableIds.map((x) => String(x)).filter(Boolean)
        : Array.isArray(reservation.tableIds)
          ? reservation.tableIds.map((x) => String(x)).filter(Boolean)
          : reservation.tableId
            ? [String(reservation.tableId)]
            : [];
      const associatedTables = associatedTableIds.map((id) => tables.get(id)).filter(Boolean) as CafeTable[];
      return {
        reservation,
        customer,
        table: reservation.tableId ? tables.get(reservation.tableId) ?? null : null,
        tables: associatedTables
      };
    })
    .filter(Boolean) as any;
}

export async function seatReservation(params: {
  reservationId: string;
  tableId: string;
}): Promise<{ reservationId: string }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationId = String(params.reservationId || "").trim();
  const tableId = String(params.tableId || "").trim();
  if (!reservationId || !tableId) throw new Error("Faltan datos");

  const reservationRef = db.collection("reservations").doc(reservationId);
  const tableRef = db.collection("tables").doc(tableId);

  await db.runTransaction(async (tx: any) => {
    const [resDoc, tableDoc] = await Promise.all([tx.get(reservationRef), tx.get(tableRef)]);
    if (!resDoc.exists) throw new Error("Reservation not found");
    if (!tableDoc.exists) throw new Error("Table not found");

    const table = tableDoc.data() as CafeTable;
    if (!isOperationallyFreeTable(table as any, Date.now())) throw new Error("Table not free");

    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;
    const reservedTableIds = Array.isArray(reservation.tableIds)
      ? reservation.tableIds.map((x) => String(x)).filter(Boolean)
      : [];
    const targetTableIds = reservedTableIds.length > 0 ? reservedTableIds : [params.tableId];
    const tableRefs = targetTableIds.map((id) => db.collection("tables").doc(id));

    const tableDocs = await Promise.all(tableRefs.map((ref) => tx.get(ref)));
    for (const d of tableDocs) {
      if (!d.exists) throw new Error("Table not found");
    }

    const tables = tableDocs.map((d: any) => ({ id: String(d.id), ...(d.data() as Omit<CafeTable, "id">) })) as CafeTable[];
    const now = Date.now();
    for (const t of tables) {
      if (!isOperationallyFreeTable(t as any, now)) throw new Error("Table not free");
    }

    const ts = nowMs();

    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      const existingNext = (t as any).nextReservedFor as number | null | undefined;
      // If the existing next reservation was exactly this seating time, clear it.
      const nextReservedFor = existingNext && Number(existingNext) === ts ? null : existingNext ?? null;
      tx.update(tableRefs[i], {
        status: "OCUPADA",
        nextReservedFor,
        currentReservationId: reservation.id,
        currentCustomerName: reservation.customerNameSnapshot ?? null,
        updatedAt: ts
      });
    }

    tx.update(reservationRef, {
      tableId: params.tableId,
      tableIds: reservedTableIds.length > 0 ? reservedTableIds : [params.tableId],
      activeTableIds: targetTableIds,
      status: "SEATED",
      seatedAt: ts,
      completedAt: null,
      updatedAt: ts
    });
  });

  return { reservationId };
}

export async function moveSeatedReservation(params: {
  reservationId: string;
  fromTableId: string;
  toTableId: string;
}): Promise<{ reservationId: string }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationId = String(params.reservationId || "").trim();
  const fromTableId = String(params.fromTableId || "").trim();
  const toTableId = String(params.toTableId || "").trim();
  if (!reservationId || !fromTableId || !toTableId) throw new Error("Faltan datos");
  if (fromTableId === toTableId) throw new Error("Mesa destino inválida");

  const reservationRef = db.collection("reservations").doc(reservationId);
  const fromRef = db.collection("tables").doc(fromTableId);
  const toRef = db.collection("tables").doc(toTableId);

  await db.runTransaction(async (tx: any) => {
    const [resDoc, fromDoc, toDoc] = await Promise.all([tx.get(reservationRef), tx.get(fromRef), tx.get(toRef)]);
    if (!resDoc.exists) throw new Error("Reservation not found");
    if (!fromDoc.exists) throw new Error("Mesa origen no existe");
    if (!toDoc.exists) throw new Error("Mesa destino no existe");

    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;
    if (reservation.status !== "SEATED") throw new Error("Reservation not seated");

    const fromTable = fromDoc.data() as CafeTable;
    const toTable = toDoc.data() as CafeTable;
    if (toTable.status !== "LIBRE") throw new Error("Mesa destino no está libre");
    if (fromTable.status !== "OCUPADA" && fromTable.status !== "RESERVADA") {
      throw new Error("Mesa origen no está ocupada");
    }

    const tableIds = Array.isArray(reservation.tableIds)
      ? reservation.tableIds.map((x) => String(x)).filter(Boolean)
      : reservation.tableId
        ? [String(reservation.tableId)]
        : [];
    const activeTableIds = Array.isArray(reservation.activeTableIds)
      ? reservation.activeTableIds.map((x) => String(x)).filter(Boolean)
      : tableIds;

    if (!activeTableIds.includes(fromTableId) && String(reservation.tableId ?? "") !== fromTableId) {
      throw new Error("Mesa origen no pertenece a la reserva");
    }

    const replaceOne = (arr: string[]) => {
      const out = arr.slice();
      const idx = out.indexOf(fromTableId);
      if (idx >= 0) out[idx] = toTableId;
      return Array.from(new Set(out));
    };

    const nextTableIds = replaceOne(tableIds.length ? tableIds : [fromTableId]);
    const nextActiveTableIds = replaceOne(activeTableIds.length ? activeTableIds : [fromTableId]);
    const nextPrimary = String(reservation.tableId ?? "") === fromTableId ? toTableId : String(reservation.tableId ?? toTableId);

    const ts = nowMs();
    tx.update(fromRef, { status: "LIBRE", updatedAt: ts });
    tx.update(toRef, { status: "OCUPADA", updatedAt: ts });

    tx.update(reservationRef, {
      tableId: nextPrimary,
      tableIds: nextTableIds,
      activeTableIds: nextActiveTableIds,
      updatedAt: ts
    });
  });

  return { reservationId };
}

export async function walkInAssign(params: {
  name: string;
  phone: string;
  email?: string | null;
  tableId: string;
  customerId?: string | null;
  createdByRole?: string | null;
}): Promise<{ reservationId: string }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const phone = normalizePhone(params.phone);

  const tableRef = db.collection("tables").doc(params.tableId);

  const reservationRef = db.collection("reservations").doc();

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");
    const table = tableDoc.data() as CafeTable;

    if (!isOperationallyFreeTable(table as any, Date.now())) throw new Error("Table not free");

    const ts = nowMs();
    const customerRef = params.customerId
      ? db.collection("customers").doc(params.customerId)
      : db.collection("customers").doc();

    if (params.customerId) {
      const existingCustomerDoc = await tx.get(customerRef);
      if (existingCustomerDoc.exists) {
        tx.set(
          customerRef,
          {
            name: params.name,
            ...(phone ? { phone } : {}),
            ...(String(params.email ?? "").trim() ? { email: String(params.email ?? "").trim() } : {}),
            isRecurrent: true,
            updatedAt: ts
          },
          { merge: true }
        );
      } else {
        tx.set(customerRef, {
          name: params.name,
          phone,
          email: params.email ?? null,
          isRecurrent: false,
          createdAt: ts,
          updatedAt: ts
        });
      }
    } else {
      tx.set(customerRef, {
        name: params.name,
        phone,
        email: params.email ?? null,
        isRecurrent: false,
        createdAt: ts,
        updatedAt: ts
      });
    }

    tx.set(reservationRef, {
      customerId: customerRef.id,
      customerNameSnapshot: params.name,
      tableId: params.tableId,
      status: "WAITING",
      source: "WALK_IN",
      createdByRole: params.createdByRole ?? null,
      reservedFor: null,
      partySize: null,
      notes: null,
      seatedAt: null,
      completedAt: null,
      waConfirmationStatus: null,
      waConfirmationAt: null,
      waConfirmationMessageId: null,
      waConfirmationError: null,
      createdAt: ts,
      updatedAt: ts
    });

    tx.update(tableRef, { status: "RESERVADA", updatedAt: ts });
  });

  return { reservationId: reservationRef.id };
}

export async function reserveTable(params: {
  name: string;
  phone: string;
  email?: string | null;
  tableId: string;
  reservedFor: number;
  partySize?: number | null;
  notes?: string | null;
  customerId?: string | null;
  createdByRole?: string | null;
}) {
  return reserveTables({
    name: params.name,
    phone: params.phone,
    email: params.email,
    tableIds: [params.tableId],
    reservedFor: params.reservedFor,
    partySize: params.partySize,
    notes: params.notes,
    customerId: params.customerId,
    createdByRole: params.createdByRole
  });
}

export async function reserveTables(params: {
  name: string;
  phone: string;
  email?: string | null;
  tableIds: string[];
  reservedFor: number;
  partySize?: number | null;
  notes?: string | null;
  customerId?: string | null;
  createdByRole?: string | null;
}): Promise<{ reservationId: string }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const phone = normalizePhone(params.phone);

  const tableIds = Array.from(new Set((params.tableIds ?? []).map((x) => String(x)).filter(Boolean)));
  if (tableIds.length === 0) throw new Error("Falta mesa");

  const tableRefs = tableIds.map((id) => db.collection("tables").doc(id));

  const reservationRef = db.collection("reservations").doc();

  await db.runTransaction(async (tx: any) => {
    const tableDocs = await Promise.all(tableRefs.map((ref) => tx.get(ref)));
    for (const d of tableDocs) {
      if (!d.exists) throw new Error("Table not found");
    }

    const tables = tableDocs.map((d: any) => ({ id: String(d.id), ...(d.data() as Omit<CafeTable, "id">) })) as CafeTable[];

    for (const table of tables) {
      const existingNext = (table as any).nextReservedFor as number | null | undefined;
      if (existingNext) {
        const blockMs = (90 + 30) * 60 * 1000;
        if (Math.abs(Number(existingNext) - Number(params.reservedFor)) < blockMs) {
          throw new Error("Mesa no disponible por reserva cercana");
        }
      }

      // Allow scheduling a future reservation even if the table is currently occupied,
      // as long as the reservation is not too close to now.
      const now = Date.now();
      const windowMs = 3 * 60 * 60 * 1000;
      if (params.reservedFor - now <= windowMs) {
        if (!isOperationallyFreeTable(table, now)) throw new Error("Table not free");
      }
    }

    const ts = nowMs();
    const customerRef = params.customerId
      ? db.collection("customers").doc(params.customerId)
      : db.collection("customers").doc();

    if (params.customerId) {
      const existingCustomerDoc = await tx.get(customerRef);
      if (existingCustomerDoc.exists) {
        tx.set(
          customerRef,
          {
            name: params.name,
            ...(phone ? { phone } : {}),
            ...(String(params.email ?? "").trim() ? { email: String(params.email ?? "").trim() } : {}),
            isRecurrent: true,
            updatedAt: ts
          },
          { merge: true }
        );
      } else {
        tx.set(customerRef, {
          name: params.name,
          phone,
          email: params.email ?? null,
          isRecurrent: false,
          createdAt: ts,
          updatedAt: ts
        });
      }
    } else {
      tx.set(customerRef, {
        name: params.name,
        phone,
        email: params.email ?? null,
        isRecurrent: false,
        createdAt: ts,
        updatedAt: ts
      });
    }

    tx.set(reservationRef, {
      customerId: customerRef.id,
      customerNameSnapshot: params.name,
      tableId: tableIds[0],
      tableIds,
      activeTableIds: null,
      status: "RESERVED",
      source: "CALL",
      createdByRole: params.createdByRole ?? null,
      reservedFor: params.reservedFor,
      partySize: params.partySize ?? null,
      notes: params.notes ?? null,
      waConfirmationStatus: null,
      waConfirmationAt: null,
      waConfirmationMessageId: null,
      waConfirmationError: null,
      createdAt: ts,
      updatedAt: ts
    });

    const now = Date.now();
    const windowMs = 3 * 60 * 60 * 1000;
    const shouldBlockNow = params.reservedFor - now <= windowMs;

    for (let i = 0; i < tableRefs.length; i++) {
      const table = tables[i];
      const existingNext = (table as any).nextReservedFor as number | null | undefined;
      const nextReservedFor = existingNext
        ? Math.min(Number(existingNext), Number(params.reservedFor))
        : Number(params.reservedFor);
      tx.update(tableRefs[i], {
        nextReservedFor,
        ...(shouldBlockNow ? { status: "RESERVADA" } : {}),
        updatedAt: ts
      });
    }
  });

  return { reservationId: reservationRef.id };
}

export async function freeTable(params: {
  tableId: string;
}): Promise<{ completedReservationId: string | null; reservationId: string | null; remainingActiveTableIds: string[] | null }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableRef = db.collection("tables").doc(params.tableId);

  let completedReservationId: string | null = null;
  let reservationId: string | null = null;
  let remainingActiveTableIds: string[] | null = null;

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");

    // Firestore requires all reads to be executed before all writes in a transaction.
    const activeSnapByTableId = await tx.get(
      db
        .collection("reservations")
        .where("tableId", "==", params.tableId)
        .where("status", "==", "SEATED")
        .limit(1)
    );

    const activeSnapByTableIds = await tx.get(
      db
        .collection("reservations")
        .where("tableIds", "array-contains", params.tableId)
        .where("status", "==", "SEATED")
        .limit(1)
    );

    const activeSnapByActiveTableIds = await tx.get(
      db
        .collection("reservations")
        .where("activeTableIds", "array-contains", params.tableId)
        .where("status", "==", "SEATED")
        .limit(1)
    );

    const ts = nowMs();
    tx.update(tableRef, {
      status: "LIBRE",
      lastFreedAt: ts,
      currentReservationId: null,
      currentCustomerName: null,
      updatedAt: ts
    });

    const resDoc = !activeSnapByActiveTableIds.empty
      ? activeSnapByActiveTableIds.docs[0]
      : !activeSnapByTableId.empty
        ? activeSnapByTableId.docs[0]
        : !activeSnapByTableIds.empty
          ? activeSnapByTableIds.docs[0]
          : null;

    if (resDoc) {
      reservationId = String(resDoc.id);
      const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;

      const currentActive = Array.isArray(reservation.activeTableIds)
        ? reservation.activeTableIds.map((x) => String(x)).filter(Boolean)
        : Array.isArray(reservation.tableIds)
          ? reservation.tableIds.map((x) => String(x)).filter(Boolean)
          : reservation.tableId
            ? [String(reservation.tableId)]
            : [];

      const nextActive = currentActive.filter((id) => id !== params.tableId);
      remainingActiveTableIds = nextActive;

      if (nextActive.length === 0) {
        completedReservationId = reservationId;
        tx.update(resDoc.ref, { status: "COMPLETED", activeTableIds: [], completedAt: ts, updatedAt: ts });
      } else {
        const nextPrimary = nextActive[0] ?? reservation.tableId ?? null;
        tx.update(resDoc.ref, { tableId: nextPrimary, activeTableIds: nextActive, updatedAt: ts });
      }
    }
  });

  return { completedReservationId, reservationId, remainingActiveTableIds };
}

export async function confirmFreedTable(params: { tableId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableId = String(params.tableId || "").trim();
  if (!tableId) throw new Error("Falta mesa");

  const tableRef = db.collection("tables").doc(tableId);
  const ts = nowMs();

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");
    const table = tableDoc.data() as CafeTable;
    if (table.status !== "POR_LIMPIAR") throw new Error("Table not pending");
    tx.update(tableRef, { status: "LIBRE", currentReservationId: null, currentCustomerName: null, updatedAt: ts });
  });
}

export async function getReservationDetail(reservationId: string) {
  const db = getFirestore();
  if (!db) return null;

  const resDoc = await db.collection("reservations").doc(reservationId).get();
  if (!resDoc.exists) return null;
  const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;

  const custDoc = await db.collection("customers").doc(reservation.customerId).get();
  if (!custDoc.exists) return null;
  const customer = { id: custDoc.id, ...(custDoc.data() as Omit<Customer, "id">) } as Customer;

  const table = reservation.tableId
    ? await db
        .collection("tables")
        .doc(reservation.tableId)
        .get()
        .then((d: any) => (d.exists ? ({ id: d.id, ...(d.data() as Omit<CafeTable, "id">) } as CafeTable) : null))
    : null;

  // Deterministic ID: surveys/{reservationId}
  // Backward-compatible: fallback to legacy query if the doc doesn't exist.
  const surveyDoc = await db.collection("surveys").doc(reservationId).get();
  let survey: SurveyResponse | null = surveyDoc.exists
    ? ({ id: surveyDoc.id, ...(surveyDoc.data() as Omit<SurveyResponse, "id">) } as SurveyResponse)
    : null;

  if (!survey) {
    const legacySnap = await db
      .collection("surveys")
      .where("reservationId", "==", reservationId)
      .limit(1)
      .get();
    survey = legacySnap.empty
      ? null
      : ({ id: legacySnap.docs[0].id, ...(legacySnap.docs[0].data() as Omit<SurveyResponse, "id">) } as SurveyResponse);
  }

  return { reservation, customer, table, survey };
}

export async function createSurvey(input: {
  reservationId: string;
  rating: number;
  comment?: string | null;
  answers?: Record<string, string> | null;
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const docId = String(input.reservationId || "").trim();
  if (!docId) throw new Error("Missing reservationId");

  // Deterministic doc id guarantees 1 survey per reservation.
  // Use create() so we never overwrite an existing response.
  await db
    .collection("surveys")
    .doc(docId)
    .create({
      reservationId: docId,
      rating: input.rating,
      comment: input.comment ?? null,
      answers: input.answers ?? null,
      createdAt: nowMs()
    });

  return docId;
}

export async function adminSummary(range: "day" | "week" | "month") {
  const db = getFirestore();
  if (!db) {
    return {
      reservationsCount: 0,
      reservationsCallCount: 0,
      reservationsWalkInCount: 0,
      callSeatedCount: 0,
      callNoShowCount: 0,
      walkInSeatedCount: 0,
      walkInNoShowCount: 0,
      surveyEnqueuedCount: 0,
      surveySentCount: 0,
      surveyReceivedCount: 0,
      surveySentCallCount: 0,
      surveySentWalkInCount: 0,
      surveyReceivedCallCount: 0,
      surveyReceivedWalkInCount: 0,
      completedCount: 0,
      noShowCount: 0,
      customersCount: 0,
      customersWithPhoneCount: 0,
      customersWithoutPhoneCount: 0,
      features: { marketingEnabled: true } as FeatureFlags,
      latestCustomers: [] as Customer[],
      latestSurveys: [] as Array<{ survey: SurveyResponse; customerName: string }>
    };
  }

  const features = await getFeatureFlags();

  const now = nowMs();
  const from = (() => {
    if (range === "week") return now - 7 * 24 * 60 * 60 * 1000;
    if (range === "month") return now - 30 * 24 * 60 * 60 * 1000;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const reservationsSnap = await db
    .collection("reservations")
    .where("createdAt", ">=", from)
    .limit(1000)
    .get();

  const reservations = reservationsSnap.docs.map((d: any) => d.data() as Reservation);
  const reservationsCount = reservationsSnap.size;
  const reservationsCallCount = reservations.filter((r: Reservation) => r.source === "CALL").length;
  const reservationsWalkInCount = reservations.filter((r: Reservation) => r.source === "WALK_IN").length;
  const callSeatedCount = reservations.filter((r: Reservation) => r.source === "CALL" && r.status === "SEATED").length;
  const callNoShowCount = reservations.filter((r: Reservation) => r.source === "CALL" && r.status === "NO_SHOW").length;
  const walkInSeatedCount = reservations.filter((r: Reservation) => r.source === "WALK_IN" && r.status === "SEATED").length;
  const walkInNoShowCount = reservations.filter((r: Reservation) => r.source === "WALK_IN" && r.status === "NO_SHOW").length;
  const completedCount = reservations.filter((r: Reservation) => r.status === "COMPLETED").length;
  const noShowCount = reservations.filter((r: Reservation) => r.status === "NO_SHOW").length;

  // Survey status: 
  // - Enqueued/Sent comes from surveyOutbox/{reservationId} (deterministic id going forward).
  // - Received comes from surveys/{reservationId}.
  const rangeReservationIds = reservationsSnap.docs.map((d: any) => String(d.id));
  const surveyDocs = await Promise.all(rangeReservationIds.map((id) => db.collection("surveys").doc(id).get()));
  const surveyReceivedByResId = new Set<string>(surveyDocs.filter((d: any) => d.exists).map((d: any) => String(d.id)));
  const surveyOutboxDocs = await Promise.all(rangeReservationIds.map((id) => db.collection("surveyOutbox").doc(id).get()));
  const outboxByResId = new Map<string, SurveyOutboxItem>();
  for (const d of surveyOutboxDocs) {
    if (!d.exists) continue;
    outboxByResId.set(String(d.id), { id: d.id, ...(d.data() as Omit<SurveyOutboxItem, "id">) } as SurveyOutboxItem);
  }
  const surveyEnqueuedCount = outboxByResId.size;
  const surveySentCount = Array.from(outboxByResId.values()).filter((x) => x.status === "SENT").length;
  const surveyReceivedCount = surveyReceivedByResId.size;

  const resById = new Map<string, Reservation>();
  for (let i = 0; i < reservationsSnap.docs.length; i++) {
    const id = String(reservationsSnap.docs[i].id);
    resById.set(id, reservations[i]);
  }

  let surveySentCallCount = 0;
  let surveySentWalkInCount = 0;
  for (const [id, it] of outboxByResId.entries()) {
    if (it.status !== "SENT") continue;
    const r = resById.get(id);
    if (r?.source === "CALL") surveySentCallCount++;
    if (r?.source === "WALK_IN") surveySentWalkInCount++;
  }

  let surveyReceivedCallCount = 0;
  let surveyReceivedWalkInCount = 0;
  for (const id of surveyReceivedByResId) {
    const r = resById.get(id);
    if (r?.source === "CALL") surveyReceivedCallCount++;
    if (r?.source === "WALK_IN") surveyReceivedWalkInCount++;
  }

  const customersCount = (await db.collection("customers").count().get()).data().count;
  const customersWithPhoneCount = (await db.collection("customers").where("phone", ">", "").count().get()).data().count;
  const customersWithoutPhoneCount = Math.max(0, Number(customersCount) - Number(customersWithPhoneCount));

  const latestCustomersSnap = await db
    .collection("customers")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const latestCustomers = latestCustomersSnap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Customer, "id">) }) as Customer
  );

  const latestSurveysSnap = await db.collection("surveys").orderBy("createdAt", "desc").limit(20).get();
  const latestSurveysRaw = latestSurveysSnap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, "id">) }) as SurveyResponse
  );

  const latestSurveyReservationIds = Array.from(new Set(latestSurveysRaw.map((s: SurveyResponse) => s.reservationId)));
  const resDocs = await Promise.all(latestSurveyReservationIds.map((id) => db.collection("reservations").doc(id).get()));
  const customerIds = Array.from(
    new Set(resDocs.filter((d: any) => d.exists).map((d: any) => String((d.data() as Reservation).customerId)))
  );
  const custDocs = await Promise.all(customerIds.map((id) => db.collection("customers").doc(id).get()));
  const custMap = new Map<string, Customer>();
  for (const d of custDocs) {
    if (d.exists) custMap.set(d.id, { id: d.id, ...(d.data() as Omit<Customer, "id">) } as Customer);
  }

  const resMap = new Map<string, Reservation>();
  for (const d of resDocs) {
    if (d.exists) resMap.set(d.id, { id: d.id, ...(d.data() as Omit<Reservation, "id">) } as Reservation);
  }

  const latestSurveys = latestSurveysRaw.map((survey: SurveyResponse) => {
    const reservation = resMap.get(survey.reservationId);
    const customerName = reservation ? custMap.get(reservation.customerId)?.name ?? "" : "";
    return { survey, customerName };
  });

  return {
    reservationsCount,
    reservationsCallCount,
    reservationsWalkInCount,
    callSeatedCount,
    callNoShowCount,
    walkInSeatedCount,
    walkInNoShowCount,
    surveyEnqueuedCount,
    surveySentCount,
    surveyReceivedCount,
    surveySentCallCount,
    surveySentWalkInCount,
    surveyReceivedCallCount,
    surveyReceivedWalkInCount,
    completedCount,
    noShowCount,
    customersCount,
    customersWithPhoneCount,
    customersWithoutPhoneCount,
    features,
    latestCustomers,
    latestSurveys
  };
}

export async function adminCustomersTable(params?: { limit?: number }) {
  const db = getFirestore();
  if (!db) return [] as Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    visitsCount: number;
    visits: Array<{ reservationId: string; at: number }>;
    surveysCount: number;
    lastVisitAt: number | null;
  }>;

  function chunk<T>(arr: T[], size: number) {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  const limit = Math.max(1, Math.min(400, Number(params?.limit ?? 50)));

  // Fetch a larger pool so we can prioritize customers with phone numbers.
  const poolLimit = Math.max(limit, Math.min(800, limit * 6));

  // 1) Pull a pool of customers that actually have phone numbers.
  // Avoid composite index requirements by skipping orderBy.
  const withPhoneSnap = await db.collection("customers").where("phone", ">", "").limit(poolLimit).get();
  const withPhone = withPhoneSnap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Customer, "id">) }) as Customer
  );

  // 2) Fill remaining slots from a recent pool (may include no-phone customers).
  const recentSnap = await db.collection("customers").orderBy("createdAt", "desc").limit(poolLimit).get();
  const recent = recentSnap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Customer, "id">) }) as Customer
  );

  const mergedById = new Map<string, Customer>();
  for (const c of withPhone) mergedById.set(c.id, c);
  for (const c of recent) mergedById.set(c.id, c);

  const customers = Array.from(mergedById.values())
    .sort((a: Customer, b: Customer) => {
      const aHas = Boolean(String(a.phone || "").trim());
      const bHas = Boolean(String(b.phone || "").trim());
      if (aHas !== bHas) return aHas ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
    })
    .slice(0, limit);

  // Batch fetch reservations for all selected customers.
  const customerIds = customers.map((c) => String(c.id));
  const reservationDocs: any[] = [];
  for (const ids of chunk(customerIds, 10)) {
    const snap = await db.collection("reservations").where("customerId", "in", ids).limit(1000).get();
    reservationDocs.push(...snap.docs);
  }

  const reservationsByCustomer = new Map<string, any[]>();
  const reservationIdsAll: string[] = [];
  for (const d of reservationDocs) {
    const data = d.data() as any;
    const cid = String(data?.customerId ?? "");
    if (!cid) continue;
    if (!reservationsByCustomer.has(cid)) reservationsByCustomer.set(cid, []);
    reservationsByCustomer.get(cid)!.push({ id: String(d.id), data });
    reservationIdsAll.push(String(d.id));
  }

  // Batch fetch surveys by reservationId (doc id).
  const surveyExists = new Set<string>();
  for (const ids of chunk(reservationIdsAll, 500)) {
    const refs = ids.map((id) => db.collection("surveys").doc(id));
    const docs = await db.getAll(...refs);
    for (const s of docs) {
      if (s.exists) surveyExists.add(String(s.id));
    }
  }

  const rows: Array<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    visitsCount: number;
    visits: Array<{ reservationId: string; at: number }>;
    surveysCount: number;
    lastVisitAt: number | null;
  }> = [];

  for (const c of customers) {
    const res = reservationsByCustomer.get(String(c.id)) ?? [];
    const visits = res
      .map((r: any) => {
        const data = r.data as Reservation;
        const at = Number((data as any)?.reservedFor ?? (data as any)?.createdAt ?? 0);
        return { reservationId: String(r.id), at };
      })
      .filter((v: any) => Number.isFinite(v.at) && v.at > 0)
      .sort((a: any, b: any) => b.at - a.at);

    const lastVisitAt = visits.length ? Number(visits[0].at) : null;
    const surveysCount = res.reduce((acc: number, r: any) => acc + (surveyExists.has(String(r.id)) ? 1 : 0), 0);

    rows.push({
      id: c.id,
      name: String(c.name || ""),
      phone: String(c.phone || ""),
      email: c.email ? String(c.email) : null,
      visitsCount: res.length,
      visits,
      surveysCount,
      lastVisitAt
    });
  }

  return rows;
}
