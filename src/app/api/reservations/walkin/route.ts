import { NextResponse } from "next/server";
import { findOrCreateCustomer, walkInAssign } from "@/lib/firestore";

export async function POST(req: Request) {
  const form = await req.formData();

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "");

  if (!name || !tableId) {
    return NextResponse.redirect(new URL("/hostess", req.url));
  }

  const { customer } = await findOrCreateCustomer({ name, phone, email });
  await walkInAssign({ name, phone, email, tableId, customerId: customer.id });

  return NextResponse.redirect(new URL("/hostess", req.url));
}
