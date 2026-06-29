import { create } from "zustand";
import type { Employee, GameState } from "../engine/types";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import { derive } from "../engine/derive";
import {
  addEmployee, startTraining, canTrain, fireEmployee, hireCost,
  assignEmployee as assignEmployeeToProduct,
} from "../engine/employees";
import {
  startRun,
  claimRun,
  buyUpgrade,
  buyUpgradeBulk,
  buyOfficePerk,
  buyResearch,
  buyDataOffer,
  lobby,
  maybeHeatEvent,
  maybeWorldEvent,
  applyWorldEventChoice,
  grantDailyBoost,
  type MarketOutcome,
  type WorldEventResult,
} from "../engine/actions";
import {
  canReleaseProduct,
  releaseProduct,
  pushVersion,
  setProductPrice,
  setChannelMix,
  setEnterprise,
  setEnterprisePrice,
  setProductMarketing,
  renameProduct,
  retireProduct,
  maybeChurnFlavor,
  canLaunchDraft,
  launchDraft,
  canStartUpgrade,
  startUpgrade,
  maybeProductEvent,
  canBuyFeature,
  buyFeature,
} from "../engine/products";
import { productMilestones as PRODUCT_MILESTONES, type ProductTypeId } from "../engine/balance/products";
import { achievements as ACHIEVEMENT_DEFS } from "../engine/balance/achievements";
import { buyReputationPerk } from "../engine/reputation";
import { claimContract } from "../engine/contracts";
import { setCharter } from "../engine/charter";
import { buyLegacyPerk } from "../engine/legacyTree";
import { prestige, type ShipMode } from "../engine/prestige";
import { applyOffline, type OfflineSummary } from "../engine/offline";
import { serialize, deserialize } from "../engine/save";
import { isPremium } from "./premium";
import { balance } from "../engine/balance/config";
import { recordTelemetry } from "./telemetry";
import { purchaseSignature } from "../engine/telemetry";
import { currentEra } from "../engine/eras";

const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";

/** Last-seen progress signature + era for telemetry purchase/era-arrival detection.
 *  Module-level (like the event-key counters) — diffed across ticks in advance(). */
let lastSig = -1;
let lastEra = -1;

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
  /** Optional classifier so the UI can pick the right feedback (chime, particle
   *  burst) without sniffing emoji out of the message text. */
  kind?: "achievement" | "milestone" | "ship" | "levelup";
}

export type FiredWorldEvent = WorldEventResult & { key: number };

/** A recruiting candidate (transient; not persisted). */
export interface Candidate {
  name: string;
  roleId: string;
  trait: string | null;
  /** Rare "legendary" recruit — starts already trained with an elite trait. */
  rare?: boolean;
  /** Starting seniority level (1 for normal hires; higher for rares). */
  level?: number;
}

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
  /** Open recruiting candidates (3 to choose from), or null when closed. */
  candidates: Candidate[] | null;
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
  doBuyUpgradeBulk: (id: string, count: number) => void;
  doClaimContract: (id: string) => void;
  doSetCharter: (id: string | null) => void;
  doBuyLegacyPerk: (id: string) => void;
  /** Open recruiting (rolls 3 candidates) / re-roll / close. */
  doRecruit: () => void;
  doRefreshCandidates: () => void;
  doCloseRecruit: () => void;
  /** Hire a specific open candidate (pays the signing bonus). Returns true on success. */
  doHireCandidate: (index: number) => boolean;
  /** Start timed training for an employee. */
  doTrainEmployee: (id: string) => void;
  /** Assign an employee to a product (or null to bench). */
  doAssignEmployeeToProduct: (id: string, productId: string | null) => void;
  /** Let an employee go. */
  doFireEmployee: (id: string) => void;
  /** Buy a one-time office perk (morale / payroll). */
  doBuyOfficePerk: (id: string) => void;
  doBuyReputationPerk: (id: string) => void;
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
  /** Open/close the Enterprise tier for a product. */
  doSetEnterprise: (id: string, on: boolean) => void;
  doSetEnterprisePrice: (id: string, price: number) => void;
  doSetChannelMix: (id: string, channelId: string, weight: number) => void;
  /** Buy a one-time per-product feature (perk) with Money. */
  doBuyFeature: (id: string, featureId: string) => void;
  doRenameProduct: (id: string, name: string) => void;
  doRetireProduct: (id: string) => void;
  doResearch: (id: string) => void;
  doBuyData: (id: string) => MarketOutcome | null;
  doLobby: () => void;
  doPrestige: (mode?: ShipMode) => void;
  /** Claim the once-a-day output boost (temporary modifiers). */
  doClaimDaily: () => void;
  hardReset: () => void;
  /** A portable backup string of the current save (base64). */
  exportSave: () => string;
  /** Validate + persist a backup string (base64 or raw JSON). Returns ok. */
  importSave: (blob: string) => boolean;
}

function now(): number {
  return Date.now();
}

let eventKey = 0;
let noticeKey = 0;
let worldKey = 0;
/** Recent fired world-event ids (transient; drives A2 "hot topics" chaining). Not
 *  persisted — ambient flavor only, so a reload simply starts a fresh streak. */
let recentEventIds: string[] = [];
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

let empKey = 0;
function seedEmpKey(game: GameState): void {
  for (const e of game.employees) {
    const n = Number(e.id.replace(/^emp-/, ""));
    if (Number.isFinite(n) && n > empKey) empKey = n;
  }
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
function randomName(): string {
  return `${pick(balance.staff.firstNames)} ${pick(balance.staff.lastNames)}`;
}
/** Roll a trait id; ~25% of hires are plain (no trait). */
function randomTrait(): string | null {
  return Math.random() < 0.25 ? null : pick(balance.staff.traits).id;
}
function mintEmployee(roleId: string, name: string, trait: string | null, level = 1): Employee {
  empKey += 1;
  return { id: `emp-${empKey}`, name, roleId, level, trait, assignedProductId: null, training: null };
}
function rollCandidate(): Candidate {
  const r = balance.staff.rare;
  if (Math.random() < r.chance) {
    return { name: randomName(), roleId: pick(balance.staff.roles).id, trait: pick(r.traits), rare: true, level: r.level };
  }
  return { name: randomName(), roleId: pick(balance.staff.roles).id, trait: randomTrait() };
}

/** One-time migration: turn legacy role-COUNTS (in the upgrades map) into individual
 *  people so existing saves keep their team. Clears the old count keys. */
function migrateStaffCounts(game: GameState): GameState {
  if (game.employees.length > 0) return game;
  const roleIds = new Set(balance.staff.roles.map((r) => r.id));
  let any = false;
  const employees: Employee[] = [];
  const upgrades = { ...game.upgrades };
  for (const role of balance.staff.roles) {
    const n = upgrades[role.id] ?? 0;
    for (let i = 0; i < n; i++) employees.push(mintEmployee(role.id, randomName(), randomTrait()));
    if (n > 0) { any = true; delete upgrades[role.id]; }
  }
  // Also drop any stray legacy tier keys.
  for (const k of Object.keys(upgrades)) if (roleIds.has(k.replace(/__tier$/, "")) && k.endsWith("__tier")) delete upgrades[k];
  return any ? { ...game, upgrades, employees } : game;
}

export const useGame = create<GameStore>((set, get) => ({
  game: createInitialState(),
  offline: null,
  initialized: false,
  event: null,
  notice: null,
  worldEvent: null,
  claimBurst: 0,
  candidates: null,
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
    game = migrateStaffCounts(game); // legacy role-counts → individual people
    seedProductKey(game);
    seedEmpKey(game);
    set({ game, offline, initialized: true });
    localStorage.setItem(TIME_KEY, String(now()));
    // Telemetry (R8.1): seed the diff baselines from the loaded save so a returning
    // player's first tick doesn't register a phantom purchase/era-arrival, then log
    // the session start. On-device only — see src/state/telemetry.ts.
    lastSig = purchaseSignature(game.upgrades, game.research);
    lastEra = currentEra(game);
    recordTelemetry({ kind: "session", t: now() });
  },

  advance: (elapsedMs) =>
    set((s) => {
      // Snapshot which products are mid-upgrade so we can celebrate completions
      // (the engine finishes them inside tick; we surface the moment to the UI).
      const wasUpgrading = new Map(s.game.products.active.map((p) => [p.id, !!p.upgrade]));
      const wasTraining = new Map(s.game.employees.map((e) => [e.id, !!e.training]));
      let game = tick(s.game, elapsedMs);
      const secs = elapsedMs / 1000;
      const patch: Partial<GameStore> = { game };

      // An employee finishing training is a small win — surface it.
      const trained = game.employees.find((e) => wasTraining.get(e.id) && !e.training);
      if (trained) {
        noticeKey += 1;
        patch.notice = { key: noticeKey, message: `${trained.name} leveled up to L${trained.level}`, tone: "good", kind: "levelup" };
      }

      const finished = game.products.active.find((p) => wasUpgrading.get(p.id) && !p.upgrade);
      if (finished) {
        noticeKey += 1;
        patch.notice = {
          key: noticeKey,
          message: `${finished.name} v${finished.version} shipped — back at the frontier`,
          tone: "good",
          kind: "ship",
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
          patch.notice = { key: noticeKey, message: `${def.label} — ${def.desc} (+$${def.reward.toLocaleString()})`, tone: "good", kind: "milestone" };
        }
      }

      // Newly-unlocked achievements are a collection win — surface them (unless a
      // milestone already claimed this tick's notice slot). Several can land in one
      // tick (e.g. a big offline catch-up); with only one notice slot, show the
      // first by name and coalesce the rest into the count so none are silently lost.
      if (!patch.notice) {
        const had = new Set(s.game.achievements);
        const newAch = game.achievements.filter((id) => !had.has(id));
        if (newAch.length === 1) {
          const def = ACHIEVEMENT_DEFS.find((a) => a.id === newAch[0]);
          if (def) {
            noticeKey += 1;
            patch.notice = { key: noticeKey, message: `Achievement: ${def.label} — ${def.desc}`, tone: "good", kind: "achievement" };
          }
        } else if (newAch.length > 1) {
          const first = ACHIEVEMENT_DEFS.find((a) => a.id === newAch[0]);
          noticeKey += 1;
          patch.notice = {
            key: noticeKey,
            message: `${newAch.length} achievements unlocked${first ? ` — incl. ${first.label}` : ""}`,
            tone: "good",
            kind: "achievement",
          };
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
        const wr = maybeWorldEvent(game, secs, Math.random(), Math.random(), recentEventIds);
        if (wr) {
          game = wr.state;
          worldKey += 1;
          patch.game = game;
          patch.worldEvent = { key: worldKey, ...wr.event };
          // Remember the last few fired ids so related events cluster (A2).
          recentEventIds = [wr.event.id, ...recentEventIds].slice(0, balance.worldEvents.chainWindow);
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

      // Telemetry (R8.1): detect a progress purchase or era arrival by diffing across
      // ticks — one hook instead of touching every buy action. Only fires on the rare
      // transition (signature/era increase), never the 10Hz trickle. On-device only.
      const sig = purchaseSignature(game.upgrades, game.research);
      if (lastSig >= 0 && sig > lastSig) {
        recordTelemetry({ kind: "purchase", t: now(), gen: game.prestige.ships, playtimeSec: game.stats.playtimeSec });
      }
      lastSig = sig;
      const era = currentEra(game);
      if (lastEra >= 0 && era > lastEra) {
        recordTelemetry({ kind: "era", t: now(), era, playtimeSec: game.stats.playtimeSec });
      }
      lastEra = era;

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
  doBuyUpgradeBulk: (id, count) => set((s) => ({ game: buyUpgradeBulk(s.game, id, count) })),
  doClaimContract: (id) => set((s) => ({ game: claimContract(s.game, id) })),
  doSetCharter: (id) => set((s) => ({ game: setCharter(s.game, id) })),
  doBuyLegacyPerk: (id) => set((s) => ({ game: buyLegacyPerk(s.game, id) })),
  doRecruit: () => set({ candidates: [rollCandidate(), rollCandidate(), rollCandidate()] }),
  doRefreshCandidates: () => set({ candidates: [rollCandidate(), rollCandidate(), rollCandidate()] }),
  doCloseRecruit: () => set({ candidates: null }),
  doHireCandidate: (index) => {
    const g = get().game;
    const c = get().candidates?.[index];
    if (!c) return false;
    const cost = hireCost(c.roleId) * derive(g).hireDiscount; // Recruiters cut signing bonuses
    if (g.resources.money.lt(cost)) return false;
    set((s) => {
      const paid = { ...s.game, resources: { ...s.game.resources, money: s.game.resources.money.sub(cost) } };
      const game = addEmployee(paid, mintEmployee(c.roleId, c.name, c.trait, c.level ?? 1));
      const candidates = (s.candidates ?? []).filter((_, i) => i !== index);
      return { game, candidates: candidates.length ? candidates : null };
    });
    return true;
  },
  doTrainEmployee: (id) => set((s) => (canTrain(s.game, id) ? { game: startTraining(s.game, id) } : {})),
  doAssignEmployeeToProduct: (id, productId) => set((s) => ({ game: assignEmployeeToProduct(s.game, id, productId) })),
  doFireEmployee: (id) => set((s) => ({ game: fireEmployee(s.game, id) })),
  doBuyOfficePerk: (id) => set((s) => ({ game: buyOfficePerk(s.game, id) })),
  doBuyReputationPerk: (id) => set((s) => ({ game: buyReputationPerk(s.game, id) })),
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
  doSetEnterprise: (id, on) => set((s) => ({ game: setEnterprise(s.game, id, on) })),
  doSetEnterprisePrice: (id, v) => set((s) => ({ game: setEnterprisePrice(s.game, id, v) })),
  doSetChannelMix: (id, channelId, w) => set((s) => ({ game: setChannelMix(s.game, id, channelId, w) })),
  doBuyFeature: (id, featureId) =>
    set((s) => (canBuyFeature(s.game, id, featureId) ? { game: buyFeature(s.game, id, featureId) } : {})),
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
  doLobby: () => set((s) => ({ game: lobby(s.game) })),
  doPrestige: (mode: ShipMode = "deploy") =>
    set((s) => {
      // Capture the run length BEFORE the reset: playtimeSec survives prestige (it's a
      // lifetime stat), so the gen's run time is derived from the cumulative value.
      const game = prestige(s.game, mode);
      recordTelemetry({
        kind: "prestige",
        t: now(),
        gen: game.prestige.ships,
        playtimeSec: game.stats.playtimeSec,
        weights: game.prestige.legacyWeights.toNumber(),
        era: currentEra(s.game), // the era reached in the run just shipped
      });
      // The fresh run starts with no upgrades/research and at era 0 — reset baselines
      // so the reset itself isn't mis-read as a purchase/era change next tick.
      lastSig = purchaseSignature(game.upgrades, game.research);
      lastEra = currentEra(game);
      return { game };
    }),
  doClaimDaily: () => set((s) => ({ game: grantDailyBoost(s.game) })),

  hardReset: () => {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(TIME_KEY);
    // Clear transient UI state too, or a stale world-event card / claim burst
    // could survive into the fresh run.
    set({ game: createInitialState(), offline: null, event: null, notice: null, worldEvent: null, claimBurst: 0, candidates: null });
  },

  // ---- Save backup (local-only; the player owns their progress) ----
  exportSave: () => {
    const json = serialize(get().game);
    try { return btoa(unescape(encodeURIComponent(json))); } catch { return json; }
  },
  importSave: (blob: string) => {
    const raw = blob.trim();
    if (!raw) return false;
    // Accept either a base64 backup (preferred) or a raw JSON save.
    const candidates: string[] = [];
    try { candidates.push(decodeURIComponent(escape(atob(raw)))); } catch { /* not base64 */ }
    candidates.push(raw);
    for (const json of candidates) {
      try {
        let game = deserialize(json); // throws on bad shape; migrates + sanitizes
        // Mirror init()'s post-load normalization so an imported save matches the
        // runtime shape (legacy role-counts → people; ID counters seeded so new
        // products/hires don't collide with existing prod-N / emp-N ids).
        game = migrateStaffCounts(game);
        seedProductKey(game);
        seedEmpKey(game);
        set({ game, offline: null, event: null, notice: null, worldEvent: null, claimBurst: 0, candidates: null });
        localStorage.setItem(SAVE_KEY, serialize(game));
        localStorage.setItem(TIME_KEY, String(now()));
        return true;
      } catch { /* try the next candidate */ }
    }
    return false;
  },
}));

// Debug/test handle (used by the screenshot harness; harmless in prod).
if (typeof window !== "undefined") {
  (window as unknown as { __SINGULARITY_STORE__?: typeof useGame }).__SINGULARITY_STORE__ = useGame;
}
