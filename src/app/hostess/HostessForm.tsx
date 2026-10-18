"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CafeTable, Customer, FloorplanPositions, Reservation } from "@/lib/firestore";
import { DEFAULT_DOWN_POSITIONS, DEFAULT_UP_MARKERS, DEFAULT_UP_POSITIONS } from "@/lib/floorplan";
import { enqueuePost, fieldsFromFormData, flushQueue, queueCount } from "@/lib/offlineQueue";

const DRAFT_KEY = "cj_hostess_draft_v1";
const DRAFT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

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

const pos = DEFAULT_DOWN_POSITIONS;

function statusClass(status: string) {
  if (status === "LIBRE") return "libre";
  if (status === "OCUPADA") return "ocupada";
  if (status === "RESERVADA") return "reservada";
  if (status === "PROXIMA") return "proxima";
  return "porlimpiar";
}

type CustomerSuggestion = {
  id: string;
  name: string;
  phone: string;
  email: string;
  visitsCount?: number;
  lastVisitAt?: number | null;
};

function formatVisitAgo(ms: number | null | undefined) {
  const n = Number(ms ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const days = Math.max(0, Math.floor((Date.now() - n) / 86400000));
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

function visitSummary(c: { visitsCount?: number; lastVisitAt?: number | null }) {
  const ago = formatVisitAgo(c.lastVisitAt);
  const n = Number(c.visitsCount ?? 0);
  if (!ago && n <= 0) return "primera visita registrada";
  const parts: string[] = [];
  if (ago) parts.push(`última visita ${ago}`);
  if (n > 0) parts.push(`${n} visita${n === 1 ? "" : "s"}`);
  return parts.join(" · ");
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
  initialReservedTime,
  floorplan
}: {
  tables: CafeTable[];
  waitlist: Array<{ reservation: Reservation; customer: Customer }>;
  initialTableId?: string;
  initialReservedDate?: string;
  initialReservedTime?: string;
  floorplan?: FloorplanPositions | null;
}) {
  const router = useRouter();
  const defaults = useMemo(() => defaultDateTime(), []);
  const [reservedDate, setReservedDate] = useState<string>(initialReservedDate ?? defaults.date);
  const [reservedTime, setReservedTime] = useState<string>(initialReservedTime ?? defaults.time);
  const [tableId, setTableId] = useState<string>(initialTableId ?? "");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(initialTableId ? [initialTableId] : []);
  const [mapFloor, setMapFloor] = useState<"down" | "up">("down");
  const [name, setName] = useState<string>("");
  const [phoneCountry, setPhoneCountry] = useState<string>("+52");
  const [phoneNational, setPhoneNational] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [customerHint, setCustomerHint] = useState<string>("");
  const [phoneSuggestions, setPhoneSuggestions] = useState<CustomerSuggestion[]>([]);
  const [nameSuggestions, setNameSuggestions] = useState<CustomerSuggestion[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [partySize, setPartySize] = useState<string>("1");
  const [partyTouched, setPartyTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedTablesCount, setRequestedTablesCount] = useState<number>(1);
  const [sendWaitlistWhatsApp, setSendWaitlistWhatsApp] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");
  const [pendingQueued, setPendingQueued] = useState<number>(0);
  const [draftRestored, setDraftRestored] = useState<boolean>(false);

  const didInitFromUrl = useRef(false);

  const normalizeDialCode = (raw: string) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    const digits = s.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return `+${digits}`;
  };

  const downPos = useMemo(() => {
    const merged: Record<string, { x: number; y: number }> = { ...pos };
    const saved = floorplan?.down;
    if (saved) {
      for (const [label, p] of Object.entries(saved)) {
        if (!(label in merged)) continue;
        const x = Number((p as any)?.x);
        const y = Number((p as any)?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) merged[label] = { x, y };
      }
    }
    return merged;
  }, [floorplan]);

  const upstairsResolved = useMemo(
    () =>
      DEFAULT_UP_MARKERS.map((m) => {
        const p = floorplan?.up?.[m.label];
        const x = Number((p as any)?.x);
        const y = Number((p as any)?.y);
        return Number.isFinite(x) && Number.isFinite(y) ? { ...m, x, y } : m;
      }),
    [floorplan]
  );

  const movedTableIds = useMemo(() => {
    const moved = new Set<string>();
    for (const t of tables) {
      const up = String(t.area) === "PLANTA_ALTA";
      const def = up ? DEFAULT_UP_POSITIONS[String(t.name)] : DEFAULT_DOWN_POSITIONS[String(t.name)];
      const cur = up
        ? upstairsResolved.find((m) => m.label === String(t.name))
        : downPos[String(t.name)];
      if (!def || !cur) continue;
      if (Math.abs(cur.x - def.x) > 0.5 || Math.abs(cur.y - def.y) > 0.5) moved.add(t.id);
    }
    return moved;
  }, [tables, downPos, upstairsResolved]);

  const tableByName = useMemo(() => {
    const m = new Map<string, CafeTable>();
    for (const t of tables) {
      const key = String(t.name ?? "").trim();
      if (key) m.set(key, t);
    }
    return m;
  }, [tables]);

  const composedPhone = useMemo(() => {
    const cc = String(phoneCountry || "").trim();
    const national = String(phoneNational || "").replace(/\D/g, "");
    if (!national) return "";
    const ccDigits = cc.replace(/[^\d+]/g, "");
    const prefix = ccDigits.startsWith("+") ? ccDigits : `+${ccDigits}`;
    return `${prefix}${national}`;
  }, [phoneCountry, phoneNational]);

  const pickSuggestion = (c: CustomerSuggestion) => {
    const digits = String(c.phone ?? "").replace(/\D/g, "");
    const ccDigits = String(phoneCountry ?? "").replace(/\D/g, "");
    if (ccDigits && digits.startsWith(ccDigits) && digits.length > ccDigits.length) {
      setPhoneNational(digits.slice(ccDigits.length));
    } else if (digits.startsWith("52") && digits.length === 12) {
      setPhoneCountry("+52");
      setPhoneNational(digits.slice(2));
    } else if (digits.startsWith("1") && digits.length === 11) {
      setPhoneCountry("+1");
      setPhoneNational(digits.slice(1));
    } else {
      setPhoneCountry("+");
      setPhoneNational(digits);
    }
    if (c.name) setName(String(c.name).toUpperCase());
    if (c.email && !email.trim()) setEmail(String(c.email));
    setPhoneSuggestions([]);
    setNameSuggestions([]);
    setCustomerHint(`Cliente reconocido: ${String(c.name ?? "").trim() || "sin nombre"} · ${visitSummary(c)}`);
  };

  const onNameChange = (value: string) => {
    setName(value.toUpperCase());
    setCustomerHint("");
    if (nameSuggestTimer.current) clearTimeout(nameSuggestTimer.current);
    if (value.trim().length < 2) {
      setNameSuggestions([]);
      return;
    }
    nameSuggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/suggest?name=${encodeURIComponent(value.trim())}`, {
          credentials: "same-origin"
        });
        if (!res.ok) {
          setNameSuggestions([]);
          return;
        }
        const data = (await res.json().catch(() => null)) as any;
        setNameSuggestions(Array.isArray(data?.customers) ? data.customers : []);
      } catch {
        setNameSuggestions([]);
      }
    }, 250);
  };

  const onPhoneNationalChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setPhoneNational(digits);
    setCustomerHint("");
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (digits.length < 3) {
      setPhoneSuggestions([]);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const phone = `${normalizeDialCode(phoneCountry) || "+52"}${digits}`;
        const res = await fetch(`/api/customers/suggest?phone=${encodeURIComponent(phone)}`, {
          credentials: "same-origin"
        });
        if (!res.ok) {
          setPhoneSuggestions([]);
          return;
        }
        const data = (await res.json().catch(() => null)) as any;
        setPhoneSuggestions(Array.isArray(data?.customers) ? data.customers : []);
      } catch {
        setPhoneSuggestions([]);
      }
    }, 250);
  };

  const lookupCustomerByPhone = async () => {
    const digits = composedPhone.replace(/\D/g, "");
    if (digits.length < 10) return;
    setCustomerHint("Buscando cliente…");
    try {
      const res = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(composedPhone)}`, {
        credentials: "same-origin"
      });
      if (!res.ok) {
        setCustomerHint("");
        return;
      }
      const data = (await res.json().catch(() => null)) as any;
      const c = data?.customer;
      if (!c) {
        setCustomerHint("Cliente nuevo");
        return;
      }
      if (!name.trim() && c.name) setName(String(c.name).toUpperCase());
      if (!email.trim() && c.email) setEmail(String(c.email));
      setCustomerHint(`Cliente reconocido: ${String(c.name ?? "").trim() || "sin nombre"} · ${visitSummary(c)}`);
    } catch {
      setCustomerHint("");
    }
  };

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
    if (didInitFromUrl.current) return;
    didInitFromUrl.current = true;
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

  // Restore an unfinished form draft (survives accidental reloads / network drops).
  const didRestoreDraft = useRef(false);
  useEffect(() => {
    if (didRestoreDraft.current) return;
    didRestoreDraft.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d?.savedAt || Date.now() - Number(d.savedAt) > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (d.name) setName(String(d.name));
      if (d.phoneCountry) setPhoneCountry(String(d.phoneCountry));
      if (d.phoneNational) setPhoneNational(String(d.phoneNational));
      if (d.email) setEmail(String(d.email));
      if (d.partySize) { setPartySize(String(d.partySize)); setPartyTouched(true); }
      if (d.notes) setNotes(String(d.notes));
      if (Array.isArray(d.selectedTableIds) && d.selectedTableIds.length) {
        setSelectedTableIds(d.selectedTableIds.map(String));
        setTableId(String(d.selectedTableIds[0]));
      }
      setDraftRestored(true);
    } catch {
      // ignore corrupt draft
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const hasData =
          name.trim() || phoneNational.trim() || email.trim() || notes.trim() || selectedTableIds.length > 0;
        if (!hasData) {
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            name,
            phoneCountry,
            phoneNational,
            email,
            partySize,
            notes,
            selectedTableIds
          })
        );
      } catch {
        // storage unavailable
      }
    }, 400);
    return () => clearTimeout(t);
  }, [name, phoneCountry, phoneNational, email, partySize, notes, selectedTableIds]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setDraftRestored(false);
  };

  const resetCapturedFields = () => {
    setName("");
    setPhoneNational("");
    setEmail("");
    setNotes("");
    setPartySize("1");
    setPartyTouched(false);
    setSelectedTableIds([]);
    setTableId("");
    setCustomerHint("");
    setPhoneSuggestions([]);
    setNameSuggestions([]);
    clearDraft();
  };

  // Flush queued submissions when connectivity returns, then reload fresh data.
  useEffect(() => {
    let cancelled = false;
    let flushing = false;
    const flush = async () => {
      if (flushing) return;
      flushing = true;
      try {
        const { sent, remaining } = await flushQueue();
        if (cancelled) return;
        setPendingQueued(remaining);
        if (sent > 0) window.location.reload();
      } finally {
        flushing = false;
      }
    };
    setPendingQueued(queueCount());
    flush();
    window.addEventListener("online", flush);
    const t = setInterval(flush, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("online", flush);
      clearInterval(t);
    };
  }, []);

  // Submits a create-style form via fetch; on network failure queues it locally.
  const submitWithQueue = async (form: HTMLFormElement, url: string): Promise<void> => {
    const fd = new FormData(form);
    try {
      const res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login";
        return;
      }
      if (res.status >= 500) throw new Error(`HTTP_${res.status}`);
      clearDraft();
      window.location.href = res.redirected && res.url ? res.url : "/hostess";
    } catch {
      enqueuePost(url, fieldsFromFormData(fd));
      setPendingQueued(queueCount());
      resetCapturedFields();
      window.alert(
        "Sin conexión. La operación quedó guardada en este dispositivo y se enviará automáticamente cuando regrese el internet."
      );
    }
  };

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

  const occupiedTables = useMemo(() => {
    return tables
      .filter((t) => t.status === "OCUPADA")
      .slice()
      .sort((a, b) => {
        const an = Number.parseInt(String(a.name), 10);
        const bn = Number.parseInt(String(b.name), 10);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 60);
  }, [tables]);

  return (
    <div className="hostess-form-grid">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Crear reserva / Asignar mesa</h3>
        {pendingQueued > 0 ? (
          <div
            className="small"
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.35)",
              fontWeight: 700
            }}
          >
            {pendingQueued} envío(s) pendiente(s) — se enviarán automáticamente cuando regrese el internet.
          </div>
        ) : null}
        {draftRestored ? (
          <div className="small" style={{ marginBottom: 10, opacity: 0.85 }}>
            Se recuperó un borrador guardado antes de que se recargara la página.
          </div>
        ) : null}
        <form
          className="grid"
          action="/api/reservations/call"
          method="post"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const t = e.target as any;
            const tag = String(t?.tagName ?? "").toLowerCase();
            if (tag === "textarea") return;
            // Avoid accidental form submit while typing; use the submit button.
            e.preventDefault();
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (isSubmitting) return;
            const form = e.currentTarget;

            const dial = normalizeDialCode(phoneCountry);
            const nationalDigits = String(phoneNational || "").replace(/\D/g, "");
            const wantsPhone = nationalDigits.length > 0 || String(phoneCountry || "").trim().length > 0;
            if (wantsPhone) {
              if (!dial || dial === "+") {
                window.alert("LADA inválida. Ejemplo: +52, +48, +972");
                return;
              }
              if (dial === "+52") {
                if (nationalDigits.length !== 10) {
                  window.alert("Para México (+52) el número debe tener 10 dígitos.");
                  return;
                }
              } else {
                if (nationalDigits.length < 6 || nationalDigits.length > 15) {
                  window.alert("Número inválido. Revisa que esté completo (6 a 15 dígitos) y sin espacios.");
                  return;
                }
              }
            }
            if (!tableId) {
              if (!partyTouched) {
                window.alert("Si no seleccionas mesa, debes ingresar la cantidad de personas.");
                return;
              }
              const ok = window.confirm("¿No se va a seleccionar mesa?");
              if (!ok) return;
            }

            const hasPhone = composedPhone.trim().length > 0;
            const hasEmail = email.trim().length > 0;
            if (!hasPhone && !hasEmail) {
              const ok = window.confirm(
                "Estás a punto de guardar una reserva SIN datos de contacto (WhatsApp/correo).\n\nCualquiera podría reclamar la reservación. ¿Deseas continuar?"
              );
              if (!ok) return;
            }

            setIsSubmitting(true);
            try {
              await submitWithQueue(form, "/api/reservations/call");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div>
            <label className="label">Nombre</label>
            <div style={{ position: "relative" }}>
              <input
                className="input"
                name="name"
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => {
                  setTimeout(() => setNameSuggestions([]), 180);
                }}
                onFocus={() => {
                  if (name.trim().length >= 2) onNameChange(name);
                }}
                autoComplete="off"
              />
              {nameSuggestions.length > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 30,
                    background: "#ffffff",
                    border: "1px solid rgba(17,24,39,0.14)",
                    borderRadius: 10,
                    boxShadow: "0 10px 28px rgba(17,24,39,0.18)",
                    overflow: "hidden"
                  }}
                >
                  {nameSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickSuggestion(c);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "9px 12px",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid rgba(17,24,39,0.06)",
                        cursor: "pointer",
                        fontSize: 13
                      }}
                    >
                      <b>{c.name || "Sin nombre"}</b>
                      <span style={{ opacity: 0.75 }}> · {c.phone}</span>
                      {c.email ? <span style={{ opacity: 0.55 }}> · {c.email}</span> : null}
                      <span style={{ display: "block", opacity: 0.6, fontSize: 12 }}>{visitSummary(c)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="label">Teléfono (WhatsApp)</label>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 auto", minWidth: 120 }}>
                <input
                  className="input"
                  value={phoneCountry}
                  onChange={(e) => setPhoneCountry(normalizeDialCode(e.target.value) || "+")}
                  onBlur={() => {
                    const normalized = normalizeDialCode(phoneCountry);
                    setPhoneCountry(normalized || "+52");
                  }}
                  inputMode="text"
                  placeholder="+52"
                  list="dialCodes"
                  aria-label="LADA"
                  style={{ width: "100%", fontWeight: 900, letterSpacing: 0.3 }}
                />
                <datalist id="dialCodes">
                  <option value="+52">MX México</option>
                  <option value="+1">US/CA Estados Unidos/Canadá</option>
                  <option value="+32">BE Bélgica</option>
                  <option value="+33">FR Francia</option>
                  <option value="+49">DE Alemania</option>
                  <option value="+34">ES España</option>
                  <option value="+44">UK Reino Unido</option>
                  <option value="+39">IT Italia</option>
                  <option value="+31">NL Países Bajos</option>
                  <option value="+351">PT Portugal</option>
                  <option value="+57">CO Colombia</option>
                  <option value="+54">AR Argentina</option>
                  <option value="+55">BR Brasil</option>
                  <option value="+48">PL Polonia</option>
                  <option value="+972">IL Israel</option>
                  <option value="+86">CN China</option>
                  <option value="+81">JP Japón</option>
                  <option value="+30">GR Grecia</option>

                  <option value="+7">RU/KZ Rusia/Kazajistán</option>
                  <option value="+20">EG Egipto</option>
                  <option value="+27">ZA Sudáfrica</option>
                  <option value="+36">HU Hungría</option>
                  <option value="+40">RO Rumania</option>
                  <option value="+41">CH Suiza</option>
                  <option value="+43">AT Austria</option>
                  <option value="+45">DK Dinamarca</option>
                  <option value="+46">SE Suecia</option>
                  <option value="+47">NO Noruega</option>
                  <option value="+56">CL Chile</option>
                  <option value="+58">VE Venezuela</option>
                  <option value="+60">MY Malasia</option>
                  <option value="+61">AU Australia</option>
                  <option value="+62">ID Indonesia</option>
                  <option value="+63">PH Filipinas</option>
                  <option value="+64">NZ Nueva Zelanda</option>
                  <option value="+65">SG Singapur</option>
                  <option value="+66">TH Tailandia</option>
                  <option value="+82">KR Corea del Sur</option>
                  <option value="+84">VN Vietnam</option>
                  <option value="+90">TR Turquía</option>
                  <option value="+91">IN India</option>
                  <option value="+92">PK Pakistán</option>
                  <option value="+93">AF Afganistán</option>
                  <option value="+94">LK Sri Lanka</option>
                  <option value="+95">MM Myanmar</option>
                  <option value="+98">IR Irán</option>

                  <option value="+212">MA Marruecos</option>
                  <option value="+213">DZ Argelia</option>
                  <option value="+216">TN Túnez</option>
                  <option value="+218">LY Libia</option>
                  <option value="+221">SN Senegal</option>
                  <option value="+225">CI Costa de Marfil</option>
                  <option value="+229">BJ Benín</option>
                  <option value="+233">GH Ghana</option>
                  <option value="+234">NG Nigeria</option>
                  <option value="+237">CM Camerún</option>
                  <option value="+251">ET Etiopía</option>
                  <option value="+254">KE Kenia</option>
                  <option value="+255">TZ Tanzania</option>
                  <option value="+256">UG Uganda</option>
                  <option value="+260">ZM Zambia</option>
                  <option value="+263">ZW Zimbabue</option>
                  <option value="+264">NA Namibia</option>

                  <option value="+350">GI Gibraltar</option>
                  <option value="+352">LU Luxemburgo</option>
                  <option value="+353">IE Irlanda</option>
                  <option value="+354">IS Islandia</option>
                  <option value="+355">AL Albania</option>
                  <option value="+356">MT Malta</option>
                  <option value="+357">CY Chipre</option>
                  <option value="+358">FI Finlandia</option>
                  <option value="+359">BG Bulgaria</option>
                  <option value="+370">LT Lituania</option>
                  <option value="+371">LV Letonia</option>
                  <option value="+372">EE Estonia</option>
                  <option value="+373">MD Moldavia</option>
                  <option value="+374">AM Armenia</option>
                  <option value="+375">BY Bielorrusia</option>
                  <option value="+376">AD Andorra</option>
                  <option value="+377">MC Mónaco</option>
                  <option value="+378">SM San Marino</option>
                  <option value="+380">UA Ucrania</option>
                  <option value="+381">RS Serbia</option>
                  <option value="+385">HR Croacia</option>
                  <option value="+386">SI Eslovenia</option>
                  <option value="+387">BA Bosnia y Herzegovina</option>
                  <option value="+389">MK Macedonia del Norte</option>
                  <option value="+420">CZ República Checa</option>
                  <option value="+421">SK Eslovaquia</option>
                  <option value="+422">LI Liechtenstein</option>
                  <option value="+423">LI Liechtenstein (alt)</option>

                  <option value="+503">SV El Salvador</option>
                  <option value="+504">HN Honduras</option>
                  <option value="+505">NI Nicaragua</option>
                  <option value="+506">CR Costa Rica</option>
                  <option value="+507">PA Panamá</option>
                  <option value="+509">HT Haití</option>
                  <option value="+51">PE Perú</option>
                  <option value="+591">BO Bolivia</option>
                  <option value="+593">EC Ecuador</option>
                  <option value="+595">PY Paraguay</option>
                  <option value="+598">UY Uruguay</option>
                </datalist>
              </div>
              <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={phoneCountry === "+52" ? "10 dígitos" : "número"}
                  value={phoneNational}
                  onChange={(e) => onPhoneNationalChange(e.target.value)}
                  onBlur={() => {
                    setTimeout(() => setPhoneSuggestions([]), 180);
                    void lookupCustomerByPhone();
                  }}
                  onFocus={() => {
                    if (phoneNational.replace(/\D/g, "").length >= 3) onPhoneNationalChange(phoneNational);
                  }}
                  style={{ width: "100%" }}
                />
                {phoneSuggestions.length > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      zIndex: 30,
                      background: "#ffffff",
                      border: "1px solid rgba(17,24,39,0.14)",
                      borderRadius: 10,
                      boxShadow: "0 10px 28px rgba(17,24,39,0.18)",
                      overflow: "hidden"
                    }}
                  >
                    {phoneSuggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSuggestion(c);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 12px",
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid rgba(17,24,39,0.06)",
                          cursor: "pointer",
                          fontSize: 13
                        }}
                      >
                        <b>{c.name || "Sin nombre"}</b>
                        <span style={{ opacity: 0.75 }}> · {c.phone}</span>
                        {c.email ? <span style={{ opacity: 0.55 }}> · {c.email}</span> : null}
                        <span style={{ display: "block", opacity: 0.6, fontSize: 12 }}>{visitSummary(c)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <input type="hidden" name="phone" value={composedPhone} />
            {customerHint ? (
              <div className="small" style={{ marginTop: 6, opacity: 0.85 }}>
                {customerHint}
              </div>
            ) : null}
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
            <textarea
              className="input"
              name="notes"
              rows={3}
              placeholder="Cumpleaños, celebración, alergias, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
            onSubmit={async (e) => {
              e.preventDefault();
              if (isSubmitting) return;
              const form = e.currentTarget;
              if (!name.trim()) return;
              const hasPhone = composedPhone.trim().length > 0;
              const hasEmail = email.trim().length > 0;
              if (!hasPhone && !hasEmail) {
                const ok = window.confirm(
                  "Estás a punto de guardar en lista de espera SIN datos de contacto (WhatsApp/correo).\n\n¿Deseas continuar?"
                );
                if (!ok) return;
              }
              // Avoid reusing a stale table selection when later confirming (seating) a waitlist entry.
              setSelectedTableIds([]);
              setTableId("");
              setIsSubmitting(true);
              try {
                await submitWithQueue(form, "/api/waitlist/create");
              } finally {
                setIsSubmitting(false);
              }
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
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="small" style={{ opacity: 0.85 }}>
                Croquis: <b>{mapFloor === "down" ? "Planta baja" : "2do piso"}</b>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn secondary" href="/reacomodo.html" title="Abrir el editor de plano">
                  Reacomodo
                </a>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setMapFloor((p: "down" | "up") => (p === "down" ? "up" : "down"))}
                >
                  {mapFloor === "down" ? "Ver 2do piso" : "Ver planta baja"}
                </button>
              </div>
            </div>

            <div className="table-map" data-floor={mapFloor} role="group" aria-label="Croquis de mesas">
            {mapFloor === "up" ? (
              upstairsResolved.map((m, i) => {
                const t = tableByName.get(String(m.label)) ?? null;
                const s = t ? effectiveStatusAt(t, reservedForMs) : "LIBRE";
                const isSelected = t ? selectedTableIds.includes(t.id) : false;
                const cls = `up-marker ${m.kind} ${statusClass(s)} ${isSelected ? "selected" : ""}`;
                return (
                  <button
                    key={`${m.kind}-${m.label}-${i}`}
                    type="button"
                    className={cls}
                    style={{ left: `${m.x}%`, top: `${m.y}%`, transform: "translate(-50%, -50%)" } as any}
                    title={`Mesa ${m.label}`}
                    onClick={() => {
                      if (!t) return;
                      const es = effectiveStatusAt(t, reservedForMs);
                      if (es !== "LIBRE") {
                        router.push(`/hostess?focusTableId=${encodeURIComponent(t.id)}`);
                        return;
                      }
                      setSelectedTableIds((prev) => {
                        const exists = prev.includes(t.id);
                        const next = exists ? prev.filter((id) => id !== t.id) : [...prev, t.id];
                        const primary = next[0] ?? "";
                        setTableId(primary);
                        return next;
                      });
                    }}
                  >
                    <span>{m.label}</span>
                  </button>
                );
              })
            ) : (
              tables.filter((t) => t.area !== "PLANTA_ALTA").map((t) => {
                const p = downPos[String(t.name)] ?? null;
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
                      if (s === "LIBRE") {
                        setSelectedTableIds((prev) => {
                          const exists = prev.includes(t.id);
                          let next = exists ? prev.filter((x) => x !== t.id) : [...prev, t.id];
                          const primary = next[0] ?? "";
                          setTableId(primary);
                          return next;
                        });
                      } else {
                        router.push(`/hostess?focusTableId=${encodeURIComponent(t.id)}`);
                      }
                    }}
                    title={`${t.name} · ${t.area} · ${s}`}
                  >
                    {t.name}
                  </button>
                );
              })
            )}

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
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mesas ocupadas</h3>
        {occupiedTables.length === 0 ? <div className="small" style={{ marginTop: 8 }}>Sin registros</div> : null}

        {occupiedTables.length > 0 ? (
          <div className="grid" style={{ marginTop: 10 }}>
            {occupiedTables.map((t) => {
              const moved = movedTableIds.has(t.id);
              return (
                <div key={t.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      Mesa {t.name}
                      {moved ? (
                        <span className="small" style={{ fontWeight: 700, opacity: 0.75 }}>
                          {" "}
                          · fuera de su lugar
                        </span>
                      ) : null}
                    </div>
                    <div className="small" style={{ opacity: 0.85 }}>
                      {String((t as any).currentCustomerName ?? "").trim()
                        ? `Cliente: ${String((t as any).currentCustomerName ?? "").trim()}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                    <a
                      className="btn secondary"
                      href={`/hostess?focusTableId=${encodeURIComponent(t.id)}`}
                      title="Ver grupo y sumar mesas"
                    >
                      Juntar
                    </a>
                    <form
                      action="/api/tables/free"
                      method="post"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = window.confirm(
                          moved
                            ? `¿Liberar Mesa ${String(t.name)} y regresarla a su lugar?`
                            : `¿Liberar Mesa ${String(t.name)}?`
                        );
                        if (!ok) return;
                        setIsSubmitting(true);
                        try {
                          await submitWithQueue(e.currentTarget, "/api/tables/free");
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                    >
                      <input type="hidden" name="tableId" value={t.id} />
                      <input
                        type="hidden"
                        name="expectedReservationId"
                        value={String((t as any).currentReservationId ?? "")}
                      />
                      {moved ? <input type="hidden" name="returnHome" value="1" /> : null}
                      <button className="btn" type="submit" disabled={isSubmitting}>
                        {moved ? "Liberar y devolver" : "Liberar"}
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="card">
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
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (isSubmitting) return;
                        const form = e.currentTarget;
                        if (selectedTableIds.length < Math.max(1, requested)) {
                          window.alert(`Selecciona al menos ${Math.max(1, requested)} mesa(s) LIBRE(S) en el croquis.`);
                          return;
                        }

                        const selectedTables = selectedTableIds
                          .map((id) => tables.find((t) => t.id === id))
                          .filter(Boolean) as CafeTable[];
                        const anyNotFree = selectedTables.some((t) => effectiveStatusAt(t, null) !== "LIBRE");
                        if (anyNotFree || selectedTables.length !== selectedTableIds.length) {
                          window.alert("Las mesas seleccionadas ya no están disponibles. Selecciona mesas LIBRES en el croquis e intenta de nuevo.");
                          return;
                        }
                        const ok = window.confirm("¿Confirmar lista de espera con las mesas seleccionadas?");
                        if (!ok) return;
                        setIsSubmitting(true);
                        try {
                          await submitWithQueue(form, "/api/waitlist/confirm");
                        } finally {
                          setIsSubmitting(false);
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
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (isSubmitting) return;
                        const ok = window.confirm("¿Cancelar esta entrada de lista de espera?");
                        if (!ok) return;
                        setIsSubmitting(true);
                        try {
                          await submitWithQueue(e.currentTarget, "/api/waitlist/cancel");
                        } finally {
                          setIsSubmitting(false);
                        }
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
