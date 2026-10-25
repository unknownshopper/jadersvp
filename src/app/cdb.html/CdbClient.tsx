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
  visits: Array<{ reservationId: string; at: number; name?: string }>;
  lastVisitAt: number | null;
};

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
  visits: Array<{ reservationId: string; at: number; name?: string }>;
};

type SortKey = "name" | "phone" | "email" | "last" | "visits" | "surveys";

export default function CdbClient({ canDelete }: { canDelete: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>("");
  const [phoneFilter, setPhoneFilter] = useState<"all" | "with" | "without">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [q, setQ] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/customers/data?limit=2000", { credentials: "same-origin" });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as { rows: Row[] };
        if (!alive) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err: any) {
        if (!alive) return;
        setError(typeof err?.message === "string" ? err.message : "No se pudo cargar");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const baseRows = rows ?? [];
    const qq = String(q || "").trim().toLowerCase();

    const base = baseRows.filter((r) => {
      const hasPhone = Boolean(String(r.phone || "").trim());
      if (phoneFilter === "with") return hasPhone;
      if (phoneFilter === "without") return !hasPhone;
      return true;
    });

    const searched = qq
      ? base.filter((r) => `${r.name || ""} ${r.phone || ""} ${r.email || ""}`.toLowerCase().includes(qq))
      : base;

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
      if (sortKey === "visits" || sortKey === "surveys") {
        const av = Number(sortKey === "visits" ? a.visitsCount : a.surveysCount);
        const bv = Number(sortKey === "visits" ? b.visitsCount : b.surveysCount);
        if (av !== bv) return (av - bv) * dir;
      }
      if (sortKey === "last") {
        const av = a.lastVisitAt ?? 0;
        const bv = b.lastVisitAt ?? 0;
        if (av !== bv) return (av - bv) * dir;
      }
      if (sortKey === "phone" || sortKey === "email") {
        const av = sortKey === "phone" ? String(a.phone || "") : a.emails.join(" ");
        const bv = sortKey === "phone" ? String(b.phone || "") : b.emails.join(" ");
        const cmp = av.localeCompare(bv, "es", { sensitivity: "base" });
        if (cmp !== 0) return cmp * dir;
      }
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) * dir;
    });

    return grouped;
  }, [rows, phoneFilter, sortKey, sortDir, q]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const allVisibleSelected = useMemo(() => {
    if (groups.length === 0) return false;
    return groups.every((g) => g.ids.every((id) => Boolean(selected[id])));
  }, [groups, selected]);

  const someVisibleSelected = useMemo(
    () => groups.some((g) => g.ids.some((id) => Boolean(selected[id]))),
    [groups, selected]
  );

  function applySort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir(nextKey === "name" || nextKey === "phone" || nextKey === "email" ? "asc" : "desc");
    }
  }

  function sortArrow(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = { ...prev };
      const want = !allVisibleSelected;
      for (const g of groups) for (const id of g.ids) next[id] = want;
      return next;
    });
  }

  function toggleGroup(ids: string[]) {
    setSelected((prev) => {
      const next = { ...prev };
      const want = !ids.every((id) => Boolean(prev[id]));
      for (const id of ids) next[id] = want;
      return next;
    });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onDeleteSelected() {
    if (!canDelete || selectedIds.length === 0) return;
    const ok = window.confirm(
      `Eliminar ${selectedIds.length} cliente(s)? Esto también borra reservas/encuestas relacionadas.`
    );
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

  const stats = useMemo(() => {
    const all = rows ?? [];
    const withPhone = all.filter((r) => String(r.phone || "").trim()).length;
    return { total: all.length, withPhone, withoutPhone: all.length - withPhone };
  }, [rows]);

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Base de datos (clientes)</h2>
        <div className="small">
          Total: {stats.total} · Con teléfono: {stats.withPhone} · Sin teléfono: {stats.withoutPhone} ·
          Mostrando {groups.length} ficha(s)
        </div>
      </div>

      <div
        className="row"
        style={{ fontWeight: 900, opacity: 0.9, gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        {canDelete ? (
          <label className="row" style={{ gap: 8, flex: "0 0 auto", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
              }}
              onChange={toggleAllVisible}
            />
            <span className="small" style={{ flex: "0 0 auto" }}>
              Seleccionar
            </span>
          </label>
        ) : null}

        <div className="row" style={{ gap: 8, flex: "0 0 auto", flexWrap: "wrap" }}>
          <button type="button" className="badge" onClick={() => setPhoneFilter("all")} style={{ opacity: phoneFilter === "all" ? 1 : 0.65 }}>
            Todos
          </button>
          <button type="button" className="badge" onClick={() => setPhoneFilter("with")} style={{ opacity: phoneFilter === "with" ? 1 : 0.65 }}>
            Con teléfono
          </button>
          <button type="button" className="badge" onClick={() => setPhoneFilter("without")} style={{ opacity: phoneFilter === "without" ? 1 : 0.65 }}>
            Sin teléfono
          </button>
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 220 }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nombre, teléfono, correo)"
          />
        </div>

        {canDelete ? (
          <button
            className="btn danger"
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedIds.length === 0}
            style={{ flex: "0 0 auto", padding: "8px 10px", opacity: selectedIds.length === 0 ? 0.55 : 1 }}
          >
            Eliminar seleccionados ({selectedIds.length})
          </button>
        ) : null}
      </div>

      <div className="row" style={{ gap: 10, alignItems: "center", opacity: 0.9, fontWeight: 900, padding: "0 4px" }}>
        {canDelete ? <div style={{ width: 26, flex: "0 0 auto" }} /> : null}
        <button type="button" className="badge" onClick={() => applySort("name")} style={{ flex: 2, textAlign: "left", cursor: "pointer", opacity: sortKey === "name" ? 1 : 0.7 }}>
          Nombre{sortArrow("name")}
        </button>
        <button type="button" className="badge" onClick={() => applySort("phone")} style={{ flex: 1, textAlign: "left", cursor: "pointer", opacity: sortKey === "phone" ? 1 : 0.7 }}>
          Teléfono{sortArrow("phone")}
        </button>
        <button type="button" className="badge" onClick={() => applySort("email")} style={{ flex: 2, textAlign: "left", cursor: "pointer", opacity: sortKey === "email" ? 1 : 0.7 }}>
          Correo{sortArrow("email")}
        </button>
        <button type="button" className="badge" onClick={() => applySort("last")} style={{ flex: 1, textAlign: "left", cursor: "pointer", opacity: sortKey === "last" ? 1 : 0.7 }}>
          Última visita{sortArrow("last")}
        </button>
        <button type="button" className="badge" onClick={() => applySort("visits")} style={{ flex: 1, textAlign: "right", cursor: "pointer", opacity: sortKey === "visits" ? 1 : 0.7 }}>
          Visitas{sortArrow("visits")}
        </button>
        <button type="button" className="badge" onClick={() => applySort("surveys")} style={{ flex: 1, textAlign: "right", cursor: "pointer", opacity: sortKey === "surveys" ? 1 : 0.7 }}>
          Encuestas{sortArrow("surveys")}
        </button>
      </div>

      {rows == null && !error ? <div className="card small">Cargando clientes…</div> : null}
      {error ? <div className="card small">{error}</div> : null}
      {rows != null && !error && groups.length === 0 ? <div className="card small">Sin resultados</div> : null}

      {groups.map((g) => {
        const isOpen = Boolean(expanded[g.key]);
        const allSel = g.ids.every((id) => Boolean(selected[id]));
        const someSel = g.ids.some((id) => Boolean(selected[id]));
        return (
          <div key={g.key} className="card" style={{ padding: 10 }}>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              {canDelete ? (
                <label style={{ flex: "0 0 auto", width: 26, display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
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
                  fontSize: "inherit",
                  color: "inherit"
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
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "2px 18px" }}>
                    {g.visits.map((v) => (
                      <div
                        key={v.reservationId}
                        className="small"
                        style={{
                          display: "flex",
                          gap: 10,
                          padding: "3px 0",
                          borderBottom: "1px dashed rgba(15, 23, 42, 0.10)"
                        }}
                      >
                        <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>{formatDateDDMMYY(v.at)}</span>
                        <span style={{ fontWeight: 700 }}>{String(v.name || "").trim() || "—"}</span>
                      </div>
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
