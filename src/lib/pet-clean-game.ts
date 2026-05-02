/** Each poop removed adds this much hygiene until 100. */
export const HYGIENE_PER_POOP = 12.5;

/** 8 × 12.5 = 100 — cap on simultaneous poops. */
export const MAX_YARD_POOPS = 8;

export type YardPoop = { id: string; leftPct: number; topPct: number };

function newPoopId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Stay left or right of the centered pet so mess sits on the grass, not on Sandy. */
export function randomYardPoop(): YardPoop {
  const side = Math.random() < 0.5 ? "left" : "right";
  const leftPct =
    side === "left" ? 5 + Math.random() * 24 : 71 + Math.random() * 24;
  return {
    id: newPoopId(),
    leftPct,
    /** Lower third of the yard only (~66%–94% from top). */
    topPct: 100 * (2 / 3) + Math.random() * (100 / 3 - 6),
  };
}

/**
 * How many poops should appear for this hygiene (100 = clean, 0 = max mess).
 * Example: 62.5 → gap 37.5 → 3 poops; 75 → 2 poops.
 */
export function poopCountForHygiene(hygiene: number): number {
  const h = Math.min(100, Math.max(0, hygiene));
  if (h >= 100) return 0;
  const gap = 100 - h;
  const n = Math.ceil(gap / HYGIENE_PER_POOP - 1e-9);
  return Math.min(MAX_YARD_POOPS, Math.max(0, n));
}

export function parseYardPoops(raw: unknown): YardPoop[] {
  if (!Array.isArray(raw)) return [];
  const out: YardPoop[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    if (typeof o.leftPct !== "number" || typeof o.topPct !== "number") continue;
    if (!Number.isFinite(o.leftPct) || !Number.isFinite(o.topPct)) continue;
    if (o.leftPct < 0 || o.leftPct > 100 || o.topPct < 0 || o.topPct > 100) continue;
    out.push({ id: o.id, leftPct: o.leftPct, topPct: o.topPct });
  }
  return out;
}

/**
 * Trim or add random poops so `length === poopCountForHygiene(hygiene)` while keeping
 * existing entries when possible (stable positions across reloads).
 */
export function reconcileYardPoops(
  current: YardPoop[],
  hygiene: number
): YardPoop[] {
  const target = poopCountForHygiene(hygiene);
  if (target === 0) return [];
  if (current.length === target) return current;
  if (current.length > target) {
    const sorted = [...current].sort((a, b) => a.id.localeCompare(b.id));
    return sorted.slice(0, target);
  }
  const need = target - current.length;
  const extra = Array.from({ length: need }, randomYardPoop);
  return [...current, ...extra];
}
