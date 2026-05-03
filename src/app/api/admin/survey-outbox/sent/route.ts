import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { markSurveyOutboxSent } from "@/lib/firestore";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  const baseUrl = getBaseUrl(req);

  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  try {
    const form = await req.formData();
    const outboxId = String(form.get("outboxId") ?? "").trim();
    if (!outboxId) return NextResponse.redirect(new URL("/admin/encuestas-pendientes?err=Falta+id", baseUrl));

    await markSurveyOutboxSent({ outboxId });

    return NextResponse.redirect(new URL("/admin/encuestas-pendientes?ok=Listo", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo actualizar";
    return NextResponse.redirect(new URL(`/admin/encuestas-pendientes?err=${encodeURIComponent(msg)}`, baseUrl));
  }
}
