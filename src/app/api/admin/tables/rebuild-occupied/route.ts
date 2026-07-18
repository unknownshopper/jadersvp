import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

export async function POST() {
  await requireRole(["ADMIN", "DIRECTOR"]);

  const db = getFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not configured" }, { status: 500 });

  const seatedSnap = await db.collection("reservations").where("status", "==", "SEATED").limit(500).get();

  const occupiedByTableId = new Map<
    string,
    {
      reservationId: string;
      customerNameSnapshot: string | null;
      customerId: string | null;
    }
  >();

  seatedSnap.docs.forEach((doc: any) => {
    const r = doc.data() as any;
    const reservationId = String(doc.id);
    const customerNameSnapshot = r.customerNameSnapshot ? String(r.customerNameSnapshot) : null;
    const customerId = r.customerId ? String(r.customerId) : null;

    const tids: string[] = [];
    if (r.tableId) tids.push(String(r.tableId));
    if (Array.isArray(r.tableIds)) tids.push(...r.tableIds.map((x: any) => String(x)));
    if (Array.isArray(r.activeTableIds)) tids.push(...r.activeTableIds.map((x: any) => String(x)));

    for (const tid of tids.filter(Boolean)) {
      if (!occupiedByTableId.has(tid)) {
        occupiedByTableId.set(tid, { reservationId, customerNameSnapshot, customerId });
      }
    }
  });

  const customerIds = Array.from(
    new Set(
      Array.from(occupiedByTableId.values())
        .map((v) => v.customerId)
        .filter(Boolean) as string[]
    )
  );

  const customerNameById = new Map<string, string>();
  await Promise.all(
    customerIds.map(async (cid) => {
      const doc = await db.collection("customers").doc(cid).get();
      if (!doc.exists) return;
      const name = String((doc.data() as any)?.name ?? "").trim();
      if (name) customerNameById.set(cid, name);
    })
  );

  const updates = Array.from(occupiedByTableId.entries()).map(([tableId, v]) => {
    const fallbackName = v.customerId ? customerNameById.get(v.customerId) ?? null : null;
    const resolvedName = v.customerNameSnapshot ?? fallbackName;
    return { tableId, reservationId: v.reservationId, customerName: resolvedName };
  });

  const ts = Date.now();
  let updatedTables = 0;

  for (let i = 0; i < updates.length; i += 450) {
    const chunk = updates.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((u) => {
      batch.set(
        db.collection("tables").doc(u.tableId),
        {
          status: "OCUPADA",
          currentReservationId: u.reservationId,
          currentCustomerName: u.customerName,
          updatedAt: ts
        },
        { merge: true }
      );
    });
    await batch.commit();
    updatedTables += chunk.length;
  }

  return NextResponse.json({ seatedReservations: seatedSnap.size, occupiedTablesDetected: updates.length, updatedTables });
}
