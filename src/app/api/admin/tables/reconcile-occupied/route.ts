import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  try {
    await requireRole(["ADMIN", "DIRECTOR"]);

    const baseUrl = getBaseUrl(req);
    const db = getFirestore();
    if (!db) return NextResponse.redirect(new URL("/hostess?err=Firestore+no+configurado", baseUrl));

    const form = await req.formData();
    const dryRun = String(form.get("dryRun") ?? "") === "1";

    const tablesSnap = await db.collection("tables").where("status", "==", "OCUPADA").limit(200).get();
    const tableDocs = tablesSnap.docs;

    const customerIds = new Set<string>();

    const candidates = await Promise.all(
      tableDocs.map(async (tDoc) => {
        const tableId = String(tDoc.id);

        const byActive = await db
          .collection("reservations")
          .where("status", "==", "SEATED")
          .where("activeTableIds", "array-contains", tableId)
          .limit(1)
          .get();

        const byTableIds = byActive.empty
          ? await db
              .collection("reservations")
              .where("status", "==", "SEATED")
              .where("tableIds", "array-contains", tableId)
              .limit(1)
              .get()
          : null;

        const byTableId = byActive.empty && (byTableIds?.empty ?? true)
          ? await db
              .collection("reservations")
              .where("status", "==", "SEATED")
              .where("tableId", "==", tableId)
              .limit(1)
              .get()
          : null;

        const resDoc = !byActive.empty
          ? byActive.docs[0]
          : byTableIds && !byTableIds.empty
            ? byTableIds.docs[0]
            : byTableId && !byTableId.empty
              ? byTableId.docs[0]
              : null;

        if (!resDoc) return { tableId, reservationId: null as string | null, customerId: null as string | null, customerNameSnapshot: null as string | null };

        const data = resDoc.data() as any;
        const reservationId = String(resDoc.id);
        const customerId = data.customerId ? String(data.customerId) : null;
        const customerNameSnapshot = data.customerNameSnapshot ? String(data.customerNameSnapshot) : null;
        if (customerId) customerIds.add(customerId);

        return { tableId, reservationId, customerId, customerNameSnapshot };
      })
    );

    const customers = new Map<string, string>();
    await Promise.all(
      Array.from(customerIds).map(async (cid) => {
        const doc = await db.collection("customers").doc(cid).get();
        if (!doc.exists) return;
        const data = doc.data() as any;
        const name = data?.name ? String(data.name) : "";
        if (name) customers.set(cid, name);
      })
    );

    const updates = candidates
      .map((c) => {
        if (!c.reservationId) return null;
        const resolvedName = c.customerNameSnapshot ?? (c.customerId ? customers.get(c.customerId) ?? null : null);
        return { ...c, resolvedName };
      })
      .filter(Boolean) as Array<{ tableId: string; reservationId: string; resolvedName: string | null }>;

    if (!dryRun) {
      const batch = db.batch();
      for (const u of updates) {
        const ref = db.collection("tables").doc(u.tableId);
        batch.update(ref, {
          currentReservationId: u.reservationId,
          currentCustomerName: u.resolvedName,
          updatedAt: Date.now()
        });
      }
      await batch.commit();
    }

    const okMsg = dryRun
      ? `Dry run OK. Ocuapadas=${tableDocs.length}, con match SEATED=${updates.length}`
      : `Reconciliado. Ocuapadas=${tableDocs.length}, actualizadas=${updates.length}`;

    return NextResponse.redirect(new URL(`/hostess?ok=${encodeURIComponent(okMsg)}`, baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo reconciliar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
