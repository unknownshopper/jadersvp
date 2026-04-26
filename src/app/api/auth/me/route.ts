import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/serverAuth";
import { cookies } from "next/headers";
import { getFirebaseAdminApp, getFirestore } from "@/lib/firebaseAdmin";

export async function GET() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  const hasSessionCookie = Boolean(sessionCookie);
  const u = await getSessionUser();

  if (!u) {
    if (process.env.NODE_ENV !== "production" && sessionCookie) {
      try {
        const app = getFirebaseAdminApp();
        const db = getFirestore();
        if (app && db) {
          const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
          const uid = String(decoded.uid);
          const userDoc = await db.collection("users").doc(uid).get();
          const roleRaw = userDoc.exists ? String(userDoc.data()?.role ?? "") : "";
          const envProjectId = process.env.FIREBASE_PROJECT_ID;
          const appProjectId = (app as any)?.options?.credential?.projectId ?? (app as any)?.options?.projectId;
          return NextResponse.json({
            user: null,
            hasSessionCookie,
            debug: { uid, usersDocExists: userDoc.exists, roleRaw, envProjectId, appProjectId }
          });
        }
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ user: null, hasSessionCookie });
  }

  if (process.env.NODE_ENV !== "production") {
    const app = getFirebaseAdminApp();
    const envProjectId = process.env.FIREBASE_PROJECT_ID;
    const appProjectId = (app as any)?.options?.credential?.projectId ?? (app as any)?.options?.projectId;
    return NextResponse.json({ user: u, hasSessionCookie, debug: { envProjectId, appProjectId } });
  }

  return NextResponse.json({ user: u, hasSessionCookie });
}
