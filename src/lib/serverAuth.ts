import { cookies } from "next/headers";
import { getFirebaseAdminApp, getFirestore } from "@/lib/firebaseAdmin";

export type UserRole = "ADMIN" | "DIRECTOR" | "HOSTESS" | "CAJA";

const SESSION_COOKIE_NAME = "__session";

export async function getSessionUser(): Promise<{ uid: string; role: UserRole } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  const app = getFirebaseAdminApp();
  const db = getFirestore();
  if (!app || !db) return null;

  try {
    const decoded = await app.auth().verifySessionCookie(sessionCookie, true);
    const uid = String(decoded.uid);

    const userDoc = await db.collection("users").doc(uid).get();
    const role = String(userDoc.data()?.role ?? "") as UserRole;

    if (role !== "ADMIN" && role !== "DIRECTOR" && role !== "HOSTESS" && role !== "CAJA") {
      return null;
    }

    return { uid, role };
  } catch {
    return null;
  }
}

export async function requireRole(allowed: UserRole[]) {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  if (!allowed.includes(u.role)) throw new Error("FORBIDDEN");
  return u;
}
