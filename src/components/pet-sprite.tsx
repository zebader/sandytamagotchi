"use client";

import { useEffect, useState } from "react";
import { satiatedFromStoredHunger } from "@/lib/pet-display";
import type { DecayedState } from "@/lib/pet-time";

/** 2048×256 WebP strips: 8 frames × 256×256, horizontal (left → right). */
const HAPPY_SHEET = "/sprites/happy.webp";
const SAD_SHEET = "/sprites/sad.webp";
const SLEEP_SHEET = "/sprites/sleep.webp";

const SPRITE_FRAMES = 8;
/** Full loop duration for all frames (larger = slower). */
const SPRITE_LOOP_MS = 2800;
const FRAME_MS = Math.round(SPRITE_LOOP_MS / SPRITE_FRAMES);

/** Rendered frame size inside the larger white stage (native art is 256×256 per frame). */
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

export function petMoodHint(live: DecayedState): string | null {
  if (live.isSleeping) return null;
  if (isPetMoodHappy(live)) return null;
  const parts: string[] = [];
  if (!(live.hygiene > 50 || live.fun > 50)) {
    parts.push("Play or clean (hygiene or fun above 50)");
  }
  if (satiatedFromStoredHunger(live.hunger) <= 50) {
    parts.push("Feed until satiated is above 50");
  }
  if (live.rest <= 50) {
    parts.push("Sleep until energy is above 50");
  }
  return parts.length ? parts.join(" · ") : null;
}

export function PetSprite({ live }: { live: DecayedState }) {
  const sleeping = live.isSleeping;
  const happy = isPetMoodHappy(live);
  const sheet = sleeping ? SLEEP_SHEET : happy ? HAPPY_SHEET : SAD_SHEET;
  const label = sleeping ? "Sleeping" : happy ? "Happy" : "Sad";
  const hint = petMoodHint(live);
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
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative mx-auto flex aspect-square w-full max-w-[min(90vw,384px)] items-center justify-center overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-inner dark:border-zinc-500"
        aria-label={sleeping ? "Pet is sleeping" : `Pet mood: ${label}`}
      >
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden"
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
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-foreground/60">{label}</p>
        {hint ? (
          <p className="mt-1 text-xs leading-snug text-foreground/45">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
