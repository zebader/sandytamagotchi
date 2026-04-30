import type { PetRates } from "./pet-rates";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type DecayedState = {
  hunger: number;
  hygiene: number;
  fun: number;
  rest: number;
  isSleeping: boolean;
  /** Wall clock time after the decay simulation step */
  updatedAt: Date;
};

/** Snapshot needed for the decay model (client + server). */
export type PetForDecay = {
  hunger: number;
  hygiene: number;
  fun: number;
  rest: number;
  isSleeping: boolean;
  updatedAt: Date | string;
};

/**
 * Fast-forward stat changes from the stored `updatedAt` to `now` using hourly rates.
 */
export function applyTimeDecay(
  pet: PetForDecay,
  now: Date,
  rates: PetRates
): DecayedState {
  const start = new Date(pet.updatedAt).getTime();
  const deltaMs = Math.max(0, now.getTime() - start);
  const h = deltaMs / (1000 * 60 * 60);
  if (h <= 0) {
    return {
      hunger: pet.hunger,
      hygiene: pet.hygiene,
      fun: pet.fun,
      rest: pet.rest,
      isSleeping: pet.isSleeping,
      updatedAt: new Date(pet.updatedAt),
    };
  }

  if (pet.isSleeping) {
    return {
      hunger: clamp(pet.hunger + rates.hungerRisePerHrSleep * h, 0, 100),
      hygiene: clamp(
        pet.hygiene - rates.hygieneDropPerHr * 0.3 * h,
        0,
        100
      ),
      fun: clamp(pet.fun - rates.funDropPerHrSleep * h, 0, 100),
      rest: clamp(pet.rest + rates.restGainPerHrSleep * h, 0, 100),
      isSleeping: pet.isSleeping,
      updatedAt: now,
    };
  }

  return {
    hunger: clamp(pet.hunger + rates.hungerRisePerHrAwake * h, 0, 100),
    hygiene: clamp(pet.hygiene - rates.hygieneDropPerHr * h, 0, 100),
    fun: clamp(pet.fun - rates.funDropPerHrAwake * h, 0, 100),
    rest: clamp(pet.rest - rates.restDropPerHrAwake * h, 0, 100),
    isSleeping: pet.isSleeping,
    updatedAt: now,
  };
}

export function clampStat(n: number) {
  return clamp(n, 0, 100);
}
