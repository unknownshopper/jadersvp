import { NextResponse } from "next/server";
import { seatReservation } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST(req: Request) {
  await requireRole(["HOSTESS", "ADMIN"]);

  const form = await req.formData();

  const reservationId = String(form.get("reservationId") ?? "");
  const tableId = String(form.get("tableId") ?? "");

  if (!reservationId || !tableId) {
    return NextResponse.redirect(new URL("/hostess", req.url));
  }

  await seatReservation({ reservationId, tableId });

  return NextResponse.redirect(new URL("/hostess", req.url));
}
