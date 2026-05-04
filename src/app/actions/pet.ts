"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getPetRates, type PetRates } from "@/lib/pet-rates";
import {
  countNeglectUtcDays,
  parseSessionEndStats,
  shouldSurrenderForNeglect,
  type SessionEndStats,
} from "@/lib/pet-neglect";
import { applyTimeDecay, clampStat, type DecayedState } from "@/lib/pet-time";
import { ownerCookieOptions, OWNER_COOKIE } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { PetState } from "@/lib/pet-state";
import {
  HYGIENE_PER_POOP,
  parseYardPoops,
  reconcileYardPoops,
} from "@/lib/pet-clean-game";
import { FOOD_CONFIG, feedDeltas, type FoodKind } from "@/lib/feed-game";

const DEFAULT_STATS = {
  name: "Sandy" as const,
  hunger: 40,
  hygiene: 80,
  fun: 75,
  rest: 70,
  isSleeping: false,
};

function sessionEndStatsFromPet(p: {
  hunger: number;
  hygiene: number;
  fun: number;
  rest: number;
  isSleeping: boolean;
}): SessionEndStats {
  return {
    hunger: p.hunger,
    hygiene: p.hygiene,
    fun: p.fun,
    rest: p.rest,
    isSleeping: p.isSleeping,
  };
}

function toState(
  p: {
    id: string;
    name: string;
    hunger: number;
    hygiene: number;
    fun: number;
    rest: number;
    isSleeping: boolean;
    createdAt: Date;
    updatedAt: Date;
    yardPoops: unknown;
    isSurrendered: boolean;
  },
  rates: PetRates,
  serverTime: Date
): PetState {
  return {
    id: p.id,
    name: p.name,
    hunger: p.hunger,
    hygiene: p.hygiene,
    fun: p.fun,
    rest: p.rest,
    isSleeping: p.isSleeping,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    serverTime: serverTime.toISOString(),
    rates: { ...rates },
    yardPoops: parseYardPoops(p.yardPoops),
    isSurrendered: p.isSurrendered,
  };
}

async function createOwnerAndPet(): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const cookieStore = await cookies();
  const snapshot = sessionEndStatsFromPet(DEFAULT_STATS);
  const created = await prisma.owner.create({
    data: {
      pet: {
        create: {
          name: DEFAULT_STATS.name,
          hunger: DEFAULT_STATS.hunger,
          hygiene: DEFAULT_STATS.hygiene,
          fun: DEFAULT_STATS.fun,
          rest: DEFAULT_STATS.rest,
          isSleeping: DEFAULT_STATS.isSleeping,
          yardPoops: [],
          updatedAt: now,
          isSurrendered: false,
          lastSessionEndAt: now,
          lastSessionEndStats: snapshot,
        },
      },
    },
    include: { pet: true },
  });

  if (!created.pet) {
    throw new Error("Failed to create pet with owner");
  }

  cookieStore.set(OWNER_COOKIE, created.id, ownerCookieOptions);
  revalidatePath("/");
  return toState(created.pet, rates, now);
}

/**
 * First load / full session start: evaluates neglect (UTC bad-day count &gt; 3), may set
 * `isSurrendered`, and persists decayed stats when the pet is still in your care.
 */
export async function startPetSession(): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const cookieStore = await cookies();
  const ownerId = cookieStore.get(OWNER_COOKIE)?.value;

  if (!ownerId) {
    return createOwnerAndPet();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return createOwnerAndPet();
  }

  if (pet.isSurrendered) {
    return toState(pet, rates, now);
  }

  const anchorFrom = pet.lastSessionEndAt ?? pet.createdAt;
  const parsed = parseSessionEndStats(pet.lastSessionEndStats);
  const anchorStats = parsed ?? sessionEndStatsFromPet(pet);
  const neglectDays = countNeglectUtcDays(anchorFrom, now, anchorStats, rates);

  const decayed = applyTimeDecay(pet, now, rates);
  const nextPoops = reconcileYardPoops(
    parseYardPoops(pet.yardPoops),
    decayed.hygiene
  );

  if (shouldSurrenderForNeglect(neglectDays)) {
    const saved = await prisma.pet.update({
      where: { id: pet.id },
      data: {
        hunger: decayed.hunger,
        hygiene: decayed.hygiene,
        fun: decayed.fun,
        rest: decayed.rest,
        isSleeping: decayed.isSleeping,
        yardPoops: nextPoops,
        updatedAt: decayed.updatedAt,
        isSurrendered: true,
      },
    });
    revalidatePath("/");
    return toState(saved, rates, now);
  }

  const saved = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      hunger: decayed.hunger,
      hygiene: decayed.hygiene,
      fun: decayed.fun,
      rest: decayed.rest,
      isSleeping: decayed.isSleeping,
      yardPoops: nextPoops,
      updatedAt: decayed.updatedAt,
    },
  });
  revalidatePath("/");
  return toState(saved, rates, now);
}

/**
 * Lightweight sync: returns the stored row without persisting time decay, so in-tab
 * simulation can advance from `updatedAt` without moving the neglect session anchor.
 */
export async function syncPetFromServer(): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const cookieStore = await cookies();
  const ownerId = cookieStore.get(OWNER_COOKIE)?.value;

  if (!ownerId) {
    return createOwnerAndPet();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return createOwnerAndPet();
  }

  return toState(pet, rates, now);
}

/** @deprecated Prefer `startPetSession` or `syncPetFromServer`. */
export async function getOrCreatePet(): Promise<PetState> {
  return startPetSession();
}

/** Persist decayed stats and the session snapshot when the tab is hidden or unloaded. */
export async function recordSessionEnd(): Promise<void> {
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) return;

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet || pet.isSurrendered) return;

  const decayed = applyTimeDecay(pet, now, rates);
  const nextPoops = reconcileYardPoops(
    parseYardPoops(pet.yardPoops),
    decayed.hygiene
  );
  const snapshot = sessionEndStatsFromPet(decayed);

  await prisma.pet.update({
    where: { id: pet.id },
    data: {
      hunger: decayed.hunger,
      hygiene: decayed.hygiene,
      fun: decayed.fun,
      rest: decayed.rest,
      isSleeping: decayed.isSleeping,
      yardPoops: nextPoops,
      updatedAt: decayed.updatedAt,
      lastSessionEndAt: now,
      lastSessionEndStats: snapshot,
    },
  });
  revalidatePath("/");
}

export async function resetAfterSurrender(): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) {
    return createOwnerAndPet();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return createOwnerAndPet();
  }
  if (!pet.isSurrendered) {
    throw new Error("Nothing to reset right now.");
  }

  const snapshot = sessionEndStatsFromPet(DEFAULT_STATS);
  const saved = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      name: DEFAULT_STATS.name,
      hunger: DEFAULT_STATS.hunger,
      hygiene: DEFAULT_STATS.hygiene,
      fun: DEFAULT_STATS.fun,
      rest: DEFAULT_STATS.rest,
      isSleeping: DEFAULT_STATS.isSleeping,
      yardPoops: [],
      updatedAt: now,
      createdAt: now,
      isSurrendered: false,
      lastSessionEndAt: now,
      lastSessionEndStats: snapshot,
    },
  });
  revalidatePath("/");
  return toState(saved, rates, now);
}

async function mutatePet(
  transform: (decayed: DecayedState) => DecayedState
): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) {
    return startPetSession();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return startPetSession();
  }
  if (pet.isSurrendered) {
    throw new Error(
      "Your pet is no longer in your care. Open the envelope to start over."
    );
  }

  const decayed = applyTimeDecay(pet, now, rates);
  const next = transform(decayed);

  const saved = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      hunger: clampStat(next.hunger),
      hygiene: clampStat(next.hygiene),
      fun: clampStat(next.fun),
      rest: clampStat(next.rest),
      isSleeping: next.isSleeping,
      updatedAt: now,
    },
  });
  revalidatePath("/");
  return toState(saved, rates, now);
}

/**
 * Apply the outcome of a Feed catch round.
 * - food: which item the player picked
 * - caught: how many of the round's `total` items the player caught (clamped server-side)
 *
 * Mapping of caught -> stat changes lives in `lib/feed-game.ts` so client and server
 * can never drift on balance.
 */
export async function feed(food: FoodKind, caught: number): Promise<PetState> {
  const cfg = FOOD_CONFIG[food];
  if (!cfg) {
    throw new Error("Unknown food");
  }
  const safeCaught = Math.max(0, Math.min(cfg.total, Math.floor(caught)));
  const { hungerDelta, restDelta } = feedDeltas(food, safeCaught, cfg.total);
  return mutatePet((d) => ({
    ...d,
    hunger: clampStat(d.hunger + hungerDelta),
    rest: clampStat(d.rest + restDelta),
  }));
}

/** One poop click: +12.5 hygiene and one fewer poop (count follows hygiene). */
export async function cleanPoop(poopId: string): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) {
    return startPetSession();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return startPetSession();
  }
  if (pet.isSurrendered) {
    throw new Error(
      "Your pet is no longer in your care. Open the envelope to start over."
    );
  }

  const decayed = applyTimeDecay(pet, now, rates);
  let poops = parseYardPoops(pet.yardPoops);
  if (!poops.some((p) => p.id === poopId)) {
    throw new Error("That mess is already gone");
  }
  poops = poops.filter((p) => p.id !== poopId);
  const newHygiene = clampStat(decayed.hygiene + HYGIENE_PER_POOP);
  const nextPoops = reconcileYardPoops(poops, newHygiene);

  const saved = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      hunger: clampStat(decayed.hunger),
      hygiene: newHygiene,
      fun: clampStat(decayed.fun),
      rest: clampStat(decayed.rest),
      isSleeping: decayed.isSleeping,
      yardPoops: nextPoops,
      updatedAt: now,
    },
  });
  revalidatePath("/");
  return toState(saved, rates, now);
}

export async function play(): Promise<PetState> {
  return mutatePet((d) => ({
    ...d,
    fun: clampStat(d.fun + 20),
    rest: clampStat(d.rest - 10),
  }));
}

export async function toggleSleep(): Promise<PetState> {
  return mutatePet((d) => ({ ...d, isSleeping: !d.isSleeping }));
}

/**
 * Development only: sets `isSurrendered` so you can test the envelope + modal flow
 * without simulating multi-day neglect. No-op in production.
 */
export async function devTriggerSurrender(): Promise<PetState> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This action is only available in development.");
  }
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) {
    return startPetSession();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return startPetSession();
  }
  if (pet.isSurrendered) {
    return toState(pet, rates, now);
  }

  const decayed = applyTimeDecay(pet, now, rates);
  const nextPoops = reconcileYardPoops(
    parseYardPoops(pet.yardPoops),
    decayed.hygiene
  );
  const saved = await prisma.pet.update({
    where: { id: pet.id },
    data: {
      hunger: decayed.hunger,
      hygiene: decayed.hygiene,
      fun: decayed.fun,
      rest: decayed.rest,
      isSleeping: decayed.isSleeping,
      yardPoops: nextPoops,
      updatedAt: decayed.updatedAt,
      isSurrendered: true,
    },
  });
  revalidatePath("/");
  return toState(saved, rates, now);
}
