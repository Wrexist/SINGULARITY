import { create } from "zustand";
import type { GameState } from "../engine/types";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import {
  startRun,
  claimRun,
  buyUpgrade,
  hireStaff,
  buyResearch,
  buyDataOffer,
  maybeHeatEvent,
  maybeWorldEvent,
  applyWorldEventChoice,
  type MarketOutcome,
  type WorldEventResult,
} from "../engine/actions";
import {
  canReleaseProduct,
  releaseProduct,
  pushVersion,
  setProductPrice,
  setProductMarketing,
  renameProduct,
  retireProduct,
  maybeChurnFlavor,
  canLaunchDraft,
  launchDraft,
  canStartUpgrade,
  startUpgrade,
  maybeProductEvent,
} from "../engine/products";
import { productMilestones as PRODUCT_MILESTONES, type ProductTypeId } from "../engine/balance/products";
import { prestige } from "../engine/prestige";
import { applyOffline, type OfflineSummary } from "../engine/offline";
import { serialize, deserialize } from "../engine/save";
import { isPremium } from "./premium";
import { balance } from "../engine/balance/config";

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
  tone: "neutral" | "bad" | "good";
}

export type FiredWorldEvent = WorldEventResult & { key: number };

interface GameStore {
  game: GameState;
  offline: OfflineSummary | null;
  /** True once the save has been loaded/hydrated (guards first-load toasts). */
  initialized: boolean;
  /** Most recent regulatory event (heat-driven), or null. */
  event: FiredEvent | null;
  /** Most recent lightweight flavor toast (e.g. churn-reason quips), or null. */
  notice: FiredEvent | null;
  /** Pending ambient world event (shown as a card), or null. */
  worldEvent: FiredWorldEvent | null;
  /** Bumps each time a payout is claimed (drives the hall's mote burst). */
  claimBurst: number;
  // lifecycle
  init: () => void;
  dismissWorldEvent: () => void;
  chooseWorldEvent: (choiceIndex: number) => void;
  advance: (elapsedMs: number) => void;
  save: () => void;
  dismissOffline: () => void;
  // player actions
  doStartRun: () => void;
  doClaim: () => void;
  doBuyUpgrade: (id: string) => void;
  doHireStaff: (id: string) => void;
  setComputeFocus: (v: number) => void;
  /** Returns true if the release succeeded (so the UI only celebrates on a real ship). */
  doReleaseProduct: (type: ProductTypeId, name: string) => boolean;
  /** Commercialise a shipped draft model. Returns true on a real launch. */
  doLaunchDraft: (draftId: string, type: ProductTypeId, name: string) => boolean;
  doPushVersion: (id: string) => void;
  /** Begin a timed version upgrade (pay upfront, research over time). */
  doStartUpgrade: (id: string) => void;
  doSetProductPrice: (id: string, priceMult: number) => void;
  doSetProductMarketing: (id: string, perSec: number) => void;
  doRenameProduct: (id: string, name: string) => void;
  doRetireProduct: (id: string) => void;
  doResearch: (id: string) => void;
  doBuyData: (id: string) => MarketOutcome | null;
  doPrestige: () => void;
  hardReset: () => void;
}

function now(): number {
  return Date.now();
}

let eventKey = 0;
let noticeKey = 0;
let worldKey = 0;
let claimKey = 0;
let productKey = 0;

/** Advance the product-id counter past every persisted `prod-N` id so the next
 *  release can't collide with a saved product (ids are React keys + find() keys). */
function seedProductKey(game: GameState): void {
  for (const p of game.products.active) {
    const n = Number(p.id.replace(/^prod-/, ""));
    if (Number.isFinite(n) && n > productKey) productKey = n;
  }
}

export const useGame = create<GameStore>((set, get) => ({
  game: createInitialState(),
  offline: null,
  initialized: false,
  event: null,
  notice: null,
  worldEvent: null,
  claimBurst: 0,
  dismissWorldEvent: () => set({ worldEvent: null }),
  chooseWorldEvent: (choiceIndex) =>
    set((s) => {
      if (!s.worldEvent) return {};
      const { state } = applyWorldEventChoice(s.game, s.worldEvent.id, choiceIndex);
      return { game: state, worldEvent: null };
    }),

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
          // Premium grants a longer offline cap (QoL perk, not power).
          const capHours = isPremium() ? balance.offline.premiumMaxHours : balance.offline.maxHours;
          const result = applyOffline(game, elapsed, capHours);
          game = result.state;
          // Only surface the WIWA screen if something meaningful accrued.
          if (result.summary.appliedMs > 1000) offline = result.summary;
        }
      }
    } catch (err) {
      console.warn("Save load failed, starting fresh:", err);
      game = createInitialState();
    }
    seedProductKey(game);
    set({ game, offline, initialized: true });
    localStorage.setItem(TIME_KEY, String(now()));
  },

  advance: (elapsedMs) =>
    set((s) => {
      // Snapshot which products are mid-upgrade so we can celebrate completions
      // (the engine finishes them inside tick; we surface the moment to the UI).
      const wasUpgrading = new Map(s.game.products.active.map((p) => [p.id, !!p.upgrade]));
      let game = tick(s.game, elapsedMs);
      const secs = elapsedMs / 1000;
      const patch: Partial<GameStore> = { game };

      const finished = game.products.active.find((p) => wasUpgrading.get(p.id) && !p.upgrade);
      if (finished) {
        noticeKey += 1;
        patch.notice = {
          key: noticeKey,
          message: `🚀 ${finished.name} v${finished.version} shipped — back at the frontier`,
          tone: "good",
        };
      }

      // A newly-reached product milestone is a headline win — surface it (and its
      // reward) over an upgrade-ship if both land the same tick.
      const before = new Set(s.game.products.milestones);
      const newMs = game.products.milestones.find((id) => !before.has(id));
      if (newMs) {
        const def = PRODUCT_MILESTONES.find((m) => m.id === newMs);
        if (def) {
          noticeKey += 1;
          patch.notice = { key: noticeKey, message: `🏆 ${def.label} — ${def.desc} (+$${def.reward.toLocaleString()})`, tone: "good" };
        }
      }

      // Heat-driven regulatory event (only when there's heat to drive it).
      if (game.heat > 0) {
        const res = maybeHeatEvent(game, secs, Math.random(), Math.random());
        if (res) {
          game = res.state;
          eventKey += 1;
          patch.game = game;
          patch.event = { key: eventKey, message: res.event.message, tone: res.event.tone };
        }
      }

      // Ambient satirical world event — at most one pending card at a time.
      if (!s.worldEvent) {
        const wr = maybeWorldEvent(game, secs, Math.random(), Math.random());
        if (wr) {
          game = wr.state;
          worldKey += 1;
          patch.game = game;
          patch.worldEvent = { key: worldKey, ...wr.event };
        }
      }

      // Per-product ops event (outage, viral spike, breach…) — a reactive moment
      // that nudges a product's users/subs. More significant than a churn quip, so
      // it gets the toast slot first (but yields to a milestone/upgrade-ship).
      if (!patch.event && !patch.notice && game.products.active.length > 0) {
        const pe = maybeProductEvent(game, secs, Math.random(), Math.random(), Math.random());
        if (pe) {
          game = pe.state;
          patch.game = game;
          noticeKey += 1;
          patch.notice = { key: noticeKey, message: pe.message, tone: pe.tone };
        }
      }

      // Churn-reason flavor quip — the satire surface for "update or bleed". Only
      // when nothing heavier (regulatory event, upgrade-ship, ops event) already
      // claimed this tick's toast slot.
      if (!patch.event && !patch.notice) {
        const flavor = maybeChurnFlavor(
          game.products, secs, Math.random(), Math.random(), Math.random(),
        );
        if (flavor) {
          noticeKey += 1;
          patch.notice = { key: noticeKey, message: flavor.message, tone: "neutral" };
        }
      }

      return patch;
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
  doClaim: () =>
    set((s) => {
      if (!s.game.run.readyToClaim) return {};
      claimKey += 1;
      return { game: claimRun(s.game), claimBurst: claimKey };
    }),
  doBuyUpgrade: (id) => set((s) => ({ game: buyUpgrade(s.game, id) })),
  doHireStaff: (id) => set((s) => ({ game: hireStaff(s.game, id) })),
  setComputeFocus: (v) =>
    set((s) => ({ game: { ...s.game, computeFocus: Math.max(0, Math.min(1, v)) } })),
  // The store mints the product id (nondeterminism stays out of the engine).
  // Guard first so a stale/double tap can't burn an id or fake a celebration.
  doReleaseProduct: (type, name) => {
    if (!canReleaseProduct(get().game, type)) return false;
    productKey += 1;
    set((s) => ({ game: releaseProduct(s.game, { type, name, id: `prod-${productKey}` }) }));
    return true;
  },
  doLaunchDraft: (draftId, type, name) => {
    if (!canLaunchDraft(get().game, draftId, type)) return false;
    productKey += 1;
    set((s) => ({ game: launchDraft(s.game, { draftId, type, name, id: `prod-${productKey}` }) }));
    return true;
  },
  doPushVersion: (id) => set((s) => ({ game: pushVersion(s.game, id) })),
  doStartUpgrade: (id) =>
    set((s) => (canStartUpgrade(s.game, id) ? { game: startUpgrade(s.game, id) } : {})),
  doSetProductPrice: (id, v) => set((s) => ({ game: setProductPrice(s.game, id, v) })),
  doSetProductMarketing: (id, v) => set((s) => ({ game: setProductMarketing(s.game, id, v) })),
  doRenameProduct: (id, name) => set((s) => ({ game: renameProduct(s.game, id, name) })),
  doRetireProduct: (id) => set((s) => ({ game: retireProduct(s.game, id) })),
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
    // Clear transient UI state too, or a stale world-event card / claim burst
    // could survive into the fresh run.
    set({ game: createInitialState(), offline: null, event: null, notice: null, worldEvent: null, claimBurst: 0 });
  },
}));

// Debug/test handle (used by the screenshot harness; harmless in prod).
if (typeof window !== "undefined") {
  (window as unknown as { __SINGULARITY_STORE__?: typeof useGame }).__SINGULARITY_STORE__ = useGame;
}
