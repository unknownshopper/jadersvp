import { adminCustomersTable, adminSummary, firebaseReady } from "@/lib/firestore";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import AdminCustomersClient from "./AdminCustomersClient";
import { formatDateDDMMYY } from "@/lib/dateFormat";

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
  const customersTable = ready ? await adminCustomersTable({ limit: 250 }) : [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="small">Rango:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              className="badge"
              href="/admin?range=day"
              style={{ opacity: range === "day" ? 1 : 0.65, borderColor: range === "day" ? "rgba(34, 197, 94, 0.95)" : undefined }}
            >
              Día
            </a>
            <a
              className="badge"
              href="/admin?range=week"
              style={{ opacity: range === "week" ? 1 : 0.65, borderColor: range === "week" ? "rgba(34, 197, 94, 0.95)" : undefined }}
            >
              Semana
            </a>
            <a
              className="badge"
              href="/admin?range=month"
              style={{ opacity: range === "month" ? 1 : 0.65, borderColor: range === "month" ? "rgba(34, 197, 94, 0.95)" : undefined }}
            >
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

      <div className="grid grid-3">
        <div className="card">
          <div className="small">Reservas CALL</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.reservationsCallCount ?? 0}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Sentadas: {summary?.callSeatedCount ?? 0} · No llegó: {summary?.callNoShowCount ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="small">Reservas WALK-IN</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.reservationsWalkInCount ?? 0}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Sentadas: {summary?.walkInSeatedCount ?? 0} · No llegó: {summary?.walkInNoShowCount ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="small">% CALL</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>
            {summary?.reservationsCount
              ? Math.round(((summary?.reservationsCallCount ?? 0) / summary.reservationsCount) * 100)
              : 0}
            %
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="small">Encuestas (en cola)</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.surveyEnqueuedCount ?? 0}</div>
          <div className="small" style={{ marginTop: 6 }}>
            Enviadas: {summary?.surveySentCount ?? 0} · Recibidas: {summary?.surveyReceivedCount ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="small">Encuestas enviadas</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.surveySentCount ?? 0}</div>
          <div className="small" style={{ marginTop: 6 }}>
            CALL: {summary?.surveySentCallCount ?? 0} · WALK-IN: {summary?.surveySentWalkInCount ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="small">Encuestas recibidas</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary?.surveyReceivedCount ?? 0}</div>
          <div className="small" style={{ marginTop: 6 }}>
            CALL: {summary?.surveyReceivedCallCount ?? 0} · WALK-IN: {summary?.surveyReceivedWalkInCount ?? 0}
          </div>
        </div>
      </div>

      <details className="card" style={{ opacity: 0.98 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Comentarios / Encuestas (últimas 20)</summary>
        <div style={{ marginTop: 10 }}>
          {(summary?.latestSurveys ?? []).length === 0 ? <div className="small">Sin respuestas</div> : null}
          <div className="grid">
            {(summary?.latestSurveys ?? []).map(({ survey, customerName }) => (
              <div key={survey.id} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
                <div style={{ fontWeight: 900 }}>{survey.rating}/5</div>
                <div className="small">{customerName}</div>
                {survey.comment ? <div style={{ marginTop: 8 }}>{survey.comment}</div> : null}
                <div className="small" style={{ marginTop: 8 }}>
                  {formatDateDDMMYY(survey.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

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
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="badge">Con teléfono: {summary?.customersWithPhoneCount ?? 0}</span>
          <span className="badge">Sin teléfono: {summary?.customersWithoutPhoneCount ?? 0}</span>
        </div>
        <AdminCustomersClient rows={customersTable as any} canDelete={canDelete} />
      </details>
    </div>
  );
}
