import { NextResponse } from "next/server";
import { findOrCreateCustomer, walkInAssign } from "@/lib/firestore";
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
  await walkInAssign({ name, phone, email, tableId, customerId: customer.id, createdByRole });

  const templateName = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION ?? "").trim();
  const headerImageUrl = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL ?? "").trim();
  if (templateName && customer.phone) {
    try {
      const r = await sendWhatsAppTemplate({
        toPhone: customer.phone,
        templateName,
        bodyParams: [name],
        headerImageUrl
      });
      if (!r.ok) console.error("WHATSAPP_CONFIRMATION_FAILED", r.error);
    } catch {
      // non-blocking
    }
  }

  return NextResponse.redirect(new URL("/hostess", baseUrl));
}
