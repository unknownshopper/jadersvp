"use client";

import { useMemo, useState } from "react";
import { formatDateDDMMYY } from "@/lib/dateFormat";

type Row = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  visitsCount: number;
  surveysCount: number;
  visits: Array<{ reservationId: string; at: number }>;
};

export default function AdminCustomersClient({
  rows,
  canDelete
}: {
  rows: Row[];
  canDelete: boolean;
}) {
  const sorted = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" }));
  }, [rows]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const allVisibleSelected = useMemo(() => {
    if (sorted.length === 0) return false;
    return sorted.every((r) => Boolean(selected[r.id]));
  }, [sorted, selected]);

  const someVisibleSelected = useMemo(() => {
    return sorted.some((r) => Boolean(selected[r.id]));
  }, [sorted, selected]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next: Record<string, boolean> = { ...prev };
      const want = !allVisibleSelected;
      for (const r of sorted) next[r.id] = want;
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

        <div style={{ flex: 2 }}>Nombre</div>
        <div style={{ flex: 1 }}>Teléfono</div>
        <div style={{ flex: 2 }}>Correo</div>
        <div style={{ flex: 1, textAlign: "right" }}>Visitas</div>
        <div style={{ flex: 1, textAlign: "right" }}>Encuestas</div>

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

      {sorted.map((c) => (
        <details key={c.id} className="card" style={{ padding: 10 }}>
          <summary style={{ cursor: "pointer" }}>
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
                  onClick={(e) => e.stopPropagation()}
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
              <div style={{ flex: 1, textAlign: "right" }} className="small">
                {c.visitsCount}
              </div>
              <div style={{ flex: 1, textAlign: "right" }} className="small">
                {c.surveysCount}
              </div>
            </div>
          </summary>

          <div className="small" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(c.visits ?? []).slice(0, 20).map((v) => (
              <span key={v.reservationId} className="badge" style={{ display: "inline-flex", gap: 8 }}>
                <span>{formatDateDDMMYY(v.at)}</span>
              </span>
            ))}
            {(c.visits ?? []).length > 20 ? <span className="badge">+{(c.visits ?? []).length - 20} más</span> : null}
          </div>
        </details>
      ))}
    </div>
  );
}
