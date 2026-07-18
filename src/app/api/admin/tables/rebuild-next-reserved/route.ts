import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

export async function POST() {
  try {
    await requireRole(["ADMIN", "DIRECTOR"]);

    const db = getFirestore();
    if (!db) return NextResponse.json({ error: "Firestore not configured" }, { status: 500 });

    const now = Date.now();
    // Avoid composite indexes: fetch recent RESERVED reservations and filter in memory.
    const reservedSnap = await db.collection("reservations").where("status", "==", "RESERVED").limit(1500).get();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const futureDocs = reservedSnap.docs.filter((d: any) => {
      const r = d.data() as any;
      const rf = typeof r.reservedFor === "number" ? Number(r.reservedFor) : null;
      return rf != null && rf >= cutoff;
    });

  const minReservedForByTableId = new Map<string, number>();

  futureDocs.forEach((doc: any) => {
    const r = doc.data() as any;
    const rf = typeof r.reservedFor === "number" ? Number(r.reservedFor) : null;
    if (!rf) return;

    const tids: string[] = [];
    if (r.tableId) tids.push(String(r.tableId));
    if (Array.isArray(r.tableIds)) tids.push(...r.tableIds.map((x: any) => String(x)));

    for (const tid of tids.filter(Boolean)) {
      const cur = minReservedForByTableId.get(tid);
      if (cur == null || rf < cur) minReservedForByTableId.set(tid, rf);
    }
  });

  const tableIds = Array.from(minReservedForByTableId.keys());
  const ts = Date.now();
  let updatedTables = 0;

  for (let i = 0; i < tableIds.length; i += 450) {
    const chunk = tableIds.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((tid) => {
      batch.set(
        db.collection("tables").doc(tid),
        {
          nextReservedFor: minReservedForByTableId.get(tid) ?? null,
          updatedAt: ts
        },
        { merge: true }
      );
    });
    await batch.commit();
    updatedTables += chunk.length;
  }

    return NextResponse.json({
      reservationsScanned: reservedSnap.size,
      futureReservationsConsidered: futureDocs.length,
      tablesWithNext: tableIds.length,
      updatedTables
    });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "REBUILD_NEXT_RESERVED_FAILED";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
