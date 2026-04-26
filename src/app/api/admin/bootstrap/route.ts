import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getFirebaseAdminApp, getFirestore } from "@/lib/firebaseAdmin";

const SESSION_COOKIE_NAME = "__session";

export async function POST(req: Request) {
  const app = getFirebaseAdminApp();
  const db = getFirestore();
  if (!app || !db) return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });

  const bootstrapUid = process.env.BOOTSTRAP_ADMIN_UID;
  if (!bootstrapUid) {
    return NextResponse.json(
      { error: "Missing BOOTSTRAP_ADMIN_UID env var" },
      { status: 500 }
    );
  }

  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  let decoded: any;
  try {
    decoded = await app.auth().verifySessionCookie(sessionCookie, true);
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const uid = String(decoded.uid);
  if (uid !== bootstrapUid) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const users: Array<{ uid: string; role: string; email?: string; shift?: string }> = Array.isArray(body?.users)
    ? body.users
    : [];

  const batch = db.batch();

  // Ensure the caller becomes ADMIN.
  batch.set(
    db.collection("users").doc(uid),
    { role: "ADMIN", updatedAt: Date.now() },
    { merge: true }
  );

  // Optionally seed more users in the same call.
  for (const u of users) {
    const targetUid = String(u?.uid ?? "");
    const role = String(u?.role ?? "");
    if (!targetUid || !role) continue;
    batch.set(
      db.collection("users").doc(targetUid),
      {
        role,
        ...(u.email ? { email: u.email } : {}),
        ...(u.shift ? { shift: u.shift } : {}),
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }

  await batch.commit();

  return NextResponse.json({ ok: true, uid });
}
