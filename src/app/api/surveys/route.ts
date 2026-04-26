import { NextResponse } from "next/server";
import { createSurvey } from "@/lib/firestore";

export async function POST(req: Request) {
  const form = await req.formData();
  const reservationId = String(form.get("reservationId") ?? "");
  const rating = Number(form.get("rating"));
  const comment = String(form.get("comment") ?? "").trim() || null;

  if (!reservationId || !rating || rating < 1 || rating > 5) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  await createSurvey({ reservationId, rating, comment });

  return NextResponse.redirect(
    new URL(`/encuesta/${reservationId}?ok=${encodeURIComponent("Respuesta enviada")}`, req.url)
  );
}
