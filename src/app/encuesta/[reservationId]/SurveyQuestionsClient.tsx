"use client";

import { useMemo, useState } from "react";

function keyFor(idx: number) {
  return `q_${idx + 1}`;
}

function detailPlaceholder(question: string) {
  const q = String(question || "").toLowerCase();
  if (q.includes("atendieron") && q.includes("amable")) return "Nos interesa su opinión.";
  if (q.includes("qué no") && q.includes("gust")) return "Nos interesa su opinión.";
  if (q.includes("recomendar")) return "¿Por qué?";
  return null;
}

export default function SurveyQuestionsClient({ questions }: { questions: string[] }) {
  const keys = useMemo(() => questions.map((_, idx) => keyFor(idx)), [questions]);
  const [choices, setChoices] = useState<Record<string, "SI" | "NO">>(() => {
    const initial: Record<string, "SI" | "NO"> = {};
    for (const k of keys) initial[k] = "SI";
    return initial;
  });

  return (
    <div className="grid" style={{ gap: 14 }}>
      {questions.map((q, idx) => {
        const k = keyFor(idx);
        const v = choices[k] ?? "SI";
        return (
          <div key={k}>
            <label className="label">{q}</label>
            <div className="yn-scale" role="radiogroup" aria-label={q}>
              <label className="yn-pill">
                <input
                  type="radio"
                  name={`${k}_choice`}
                  value="SI"
                  checked={v === "SI"}
                  onChange={() => setChoices((p) => ({ ...p, [k]: "SI" }))}
                />
                <span>✅</span>
              </label>
              <label className="yn-pill">
                <input
                  type="radio"
                  name={`${k}_choice`}
                  value="NO"
                  checked={v === "NO"}
                  onChange={() => setChoices((p) => ({ ...p, [k]: "NO" }))}
                />
                <span>❌</span>
              </label>
            </div>

            {v === "NO" && detailPlaceholder(q) ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  className="input"
                  name={`${k}_detail`}
                  rows={3}
                  placeholder={detailPlaceholder(q) ?? ""}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
