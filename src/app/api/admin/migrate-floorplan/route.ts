import { NextResponse } from "next/server";
import { migrateFloorplanV2, seedUpstairsTables } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";

export async function POST() {
  await requireRole(["ADMIN", "DIRECTOR"]);
  const [migrate, seed] = await Promise.all([migrateFloorplanV2(), seedUpstairsTables()]);
  return NextResponse.json({ migrate, seed });
}
