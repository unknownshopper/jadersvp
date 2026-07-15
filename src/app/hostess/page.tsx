import { firebaseReady, listTables, listWaitingReservations, listWaitlistReservations } from "@/lib/firestore";
import HostessForm from "./HostessForm";
import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import OfflineBanner from "../OfflineBanner";
import AutoRefresh from "../AutoRefresh";
import { formatDateDDMMYY, formatDateTimeDDMMYYHHMM, formatTimeHHMM } from "@/lib/dateFormat";

export const dynamic = "force-dynamic";

function badgeClass(status: string) {
  if (status === "LIBRE") return "badge libre";
  if (status === "OCUPADA") return "badge ocupada";
  if (status === "RESERVADA") return "badge reservada";
  return "badge porlimpiar";
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const utcAsTz = new Date(date.toLocaleString("en-US", { timeZone }));
  return date.getTime() - utcAsTz.getTime();
}

function zonedMidnightUtcMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return utcMs + offset;
}

export default async function HostessPage({
  searchParams
}: {
  searchParams?: {
    tableId?: string;
    focusTableId?: string;
    ok?: string;
    err?: string;
    future?: string;
    reservedDate?: string;
    reservedTime?: string;
  };
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

  const initialReservedDate = searchParams?.reservedDate ? String(searchParams.reservedDate) : undefined;
  const initialReservedTime = searchParams?.reservedTime ? String(searchParams.reservedTime) : undefined;

  const targetMs = (() => {
    const ds = initialReservedDate ? String(initialReservedDate).trim() : "";
    const ts = initialReservedTime ? String(initialReservedTime).trim() : "";
    const m = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const t = ts.match(/^(\d{2}):(\d{2})$/);
    if (!m || !t) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const hh = Number(t[1]);
    const mm = Number(t[2]);
    const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
    const ms = dt.getTime();
    return Number.isNaN(ms) ? null : ms;
  })();

  const ready = firebaseReady();
  const [tables, waitingWrapped, waitlistWrapped] = ready
    ? await Promise.all([
        listTables(),
        listWaitingReservations({ allStatuses: false }),
        listWaitlistReservations({ includeOffered: false })
      ])
    : [[], [], []];

  const focusedTable = selectedTableId ? tables.find((t) => t.id === selectedTableId) ?? null : null;

  const focusedHistoryWrapped = ready && selectedTableId
    ? await listWaitingReservations({ tableId: selectedTableId, allStatuses: true })
    : [];

  const focusedVisits = focusedHistoryWrapped
    .filter((w) => String(w.reservation.tableId ?? "") === String(selectedTableId ?? ""))
    .filter((w) => w.reservation.status === "SEATED" || w.reservation.status === "COMPLETED")
    .map((w) => ({
      id: w.reservation.id,
      status: w.reservation.status,
      seatedAt: typeof (w.reservation as any).seatedAt === "number" ? Number((w.reservation as any).seatedAt) : null,
      completedAt: typeof (w.reservation as any).completedAt === "number" ? Number((w.reservation as any).completedAt) : null,
      createdAt: w.reservation.createdAt,
      updatedAt: w.reservation.updatedAt,
      reservedFor: w.reservation.reservedFor ? Number(w.reservation.reservedFor) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      customer: w.customer,
      table: w.table ?? null
    }))
    .sort((a, b) => {
      const aa = a.completedAt ?? a.seatedAt ?? a.updatedAt ?? a.createdAt;
      const bb = b.completedAt ?? b.seatedAt ?? b.updatedAt ?? b.createdAt;
      return bb - aa;
    });

  const focusedVisit = (() => {
    if (!focusedVisits.length) return null;
    if (targetMs == null) return focusedVisits[0];
    const matches = focusedVisits.filter((v) => {
      const start = v.seatedAt ?? v.createdAt;
      const end = v.completedAt ?? (v.status === "SEATED" ? Number.POSITIVE_INFINITY : v.updatedAt ?? v.createdAt);
      return targetMs >= start && targetMs <= end;
    });
    if (matches.length) {
      matches.sort((a, b) => (b.seatedAt ?? b.createdAt) - (a.seatedAt ?? a.createdAt));
      return matches[0];
    }
    // Fallback: closest in time by seatedAt/createdAt.
    const best = focusedVisits
      .slice()
      .sort((a, b) => {
        const da = Math.abs((a.seatedAt ?? a.createdAt) - targetMs);
        const db = Math.abs((b.seatedAt ?? b.createdAt) - targetMs);
        return da - db;
      })[0];
    return best ?? null;
  })();

  function formatDuration(ms: number) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h <= 0) return `${m} min`;
    return `${h} h ${String(m).padStart(2, "0")} min`;
  }

  const focusedQueue = waitingWrapped
    .filter((w) => w.reservation.status === "WAITING" || w.reservation.status === "RESERVED")
    .filter((w) => {
      if (!selectedTableId) return false;
      return String(w.reservation.tableId ?? "") === String(selectedTableId);
    })
    .map((w) => ({
      id: w.reservation.id,
      createdAt: w.reservation.createdAt,
      status: w.reservation.status,
      source: w.reservation.source,
      reservedFor: w.reservation.reservedFor ? new Date(w.reservation.reservedFor) : null,
      partySize: typeof (w.reservation as any).partySize === "number" ? Number((w.reservation as any).partySize) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null,
      tables: w.tables ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : null;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : null;
      if (aMs != null && bMs != null) return aMs - bMs;
      if (aMs != null && bMs == null) return -1;
      if (aMs == null && bMs != null) return 1;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

  const tz = "America/Mexico_City";
  const now = new Date();

  const todayStartMs = zonedMidnightUtcMs(now, tz);
  const todayEndMs = zonedMidnightUtcMs(new Date(now.getTime() + 36 * 60 * 60 * 1000), tz);

  const todayStart = new Date(todayStartMs);
  const todayEnd = new Date(todayEndMs);

  const futureKey = String(searchParams?.future ?? "1");
  const futureStart = new Date(todayEnd);
  const futureEnd = new Date(todayEnd);
  if (futureKey === "next3") {
    futureStart.setDate(futureStart.getDate() + 0);
    futureEnd.setDate(futureEnd.getDate() + 3);
  } else if (futureKey === "next7") {
    futureStart.setDate(futureStart.getDate() + 0);
    futureEnd.setDate(futureEnd.getDate() + 7);
  } else {
    const offsetDays = Math.max(1, Math.min(30, Number.parseInt(futureKey, 10) || 1));
    futureStart.setDate(futureStart.getDate() + (offsetDays - 1));
    futureEnd.setDate(futureEnd.getDate() + offsetDays);
  }

  const futureStartMs = zonedMidnightUtcMs(futureStart, tz);
  const futureEndMs = zonedMidnightUtcMs(futureEnd, tz);

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
      partySize: typeof (w.reservation as any).partySize === "number" ? Number((w.reservation as any).partySize) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null,
      tables: w.tables ?? null
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
      partySize: typeof (w.reservation as any).partySize === "number" ? Number((w.reservation as any).partySize) : null,
      customerNameSnapshot: w.reservation.customerNameSnapshot ?? null,
      notes: w.reservation.notes ?? null,
      createdByRole: (w.reservation as any).createdByRole ?? null,
      customer: w.customer,
      table: w.table ?? null,
      tables: w.tables ?? null
    }))
    .sort((a, b) => {
      const aMs = a.reservedFor ? a.reservedFor.getTime() : 0;
      const bMs = b.reservedFor ? b.reservedFor.getTime() : 0;
      return aMs - bMs;
    });

  const nowMs = Date.now();

  const noShowAfterMs = 10 * 60 * 1000;

  return (
    <div className="hostess-page">
      <AutoRefresh intervalMs={5000} />
      <div className="hostess-page-left grid" style={{ gap: 16 }}>
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

        <HostessForm
          tables={tables}
          waitlist={waitlistWrapped}
          initialTableId={searchParams?.tableId ? String(searchParams.tableId) : ""}
          initialReservedDate={initialReservedDate}
          initialReservedTime={initialReservedTime}
        />

        {focusedTable ? (
          <div className="card requires-online" style={{ borderColor: "rgba(168, 85, 247, 0.28)" }}>
            <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900 }}>Mesa {focusedTable.name}</div>
                <div className="small" style={{ opacity: 0.85 }}>
                  Acciones rápidas (Sentar / No show)
                </div>
                {targetMs != null ? (
                  <div className="small" style={{ marginTop: 4 }}>
                    Consulta: {formatDateDDMMYY(targetMs)}, {formatTimeHHMM(targetMs)}
                  </div>
                ) : null}
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

            <div className="card" style={{ marginTop: 10, background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ fontWeight: 900 }}>Vista previa (visita)</div>
              {!focusedVisit ? (
                <div className="small" style={{ marginTop: 6 }}>
                  Sin datos de visita para esta mesa.
                </div>
              ) : (
                <div className="small" style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{focusedVisit.customer?.name ?? "(Sin nombre)"}</div>
                  {focusedVisit.customer?.phone ? <div>{focusedVisit.customer.phone}</div> : null}
                  {focusedVisit.customer?.email ? <div>{focusedVisit.customer.email}</div> : null}
                  <div style={{ marginTop: 6 }}>
                    Estado: <span className={badgeClass(focusedVisit.status)}>{focusedVisit.status}</span>
                  </div>
                  {focusedVisit.seatedAt ? (
                    <div>Sentado: {formatDateTimeDDMMYYHHMM(focusedVisit.seatedAt)}</div>
                  ) : (
                    <div>Sentado: —</div>
                  )}
                  {focusedVisit.completedAt ? (
                    <div>Liberación: {formatDateTimeDDMMYYHHMM(focusedVisit.completedAt)}</div>
                  ) : (
                    <div>Liberación: —</div>
                  )}
                  {focusedVisit.seatedAt && focusedVisit.completedAt ? (
                    <div>Permanencia: {formatDuration(focusedVisit.completedAt - focusedVisit.seatedAt)}</div>
                  ) : null}
                  {focusedVisit.notes ? <div style={{ marginTop: 6 }}>Notas: {focusedVisit.notes}</div> : null}
                </div>
              )}
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
                            {formatTimeHHMM(r.reservedFor)}
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
                        {r.reservedFor ? ` · ${formatDateDDMMYY(r.reservedFor)}` : ""}
                        {r.partySize ? ` · ${r.partySize} pax` : ""}
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

                      {r.status !== "SEATED" && r.reservedFor && nowMs - r.reservedFor.getTime() >= noShowAfterMs ? (
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
      </div>

      <div className="hostess-page-right grid" style={{ gap: 16 }}>
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
                        {formatTimeHHMM(r.reservedFor)}
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
                    {Array.isArray(r.tables) && r.tables.length > 0
                      ? r.tables.map((t: any) => (
                          <span key={t.id} className="badge">
                            Mesa {t.name}
                          </span>
                        ))
                      : r.table?.name
                        ? (
                            <span className="badge">Mesa {r.table.name}</span>
                          )
                        : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"}
                    {r.reservedFor ? ` · ${formatDateDDMMYY(r.reservedFor)}` : ""}
                    {r.partySize ? ` · ${r.partySize} pax` : ""}
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

                  {r.status !== "SEATED" && r.reservedFor && nowMs - r.reservedFor.getTime() >= noShowAfterMs ? (
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
          {formatDateDDMMYY(futureStart)}
          {futureKey === "next3" || futureKey === "next7" ? ` — ${formatDateDDMMYY(new Date(futureEndMs - 1))}` : ""}
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
                        {formatTimeHHMM(r.reservedFor)}
                      </span>
                    ) : null}
                    <div style={{ fontSize: 16 }}>{r.customerNameSnapshot || r.customer.name}</div>
                    {Array.isArray(r.tables) && r.tables.length > 0
                      ? r.tables.map((t: any) => (
                          <span key={t.id} className="badge">
                            Mesa {t.name}
                          </span>
                        ))
                      : r.table?.name
                        ? (
                            <span className="badge">Mesa {r.table.name}</span>
                          )
                        : null}
                  </div>
                  <div className="small">
                    {r.customer.phone} {r.customer.email ? `· ${r.customer.email}` : ""}
                  </div>
                  <div className="small">
                    {r.status} · {r.source === "CALL" && r.createdByRole === "CAJA" ? "CALL" : "LOCAL"} ·
                    {r.reservedFor ? ` ${formatDateDDMMYY(r.reservedFor)}` : ""}
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
    </div>
  );
}
