import { create } from "zustand";
import type { Employee, GameState } from "../engine/types";
import { createInitialState } from "../engine/state";
import { tick } from "../engine/tick";
import { derive, focusToBank } from "../engine/derive";
import { ALL_RESEARCH } from "../engine/researchTree";
import {
  addEmployee, rosterFull, startTraining, canTrain, fireEmployee, hireCost,
  assignEmployee as assignEmployeeToProduct, levelUpNote,
} from "../engine/employees";
import { versionShipNote } from "../engine/notices";
import {
  startRun,
  claimRun,
  buyUpgrade,
  buyUpgradeBulk,
  buyOfficePerk,
  buyResearchByHand,
  canBuyResearch,
  researchAvailable,
  researchCost,
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
  productsUnlocked,
} from "../engine/products";
import { productMilestones as PRODUCT_MILESTONES, type ProductTypeId } from "../engine/balance/products";
import { achievements as ACHIEVEMENT_DEFS } from "../engine/balance/achievements";
import { buyReputationPerk, buyEndowment, pickEndowmentDirective, respecDirective, foundWing } from "../engine/reputation";
import { abandonTrial, queueTrial } from "../engine/trials";
import { setFlagship } from "../engine/flagship";
import { buyParadigm } from "../engine/paradigms";
import { claimDoctrine, declareStance, type Stance } from "../engine/doctrine";
import { buyInstitute, endowFellowship } from "../engine/institute";
import { fundChallenge, chooseFork, fundMegaproject, pickMandate } from "../engine/challenges";
import { claimObjective } from "../engine/objectives";
import { applyAutomation, automationUnlockedAny, automationEnabled, toggleAutomation } from "../engine/automation";
import { automation as AUTOMATION } from "../engine/balance/automation";
import { claimContract, rollSponsor, claimSponsor } from "../engine/contracts";
import { buyPreprint } from "../engine/preprints";
import { setCharter, lockCharter } from "../engine/charter";
import { counterRival, placeStake } from "../engine/market";
import { negotiationDue, negotiationOffer, applyNegotiationChoice, NEGOTIATION_ID } from "../engine/negotiation";
import { buyLegacyPerk } from "../engine/legacyTree";
import { prestige, type ShipMode } from "../engine/prestige";
import { applyOffline, summarizeWindow, extendSummary, recapWorthShowing, type OfflineSummary } from "../engine/offline";
import { serialize, deserialize } from "../engine/save";
import { isPremium } from "./premium";
import { balance } from "../engine/balance/config";
import { recordTelemetry } from "./telemetry";
import { purchaseSignature } from "../engine/telemetry";
import { currentEra } from "../engine/eras";
import { codexBalance, codexUnlocked, codexRevealed } from "../engine/codex";
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
  /** "Save for this": a Compute-walled research node the player pinned, and the
   *  training intensity to restore once it's bought. UI state — never persisted. */
  savingFor: { id: string; prevFocus: number } | null;
  // lifecycle
  init: () => void;
  dismissWorldEvent: () => void;
  chooseWorldEvent: (choiceIndex: number) => void;
  /** Advance the sim by an already-cap-clamped window. `rawElapsedMs` is the
   *  UNCLAMPED real time it represents — pass it when resuming from a suspend so
   *  the recap can say the window was capped. */
  advance: (elapsedMs: number, rawElapsedMs?: number) => void;
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
  /** Declare this run's stance (Safety / center / Acceleration) — start of run only. */
  doDeclareStance: (stance: Stance) => void;
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
  /** Found a Facility Wing — a whole new floor, charged to Lab Reputation. */
  doFoundWing: () => void;
  doPickDirective: (id: string) => void;
  doRespecDirective: (id: string) => void;
  doPlaceStake: (name: string) => void;
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
  /** Take one Megaproject Mandate — the permanent pick a completed cycle mints. */
  doPickMandate: (id: string) => void;
  /** Claim a met Lab Objective, steering its boost to the chosen lane (default = headline). */
  doClaimObjective: (id: string, target?: "computeMult" | "dataMult" | "moneyMult") => void;
  /** Flip an Automation autopilot on/off (no-op if still locked). */
  doToggleAutomation: (id: string) => void;
  setComputeFocus: (v: number) => void;
  /** Pin a Compute-walled research node: ease intensity just enough to bank for it,
   *  buy it the moment it's affordable, then put the slider back. */
  doSaveFor: (id: string) => void;
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
    const n = mintedIndex(p.id, "prod-");
    if (n > productKey) productKey = n;
  }
}

/** The counter value a loaded id claims when it has the MINTED shape (`<prefix>N`, N a
 *  plain decimal integer), else 0. Only that shape can collide with an id the store
 *  mints, and N is bounded so `+= 1` still moves the counter: a loaded
 *  "emp-9007199254740993" (past 2^53) used to seed a counter that +1 no longer changed,
 *  so every later hire got the SAME id — assigning, training or firing one hit all of
 *  them, and the loader's keep-first dedupe deleted the rest (signing bonuses paid) on
 *  the next launch. Saves are hostile input. */
function mintedIndex(id: string, prefix: string): number {
  if (!id.startsWith(prefix)) return 0;
  const digits = id.slice(prefix.length);
  return /^\d{1,15}$/.test(digits) ? Number(digits) : 0;
}

/**
 * Decode a pasted backup, or null when the text doesn't hold one: a base64 backup
 * (what exportSave writes) first, then a raw JSON save. It must decode to a save
 * OBJECT — one carrying `version` (every save since v1) or `resources` (the
 * pre-versioning shape). deserialize() degrades ANY parseable JSON to a fresh lab,
 * which is right for a corrupt autosave (filter, don't wipe) but wrong for a restore:
 * a pasted number or "null" used to preview as a valid backup of a brand-new game,
 * and one tap on Restore replaced the player's progress with it.
 */
function decodeBackup(blob: string): GameState | null {
  const raw = blob.trim();
  if (!raw) return null;
  const candidates: string[] = [];
  try { candidates.push(decodeURIComponent(escape(atob(raw)))); } catch { /* not base64 */ }
  candidates.push(raw);
  for (const json of candidates) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      if (!("version" in parsed) && !("resources" in parsed)) continue;
      return deserialize(json); // migrates + sanitizes
    } catch { /* try the next candidate */ }
  }
  return null;
}

/** The game as it should be WRITTEN anywhere (autosave or exported backup): the
 *  player's own training intensity, never the temporary "save for this" one. Both a
 *  relaunch and an import start with no pin, so nothing would ever restore it. */
function persistedGame(game: GameState, savingFor: { prevFocus: number } | null): GameState {
  return savingFor ? { ...game, computeFocus: savingFor.prevFocus } : game;
}

let empKey = 0;
function seedEmpKey(game: GameState): void {
  for (const e of game.employees) {
    const n = mintedIndex(e.id, "emp-");
    if (n > empKey) empKey = n;
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
function rollCandidate(game: GameState): Candidate {
  // Product-team roles only act on live products, which open with the first Ship: a
  // generation-1 lab was offered (and paid for) hires that did nothing (r4 bug hunt).
  const roles = productsUnlocked(game) ? balance.staff.roles : balance.staff.roles.filter((r) => r.team !== "product");
  const r = balance.staff.rare;
  if (Math.random() < r.chance) {
    return { name: randomName(), roleId: pick(roles).id, trait: pick(r.traits), rare: true, level: r.level };
  }
  return { name: randomName(), roleId: pick(roles).id, trait: randomTrait() };
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
    // Never past the roster cap: the loader would drop the excess on the next launch.
    for (let i = 0; i < n && employees.length < balance.staff.maxRoster; i++) employees.push(mintEmployee(role.id, randomName(), randomTrait()));
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
  savingFor: null,
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
          // Offline catch-up gets its OWN guard: a throw here is an engine bug, not a
          // corrupt save, and must never fall through to the fresh-game path below.
          // Keep the loaded save and skip the catch-up instead.
          try {
            const result = applyOffline(game, elapsed, capHours);
            game = result.state;
            // Only surface the WIWA screen if the window earned it — real time away
            // AND something to report. Shares one predicate with the resume path so
            // cold launch and resume can never disagree about what deserves the screen.
            if (recapWorthShowing(result.summary)) offline = result.summary;
          } catch (err) {
            console.warn("Offline catch-up failed; loading the save without it:", err);
          }
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
    // Persist the caught-up lab AND the new lastSeen together (save() writes both).
    // Stamping lastSeen alone left the pre-catch-up save on disk: an app killed in
    // its first seconds relaunched with the whole time away lost (2026-09 bug hunt).
    get().save();
    // Telemetry (R8.1): seed the diff baselines from the loaded save so a returning
    // player's first tick doesn't register a phantom purchase/era-arrival, then log
    // the session start. On-device only — see src/state/telemetry.ts.
    lastSig = purchaseSignature(game.upgrades, game.research);
    lastEra = currentEra(game);
    recordTelemetry({ kind: "session", t: now() });
  },

  advance: (elapsedMs, rawElapsedMs) =>
    set((s) => {
      // Snapshot which products are mid-upgrade so we can celebrate completions
      // (the engine finishes them inside tick; we surface the moment to the UI).
      const wasUpgrading = new Map(s.game.products.active.map((p) => [p.id, !!p.upgrade]));
      const wasTraining = new Map(s.game.employees.map((e) => [e.id, !!e.training]));
      // "Save for this" across a big window (a resume from suspend): the eased
      // intensity must not govern hours of catch-up. Tick only until the bank covers
      // the pinned node, buy it and put the slider back, then run the rest normally;
      // if it can never get there (no Compute production), let go of the pin first.
      // A window that simply ends before the bank arrives keeps the pin, exactly as
      // the app left open would: letting go there cancelled the save on every short
      // app switch and spent what it had banked on full-size runs.
      let start = s.game;
      let remainingMs = elapsedMs;
      let pinDone = false;
      if (s.savingFor && elapsedMs > 2000) {
        const pin = s.savingFor;
        const def = ALL_RESEARCH.find((r) => r.id === pin.id);
        // The landing moment is re-estimated after each hop: a buff that lapses inside
        // the window (the Daily Boost, a world-event surge) slows the climb, and a single
        // estimate from the opening rate landed early and dropped the pin unbought.
        for (let hop = 0; hop < 8 && !pinDone; hop++) {
          let needMs = Infinity;
          if (def) {
            const short = researchCost(start, def).compute.sub(start.resources.compute);
            const cps = derive(start).computePerSec;
            needMs = short.lte(0) ? 0 : cps.gt(0) ? short.div(cps).toNumber() * 1000 + 250 : Infinity;
          }
          if (Number.isFinite(needMs) && needMs >= remainingMs) break; // the window ends first: keep the pin
          if (Number.isFinite(needMs)) {
            start = tick(start, needMs);
            remainingMs -= needMs;
            if (canBuyResearch(start, pin.id)) start = buyResearchByHand(start, pin.id);
            else if (def && researchAvailable(start, pin.id) && start.resources.compute.lt(researchCost(start, def).compute)) continue; // still short on Compute: hop again
          }
          start = { ...start, computeFocus: pin.prevFocus };
          pinDone = true;
        }
      }
      let game = tick(start, remainingMs);
      const secs = elapsedMs / 1000;
      const patch: Partial<GameStore> = { game };
      if (pinDone) patch.savingFor = null;

      // "While you were away", on the RESUME path. On iOS the app is suspended and
      // resumed far more often than it is killed and cold-launched, and `init()` —
      // the only other caller of the offline machinery — runs once per mount. So a
      // returning player used to be credited for the window (the loop hands us one
      // big, cap-clamped delta) while the whole welcome-back payload was skipped.
      //
      // This does NOT re-tick: the summary is a pure diff of the states either side
      // of the tick above, so the window can never be paid twice. (2026-08 §1.5.)
      const bigWindow = elapsedMs >= balance.offline.resumeRecapMinMs;
      let recapFired = false;
      if (bigWindow) {
        const summary = summarizeWindow(s.game, game, rawElapsedMs ?? elapsedMs, elapsedMs);
        if (s.offline) {
          // A recap from an earlier window is still open (read, then the phone was
          // locked without collecting). Fold this window into it: the window is paid
          // either way, and skipping the recap used to credit it silently while its
          // notices queued up behind the modal.
          patch.offline = extendSummary(s.offline, summary);
          recapFired = true;
        } else if (recapWorthShowing(summary, balance.offline.resumeRecapMinMs)) {
          patch.offline = summary;
          recapFired = true;
        }
      }

      // Collect every notice this tick earned (priority order: milestone >
      // version-ship > level-up > achievements), emit the first, queue the rest —
      // one slot per tick, but nothing is silently dropped anymore.
      const earned: FiredEvent[] = [];
      const pushNotice = (message: string, kind: NonNullable<FiredEvent["kind"]>) => {
        noticeKey += 1;
        earned.push({ key: noticeKey, message, tone: "good", kind });
      };

      // Several can land on one tick — a first launch at the frontier is "Hello, World"
      // and "Market Leader" at once — and each pays Money, so name them all (one notice,
      // like the achievements below) instead of the first alone.
      const before = new Set(s.game.products.milestones);
      const newMs = PRODUCT_MILESTONES.filter((m) => !before.has(m.id) && game.products.milestones.includes(m.id));
      if (newMs.length === 1) {
        const def = newMs[0]!;
        pushNotice(`${def.label} — ${def.desc} (+$${def.reward.toLocaleString()})`, "milestone");
      } else if (newMs.length > 1) {
        const paid = newMs.reduce((sum, m) => sum + m.reward, 0);
        const named = newMs.slice(0, 3).map((m) => m.label).join(", ");
        const more = newMs.length > 3 ? ` and ${newMs.length - 3} more` : "";
        pushNotice(`${newMs.length} milestones — ${named}${more} (+$${paid.toLocaleString()})`, "milestone");
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
      // Only once the Field Notes panel is on HQ (the first Ship): in generation 1 the
      // note unlocks quietly, and the toast pointed at a panel the player couldn't find.
      if (codexRevealed(game)) {
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
      // A fired recap SUPERSEDES the notice backlog: every achievement, milestone,
      // version ship and level-up this catch-up tick produced is already a line in
      // the "while you were away" screen, so queuing them as toasts too would tell
      // the same story twice — once behind a modal the player can't read past.
      if (recapFired) pendingNotices = [];
      else if (earned.length > 0) pendingNotices = [...pendingNotices, ...earned].slice(0, 6);
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
            // The strongest model on the shelf (ties → the newest). Drafts are stored
            // oldest first, and drafts[0] turned the weakest, most out-of-date model into
            // a product that was behind rivals on day one while the one just shipped waited.
            const draft = game.products.drafts.reduce((best, d) => (d.quality >= best.quality ? d : best));
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

      // "Save for this": buy the pinned node the moment the eased bank covers it, then
      // restore the player's intensity. Also let go if it's gone some other way.
      if (s.savingFor && !pinDone) {
        const pin = s.savingFor;
        let g = patch.game ?? game;
        if (!g.research.includes(pin.id) && canBuyResearch(g, pin.id)) g = buyResearchByHand(g, pin.id);
        const pinDef = ALL_RESEARCH.find((r) => r.id === pin.id);
        // Compute is there but the node still can't be bought (Data spent elsewhere, a
        // fork taken): let go rather than hold training forever.
        const stuck = !!pinDef && !g.research.includes(pin.id) && g.resources.compute.gte(researchCost(g, pinDef).compute);
        if (g.research.includes(pin.id) || !researchAvailable(g, pin.id) || stuck) {
          patch.game = { ...g, computeFocus: pin.prevFocus };
          patch.savingFor = null;
        } else if (g !== (patch.game ?? game)) {
          patch.game = g;
        }
      }

      return patch;
    }),

  save: () => {
    try {
      // Persist the player's own intensity, never the temporary "save for this" one:
      // an app killed mid-pin must not relaunch with training held.
      const { game, savingFor } = get();
      localStorage.setItem(SAVE_KEY, serialize(persistedGame(game, savingFor)));
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
  doDeclareStance: (stance) => set((s) => ({ game: declareStance(s.game, stance) })),
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
  doRecruit: () => set((st) => ({ candidates: [rollCandidate(st.game), rollCandidate(st.game), rollCandidate(st.game)] })),
  doRefreshCandidates: () => set((st) => ({ candidates: [rollCandidate(st.game), rollCandidate(st.game), rollCandidate(st.game)] })),
  doCloseRecruit: () => set({ candidates: null }),
  doHireCandidate: (index) => {
    const g = get().game;
    const c = get().candidates?.[index];
    if (!c) return false;
    // A full roster refuses BEFORE the signing bonus is charged (the loader keeps no more).
    if (rosterFull(g)) return false;
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
  doFoundWing: () => set((s) => ({ game: foundWing(s.game) })),
  doPickDirective: (id) => set((s) => ({ game: pickEndowmentDirective(s.game, id) })),
  doRespecDirective: (id) => set((s) => ({ game: respecDirective(s.game, id) })),
  doPlaceStake: (name) => set((s) => ({ game: placeStake(s.game, name) })),
  // Attempt QUEUES a Trial for the next run (a second tap clears the queue); the Ship
  // starts it on the untouched fresh lab. Never mid-run: any in-run start, even at
  // zero research, lets a player bank a Legacy-on stockpile first (r2 bug hunt).
  doStartTrial: (id) => set((s) => ({ game: queueTrial(s.game, id) })),
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
  doPickMandate: (id) => set((s) => ({ game: pickMandate(s.game, id) })),
  doClaimObjective: (id, target) => set((s) => ({ game: claimObjective(s.game, id, target) })),
  doToggleAutomation: (id) => set((s) => ({ game: toggleAutomation(s.game, id) })),
  // Moving the slider by hand is an explicit choice: it cancels any "save for this" pin.
  setComputeFocus: (v) =>
    set((s) => ({ game: { ...s.game, computeFocus: Math.max(0, Math.min(1, v)) }, savingFor: null })),
  doSaveFor: (id) =>
    set((s) => {
      const def = ALL_RESEARCH.find((r) => r.id === id);
      if (!def || s.game.research.includes(id) || !researchAvailable(s.game, id)) return {};
      // Only when Compute is the ONE thing missing: easing intensity (usually to a full
      // hold) stops the runs that earn Data and Money, so a node also short on Data
      // would never become affordable and the pin would freeze the whole lab.
      const cost = researchCost(s.game, def);
      if (s.game.resources.data.lt(cost.data)) return {};
      const focus = focusToBank(s.game, derive(s.game), cost.compute);
      // Re-pinning a different node keeps the ORIGINAL setting to restore.
      const prevFocus = s.savingFor?.prevFocus ?? s.game.computeFocus;
      return { game: { ...s.game, computeFocus: focus }, savingFor: { id, prevFocus } };
    }),
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
  doResearch: (id) => set((s) => ({ game: buyResearchByHand(s.game, id) })),
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
      return { game, savingFor: null };
    }),
  doClaimDaily: () => set((s) => ({ game: grantDailyBoost(s.game) })),

  hardReset: () => {
    pendingNotices = [];
    // Storage that throws (blocked, or failing) must not stop the wipe itself: a throw
    // here left "Wipe it" doing nothing. The next autosave writes the fresh lab.
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(TIME_KEY);
    } catch (err) {
      console.warn("Hard reset could not clear storage:", err);
    }
    // Clear transient UI state too, or a stale world-event card / claim burst
    // could survive into the fresh run.
    set({ game: createInitialState(), offline: null, event: null, notice: null, worldEvent: null, claimBurst: 0, candidates: null, savingFor: null });
  },

  // ---- Save backup (local-only; the player owns their progress) ----
  exportSave: () => {
    // Same substitution as save(): a backup taken mid-pin must not restore with training held.
    const { game, savingFor } = get();
    const json = serialize(persistedGame(game, savingFor));
    try { return btoa(unescape(encodeURIComponent(json))); } catch { return json; }
  },
  importSave: (blob: string) => {
    const decoded = decodeBackup(blob);
    if (!decoded) return false;
    let prevSeen: string | null | undefined;
    try {
      // Mirror init()'s post-load normalization so an imported save matches the
      // runtime shape (legacy role-counts → people; ID counters seeded so new
      // products/hires don't collide with existing prod-N / emp-N ids).
      const game = migrateStaffCounts(decoded);
      // Persist BEFORE swapping the running lab: when the write throws (storage full
      // or blocked) the sheet reports a failed restore, and the lab it leaves running
      // must be the player's own. Swapping first replaced it with the backup anyway,
      // and the next launch silently brought the old save back. lastSeen goes first (a
      // save without it would load the backup with the old lab's offline gap), and is
      // put back if the save write then fails: the old save on disk must keep its own
      // lastSeen, or the next launch loads it against the import's timestamp.
      prevSeen = localStorage.getItem(TIME_KEY);
      localStorage.setItem(TIME_KEY, String(now()));
      localStorage.setItem(SAVE_KEY, serialize(game));
      seedProductKey(game);
      seedEmpKey(game);
      // Imported game = different world; drop any queued notices about the old one.
      pendingNotices = [];
      set({ game, offline: null, event: null, notice: null, worldEvent: null, claimBurst: 0, candidates: null, savingFor: null });
      return true;
    } catch {
      if (prevSeen !== undefined) {
        try {
          if (prevSeen === null) localStorage.removeItem(TIME_KEY);
          else localStorage.setItem(TIME_KEY, prevSeen);
        } catch { /* storage refuses every write: nothing left to restore */ }
      }
      return false;
    }
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
  const g = decodeBackup(blob);
  if (!g) return null;
  return {
    ships: g.prestige.ships,
    era: currentEra(g),
    money: g.resources.money,
    playtimeSec: g.stats.playtimeSec,
    achievements: g.achievements.length,
  };
}

// Debug/test handle (used by the screenshot harness; harmless in prod).
if (typeof window !== "undefined") {
  (window as unknown as { __SINGULARITY_STORE__?: typeof useGame }).__SINGULARITY_STORE__ = useGame;
}
