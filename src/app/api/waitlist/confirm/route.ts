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

  if (sendWhatsApp) {
    try {
      const db = getFirestore();
      if (db) {
        const resDoc = await db.collection("reservations").doc(reservationId).get();
        if (resDoc.exists) {
          const r = resDoc.data() as any;
          const customerId = String(r.customerId ?? "");
          const customerName = String(r.customerNameSnapshot ?? "").trim();

          const custDoc = customerId ? await db.collection("customers").doc(customerId).get() : null;
          const phone = custDoc?.exists ? String((custDoc.data() as any)?.phone ?? "").trim() : "";

          const templateName = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION ?? "").trim();
          if (templateName && phone) {
            const headerImageUrl = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL ?? "").trim();
            const when = new Date(reservedFor);
            const dateStr = formatDateDDMMYY(when, "America/Mexico_City");
            const timeStr = formatTimeHHMM(when, "America/Mexico_City");

            let tablesStr = "";
            try {
              const tableDocs = await Promise.all(tableIds.map((tid: string) => db.collection("tables").doc(tid).get()));
              const tableNames = tableDocs
                .map((d: any, i: number) => {
                  const rawName = d.exists ? String((d.data() as any)?.name ?? "").trim() : "";
                  return rawName || tableIds[i];
                })
                .filter(Boolean);
              tablesStr = tableNames.join(", ");
            } catch {
              // non-blocking
            }

            await sendWhatsAppTemplate({
              toPhone: phone,
              templateName,
              bodyParams: [customerName, dateStr, timeStr, tablesStr],
              headerImageUrl
            });
          }
        }
      }
    } catch {
      // non-blocking
    }
  }

  return NextResponse.redirect(new URL("/hostess?ok=Confirmada", baseUrl));
}
