import { getReservationDetail } from "@/lib/firestore";

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
          <h2 style={{ marginTop: 0 }}>¡Gracias!</h2>
          <div className="small">Ya registramos tu respuesta.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 620 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Encuesta — Café Jade</h2>
        <div className="small">Hola {customer.name}. ¿Cómo estuvo tu visita?</div>
        {searchParams?.ok ? (
          <div className="badge" style={{ borderColor: "#1e8449" }}>
            {searchParams.ok}
          </div>
        ) : null}
      </div>

      <div className="card">
        <form className="grid" action="/api/surveys" method="post">
          <input type="hidden" name="reservationId" value={reservation.id} />
          <div>
            <label className="label">Calificación (1-5)</label>
            <select className="input" name="rating" required defaultValue="5">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>
          <div>
            <label className="label">Comentarios (opcional)</label>
            <textarea className="input" name="comment" rows={4} />
          </div>
          <button className="btn" type="submit">
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
