import { NextResponse } from "next/server";
import { createReservation, findExistingReservedReservation, findOrCreateCustomer, reserveTable } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
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
  await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

  const u = await getSessionUser();
  const createdByRole = u?.role ?? null;

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

    const existing = await findExistingReservedReservation({
      customerId: customer.id,
      tableId,
      reservedFor: reservedFor.getTime()
    });
    if (existing.reservationId) {
      return NextResponse.redirect(new URL("/hostess?ok=Ya+exist%C3%ADa+esa+reservaci%C3%B3n", baseUrl));
    }

    await reserveTable({
      name,
      phone,
      email,
      tableId,
      reservedFor: reservedFor.getTime(),
      partySize,
      notes,
      customerId: customer.id,
      createdByRole
    });
    return NextResponse.redirect(new URL("/hostess?ok=Reservado", baseUrl));
  }

  const { customer } = await findOrCreateCustomer({ name, phone, email });

  const existing = await findExistingReservedReservation({
    customerId: customer.id,
    tableId: null,
    reservedFor: reservedFor.getTime()
  });
  if (existing.reservationId) {
    return NextResponse.redirect(new URL("/hostess?ok=Ya+exist%C3%ADa+esa+reservaci%C3%B3n", baseUrl));
  }

  await createReservation({
    customerId: customer.id,
    customerNameSnapshot: name,
    tableId: null,
    partySize,
    reservedFor: reservedFor.getTime(),
    status: "RESERVED",
    source: createdByRole === "CAJA" ? "CALL" : "WALK_IN",
    createdByRole,
    notes
  });

  return NextResponse.redirect(new URL("/hostess?ok=Reservado", baseUrl));
}
