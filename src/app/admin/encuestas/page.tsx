import { redirect } from "next/navigation";
import { requireRole } from "@/lib/serverAuth";
import { getSurveyConfig, listSurveysWithCustomer, type SurveyResponse } from "@/lib/firestore";
import { formatDateDDMMYY } from "@/lib/dateFormat";

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
    .normalize("NFD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function yn(v: string) {
  const t = normalizeText(v);
  if (t === "si" || t === "s" || t === "yes") return "si";
  if (t === "no" || t === "n") return "no";
  return "";
}

function ymdMexicoCity(ms: number) {
  const s = new Date(ms).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  // es-MX is typically DD/MM/YYYY
  const parts = s.split("/").map((x) => x.padStart(2, "0"));
  if (parts.length !== 3) return s;
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm}-${dd}`;
}

export default async function AdminEncuestasVisorPage({
  searchParams
}: {
  searchParams?: { range?: string; bucket?: string; onlyNoRecommend?: string; hasText?: string };
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
  const allSurveys = rows.map((r) => r.survey);

  const bucketFilter = String(searchParams?.bucket ?? "all");
  const onlyNoRecommend = String(searchParams?.onlyNoRecommend ?? "0") === "1";
  const hasText = String(searchParams?.hasText ?? "0") === "1";

  const totalAll = allSurveys.length;
  const bucketFor = (s: SurveyResponse): "buena" | "regular" | "mala" => {
    const answers = (s.answers ?? {}) as Record<string, string>;
    const ynKeys = Object.keys(answers).filter((k) => /^q_\d+$/.test(k));

    // If there are survey questions and at least one yes/no answer, compute from yes/no only.
    if (questions.length && ynKeys.length) {
      let answered = 0;
      let yes = 0;
      for (const k of ynKeys) {
        const v = yn(String(answers[k] ?? ""));
        if (v !== "si" && v !== "no") continue;
        answered += 1;
        if (v === "si") yes += 1;
      }

      // Very basic scoring: SI = +1, NO = 0
      // All SI => Buena, all NO => Mala, mixed => Regular
      if (answered) {
        if (yes === answered) return "buena";
        if (yes === 0) return "mala";
        return "regular";
      }
    }

    // Fallback for older surveys or if questions are not configured.
    if (s.rating >= 4) return "buena";
    if (s.rating === 3) return "regular";
    return "mala";
  };

  const recommendIdx =
    typeof cfg.recommendQuestionIndex === "number" && cfg.recommendQuestionIndex != null
      ? cfg.recommendQuestionIndex
      : questions.findIndex((q) => normalizeText(q).includes("recomendar"));
  const recommendKey = recommendIdx >= 0 ? `q_${recommendIdx + 1}` : "";

  const surveys = allSurveys.filter((s) => {
    const b = bucketFor(s);
    if (bucketFilter !== "all" && b !== bucketFilter) return false;
    if (hasText) {
      const has = Boolean(String(s.comment ?? "").trim()) || Boolean(String(s.answers?.["rating_detail"] ?? "").trim());
      if (!has) return false;
    }
    if (onlyNoRecommend && recommendKey) {
      const v = yn(String(s.answers?.[recommendKey] ?? ""));
      if (v !== "no") return false;
    }
    return true;
  });

  const total = surveys.length;
  const buenas = surveys.filter((s: SurveyResponse) => bucketFor(s) === "buena").length;
  const regulares = surveys.filter((s: SurveyResponse) => bucketFor(s) === "regular").length;
  const malas = surveys.filter((s: SurveyResponse) => bucketFor(s) === "mala").length;

  const recomendarNo = recommendKey ? surveys.filter((s: SurveyResponse) => yn(String(s.answers?.[recommendKey] ?? "")) === "no").length : 0;
  const recomendarSi = recommendKey ? surveys.filter((s: SurveyResponse) => yn(String(s.answers?.[recommendKey] ?? "")) === "si").length : 0;
  const recomendarAnswered = recommendKey ? recomendarNo + recomendarSi : 0;
  const recomendarPct = recomendarAnswered ? Math.round((recomendarSi / recomendarAnswered) * 100) : 0;

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
    const yes = surveys.filter((s: SurveyResponse) => yn(String(s.answers?.[key] ?? "")) === "si").length;
    const no = surveys.filter((s: SurveyResponse) => yn(String(s.answers?.[key] ?? "")) === "no").length;
    const answered = yes + no;
    const pctYes = answered ? Math.round((yes / answered) * 100) : 0;
    return { q, key, yes, no, answered, pctYes };
  });

  const byDay = new Map<string, { day: string; total: number; si: number; no: number; buena: number; regular: number; mala: number }>();
  for (const s of surveys) {
    const day = ymdMexicoCity(s.createdAt);
    const rec = byDay.get(day) ?? { day, total: 0, si: 0, no: 0, buena: 0, regular: 0, mala: 0 };
    rec.total += 1;
    const b = bucketFor(s);
    if (b === "buena") rec.buena += 1;
    if (b === "regular") rec.regular += 1;
    if (b === "mala") rec.mala += 1;
    if (recommendKey) {
      const v = yn(String(s.answers?.[recommendKey] ?? ""));
      if (v === "si") rec.si += 1;
      if (v === "no") rec.no += 1;
    }
    byDay.set(day, rec);
  }
  const days = Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, range === "all" ? 30 : range === "month" ? 30 : 14);

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 980 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Visor de Encuestas</h2>
        <div className="small">Dashboard + análisis (Sí/No + comentarios).</div>
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

        <div className="row" style={{ justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 10 }}>
          <div className="small">Filtros:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=all&onlyNoRecommend=${onlyNoRecommend ? 1 : 0}&hasText=${hasText ? 1 : 0}`}
              style={{ opacity: bucketFilter === "all" ? 1 : 0.7 }}
            >
              Todas
            </a>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=buena&onlyNoRecommend=${onlyNoRecommend ? 1 : 0}&hasText=${hasText ? 1 : 0}`}
              style={{ opacity: bucketFilter === "buena" ? 1 : 0.7 }}
            >
              Buena
            </a>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=regular&onlyNoRecommend=${onlyNoRecommend ? 1 : 0}&hasText=${hasText ? 1 : 0}`}
              style={{ opacity: bucketFilter === "regular" ? 1 : 0.7 }}
            >
              Regular
            </a>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=mala&onlyNoRecommend=${onlyNoRecommend ? 1 : 0}&hasText=${hasText ? 1 : 0}`}
              style={{ opacity: bucketFilter === "mala" ? 1 : 0.7 }}
            >
              Mala
            </a>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=${bucketFilter}&onlyNoRecommend=${onlyNoRecommend ? 0 : 1}&hasText=${hasText ? 1 : 0}`}
              style={{ opacity: onlyNoRecommend ? 1 : 0.7 }}
            >
              Solo ❌ recomendaría
            </a>
            <a
              className="badge"
              href={`/admin/encuestas?range=${range}&bucket=${bucketFilter}&onlyNoRecommend=${onlyNoRecommend ? 1 : 0}&hasText=${hasText ? 0 : 1}`}
              style={{ opacity: hasText ? 1 : 0.7 }}
            >
              Solo con texto
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="small">Respuestas (filtradas)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{total}</div>
          <div className="small" style={{ opacity: 0.7 }}>
            Total en rango: {totalAll}
          </div>
        </div>
        <div className="card">
          <div className="small">% Recomendaría (✅)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{recommendKey ? `${recomendarPct}%` : "—"}</div>
          <div className="small" style={{ opacity: 0.7 }}>
            {recommendKey ? `✅ ${recomendarSi} · ❌ ${recomendarNo}` : "Configura recommendQuestionIndex"}
          </div>
        </div>
        <div className="card">
          <div className="small">Alertas (❌ recomendaría)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{recommendKey ? recomendarNo : "—"}</div>
          <div className="small" style={{ opacity: 0.7 }}>
            {recommendKey ? `Respondidas: ${recomendarAnswered}` : ""}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tendencia reciente</h3>
        {days.length === 0 ? <div className="small">Sin datos</div> : null}
        <div className="grid" style={{ gap: 10 }}>
          {days.map((d) => {
            const ans = d.si + d.no;
            const pct = ans ? Math.round((d.si / ans) * 100) : 0;
            return (
              <div key={d.day} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{d.day}</div>
                  <div className="small">
                    {d.total} resp · Buena {d.buena} · Regular {d.regular} · Mala {d.mala}
                    {recommendKey ? ` · %✅ ${pct}%` : ""}
                  </div>
                </div>
              </div>
            );
          })}
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
                  <div className="small">{formatDateDDMMYY(m.createdAt)}</div>
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
                <span className="badge">%✅: {p.answered ? `${p.pctYes}%` : "—"}</span>
                <span className="badge">✅ Sí: {p.yes}</span>
                <span className="badge">❌ No: {p.no}</span>
                <span className="badge">Resp: {p.answered}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>
          Ver respuestas por persona ({responders.length})
        </summary>
        <div className="grid" style={{ gap: 12, marginTop: 12 }}>
          {responders.length === 0 ? <div className="small">Sin respuestas</div> : null}
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
                        <div className="small">{formatDateDDMMYY(s.createdAt)}</div>
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
      </details>
    </div>
  );
}
