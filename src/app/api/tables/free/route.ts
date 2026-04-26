import { NextResponse } from "next/server";
import { freeTable } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST(req: Request) {
  await requireRole(["CAJA", "ADMIN"]);

  const form = await req.formData();

  const tableId = String(form.get("tableId") ?? "");
  if (!tableId) return NextResponse.redirect(new URL("/caja", req.url));

  await freeTable({ tableId });

  return NextResponse.redirect(new URL("/caja", req.url));
}
