import { NextResponse } from "next/server";
import { migrateFloorplanV2, seedUpstairsTables } from "@/lib/firestore";

export async function POST() {
  const [migrate, seed] = await Promise.all([migrateFloorplanV2(), seedUpstairsTables()]);
  return NextResponse.json({ migrate, seed });
}
