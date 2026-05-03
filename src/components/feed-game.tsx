"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type PropsWithChildren,
  type Ref,
} from "react";
import { FOOD_CONFIG, fallProgress, type FoodKind } from "@/lib/feed-game";

const YARD_BG_DAY = "/sprites/yard-background.png";
const DOG_SHEET = "/sprites/happy.webp";

const SPRITE_FRAMES = 8;
const SPRITE_LOOP_MS = 2800;
const FRAME_MS = Math.round(SPRITE_LOOP_MS / SPRITE_FRAMES);

/** 0.75 of PetSprite yard size — smaller dog & food = tighter catches. */
const FEED_VISUAL_SCALE = 0.75;

/** Rendered dog frame size (PetSprite uses 128; here 25% smaller). */
const DOG_VIEW_PX = Math.round(128 * FEED_VISUAL_SCALE);
const DOG_BOTTOM_PX = Math.round(10 * FEED_VISUAL_SCALE);
/** Plan: move dog by ±300 px/s while keys held; pointer easing uses the same cap. */
const DOG_SPEED_PX_PER_S = 300;
/** Catch radius scales with dog so difficulty stays consistent vs sprite size. */
const CATCH_RADIUS_PX = Math.round(56 * FEED_VISUAL_SCALE);
/** Falling food emoji (25% smaller than prior 40px). */
const EMOJI_SIZE_PX = Math.round(40 * FEED_VISUAL_SCALE);
/** Item center crosses this many px below dog top before we test catch (scaled with dog). */
const CATCH_LINE_OFFSET_PX = Math.round(32 * FEED_VISUAL_SCALE);
/** Plan: show result ~900ms before settling stats. */
const RESULT_HOLD_MS = 900;

type ItemState = {
  id: string;
  /** Horizontal position as 0..1 of container width (resilient to resizes). */
  xNorm: number;
  /** ms relative to game start when this item starts falling. */
  spawnAt: number;
  caught: boolean;
  missed: boolean;
};

type Phase = "playing" | "result";

/** Inner overlay that lets the user pick which food to feed. */
export function FeedChoose({
  onPick,
  onCancel,
}: {
  onPick: (food: FoodKind) => void;
  onCancel: () => void;
}) {
  return (
    <YardCard label="Pick what to feed">
      <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 p-4">
        <p className="rounded-md bg-black/45 px-3 py-1 text-center text-sm font-semibold text-white">
          What should Sandy eat?
        </p>
        <div className="grid w-full max-w-[280px] grid-cols-2 gap-3">
          <FoodChoiceButton food="carrot" onClick={() => onPick("carrot")} />
          <FoodChoiceButton food="meat" onClick={() => onPick("meat")} />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 rounded-lg bg-white/85 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm transition hover:bg-white dark:bg-zinc-900/80"
        >
          Cancel
        </button>
      </div>
    </YardCard>
  );
}

function FoodChoiceButton({
  food,
  onClick,
}: {
  food: FoodKind;
  onClick: () => void;
}) {
  const cfg = FOOD_CONFIG[food];
  const subtitle =
    food === "carrot" ? "Easier · up to +25" : "Harder · up to +50";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border border-black/10 bg-white/90 px-3 py-3 text-foreground shadow-sm transition hover:scale-[1.03] hover:bg-white active:scale-95 dark:border-white/10 dark:bg-zinc-900/85"
    >
      <span className="text-4xl leading-none" aria-hidden>
        {cfg.glyph}
      </span>
      <span className="text-sm font-semibold">{cfg.label}</span>
      <span className="text-[10px] uppercase tracking-wide text-foreground/60">
        {subtitle}
      </span>
    </button>
  );
}

/** Catch mini-game. Calls `onDone(caught)` after the result overlay finishes. */
export function FeedGame({
  food,
  onDone,
}: {
  food: FoodKind;
  onDone: (caught: number) => void;
}) {
  const cfg = FOOD_CONFIG[food];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("playing");
  const [, setTick] = useState(0);
  const [frame, setFrame] = useState(0);

  // Mutable per-frame state lives in refs to avoid React re-renders inside RAF.
  const dogXRef = useRef<number>(0);
  const targetXRef = useRef<number | null>(null);
  const capturedRef = useRef<boolean>(false);
  const heldRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<ItemState[]>([]);
  const lastFrameRef = useRef<number>(0);
  const gameStartRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const finishedRef = useRef<boolean>(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Measure the yard container so coordinates are pixel-accurate.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Roll items + center the dog as soon as we know the container size.
  useEffect(() => {
    if (!size) return;
    if (itemsRef.current.length > 0) {
      // Resized mid-game: just clamp the dog to the new bounds.
      const half = DOG_VIEW_PX / 2;
      dogXRef.current = Math.max(
        half,
        Math.min(size.w - half, dogXRef.current)
      );
      return;
    }
    const items: ItemState[] = [];
    for (let i = 0; i < cfg.total; i++) {
      const jitter = (Math.random() - 0.5) * cfg.spawnEveryMs * 0.4;
      items.push({
        id: `it-${i}`,
        xNorm: 0.08 + Math.random() * 0.84,
        spawnAt: i * cfg.spawnEveryMs + Math.max(0, jitter),
        caught: false,
        missed: false,
      });
    }
    itemsRef.current = items;
    dogXRef.current = size.w / 2;
    gameStartRef.current = performance.now();
  }, [size, cfg]);

  // Keyboard controls (held set + arrow + WASD).
  useEffect(() => {
    if (phase !== "playing") return;
    const movementKeys = new Set([
      "arrowleft",
      "arrowright",
      "a",
      "d",
    ]);
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (movementKeys.has(k)) {
        heldRef.current.add(k);
        e.preventDefault();
      }
    }
    function up(e: KeyboardEvent) {
      heldRef.current.delete(e.key.toLowerCase());
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      heldRef.current.clear();
    };
  }, [phase]);

  // Sprite-strip frame ticker (decoupled from RAF; same cadence as PetSprite).
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPRITE_FRAMES);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  // Main RAF loop: move dog, advance items, detect catches/misses, end game.
  useEffect(() => {
    if (!size || phase !== "playing") return;
    let raf = 0;
    lastFrameRef.current = performance.now();

    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - lastFrameRef.current) / 1000);
      lastFrameRef.current = t;
      const elapsed = t - gameStartRef.current;
      elapsedRef.current = elapsed;

      const speedPx = DOG_SPEED_PX_PER_S;

      // Move dog: keyboard wins when active, otherwise ease toward pointer target.
      let dx = 0;
      const held = heldRef.current;
      if (held.has("arrowleft") || held.has("a")) dx -= 1;
      if (held.has("arrowright") || held.has("d")) dx += 1;
      if (dx !== 0) {
        dogXRef.current += dx * speedPx * dt;
      } else if (targetXRef.current != null) {
        const diff = targetXRef.current - dogXRef.current;
        const max = speedPx * dt;
        dogXRef.current += Math.abs(diff) <= max ? diff : Math.sign(diff) * max;
      }
      const half = DOG_VIEW_PX / 2;
      if (dogXRef.current < half) dogXRef.current = half;
      if (dogXRef.current > size.w - half) dogXRef.current = size.w - half;

      const catchY =
        size.h - DOG_BOTTOM_PX - DOG_VIEW_PX + CATCH_LINE_OFFSET_PX;
      const dogX = dogXRef.current;
      let pendingOrFalling = 0;
      for (const it of itemsRef.current) {
        if (it.caught || it.missed) continue;
        if (elapsed < it.spawnAt) {
          pendingOrFalling++;
          continue;
        }
        const u = (elapsed - it.spawnAt) / cfg.fallMs;
        const progress = fallProgress(u, cfg.fallEasePower);
        const itemY = -EMOJI_SIZE_PX / 2 + progress * (size.h + EMOJI_SIZE_PX);
        const itemX = it.xNorm * size.w;
        if (itemY >= catchY) {
          if (Math.abs(itemX - dogX) < CATCH_RADIUS_PX) {
            it.caught = true;
            continue;
          }
        }
        if (itemY > size.h + EMOJI_SIZE_PX / 2) {
          it.missed = true;
          continue;
        }
        pendingOrFalling++;
      }

      // Trigger React render to redraw positions from the refs above.
      setTick((n) => (n + 1) % 1_000_000);

      if (pendingOrFalling === 0) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          setPhase("result");
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, phase, cfg]);

  // After showing the result overlay briefly, hand the score back to the parent.
  useEffect(() => {
    if (phase !== "result") return;
    const caught = itemsRef.current.filter((i) => i.caught).length;
    const id = setTimeout(() => onDoneRef.current(caught), RESULT_HOLD_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const onPointerDown: PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (phase !== "playing") return;
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      targetXRef.current = e.clientX - r.left;
      capturedRef.current = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers throw if the pointer is already captured elsewhere; safe to ignore.
      }
    },
    [phase]
  );
  const onPointerMove: PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (!capturedRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      targetXRef.current = e.clientX - r.left;
    },
    []
  );
  const onPointerUp: PointerEventHandler<HTMLDivElement> = useCallback(() => {
    capturedRef.current = false;
    targetXRef.current = null;
  }, []);

  const sheetW = DOG_VIEW_PX * SPRITE_FRAMES;
  const items = itemsRef.current;
  const elapsed = elapsedRef.current;
  const dogX = dogXRef.current;
  const caughtCount = items.reduce((a, i) => a + (i.caught ? 1 : 0), 0);
  const missedCount = items.reduce((a, i) => a + (i.missed ? 1 : 0), 0);
  const total = cfg.total;
  const remainingCount = total - caughtCount - missedCount;

  return (
    <YardCard
      ref={containerRef}
      label={`Catch the falling ${cfg.label.toLowerCase()}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {size &&
        phase === "playing" &&
        items.map((it) => {
          if (it.caught || it.missed) return null;
          if (elapsed < it.spawnAt) return null;
          const u = (elapsed - it.spawnAt) / cfg.fallMs;
          const progress = fallProgress(u, cfg.fallEasePower);
          const y =
            -EMOJI_SIZE_PX / 2 + progress * (size.h + EMOJI_SIZE_PX);
          const x = it.xNorm * size.w;
          return (
            <span
              key={it.id}
              className="pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2 select-none leading-none"
              style={{
                left: x,
                top: y,
                fontSize: EMOJI_SIZE_PX,
              }}
              aria-hidden
            >
              {cfg.glyph}
            </span>
          );
        })}

      {size && (
        <div
          className="pointer-events-none absolute z-[2] flex shrink-0 items-center justify-center overflow-hidden"
          style={{
            width: DOG_VIEW_PX,
            height: DOG_VIEW_PX,
            left: dogX - DOG_VIEW_PX / 2,
            bottom: DOG_BOTTOM_PX,
          }}
        >
          <div
            role="img"
            aria-label="Catch dog"
            className="shrink-0"
            style={{
              width: DOG_VIEW_PX,
              height: DOG_VIEW_PX,
              backgroundImage: `url(${DOG_SHEET})`,
              backgroundSize: `${sheetW}px ${DOG_VIEW_PX}px`,
              backgroundPosition: `${-frame * DOG_VIEW_PX}px 0`,
            }}
          />
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 z-[4] flex min-w-[7.5rem] flex-col gap-0.5 rounded-md bg-black/55 px-2 py-1.5 text-left text-[11px] font-semibold leading-tight text-white">
        <span>
          Caught {caughtCount} / {total}
        </span>
        <span
          className={
            missedCount > 0
              ? "font-semibold text-red-300"
              : "font-medium text-white/75"
          }
        >
          Missed {missedCount}
        </span>
        {remainingCount > 0 && phase === "playing" && (
          <span className="font-medium text-white/70">
            {remainingCount} left
          </span>
        )}
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-[4] rounded-md bg-black/45 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
        {cfg.label}
      </div>

      {phase === "result" && (
        <ResultOverlay food={food} caught={caughtCount} total={total} />
      )}
    </YardCard>
  );
}

function ResultOverlay({
  food,
  caught,
  total,
}: {
  food: FoodKind;
  caught: number;
  total: number;
}) {
  const cfg = FOOD_CONFIG[food];
  const missed = total - caught;
  const isAll = caught === total;
  const isNone = caught === 0;
  const satiated = isAll
    ? cfg.satiatedAll
    : isNone
      ? 0
      : Math.round((caught / total) * cfg.satiatedAll);
  const energy = isAll ? 0 : cfg.energyPenalty;

  return (
    <div className="absolute inset-0 z-[10] flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
      <div className="rounded-xl bg-white/95 px-5 py-4 text-center text-foreground shadow-lg dark:bg-zinc-900/95">
        <p className="text-base font-semibold">
          Caught {caught} / {total}
        </p>
        {missed > 0 && (
          <p className="mt-0.5 text-sm font-medium text-red-600 dark:text-red-400">
            Missed {missed}
          </p>
        )}
        <p className="mt-1 text-xs text-foreground/70">
          {satiated > 0 ? `+${satiated} satiated` : null}
          {satiated > 0 && energy > 0 ? " · " : ""}
          {energy > 0 ? `-${energy} energy` : null}
          {satiated === 0 && energy === 0 ? "no change" : null}
        </p>
      </div>
    </div>
  );
}

type YardCardProps = PropsWithChildren<{
  label: string;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
  ref?: Ref<HTMLDivElement>;
}>;

/** Same styling as PetSprite's wrapper so swapping in/out is visually seamless. */
function YardCard({
  ref,
  label,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: YardCardProps) {
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="relative mx-auto aspect-square w-full max-w-[min(90vw,384px)] touch-none overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-200 shadow-inner dark:border-zinc-600"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${YARD_BG_DAY})`,
          backgroundPosition: "center 55%",
        }}
        aria-hidden
      />
      {children}
    </div>
  );
}
