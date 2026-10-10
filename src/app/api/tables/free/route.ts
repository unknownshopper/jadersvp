import { NextResponse } from "next/server";
import { enqueueSurveyOutbox, freeTable, getReservationDetail, resetTablePositionHome } from "@/lib/firestore";
import { getFirestore } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { sendWhatsAppTemplate } from "@/lib/whatsappCloud";

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

    const tableId = String(form.get("tableId") ?? "");
    if (!tableId) return NextResponse.redirect(new URL("/hostess?err=Falta+mesa", baseUrl));

    const { completedReservationId, reservationId, remainingActiveTableIds } = await freeTable({ tableId });

    const returnHome = String(form.get("returnHome") ?? "") === "1";
    if (returnHome) {
      try {
        const db = getFirestore();
        const tdoc = db ? await db.collection("tables").doc(tableId).get() : null;
        const name = tdoc?.exists ? String((tdoc.data() as any)?.name ?? "").trim() : "";
        const area = String((tdoc?.data() as any)?.area ?? "");
        if (name) {
          await resetTablePositionHome({ floor: area === "PLANTA_ALTA" ? "up" : "down", label: name });
        }
      } catch {
        // non-blocking
      }
    }

    if (completedReservationId) {
      const detail = await getReservationDetail(completedReservationId);
      const customer = detail?.customer ?? null;

      console.log("SURVEY_TRIGGER", {
        reservationId: completedReservationId,
        hasCustomer: Boolean(customer),
        hasPhone: Boolean(customer?.phone)
      });

      const suggestedChannel = customer?.phone ? "WHATSAPP" : customer?.email ? "EMAIL" : "NONE";
      await enqueueSurveyOutbox({ reservationId: completedReservationId, suggestedChannel });

      const templateName = String(process.env.WHATSAPP_TEMPLATE_SURVEY ?? "").trim();
      if (!templateName) {
        console.log("WHATSAPP_SURVEY_SKIPPED", { reason: "TEMPLATE_NOT_SET" });
      }
      if (templateName && customer?.phone) {
        const headerImageUrl = String(process.env.WHATSAPP_TEMPLATE_SURVEY_HEADER_IMAGE_URL ?? "").trim();
        try {
          console.log("WHATSAPP_SURVEY_ATTEMPT", {
            toPhone: customer.phone,
            templateName,
            reservationId: completedReservationId,
            hasHeaderImageUrl: Boolean(headerImageUrl)
          });
          const r = await sendWhatsAppTemplate({
            toPhone: customer.phone,
            templateName,
            bodyParams: [String(customer.name ?? "").trim()],
            headerImageUrl,
            buttonUrlParams: [completedReservationId]
          });
          if (!r.ok) {
            const errText = String(r.error ?? "");
            const isStaticButton = errText.includes("132018") || errText.includes("does not require parameters");
            if (isStaticButton) {
              console.error("WHATSAPP_SURVEY_STATIC_BUTTON_REJECTED", {
                templateName,
                reservationId: completedReservationId,
                error: r.error
              });
            } else {
              console.error("WHATSAPP_SURVEY_FAILED", r.error);
            }
          } else {
            console.log("WHATSAPP_SURVEY_ACCEPTED", {
              messageId: r.messageId,
              templateName,
              reservationId: completedReservationId
            });
          }
        } catch {
          // non-blocking
        }
      }
    } else if (reservationId) {
      console.log("SURVEY_TRIGGER_SKIPPED", {
        reason: "PARTIAL_FREE",
        reservationId,
        remainingActiveTableIdsCount: Array.isArray(remainingActiveTableIds) ? remainingActiveTableIds.length : null
      });
    } else {
      console.log("SURVEY_TRIGGER_SKIPPED", { reason: "NO_SEATED_RESERVATION" });
    }

    return NextResponse.redirect(new URL("/hostess?ok=Liberada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo liberar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
