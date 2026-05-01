import { NextResponse } from "next/server";
import { findOrCreateCustomer, walkInAssign } from "@/lib/firestore";

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

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "");

  if (!name || !tableId) {
    return NextResponse.redirect(new URL("/hostess", baseUrl));
  }

  const { customer } = await findOrCreateCustomer({ name, phone, email });
  await walkInAssign({ name, phone, email, tableId, customerId: customer.id });

  return NextResponse.redirect(new URL("/hostess", baseUrl));
}
