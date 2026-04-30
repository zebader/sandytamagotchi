/**
 * DB / simulation use `hunger` as “need for food”: 0 = full, 100 = starving.
 * UI shows the inverse as **satiated** (higher = fuller).
 */
export function satiatedFromStoredHunger(hunger: number): number {
  return 100 - hunger;
}
