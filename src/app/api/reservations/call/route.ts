import { NextResponse } from "next/server";
import { createCustomer, createReservation, findExistingReservedReservation, reserveTable } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";

function parseLocalDateTime(input: string): Date | null {
  const s = input.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  let createdByRole: string | null = null;
  try {
    const u = await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);
    createdByRole = u?.role ?? null;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  const form = await req.formData();

  const baseUrl = getBaseUrl(req);

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "").trim() || null;
  const partySizeRaw = String(form.get("partySize") ?? "").trim();
  const partySize = partySizeRaw ? Number.parseInt(partySizeRaw, 10) : null;
  const notes = String(form.get("notes") ?? "").trim() || null;
  const reservedForRaw = String(form.get("reservedFor") ?? "").trim();
  const reservedDate = String(form.get("reservedDate") ?? "").trim();
  const reservedTime = String(form.get("reservedTime") ?? "").trim();

  const reservedFor = reservedForRaw
    ? parseLocalDateTime(reservedForRaw)
    : reservedDate && reservedTime
      ? parseLocalDateTime(`${reservedDate} ${reservedTime}`)
      : null;

  const hasPhone = phone.length > 0;
  const hasEmail = Boolean(email);
  if (!name || !reservedFor || (!hasPhone && !hasEmail)) {
    return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
  }

  const customer = await createCustomer({ name, phone, email });

  const existing = await findExistingReservedReservation({
    customerId: customer.id,
    tableId: tableId,
    reservedFor: reservedFor.getTime()
  });
  if (existing.reservationId) {
    return NextResponse.redirect(new URL("/hostess?ok=Ya+exist%C3%ADa+esa+reservaci%C3%B3n", baseUrl));
  }

  try {
    if (tableId) {
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
    } else {
      await createReservation({
        customerId: customer.id,
        tableId: null,
        partySize,
        reservedFor: reservedFor.getTime(),
        status: "RESERVED",
        source: "CALL",
        createdByRole,
        notes
      });
    }
  } catch (e: any) {
    const msg = String(e?.message ?? "Error");
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, baseUrl));
  }

  return NextResponse.redirect(new URL("/hostess?ok=Guardado", baseUrl));
}
