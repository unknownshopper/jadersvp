import { NextResponse } from "next/server";
import { createCustomer, createReservation } from "@/lib/firestore";

function parseLocalDateTime(input: string): Date | null {
  const s = input.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

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
  const reservedForRaw = String(form.get("reservedFor") ?? "");

  const reservedFor = parseLocalDateTime(reservedForRaw);

  if (!name || !phone || !reservedFor) {
    return NextResponse.redirect(new URL("/hostess", baseUrl));
  }

  const customer = await createCustomer({ name, phone, email });
  await createReservation({
    customerId: customer.id,
    tableId: null,
    partySize: null,
    reservedFor: reservedFor.getTime(),
    status: "RESERVED",
    source: "CALL",
    notes: null
  });

  return NextResponse.redirect(new URL("/hostess", baseUrl));
}
