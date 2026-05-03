/**
 * Single source of truth for the Feed catch mini-game balance.
 * Imported by both the client component (UI) and the server action (validation),
 * so a tampered client can't claim impossible scores or rewards.
 */

export type FoodKind = "carrot" | "meat";

export type FoodConfig = {
  /** How many items will fall in one round. */
  total: number;
  /** Time it takes one item to traverse from top to bottom of the yard (ms). */
  fallMs: number;
  /**
   * Ease-in exponent: linear u = (elapsed - spawnAt) / fallMs maps to
   * progress = u^power while u in [0,1], then continues linearly so the item
   * clears the bottom. Values above 1 accelerate toward the ground.
   */
  fallEasePower: number;
  /** Spacing between item spawns (ms). Smaller = denser game. */
  spawnEveryMs: number;
  /** Satiated bonus when ALL items are caught. */
  satiatedAll: number;
  /** Energy penalty when at least one item is missed. */
  energyPenalty: number;
  /** Emoji rendered as the falling item. */
  glyph: string;
  /** Display label for buttons / result text. */
  label: string;
};

export const FOOD_CONFIG: Record<FoodKind, FoodConfig> = {
  carrot: {
    total: 5,
    fallMs: 2200,
    fallEasePower: 2.15,
    spawnEveryMs: 600,
    satiatedAll: 25,
    energyPenalty: 8,
    glyph: "🥕",
    label: "Carrot",
  },
  meat: {
    total: 7,
    fallMs: 1580,
    fallEasePower: 2.25,
    spawnEveryMs: 500,
    satiatedAll: 50,
    energyPenalty: 16,
    glyph: "🥩",
    label: "Meat",
  },
};

/**
 * Normalized fall progress 0..1+ for physics & rendering.
 * u = (elapsedMs - spawnAtMs) / fallMs (unclamped so items can exit past bottom).
 */
export function fallProgress(u: number, easePower: number): number {
  if (u <= 0) return 0;
  if (u < 1) return Math.pow(u, easePower);
  // Match derivative of u^ease at u=1 (ease * u^(ease-1) → ease) for smooth acceleration into exit.
  return 1 + (u - 1) * easePower;
}

export type FeedDeltas = {
  /** Added to stored `hunger` (negative = more satiated). */
  hungerDelta: number;
  /** Added to stored `rest` (negative = energy loss). */
  restDelta: number;
};

/**
 * Compute the stat deltas a feed round should apply.
 * - All caught:  full satiated bonus, no energy loss.
 * - Some caught: pro-rated satiated bonus, full energy penalty.
 * - None caught: no satiated change, full energy penalty.
 */
export function feedDeltas(
  food: FoodKind,
  caught: number,
  total: number
): FeedDeltas {
  const cfg = FOOD_CONFIG[food];
  const safeTotal = total > 0 ? total : cfg.total;
  const c = Math.max(0, Math.min(safeTotal, Math.floor(caught)));
  if (c === safeTotal) {
    return { hungerDelta: -cfg.satiatedAll, restDelta: 0 };
  }
  if (c === 0) {
    return { hungerDelta: 0, restDelta: -cfg.energyPenalty };
  }
  return {
    hungerDelta: -(c / safeTotal) * cfg.satiatedAll,
    restDelta: -cfg.energyPenalty,
  };
}
