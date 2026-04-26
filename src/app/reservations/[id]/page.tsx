import { notFound } from "next/navigation";
import { getReservationDetail } from "@/lib/firestore";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export default async function ReservationDetailPage({
  params
}: {
  params: { id: string };
}) {
  const id = String(params.id);
  if (!id) notFound();

  const detail = await getReservationDetail(id);
  if (!detail) notFound();

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const surveyLink = `${baseUrl}/encuesta/${detail.reservation.id}`;

  const message = `Hola ${detail.customer.name} 👋\n\nTu mesa en Café Jade está lista.\n\nPor favor ayúdanos con una encuesta rápida: ${surveyLink}`;
  const waUrl = buildWhatsAppUrl(detail.customer.phone, message);

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 720 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Reserva #{detail.reservation.id}</h2>
        <div className="small">
          {detail.customer.name} · {detail.customer.phone}
        </div>
        <div className="small">
          Estado: {detail.reservation.status} · Fuente: {detail.reservation.source}
        </div>
        <div className="small">
          Mesa: {detail.table ? detail.table.name : "(sin asignar)"}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Plantilla WhatsApp</h3>
        <div className="small" style={{ marginBottom: 10 }}>
          Esto no envía automáticamente: abre WhatsApp con el mensaje listo.
        </div>
        <a className="btn" href={waUrl} target="_blank" rel="noreferrer">
          Abrir WhatsApp
        </a>
        <div className="card" style={{ marginTop: 12, background: "#0b1220" }}>
          <div className="small" style={{ whiteSpace: "pre-wrap" }}>
            {message}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Encuesta</h3>
        {detail.survey ? (
          <div className="grid">
            <div className="badge">Rating: {detail.survey.rating}/5</div>
            {detail.survey.comment ? (
              <div className="card" style={{ background: "#0b1220" }}>
                {detail.survey.comment}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="small">Sin respuesta aún</div>
        )}
      </div>
    </div>
  );
}
