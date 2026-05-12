import { firebaseReady, listTables, listWaitingReservations } from "@/lib/firestore";
import HostessForm from "./HostessForm";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
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
  searchParams?: { tableId?: string; focusTableId?: string; ok?: string; err?: string; future?: string };
}) {
  try {
    await requireRole(["HOSTESS", "ADMIN", "DIRECTOR"]);
  } catch {
    redirect("/login");
  }

  const u = await getSessionUser();
  const canDelete = u?.role === "ADMIN";

  const selectedTableId = searchParams?.focusTableId
    ? String(searchParams.focusTableId)
    : searchParams?.tableId
      ? String(searchParams.tableId)
      : null;

  const ready = firebaseReady();
  const [tables, waitingWrapped] = ready
    ? await Promise.all([
        listTables(),
        listWaitingReservations({ tableId: selectedTableId, allStatuses: false })
      ])
    : [[], []];

  const focusedTable = selectedTableId ? tables.find((t) => t.id === selectedTableId) ?? null : null;

  const focusedQueue = waitingWrapped
    .filter((w) => w.reservation.status === "WAITING" || w.reservation.status === "RESERVED")
    .map((w) => ({
      id: w.reservation.id,
      createdAt: w.reservation.createdAt,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : null;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : null;
      if (aMs != null && bMs != null) return aMs - bMs;
      if (aMs != null && bMs == null) return -1;
      if (aMs == null && bMs != null) return 1;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayEnd.getTime();

  const futureKey = String(searchParams?.future ?? "1");
  const futureStart = new Date(todayStart);
  const futureEnd = new Date(todayStart);
  if (futureKey === "next3") {
    futureStart.setDate(futureStart.getDate() + 1);
    futureEnd.setDate(futureEnd.getDate() + 4);
  } else if (futureKey === "next7") {
    futureStart.setDate(futureStart.getDate() + 1);
    futureEnd.setDate(futureEnd.getDate() + 8);
  } else {
    const offsetDays = Math.max(1, Math.min(30, Number.parseInt(futureKey, 10) || 1));
    futureStart.setDate(futureStart.getDate() + offsetDays);
    futureEnd.setDate(futureEnd.getDate() + offsetDays + 1);
  }

  const futureStartMs = futureStart.getTime();
  const futureEndMs = futureEnd.getTime();

  const waiting = waitingWrapped
    .filter((w) => w.reservation.status === "WAITING" || w.reservation.status === "RESERVED")
    .filter((w) => {
      const r = w.reservation;
      if (r.status === "WAITING") return true;
      const ms = typeof r.reservedFor === "number" ? r.reservedFor : null;
      if (!ms) return false;
      return ms >= todayStartMs && ms < todayEndMs;
    })
    .map((w) => ({
      id: w.reservation.id,
      createdAt: w.reservation.createdAt,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : null;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : null;

      // Upcoming reservations first, sorted by time.
      if (aMs != null && bMs != null) return aMs - bMs;
      if (aMs != null && bMs == null) return -1;
      if (aMs == null && bMs != null) return 1;

      // Otherwise keep most-recent first.
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

  const upcoming = waitingWrapped
    .filter((w) => w.reservation.status === "RESERVED")
    .filter((w) => {
      const ms = typeof w.reservation.reservedFor === "number" ? w.reservation.reservedFor : null;
      if (!ms) return false;
      return ms >= futureStartMs && ms < futureEndMs;
    })
    .map((w) => ({
      id: w.reservation.id,
      createdAt: w.reservation.createdAt,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : 0;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : 0;
      return aMs - bMs;
    });

  const now = Date.now();

  const remainingToday = waitingWrapped
    .filter((w) => w.reservation.status === "RESERVED")
    .filter((w) => {
      const ms = typeof w.reservation.reservedFor === "number" ? w.reservation.reservedFor : null;
      if (!ms) return false;
      return ms >= now && ms < todayEndMs;
    })
    .map((w) => ({
      id: w.reservation.id,
      createdAt: w.reservation.createdAt,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : 0;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : 0;
      return aMs - bMs;
    });

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
        <HostessForm tables={tables} initialTableId={searchParams?.tableId ? String(searchParams.tableId) : ""} />
      </div>

      {focusedTable ? (
        <div className="card requires-online" style={{ borderColor: "rgba(168, 85, 247, 0.28)" }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Mesa {focusedTable.name}</div>
              <div className="small" style={{ opacity: 0.85 }}>
                Acciones rápidas (Sentar / No show)
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {canDelete && focusedQueue.length === 0 ? (
                <form action="/api/admin/tables/clear-next" method="post">
                  <input type="hidden" name="tableId" value={focusedTable.id} />
                  <button className="btn secondary" type="submit">
                    Limpiar reserva
                  </button>
                </form>
              ) : null}
              <a className="badge" href="/hostess">
                Quitar filtro
              </a>
            </div>
          </div>
          <div className="grid" style={{ marginTop: 10 }}>
            {focusedQueue.length === 0 ? <div className="small">Sin reservas/en espera para esta mesa</div> : null}
            {focusedQueue.map((r) => (
              <div key={r.id} className="card" style={{ background: "rgba(255, 255, 255, 0.72)" }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="row" style={{ fontWeight: 800, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {r.reservedFor ? (
                        <span
                          className="badge"
                          style={{
                            fontSize: 16,
                            padding: "6px 10px",
                            borderRadius: 999,
                            letterSpacing: 0.5
                          }}
                        >
                          {formatHHMM(r.reservedFor)}
                        </span>
                      ) : (
                        <span className="badge" style={{ opacity: 0.8 }}>
                          En espera
                        </span>
                      )}
                      <div style={{ fontSize: 16 }}>{r.customerNameSnapshot || r.customer.name}</div>
                    </div>
                    <div className="small">
                      {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                    </div>
                    <div className="small">
                      {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"}
                      {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}` : ""}
                    </div>
                    {r.notes ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          borderRadius: 12,
                          background: "rgba(255, 149, 0, 0.08)",
                          border: "1px solid rgba(255, 149, 0, 0.22)",
                          fontWeight: 800
                        }}
                      >
                        {r.notes}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ flex: "0 0 auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {r.status !== "SEATED" ? (
                      <form action="/api/reservations/seat" method="post">
                        <input type="hidden" name="reservationId" value={r.id} />
                        <input type="hidden" name="tableId" value={selectedTableId ?? ""} />
                        <button className="btn" type="submit">
                          Sentar
                        </button>
                      </form>
                    ) : null}

                    {r.status !== "SEATED" && r.reservedFor && now - r.reservedFor.getTime() >= noShowAfterMs ? (
                      <form action="/api/reservations/noshow" method="post">
                        <input type="hidden" name="reservationId" value={r.id} />
                        <button className="btn secondary" type="submit">
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
      ) : null}

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Lista de espera / Reservas</h3>
        <div className="grid">
          {waiting.length === 0 ? <div className="small">Sin registros</div> : null}
          {waiting.map((r) => (
            <div key={r.id} className="card">
              <div className="row">
                <div>
                  <div className="row" style={{ fontWeight: 800, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {r.reservedFor ? (
                      <span
                        className="badge"
                        style={{
                          fontSize: 16,
                          padding: "6px 10px",
                          borderRadius: 999,
                          letterSpacing: 0.5
                        }}
                      >
                        {formatHHMM(r.reservedFor)}
                      </span>
                    ) : (
                      <span
                        className="badge"
                        style={{
                          fontSize: 13,
                          padding: "6px 10px",
                          borderRadius: 999,
                          opacity: 0.8
                        }}
                      >
                        En espera
                      </span>
                    )}
                    <div style={{ fontSize: 16 }}>{r.customerNameSnapshot || r.customer.name}</div>
                    {r.table?.name ? <span className="badge">Mesa {r.table.name}</span> : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"}
                    {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}` : ""}
                  </div>
                  {r.notes ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "rgba(255, 149, 0, 0.08)",
                        border: "1px solid rgba(255, 149, 0, 0.22)",
                        fontWeight: 800
                      }}
                    >
                      {r.notes}
                    </div>
                  ) : null}
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
                        <select
                          className="input"
                          name="tableId"
                          required
                          defaultValue=""
                          style={{ minWidth: 180, borderColor: "rgba(255, 149, 0, 0.55)" }}
                        >
                          <option value="" disabled>
                            Selecciona mesa…
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
                        {r.table?.id || selectedTableId ? "Sentar" : "Sentar (elige mesa)"}
                      </button>
                    </form>
                  ) : null}

                  {canDelete ? (
                    <form action="/api/admin/reservations/delete" method="post" style={{ flex: "0 0 auto" }}>
                      <input type="hidden" name="reservationId" value={r.id} />
                      <input type="hidden" name="from" value="hostess" />
                      <button
                        className="btn danger"
                        type="submit"
                        style={{ marginTop: 8 }}
                      >
                        Borrar
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

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Faltantes del día</h3>
        <div className="small" style={{ marginBottom: 10 }}>
          {remainingToday.length} reservación(es) restantes hoy
        </div>
        <div className="grid">
          {remainingToday.length === 0 ? <div className="small">Sin pendientes</div> : null}
          {remainingToday.map((r) => (
            <div key={r.id} className="card">
              <div className="row">
                <div>
                  <div className="row" style={{ fontWeight: 800, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {r.reservedFor ? (
                      <span
                        className="badge"
                        style={{
                          fontSize: 16,
                          padding: "6px 10px",
                          borderRadius: 999,
                          letterSpacing: 0.5
                        }}
                      >
                        {formatHHMM(r.reservedFor)}
                      </span>
                    ) : null}
                    <div style={{ fontSize: 16 }}>{r.customerNameSnapshot || r.customer.name}</div>
                    {r.table?.name ? <span className="badge">Mesa {r.table.name}</span> : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"}
                    {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}` : ""}
                  </div>
                  {r.notes ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "rgba(255, 149, 0, 0.08)",
                        border: "1px solid rgba(255, 149, 0, 0.22)",
                        fontWeight: 800
                      }}
                    >
                      {r.notes}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Próximas reservaciones</h3>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <a className="badge" href="/hostess?future=1">
            Mañana
          </a>
          <a className="badge" href="/hostess?future=2">
            Pasado mañana
          </a>
          <a className="badge" href="/hostess?future=next3">
            Próximos 3 días
          </a>
          <a className="badge" href="/hostess?future=next7">
            Próximos 7 días
          </a>
        </div>

        <div className="small" style={{ marginBottom: 10 }}>
          {formatDDMMYY(futureStart)}
          {futureKey === "next3" || futureKey === "next7" ? ` — ${formatDDMMYY(new Date(futureEndMs - 1))}` : ""}
        </div>

        <div className="grid">
          {upcoming.length === 0 ? <div className="small">Sin reservaciones</div> : null}
          {upcoming.map((r) => (
            <div key={r.id} className="card">
              <div className="row">
                <div>
                  <div className="row" style={{ fontWeight: 800, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {r.reservedFor ? (
                      <span
                        className="badge"
                        style={{
                          fontSize: 16,
                          padding: "6px 10px",
                          borderRadius: 999,
                          letterSpacing: 0.5
                        }}
                      >
                        {formatHHMM(r.reservedFor)}
                      </span>
                    ) : null}
                    <div style={{ fontSize: 16 }}>{r.customerNameSnapshot || r.customer.name}</div>
                    {r.table?.name ? <span className="badge">Mesa {r.table.name}</span> : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"} ·
                    {r.reservedFor ? ` ${formatDDMMYY(r.reservedFor)}` : ""}
                  </div>
                  {r.notes ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "rgba(255, 149, 0, 0.08)",
                        border: "1px solid rgba(255, 149, 0, 0.22)",
                        fontWeight: 800
                      }}
                    >
                      {r.notes}
                    </div>
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
