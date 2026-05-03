import { NextResponse } from "next/server";
import { createReservation, findOrCreateCustomer, reserveTable } from "@/lib/firestore";

function getBaseUrl(req: Request) {
  const env = process.env.APP_BASE_URL;
  if (env) return env;
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

function combineLocalDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  // Interpret as local time.
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST(req: Request) {
  const form = await req.formData();

  const baseUrl = getBaseUrl(req);

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "").trim() || null;
  const partySizeRaw = String(form.get("partySize") ?? "").trim();
  const partySize = partySizeRaw ? Number.parseInt(partySizeRaw, 10) : null;
  const notes = String(form.get("notes") ?? "").trim() || null;

  const dateStr = String(form.get("reservedDate") ?? "").trim();
  const timeStr = String(form.get("reservedTime") ?? "").trim();
  const reservedFor = combineLocalDateTime(dateStr, timeStr);

  if (!name) {
    return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
  }

  if (!reservedFor) {
    return NextResponse.redirect(new URL("/hostess?err=Selecciona+fecha+y+hora", baseUrl));
  }

  // If a table was selected, reserve the table for that datetime.
  if (tableId) {
    const { customer } = await findOrCreateCustomer({ name, phone, email });
    await reserveTable({
      name,
      phone,
      email,
      tableId,
      reservedFor: reservedFor.getTime(),
      partySize,
      notes,
      customerId: customer.id
    });
    return NextResponse.redirect(new URL("/hostess?ok=Reservado", baseUrl));
  }

  const { customer } = await findOrCreateCustomer({ name, phone, email });
  await createReservation({
    customerId: customer.id,
    customerNameSnapshot: name,
    tableId: null,
    partySize,
    reservedFor: reservedFor.getTime(),
    status: "RESERVED",
    source: "CALL",
    notes
  });

  return NextResponse.redirect(new URL("/hostess?ok=Reservado", baseUrl));
}
