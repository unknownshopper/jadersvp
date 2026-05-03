import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { setSurveyConfig } from "@/lib/firestore";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

function normalizeQuestions(raw: string) {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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
    const questionsRaw = String(form.get("questions") ?? "");
    const questions = normalizeQuestions(questionsRaw);

    await setSurveyConfig({ questions });

    return NextResponse.redirect(new URL("/admin/encuesta?ok=Guardado", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo guardar";
    return NextResponse.redirect(new URL(`/admin/encuesta?err=${encodeURIComponent(msg)}`, baseUrl));
  }
}
