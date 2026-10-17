import { createHash, randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createSurveyVerification } from "@/lib/firestore";
import { sendWhatsAppTemplate, toE164 } from "@/lib/whatsappCloud";

function hashCode(code: string) {
  return createHash("sha256").update(`cj-survey:${code}`).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

    const name = String(body.name ?? "").trim().slice(0, 80);
    const digits = String(body.phone ?? "").replace(/\D/g, "");

    if (!name) return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    if (digits.length < 10) return NextResponse.json({ error: "PHONE_INVALID" }, { status: 400 });

    const phone = `+${digits.length === 10 ? `52${digits}` : digits}`;
    const waPhone = toE164(phone);
    if (!waPhone) return NextResponse.json({ error: "PHONE_INVALID" }, { status: 400 });

    const templateName =
      String(process.env.WHATSAPP_TEMPLATE_VERIFY ?? "").trim() ||
      String(process.env.WHATSAPP_TEMPLATE_REWARD ?? "").trim();
    if (!templateName) {
      console.error("VERIFY_WA_SKIPPED", { reason: "TEMPLATE_NOT_SET" });
      return NextResponse.json({ error: "WHATSAPP_NOT_CONFIGURED" }, { status: 503 });
    }

    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const created = await createSurveyVerification({ name, phone, waPhone, codeHash: hashCode(code) });
    if (created.duplicate) {
      return NextResponse.json({ error: "DUPLICATE" }, { status: 409 });
    }

    const r = await sendWhatsAppTemplate({
      toPhone: waPhone,
      templateName,
      bodyParams: [code],
      buttonUrlParams: [code]
    });
    if (!r.ok) {
      console.error("VERIFY_WA_FAILED", { error: r.error });
      return NextResponse.json({ error: "WHATSAPP_FAILED" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, vid: created.id });
  } catch (err: any) {
    console.error("ENCUESTA_START_FAILED", err?.message ?? err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
