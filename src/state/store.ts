import { create } from "zustand";
import type { GameState } from "../engine/types";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import {
  startRun,
  claimRun,
  buyUpgrade,
  buyResearch,
  buyDataOffer,
  maybeHeatEvent,
  type MarketOutcome,
} from "../engine/actions";
import { prestige } from "../engine/prestige";
import { applyOffline, type OfflineSummary } from "../engine/offline";
import { serialize, deserialize } from "../engine/save";

const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";

/**
 * The single bridge between the pure engine and React (CLAUDE.md: keep game
 * state in the store, derive UI values with selectors). The wall clock lives
 * HERE, not in the engine — we read Date.now() and pass elapsed time into tick.
 */
/** A fired regulatory event, surfaced to the UI (key bumps so repeats re-toast). */
export interface FiredEvent {
  key: number;
  message: string;
  tone: "bad" | "good";
}

interface GameStore {
  game: GameState;
  offline: OfflineSummary | null;
  /** True once the save has been loaded/hydrated (guards first-load toasts). */
  initialized: boolean;
  /** Most recent regulatory event (heat-driven), or null. */
  event: FiredEvent | null;
  // lifecycle
  init: () => void;
  advance: (elapsedMs: number) => void;
  save: () => void;
  dismissOffline: () => void;
  // player actions
  doStartRun: () => void;
  doClaim: () => void;
  doBuyUpgrade: (id: string) => void;
  doResearch: (id: string) => void;
  doBuyData: (id: string) => MarketOutcome | null;
  doPrestige: () => void;
  hardReset: () => void;
}

function now(): number {
  return Date.now();
}

let eventKey = 0;

export const useGame = create<GameStore>((set, get) => ({
  game: createInitialState(),
  offline: null,
  initialized: false,
  event: null,

  init: () => {
    let game = createInitialState();
    let offline: OfflineSummary | null = null;
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        game = deserialize(saved);
        const last = Number(localStorage.getItem(TIME_KEY) ?? "0");
        if (last > 0) {
          const elapsed = now() - last;
          const result = applyOffline(game, elapsed);
          game = result.state;
          // Only surface the WIWA screen if something meaningful accrued.
          if (result.summary.appliedMs > 1000) offline = result.summary;
        }
      }
    } catch (err) {
      console.warn("Save load failed, starting fresh:", err);
      game = createInitialState();
    }
    set({ game, offline, initialized: true });
    localStorage.setItem(TIME_KEY, String(now()));
  },

  advance: (elapsedMs) =>
    set((s) => {
      const game = tick(s.game, elapsedMs);
      // Only roll for events when there's heat to drive them — keeps the hot
      // path (the common cold state) free of per-frame RNG and object churn.
      if (game.heat > 0) {
        const res = maybeHeatEvent(game, elapsedMs / 1000, Math.random(), Math.random());
        if (res) {
          eventKey += 1;
          return { game: res.state, event: { key: eventKey, message: res.event.message, tone: res.event.tone } };
        }
      }
      return { game };
    }),

  save: () => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(get().game));
      localStorage.setItem(TIME_KEY, String(now()));
    } catch (err) {
      console.warn("Save failed:", err);
    }
  },

  dismissOffline: () => set({ offline: null }),

  doStartRun: () => set((s) => ({ game: startRun(s.game) })),
  doClaim: () => set((s) => ({ game: claimRun(s.game) })),
  doBuyUpgrade: (id) => set((s) => ({ game: buyUpgrade(s.game, id) })),
  doResearch: (id) => set((s) => ({ game: buyResearch(s.game, id) })),
  // The wall clock isn't the only nondeterminism we keep out of the engine —
  // the risk roll lives here too and is passed in, mirroring how we pass time.
  doBuyData: (id) => {
    const { state: next, outcome } = buyDataOffer(get().game, id, Math.random());
    if (outcome) set({ game: next });
    return outcome;
  },
  doPrestige: () => set((s) => ({ game: prestige(s.game) })),

  hardReset: () => {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(TIME_KEY);
    set({ game: createInitialState(), offline: null });
  },
}));
