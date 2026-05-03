import { NextResponse } from "next/server";
import { enqueueSurveyOutbox, freeTable, getReservationDetail } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  try {
    await requireRole(["CAJA", "ADMIN"]);

    const baseUrl = getBaseUrl(req);

    const form = await req.formData();

    const tableId = String(form.get("tableId") ?? "");
    if (!tableId) return NextResponse.redirect(new URL("/caja?err=Falta+mesa", baseUrl));

    const { completedReservationId } = await freeTable({ tableId });

    if (completedReservationId) {
      const detail = await getReservationDetail(completedReservationId);
      const customer = detail?.customer ?? null;

      const suggestedChannel = customer?.phone ? "WHATSAPP" : customer?.email ? "EMAIL" : "NONE";
      await enqueueSurveyOutbox({ reservationId: completedReservationId, suggestedChannel });
    }

    return NextResponse.redirect(new URL("/caja?ok=Liberada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo liberar";
    return NextResponse.redirect(new URL(`/caja?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
