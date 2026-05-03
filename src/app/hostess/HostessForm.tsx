"use client";

import { useEffect, useMemo, useState } from "react";
import type { CafeTable } from "@/lib/firestore";

function defaultDateTime() {
  const d = new Date();
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const rounded = (Math.floor(minutes / 15) + 1) * 15;
  if (rounded >= 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }

  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`
  };
}

const pos: Record<string, { x: number; y: number }> = {
  // Interior (center)
  "1": { x: 55, y: 58 },
  "2": { x: 55, y: 49 },
  "3": { x: 55, y: 40 },

  // Terraza lateral (left column)
  "4": { x: 34, y: 35 },
  "5": { x: 34, y: 43 },
  "6": { x: 34, y: 51 },
  "7": { x: 24, y: 86 },
  "8": { x: 24, y: 77 },
  "9": { x: 24, y: 68 },
  "10": { x: 18, y: 46 },
  "11": { x: 18, y: 30 },
  "12": { x: 18, y: 38 },
  "13": { x: 18, y: 54 },

  // Terraza frontal (top right)
  "14": { x: 72, y: 30 },
  "15": { x: 72, y: 18 },
  "16": { x: 82, y: 18 },
  "17": { x: 92, y: 18 },
  "18": { x: 88, y: 30 }
};

function statusClass(status: string) {
  if (status === "LIBRE") return "libre";
  if (status === "OCUPADA") return "ocupada";
  if (status === "RESERVADA") return "reservada";
  if (status === "PROXIMA") return "proxima";
  return "porlimpiar";
}

function effectiveStatus(t: CafeTable) {
  const next = (t as any).nextReservedFor as number | null | undefined;
  if (!next) {
    if (t.status === "RESERVADA") return "LIBRE";
    return t.status;
  }
  const now = Date.now();
  const windowMs = 3 * 60 * 60 * 1000;
  const soonMs = 30 * 60 * 1000;

  const inWindow = next - now <= windowMs && next - now >= -windowMs;
  if (inWindow) {
    const diff = next - now;
    if (diff > 0 && diff <= soonMs) return "PROXIMA";
    return "RESERVADA";
  }

  // Legacy/backfill behavior: if a future reservation had set status=RESERVADA,
  // allow operating today by treating it as free until it's within the window.
  if (t.status === "RESERVADA") return "LIBRE";

  return t.status;
}

function effectiveStatusAt(t: CafeTable, targetMs: number | null) {
  const next = (t as any).nextReservedFor as number | null | undefined;
  if (targetMs && next) {
    const toleranceMs = 15 * 60 * 1000;
    if (Math.abs(next - targetMs) <= toleranceMs) return "RESERVADA";
  }
  return effectiveStatus(t);
}

export default function HostessForm({
  tables,
  initialTableId
}: {
  tables: CafeTable[];
  initialTableId?: string;
}) {
  const defaults = useMemo(() => defaultDateTime(), []);
  const [reservedDate, setReservedDate] = useState<string>(defaults.date);
  const [reservedTime, setReservedTime] = useState<string>(defaults.time);
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const reservedForMs = useMemo(() => {
    const ds = String(reservedDate || "").trim();
    const ts = String(reservedTime || "").trim();
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
  }, [reservedDate, reservedTime]);

  useEffect(() => {
    setTableId(initialTableId ?? "");
  }, [initialTableId]);

  const tablesForPicker = useMemo(
    () =>
      [...tables].sort((a, b) => {
        const an = Number.parseInt(String(a.name), 10);
        const bn = Number.parseInt(String(b.name), 10);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.name).localeCompare(String(b.name));
      }),
    [tables]
  );

  return (
    <div className="hostess-form-grid">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Crear reserva / Asignar mesa</h3>
        <form
          className="grid"
          action="/api/reservations/create"
          method="post"
          onSubmit={(e) => {
            const hasPhone = phone.trim().length > 0;
            const hasEmail = email.trim().length > 0;
            if (!hasPhone && !hasEmail) {
              const ok = window.confirm(
                "Estás a punto de guardar una reserva SIN datos de contacto (WhatsApp/correo).\n\nCualquiera podría reclamar la reservación. ¿Deseas continuar?"
              );
              if (!ok) e.preventDefault();
            }
          }}
        >
          <div>
            <label className="label">Nombre</label>
            <input className="input" name="name" required />
          </div>
          <div>
            <label className="label">Teléfono (WhatsApp)</label>
            <input className="input" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Correo (opcional)</label>
            <input
              className="input"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Personas</label>
            <input className="input" name="partySize" type="number" min={1} step={1} inputMode="numeric" />
          </div>
          <div>
            <label className="label">Indicaciones especiales / notas</label>
            <textarea className="input" name="notes" rows={3} placeholder="Cumpleaños, celebración, alergias, etc." />
          </div>
          <div>
            <label className="label">Fecha</label>
            <input
              className="input"
              name="reservedDate"
              value={reservedDate}
              onChange={(e) => setReservedDate(e.target.value)}
              type="date"
            />
          </div>
          <div>
            <label className="label">Hora</label>
            <input
              className="input"
              name="reservedTime"
              value={reservedTime}
              onChange={(e) => setReservedTime(e.target.value)}
              type="time"
              step={900}
              inputMode="numeric"
            />
          </div>

          <input type="hidden" name="tableId" value={tableId} />

          <div>
            <label className="label">Mesa (opcional)</label>
            <select className="input" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">(sin asignar)</option>
              {tablesForPicker.map((t) => {
                const s = effectiveStatusAt(t, reservedForMs);
                return (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.area}) · {s}
                </option>
                );
              })}
            </select>
          </div>

          <button className="btn" type="submit">
            Guardar
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mesas</h3>
        {tables.length === 0 ? (
          <div className="small">Sin mesas cargadas.</div>
        ) : (
          <div className="table-map" role="group" aria-label="Croquis de mesas">
            {tables.map((t) => {
              const p = pos[String(t.name)] ?? null;
              const s = effectiveStatusAt(t, reservedForMs);
              const cls = `table-chip ${statusClass(s)} ${tableId === t.id ? "selected" : ""}`;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cls}
                  disabled={s !== "LIBRE"}
                  style={
                    p
                      ? ({ left: `${p.x}%`, top: `${p.y}%` } as any)
                      : ({ position: "static" } as any)
                  }
                  onClick={() => {
                    if (s !== "LIBRE") return;
                    setTableId(t.id);
                    const url = new URL(window.location.href);
                    url.searchParams.set("tableId", t.id);
                    window.history.replaceState(null, "", url.toString());
                  }}
                  title={`${t.name} · ${t.area} · ${s}`}
                >
                  {t.name}
                </button>
              );
            })}

            <div className="table-map-legend">
              <div className="small">Toca una mesa libre para seleccionarla.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
