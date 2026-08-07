import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

function normalizeQ(q: string) {
  return String(q || "").trim();
}

export async function GET(req: Request) {
  await requireRole(["ADMIN", "DIRECTOR"]);

  const db = getFirestore();
  if (!db) return NextResponse.json({ rows: [] });

  const url = new URL(req.url);
  const q = normalizeQ(url.searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ rows: [] });

  const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit") ?? 40)));

  const digits = q.replace(/\D+/g, "");
  const isEmail = q.includes("@");

  let snap: any = null;

  try {
    if (digits.length >= 4) {
      // Prefix search by phone
      snap = await db
        .collection("customers")
        .orderBy("phone")
        .startAt(q)
        .endAt(`${q}\uf8ff`)
        .limit(limit)
        .get();
    } else if (isEmail) {
      snap = await db
        .collection("customers")
        .orderBy("email")
        .startAt(q)
        .endAt(`${q}\uf8ff`)
        .limit(limit)
        .get();
    } else {
      // Prefix search by name
      snap = await db
        .collection("customers")
        .orderBy("name")
        .startAt(q)
        .endAt(`${q}\uf8ff`)
        .limit(limit)
        .get();
    }
  } catch {
    // If the chosen orderBy fails due to missing fields, fallback to name.
    snap = await db
      .collection("customers")
      .orderBy("name")
      .startAt(q)
      .endAt(`${q}\uf8ff`)
      .limit(limit)
      .get();
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
