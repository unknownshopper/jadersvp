import { firebaseReady, listTables, listWaitingReservations } from "@/lib/firestore";
import HostessForm from "./HostessForm";
import { requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import OfflineBanner from "../OfflineBanner";

function badgeClass(status: string) {
  if (status === "LIBRE") return "badge libre";
  if (status === "OCUPADA") return "badge ocupada";
  if (status === "RESERVADA") return "badge reservada";
  return "badge porlimpiar";
}

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

export default async function HostessPage({
  searchParams
}: {
  searchParams?: { tableId?: string; ok?: string; err?: string };
}) {
  try {
    await requireRole(["HOSTESS", "ADMIN"]);
  } catch {
    redirect("/login");
  }

  const selectedTableId = searchParams?.tableId ? String(searchParams.tableId) : null;

  const ready = firebaseReady();
  const tables = ready ? await listTables() : [];
  const waitingWrapped = ready
    ? await listWaitingReservations({ tableId: selectedTableId, allStatuses: true })
    : [];
  const waiting = waitingWrapped
    .filter((w) => w.reservation.status === "WAITING" || w.reservation.status === "RESERVED")
    .map((w) => ({
      id: w.reservation.id,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customer: w.customer,
      table: w.table ?? null
    }));

  const now = Date.now();
  const noShowAfterMs = 10 * 60 * 1000;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <OfflineBanner />
      {searchParams?.err ? (
        <div className="card" style={{ borderColor: "rgba(255, 59, 48, 0.35)" }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div className="small">{String(searchParams.err)}</div>
        </div>
      ) : null}
      {searchParams?.ok ? (
        <div className="card" style={{ borderColor: "rgba(34, 197, 94, 0.35)" }}>
          <div style={{ fontWeight: 800 }}>Listo</div>
          <div className="small">{String(searchParams.ok)}</div>
        </div>
      ) : null}

      <div className="requires-online">
        <HostessForm tables={tables} initialTableId={selectedTableId ?? ""} />
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Lista de espera / Reservas</h3>
        <div className="grid">
          {waiting.length === 0 ? <div className="small">Sin registros</div> : null}
          {waiting.map((r) => (
            <div key={r.id} className="card">
              <div className="row">
                <div>
                  <div className="row" style={{ fontWeight: 800, gap: 8, flexWrap: "wrap" }}>
                    <div>{r.customer.name}</div>
                    {r.customer.isRecurrent ? <span className="badge">Recurrente</span> : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source}
                    {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}, ${formatHHMM(r.reservedFor)}` : ""}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.status !== "SEATED" ? (
                    <form action="/api/reservations/seat" method="post">
                      <input type="hidden" name="reservationId" value={r.id} />
                      {r.table?.id || selectedTableId ? (
                        <input
                          type="hidden"
                          name="tableId"
                          value={r.table?.id ?? selectedTableId ?? ""}
                        />
                      ) : (
                        <select className="input" name="tableId" required defaultValue="" style={{ minWidth: 160 }}>
                          <option value="" disabled>
                            Mesa...
                          </option>
                          {tables
                            .filter((t) => t.status === "LIBRE")
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      )}
                      <button className="btn" type="submit" style={{ marginTop: 8 }}>
                        Sentar
                      </button>
                    </form>
                  ) : null}

                  {r.status !== "SEATED" && r.reservedFor && now - r.reservedFor.getTime() >= noShowAfterMs ? (
                    <form action="/api/reservations/noshow" method="post" style={{ flex: "0 0 auto" }}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <button className="btn secondary" type="submit" style={{ marginTop: 8 }}>
                        No llegó
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
