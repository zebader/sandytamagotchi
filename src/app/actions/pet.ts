"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getPetRates, type PetRates } from "@/lib/pet-rates";
import { applyTimeDecay, clampStat, type DecayedState } from "@/lib/pet-time";
import { ownerCookieOptions, OWNER_COOKIE } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { PetState } from "@/lib/pet-state";

const DEFAULT_STATS = {
  name: "Sandy" as const,
  hunger: 40,
  hygiene: 80,
  fun: 75,
  rest: 70,
  isSleeping: false,
};

function toState(
  p: {
    id: string;
    name: string;
    hunger: number;
    hygiene: number;
    fun: number;
    rest: number;
    isSleeping: boolean;
    updatedAt: Date;
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
    updatedAt: p.updatedAt.toISOString(),
    serverTime: serverTime.toISOString(),
    rates: { ...rates },
  };
}

export async function getOrCreatePet(): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const cookieStore = await cookies();
  const ownerId = cookieStore.get(OWNER_COOKIE)?.value;

  if (ownerId) {
    const pet = await prisma.pet.findUnique({ where: { ownerId } });
    if (pet) {
      const decayed = applyTimeDecay(pet, now, rates);
      const saved = await prisma.pet.update({
        where: { id: pet.id },
        data: {
          hunger: decayed.hunger,
          hygiene: decayed.hygiene,
          fun: decayed.fun,
          rest: decayed.rest,
          isSleeping: decayed.isSleeping,
          updatedAt: decayed.updatedAt,
        },
      });
      revalidatePath("/");
      return toState(saved, rates, now);
    }
  }

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
          updatedAt: now,
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

async function mutatePet(
  transform: (decayed: DecayedState) => DecayedState
): Promise<PetState> {
  const now = new Date();
  const rates = getPetRates();
  const ownerId = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!ownerId) {
    return getOrCreatePet();
  }

  const pet = await prisma.pet.findUnique({ where: { ownerId } });
  if (!pet) {
    return getOrCreatePet();
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

export async function feed(): Promise<PetState> {
  return mutatePet((d) => ({ ...d, hunger: clampStat(d.hunger - 25) }));
}

export async function clean(): Promise<PetState> {
  return mutatePet((d) => ({ ...d, hygiene: clampStat(d.hygiene + 30) }));
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
