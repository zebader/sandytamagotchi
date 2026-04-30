"use client";

import { useEffect, useState } from "react";
import { satiatedFromStoredHunger } from "@/lib/pet-display";
import type { DecayedState } from "@/lib/pet-time";

/** 2048×256 WebP strips: 8 frames × 256×256, horizontal (left → right). */
const HAPPY_SHEET = "/sprites/happy.webp";
const SAD_SHEET = "/sprites/sad.webp";
const SLEEP_SHEET = "/sprites/sleep.webp";
const YARD_BACKGROUND = "/sprites/yard-background.png";

const SPRITE_FRAMES = 8;
/** Full loop duration for all frames (larger = slower). */
const SPRITE_LOOP_MS = 2800;
const FRAME_MS = Math.round(SPRITE_LOOP_MS / SPRITE_FRAMES);

/** Rendered frame size inside the yard stage (native art is 256×256 per frame). */
const SPRITE_VIEW_PX = 128;

/** “Lights out” dim when sleeping — fade in/out (ms). */
const SLEEP_OVERLAY_MS = 500;

/**
 * Happy when satiated and energy are above half, **and** either clean or having fun.
 */
export function isPetMoodHappy(live: DecayedState): boolean {
  return (
    (live.hygiene > 50 || live.fun > 50) &&
    satiatedFromStoredHunger(live.hunger) > 50 &&
    live.rest > 50
  );
}

/** Which stat rows to stress in red when awake and sad (matches `isPetMoodHappy`). */
export type PetSadHighlight = {
  satiated: boolean;
  hygiene: boolean;
  fun: boolean;
  energy: boolean;
};

export function petSadStatHighlights(live: DecayedState): PetSadHighlight | null {
  if (live.isSleeping || isPetMoodHappy(live)) return null;
  const needPlayOrClean = !(live.hygiene > 50 || live.fun > 50);
  return {
    satiated: satiatedFromStoredHunger(live.hunger) <= 50,
    hygiene: needPlayOrClean,
    fun: needPlayOrClean,
    energy: live.rest <= 50,
  };
}

export function PetSprite({ live }: { live: DecayedState }) {
  const sleeping = live.isSleeping;
  const happy = isPetMoodHappy(live);
  const sheet = sleeping ? SLEEP_SHEET : happy ? HAPPY_SHEET : SAD_SHEET;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPRITE_FRAMES);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setFrame(0);
  }, [happy, sleeping]);

  const sheetW = SPRITE_VIEW_PX * SPRITE_FRAMES;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[min(90vw,384px)] overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-200 bg-cover bg-center shadow-inner dark:border-zinc-600"
      style={{
        backgroundImage: `url(${YARD_BACKGROUND})`,
        backgroundPosition: "center 55%",
      }}
      aria-label={
        sleeping ? "Pet is sleeping" : happy ? "Pet is happy" : "Pet is sad"
      }
    >
        <div
          className="absolute bottom-10 left-1/2 z-[1] flex -translate-x-1/2 shrink-0 items-center justify-center overflow-hidden"
          style={{ width: SPRITE_VIEW_PX, height: SPRITE_VIEW_PX }}
        >
          <div
            role="img"
            className="pet-sprite-strip shrink-0"
            style={{
              width: SPRITE_VIEW_PX,
              height: SPRITE_VIEW_PX,
              backgroundImage: `url(${sheet})`,
              backgroundSize: `${sheetW}px ${SPRITE_VIEW_PX}px`,
              backgroundPosition: `${-frame * SPRITE_VIEW_PX}px 0`,
            }}
          />
        </div>
        {/* Dim the stage when sleeping (fade ≈ lights out). */}
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-black"
          style={{
            opacity: sleeping ? 0.6 : 0,
            transition: `opacity ${SLEEP_OVERLAY_MS}ms ease-in-out`,
          }}
          aria-hidden
        />
    </div>
  );
}
