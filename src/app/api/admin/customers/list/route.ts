import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  await requireRole(["ADMIN", "DIRECTOR"]);

  const db = getFirestore();
  if (!db) return NextResponse.json({ rows: [] });

  const url = new URL(req.url);
  const phone = String(url.searchParams.get("phone") ?? "all");
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 250)));

  let snap: any = null;

  if (phone === "with") {
    snap = await db.collection("customers").where("phone", ">", "").limit(limit).get();
  } else if (phone === "without") {
    // Firestore doesn't support OR (missing OR == ""). This will at least include empty-string phones.
    // Many datasets normalize missing phone to ""; if some docs omit the field, they won't be returned here.
    snap = await db.collection("customers").where("phone", "==", "").limit(limit).get();
  } else {
    snap = await db.collection("customers").limit(limit).get();
  }

  const rows = (snap?.docs ?? []).map((d: any) => {
    const data = d.data() as any;
    return {
      id: String(d.id),
      name: String(data?.name ?? ""),
      phone: String(data?.phone ?? ""),
      email: data?.email ? String(data.email) : null,
      visitsCount: 0,
      surveysCount: 0,
      visits: [] as Array<{ reservationId: string; at: number }>,
      lastVisitAt: null as number | null
    };
  });

  return NextResponse.json({ rows });
}
