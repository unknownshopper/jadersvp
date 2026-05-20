import { NextResponse } from "next/server";
import crypto from "crypto";
import { getFirestore } from "@/lib/firebaseAdmin";

function getEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function timingSafeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignature(rawBody: Buffer, appSecret: string, signatureHeader: string | null) {
  if (!appSecret) return { ok: true as const, reason: "NO_APP_SECRET" };
  if (!signatureHeader) return { ok: false as const, reason: "MISSING_SIGNATURE" };

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return { ok: false as const, reason: "BAD_SIGNATURE_FORMAT" };

  const provided = signatureHeader.slice(prefix.length).trim();
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const ok = timingSafeEqualHex(provided, expected);
  return ok ? ({ ok: true as const, reason: "OK" } as const) : ({ ok: false as const, reason: "INVALID_SIGNATURE" } as const);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const verifyToken = getEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  if (!verifyToken) {
    return NextResponse.json({ ok: false, error: "WHATSAPP_WEBHOOK_VERIFY_TOKEN_MISSING" }, { status: 500 });
  }

  console.log("WHATSAPP_WEBHOOK_VERIFY", {
    mode,
    hasToken: Boolean(token),
    tokenMatch: Boolean(token) && token === verifyToken,
    hasChallenge: Boolean(challenge)
  });

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());

  const appSecret = getEnv("WHATSAPP_APP_SECRET");
  const signature = req.headers.get("x-hub-signature-256");
  const sig = verifySignature(raw, appSecret, signature);
  if (!sig.ok) {
    console.error("WHATSAPP_WEBHOOK_SIGNATURE_REJECTED", sig.reason);
    return NextResponse.json({ ok: false, error: sig.reason }, { status: 401 });
  }

  let json: any = null;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    console.error("WHATSAPP_WEBHOOK_BAD_JSON");
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
  }

  try {
    const db = getFirestore();
    if (db) {
      await db.collection("whatsappWebhookEvents").add({
        createdAt: Date.now(),
        signatureStatus: sig.reason,
        payload: json
      });
    }
  } catch (e: any) {
    console.error("WHATSAPP_WEBHOOK_FIRESTORE_WRITE_FAILED", String(e?.message ?? e));
  }

  try {
    const entries = Array.isArray(json?.entry) ? json.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? null;
        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const s of statuses) {
          const id = s?.id ? String(s.id) : null;
          const status = s?.status ? String(s.status) : null;
          const ts = s?.timestamp ? String(s.timestamp) : null;
          const recipientId = s?.recipient_id ? String(s.recipient_id) : null;
          const error = Array.isArray(s?.errors) && s.errors[0] ? s.errors[0] : null;
          console.log("WHATSAPP_STATUS", { id, status, ts, recipientId, error });
        }
      }
    }
  } catch (e: any) {
    console.error("WHATSAPP_WEBHOOK_PARSE_ERROR", String(e?.message ?? e));
  }

  return NextResponse.json({ ok: true });
}
