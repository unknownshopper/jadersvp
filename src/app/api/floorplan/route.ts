import { NextResponse } from "next/server";
import { getSessionUser, requireRole, type UserRole } from "@/lib/serverAuth";
import { getFirestore } from "@/lib/firebaseAdmin";

const ROLES: UserRole[] = ["HOSTESS", "CAJA", "ADMIN", "DIRECTOR"];

function sanitizePositions(input: any) {
  const clean: { down: Record<string, { x: number; y: number }>; up: Record<string, { x: number; y: number }> } = {
    down: {},
    up: {}
  };
  for (const floor of ["down", "up"] as const) {
    const src = input?.[floor];
    if (!src || typeof src !== "object") continue;
    for (const [label, p] of Object.entries(src)) {
      const x = Number((p as any)?.x);
      const y = Number((p as any)?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const key = String(label).slice(0, 8);
      clean[floor][key] = {
        x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)),
        y: Math.min(100, Math.max(0, Math.round(y * 10) / 10))
      };
    }
  }
  return clean;
}

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  const db = getFirestore();
  if (!db) return NextResponse.json({ positions: null });

  const doc = await db.collection("config").doc("floorplan").get();
  const data = doc.exists ? (doc.data() as any) : null;

  return NextResponse.json({
    positions: data?.positions ?? null,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : null,
    updatedByRole: data?.updatedByRole ?? null
  });
}

export async function POST(req: Request) {
  let role: string | null = null;
  try {
    const u = await requireRole(ROLES);
    role = u?.role ?? null;
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  const db = getFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const positions = sanitizePositions(body?.positions);
  if (!Object.keys(positions.down).length && !Object.keys(positions.up).length) {
    return NextResponse.json({ error: "Posiciones inválidas" }, { status: 400 });
  }

  await db
    .collection("config")
    .doc("floorplan")
    .set(
      {
        positions,
        updatedAt: Date.now(),
        updatedByRole: role
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true });
}
