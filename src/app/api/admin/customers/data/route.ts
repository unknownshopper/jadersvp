import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

// Full customer rows with visit history — backs the standalone cdb.html
// database page. One scan of reservations + survey ids, grouped in memory,
// is cheaper than per-customer lookups at this dataset size.
export async function GET(req: Request) {
  await requireRole(["ADMIN", "DIRECTOR"]);

  const db = getFirestore();
  if (!db) return NextResponse.json({ rows: [] });

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(2000, Number(url.searchParams.get("limit") ?? 1500)));

  const [custSnap, resSnap, surveySnap] = await Promise.all([
    db.collection("customers").limit(limit).get(),
    db.collection("reservations").get(),
    db.collection("surveys").select().get()
  ]);

  const surveyIds = new Set<string>(surveySnap.docs.map((d: any) => String(d.id)));

  const byCustomer = new Map<string, Array<{ reservationId: string; at: number; hasSurvey: boolean }>>();
  for (const d of resSnap.docs) {
    const data = d.data() as any;
    const cid = String(data?.customerId ?? "");
    if (!cid) continue;
    const at = Number(data?.reservedFor ?? data?.createdAt ?? 0);
    if (!Number.isFinite(at) || at <= 0) continue;
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid)!.push({
      reservationId: String(d.id),
      at,
      hasSurvey: surveyIds.has(String(d.id))
    });
  }

  const rows = custSnap.docs.map((d: any) => {
    const data = d.data() as any;
    const visits = (byCustomer.get(String(d.id)) ?? [])
      .slice()
      .sort((a, b) => b.at - a.at)
      .map((v) => ({ reservationId: v.reservationId, at: v.at }));
    const surveysCount = (byCustomer.get(String(d.id)) ?? []).reduce((acc, v) => acc + (v.hasSurvey ? 1 : 0), 0);
    return {
      id: String(d.id),
      name: String(data?.name ?? ""),
      phone: String(data?.phone ?? ""),
      email: data?.email ? String(data.email) : null,
      visitsCount: visits.length,
      surveysCount,
      visits,
      lastVisitAt: visits.length ? visits[0].at : null
    };
  });

  return NextResponse.json({ rows });
}
