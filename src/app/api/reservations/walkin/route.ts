import { NextResponse } from "next/server";
import { walkInAssign } from "@/lib/firestore";

export async function POST(req: Request) {
  const form = await req.formData();

  const name = String(form.get("name") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const tableId = String(form.get("tableId") ?? "");

  if (!name || !phone || !tableId) {
    return NextResponse.redirect(new URL("/hostess", req.url));
  }

  await walkInAssign({ name, phone, email, tableId });

  return NextResponse.redirect(new URL("/hostess", req.url));
}
