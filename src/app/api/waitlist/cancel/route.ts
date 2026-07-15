import { NextResponse } from "next/server";
import { cancelWaitlistReservation } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  await requireRole(["HOSTESS", "ADMIN", "DIRECTOR"]);

  const u = await getSessionUser();
  const createdByRole = u?.role ?? null;

  const form = await req.formData();
  const baseUrl = getBaseUrl(req);

  const reservationId = String(form.get("reservationId") ?? "").trim();
  if (!reservationId) {
    return NextResponse.redirect(new URL("/hostess?err=Falta+datos", baseUrl));
  }

  await cancelWaitlistReservation({ reservationId, createdByRole });

  return NextResponse.redirect(new URL("/hostess?ok=Cancelada", baseUrl));
}
