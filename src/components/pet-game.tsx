"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  startPetSession,
  syncPetFromServer,
  recordSessionEnd,
  resetAfterSurrender,
  devTriggerSurrender,
  feed,
  cleanPoop,
  play,
  toggleSleep,
} from "@/app/actions/pet";
import type { PetState } from "@/lib/pet-state";
import {
  petDayNumber,
  satiatedFromStoredHunger,
} from "@/lib/pet-display";
import { applyTimeDecay, type DecayedState } from "@/lib/pet-time";
import {
  PetSprite,
  SurrenderedYardNote,
  petSadStatHighlights,
} from "@/components/pet-sprite";
import { FeedChoose, FeedGame } from "@/components/feed-game";
import type { FoodKind } from "@/lib/feed-game";

/** Rates are per *hour*; 1s steps barely move 0.01, so the UI looked “frozen” with `Math.round`. */
const LIVE_TICK_MS = 250;
const SERVER_RESYNC_MS = 90_000;
const IS_DEV = process.env.NODE_ENV === "development";

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
  const [surrenderModalOpen, setSurrenderModalOpen] = useState(false);

  const applyServerState = useCallback((p: PetState) => {
    setBase(p);
    setClockOffsetMs(new Date(p.serverTime).getTime() - Date.now());
  }, []);

  const resync = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const p = await syncPetFromServer();
        applyServerState(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load pet");
      }
    });
  }, [applyServerState]);

  const loadSession = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const p = await startPetSession();
        applyServerState(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load pet");
      }
    });
  }, [applyServerState]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

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
      if (document.visibilityState === "hidden") {
        void recordSessionEnd();
      } else if (document.visibilityState === "visible") {
        resync();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [resync]);

  useEffect(() => {
    function onPageHide() {
      void recordSessionEnd();
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const simNow = useMemo(() => {
    // nowMs advances on an interval to re-run this (Date.now() would otherwise be stale in deps)
    void nowMs;
    return new Date(Date.now() + clockOffsetMs);
  }, [clockOffsetMs, nowMs]);

  const live: DecayedState | null = useMemo(() => {
    if (!base) return null;
    if (base.isSurrendered) {
      const a = petAnchorFromState(base);
      return {
        hunger: a.hunger,
        hygiene: a.hygiene,
        fun: a.fun,
        rest: a.rest,
        isSleeping: a.isSleeping,
        updatedAt: new Date(a.updatedAt),
      };
    }
    return applyTimeDecay(petAnchorFromState(base), simNow, base.rates);
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
          onClick={loadSession}
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
  const sadHL = petSadStatHighlights(live);
  const inFeedFlow = feedMode !== "idle";
  const dayNumber = petDayNumber(base.createdAt, simNow);
  const surrendered = base.isSurrendered;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 p-6">
      <header className="text-center">
        <h1 className="font-title text-4xl tracking-tight text-foreground sm:text-5xl">
          {base.name}
        </h1>
        <p className="mt-1.5 text-sm text-foreground/55">Day {dayNumber}</p>
      </header>

      {surrendered ? (
        <SurrenderedYardNote
          nightYard={live.isSleeping}
          onOpenNote={() => setSurrenderModalOpen(true)}
          disabled={isPending}
        />
      ) : feedMode === "choose" ? (
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

      {!surrendered ? (
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
      ) : null}

      {!surrendered ? (
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
      ) : null}

      {IS_DEV && !surrendered ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const p = await devTriggerSurrender();
                  applyServerState(p);
                  setNowMs(Date.now());
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Dev surrender failed"
                  );
                }
              });
            }}
            className="rounded-lg border border-amber-600/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-100"
          >
            Dev: trigger surrender
          </button>
        </div>
      ) : null}

      {surrenderModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setSurrenderModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="surrender-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto border-2 border-neutral-900 bg-white p-8 text-neutral-900 shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-carattere text-neutral-900">
              <h2
                id="surrender-title"
                className="border-b border-neutral-900 pb-3 text-3xl leading-snug tracking-wide"
              >
                The shelter stepped in
              </h2>
              <p className="mt-5 text-xl leading-relaxed text-neutral-800">
                While you were away, more than three separate UTC calendar days
                went by where satiated, hygiene, fun, or energy dropped below
                50. {base.name} was not getting consistent care, so the shelter
                took them in to keep them safe.
              </p>
              <p className="mt-4 text-lg leading-relaxed text-neutral-700">
                Neglect is evaluated when you open the game again, using UTC
                midnight boundaries so the rule is the same for everyone.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 border-t border-neutral-300 pt-6">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      const p = await resetAfterSurrender();
                      applyServerState(p);
                      setSurrenderModalOpen(false);
                      setNowMs(Date.now());
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Reset failed"
                      );
                    }
                  });
                }}
                disabled={isPending}
                className="border-2 border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Start over with a new dog
              </button>
              <button
                type="button"
                onClick={() => setSurrenderModalOpen(false)}
                className="border-2 border-neutral-900 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
