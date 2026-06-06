import { NextResponse } from "next/server";
import { createSurvey } from "@/lib/firestore";

function normalizeReservationId(input: string) {
  const raw = String(input ?? "").trim();
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // ignore
  }
  s = s.replace(/^\{\{\d+\}\}/, "");
  s = s.replace(/^%7B%7B\d+%7D%7D/i, "");
  return s;
}

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  const form = await req.formData();

  const baseUrl = getBaseUrl(req);
  const reservationId = normalizeReservationId(String(form.get("reservationId") ?? ""));
  const rating = Number(form.get("rating"));
  const comment = String(form.get("comment") ?? "").trim() || null;
  const answers: Record<string, string> = {};
  const ratingDetail = String(form.get("rating_detail") ?? "").trim();
  if (ratingDetail) answers["rating_detail"] = ratingDetail;
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

  try {
    await createSurvey({ reservationId, rating, comment, answers: Object.keys(answers).length ? answers : null });
  } catch (e: any) {
    // If the survey already exists, treat it as a successful submission (idempotent).
    const code = String(e?.code ?? "");
    if (code === "6" || code === "already-exists" || code === "ALREADY_EXISTS") {
      return NextResponse.redirect(
        new URL(`/encuesta/${reservationId}?ok=${encodeURIComponent("Respuesta ya registrada")}`, baseUrl)
      );
    }
    throw e;
  }

  return NextResponse.redirect(
    new URL(`/encuesta/${reservationId}?ok=${encodeURIComponent("Respuesta enviada")}`, baseUrl)
  );
}
