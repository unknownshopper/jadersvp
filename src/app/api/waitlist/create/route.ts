import { NextResponse } from "next/server";
import { createWaitlistReservation } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";

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
  const notes = String(form.get("notes") ?? "").trim() || null;

  const requestedTablesCountRaw = String(form.get("requestedTablesCount") ?? "").trim();
  const requestedTablesCount = requestedTablesCountRaw ? Number.parseInt(requestedTablesCountRaw, 10) : NaN;

  if (!name || !Number.isFinite(requestedTablesCount) || requestedTablesCount <= 0) {
    return NextResponse.redirect(new URL("/hostess?err=Faltan+datos", baseUrl));
  }

  await createWaitlistReservation({
    name,
    phone,
    email,
    requestedTablesCount,
    notes,
    createdByRole,
    source: createdByRole === "CAJA" ? "CALL" : "WALK_IN"
  });

  return NextResponse.redirect(new URL("/hostess?ok=En+lista+de+espera", baseUrl));
}
