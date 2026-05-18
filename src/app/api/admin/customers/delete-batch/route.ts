import { NextResponse } from "next/server";
import { requireRole } from "@/lib/serverAuth";
import { deleteCustomerAdmin } from "@/lib/firestore";

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
    await requireRole(["ADMIN"]);

    const baseUrl = getBaseUrl(req);
    const body = await req.json().catch(() => null);
    const raw = Array.isArray(body?.customerIds) ? body.customerIds : [];
    const customerIds = raw.map((x: any) => String(x)).filter(Boolean);

    if (customerIds.length === 0) return NextResponse.redirect(new URL("/admin?err=Sin+selección", baseUrl));
    if (customerIds.length > 200) return NextResponse.redirect(new URL("/admin?err=Demasiados+clientes", baseUrl));

    for (const customerId of customerIds) {
      await deleteCustomerAdmin({ customerId });
    }

    return NextResponse.redirect(new URL(`/admin?ok=${encodeURIComponent(`Clientes borrados: ${customerIds.length}`)}`, baseUrl));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo borrar";
    return NextResponse.redirect(new URL(`/admin?err=${encodeURIComponent(msg)}`, getBaseUrl(req)));
  }
}
