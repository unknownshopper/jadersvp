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
  const answers: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    const key = String(k);
    const val = String(v ?? "").trim();
    if (!val) continue;

    const mChoice = key.match(/^q_(\d+)_choice$/);
    if (mChoice) {
      const idx = mChoice[1];
      answers[`q_${idx}`] = val;
      continue;
    }

    const mDetail = key.match(/^q_(\d+)_detail$/);
    if (mDetail) {
      const idx = mDetail[1];
      answers[`q_${idx}_detail`] = val;
      continue;
    }
  }

  if (!reservationId || !rating || rating < 1 || rating > 5) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  await createSurvey({ reservationId, rating, comment, answers: Object.keys(answers).length ? answers : null });

  return NextResponse.redirect(
    new URL(`/encuesta/${reservationId}?ok=${encodeURIComponent("Respuesta enviada")}`, baseUrl)
  );
}
