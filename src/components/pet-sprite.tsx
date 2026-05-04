"use client";

import { useEffect, useState } from "react";
import { satiatedFromStoredHunger } from "@/lib/pet-display";
import type { YardPoop } from "@/lib/pet-clean-game";
import type { DecayedState } from "@/lib/pet-time";

/** 2048×256 WebP strips: 8 frames × 256×256, horizontal (left → right). */
const HAPPY_SHEET = "/sprites/happy.webp";
const SAD_SHEET = "/sprites/sad.webp";
const SLEEP_SHEET = "/sprites/sleep.webp";
const YARD_BACKGROUND_DAY = "/sprites/yard-background.png";
const YARD_BACKGROUND_NIGHT = "/sprites/yard-background-night.png";

const SPRITE_FRAMES = 8;
/** Full loop duration for all frames (larger = slower). */
const SPRITE_LOOP_MS = 2800;
const FRAME_MS = Math.round(SPRITE_LOOP_MS / SPRITE_FRAMES);

/** Rendered frame size inside the yard stage (native art is 256×256 per frame). */
const SPRITE_VIEW_PX = 128;

const YARD_STAGE_CLASS =
  "relative mx-auto aspect-square w-full max-w-[min(90vw,384px)] overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-200 shadow-inner dark:border-zinc-600";

/** Day ↔ night yard background crossfade (ms). */
const SLEEP_BG_CROSSFADE_MS = 500;

/** “Lights out” dim over the whole stage when sleeping (ms). */
const SLEEP_OVERLAY_MS = 500;

const POOP_SPRITE = "/sprites/poop.png";
const POOP_SIZE_PX = 44;

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

export function PetSprite({
  live,
  poops = [],
  onPoopClick,
  poopInteractionDisabled = false,
}: {
  live: DecayedState;
  poops?: YardPoop[];
  onPoopClick?: (id: string) => void;
  poopInteractionDisabled?: boolean;
}) {
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

  const bgTransition = `opacity ${SLEEP_BG_CROSSFADE_MS}ms ease-in-out`;

  return (
    <div
      className={YARD_STAGE_CLASS}
      aria-label={
        sleeping ? "Pet is sleeping" : happy ? "Pet is happy" : "Pet is sad"
      }
    >
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${YARD_BACKGROUND_NIGHT})`,
            backgroundPosition: "center 55%",
            opacity: sleeping ? 1 : 0,
            transition: bgTransition,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${YARD_BACKGROUND_DAY})`,
            backgroundPosition: "center 55%",
            opacity: sleeping ? 0 : 1,
            transition: bgTransition,
          }}
          aria-hidden
        />
        {/* Poops sit behind the pet so they never cover the animation. */}
        <div
          className={`absolute inset-0 z-[1] ${poopInteractionDisabled ? "pointer-events-none" : ""}`}
          aria-hidden={poops.length === 0}
        >
          {poops.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={poopInteractionDisabled}
              onClick={() => onPoopClick?.(p.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border-0 bg-transparent p-0.5 transition-transform duration-150 ease-out hover:scale-110 disabled:cursor-not-allowed"
              style={{
                left: `${p.leftPct}%`,
                top: `${p.topPct}%`,
                width: POOP_SIZE_PX,
                height: POOP_SIZE_PX,
              }}
              aria-label="Pick up mess"
            >
              <img
                src={POOP_SPRITE}
                alt=""
                width={POOP_SIZE_PX - 4}
                height={POOP_SIZE_PX - 4}
                className="h-full w-full object-contain"
                draggable={false}
              />
            </button>
          ))}
        </div>
        <div
          className="pointer-events-none absolute bottom-10 left-1/2 z-[2] flex -translate-x-1/2 shrink-0 items-center justify-center overflow-hidden"
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

/**
 * Same yard framing and day/night backgrounds as the living pet, with the sprite
 * removed—only a note where the dog used to stand.
 */
export function SurrenderedYardNote({
  nightYard,
  onOpenNote,
  disabled,
}: {
  /** When true, show the same night yard as a sleeping pet would. */
  nightYard: boolean;
  onOpenNote: () => void;
  disabled?: boolean;
}) {
  const bgTransition = `opacity ${SLEEP_BG_CROSSFADE_MS}ms ease-in-out`;

  return (
    <div
      className={YARD_STAGE_CLASS}
      aria-label="A note was left in the yard"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${YARD_BACKGROUND_NIGHT})`,
          backgroundPosition: "center 55%",
          opacity: nightYard ? 1 : 0,
          transition: bgTransition,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${YARD_BACKGROUND_DAY})`,
          backgroundPosition: "center 55%",
          opacity: nightYard ? 0 : 1,
          transition: bgTransition,
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 z-[2]">
        <button
          type="button"
          onClick={onOpenNote}
          disabled={disabled}
          className="pointer-events-auto absolute bottom-[30px] left-1/2 rounded-lg border-0 bg-transparent p-0 text-6xl leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 disabled:pointer-events-none disabled:opacity-50"
          style={{
            transform: "translateX(-50%) rotate3d(35, -10, 10, 45deg)",
          }}
          aria-label="Read the note from the shelter"
        >
          <span
            className="inline-block transition-transform duration-150 ease-out hover:scale-110"
            aria-hidden
          >
            ✉️
          </span>
        </button>
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-black"
        style={{
          opacity: nightYard ? 0.6 : 0,
          transition: `opacity ${SLEEP_OVERLAY_MS}ms ease-in-out`,
        }}
        aria-hidden
      />
    </div>
  );
}
