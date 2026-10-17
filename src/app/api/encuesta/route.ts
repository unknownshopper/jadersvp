import { NextResponse } from "next/server";
import {
  createStandaloneSurvey,
  getSurveyVerification,
  markStandaloneSurveyReward,
  updateSurveyVerification
} from "@/lib/firestore";
import { sendWhatsAppTemplate } from "@/lib/whatsappCloud";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;
    if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

    const vid = String(body.vid ?? "").trim().slice(0, 80);
    const folio = String(body.folio ?? "").trim().slice(0, 24) || "CJ-SF";

    const answers = Array.isArray(body.answers)
      ? body.answers
          .slice(0, 40)
          .map((a: any) => ({
            q: String(a?.q ?? "").slice(0, 160),
            a: String(a?.a ?? "").slice(0, 160)
          }))
          .filter((a: { q: string; a: string }) => a.q && a.a)
      : [];

    if (!vid) return NextResponse.json({ error: "VERIFY_REQUIRED" }, { status: 400 });
    if (!answers.length) return NextResponse.json({ error: "ANSWERS_REQUIRED" }, { status: 400 });

    const v = await getSurveyVerification(vid);
    // Verified tokens stay redeemable for 24h so an offline-queued submit still lands.
    if (!v || !v.verifiedAt || v.usedAt || v.verifiedAt < Date.now() - 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "VERIFY_REQUIRED" }, { status: 403 });
    }

    const { name, phone, waPhone } = v;

    const npsEntry = answers.find((a: { q: string; a: string }) => a.q === "Recomendación" && /^\d+$/.test(a.a));
    const nps = npsEntry ? String(npsEntry.a) : null;

    const created = await createStandaloneSurvey({ name, phone, waPhone, folio, answers, nps });
    if (created.duplicate) {
      return NextResponse.json({ error: "DUPLICATE" }, { status: 409 });
    }

    await updateSurveyVerification(vid, { usedAt: Date.now() });

    let rewardSent = false;
    const templateName = String(process.env.WHATSAPP_TEMPLATE_REWARD ?? "").trim();
    if (templateName) {
      const r = await sendWhatsAppTemplate({
        toPhone: waPhone,
        templateName,
        bodyParams: [folio],
        buttonUrlParams: [folio]
      });
      rewardSent = r.ok;
      if (!r.ok) {
        console.error("REWARD_WA_FAILED", { id: created.id, error: r.error });
      }
      await markStandaloneSurveyReward({ id: created.id, ok: r.ok, error: r.ok ? null : r.error });
    } else {
      console.log("REWARD_WA_SKIPPED", { reason: "TEMPLATE_NOT_SET", id: created.id });
      await markStandaloneSurveyReward({ id: created.id, ok: false, error: "TEMPLATE_NOT_SET" });
    }

    return NextResponse.json({ ok: true, rewardSent, folio });
  } catch (err: any) {
    console.error("ENCUESTA_POST_FAILED", err?.message ?? err);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
