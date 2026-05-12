import { adminCustomersTable, adminSummary, firebaseReady } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: { range?: string };
}) {
  try {
    await requireRole(["ADMIN", "DIRECTOR"]);
  } catch {
    redirect("/login");
  }

  const u = await getSessionUser();
  const canDelete = u?.role === "ADMIN";

  const range = (searchParams?.range ?? "day") as "day" | "week" | "month";
  const ready = firebaseReady();
  const summary = ready ? await adminSummary(range) : null;
  const customersTable = ready ? await adminCustomersTable({ limit: 60 }) : [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="small">Rango:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="badge" href="/admin?range=day">
              Día
            </a>
            <a className="badge" href="/admin?range=week">
              Semana
            </a>
            <a className="badge" href="/admin?range=month">
              Mes
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="small">Reservas creadas</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.reservationsCount ?? 0}</div>
        </div>
        <div className="card">
          <div className="small">Completadas</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.completedCount ?? 0}</div>
        </div>
        <div className="card">
          <div className="small">No show</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.noShowCount ?? 0}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Comentarios / Encuestas (últimas 20)</h3>
        {(summary?.latestSurveys ?? []).length === 0 ? <div className="small">Sin respuestas</div> : null}
        <div className="grid">
          {(summary?.latestSurveys ?? []).map(({ survey, customerName }) => (
            <div key={survey.id} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ fontWeight: 900 }}>{survey.rating}/5</div>
              <div className="small">{customerName}</div>
              {survey.comment ? <div style={{ marginTop: 8 }}>{survey.comment}</div> : null}
              <div className="small" style={{ marginTop: 8 }}>
                {new Date(survey.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {summary?.features?.marketingEnabled ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Módulo marketing (adicional)</h3>
          <div className="small" style={{ marginBottom: 10 }}>
            Disponible como módulo opcional con costo extra (requiere registrar consumos y catálogo de productos).
          </div>
          <div className="grid grid-3">
            <div className="card" style={{ opacity: 0.65 }}>
              <div className="small">Top productos más vendidos</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>—</div>
              <div className="small" style={{ marginTop: 6 }}>
                Comida · Bebidas · Postres
              </div>
            </div>
            <div className="card" style={{ opacity: 0.65 }}>
              <div className="small">Top productos menos vendidos</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>—</div>
              <div className="small" style={{ marginTop: 6 }}>
                Detecta oportunidades de menú
              </div>
            </div>
            <div className="card" style={{ opacity: 0.65 }}>
              <div className="small">Top mayor consumo / visita</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>—</div>
              <div className="small" style={{ marginTop: 6 }}>
                Ticket promedio + segmentación
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <details className="card" style={{ opacity: 0.98 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Base de datos (clientes)</summary>
        <div className="small" style={{ marginTop: 10, marginBottom: 10 }}>
          Total: {summary?.customersCount ?? 0}
        </div>
        <div className="grid" style={{ gap: 8 }}>
          <div
            className="row"
            style={{
              fontWeight: 900,
              opacity: 0.85,
              gap: 10,
              alignItems: "flex-end"
            }}
          >
            <div style={{ flex: 2 }}>Nombre</div>
            <div style={{ flex: 1 }}>Teléfono</div>
            <div style={{ flex: 2 }}>Correo</div>
            <div style={{ flex: 1, textAlign: "right" }}>Visitas</div>
            <div style={{ flex: 1, textAlign: "right" }}>Encuestas</div>
            {canDelete ? <div style={{ flex: "0 0 90px" }} /> : null}
          </div>

          {customersTable
            .slice()
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" }))
            .map((c) => (
              <details key={c.id} className="card" style={{ padding: 10 }}>
                <summary style={{ cursor: "pointer" }}>
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 2, fontWeight: 800 }}>{c.name || "(Sin nombre)"}</div>
                    <div style={{ flex: 1 }} className="small">
                      {c.phone || "—"}
                    </div>
                    <div style={{ flex: 2 }} className="small">
                      {c.email || "—"}
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }} className="small">
                      {c.visitsCount}
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }} className="small">
                      {c.surveysCount}
                    </div>
                    {canDelete ? (
                      <form action="/api/admin/customers/delete" method="post" style={{ flex: "0 0 90px" }}>
                        <input type="hidden" name="customerId" value={c.id} />
                        <button className="btn danger" type="submit" style={{ padding: "8px 10px" }}>
                          Eliminar
                        </button>
                      </form>
                    ) : null}
                  </div>
                </summary>

                <div className="small" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(c.visits ?? []).slice(0, 20).map((v) => (
                    <span key={v.reservationId} className="badge" style={{ display: "inline-flex", gap: 8 }}>
                      <span>{new Date(v.at).toLocaleString()}</span>
                      {canDelete ? (
                        <form action="/api/admin/reservations/delete" method="post">
                          <input type="hidden" name="reservationId" value={v.reservationId} />
                          <input type="hidden" name="from" value="admin" />
                          <button className="btn danger" type="submit" style={{ padding: "2px 6px" }}>
                            ×
                          </button>
                        </form>
                      ) : null}
                    </span>
                  ))}
                  {(c.visits ?? []).length > 20 ? <span className="badge">+{(c.visits ?? []).length - 20} más</span> : null}
                </div>
              </details>
            ))}
        </div>
      </details>
    </div>
  );
}
