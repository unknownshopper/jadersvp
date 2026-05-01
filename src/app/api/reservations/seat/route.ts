import { NextResponse } from "next/server";
import { seatReservation } from "@/lib/firestore";
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
    const tableId = String(form.get("tableId") ?? "");

    if (!reservationId || !tableId) {
      return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
    }

    await seatReservation({ reservationId, tableId });

    return NextResponse.redirect(new URL("/hostess?ok=Sentado", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo sentar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
