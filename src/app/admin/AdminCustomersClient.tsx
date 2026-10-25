"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateDDMMYY } from "@/lib/dateFormat";

type Row = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  visitsCount: number;
  surveysCount: number;
  visits: Array<{ reservationId: string; at: number }>;
  lastVisitAt: number | null;
};

export default function AdminCustomersClient({
  rows,
  canDelete
}: {
  rows: Row[];
  canDelete: boolean;
}) {
  const [phoneFilter, setPhoneFilter] = useState<"all" | "with" | "without">("with");
  const [sortKey, setSortKey] = useState<"name" | "last" | "visits" | "surveys">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [q, setQ] = useState<string>("");
  const [remoteRows, setRemoteRows] = useState<Row[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState<boolean>(false);
  const [remoteError, setRemoteError] = useState<string>("");
  const [segmentRows, setSegmentRows] = useState<Row[] | null>(null);
  const [segmentLoading, setSegmentLoading] = useState<boolean>(false);
  const [segmentError, setSegmentError] = useState<string>("");

  function applySort(nextKey: "name" | "last" | "visits" | "surveys") {
    setSortKey((prev) => {
      if (prev === nextKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(nextKey === "name" ? "asc" : "desc");
      return nextKey;
    });
  }

  useEffect(() => {
    let alive = true;
    const qq = String(q || "").trim();
    if (qq.length < 2) {
      setRemoteRows(null);
      setRemoteError("");
      setRemoteLoading(false);
      return () => {
        alive = false;
      };
    }

    setRemoteLoading(true);
    setRemoteError("");
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(qq)}&limit=60`);
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as { rows: Row[] };
        if (!alive) return;
        setRemoteRows(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err: any) {
        if (!alive) return;
        setRemoteError(typeof err?.message === "string" ? err.message : "No se pudo buscar");
        setRemoteRows([]);
      } finally {
        if (!alive) return;
        setRemoteLoading(false);
      }
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    let alive = true;
    const qq = String(q || "").trim();
    if (qq.length >= 2) {
      // Search mode is handled by remoteRows.
      setSegmentRows(null);
      setSegmentError("");
      setSegmentLoading(false);
      return () => {
        alive = false;
      };
    }

    // When filtering by phone segments, load complete segment so buttons reflect full dataset.
    if (phoneFilter === "with" || phoneFilter === "without") {
      setSegmentLoading(true);
      setSegmentError("");
      const t = window.setTimeout(async () => {
        try {
          const res = await fetch(`/api/admin/customers/list?phone=${encodeURIComponent(phoneFilter)}&limit=1000`);
          if (!res.ok) throw new Error(await res.text());
          const json = (await res.json()) as { rows: Row[] };
          if (!alive) return;
          setSegmentRows(Array.isArray(json?.rows) ? json.rows : []);
        } catch (err: any) {
          if (!alive) return;
          setSegmentError(typeof err?.message === "string" ? err.message : "No se pudo cargar");
          setSegmentRows([]);
        } finally {
          if (!alive) return;
          setSegmentLoading(false);
        }
      }, 80);

      return () => {
        alive = false;
        window.clearTimeout(t);
      };
    }

    setSegmentRows(null);
    setSegmentError("");
    setSegmentLoading(false);
    return () => {
      alive = false;
    };
  }, [phoneFilter, q]);

  type Group = {
    key: string;
    ids: string[];
    name: string;
    extraNames: string[];
    phone: string;
    emails: string[];
    visitsCount: number;
    surveysCount: number;
    lastVisitAt: number | null;
    visits: Array<{ reservationId: string; at: number }>;
  };

  const visible = useMemo(() => {
    const baseRows = remoteRows ? remoteRows : segmentRows ? segmentRows : rows;
    const qq = String(q || "").trim().toLowerCase();

    const base = baseRows.filter((r) => {
      const hasPhone = Boolean(String(r.phone || "").trim());
      if (phoneFilter === "with") return hasPhone;
      if (phoneFilter === "without") return !hasPhone;
      return true;
    });

    const searched = qq
      ? base.filter((r) => {
          const hay = `${r.name || ""} ${r.phone || ""} ${r.email || ""}`.toLowerCase();
          return hay.includes(qq);
        })
      : base;

    // One card per phone number: repeated numbers merge into a single
    // recurring-customer card with the combined visit history.
    const byKey = new Map<string, Group>();
    for (const r of searched) {
      const digits = String(r.phone || "").replace(/\D/g, "");
      const key = digits ? `p:${digits}` : `id:${r.id}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          ids: [],
          name: "",
          extraNames: [],
          phone: String(r.phone || ""),
          emails: [],
          visitsCount: 0,
          surveysCount: 0,
          lastVisitAt: null,
          visits: []
        };
        byKey.set(key, g);
      }
      g.ids.push(r.id);
      const nm = String(r.name || "").trim();
      if (nm) {
        if (!g.name) g.name = nm;
        else if (nm.toLowerCase() !== g.name.toLowerCase() && !g.extraNames.includes(nm)) g.extraNames.push(nm);
      }
      const em = String(r.email || "").trim();
      if (em && !g.emails.includes(em)) g.emails.push(em);
      g.visitsCount += Number(r.visitsCount ?? 0);
      g.surveysCount += Number(r.surveysCount ?? 0);
      for (const v of r.visits ?? []) g.visits.push(v);
      if (r.lastVisitAt != null && (g.lastVisitAt == null || r.lastVisitAt > g.lastVisitAt)) {
        g.lastVisitAt = r.lastVisitAt;
      }
    }

    const grouped = Array.from(byKey.values()).map((g) => ({
      ...g,
      name: g.name || "(Sin nombre)",
      visits: g.visits.slice().sort((a, b) => b.at - a.at)
    }));

    const dir = sortDir === "asc" ? 1 : -1;
    grouped.sort((a, b) => {
      const shouldGroupPhoneFirst = sortKey === "name" || sortKey === "last";
      if (shouldGroupPhoneFirst) {
        const aHasPhone = Boolean(String(a.phone || "").trim());
        const bHasPhone = Boolean(String(b.phone || "").trim());
        if (aHasPhone !== bHasPhone) return aHasPhone ? -1 : 1;
      }

      if (sortKey === "visits") {
        const av = Number(a.visitsCount ?? 0);
        const bv = Number(b.visitsCount ?? 0);
        if (av !== bv) return (av - bv) * dir;
      }

      if (sortKey === "surveys") {
        const av = Number(a.surveysCount ?? 0);
        const bv = Number(b.surveysCount ?? 0);
        if (av !== bv) return (av - bv) * dir;
      }

      if (sortKey === "last") {
        const aTs = a.lastVisitAt ?? 0;
        const bTs = b.lastVisitAt ?? 0;
        if (aTs !== bTs) return (aTs - bTs) * dir;
      }

      const cmp = String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      return cmp * dir;
    });

    return grouped;
  }, [rows, remoteRows, segmentRows, phoneFilter, sortKey, sortDir, q]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const allVisibleSelected = useMemo(() => {
    if (visible.length === 0) return false;
    return visible.every((g) => g.ids.every((id) => Boolean(selected[id])));
  }, [visible, selected]);

  const someVisibleSelected = useMemo(() => {
    return visible.some((g) => g.ids.some((id) => Boolean(selected[id])));
  }, [visible, selected]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next: Record<string, boolean> = { ...prev };
      const want = !allVisibleSelected;
      for (const g of visible) for (const id of g.ids) next[id] = want;
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    setSelected((prev) => {
      const next: Record<string, boolean> = { ...prev };
      const want = !ids.every((id) => Boolean(prev[id]));
      for (const id of ids) next[id] = want;
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onDeleteSelected() {
    if (!canDelete) return;
    if (selectedIds.length === 0) return;

    const ok = window.confirm(`Eliminar ${selectedIds.length} cliente(s)? Esto también borra reservas/encuestas relacionadas.`);
    if (!ok) return;

    const res = await fetch("/api/admin/customers/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerIds: selectedIds })
    });

    if (res.redirected) {
      window.location.assign(res.url);
      return;
    }

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      window.alert(t || "No se pudo borrar");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="grid" style={{ gap: 8 }}>
      <div
        className="row"
        style={{
          fontWeight: 900,
          opacity: 0.9,
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap"
        }}
      >
        {canDelete ? (
          <label className="row" style={{ gap: 8, flex: "0 0 auto", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (!el) return;
                el.indeterminate = !allVisibleSelected && someVisibleSelected;
              }}
              onChange={toggleAllVisible}
            />
            <span className="small" style={{ flex: "0 0 auto" }}>
              Seleccionar
            </span>
          </label>
        ) : null}

        <div className="row" style={{ gap: 8, flex: "0 0 auto", flexWrap: "wrap" }}>
          <button
            type="button"
            className="badge"
            onClick={() => setPhoneFilter("all")}
            style={{ opacity: phoneFilter === "all" ? 1 : 0.65 }}
          >
            Todos
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => setPhoneFilter("with")}
            style={{ opacity: phoneFilter === "with" ? 1 : 0.65 }}
          >
            Con teléfono
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => setPhoneFilter("without")}
            style={{ opacity: phoneFilter === "without" ? 1 : 0.65 }}
          >
            Sin teléfono
          </button>
          {segmentLoading ? <span className="small" style={{ opacity: 0.7 }}>Cargando…</span> : null}
          {!segmentLoading && segmentError ? <span className="small" style={{ opacity: 0.7 }}>{segmentError}</span> : null}
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 220 }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nombre, teléfono, correo)"
          />
          {remoteLoading ? <div className="small" style={{ marginTop: 6 }}>Buscando…</div> : null}
          {!remoteLoading && remoteError ? (
            <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>
              {remoteError}
            </div>
          ) : null}
          {!remoteLoading && remoteRows && !remoteError ? (
            <div className="small" style={{ marginTop: 6, opacity: 0.7 }}>
              Resultados: {remoteRows.length}
            </div>
          ) : null}
        </div>

        <div className="row" style={{ gap: 8, flex: "0 0 auto", flexWrap: "wrap" }}>
          <button
            type="button"
            className="badge"
            onClick={() => applySort("name")}
            style={{ opacity: sortKey === "name" ? 1 : 0.65 }}
          >
            Orden: nombre
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => applySort("last")}
            style={{ opacity: sortKey === "last" ? 1 : 0.65 }}
          >
            Orden: última visita
          </button>
        </div>

        {canDelete ? (
          <button
            className="btn danger"
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedIds.length === 0}
            style={{
              flex: "0 0 auto",
              padding: "8px 10px",
              opacity: selectedIds.length === 0 ? 0.55 : 1
            }}
          >
            Eliminar seleccionados ({selectedIds.length})
          </button>
        ) : null}
      </div>

      <div className="row" style={{ gap: 10, alignItems: "flex-end", opacity: 0.9, fontWeight: 900 }}>
        {canDelete ? <div style={{ width: 26 }} /> : null}
        <button
          type="button"
          className="badge"
          onClick={() => applySort("name")}
          style={{ flex: 2, textAlign: "left", cursor: "pointer", opacity: sortKey === "name" ? 1 : 0.7 }}
        >
          Nombre{sortKey === "name" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
        <div style={{ flex: 1 }}>Teléfono</div>
        <div style={{ flex: 2 }}>Correo</div>
        <button
          type="button"
          className="badge"
          onClick={() => applySort("last")}
          style={{ flex: 1, textAlign: "left", cursor: "pointer", opacity: sortKey === "last" ? 1 : 0.7 }}
        >
          Última visita{sortKey === "last" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
        <button
          type="button"
          className="badge"
          onClick={() => applySort("visits")}
          style={{ flex: 1, textAlign: "right", cursor: "pointer", opacity: sortKey === "visits" ? 1 : 0.7 }}
        >
          Visitas{sortKey === "visits" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
        <button
          type="button"
          className="badge"
          onClick={() => applySort("surveys")}
          style={{ flex: 1, textAlign: "right", cursor: "pointer", opacity: sortKey === "surveys" ? 1 : 0.7 }}
        >
          Encuestas{sortKey === "surveys" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      </div>

      {visible.map((g) => {
        const isOpen = Boolean(expanded[g.key]);
        const allSel = g.ids.every((id) => Boolean(selected[id]));
        const someSel = g.ids.some((id) => Boolean(selected[id]));
        return (
          <div key={g.key} className="card" style={{ padding: 10 }}>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              {canDelete ? (
                <label
                  style={{
                    flex: "0 0 auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allSel}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSel && someSel;
                    }}
                    onChange={() => toggleGroup(g.ids)}
                  />
                </label>
              ) : null}

              <button
                type="button"
                onClick={() => toggleExpanded(g.key)}
                style={{
                  flex: 2,
                  textAlign: "left",
                  fontWeight: 800,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "inherit"
                }}
                title="Ver historial de visitas"
              >
                {isOpen ? "▾" : "▸"} {g.name}
                {g.extraNames.length ? (
                  <span className="small" style={{ fontWeight: 700, opacity: 0.7 }}>
                    {" "}+{g.extraNames.length} nombre(s)
                  </span>
                ) : null}
              </button>
              <div style={{ flex: 1 }} className="small">
                {g.phone || "—"}
              </div>
              <div style={{ flex: 2 }} className="small">
                {g.emails.join(" · ") || "—"}
              </div>
              <div style={{ flex: 1 }} className="small">
                {g.lastVisitAt ? formatDateDDMMYY(g.lastVisitAt) : "—"}
              </div>
              <div style={{ flex: 1, textAlign: "right" }}>
                {g.visitsCount > 0 ? (
                  <span className="badge" style={{ fontWeight: 900 }}>
                    ×{g.visitsCount}
                  </span>
                ) : (
                  <span className="small">0</span>
                )}
              </div>
              <div style={{ flex: 1, textAlign: "right" }} className="small">
                {g.surveysCount}
              </div>
            </div>

            {isOpen ? (
              <div style={{ marginTop: 8, borderTop: "1px solid rgba(15, 23, 42, 0.10)", paddingTop: 8 }}>
                <div className="small" style={{ fontWeight: 800, marginBottom: 6 }}>
                  Visitas ({g.visitsCount})
                </div>
                {g.visits.length === 0 ? (
                  <div className="small" style={{ opacity: 0.7 }}>
                    Sin reservaciones registradas
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {g.visits.map((v) => (
                      <span key={v.reservationId} className="badge">
                        {formatDateDDMMYY(v.at)}
                      </span>
                    ))}
                  </div>
                )}
                {g.extraNames.length ? (
                  <div className="small" style={{ marginTop: 8 }}>
                    También registrado como: {g.extraNames.join(" · ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
