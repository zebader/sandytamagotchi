import { satiatedFromStoredHunger } from "./pet-display";
import type { PetRates } from "./pet-rates";
import { applyTimeDecay, type PetForDecay } from "./pet-time";

export type SessionEndStats = {
  hunger: number;
  hygiene: number;
  fun: number;
  rest: number;
  isSleeping: boolean;
};

/** Matches visible stat bars: satiated, hygiene, fun, energy all need to stay at or above 50. */
export function anyCoreStatNeglected(snapshot: {
  hunger: number;
  hygiene: number;
  fun: number;
  rest: number;
}): boolean {
  const satiated = satiatedFromStoredHunger(snapshot.hunger);
  return (
    satiated < 50 ||
    snapshot.hygiene < 50 ||
    snapshot.fun < 50 ||
    snapshot.rest < 50
  );
}

export function parseSessionEndStats(raw: unknown): SessionEndStats | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hunger = Number(o.hunger);
  const hygiene = Number(o.hygiene);
  const fun = Number(o.fun);
  const rest = Number(o.rest);
  const isSleeping = Boolean(o.isSleeping);
  if (
    !Number.isFinite(hunger) ||
    !Number.isFinite(hygiene) ||
    !Number.isFinite(fun) ||
    !Number.isFinite(rest)
  ) {
    return null;
  }
  return { hunger, hygiene, fun, rest, isSleeping };
}

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Counts distinct UTC calendar dates in [from, to) where at some sampled instant
 * (start + hourly) any core stat was below 50. Uses the same decay rules as
 * `applyTimeDecay` with fixed `isSleeping` from the anchor for the whole span.
 */
export function countNeglectUtcDays(
  from: Date,
  to: Date,
  anchor: SessionEndStats,
  rates: PetRates
): number {
  if (!(from.getTime() < to.getTime())) return 0;

  const badUtcDays = new Set<string>();

  if (anyCoreStatNeglected(anchor)) {
    badUtcDays.add(utcDayKey(from));
  }

  let state: PetForDecay = {
    hunger: anchor.hunger,
    hygiene: anchor.hygiene,
    fun: anchor.fun,
    rest: anchor.rest,
    isSleeping: anchor.isSleeping,
    updatedAt: from,
  };

  let t = from.getTime();
  const end = to.getTime();

  while (t < end) {
    const nextT = Math.min(t + HOUR_MS, end);
    const nextDate = new Date(nextT);
    const decayed = applyTimeDecay(state, nextDate, rates);
    if (anyCoreStatNeglected(decayed)) {
      badUtcDays.add(utcDayKey(nextDate));
    }
    state = {
      hunger: decayed.hunger,
      hygiene: decayed.hygiene,
      fun: decayed.fun,
      rest: decayed.rest,
      isSleeping: decayed.isSleeping,
      updatedAt: nextDate,
    };
    t = nextT;
  }

  return badUtcDays.size;
}

/** Strict plan wording: surrender when more than three qualifying UTC days. */
export const NEGLECT_DAYS_BEFORE_SURRENDER = 3;

export function shouldSurrenderForNeglect(neglectUtcDayCount: number): boolean {
  return neglectUtcDayCount > NEGLECT_DAYS_BEFORE_SURRENDER;
}
