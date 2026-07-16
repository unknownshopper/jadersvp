"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CafeTable, Customer, Reservation } from "@/lib/firestore";

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
  if (targetMs) {
    // For planning/scheduling at a chosen date+time, we care about whether this table
    // has a reservation at that target time (via nextReservedFor).
    // Keep real-time operational states as-is.
    if (t.status === "OCUPADA") return "OCUPADA";
    if (t.status === "POR_LIMPIAR") return "POR_LIMPIAR";

    if (next) {
      const toleranceMs = 15 * 60 * 1000;
      if (Math.abs(next - targetMs) <= toleranceMs) return "RESERVADA";

      // Block times that are too close to an existing reservation.
      // Business rule: duration 90 min + buffer 30 min.
      const blockMs = (90 + 30) * 60 * 1000;
      if (Math.abs(next - targetMs) < blockMs) return "RESERVADA";
    }
    return "LIBRE";
  }

  return effectiveStatus(t);
}

export default function HostessForm({
  tables,
  waitlist,
  initialTableId,
  initialReservedDate,
  initialReservedTime
}: {
  tables: CafeTable[];
  waitlist: Array<{ reservation: Reservation; customer: Customer }>;
  initialTableId?: string;
  initialReservedDate?: string;
  initialReservedTime?: string;
}) {
  const router = useRouter();
  const defaults = useMemo(() => defaultDateTime(), []);
  const [reservedDate, setReservedDate] = useState<string>(initialReservedDate ?? defaults.date);
  const [reservedTime, setReservedTime] = useState<string>(initialReservedTime ?? defaults.time);
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(initialTableId ? [initialTableId] : []);
  const [name, setName] = useState<string>("");
  const [phoneCountry, setPhoneCountry] = useState<string>("+52");
  const [phoneNational, setPhoneNational] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [partySize, setPartySize] = useState<string>("1");
  const [partyTouched, setPartyTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedTablesCount, setRequestedTablesCount] = useState<number>(1);
  const [sendWaitlistWhatsApp, setSendWaitlistWhatsApp] = useState<boolean>(true);

  const composedPhone = useMemo(() => {
    const cc = String(phoneCountry || "").trim();
    const national = String(phoneNational || "").replace(/\D/g, "");
    if (!national) return "";
    const ccDigits = cc.replace(/[^\d+]/g, "");
    const prefix = ccDigits.startsWith("+") ? ccDigits : `+${ccDigits}`;
    return `${prefix}${national}`;
  }, [phoneCountry, phoneNational]);

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
    setSelectedTableIds(initialTableId ? [initialTableId] : []);
  }, [initialTableId]);

  useEffect(() => {
    if (partyTouched) return;
    const suggested = Math.max(1, selectedTableIds.length * 4);
    setPartySize(String(suggested));
  }, [selectedTableIds, partyTouched]);

  useEffect(() => {
    const suggested = Math.max(1, selectedTableIds.length || 1);
    setRequestedTablesCount((prev) => {
      if (prev > 1) return prev;
      return suggested;
    });
  }, [selectedTableIds]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("reservedDate", reservedDate);
    url.searchParams.set("reservedTime", reservedTime);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [reservedDate, reservedTime, router]);

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

  const pendingFreed = useMemo(() => {
    const now = Date.now();
    return tables
      .filter((t) => t.status === "POR_LIMPIAR" && typeof (t as any).lastFreedAt === "number")
      .slice()
      .sort((a, b) => Number((b as any).lastFreedAt) - Number((a as any).lastFreedAt))
      .filter((t) => now - Number((t as any).lastFreedAt) <= 60 * 60 * 1000)
      .slice(0, 12);
  }, [tables]);

  return (
    <div className="hostess-form-grid">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Crear reserva / Asignar mesa</h3>
        <form
          className="grid"
          action="/api/reservations/call"
          method="post"
          onSubmit={(e) => {
            if (isSubmitting) {
              e.preventDefault();
              return;
            }
            if (!tableId) {
              if (!partyTouched) {
                e.preventDefault();
                window.alert("Si no seleccionas mesa, debes ingresar la cantidad de personas.");
                return;
              }
              const ok = window.confirm("¿No se va a seleccionar mesa?");
              if (!ok) {
                e.preventDefault();
                return;
              }
            }

            const hasPhone = composedPhone.trim().length > 0;
            const hasEmail = email.trim().length > 0;
            if (!hasPhone && !hasEmail) {
              const ok = window.confirm(
                "Estás a punto de guardar una reserva SIN datos de contacto (WhatsApp/correo).\n\nCualquiera podría reclamar la reservación. ¿Deseas continuar?"
              );
              if (!ok) e.preventDefault();
            }

            setIsSubmitting(true);
          }}
        >
          <div>
            <label className="label">Nombre</label>
            <input
              className="input"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="label">Teléfono (WhatsApp)</label>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <select
                className="input"
                value={phoneCountry}
                onChange={(e) => setPhoneCountry(e.target.value)}
                aria-label="País"
                style={{ maxWidth: 120 }}
              >
                <option value="+52">MX +52</option>
                <option value="+1">US/CA +1</option>
                <option value="+34">ES +34</option>
                <option value="+57">CO +57</option>
                <option value="+54">AR +54</option>
                <option value="+55">BR +55</option>
                <option value="+33">FR +33</option>
                <option value="+44">UK +44</option>
              </select>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={phoneCountry === "+52" ? "10 dígitos" : "número"}
                value={phoneNational}
                onChange={(e) => setPhoneNational(e.target.value.replace(/\D/g, ""))}
                style={{ flex: 1, minWidth: 180 }}
              />
            </div>
            <input type="hidden" name="phone" value={composedPhone} />
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
            <input
              className="input"
              name="partySize"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={partySize}
              onChange={(e) => {
                setPartyTouched(true);
                setPartySize(e.target.value);
              }}
            />
            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
              Sugerido: {Math.max(1, selectedTableIds.length * 4)} persona(s) ({selectedTableIds.length || 1} mesa(s) × 4)
            </div>
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
          {selectedTableIds.map((id) => (
            <input key={id} type="hidden" name="tableIds" value={id} />
          ))}

          <div>
            <label className="label">Mesa principal (opcional)</label>
            <select
              className="input"
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
            >
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
            {selectedTableIds.length > 0 ? (
              <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                Mesas seleccionadas: {selectedTableIds.join(", ")}
              </div>
            ) : null}
            <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
              Selección múltiple disponible en el croquis.
            </div>
          </div>

          <button className="btn" type="submit" disabled={isSubmitting} style={isSubmitting ? { opacity: 0.7 } : undefined}>
            {isSubmitting ? "Guardando…" : "Guardar"}
          </button>
        </form>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 800 }}>Lista de espera</div>
          <div className="small" style={{ marginTop: 4, opacity: 0.85 }}>
            Úsalo cuando no haya mesas disponibles. La confirmación se hace después, cuando se liberen mesas.
          </div>

          <form
            className="grid"
            action="/api/waitlist/create"
            method="post"
            onSubmit={(e) => {
              if (isSubmitting) {
                e.preventDefault();
                return;
              }
              if (!name.trim()) {
                e.preventDefault();
                return;
              }
              const hasPhone = composedPhone.trim().length > 0;
              const hasEmail = email.trim().length > 0;
              if (!hasPhone && !hasEmail) {
                const ok = window.confirm(
                  "Estás a punto de guardar en lista de espera SIN datos de contacto (WhatsApp/correo).\n\n¿Deseas continuar?"
                );
                if (!ok) {
                  e.preventDefault();
                  return;
                }
              }
              setIsSubmitting(true);
            }}
          >
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="phone" value={composedPhone} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="notes" value={""} />

            <div>
              <label className="label">Mesas requeridas</label>
              <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setRequestedTablesCount((n) => Math.max(1, n - 1))}
                >
                  -
                </button>
                <input
                  className="input"
                  name="requestedTablesCount"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={requestedTablesCount}
                  onChange={(e) => setRequestedTablesCount(Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1))}
                  style={{ width: 110 }}
                />
                <button type="button" className="btn secondary" onClick={() => setRequestedTablesCount((n) => n + 1)}>
                  +
                </button>
              </div>
              <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                Sugerido: {Math.max(1, requestedTablesCount * 4)} persona(s) ({requestedTablesCount} mesa(s) × 4)
              </div>
            </div>

            <button className="btn secondary" type="submit" disabled={isSubmitting} style={isSubmitting ? { opacity: 0.7 } : undefined}>
              {isSubmitting ? "Guardando…" : "Guardar en lista de espera"}
            </button>
          </form>
        </div>
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
              const isSelected = selectedTableIds.includes(t.id);
              const cls = `table-chip ${statusClass(s)} ${isSelected ? "selected" : ""}`;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cls}
                  disabled={false}
                  style={
                    p
                      ? ({ left: `${p.x}%`, top: `${p.y}%` } as any)
                      : ({ position: "static" } as any)
                  }
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("focusTableId", t.id);
                    if (s === "LIBRE") {
                      setSelectedTableIds((prev) => {
                        const exists = prev.includes(t.id);
                        let next = exists ? prev.filter((x) => x !== t.id) : [...prev, t.id];
                        const primary = next[0] ?? "";
                        setTableId(primary);
                        if (primary) url.searchParams.set("tableId", primary);
                        else url.searchParams.delete("tableId");
                        return next;
                      });
                    }
                    router.replace(url.pathname + url.search, { scroll: false });
                  }}
                  title={`${t.name} · ${t.area} · ${s}`}
                >
                  {t.name}
                </button>
              );
            })}

            <div className="table-map-legend">
              <div className="small" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <span className="table-legend-item">
                  <span className="table-legend-dot libre" />
                  Libre
                </span>
                <span className="table-legend-item">
                  <span className="table-legend-dot proxima" />
                  Próxima (≤30 min)
                </span>
                <span className="table-legend-item">
                  <span className="table-legend-dot ocupada" />
                  Ocupada
                </span>
                <span className="table-legend-item">
                  <span className="table-legend-dot reservada" />
                  Reservada
                </span>
                <span className="table-legend-item">
                  <span className="table-legend-dot porlimpiar" />
                  Por limpiar
                </span>
                <span className="table-legend-item">
                  <span className="table-legend-dot selected" />
                  Seleccionada
                </span>
              </div>
              <div className="small" style={{ opacity: 0.8 }}>Toca una mesa libre para seleccionarla.</div>
            </div>
          </div>
        )}
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Mesas por liberar (sobremesa)</h3>
        <div className="small" style={{ opacity: 0.85 }}>
          Cuando caja libera, la mesa queda en <b>Por limpiar</b>. Confirma aquí cuando de verdad se desocupe.
        </div>
        {pendingFreed.length === 0 ? <div className="small" style={{ marginTop: 8 }}>Sin registros</div> : null}

        {pendingFreed.length > 0 ? (
          <div className="grid" style={{ marginTop: 10 }}>
            {pendingFreed.map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>Mesa {t.name}</div>
                  <div className="small" style={{ opacity: 0.85 }}>
                    {t.area}
                    {typeof (t as any).lastFreedAt === "number"
                      ? ` · Liberada en caja ${new Date(Number((t as any).lastFreedAt)).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}`
                      : ""}
                  </div>
                </div>
                <form action="/api/tables/confirm-free" method="post" style={{ flex: "0 0 auto" }}>
                  <input type="hidden" name="tableId" value={t.id} />
                  <button className="btn" type="submit">
                    Confirmar libre
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card requires-online">
        <h3 style={{ marginTop: 0 }}>Lista de espera (FIFO)</h3>
        {waitlist.length === 0 ? <div className="small">Sin registros</div> : null}

        {waitlist.length > 0 ? (
          <div className="grid" style={{ marginTop: 10 }}>
            {waitlist.map((w) => {
              const requested = typeof (w.reservation as any).requestedTablesCount === "number" ? Number((w.reservation as any).requestedTablesCount) : 1;
              const pax = typeof (w.reservation as any).partySize === "number" ? Number((w.reservation as any).partySize) : Math.max(1, requested * 4);
              return (
                <div
                  key={w.reservation.id}
                  className="row"
                  style={{ justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,0.03)" }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{w.customer.name}</div>
                    <div className="small" style={{ opacity: 0.85 }}>
                      {pax} pax · Requiere {requested} mesa(s)
                      {w.reservation.createdAt ? ` · ${new Date(w.reservation.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </div>
                  </div>

                  <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                    <form
                      action="/api/waitlist/confirm"
                      method="post"
                      onSubmit={(e) => {
                        if (selectedTableIds.length < Math.max(1, requested)) {
                          e.preventDefault();
                          window.alert(`Selecciona al menos ${Math.max(1, requested)} mesa(s) LIBRE(S) en el croquis.`);
                          return;
                        }
                        const ok = window.confirm("¿Confirmar lista de espera con las mesas seleccionadas?");
                        if (!ok) {
                          e.preventDefault();
                        }
                      }}
                      style={{ display: "inline-block" }}
                    >
                      <input type="hidden" name="reservationId" value={w.reservation.id} />
                      {selectedTableIds.map((id) => (
                        <input key={id} type="hidden" name="tableIds" value={id} />
                      ))}
                      <input type="hidden" name="sendWhatsApp" value={sendWaitlistWhatsApp ? "1" : "0"} />
                      <button className="btn" type="submit">
                        Confirmar
                      </button>
                      <div className="small" style={{ marginTop: 6 }}>
                        <label style={{ userSelect: "none" }}>
                          <input
                            type="checkbox"
                            checked={sendWaitlistWhatsApp}
                            onChange={(ev) => setSendWaitlistWhatsApp(ev.target.checked)}
                            style={{ marginRight: 6 }}
                          />
                          Enviar WhatsApp
                        </label>
                      </div>
                    </form>

                    <form
                      action="/api/waitlist/cancel"
                      method="post"
                      onSubmit={(e) => {
                        const ok = window.confirm("¿Cancelar esta entrada de lista de espera?");
                        if (!ok) e.preventDefault();
                      }}
                      style={{ display: "inline-block", marginTop: 8 }}
                    >
                      <input type="hidden" name="reservationId" value={w.reservation.id} />
                      <button className="btn secondary" type="submit">
                        Cancelar
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
