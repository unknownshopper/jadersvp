import { NextResponse } from "next/server";
import { confirmFreedTable } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

function getBaseUrl(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const env = process.env.APP_BASE_URL;
  if (env && host && !host.includes("localhost") && !host.includes("127.0.0.1")) return env;
  return host ? `${proto}://${host}` : "https://cafejadersvp.web.app";
}

export async function POST(req: Request) {
  try {
    await requireRole(["HOSTESS", "ADMIN", "DIRECTOR"]);

    const baseUrl = getBaseUrl(req);
    const form = await req.formData();

    const tableId = String(form.get("tableId") ?? "").trim();
    if (!tableId) return NextResponse.redirect(new URL("/hostess?err=Falta+mesa", baseUrl));

    await confirmFreedTable({ tableId });

    return NextResponse.redirect(new URL("/hostess?ok=Mesa+liberada", baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo liberar";
    return NextResponse.redirect(new URL(`/hostess?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
