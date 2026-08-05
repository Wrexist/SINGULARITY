import { create } from "zustand";
import type { Employee, GameState } from "../engine/types";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import { derive } from "../engine/derive";
import {
  addEmployee, startTraining, canTrain, fireEmployee, hireCost,
  assignEmployee as assignEmployeeToProduct, levelUpNote,
} from "../engine/employees";
import { versionShipNote } from "../engine/notices";
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
  workProblem,
  type MarketOutcome,
  type WorldEventResult,
} from "../engine/actions";
import { buyComponent, equipComponent, fuseComponents } from "../engine/components";
import type { SlotClass } from "../engine/balance/components";
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
  maxActiveProducts,
} from "../engine/products";
import { productMilestones as PRODUCT_MILESTONES, type ProductTypeId } from "../engine/balance/products";
import { achievements as ACHIEVEMENT_DEFS } from "../engine/balance/achievements";
import { buyReputationPerk, buyEndowment, pickEndowmentDirective } from "../engine/reputation";
import { startTrial, abandonTrial } from "../engine/trials";
import { setFlagship } from "../engine/flagship";
import { buyParadigm } from "../engine/paradigms";
import { claimDoctrine } from "../engine/doctrine";
import { buyInstitute, endowFellowship } from "../engine/institute";
import { fundChallenge, chooseFork, fundMegaproject } from "../engine/challenges";
import { claimObjective } from "../engine/objectives";
import { applyAutomation, automationUnlockedAny, automationEnabled, toggleAutomation } from "../engine/automation";
import { automation as AUTOMATION } from "../engine/balance/automation";
import { claimContract, rollSponsor, claimSponsor } from "../engine/contracts";
import { buyPreprint } from "../engine/preprints";
import { setCharter, lockCharter } from "../engine/charter";
import { counterRival } from "../engine/market";
import { negotiationDue, negotiationOffer, applyNegotiationChoice, NEGOTIATION_ID } from "../engine/negotiation";
import { buyLegacyPerk } from "../engine/legacyTree";
import { prestige, type ShipMode } from "../engine/prestige";
import { applyOffline, type OfflineSummary } from "../engine/offline";
import { serialize, deserialize } from "../engine/save";
import { isPremium } from "./premium";
import { balance } from "../engine/balance/config";
import { recordTelemetry } from "./telemetry";
import { purchaseSignature } from "../engine/telemetry";
import { currentEra } from "../engine/eras";
import { codexBalance, codexUnlocked } from "../engine/codex";
import type { Big } from "../engine/math/Big";

const SAVE_KEY = "singularity.save.v1";
const TIME_KEY = "singularity.lastSeen.v1";
// Where a whole-file-unparseable save is stashed before we fall back to a fresh
// state (see init). deserialize() already clamps/filters a *structured* save
// rather than wiping it; this key covers the one remaining wipe path — a blob so
// corrupt it won't even parse — so the raw bytes survive for later recovery
// instead of being silently overwritten by the next autosave.
const CORRUPT_KEY = "singularity.save.corrupt.v1";

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
  /** Rig Bay: buy one component copy into the inventory. */
  doBuyComponent: (id: string) => void;
  /** Rig Bay: equip an owned copy into a rack tier's slot (null clears). */
  doEquipComponent: (tier: number, slot: SlotClass, id: string | null) => void;
  /** Rig Bay C3: fuse copies of a part into the next rung up its ladder. */
  doFuseComponents: (id: string) => void;
  doClaimContract: (id: string) => void;
  /** IDEAS #5 — tap a manifested incident in the hall for its one bounded time-shave. */
  doWorkProblem: (id: string) => void;
  /** IDEAS #9 — roll/refresh today's sponsor contract (UI passes the local day number). */
  doRollSponsor: (dayKey: number) => void;
  doClaimSponsor: () => void;
  /** IDEAS #10 — publish a frontier preprint (post-tree repeatable research). */
  doBuyPreprint: () => void;
  doSetCharter: (id: string | null) => void;
  /** Lock the current charter pick for this run (owner UX fix). */
  doLockCharter: () => void;
  doCounterRival: (name: string) => boolean;
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
  /** Buy one endgame Reputation Endowment level (post-tree infinite sink). */
  doBuyEndowment: () => void;
  doPickDirective: (id: string) => void;
  doStartTrial: (id: string) => void;
  doAbandonTrial: () => void;
  doSetFlagship: (id: string | null) => void;
  doBuyParadigm: (id: string) => void;
  doClaimDoctrine: (id: string) => void;
  doBuyInstitute: (id: string) => void;
  doEndowFellowship: () => void;
  /** Pour affordable resources into a Grand Challenge. Returns true if THIS call finished it. */
  doFundChallenge: (id: string) => boolean;
  doChooseFork: (id: string, forkId: string) => void;
  doFundMegaproject: () => boolean;
  /** Claim a met Lab Objective, steering its boost to the chosen lane (default = headline). */
  doClaimObjective: (id: string, target?: "computeMult" | "dataMult" | "moneyMult") => void;
  /** Flip an Automation autopilot on/off (no-op if still locked). */
  doToggleAutomation: (id: string) => void;
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
/** Same-tick notices beyond the single slot wait here and drain one per tick —
 *  a level-up landing the same tick as a version-ship is delayed, never lost. */
let pendingNotices: FiredEvent[] = [];
/** Minimum gap between surfaced queue-notices. The queue used to drain one per 10Hz
 *  tick (100ms), so a big catch-up tick that earned 5–6 completions flushed them in
 *  ~600ms — faster than a toast can be read. This staggers them into a calm, readable
 *  cadence instead. Sits at 0 when idle (a lone notice fires immediately). */
const NOTICE_GATE_MS = 900;
let noticeGateMs = 0;

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
      // The regulator negotiation has its own (multi-lane) effect application.
      if (s.worldEvent.id === NEGOTIATION_ID) {
        return { game: applyNegotiationChoice(s.game, choiceIndex), worldEvent: null };
      }
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
      // A save so corrupt it throws is the ONLY true wipe path (deserialize
      // sanitizes anything that parses). Preserve the raw bytes under a sibling
      // key before the next autosave overwrites SAVE_KEY, so the run is
      // recoverable. Keep the FIRST corrupt blob (don't clobber it on reload).
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw && !localStorage.getItem(CORRUPT_KEY)) localStorage.setItem(CORRUPT_KEY, raw);
      } catch { /* storage unavailable/full — nothing more we can do */ }
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

      // Collect every notice this tick earned (priority order: milestone >
      // version-ship > level-up > achievements), emit the first, queue the rest —
      // one slot per tick, but nothing is silently dropped anymore.
      const earned: FiredEvent[] = [];
      const pushNotice = (message: string, kind: NonNullable<FiredEvent["kind"]>) => {
        noticeKey += 1;
        earned.push({ key: noticeKey, message, tone: "good", kind });
      };

      const before = new Set(s.game.products.milestones);
      const newMs = game.products.milestones.find((id) => !before.has(id));
      if (newMs) {
        const def = PRODUCT_MILESTONES.find((m) => m.id === newMs);
        if (def) pushNotice(`${def.label} — ${def.desc} (+$${def.reward.toLocaleString()})`, "milestone");
      }

      // Several can finish in one tick (offline catch-up) — name one, count the rest.
      const finished = game.products.active.filter((p) => wasUpgrading.get(p.id) && !p.upgrade);
      if (finished.length === 1) pushNotice(versionShipNote(finished[0]!.name, finished[0]!.version), "ship");
      else if (finished.length > 1) pushNotice(`${finished.length} products shipped new versions — back at the frontier`, "ship");

      const trained = game.employees.filter((e) => wasTraining.get(e.id) && !e.training);
      if (trained.length === 1) pushNotice(levelUpNote(trained[0]!), "levelup");
      else if (trained.length > 1) pushNotice(`${trained.length} specialists leveled up`, "levelup");

      // Achievements: several can land in one tick (offline catch-up) — show the
      // first by name and coalesce the rest into the count.
      {
        const had = new Set(s.game.achievements);
        const newAch = game.achievements.filter((id) => !had.has(id));
        if (newAch.length === 1) {
          const def = ACHIEVEMENT_DEFS.find((a) => a.id === newAch[0]);
          if (def) pushNotice(`Achievement: ${def.label} — ${def.desc}`, "achievement");
        } else if (newAch.length > 1) {
          const first = ACHIEVEMENT_DEFS.find((a) => a.id === newAch[0]);
          pushNotice(`${newAch.length} achievements unlocked${first ? ` — incl. ${first.label}` : ""}`, "achievement");
        }
      }

      // Codex / Field Notes: unlocking a lore entry used to be SILENT (the whole
      // satire wedge appeared only if you opened the panel). Surface it as a gentle
      // "new field note" toast — a good-tone notice with no special kind, so it gets
      // the soft discovery chime, not the achievement fanfare. One per tick (coalesced).
      {
        const newCodex = codexBalance.entries.filter((e) => !codexUnlocked(s.game, e) && codexUnlocked(game, e));
        if (newCodex.length >= 1) {
          noticeKey += 1;
          const msg = newCodex.length === 1
            ? `New Field Note — “${newCodex[0]!.title}”`
            : `${newCodex.length} new Field Notes — incl. “${newCodex[0]!.title}”`;
          earned.push({ key: noticeKey, message: msg, tone: "good" });
        }
      }

      // Heat-driven regulatory event FIRST (only when there's heat to drive it). A fine is
      // urgent, so it takes this tick's single feedback slot — a completion notice then
      // waits one tick in the queue rather than firing a second toast + a clashing chord
      // over the top of the "uh-oh".
      if (game.heat > 0) {
        const res = maybeHeatEvent(game, secs, Math.random(), Math.random());
        if (res) {
          game = res.state;
          eventKey += 1;
          patch.game = game;
          patch.event = { key: eventKey, message: res.event.message, tone: res.event.tone };
        }
      }

      // One queue, oldest first — a notice earned this tick never jumps ahead of
      // one still waiting from a previous tick. Cap the backlog so an extreme
      // offline catch-up can't toast for minutes.
      if (earned.length > 0) pendingNotices = [...pendingNotices, ...earned].slice(0, 6);
      // Drain at most one per NOTICE_GATE_MS of real time (not one per 100ms tick), so a
      // same-tick burst / catch-up backlog surfaces as readable, staggered toasts; and hold
      // while a heat event claimed this tick. The gate idles at 0, so a single notice after
      // a quiet stretch still fires at once.
      if (noticeGateMs > 0) noticeGateMs = Math.max(0, noticeGateMs - elapsedMs);
      if (!patch.event && pendingNotices.length > 0 && noticeGateMs === 0) {
        patch.notice = pendingNotices[0]!;
        pendingNotices = pendingNotices.slice(1);
        noticeGateMs = NOTICE_GATE_MS;
      }

      // Regulator negotiation (IMPROVEMENTS #9): deterministic, outranks the
      // ambient pool. Fires only past the suspicion line with no truce pending —
      // a clean lab (and the balance sim) never sees it.
      if (!s.worldEvent && negotiationDue(game)) {
        worldKey += 1;
        patch.worldEvent = { key: worldKey, ...negotiationOffer(game) };
      }

      // Ambient satirical world event — at most one pending card at a time.
      if (!s.worldEvent && !patch.worldEvent) {
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

      // Automation (IDEAS #C): run the toggled-on autopilots on the post-tick state. Silent
      // by design — the point is to remove chores, not add feedback. Off by default, gated by
      // ship count, and never enabled by the sim, so the tuned curve is untouched.
      if (automationUnlockedAny(game)) {
        game = applyAutomation(game);
        // Auto-launch needs id minting, so it runs here rather than in the pure engine: a
        // freshly-shipped draft is commercialised into any free slot (as a General product).
        if (automationEnabled(game, "auto_launch")) {
          let guard = 0;
          while (game.products.drafts.length > 0 && game.products.active.length < maxActiveProducts(game) && guard++ < 8) {
            const draft = game.products.drafts[0]!;
            const type: ProductTypeId = "general";
            if (!canLaunchDraft(game, draft.id, type)) break;
            productKey += 1;
            const name = AUTOMATION.names[productKey % AUTOMATION.names.length]!;
            game = launchDraft(game, { draftId: draft.id, type, name, id: `prod-${productKey}` });
          }
        }
        patch.game = game;
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
  doBuyComponent: (id) => set((s) => ({ game: buyComponent(s.game, id) })),
  doEquipComponent: (tier, slot, id) => set((s) => ({ game: equipComponent(s.game, tier, slot, id) })),
  doFuseComponents: (id) => set((s) => ({ game: fuseComponents(s.game, id) })),
  doClaimContract: (id) => set((s) => ({ game: claimContract(s.game, id) })),
  doWorkProblem: (id) => set((s) => ({ game: workProblem(s.game, id) })),
  doRollSponsor: (dayKey) => set((s) => {
    const next = rollSponsor(s.game, dayKey);
    return next === s.game ? {} : { game: next };
  }),
  doClaimSponsor: () => set((s) => ({ game: claimSponsor(s.game) })),
  doBuyPreprint: () => set((s) => ({ game: buyPreprint(s.game) })),
  doSetCharter: (id) => set((s) => ({ game: setCharter(s.game, id) })),
  doLockCharter: () => set((s) => ({ game: lockCharter(s.game) })),
  // Returns whether the blitz actually landed (same-ref no-op when the guard
  // fails between render and tap), so the UI only celebrates real strikes.
  doCounterRival: (name: string) => {
    const before = get().game;
    const next = counterRival(before, name);
    if (next === before) return false;
    set({ game: next });
    return true;
  },
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
  doBuyEndowment: () => set((s) => ({ game: buyEndowment(s.game) })),
  doPickDirective: (id) => set((s) => ({ game: pickEndowmentDirective(s.game, id) })),
  doStartTrial: (id) => set((s) => ({ game: startTrial(s.game, id) })),
  doAbandonTrial: () => set((s) => ({ game: abandonTrial(s.game) })),
  doSetFlagship: (id) => set((s) => ({ game: setFlagship(s.game, id) })),
  doBuyParadigm: (id) => set((s) => ({ game: buyParadigm(s.game, id) })),
  doClaimDoctrine: (id) => set((s) => ({ game: claimDoctrine(s.game, id) })),
  doBuyInstitute: (id) => set((s) => ({ game: buyInstitute(s.game, id) })),
  doEndowFellowship: () => set((s) => ({ game: endowFellowship(s.game) })),
  doFundChallenge: (id) => {
    let justCompleted = false;
    set((s) => {
      const res = fundChallenge(s.game, id);
      justCompleted = res.justCompleted;
      return res.state === s.game ? {} : { game: res.state };
    });
    return justCompleted;
  },
  doChooseFork: (id, forkId) => set((s) => ({ game: chooseFork(s.game, id, forkId) })),
  doFundMegaproject: () => {
    let justCompleted = false;
    set((s) => {
      const res = fundMegaproject(s.game);
      justCompleted = res.justCompleted;
      return res.state === s.game ? {} : { game: res.state };
    });
    return justCompleted;
  },
  doClaimObjective: (id, target) => set((s) => ({ game: claimObjective(s.game, id, target) })),
  doToggleAutomation: (id) => set((s) => ({ game: toggleAutomation(s.game, id) })),
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
      // A queued notice about the old run ("X shipped", "Y leveled up") would
      // read as noise over the fresh lab — drop the backlog with the run.
      pendingNotices = [];
      const game = prestige(s.game, mode);
      // Guard the Big→number: at deep-endgame scale legacyWeights can exceed ~1e308,
      // where toNumber() is Infinity and would submit garbage (JSON → null) telemetry.
      const weightsNum = game.prestige.legacyWeights.toNumber();
      recordTelemetry({
        kind: "prestige",
        t: now(),
        gen: game.prestige.ships,
        playtimeSec: game.stats.playtimeSec,
        // MAX_VALUE (not MAX_SAFE_INTEGER) on overflow: keeps an overflowing weight
        // ABOVE every finite value ever recorded, so the telemetry stays monotonic
        // instead of cratering ~9e15 below the prior sample (CodeRabbit #34).
        weights: Number.isFinite(weightsNum) ? weightsNum : Number.MAX_VALUE,
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
    pendingNotices = [];
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
    // Imported game = different world; drop any queued notices about the old one.
    pendingNotices = [];
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

/** What a pasted backup contains — shown in the restore confirm so the player
 *  knows what they're about to replace their progress WITH (R8.2 Stage A). */
export interface BackupPreview {
  ships: number;
  era: number;
  money: Big;
  playtimeSec: number;
  achievements: number;
}

/** Decode + sanitize a backup without applying it. Same decode ladder as
 *  importSave (base64 first, then raw JSON); null = not a valid backup. */
export function previewBackup(blob: string): BackupPreview | null {
  const raw = blob.trim();
  if (!raw) return null;
  const candidates: string[] = [];
  try { candidates.push(decodeURIComponent(escape(atob(raw)))); } catch { /* not base64 */ }
  candidates.push(raw);
  for (const json of candidates) {
    try {
      const g = deserialize(json);
      return {
        ships: g.prestige.ships,
        era: currentEra(g),
        money: g.resources.money,
        playtimeSec: g.stats.playtimeSec,
        achievements: g.achievements.length,
      };
    } catch { /* try the next candidate */ }
  }
  return null;
}

// Debug/test handle (used by the screenshot harness; harmless in prod).
if (typeof window !== "undefined") {
  (window as unknown as { __SINGULARITY_STORE__?: typeof useGame }).__SINGULARITY_STORE__ = useGame;
}
