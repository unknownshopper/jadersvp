export function formatDateDDMMYY(input: number | Date, timeZone = "America/Mexico_City") {
  const d = typeof input === "number" ? new Date(input) : input;
  const dtf = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone
  });

  const parts = dtf.formatToParts(d);
  const dd = parts.find((p) => p.type === "day")?.value ?? "";
  const mm = parts.find((p) => p.type === "month")?.value ?? "";
  const yy = parts.find((p) => p.type === "year")?.value ?? "";

  if (dd && mm && yy) return `${dd}/${mm}/${yy}`;
  return dtf.format(d);
}

export function formatTimeHHMM(input: number | Date, timeZone = "America/Mexico_City") {
  const d = typeof input === "number" ? new Date(input) : input;
  const dtf = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  });

  return dtf.format(d);
}

export function formatDateTimeDDMMYYHHMM(input: number | Date, timeZone = "America/Mexico_City") {
  return `${formatDateDDMMYY(input, timeZone)} ${formatTimeHHMM(input, timeZone)}`;
}
