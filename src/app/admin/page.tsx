import { adminSummary, firebaseReady } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";
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

  const range = (searchParams?.range ?? "day") as "day" | "week" | "month";
  const ready = firebaseReady();
  const summary = ready ? await adminSummary(range) : null;

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
        <div className="grid">
          {(summary?.latestCustomers ?? [])
            .slice()
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" }))
            .map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{c.name}</div>
                  <div className="small">
                    {c.phone} {c.email ? `· ${c.email}` : ""}
                  </div>
                </div>
                <div className="small">{new Date(c.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
        </div>
      </details>
    </div>
  );
}
