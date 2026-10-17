import { NextResponse } from "next/server";
import { getFirestore } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";

export async function GET(req: Request) {
  try {
    await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

    const url = new URL(req.url);
    const prefix = String(url.searchParams.get("phone") ?? "").trim();
    const digits = prefix.replace(/\D/g, "");
    if (digits.length < 3) {
      return NextResponse.json({ customers: [] });
    }

    const db = getFirestore();
    if (!db) return NextResponse.json({ customers: [] });

    const snap = await db
      .collection("customers")
      .orderBy("phone")
      .where("phone", ">=", prefix)
      .where("phone", "<", `${prefix}`)
      .limit(8)
      .get();

    const customers = snap.docs.map((d: any) => ({
      id: d.id,
      name: String(d.data()?.name ?? ""),
      phone: String(d.data()?.phone ?? ""),
      email: String(d.data()?.email ?? "")
    }));

    return NextResponse.json({ customers });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
