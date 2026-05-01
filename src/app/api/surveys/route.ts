import { NextResponse } from "next/server";
import { createSurvey } from "@/lib/firestore";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  const form = await req.formData();

  const baseUrl = getBaseUrl(req);
  const reservationId = String(form.get("reservationId") ?? "");
  const rating = Number(form.get("rating"));
  const comment = String(form.get("comment") ?? "").trim() || null;

  if (!reservationId || !rating || rating < 1 || rating > 5) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  await createSurvey({ reservationId, rating, comment });

  return NextResponse.redirect(
    new URL(`/encuesta/${reservationId}?ok=${encodeURIComponent("Respuesta enviada")}`, baseUrl)
  );
}
