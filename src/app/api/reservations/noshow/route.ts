import { NextResponse } from "next/server";
import { markNoShow } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  try {
    await requireRole(["HOSTESS", "ADMIN"]);

    const baseUrl = getBaseUrl(req);

    const form = await req.formData();
    const reservationId = String(form.get("reservationId") ?? "");
    if (!reservationId) return NextResponse.redirect(new URL("/hostess?err=Falta+reserva", baseUrl));

    await markNoShow({ reservationId });

    return NextResponse.redirect(new URL("/hostess?ok=No+show", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo marcar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
