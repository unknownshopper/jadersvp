import { NextResponse } from "next/server";
import { moveSeatedReservation } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

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
    await requireRole(["CAJA", "ADMIN", "DIRECTOR"]);

    const baseUrl = getBaseUrl(req);
    const form = await req.formData();

    const reservationId = String(form.get("reservationId") ?? "").trim();
    const fromTableId = String(form.get("fromTableId") ?? "").trim();
    const toTableId = String(form.get("toTableId") ?? "").trim();

    if (!reservationId || !fromTableId || !toTableId) {
      return NextResponse.redirect(new URL("/caja?err=Faltan+datos", baseUrl));
    }

    await moveSeatedReservation({ reservationId, fromTableId, toTableId });

    return NextResponse.redirect(new URL("/caja?ok=Mesa+cambiada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo cambiar mesa";
    return NextResponse.redirect(new URL(`/caja?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
