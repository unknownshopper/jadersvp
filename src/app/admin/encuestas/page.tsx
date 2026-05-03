import { redirect } from "next/navigation";
import { requireRole } from "@/lib/serverAuth";
import { getSurveyConfig, listSurveysWithCustomer, type SurveyResponse } from "@/lib/firestore";

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function barWidth(count: number, max: number) {
  return `${Math.round(clamp01(max ? count / max : 0) * 100)}%`;
}

function normalizeText(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export default async function AdminEncuestasVisorPage({
  searchParams
}: {
  searchParams?: { range?: string };
}) {
  try {
    await requireRole(["ADMIN", "DIRECTOR"]);
  } catch {
    redirect("/login");
  }

  const cfg = await getSurveyConfig();
  const questions = (cfg.questions ?? []).map((q) => String(q).trim()).filter(Boolean);

  const now = Date.now();
  const range = (searchParams?.range ?? "week") as "week" | "month" | "all";
  const from =
    range === "month"
      ? now - 30 * 24 * 60 * 60 * 1000
      : range === "week"
        ? now - 7 * 24 * 60 * 60 * 1000
        : undefined;
  const rows = await listSurveysWithCustomer({ limit: 800, fromMs: from });
  const surveys = rows.map((r) => r.survey);

  const total = surveys.length;
  const buenas = surveys.filter((s: SurveyResponse) => s.rating >= 4).length;
  const regulares = surveys.filter((s: SurveyResponse) => s.rating === 3).length;
  const malas = surveys.filter((s: SurveyResponse) => s.rating <= 2).length;

  const recommendIdx = questions.findIndex((q) => normalizeText(q).includes("recomendar"));
  const recommendKey = recommendIdx >= 0 ? `q_${recommendIdx + 1}` : "";
  const recomendarNo = recommendKey
    ? surveys.filter((s: SurveyResponse) => normalizeText(String(s.answers?.[recommendKey] ?? "")) === "no").length
    : 0;
  const recomendarSi = recommendKey
    ? surveys.filter((s: SurveyResponse) => normalizeText(String(s.answers?.[recommendKey] ?? "")) === "si").length
    : 0;

  const maxBucket = Math.max(1, buenas, regulares, malas);

  const qNoGustoIdx = questions.findIndex((q) => normalizeText(q).includes("qué no") && normalizeText(q).includes("gust"));
  const qNoGustoKey = qNoGustoIdx >= 0 ? `q_${qNoGustoIdx + 1}_detail` : "";

  const wordCounts = new Map<string, number>();
  const textSnippets: Array<{ source: string; text: string; createdAt: number }> = [];
  const stop = new Set([
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "y",
    "o",
    "de",
    "del",
    "que",
    "en",
    "con",
    "por",
    "para",
    "muy",
    "me",
    "nos",
    "su",
    "mi",
    "tu",
    "al",
    "a"
  ]);

  for (const s of surveys) {
    const addText = (source: string, txt: string) => {
      const t = String(txt ?? "").trim();
      if (!t) return;
      textSnippets.push({ source, text: t, createdAt: s.createdAt });
      const tokens = normalizeText(t)
        .replace(/[^a-záéíóúñ\s]/g, " ")
        .split(" ")
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => x.length >= 4)
        .filter((x) => !stop.has(x));
      for (const x of tokens) wordCounts.set(x, (wordCounts.get(x) ?? 0) + 1);
    };

    if (s.comment) addText("Comentario", String(s.comment));
    const ratingDetail = String(s.answers?.["rating_detail"] ?? "");
    if (ratingDetail) addText("Calificación", ratingDetail);

    if (qNoGustoKey) {
      const txt = String(s.answers?.[qNoGustoKey] ?? "");
      if (txt) addText("Qué no le gustó", txt);
    }

    for (const [k, v] of Object.entries(s.answers ?? {})) {
      if (!k.endsWith("_detail")) continue;
      if (k === "rating_detail") continue;
      if (qNoGustoKey && k === qNoGustoKey) continue;
      const txt = String(v ?? "");
      if (!txt) continue;
      addText(k.replace(/_detail$/, ""), txt);
    }
  }

  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const recentSnippets = textSnippets
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12);

  const byResponder = new Map<
    string,
    {
      key: string;
      name: string;
      phone: string;
      email: string;
      items: Array<{ id: string; createdAt: number; rating: number; answers: Record<string, string> | null; comment?: string | null }>;
    }
  >();

  for (const r of rows) {
    const c = r.customer;
    const phone = c?.phone ? String(c.phone) : "";
    const email = c?.email ? String(c.email) : "";
    const groupKey = email || phone || (c?.id ? `customer:${c.id}` : `reservation:${r.survey.reservationId}`);
    const existing = byResponder.get(groupKey);
    const rec = existing ?? {
      key: groupKey,
      name: c?.name ? String(c.name) : "(Sin nombre)",
      phone,
      email,
      items: [] as Array<{
        id: string;
        createdAt: number;
        rating: number;
        answers: Record<string, string> | null;
        comment?: string | null;
      }>
    };
    rec.items.push({
      id: r.survey.id,
      createdAt: r.survey.createdAt,
      rating: r.survey.rating,
      answers: (r.survey.answers as any) ?? null,
      comment: r.survey.comment ?? null
    });
    byResponder.set(groupKey, rec);
  }

  const responders = Array.from(byResponder.values()).sort((a, b) => {
    const aTs = Math.max(...a.items.map((i) => i.createdAt));
    const bTs = Math.max(...b.items.map((i) => i.createdAt));
    return bTs - aTs;
  });

  const perQuestion = questions.map((q, idx) => {
    const key = `q_${idx + 1}`;
    const yes = surveys.filter((s: SurveyResponse) => normalizeText(String(s.answers?.[key] ?? "")) === "si").length;
    const no = surveys.filter((s: SurveyResponse) => normalizeText(String(s.answers?.[key] ?? "")) === "no").length;
    return { q, key, yes, no };
  });

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 980 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Visor de Encuestas</h2>
        <div className="small">Respuestas segmentadas por teléfono/correo (quién responde) y sus respuestas completas.</div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <div className="small">Rango:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="badge" href="/admin/encuestas?range=week" style={{ opacity: range === "week" ? 1 : 0.7 }}>
              Semana
            </a>
            <a className="badge" href="/admin/encuestas?range=month" style={{ opacity: range === "month" ? 1 : 0.7 }}>
              Mes
            </a>
            <a className="badge" href="/admin/encuestas?range=all" style={{ opacity: range === "all" ? 1 : 0.7 }}>
              Todo
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="small">Respuestas (últimas {total})</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{total}</div>
        </div>
        <div className="card">
          <div className="small">Recomendaría (✅)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{recomendarSi}</div>
        </div>
        <div className="card">
          <div className="small">No recomendaría (❌)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{recomendarNo}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Calificación general</h3>
        <div className="grid" style={{ gap: 10 }}>
          <div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>Buena</div>
              <div className="small">{buenas}</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(22, 163, 74, 0.12)", overflow: "hidden" }}>
              <div style={{ height: 10, width: barWidth(buenas, maxBucket), background: "rgba(34, 197, 94, 0.75)" }} />
            </div>
          </div>
          <div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>Regular</div>
              <div className="small">{regulares}</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(245, 158, 11, 0.14)", overflow: "hidden" }}>
              <div style={{ height: 10, width: barWidth(regulares, maxBucket), background: "rgba(245, 158, 11, 0.72)" }} />
            </div>
          </div>
          <div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>Mala</div>
              <div className="small">{malas}</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(239, 68, 68, 0.10)", overflow: "hidden" }}>
              <div style={{ height: 10, width: barWidth(malas, maxBucket), background: "rgba(239, 68, 68, 0.65)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Top molestias (recientes)</h3>
        {topWords.length === 0 ? <div className="small">Aún no hay suficientes textos para analizar.</div> : null}
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {topWords.map(([w, n]) => (
            <span key={w} className="badge">
              {w}: {n}
            </span>
          ))}
        </div>

        {recentSnippets.length > 0 ? (
          <div className="grid" style={{ gap: 10, marginTop: 12 }}>
            {recentSnippets.map((m, i) => (
              <div key={`${m.createdAt}_${i}`} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 900 }}>{m.source}</div>
                  <div className="small">{new Date(m.createdAt).toLocaleString()}</div>
                </div>
                <div style={{ marginTop: 8 }}>{m.text}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Por pregunta (✅/❌)</h3>
        {perQuestion.length === 0 ? <div className="small">Sin preguntas configuradas.</div> : null}
        <div className="grid" style={{ gap: 10 }}>
          {perQuestion.map((p) => (
            <div key={p.key} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ fontWeight: 900 }}>{p.q}</div>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <span className="badge">✅ Sí: {p.yes}</span>
                <span className="badge">❌ No: {p.no}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Respuestas por persona</h3>
        {responders.length === 0 ? <div className="small">Sin respuestas</div> : null}
        <div className="grid" style={{ gap: 12 }}>
          {responders.map((r) => (
            <details key={r.key} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>
                {r.name}
                {r.phone ? ` · ${r.phone}` : ""}
                {r.email ? ` · ${r.email}` : ""}
                {` · ${r.items.length} respuesta(s)`}
              </summary>
              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
                {r.items
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((s) => (
                    <div key={s.id} className="card" style={{ background: "rgba(255, 255, 255, 0.8)" }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 900 }}>Rating: {s.rating}</div>
                        <div className="small">{new Date(s.createdAt).toLocaleString()}</div>
                      </div>

                      {s.answers?.["rating_detail"] ? (
                        <div style={{ marginTop: 8 }}>
                          <div className="small" style={{ fontWeight: 900 }}>
                            Detalle calificación
                          </div>
                          <div>{String(s.answers["rating_detail"])}</div>
                        </div>
                      ) : null}

                      {questions.length ? (
                        <div className="grid" style={{ gap: 8, marginTop: 10 }}>
                          {questions.map((q, idx) => {
                            const key = `q_${idx + 1}`;
                            const val = s.answers ? String(s.answers[key] ?? "") : "";
                            const det = s.answers ? String(s.answers[`${key}_detail`] ?? "") : "";
                            if (!val && !det) return null;
                            return (
                              <div key={key}>
                                <div className="small" style={{ fontWeight: 900 }}>
                                  {q}
                                </div>
                                <div>{val ? val.toUpperCase() : ""}</div>
                                {det ? <div className="small">{det}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {s.comment ? (
                        <div style={{ marginTop: 10 }}>
                          <div className="small" style={{ fontWeight: 900 }}>
                            Comentarios
                          </div>
                          <div>{s.comment}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
