export type MarkerKind = "circle" | "diamond" | "rect" | "triangle" | "lshape" | "square";

export const DEFAULT_DOWN_POSITIONS: Record<string, { x: number; y: number }> = {
  "1": { x: 55, y: 58 },
  "2": { x: 55, y: 49 },
  "3": { x: 55, y: 40 },
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
  "14": { x: 72, y: 30 },
  "15": { x: 72, y: 18 },
  "16": { x: 82, y: 18 },
  "17": { x: 92, y: 18 },
  "18": { x: 88, y: 30 }
};

export const DEFAULT_UP_MARKERS: Array<{ kind: MarkerKind; label: string; x: number; y: number }> = [
  { kind: "square", label: "36", x: 18, y: 16 },
  { kind: "square", label: "33", x: 62, y: 16 },
  { kind: "circle", label: "34", x: 40, y: 14 },
  { kind: "circle", label: "35", x: 40, y: 30 },
  { kind: "circle", label: "37", x: 14, y: 30 },
  { kind: "circle", label: "38", x: 14, y: 46 },
  { kind: "circle", label: "39", x: 14, y: 60 },
  { kind: "rect", label: "32", x: 64, y: 30 },
  { kind: "rect", label: "31", x: 64, y: 50 },
  { kind: "triangle", label: "30", x: 38, y: 46 },
  { kind: "diamond", label: "29", x: 25, y: 66 },
  { kind: "diamond", label: "28", x: 40, y: 66 },
  { kind: "rect", label: "27", x: 15, y: 84 },
  { kind: "rect", label: "26", x: 32, y: 84 },
  { kind: "rect", label: "25", x: 49, y: 84 },
  { kind: "diamond", label: "24", x: 80, y: 66 },
  { kind: "diamond", label: "23", x: 92, y: 66 },
  { kind: "diamond", label: "22", x: 92, y: 78 },
  { kind: "circle", label: "21", x: 84, y: 84 }
];

export const DEFAULT_UP_POSITIONS: Record<string, { x: number; y: number }> = Object.fromEntries(
  DEFAULT_UP_MARKERS.map((m) => [m.label, { x: m.x, y: m.y }])
);

export function defaultPositionFor(floor: "down" | "up", label: string) {
  return floor === "up" ? DEFAULT_UP_POSITIONS[label] ?? null : DEFAULT_DOWN_POSITIONS[label] ?? null;
}

// Tables 30–39 (upstairs) are the waiting room: never reservable or seatable.
export function isWaitingRoomTableName(name: string | null | undefined) {
  const n = Number.parseInt(String(name ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 30 && n <= 39;
}

// Display aliases: waiting-room tables are called "Sala N" for staff.
export const TABLE_DISPLAY_NAMES: Record<string, string> = {
  "31": "Sala 1",
  "32": "Sala 2",
  "33": "Sala 3",
  "36": "Sala 4"
};

export function displayTableName(name: string | null | undefined) {
  const n = String(name ?? "").trim();
  return TABLE_DISPLAY_NAMES[n] ?? n;
}
