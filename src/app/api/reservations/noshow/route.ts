import { NextResponse } from "next/server";
import { markNoShow } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    await requireRole(["HOSTESS", "ADMIN"]);

    const form = await req.formData();
    const reservationId = String(form.get("reservationId") ?? "");
    if (!reservationId) return NextResponse.redirect(new URL("/hostess?err=Falta+reserva", req.url));

    await markNoShow({ reservationId });

    return NextResponse.redirect(new URL("/hostess?ok=No+show", req.url));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo marcar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, req.url));
  }
}
