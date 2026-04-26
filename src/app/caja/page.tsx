import { firebaseReady, listTables, listWaitingReservations } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";

function formatDDMMYY(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatHHMM(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default async function CajaPage() {
  try {
    await requireRole(["CAJA", "ADMIN"]);
  } catch {
    redirect("/login");
  }

  const ready = firebaseReady();
  const tables = ready ? await listTables() : [];
  const occupied = tables.filter((t) => t.status === "OCUPADA");

  // Caja should only surface reservations relevant "right now".
  // We fetch recent reservations and filter in-memory to avoid Firestore composite indexes.
  const wrapped = ready ? await listWaitingReservations({ allStatuses: true }) : [];
  const now = Date.now();
  const start = now - 60 * 60 * 1000;
  const end = now + 3 * 60 * 60 * 1000;
  const active = wrapped
    .filter((w) => {
      const r = w.reservation;
      if (r.status === "SEATED") return true;
      if (r.status !== "WAITING" && r.status !== "RESERVED") return false;
      if (!r.reservedFor) return false;
      return r.reservedFor >= start && r.reservedFor <= end;
    })
    .slice(0, 50)
    .map((w) => ({
      id: w.reservation.id,
      status: w.reservation.status,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customer: w.customer,
      table: w.table ?? null
    }));

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 720 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Caja — Liberar mesa</h2>
        <div className="small">Al cobrar, libera la mesa para que hostess la reasigne.</div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reservas activas (ventana de tiempo)</h3>
        <div className="small">Mostrando solo lo relevante para operar ahora.</div>
        {active.length === 0 ? <div className="small" style={{ marginTop: 8 }}>Sin registros</div> : null}
        <div className="grid" style={{ marginTop: 8 }}>
          {active.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{r.customer.name}</div>
                <div className="small">
                  Mesa {r.table?.name ?? "(sin mesa)"} · {r.status}
                  {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}, ${formatHHMM(r.reservedFor)}` : ""}
                </div>
              </div>
              {r.status === "SEATED" && r.table?.id ? (
                <form action="/api/tables/free" method="post" style={{ flex: "0 0 auto" }}>
                  <input type="hidden" name="tableId" value={r.table.id} />
                  <button className="btn" type="submit">
                    Liberar
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mesas ocupadas</h3>
        {occupied.length === 0 ? <div className="small">No hay mesas ocupadas</div> : null}
        <div className="grid">
          {occupied.map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{t.name}</div>
                <div className="small">{t.area}</div>
              </div>
              <form action="/api/tables/free" method="post" style={{ flex: "0 0 auto" }}>
                <input type="hidden" name="tableId" value={t.id} />
                <button className="btn" type="submit">
                  Liberar
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
