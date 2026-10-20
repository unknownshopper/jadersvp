import { NextResponse } from "next/server";
import { createPickup } from "@/lib/firestore";
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
    await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

    const baseUrl = getBaseUrl(req);
    const form = await req.formData();

    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim() || null;
    const note = String(form.get("note") ?? "").trim() || null;

    if (!customerName) {
      return NextResponse.redirect(new URL("/hostess?err=Falta+nombre", baseUrl));
    }

    await createPickup({ customerName, phone, note });

    return NextResponse.redirect(new URL("/hostess?ok=Pickup+registrado", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo registrar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
