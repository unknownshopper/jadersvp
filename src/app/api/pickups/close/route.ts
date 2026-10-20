import { NextResponse } from "next/server";
import { closePickup } from "@/lib/firestore";
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

    const pickupId = String(form.get("pickupId") ?? "").trim();
    if (!pickupId) {
      return NextResponse.redirect(new URL("/hostess?err=Falta+pickup", baseUrl));
    }

    await closePickup({ pickupId });

    return NextResponse.redirect(new URL("/hostess?ok=Pickup+entregado", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo cerrar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
