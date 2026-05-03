import { redirect } from "next/navigation";
import { requireRole } from "@/lib/serverAuth";
import { getSurveyConfig, listSurveysForDashboard, type SurveyResponse } from "@/lib/firestore";

function normalizeQuestions(raw: string) {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function AdminEncuestaPage({
  searchParams
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect("/login");
  }

  const cfg = await getSurveyConfig();
  const surveys = await listSurveysForDashboard({ limit: 200 });

  const count = surveys.length;
  const avg =
    count === 0 ? 0 : surveys.reduce((acc: number, s: SurveyResponse) => acc + (s.rating ?? 0), 0) / count;
  const dist = [1, 2, 3, 4, 5].map((r) => surveys.filter((s: SurveyResponse) => s.rating === r).length);

  const questionsText = (cfg.questions ?? []).join("\n");
  const questionsOpen = Boolean(searchParams?.err) || normalizeQuestions(questionsText).length === 0;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {searchParams?.err || searchParams?.ok ? (
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {searchParams?.ok ? (
            <span className="badge" style={{ borderColor: "rgba(34, 197, 94, 0.55)" }}>
              {String(searchParams.ok)}
            </span>
          ) : null}
          {searchParams?.err ? (
            <span className="badge" style={{ borderColor: "rgba(255, 59, 48, 0.55)" }}>
              {String(searchParams.err)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Panel de Encuesta</h2>
        <div className="small">Configura preguntas y revisa resultados.</div>
      </div>

      <details className="card" open={questionsOpen}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Preguntas</summary>
        <div className="small" style={{ marginTop: 6 }}>
          Una por línea. Se verán en la encuesta web.
        </div>
        <form className="grid" action="/api/admin/survey-config" method="post" style={{ marginTop: 10 }}>
          <div>
            <textarea
              className="input"
              name="questions"
              rows={8}
              defaultValue={questionsText}
              placeholder="Ej: ¿Cómo estuvo el servicio?"
            />
          </div>
          <button className="btn" type="submit">
            Guardar preguntas
          </button>
        </form>
      </details>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Dashboard</h3>
        <div className="grid" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ fontWeight: 900 }}>Respuestas (últimas {surveys.length})</div>
            <div className="small">Promedio: {avg.toFixed(2)}/5</div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            {[5, 4, 3, 2, 1].map((r) => (
              <div key={r} className="badge">
                {r}/5: {dist[r - 1]}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Comentarios (últimos {Math.min(50, surveys.length)})</h3>
        {surveys.filter((s) => s.comment).length === 0 ? <div className="small">Sin comentarios</div> : null}
        <div className="grid">
          {surveys
            .filter((s: SurveyResponse) => s.comment)
            .slice(0, 50)
            .map((s: SurveyResponse) => (
              <div
                key={s.id}
                className="card"
                style={{ background: "rgba(255, 255, 255, 0.72)" }}
              >
                <div style={{ fontWeight: 900 }}>{s.rating}/5</div>
                {s.comment ? <div style={{ marginTop: 8 }}>{s.comment}</div> : null}
                <div className="small" style={{ marginTop: 8 }}>
                  {new Date(s.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Respuestas por pregunta (beta)</h3>
        {normalizeQuestions(questionsText).length === 0 ? (
          <div className="small">Agrega preguntas arriba para ver respuestas aquí.</div>
        ) : null}
        <div className="grid" style={{ gap: 12 }}>
          {normalizeQuestions(questionsText).map((q, idx) => {
            const key = `q_${idx + 1}`;
            const answers = surveys
              .map((s: SurveyResponse) => (s.answers ? String((s.answers as any)[key] ?? "").trim() : ""))
              .filter(Boolean);
            return (
              <div
                key={key}
                className="card"
                style={{ background: "rgba(255, 255, 255, 0.72)" }}
              >
                <div style={{ fontWeight: 900 }}>{q}</div>
                <div className="small" style={{ marginTop: 6 }}>
                  Respuestas: {answers.length}
                </div>
                <div className="grid" style={{ marginTop: 8 }}>
                  {answers.slice(0, 10).map((a: string, i: number) => (
                    <div key={`${key}_${i}`} className="small">
                      {a}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
