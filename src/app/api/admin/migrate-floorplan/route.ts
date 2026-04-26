import { NextResponse } from "next/server";
import { migrateFloorplanV2 } from "@/lib/firestore";

export async function POST() {
  const result = await migrateFloorplanV2();
  return NextResponse.json(result);
}
