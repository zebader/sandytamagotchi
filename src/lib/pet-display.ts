/**
 * DB / simulation use `hunger` as “need for food”: 0 = full, 100 = starving.
 * UI shows the inverse as **satiated** (higher = fuller).
 */
export function satiatedFromStoredHunger(hunger: number): number {
  return 100 - hunger;
}

/**
 * Calendar “life day” for the pet (1 = first local calendar day since `createdAt`).
 * Uses local date boundaries so it matches what players expect on their wall clock.
 */
export function petDayNumber(createdAtIso: string, now: Date): number {
  const created = new Date(createdAtIso);
  const start = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate()
  );
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor(
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  );
  return Math.max(1, diffDays + 1);
}
