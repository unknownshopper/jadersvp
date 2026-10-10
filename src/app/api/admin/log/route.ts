import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { listReservationsLog } from "@/lib/firestore";

export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 1000)));

  const rows = await listReservationsLog({ limit });
  return NextResponse.json({ rows });
}
