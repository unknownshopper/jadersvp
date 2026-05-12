import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { deleteReservationAdmin } from "@/lib/firestore";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  try {
    await requireRole(["ADMIN"]);

    const baseUrl = getBaseUrl(req);

    const form = await req.formData();
    const reservationId = String(form.get("reservationId") ?? "");
    const from = String(form.get("from") ?? "hostess");

    if (!reservationId) {
      const back = from === "admin" ? "/admin" : "/hostess";
      return NextResponse.redirect(new URL(`${back}?err=Falta+reserva`, baseUrl));
    }

    await deleteReservationAdmin({ reservationId });

    const back = from === "admin" ? "/admin" : "/hostess";
    return NextResponse.redirect(new URL(`${back}?ok=Registro+borrado`, baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo borrar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
