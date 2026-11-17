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

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value] as const));
  const asIfUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asIfUtc - date.getTime();
}

// Parses "YYYY-MM-DD HH:MM" (or "YYYY-MM-DDTHH:MM") as local time in the given
// zone and returns the UTC instant.
export function parseLocalDateTime(input: string, timeZone = "America/Mexico_City"): Date | null {
  const s = input.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const [_, y, mo, d, h, mi] = m;
  const utcGuess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
  const offset1 = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcMs = utcGuess - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (offset2 !== offset1) {
    utcMs = utcGuess - offset2;
  }
  const dt = new Date(utcMs);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// Returns { date: "YYYY-MM-DD", time: "HH:MM" } in the given zone — values
// suitable for <input type="date"> / <input type="time">.
export function toInputDateTimeParts(input: number | Date, timeZone = "America/Mexico_City") {
  const d = typeof input === "number" ? new Date(input) : input;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = dtf.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value] as const));
  const hh = map.hour === "24" ? "00" : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hh}:${map.minute}`
  };
}
