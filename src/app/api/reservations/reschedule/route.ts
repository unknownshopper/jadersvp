import { NextResponse } from "next/server";
import { rescheduleReservation } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";
import { parseLocalDateTime } from "@/lib/dateFormat";

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
    await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

    const baseUrl = getBaseUrl(req);
    const form = await req.formData();

    const reservationId = String(form.get("reservationId") ?? "").trim();
    const reservedForRaw = String(form.get("reservedFor") ?? "").trim();
    const reservedDate = String(form.get("reservedDate") ?? "").trim();
    const reservedTime = String(form.get("reservedTime") ?? "").trim();

    const parsed = reservedForRaw
      ? parseLocalDateTime(reservedForRaw)
      : reservedDate && reservedTime
        ? parseLocalDateTime(`${reservedDate} ${reservedTime}`)
        : null;

    if (!reservationId || !parsed) {
      return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
    }

    await rescheduleReservation({ reservationId, reservedFor: parsed.getTime() });

    return NextResponse.redirect(new URL("/hostess?ok=Reserva+reagendada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo mover";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
