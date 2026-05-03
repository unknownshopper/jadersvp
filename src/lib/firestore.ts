import { getFirestore, isFirebaseConfigured } from "@/lib/firebaseAdmin";

export type TableStatus = "LIBRE" | "OCUPADA" | "RESERVADA" | "POR_LIMPIAR";
export type Area = "TERRAZA_FRONTAL" | "TERRAZA_LATERAL" | "INTERIOR";
export type ReservationStatus =
  | "WAITING"
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
  status: TableStatus;
  nextReservedFor?: number | null;
  lastFreedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

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
  tableId?: string | null;
  partySize?: number | null;
  reservedFor?: number | null;
  status: ReservationStatus;
  source: ReservationSource;
  notes?: string | null;
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

export type SurveyConfig = {
  questions: string[];
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
  return { questions };
}

export async function setSurveyConfig(input: SurveyConfig) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const questions = (input.questions ?? []).map((q) => String(q).trim()).filter(Boolean);
  await db.collection("config").doc("survey").set({ questions, updatedAt: nowMs() }, { merge: true });
}

export async function listSurveysForDashboard(params?: { limit?: number }): Promise<SurveyResponse[]> {
  const db = getFirestore();
  if (!db) return [];

  const limit = Math.max(1, Math.min(1000, Number(params?.limit ?? 200)));
  const snap = await db.collection("surveys").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as Omit<SurveyResponse, "id">) }) as SurveyResponse);
}

export async function enqueueSurveyOutbox(params: {
  reservationId: string;
  suggestedChannel: "WHATSAPP" | "EMAIL" | "NONE";
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const ts = nowMs();
  const ref = await db.collection("surveyOutbox").add({
    reservationId: params.reservationId,
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
  const ref = await db.collection("customers").add({
    name: input.name,
    phone: String(input.phone ?? ""),
    email: input.email ?? null,
    isRecurrent: false,
    createdAt: ts,
    updatedAt: ts
  });

  return {
    id: ref.id,
    name: input.name,
    phone: String(input.phone ?? ""),
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

  const phone = String(input.phone ?? "").trim();
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

  const existing = await findCustomerByContact({ phone: input.phone, email: input.email });
  if (!existing) {
    const customer = await createCustomer({ name: input.name, phone: input.phone ?? "", email: input.email ?? null });
    return { customer, existing: false };
  }

  const ts = nowMs();
  await db
    .collection("customers")
    .doc(existing.id)
    .set(
      {
        name: input.name || existing.name,
        ...(String(input.phone ?? "").trim() ? { phone: String(input.phone ?? "").trim() } : {}),
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

export async function listWaitingReservations(params?: {
  tableId?: string | null;
  allStatuses?: boolean;
}): Promise<
  Array<{
    reservation: Reservation;
    customer: Customer;
    table?: CafeTable | null;
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
  // If we also orderBy createdAt while filtering by tableId, Firestore may require
  // a composite index. To keep setup simple, we skip orderBy in that case and
  // sort in-memory.
  const snap = params?.tableId
    ? await q.limit(200).get()
    : await q.orderBy("createdAt", "desc").limit(200).get();

  const reservationsUnsorted = snap.docs.map(
    (d: any) => ({ id: d.id, ...(d.data() as Omit<Reservation, "id">) }) as Reservation
  );
  const reservations = (
    params?.tableId
      ? reservationsUnsorted.sort((a: Reservation, b: Reservation) => b.createdAt - a.createdAt)
      : reservationsUnsorted
  ) as Reservation[];

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
    new Set(reservations.map((r: Reservation) => r.tableId).filter(Boolean) as string[])
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
      return {
        reservation,
        customer,
        table: reservation.tableId ? tables.get(reservation.tableId) ?? null : null
      };
    })
    .filter(Boolean) as any;
}

export async function seatReservation(params: { reservationId: string; tableId: string }) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const reservationRef = db.collection("reservations").doc(params.reservationId);
  const tableRef = db.collection("tables").doc(params.tableId);

  await db.runTransaction(async (tx: any) => {
    const [resDoc, tableDoc] = await Promise.all([tx.get(reservationRef), tx.get(tableRef)]);
    if (!resDoc.exists) throw new Error("Reservation not found");
    if (!tableDoc.exists) throw new Error("Table not found");

    const table = tableDoc.data() as CafeTable;
    if (table.status !== "LIBRE") throw new Error("Table not free");

    const reservation = { id: resDoc.id, ...(resDoc.data() as Omit<Reservation, "id">) } as Reservation;
    const next = (table as any).nextReservedFor as number | null | undefined;
    const reservedFor = reservation.reservedFor ? Number(reservation.reservedFor) : null;
    const nextReservedFor = reservedFor && next && next === reservedFor ? null : next ?? null;

    const ts = nowMs();
    tx.update(tableRef, { status: "OCUPADA", nextReservedFor, updatedAt: ts });
    tx.update(reservationRef, { tableId: params.tableId, status: "SEATED", updatedAt: ts });
  });
}

export async function walkInAssign(params: {
  name: string;
  phone: string;
  email?: string | null;
  tableId: string;
  customerId?: string | null;
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableRef = db.collection("tables").doc(params.tableId);

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");
    const table = tableDoc.data() as CafeTable;

    if (table.status !== "LIBRE") throw new Error("Table not free");

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
            ...(String(params.phone ?? "").trim() ? { phone: String(params.phone ?? "").trim() } : {}),
            ...(String(params.email ?? "").trim() ? { email: String(params.email ?? "").trim() } : {}),
            isRecurrent: true,
            updatedAt: ts
          },
          { merge: true }
        );
      } else {
        tx.set(customerRef, {
          name: params.name,
          phone: String(params.phone ?? ""),
          email: params.email ?? null,
          isRecurrent: false,
          createdAt: ts,
          updatedAt: ts
        });
      }
    } else {
      tx.set(customerRef, {
        name: params.name,
        phone: String(params.phone ?? ""),
        email: params.email ?? null,
        isRecurrent: false,
        createdAt: ts,
        updatedAt: ts
      });
    }

    const reservationRef = db.collection("reservations").doc();
    tx.set(reservationRef, {
      customerId: customerRef.id,
      customerNameSnapshot: params.name,
      tableId: params.tableId,
      status: "SEATED",
      source: "WALK_IN",
      reservedFor: null,
      partySize: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts
    });

    // Do not clear nextReservedFor: there may be a future reservation scheduled for this table.
    tx.update(tableRef, { status: "OCUPADA", updatedAt: ts });
  });
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
}) {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableRef = db.collection("tables").doc(params.tableId);

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");
    const table = tableDoc.data() as CafeTable;

    // Allow scheduling a future reservation even if the table is currently occupied,
    // as long as the reservation is not too close to now.
    const now = Date.now();
    const windowMs = 3 * 60 * 60 * 1000;
    if (params.reservedFor - now <= windowMs) {
      if (table.status !== "LIBRE") throw new Error("Table not free");
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
            ...(String(params.phone ?? "").trim() ? { phone: String(params.phone ?? "").trim() } : {}),
            ...(String(params.email ?? "").trim() ? { email: String(params.email ?? "").trim() } : {}),
            isRecurrent: true,
            updatedAt: ts
          },
          { merge: true }
        );
      } else {
        tx.set(customerRef, {
          name: params.name,
          phone: String(params.phone ?? ""),
          email: params.email ?? null,
          isRecurrent: false,
          createdAt: ts,
          updatedAt: ts
        });
      }
    } else {
      tx.set(customerRef, {
        name: params.name,
        phone: String(params.phone ?? ""),
        email: params.email ?? null,
        isRecurrent: false,
        createdAt: ts,
        updatedAt: ts
      });
    }

    const reservationRef = db.collection("reservations").doc();
    tx.set(reservationRef, {
      customerId: customerRef.id,
      customerNameSnapshot: params.name,
      tableId: params.tableId,
      status: "RESERVED",
      source: "CALL",
      reservedFor: params.reservedFor,
      partySize: params.partySize ?? null,
      notes: params.notes ?? null,
      createdAt: ts,
      updatedAt: ts
    });

    tx.update(tableRef, { nextReservedFor: params.reservedFor, updatedAt: ts });
  });
}

export async function freeTable(params: { tableId: string }): Promise<{ completedReservationId: string | null }> {
  const db = getFirestore();
  if (!db) throw new Error("Firestore not configured");

  const tableRef = db.collection("tables").doc(params.tableId);

  let completedReservationId: string | null = null;

  await db.runTransaction(async (tx: any) => {
    const tableDoc = await tx.get(tableRef);
    if (!tableDoc.exists) throw new Error("Table not found");

    // Firestore requires all reads to be executed before all writes in a transaction.
    const activeSnap = await tx.get(
      db
        .collection("reservations")
        .where("tableId", "==", params.tableId)
        .where("status", "==", "SEATED")
        .limit(1)
    );

    const ts = nowMs();
    tx.update(tableRef, { status: "LIBRE", lastFreedAt: ts, updatedAt: ts });

    if (!activeSnap.empty) {
      const resDoc = activeSnap.docs[0];
      completedReservationId = String(resDoc.id);
      tx.update(resDoc.ref, { status: "COMPLETED", updatedAt: ts });
    }
  });

  return { completedReservationId };
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

  const surveySnap = await db
    .collection("surveys")
    .where("reservationId", "==", reservationId)
    .limit(1)
    .get();

  const survey = surveySnap.empty
    ? null
    : ({ id: surveySnap.docs[0].id, ...(surveySnap.docs[0].data() as Omit<SurveyResponse, "id">) } as SurveyResponse);

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

  const ref = await db.collection("surveys").add({
    reservationId: input.reservationId,
    rating: input.rating,
    comment: input.comment ?? null,
    answers: input.answers ?? null,
    createdAt: nowMs()
  });

  return ref.id;
}

export async function adminSummary(range: "day" | "week" | "month") {
  const db = getFirestore();
  if (!db) {
    return {
      reservationsCount: 0,
      completedCount: 0,
      noShowCount: 0,
      customersCount: 0,
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
  const completedCount = reservations.filter((r: Reservation) => r.status === "COMPLETED").length;
  const noShowCount = reservations.filter((r: Reservation) => r.status === "NO_SHOW").length;

  const customersCount = (await db.collection("customers").count().get()).data().count;

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

  const reservationIds = Array.from(new Set(latestSurveysRaw.map((s: SurveyResponse) => s.reservationId)));
  const resDocs = await Promise.all(reservationIds.map((id) => db.collection("reservations").doc(id).get()));
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
    completedCount,
    noShowCount,
    customersCount,
    features,
    latestCustomers,
    latestSurveys
  };
}
