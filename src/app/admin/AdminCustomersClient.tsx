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

    const sorted = searched.slice().sort((a, b) => {
      const shouldGroupPhoneFirst = sortKey === "name" || sortKey === "last";
      if (shouldGroupPhoneFirst) {
        const aHasPhone = Boolean(String(a.phone || "").trim());
        const bHasPhone = Boolean(String(b.phone || "").trim());
        if (aHasPhone !== bHasPhone) return aHasPhone ? -1 : 1;
      }

      const dir = sortDir === "asc" ? 1 : -1;

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

      // name
      const cmp = String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      return cmp * dir;
    });

    return sorted;
  }, [rows, remoteRows, segmentRows, phoneFilter, sortKey, sortDir, q]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const allVisibleSelected = useMemo(() => {
    if (visible.length === 0) return false;
    return visible.every((r) => Boolean(selected[r.id]));
  }, [visible, selected]);

  const someVisibleSelected = useMemo(() => {
    return visible.some((r) => Boolean(selected[r.id]));
  }, [visible, selected]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next: Record<string, boolean> = { ...prev };
      const want = !allVisibleSelected;
      for (const r of visible) next[r.id] = want;
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
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

      {visible.map((c) => (
        <div key={c.id} className="card" style={{ padding: 10 }}>
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
                <input type="checkbox" checked={Boolean(selected[c.id])} onChange={() => toggleOne(c.id)} />
              </label>
            ) : null}

            <div style={{ flex: 2, fontWeight: 800 }}>{c.name || "(Sin nombre)"}</div>
            <div style={{ flex: 1 }} className="small">
              {c.phone || "—"}
            </div>
            <div style={{ flex: 2 }} className="small">
              {c.email || "—"}
            </div>
            <div style={{ flex: 1 }} className="small">
              {c.lastVisitAt ? formatDateDDMMYY(c.lastVisitAt) : "—"}
            </div>
            <div style={{ flex: 1, textAlign: "right" }} className="small">
              {c.visitsCount}
            </div>
            <div style={{ flex: 1, textAlign: "right" }} className="small">
              {c.surveysCount}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
