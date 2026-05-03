import { getReservationDetail, getSurveyConfig } from "@/lib/firestore";
import SurveyQuestionsClient from "./SurveyQuestionsClient";

export default async function SurveyPage({
  params,
  searchParams
}: {
  params: { reservationId: string };
  searchParams?: { ok?: string };
}) {
  const reservationId = String(params.reservationId);
  const detail = await getReservationDetail(reservationId);
  const reservation = detail?.reservation ?? null;
  const customer = detail?.customer ?? null;
  const survey = detail?.survey ?? null;
  const cfg = await getSurveyConfig();
  const questions = (cfg.questions ?? []).map((q) => String(q).trim()).filter(Boolean);

  if (!reservation || !customer) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Encuesta</h2>
        <div className="small">Reserva no encontrada.</div>
      </div>
    );
  }

  if (survey) {
    return (
      <div className="grid" style={{ gap: 16, maxWidth: 620 }}>
        <div className="card">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <img
              src="/logo.jpg"
              alt="Café Jade"
              width={44}
              height={44}
              style={{ borderRadius: 12, objectFit: "contain", background: "#0b1220" }}
            />
            <div>
              <h2 style={{ margin: 0 }}>¡Gracias!</h2>
              <div className="small">Ya registramos tu respuesta.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 620 }}>
      <div className="card">
        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <img
            src="/logo.jpg"
            alt="Café Jade"
            width={44}
            height={44}
            style={{ borderRadius: 12, objectFit: "contain", background: "#0b1220" }}
          />
          <div>
            <h2 style={{ margin: 0 }}>Encuesta — Café Jade</h2>
            <div className="small">Hola {customer.name}. Nos toma menos de 1 minuto.</div>
          </div>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Tu opinión nos ayuda a mejorar. Si algo no te gustó, cuéntanos con confianza.
        </div>
        {searchParams?.ok ? (
          <div className="badge" style={{ borderColor: "#1e8449", marginTop: 8 }}>
            {searchParams.ok}
          </div>
        ) : null}

        <form className="grid" action="/api/surveys" method="post" style={{ marginTop: 10 }}>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <div>
            <label className="label">En general, ¿cómo calificarías tu visita?</label>
            <div className="rating-scale" role="radiogroup" aria-label="Calificación 1 a 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="rating-pill">
                  <input type="radio" name="rating" value={String(n)} defaultChecked={n === 5} required />
                  <span>{n}</span>
                </label>
              ))}
            </div>
            <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>
              1 = Muy mala · 5 = Excelente
            </div>
          </div>

          <SurveyQuestionsClient questions={questions} />

          <div>
            <label className="label">Comentarios (opcional)</label>
            <textarea className="input" name="comment" rows={4} placeholder="¿Qué fue lo mejor y qué mejorarías?" />
          </div>

          <div className="small" style={{ opacity: 0.8 }}>
            No solicitamos datos bancarios. Tus respuestas se usan solo para mejorar el servicio.
          </div>
          <button className="btn" type="submit">
            Enviar encuesta
          </button>
        </form>
      </div>
    </div>
  );
}
