import { NextResponse } from "next/server";
import { createCustomer, createReservation, findExistingReservedReservation, reserveTables, reserveTable } from "@/lib/firestore";
import { getFirestore } from "@/lib/firebaseAdmin";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { sendWhatsAppTemplate } from "@/lib/whatsappCloud";

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
    tableId: effectiveTableIds[0] ?? null,
    reservedFor: reservedFor.getTime()
  });
  if (existing.reservationId) {
    return NextResponse.redirect(new URL("/hostess?ok=Ya+exist%C3%ADa+esa+reservaci%C3%B3n", baseUrl));
  }

  // Avoid double booking any of the selected tables.
  for (const tid of effectiveTableIds) {
    const ex = await findExistingReservedReservation({
      customerId: null,
      tableId: tid,
      reservedFor: reservedFor.getTime()
    });
    if (ex.reservationId) {
      return NextResponse.redirect(new URL("/hostess?err=Mesa+no+disponible+en+ese+horario", baseUrl));
    }
  }

  try {
    if (effectiveTableIds.length > 0) {
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
        if (effectiveTableIds.length > 3) {
          return NextResponse.redirect(new URL("/hostess?err=M%C3%A1ximo+3+mesas", baseUrl));
        }
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
    } else {
      await createReservation({
        customerId: customer.id,
        customerNameSnapshot: name,
        tableId: null,
        tableIds: null,
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

  const templateName = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION ?? "").trim();
  const callTemplateName = String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_CALL ?? "").trim() || templateName;
  if (callTemplateName && customer.phone) {
    const headerImageUrl =
      String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_CALL_HEADER_IMAGE_URL ?? "").trim() ||
      String(process.env.WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL ?? "").trim();
    const when = new Date(reservedFor.getTime());
    const dateStr = when.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
    const timeStr = when.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    let tablesStr = "";
    try {
      const db = getFirestore();
      if (db && effectiveTableIds.length > 0) {
        const tableDocs = await Promise.all(effectiveTableIds.map((tid) => db.collection("tables").doc(tid).get()));
        const tableNames = tableDocs
          .map((d, i) => {
            const rawName = d.exists ? String((d.data() as any)?.name ?? "").trim() : "";
            return rawName || effectiveTableIds[i];
          })
          .filter(Boolean);
        tablesStr = tableNames.join(", ");
      }
    } catch {
      // non-blocking
    }
    console.log("WHATSAPP_CONFIRMATION_ATTEMPT", {
      toPhone: customer.phone,
      templateName: callTemplateName,
      hasHeaderImageUrl: Boolean(headerImageUrl)
    });
    try {
      const r = await sendWhatsAppTemplate({
        toPhone: customer.phone,
        templateName: callTemplateName,
        bodyParams: [name, dateStr, timeStr, tablesStr],
        headerImageUrl
      });
      if (!r.ok) console.error("WHATSAPP_CONFIRMATION_FAILED", r.error);
      else console.log("WHATSAPP_CONFIRMATION_ACCEPTED", { messageId: r.messageId });
    } catch {
      // non-blocking
    }
  }

  return NextResponse.redirect(new URL("/hostess?ok=Guardado", baseUrl));
}
