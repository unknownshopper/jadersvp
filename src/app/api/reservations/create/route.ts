import { NextResponse } from "next/server";
import { createReservation, findExistingReservedReservation, findOrCreateCustomer, reserveTables, reserveTable } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value] as const));
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );

  // If `date` is an instant in UTC, `asIfUtc` is the same wall-clock values interpreted as UTC.
  // Their difference is the timezone offset at that instant.
  return asIfUtc - date.getTime();
}

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
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(timeStr).trim().match(/^(\d{2}):(\d{2})$/);
  if (!m || !t) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(t[1]);
  const mm = Number(t[2]);
  const tz = "America/Mexico_City";

  // Interpret (y,mo,d,hh,mm) as a wall-clock time in `tz`, and convert to an absolute instant.
  // We start with a UTC guess and then correct it by the timezone offset.
  const utcGuess = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  const offset1 = getTimeZoneOffsetMs(new Date(utcGuess), tz);
  let utcMs = utcGuess - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(utcMs), tz);
  if (offset2 !== offset1) {
    utcMs = utcGuess - offset2;
  }

  const dt = new Date(utcMs);
  return Number.isNaN(dt.getTime()) ? null : dt;
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
  const tableIds = Array.from(
    new Set(
      (form.getAll("tableIds") ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean)
    )
  );
  const effectiveTableIds = tableIds.length > 0 ? tableIds : tableId ? [tableId] : [];
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

  // If a table was selected, reserve the table(s) for that datetime.
  if (effectiveTableIds.length > 0) {
    const { customer } = await findOrCreateCustomer({ name, phone, email });

    const existing = await findExistingReservedReservation({
      customerId: customer.id,
      tableId: effectiveTableIds[0] ?? null,
      reservedFor: reservedFor.getTime()
    });
    if (existing.reservationId) {
      return NextResponse.redirect(new URL("/hostess?ok=Ya+exist%C3%ADa+esa+reservaci%C3%B3n", baseUrl));
    }

    if (effectiveTableIds.length === 1) {
      await reserveTable({
        name,
        phone,
        email,
        tableId: effectiveTableIds[0],
        reservedFor: reservedFor.getTime(),
        partySize,
        notes,
        customerId: customer.id,
        createdByRole
      });
    } else {
      await reserveTables({
        name,
        phone,
        email,
        tableIds: effectiveTableIds,
        reservedFor: reservedFor.getTime(),
        partySize,
        notes,
        customerId: customer.id,
        createdByRole
      });
    }
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
    tableIds: null,
    partySize,
    reservedFor: reservedFor.getTime(),
    status: "RESERVED",
    source: createdByRole === "CAJA" ? "CALL" : "WALK_IN",
    createdByRole,
    notes
  });

  return NextResponse.redirect(new URL("/hostess?ok=Reservado", baseUrl));
}
