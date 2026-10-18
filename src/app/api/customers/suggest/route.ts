import { NextResponse } from "next/server";
import { getFirestore } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { customerVisitStats } from "@/lib/firestore";

function norm(s: string) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export async function GET(req: Request) {
  try {
    await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

    const url = new URL(req.url);
    const phonePrefix = String(url.searchParams.get("phone") ?? "").trim();
    const nameQuery = String(url.searchParams.get("name") ?? "").trim();

    const db = getFirestore();
    if (!db) return NextResponse.json({ customers: [] });

    const withStats = async (list: Array<{ id: string; name: string; phone: string; email: string }>) =>
      Promise.all(
        list.map(async (c) => {
          const s = await customerVisitStats(String(c.id));
          return { ...c, visitsCount: s.visitsCount, lastVisitAt: s.lastVisitAt };
        })
      );

    const toCustomer = (d: any) => ({
      id: d.id,
      name: String(d.data()?.name ?? ""),
      phone: String(d.data()?.phone ?? ""),
      email: String(d.data()?.email ?? "")
    });

    // Phone prefix search (Firestore range query).
    if (phonePrefix.replace(/\D/g, "").length >= 3) {
      const snap = await db
        .collection("customers")
        .orderBy("phone")
        .where("phone", ">=", phonePrefix)
        .where("phone", "<", `${phonePrefix}`)
        .limit(8)
        .get();
      return NextResponse.json({ customers: await withStats(snap.docs.map(toCustomer)) });
    }

    // Name search: normalize + substring match over the contactable pool.
    const nq = norm(nameQuery);
    if (nq.length >= 2) {
      const snap = await db.collection("customers").where("phone", ">", "").limit(1500).get();
      const customers = snap.docs
        .map(toCustomer)
        .filter((c: { name: string }) => norm(c.name).includes(nq))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es"))
        .slice(0, 8);
      return NextResponse.json({ customers: await withStats(customers) });
    }

    return NextResponse.json({ customers: [] });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
