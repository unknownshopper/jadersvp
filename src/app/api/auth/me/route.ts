import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/serverAuth";
import { cookies } from "next/headers";
import { getFirebaseAdminApp, getFirestore } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get("__session")?.value;
  const hasSessionCookie = Boolean(sessionCookie);
  const u = await getSessionUser();

  const noStoreHeaders = { "Cache-Control": "no-store" };
  const wantDebug = hasSessionCookie && new URL(req.url).searchParams.get("debug") === "1";

  if (!u) {
    if ((process.env.NODE_ENV !== "production" || wantDebug) && sessionCookie) {
      try {
        const app = getFirebaseAdminApp();
        const db = getFirestore();
        if (app && db) {
          const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
          const uid = String(decoded.uid);
          const userDoc = await db.collection("users").doc(uid).get();
          const roleRaw = userDoc.exists ? String(userDoc.data()?.role ?? "") : "";
          const sample = await db.collection("users").limit(5).get();
          const usersSampleIds = sample.docs.map((d: any) => String(d.id));
          const envProjectId = process.env.FIREBASE_PROJECT_ID;
          const appProjectId = (app as any)?.options?.credential?.projectId ?? (app as any)?.options?.projectId;
          return NextResponse.json({
            user: null,
            hasSessionCookie,
            debug: { uid, usersDocExists: userDoc.exists, roleRaw, usersSampleIds, envProjectId, appProjectId }
          }, { headers: noStoreHeaders });
        }
      } catch {
        // ignore
      }
    }
    return NextResponse.json({ user: null, hasSessionCookie }, { headers: noStoreHeaders });
  }

  if (process.env.NODE_ENV !== "production" || wantDebug) {
    const app = getFirebaseAdminApp();
    const envProjectId = process.env.FIREBASE_PROJECT_ID;
    const appProjectId = (app as any)?.options?.credential?.projectId ?? (app as any)?.options?.projectId;
    return NextResponse.json({ user: u, hasSessionCookie, debug: { envProjectId, appProjectId } }, { headers: noStoreHeaders });
  }

  return NextResponse.json({ user: u, hasSessionCookie }, { headers: noStoreHeaders });
}
