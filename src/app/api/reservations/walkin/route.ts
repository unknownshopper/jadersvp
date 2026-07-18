import { NextResponse } from "next/server";
import { findOrCreateCustomer, walkInAssign } from "@/lib/firestore";
import { getFirestore } from "@/lib/firebaseAdmin";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
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
  await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);
  const u = await getSessionUser();
  const createdByRole = u?.role ?? null;

  const form = await req.formData();

  const baseUrl = getBaseUrl(req);

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "");

  if (!name || !tableId) {
    return NextResponse.redirect(new URL("/hostess", baseUrl));
  }

  const { customer } = await findOrCreateCustomer({ name, phone, email });
  const { reservationId } = await walkInAssign({ name, phone, email, tableId, customerId: customer.id, createdByRole });

  const walkbyTemplateName =
    String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_WALKBY ?? "").trim() ||
    "confirma_walkby";
  const headerImageUrl =
    String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_WALKBY_HEADER_IMAGE_URL ?? "").trim() ||
    String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL ?? "").trim();
  if (walkbyTemplateName && customer.phone) {
    let tableName = tableId;
    try {
      const db = getFirestore();
      if (db) {
        const tdoc = await db.collection("tables").doc(tableId).get();
        const rawName = tdoc.exists ? String((tdoc.data() as any)?.name ?? "").trim() : "";
        if (rawName) tableName = rawName;
      }
    } catch {
      // non-blocking
    }
    try {
      const r = await sendWhatsAppTemplate({
        toPhone: customer.phone,
        templateName: walkbyTemplateName,
        bodyParams: [name, tableName],
        headerImageUrl
      });
      if (!r.ok) console.error("WHATSAPP_CONFIRMATION_FAILED", r.error);
      try {
        const db = getFirestore();
        if (db && reservationId) {
          const ts = Date.now();
          await db
            .collection("reservations")
            .doc(reservationId)
            .set(
              {
                waConfirmationStatus: r.ok ? "SENT" : "FAILED",
                waConfirmationAt: ts,
                waConfirmationMessageId: r.ok ? r.messageId : null,
                waConfirmationError: r.ok ? null : String(r.error ?? "WHATSAPP_ERROR")
              },
              { merge: true }
            );
        }
      } catch {
        // non-blocking
      }
    } catch {
      // non-blocking
    }
  } else {
    try {
      const db = getFirestore();
      if (db && reservationId) {
        const ts = Date.now();
        await db
          .collection("reservations")
          .doc(reservationId)
          .set(
            {
              waConfirmationStatus: "SKIPPED",
              waConfirmationAt: ts,
              waConfirmationMessageId: null,
              waConfirmationError: !customer.phone ? "NO_PHONE" : "NO_TEMPLATE"
            },
            { merge: true }
          );
      }
    } catch {
      // non-blocking
    }
  }

  return NextResponse.redirect(new URL("/hostess", baseUrl));
}
