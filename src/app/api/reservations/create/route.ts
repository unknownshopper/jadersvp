import { NextResponse } from "next/server";
import { createCustomer, createReservation, reserveTable } from "@/lib/firestore";

function combineLocalDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  // Interpret as local time.
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST(req: Request) {
  const form = await req.formData();

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "").trim() || null;
  const partySizeRaw = String(form.get("partySize") ?? "").trim();
  const partySize = partySizeRaw ? Number.parseInt(partySizeRaw, 10) : null;

  const dateStr = String(form.get("reservedDate") ?? "").trim();
  const timeStr = String(form.get("reservedTime") ?? "").trim();
  const reservedFor = combineLocalDateTime(dateStr, timeStr);

  if (!name || !phone) {
    return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", req.url));
  }

  if (!reservedFor) {
    return NextResponse.redirect(new URL("/hostess?err=Selecciona+fecha+y+hora", req.url));
  }

  // If a table was selected, reserve the table for that datetime.
  if (tableId) {
    await reserveTable({ name, phone, email, tableId, reservedFor: reservedFor.getTime(), partySize });
    return NextResponse.redirect(new URL("/hostess?ok=Reservado", req.url));
  }

  const customer = await createCustomer({ name, phone, email });
  await createReservation({
    customerId: customer.id,
    tableId: null,
    partySize,
    reservedFor: reservedFor.getTime(),
    status: "RESERVED",
    source: "CALL",
    notes: null
  });

  return NextResponse.redirect(new URL("/hostess?ok=Reservado", req.url));
}
