import { redirect } from "next/navigation";
import { requireRole } from "@/lib/serverAuth";
import {
  getReservationDetail,
  listPendingSurveyOutbox,
  type SurveyOutboxItem,
  type SurveyResponse
} from "@/lib/firestore";

function normalizePhoneToWa(phoneRaw: string) {
  const digits = String(phoneRaw || "").replace(/\D+/g, "");
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return digits;
  return digits;
}

export default async function AdminEncuestasPendientesPage({
  searchParams
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect("/login");
  }

  const items = await listPendingSurveyOutbox({ limit: 200 });
  const appBaseUrl = process.env.APP_BASE_URL ?? "https://cafejadersvp.web.app";

  const rows = await Promise.all(
    items.map(async (it: SurveyOutboxItem) => {
      const detail = await getReservationDetail(it.reservationId);
      const customer = detail?.customer ?? null;
      const survey = detail?.survey ?? (null as SurveyResponse | null);
      return {
        it,
        customer,
        survey,
        link: `${appBaseUrl}/encuesta/${encodeURIComponent(it.reservationId)}`
      };
    })
  );

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
        <h2 style={{ marginTop: 0 }}>Encuestas pendientes</h2>
        <div className="small">Envío manual temporal (pruebas). Caja no interviene.</div>
      </div>

      <div className="card requires-online">
        {rows.length === 0 ? <div className="small">Sin pendientes</div> : null}
        <div className="grid">
          {rows.map(({ it, customer, survey, link }) => {
            const hasAnswered = Boolean(survey);
            const wa = customer?.phone ? normalizePhoneToWa(customer.phone) : "";
            const waText = customer
              ? `Hola ${customer.name}, gracias por tu visita a Café Jade. ¿Nos ayudas con una encuesta rápida?\n\n${link}`
              : `Gracias por tu visita a Café Jade. ¿Nos ayudas con una encuesta rápida?\n\n${link}`;

            return (
              <div key={it.id} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {customer?.name || "(Sin cliente)"}
                      {hasAnswered ? " · Respondida" : ""}
                    </div>
                    <div className="small">
                      Canal sugerido: {it.suggestedChannel} · {new Date(it.createdAt).toLocaleString()}
                    </div>
                    <div className="small">{customer?.phone ? customer.phone : ""} {customer?.email ? `· ${customer.email}` : ""}</div>
                  </div>
                  <form action="/api/admin/survey-outbox/sent" method="post" style={{ flex: "0 0 auto" }}>
                    <input type="hidden" name="outboxId" value={it.id} />
                    <button className="btn secondary" type="submit">
                      Marcar enviada
                    </button>
                  </form>
                </div>

                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <a className="badge" href={link} target="_blank" rel="noreferrer">
                    Abrir encuesta
                  </a>
                  {wa ? (
                    <a
                      className="badge"
                      href={`https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(waText)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  {customer?.email ? (
                    <a
                      className="badge"
                      href={`mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(
                        "Encuesta — Café Jade"
                      )}&body=${encodeURIComponent(
                        `Hola ${customer.name},\n\nGracias por tu visita. ¿Nos ayudas con una encuesta rápida?\n\n${link}\n\n¡Gracias!\nCafé Jade`
                      )}`}
                    >
                      Email
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
