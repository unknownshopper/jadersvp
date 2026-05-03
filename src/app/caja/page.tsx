import { firebaseReady, listTables, listWaitingReservations } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import OfflineBanner from "../OfflineBanner";

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

export default async function CajaPage({
  searchParams
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  try {
    await requireRole(["CAJA", "ADMIN"]);
  } catch {
    redirect("/login");
  }

  const ready = firebaseReady();
  const tables = ready ? await listTables() : [];

  const now = Date.now();
  const recentlyFreedWindowMs = 10 * 60 * 1000;
  const recentlyFreed = tables
    .filter((t) => t.status === "LIBRE" && typeof (t as any).lastFreedAt === "number")
    .filter((t) => now - Number((t as any).lastFreedAt) <= recentlyFreedWindowMs)
    .sort((a, b) => Number((b as any).lastFreedAt) - Number((a as any).lastFreedAt))
    .slice(0, 12);

  // Caja should only surface reservations relevant "right now".
  // We fetch recent reservations and filter in-memory to avoid Firestore composite indexes.
  const wrapped = ready ? await listWaitingReservations({ allStatuses: true }) : [];
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
      <OfflineBanner />
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
        <h2 style={{ marginTop: 0 }}>Caja — Liberar mesa</h2>
        <div className="small">Al cobrar, libera la mesa para que hostess la reasigne.</div>
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Reservas activas (ventana de tiempo)</h3>
        <div className="small">Mostrando solo lo relevante para operar ahora.</div>
        {active.length === 0 ? <div className="small" style={{ marginTop: 8 }}>Sin registros</div> : null}
        <div className="grid" style={{ marginTop: 8 }}>
          {active.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800 }}>{r.customer.name}</div>
                <div className="small">
                  Mesa {r.table?.name ?? "(sin mesa)"}
                  {r.table?.area ? ` · ${r.table.area}` : ""} · {r.status}
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

      {recentlyFreed.length > 0 ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Liberadas recientemente</h3>
          <div className="small">Se muestran por 10 minutos para referencia visual.</div>
          <div className="grid" style={{ marginTop: 8 }}>
            {recentlyFreed.map((t) => (
              <div
                key={t.id}
                className="row"
                style={{ justifyContent: "space-between", alignItems: "center", opacity: 0.55 }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{t.name}</div>
                  <div className="small">{t.area}</div>
                </div>
                <div className="small" style={{ flex: "0 0 auto" }}>
                  Liberada
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
