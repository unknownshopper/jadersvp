import { NextResponse } from "next/server";
import { seatReservation } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    await requireRole(["HOSTESS", "ADMIN"]);

    const form = await req.formData();

    const reservationId = String(form.get("reservationId") ?? "");
    const tableId = String(form.get("tableId") ?? "");

    if (!reservationId || !tableId) {
      return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", req.url));
    }

    await seatReservation({ reservationId, tableId });

    return NextResponse.redirect(new URL("/hostess?ok=Sentado", req.url));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo sentar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, req.url));
  }
}
