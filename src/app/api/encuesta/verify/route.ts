import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getSurveyVerification, updateSurveyVerification } from "@/lib/firestore";

function hashCode(code: string) {
  return createHash("sha256").update(`cj-survey:${code}`).digest("hex");
}

const MAX_ATTEMPTS = 8;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

    const vid = String(body.vid ?? "").trim().slice(0, 80);
    const code = String(body.code ?? "").replace(/\D/g, "").slice(0, 10);
    if (!vid || !code) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

    const v = await getSurveyVerification(vid);
    if (!v || v.usedAt) return NextResponse.json({ error: "CODE_INVALID" }, { status: 400 });
    if (v.verifiedAt) return NextResponse.json({ ok: true });
    if (v.expiresAt < Date.now()) return NextResponse.json({ error: "CODE_EXPIRED" }, { status: 410 });
    if (Number(v.attempts ?? 0) >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "CODE_LOCKED" }, { status: 429 });
    }

    if (hashCode(code) !== v.codeHash) {
      await updateSurveyVerification(vid, { attempts: Number(v.attempts ?? 0) + 1 });
      return NextResponse.json({ error: "CODE_INVALID" }, { status: 401 });
    }

    await updateSurveyVerification(vid, { verifiedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("ENCUESTA_VERIFY_FAILED", err?.message ?? err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
