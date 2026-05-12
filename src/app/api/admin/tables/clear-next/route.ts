import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { clearTableNextReservedFor } from "@/lib/firestore";

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
    const tableId = String(form.get("tableId") ?? "");

    if (!tableId) return NextResponse.redirect(new URL("/hostess?err=Falta+mesa", baseUrl));

    await clearTableNextReservedFor({ tableId });

    return NextResponse.redirect(new URL("/hostess?ok=Reserva+de+mesa+limpiada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo limpiar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
