"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  getOrCreatePet,
  feed,
  cleanPoop,
  play,
  toggleSleep,
} from "@/app/actions/pet";
import type { PetState } from "@/lib/pet-state";
import { satiatedFromStoredHunger } from "@/lib/pet-display";
import { applyTimeDecay, type DecayedState } from "@/lib/pet-time";
import { PetSprite, petSadStatHighlights } from "@/components/pet-sprite";
import { FeedChoose, FeedGame } from "@/components/feed-game";
import type { FoodKind } from "@/lib/feed-game";

/** Rates are per *hour*; 1s steps barely move 0.01, so the UI looked “frozen” with `Math.round`. */
const LIVE_TICK_MS = 250;
const SERVER_RESYNC_MS = 90_000;

function formatStat(n: number) {
  return n.toFixed(1);
}

function petAnchorFromState(p: PetState) {
  return {
    hunger: p.hunger,
    hygiene: p.hygiene,
    fun: p.fun,
    rest: p.rest,
    isSleeping: p.isSleeping,
    updatedAt: p.updatedAt,
  };
}

function StatBar({
  label,
  value,
  accentClass,
  stressed,
}: {
  label: string;
  value: number;
  accentClass: string;
  /** Red label + value when this stat is pulling Sandy toward sad. */
  stressed?: boolean;
}) {
  const w = Math.min(100, Math.max(0, value));
  const textClass = stressed
    ? "font-semibold text-red-600 dark:text-red-400"
    : "text-foreground/80";
  const valueClass = stressed
    ? "font-mono text-sm font-semibold tabular-nums text-red-600 dark:text-red-400"
    : "font-mono text-sm font-medium tabular-nums text-foreground";
  return (
    <div className="w-full max-w-md space-y-1">
      <div className="flex justify-between text-sm">
        <span className={textClass}>{label}</span>
        <span className={valueClass}>{formatStat(value)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-2.5 rounded-full ${accentClass} transition-[width] duration-100 ease-linear`}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

export function PetGame() {
  const [base, setBase] = useState<PetState | null>(null);
  /**
   * Offset so `Date.now() + offset` ≈ server time (same instant as `base.serverTime`).
   * Fixes desync where in-tab sim used client clock but reload used server clock.
   */
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  /** Ticks so we recompute `simNow` on an interval. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedMode, setFeedMode] = useState<"idle" | "choose" | "playing">(
    "idle"
  );
  const [feedFood, setFeedFood] = useState<FoodKind | null>(null);

  const applyServerState = useCallback((p: PetState) => {
    setBase(p);
    setClockOffsetMs(new Date(p.serverTime).getTime() - Date.now());
  }, []);

  const resync = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const p = await getOrCreatePet();
        applyServerState(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load pet");
      }
    });
  }, [applyServerState]);

  useEffect(() => {
    resync();
  }, [resync]);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, LIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(resync, SERVER_RESYNC_MS);
    return () => clearInterval(id);
  }, [resync]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        resync();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [resync]);

  const simNow = useMemo(() => {
    // nowMs advances on an interval to re-run this (Date.now() would otherwise be stale in deps)
    void nowMs;
    return new Date(Date.now() + clockOffsetMs);
  }, [clockOffsetMs, nowMs]);

  const live: DecayedState | null = useMemo(() => {
    if (!base) return null;
    return applyTimeDecay(
      petAnchorFromState(base),
      simNow,
      base.rates
    );
  }, [base, simNow]);

  function act(fn: () => Promise<PetState>) {
    setError(null);
    startTransition(async () => {
      try {
        const p = await fn();
        applyServerState(p);
        setNowMs(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  const onPoopClick = useCallback(
    (id: string) => {
      setError(null);
      startTransition(async () => {
        try {
          const p = await cleanPoop(id);
          applyServerState(p);
          setNowMs(Date.now());
        } catch (e) {
          setError(e instanceof Error ? e.message : "Action failed");
        }
      });
    },
    [applyServerState]
  );

  if (base === null && !error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-foreground/60">Waking your pet…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-red-500">{error}</p>
        <button
          type="button"
          onClick={resync}
          className="rounded-lg bg-foreground px-4 py-2 text-sm text-background"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!base || !live) {
    return null;
  }

  const sleeping = live.isSleeping;
  const asOf = simNow;
  const sadHL = petSadStatHighlights(live);
  const inFeedFlow = feedMode !== "idle";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {base.name}
        </h1>
        {sleeping ? (
          <p className="mt-1 text-sm text-violet-400">
            Sleeping — stats tick slower &amp; energy recovers
          </p>
        ) : (
          <p className="mt-1 text-sm text-foreground/50">Awake and needing care</p>
        )}
        <p className="mt-2 text-xs text-foreground/40" suppressHydrationWarning>
          Server-aligned time (1 decimal) · {asOf.toLocaleString()}
        </p>
      </header>

      {feedMode === "choose" ? (
        <FeedChoose
          onPick={(food) => {
            setFeedFood(food);
            setFeedMode("playing");
          }}
          onCancel={() => {
            setFeedFood(null);
            setFeedMode("idle");
          }}
        />
      ) : feedMode === "playing" && feedFood ? (
        <FeedGame
          food={feedFood}
          onDone={(caught) => {
            const food = feedFood;
            setFeedMode("idle");
            setFeedFood(null);
            act(() => feed(food, caught));
          }}
        />
      ) : (
        <PetSprite
          live={live}
          poops={base.yardPoops}
          onPoopClick={onPoopClick}
          poopInteractionDisabled={isPending || sleeping}
        />
      )}

      <section className="flex flex-col gap-4">
        <StatBar
          label="🍕 Satiated"
          value={satiatedFromStoredHunger(live.hunger)}
          accentClass="bg-amber-500"
          stressed={!!sadHL?.satiated}
        />
        <StatBar
          label="🧽 Hygiene"
          value={live.hygiene}
          accentClass="bg-cyan-500"
          stressed={!!sadHL?.hygiene}
        />
        <StatBar
          label="⚽ Play / fun"
          value={live.fun}
          accentClass="bg-pink-500"
          stressed={!!sadHL?.fun}
        />
        <StatBar
          label="⚡ Energy"
          value={live.rest}
          accentClass="bg-indigo-500"
          stressed={!!sadHL?.energy}
        />
      </section>

      <div className="grid grid-cols-3 gap-3">
        <ActionButton
          label="Feed"
          disabled={isPending || sleeping || inFeedFlow}
          onClick={() => setFeedMode("choose")}
        />
        <ActionButton
          label="Play"
          disabled={isPending || sleeping || inFeedFlow}
          onClick={() => act(play)}
        />
        <ActionButton
          label={sleeping ? "Wake" : "Sleep"}
          disabled={isPending || inFeedFlow}
          onClick={() => act(toggleSleep)}
        />
      </div>

      <p className="text-center text-xs text-foreground/40">
        The clock is aligned to the server on each response so in-tab stats match
        a full reload. Stats are stored as floats. Background resync keeps the DB
        in step.
      </p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-black/10 bg-foreground/5 px-3 py-3 text-sm font-medium text-foreground transition hover:bg-foreground/10 disabled:opacity-50 dark:border-white/10"
    >
      {label}
    </button>
  );
}
