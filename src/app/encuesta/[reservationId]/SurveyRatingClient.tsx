"use client";

import { useState } from "react";

export default function SurveyRatingClient() {
  const [rating, setRating] = useState<"5" | "3" | "1">("5");

  const showDetail = rating !== "5";
  const placeholder = rating === "3" ? "¿Qué mejoraría?" : "Coméntenos su experiencia";

  return (
    <div>
      <label className="label">En general, ¿cómo calificarías tu visita?</label>
      <div className="rating-scale" role="radiogroup" aria-label="Calificación">
        <label className="rating-pill">
          <input type="radio" name="rating" value="5" checked={rating === "5"} onChange={() => setRating("5")} required />
          <span>Buena</span>
        </label>
        <label className="rating-pill">
          <input type="radio" name="rating" value="3" checked={rating === "3"} onChange={() => setRating("3")} required />
          <span>Regular</span>
        </label>
        <label className="rating-pill">
          <input type="radio" name="rating" value="1" checked={rating === "1"} onChange={() => setRating("1")} required />
          <span>Mala</span>
        </label>
      </div>

      {showDetail ? (
        <div style={{ marginTop: 10 }}>
          <textarea className="input" name="rating_detail" rows={3} placeholder={placeholder} />
        </div>
      ) : null}
    </div>
  );
}
