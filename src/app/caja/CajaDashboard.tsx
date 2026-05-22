"use client";

import { useMemo, useState } from "react";

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

type Table = {
  id: string;
  name: string;
  area?: string | null;
  status: "LIBRE" | "OCUPADA" | "RESERVADA" | string;
};

type ActiveItem = {
  id: string;
  status: string;
  reservedFor: Date | null;
  customer: { name: string };
  table: { id: string; name: string; area?: string | null } | null;
  tables?: Array<{ id: string; name: string; area?: string | null }>;
};

type Mode = "active" | "occupied" | "free" | "remaining";

export default function CajaDashboard({
  tables,
  active,
  remainingTodayList,
  occupiedNowCount,
  freeNowCount,
  remainingTodayCount
}: {
  tables: Table[];
  active: ActiveItem[];
  remainingTodayList: ActiveItem[];
  occupiedNowCount: number;
  freeNowCount: number;
  remainingTodayCount: number;
}) {
  const [mode, setMode] = useState<Mode>("occupied");

  const occupiedTables = useMemo(() => {
    return tables
      .filter((t) => t.status === "OCUPADA")
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  }, [tables]);

  const seatedByTableId = useMemo(() => {
    const m = new Map<string, ActiveItem>();
    for (const r of active) {
      if (r.status !== "SEATED") continue;
      const tids = Array.isArray(r.tables) && r.tables.length > 0 ? r.tables.map((t) => String(t.id)) : [String(r.table?.id ?? "")];
      for (const tid of tids) {
        if (!tid) continue;
        m.set(tid, r);
      }
    }
    return m;
  }, [active]);

  const freeTables = useMemo(() => {
    return tables
      .filter((t) => t.status === "LIBRE")
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  }, [tables]);

  const remainingToday = useMemo(() => {
    return remainingTodayList
      .slice()
      .sort((a, b) => {
        const aa = a.reservedFor ? a.reservedFor.getTime() : 0;
        const bb = b.reservedFor ? b.reservedFor.getTime() : 0;
        return aa - bb;
      });
  }, [remainingTodayList]);

  const modeTitle =
    mode === "occupied"
      ? "Mesas ocupadas ahora"
      : mode === "free"
        ? "Mesas libres ahora"
        : mode === "remaining"
          ? "Reservas restantes (hoy)"
          : "Reservas activas";

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Caja — Liberar mesa</h2>
        <div className="small">Al cobrar, libera la mesa para que hostess la reasigne.</div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button
            type="button"
            className="badge"
            onClick={() => setMode("occupied")}
            style={{ cursor: "pointer" }}
          >
            Ocupadas ahora: {occupiedNowCount}
          </button>
          <button type="button" className="badge" onClick={() => setMode("free")} style={{ cursor: "pointer" }}>
            Libres ahora: {freeNowCount}
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => setMode("remaining")}
            style={{ cursor: "pointer" }}
          >
            Reservas restantes (hoy): {remainingTodayCount}
          </button>
        </div>
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Operación</h3>
        <div style={{ fontWeight: 800, marginTop: 6 }}>{modeTitle}</div>
        {mode === "remaining" || mode === "active" ? (
          <div className="small" style={{ marginTop: 4 }}>
            Mostrando solo lo relevante para operar ahora.
          </div>
        ) : null}

        {mode === "active" ? (
          <>
            {active.length === 0 ? <div className="small" style={{ marginTop: 8 }}>Sin registros</div> : null}
            <div className="grid" style={{ marginTop: 8 }}>
              {active.map((r) => (
                <div key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{r.customer.name}</div>
                    <div className="small">
                      Mesas {Array.isArray(r.tables) && r.tables.length > 0 ? r.tables.map((t) => t.name).join(", ") : r.table?.name ?? "(sin mesa)"}
                      {r.status ? ` · ${r.status}` : ""}
                      {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}, ${formatHHMM(r.reservedFor)}` : ""}
                    </div>
                  </div>
                  {r.status === "SEATED" ? (
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(Array.isArray(r.tables) && r.tables.length > 0 ? r.tables : r.table ? [r.table] : []).map((t) => (
                        <form key={t.id} action="/api/tables/free" method="post" style={{ flex: "0 0 auto" }}>
                          <input type="hidden" name="tableId" value={t.id} />
                          <button className="btn" type="submit">
                            Liberar {t.name}
                          </button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

      {mode === "occupied" ? (
        <>
          {occupiedTables.length === 0 ? <div className="small" style={{ marginTop: 10 }}>Sin registros</div> : null}
          <div className="grid" style={{ marginTop: 10 }}>
            {occupiedTables.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Mesa {t.name}</div>
                  <div className="small">{t.area}</div>
                  {seatedByTableId.get(t.id)?.customer?.name ? (
                    <div className="small" style={{ marginTop: 2 }}>
                      {seatedByTableId.get(t.id)!.customer.name}
                    </div>
                  ) : null}
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
        </>
      ) : null}

      {mode === "free" ? (
        <>
          {freeTables.length === 0 ? <div className="small" style={{ marginTop: 10 }}>Sin registros</div> : null}
          <div className="grid" style={{ marginTop: 10 }}>
            {freeTables.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Mesa {t.name}</div>
                  <div className="small">{t.area}</div>
                </div>
                <div className="small" style={{ flex: "0 0 auto" }}>
                  Libre
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {mode === "remaining" ? (
        <>
          {remainingToday.length === 0 ? <div className="small" style={{ marginTop: 10 }}>Sin registros</div> : null}
          <div className="grid" style={{ marginTop: 10 }}>
            {remainingToday.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{r.customer.name}</div>
                  <div className="small">
                    Mesa {r.table?.name ?? "(sin mesa)"}
                    {r.table?.area ? ` · ${r.table.area}` : ""}
                    {r.reservedFor ? ` · ${formatDDMMYY(r.reservedFor)}, ${formatHHMM(r.reservedFor)}` : ""}
                  </div>
                </div>
                <div className="small" style={{ flex: "0 0 auto" }}>
                  RESERVED
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      </div>
    </>
  );
}
