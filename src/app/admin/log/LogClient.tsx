"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { formatDateDDMMYY, formatTimeHHMM } from "@/lib/dateFormat";
import type { ReservationLogRow } from "@/lib/firestore";

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  whiteSpace: "nowrap",
  borderBottom: "2px solid rgba(16, 32, 21, 0.18)"
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
  borderTop: "1px solid rgba(16, 32, 21, 0.08)"
};

export default function LogClient({ rows }: { rows: ReservationLogRow[] }) {
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [q, setQ] = useState<string>("");

  const withPhoneCount = rows.filter((r) => Boolean(String(r.phone || "").trim())).length;
  const withoutPhoneCount = rows.length - withPhoneCount;
  const noPhoneAtCreationCount = rows.filter((r) => r.noPhoneAtCreation).length;

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const hasPhone = Boolean(String(r.phone || "").trim());
      if (filter === "with" && !hasPhone) return false;
      if (filter === "without" && hasPhone) return false;
      if (!qq) return true;
      const hay = [r.customerName, r.phone, r.email ?? "", r.tableNames.join(" "), r.source ?? "", r.status]
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, filter, q]);

  return (
    <div className="card">
      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
        <div className="row" style={{ gap: 8, flex: "0 0 auto", flexWrap: "wrap" }}>
          <button
            type="button"
            className="badge"
            onClick={() => setFilter("all")}
            style={{ opacity: filter === "all" ? 1 : 0.65 }}
          >
            Todas ({rows.length})
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => setFilter("with")}
            style={{ opacity: filter === "with" ? 1 : 0.65 }}
          >
            Con teléfono ({withPhoneCount})
          </button>
          <button
            type="button"
            className="badge"
            onClick={() => setFilter("without")}
            style={{ opacity: filter === "without" ? 1 : 0.65, borderColor: "rgba(239, 68, 68, 0.7)" }}
          >
            Sin teléfono ({withoutPhoneCount})
          </button>
          <span className="badge" style={{ opacity: 0.85 }}>
            Sin tel. al crear: {noPhoneAtCreationCount}
          </span>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar (nombre, teléfono, correo, mesa)"
          />
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr className="small" style={{ fontWeight: 900 }}>
              <th style={thStyle}>Creada</th>
              <th style={thStyle}>Reservada para</th>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Mesa(s)</th>
              <th style={thStyle}>Teléfono</th>
              <th style={thStyle}>Correo</th>
              <th style={thStyle}>Origen</th>
              <th style={thStyle}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const hasPhone = Boolean(String(r.phone || "").trim());
              return (
                <tr key={r.reservationId} style={!hasPhone ? { background: "rgba(239, 68, 68, 0.05)" } : undefined}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {formatDateDDMMYY(r.createdAt)} {formatTimeHHMM(r.createdAt)}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {r.reservedFor ? `${formatDateDDMMYY(r.reservedFor)} ${formatTimeHHMM(r.reservedFor)}` : "—"}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{r.customerName || "—"}</div>
                    {r.partySize ? <div className="small">{r.partySize} pax</div> : null}
                  </td>
                  <td style={tdStyle}>{r.tableNames.length ? r.tableNames.join(", ") : "—"}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {hasPhone ? (
                      <span>{r.phone}</span>
                    ) : (
                      <span style={{ color: "#b03a2e", fontWeight: 900 }}>SIN TELÉFONO</span>
                    )}
                    {r.noPhoneAtCreation && hasPhone ? (
                      <div className="small" style={{ color: "#b03a2e" }}>
                        sin tel. al crear
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{r.email ?? "—"}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <div>{r.source ?? "—"}</div>
                    {r.createdByRole ? <div className="small">{r.createdByRole}</div> : null}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{r.status}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td style={tdStyle} colSpan={8}>
                  <span className="small">Sin resultados</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="small" style={{ marginTop: 10, opacity: 0.75 }}>
        Mostrando {visible.length} de {rows.length} reservas.
      </div>
    </div>
  );
}
