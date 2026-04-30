import { NextResponse } from "next/server";
import { freeTable } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST(req: Request) {
  try {
    await requireRole(["CAJA", "ADMIN"]);

    const form = await req.formData();

    const tableId = String(form.get("tableId") ?? "");
    if (!tableId) return NextResponse.redirect(new URL("/caja?err=Falta+mesa", req.url));

    await freeTable({ tableId });

    return NextResponse.redirect(new URL("/caja?ok=Liberada", req.url));
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "No se pudo liberar";
    return NextResponse.redirect(new URL(`/caja?err=${encodeURIComponent(msg)}`, req.url));
  }
}
