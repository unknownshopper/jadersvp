import { NextResponse } from "next/server";
import { getFirebaseAdminApp } from "@/lib/firebaseAdmin";

const SESSION_COOKIE_NAME = "__session";
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const app = getFirebaseAdminApp();
  if (!app) return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const idToken = String(body?.idToken ?? "");
  if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

  try {
    const sessionCookie = await app.auth().createSessionCookie(idToken, { expiresIn: FIVE_DAYS_MS });

    const res = NextResponse.json({ ok: true, dev: process.env.NODE_ENV !== "production" ? { cookieName: SESSION_COOKIE_NAME } : undefined });
    res.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(FIVE_DAYS_MS / 1000)
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
