import { NextResponse } from "next/server";
import { findCustomerByContact, customerVisitStats } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function GET(req: Request) {
  try {
    await requireRole(["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"]);

    const url = new URL(req.url);
    const phone = String(url.searchParams.get("phone") ?? "").trim();
    const email = String(url.searchParams.get("email") ?? "").trim();
    if (!phone && !email) {
      return NextResponse.json({ customer: null });
    }

    const customer = await findCustomerByContact({ phone, email });
    if (!customer) return NextResponse.json({ customer: null });

    const stats = await customerVisitStats(customer.id);

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        visitsCount: stats.visitsCount,
        lastVisitAt: stats.lastVisitAt
      }
    });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Error";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
