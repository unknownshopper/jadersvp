import { NextResponse } from "next/server";
import { confirmWaitlistReservation } from "@/lib/firestore";
import { getFirestore } from "@/lib/firebaseAdmin";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { sendWhatsAppTemplate } from "@/lib/whatsappCloud";
import { formatDateDDMMYY, formatTimeHHMM } from "@/lib/dateFormat";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  await requireRole(["HOSTESS", "ADMIN", "DIRECTOR"]);

  const u = await getSessionUser();
  const createdByRole = u?.role ?? null;

  const form = await req.formData();
  const baseUrl = getBaseUrl(req);

  const reservationId = String(form.get("reservationId") ?? "").trim();
  const tableIds = (form.getAll("tableIds") ?? []).map((x) => String(x).trim()).filter(Boolean);
  const sendWhatsApp = String(form.get("sendWhatsApp") ?? "").trim() === "1";

  if (!reservationId || tableIds.length === 0) {
    return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
  }

  const { reservedFor } = await confirmWaitlistReservation({ reservationId, tableIds, createdByRole });

  let warn: string | null = null;
  let waMessageId: string | null = null;
  let waStatus: "SENT" | "FAILED" | "SKIPPED" | null = null;
  let waError: string | null = null;

  if (sendWhatsApp) {
    try {
      const db = getFirestore();
      if (!db) {
        warn = "WHATSAPP_DB";
        waStatus = "FAILED";
        waError = warn;
      } else {
        const resDoc = await db.collection("reservations").doc(reservationId).get();
        if (!resDoc.exists) {
          warn = "WHATSAPP_RES";
          waStatus = "FAILED";
          waError = warn;
        } else {
          const r = resDoc.data() as any;
          const customerId = String(r.customerId ?? "");
          const customerName = String(r.customerNameSnapshot ?? "").trim();

          const custDoc = customerId ? await db.collection("customers").doc(customerId).get() : null;
          const phone = custDoc?.exists ? String((custDoc.data() as any)?.phone ?? "").trim() : "";

          const templateName =
            String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_WALKBY ?? "").trim() ||
            "confirma_walkby";
          if (!templateName) {
            warn = "WHATSAPP_TEMPLATE";
            waStatus = "FAILED";
            waError = warn;
          } else if (!phone) {
            warn = "WHATSAPP_PHONE";
            waStatus = "SKIPPED";
            waError = "NO_PHONE";
          } else {
            const headerImageUrl = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL ?? "").trim();
            const when = new Date(reservedFor);
            const dateStr = formatDateDDMMYY(when, "America/Mexico_City");
            const timeStr = formatTimeHHMM(when, "America/Mexico_City");

            let tablesStr = "";
            try {
              const tableNames = (tableIds ?? []).map((x) => String(x).trim()).filter(Boolean);
              tablesStr = tableNames.join(", ");
            } catch {
              // non-blocking
            }
            const details = `${dateStr} ${timeStr}${tablesStr ? ` · Mesa(s): ${tablesStr}` : ""}`;

            const wa = await sendWhatsAppTemplate({
              toPhone: phone,
              templateName,
              bodyParams: [customerName, details],
              headerImageUrl
            });
            if (!wa.ok) {
              warn = wa.error || "WHATSAPP_ERROR";
              waStatus = "FAILED";
              waError = String(wa.error ?? "WHATSAPP_ERROR");
            } else {
              waMessageId = wa.messageId;
              waStatus = "SENT";
              waError = null;
            }
          }
        }
      }
    } catch (err: any) {
      warn = typeof err?.message === "string" ? err.message : "WHATSAPP_ERROR";
      waStatus = "FAILED";
      waError = warn;
    }
  } else {
    waStatus = "SKIPPED";
    waError = "USER_OPT_OUT";
  }

  try {
    const db = getFirestore();
    if (db) {
      const ts = Date.now();
      await db
        .collection("reservations")
        .doc(reservationId)
        .set(
          {
            waConfirmationStatus: waStatus,
            waConfirmationAt: ts,
            waConfirmationMessageId: waMessageId,
            waConfirmationError: waError
          },
          { merge: true }
        );
    }
  } catch {
    // non-blocking
  }

  const okMsg = waMessageId ? `Confirmada (WA: ${waMessageId})` : "Confirmada";
  return NextResponse.redirect(new URL(`/hostess?ok=${encodeURIComponent(okMsg)}${warn ? `&warn=${encodeURIComponent(warn)}` : ""}`, baseUrl));
}
