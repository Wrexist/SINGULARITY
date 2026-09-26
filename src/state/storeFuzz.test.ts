import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FunctionComponent, ReactNode } from "react";

// Sheets render in place: a server render has no document.body to portal into.
vi.mock("../ui/Portal", () => ({ Portal: ({ children }: { children: ReactNode }) => children, usePortalOpen: () => false }));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useGame } from "./store";
import { TrainingDock } from "../ui/TrainingDock";
import { UpgradePanel } from "../ui/UpgradePanel";
import { ResearchPanel } from "../ui/ResearchPanel";
import { DataMarketPanel } from "../ui/DataMarketPanel";
import { CharterPanel } from "../ui/CharterPanel";
import { TrialsPanel } from "../ui/TrialsPanel";
import { DoctrinePanel } from "../ui/DoctrinePanel";
import { ContractsPanel } from "../ui/ContractsPanel";
import { ObjectivesPanel } from "../ui/ObjectivesPanel";
import { GrandChallengesPanel } from "../ui/GrandChallengesPanel";
import { AutomationPanel } from "../ui/AutomationPanel";
import { InstitutePanel } from "../ui/InstitutePanel";
import { ParadigmPanel } from "../ui/ParadigmPanel";
import { EmployeesPanel } from "../ui/EmployeesPanel";
import { ReputationModal } from "../ui/ReputationModal";
import { PrestigePanel } from "../ui/PrestigePanel";
import { ProductsPanel } from "../ui/ProductsPanel";
import { ProductDetail } from "../ui/ProductDetail";
import { GoalsPanel } from "../ui/GoalsPanel";
import { StatsPanel } from "../ui/StatsPanel";
import { RigBayPanel } from "../ui/RigBayPanel";
import { CodexPanel } from "../ui/CodexPanel";
import { MilestonesBoard } from "../ui/MilestonesBoard";
import { AchievementsBoard } from "../ui/AchievementsBoard";
import { ArchiveBoard } from "../ui/ArchiveBoard";
import { ModifierBar } from "../ui/ModifierBar";
import { OfflineModal } from "../ui/OfflineModal";
import { WorldEventCard } from "../ui/WorldEventCard";
import { createInitialState } from "../engine/state";
import { serialize, deserialize } from "../engine/save";
import { derive } from "../engine/derive";
import { balance } from "../engine/balance/config";
import { ALL_RESEARCH } from "../engine/researchTree";
import { researchAvailable } from "../engine/actions";
import { earnedReputation } from "../engine/reputation";
import { Big } from "../engine/math/Big";
import { products as PRODUCTS, productFeatures } from "../engine/balance/products";
import { contracts as CONTRACTS } from "../engine/balance/contracts";
import { objectives as OBJECTIVES } from "../engine/balance/objectives";
import { legacyTree as LEGACY } from "../engine/balance/legacyTree";
import { reputation as REPUTATION } from "../engine/balance/reputation";
import { trials as TRIALS } from "../engine/balance/trials";
import { paradigms as PARADIGMS } from "../engine/balance/paradigms";
import { doctrine as DOCTRINE } from "../engine/balance/doctrine";
import { institute as INSTITUTE } from "../engine/balance/institute";
import { challenges as CHALLENGES } from "../engine/balance/challenges";
import { automation as AUTOMATION } from "../engine/balance/automation";
import { components as COMPONENTS, SLOTS_BY_TIER } from "../engine/balance/components";
import { market as MARKET } from "../engine/balance/market";
import { charters as CHARTERS } from "../engine/balance/charters";
import { NEGOTIATION_ID } from "../engine/negotiation";
import type { GameState } from "../engine/types";
import type { ShipMode } from "../engine/prestige";

/**
 * Store-layer invariant fuzzer. The engine fuzzer (engine/invariantFuzz.test.ts) drives
 * the pure transitions; this one drives the REAL Zustand store the UI calls — every
 * do* action (with stale ids too: a sold product, a fired hire, a launched draft),
 * advance() with windows from 0 to the offline cap, save() + init() relaunches, export
 * and import (of the current and of older backups), Hard Reset, the "save for this"
 * pin, recruiting, world-event and regulator cards — so the store's own layer is
 * covered: id minting, guards, the pin, the pending cards and the persistence seams.
 *
 * After every step it asserts:
 *  - no NaN / Infinity / negative number or Big anywhere in the game, and derive()
 *    neither throws nor yields one; the game's bookkeeping agrees with itself;
 *  - ids are unique (products, drafts, staff, timed effects) and every reference points
 *    at something that exists (flagship, staff assignments, the pinned node,
 *    candidates' roles, a pending world-event card — drawn by THIS generation);
 *  - progress the player earned is never taken away (Hard Reset / older backup aside);
 *  - save() writes, and exportSave() hands out, exactly the game (at the player's own
 *    intensity), and a relaunch or re-import restores it;
 *  - every panel renders from the store as it stands, without throwing and without a
 *    NaN / Infinity / undefined / null in the text the player reads.
 *
 * Deterministic: Math.random is a seeded PRNG, the Date is faked, localStorage is a map.
 * STORE_FUZZ_SEEDS / STORE_FUZZ_STEPS widen a local run (STORE_FUZZ_RESET=0 plays
 * deeper, without Hard Resets or old imports); the default stays well under 20 s.
 */

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAVE_KEY = "singularity.save.v1";
const MODES = Object.keys(balance.prestige.shipModes) as ShipMode[];
const CAP_MS = balance.offline.maxHours * 3_600_000;
const WORLD_IDS = new Set([...balance.worldEvents.list.map((e) => e.id), NEGOTIATION_ID]);
const ROLE_IDS = new Set(balance.staff.roles.map((r) => r.id));

function* leaves(v: unknown, path: string): Generator<[string, number | Big]> {
  if (v instanceof Big) { yield [path, v]; return; }
  if (typeof v === "number") { yield [path, v]; return; }
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* leaves(v[i], `${path}[${i}]`); return; }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) yield* leaves(x, `${path}.${k}`);
}
const isBad = (x: number | Big) => (x instanceof Big ? !x.isFinite() : !Number.isFinite(x));
const isNeg = (x: number | Big) => (x instanceof Big ? x.lt(0) : x < 0);
const SIGNED = /^\$\.alignment$|^\$\.lastShipReport\.alignment$/;

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

/** A stable form of a save for equality checks: float dust, key order and absent-vs-
 *  false / absent-vs-zero-count are not differences. */
function canonValue(v: unknown): unknown {
  if (typeof v === "number") return Number(v.toPrecision(10));
  if (typeof v === "string" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) return Number(Number(v).toPrecision(10));
  if (Array.isArray(v)) return v.map(canonValue);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === false || x === undefined || x === null) continue;
      out[k] = canonValue(x);
    }
    return out;
  }
  return v;
}
/** The game as the loader sees it (so loader-side normalization is not a difference). */
const canon = (json: string) => JSON.stringify(canonValue(JSON.parse(serialize(deserialize(json)))));

function firstDiff(a: unknown, b: unknown, path = "$"): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 160)} vs ${JSON.stringify(b)?.slice(0, 160)}`;
}

function storeViolations(): string[] {
  const st = useGame.getState();
  const g = st.game;
  const v: string[] = [];
  for (const [path, x] of leaves(g, "$")) {
    if (isBad(x)) v.push(`${path} is not finite`);
    else if (isNeg(x) && !SIGNED.test(path)) v.push(`${path} is negative (${x instanceof Big ? x.toJSON() : x})`);
  }
  let d;
  try { d = derive(g); } catch (e) { v.push(`derive threw: ${String(e)}`); }
  if (d) for (const [path, x] of leaves(d, "$derive")) {
    if (isBad(x)) v.push(`${path} is not finite`);
    else if (isNeg(x)) v.push(`${path} is negative`);
  }
  for (const id of dupes(g.products.active.map((p) => p.id))) v.push(`product id ${id} used twice`);
  for (const id of dupes(g.products.drafts.map((p) => p.id))) v.push(`draft id ${id} used twice`);
  for (const id of dupes(g.employees.map((e) => e.id))) v.push(`employee id ${id} used twice`);
  for (const id of dupes(g.modifiers.map((m) => m.id))) v.push(`timed effect ${id} held twice`);
  const prodIds = new Set(g.products.active.map((p) => p.id));
  if (g.flagship.productId !== null && !prodIds.has(g.flagship.productId)) v.push(`flagship ${g.flagship.productId} missing`);
  for (const e of g.employees) if (e.assignedProductId !== null && !prodIds.has(e.assignedProductId)) v.push(`${e.id} on missing ${e.assignedProductId}`);
  if (g.computeFocus < 0 || g.computeFocus > 1) v.push(`computeFocus ${g.computeFocus}`);
  // The game's own bookkeeping, as the engine fuzzer holds it, reached through the store.
  if (g.heat > balance.heat.max) v.push(`heat ${g.heat} over max`);
  if (g.suspicion > 100) v.push(`suspicion ${g.suspicion} over 100`);
  if (g.alignment < -1 || g.alignment > 1) v.push(`alignment ${g.alignment}`);
  if (g.run.progress > 1) v.push(`run.progress ${g.run.progress}`);
  if (g.run.active && g.run.readyToClaim) v.push("run both active and ready");
  if ((g.run.active || g.run.readyToClaim) !== (g.run.focus !== undefined)) v.push(`run.focus ${g.run.focus} on ${JSON.stringify(g.run)}`);
  for (const p of g.products.active) if (p.paid > p.mau * (1 + 1e-9) + 1e-9) v.push(`${p.id} paid > mau`);
  if (earnedReputation(g) + 1e-9 < g.reputation.spent) v.push("reputation spent > earned");
  if (g.stats.totalShips !== g.prestige.ships) v.push("totalShips != ships");
  if (g.employees.length > balance.staff.maxRoster) v.push("roster over cap");
  if (g.megaprojects.mandates.length > g.megaprojects.level) v.push("mandates > megaproject level");
  for (const r of ALL_RESEARCH) {
    if (!g.research.includes(r.id)) continue;
    if (!r.requires.every((q) => g.research.includes(q))) v.push(`research ${r.id} without prerequisites`);
    if (r.exclusiveGroup && ALL_RESEARCH.some((o) => o.id !== r.id && o.exclusiveGroup === r.exclusiveGroup && g.research.includes(o.id))) v.push(`both sides of ${r.exclusiveGroup}`);
  }
  if (new Set(g.research).size !== g.research.length) v.push("duplicate research");
  for (const [id, n] of Object.entries(g.components.owned)) {
    let used = 0;
    for (const slots of g.components.loadout) for (const x of Object.values(slots)) if (x === id) used++;
    if (used > n) v.push(`part ${id} fitted ${used}x with ${n} owned`);
  }
  if (g.activeTrial && g.trialsDone.includes(g.activeTrial)) v.push("active trial already banked");
  if (g.queuedTrial && g.trialsDone.includes(g.queuedTrial)) v.push("queued trial already banked");
  if (st.savingFor) {
    const { id, prevFocus } = st.savingFor;
    if (!ALL_RESEARCH.some((r) => r.id === id)) v.push(`savingFor unknown node ${id}`);
    if (g.research.includes(id)) v.push(`savingFor node ${id} already owned`);
    else if (!researchAvailable(g, id)) v.push(`savingFor node ${id} not available`);
    if (!(prevFocus >= 0 && prevFocus <= 1)) v.push(`savingFor prevFocus ${prevFocus}`);
  }
  if (st.candidates) {
    if (st.candidates.length === 0 || st.candidates.length > 3) v.push(`candidates length ${st.candidates.length}`);
    for (const c of st.candidates) if (!ROLE_IDS.has(c.roleId)) v.push(`candidate role ${c.roleId}`);
  }
  if (st.worldEvent && !WORLD_IDS.has(st.worldEvent.id)) v.push(`world event ${st.worldEvent.id} unknown`);
  if (st.offline) for (const [path, x] of leaves(st.offline, "$offline")) if (isBad(x)) v.push(`${path} is not finite`);
  return v;
}

const STAT_KEYS = Object.keys(createInitialState().stats) as (keyof GameState["stats"])[];

/** Progress the player earned is never taken away by a store action (Hard Reset and
 *  restoring an older backup aside). */
function progressViolations(prev: GameState, next: GameState): string[] {
  const v: string[] = [];
  for (const k of STAT_KEYS) {
    const a = prev.stats[k]; const b = next.stats[k];
    const dropped = a instanceof Big ? (b as Big).lt(a.mul(1 - 1e-12)) : (b as number) < (a as number) * (1 - 1e-12);
    if (dropped) v.push(`stats.${k} dropped ${a instanceof Big ? a.toJSON() : a} -> ${b instanceof Big ? (b as Big).toJSON() : b}`);
  }
  if (next.prestige.legacyWeights.lt(prev.prestige.legacyWeights.mul(1 - 1e-12))) v.push("legacyWeights dropped");
  if (next.prestige.ships < prev.prestige.ships) v.push("ships dropped");
  const keeps = (label: string, a: readonly string[], b: readonly string[]) => {
    const have = new Set(b);
    const lost = a.filter((x) => !have.has(x));
    if (lost.length) v.push(`${label} lost ${lost.join(",")}`);
  };
  keeps("achievements", prev.achievements, next.achievements);
  keeps("contracts.completed", prev.contracts.completed, next.contracts.completed);
  keeps("objectives.completed", prev.objectives.completed, next.objectives.completed);
  keeps("challenges.completed", prev.challenges.completed, next.challenges.completed);
  keeps("trialsDone", prev.trialsDone, next.trialsDone);
  keeps("products.milestones", prev.products.milestones, next.products.milestones);
  keeps("reputation.perks", prev.reputation.perks, next.reputation.perks);
  keeps("legacyInvestments", prev.legacyInvestments, next.legacyInvestments);
  keeps("paradigms", prev.paradigms, next.paradigms);
  keeps("institute", prev.institute, next.institute);
  keeps("doctrines", prev.doctrines, next.doctrines);
  if (next.prestige.ships === prev.prestige.ships) keeps("research", prev.research, next.research);
  return v;
}

/** Every panel the player can open, rendered from the store as it stands: a state the
 *  store can reach must never crash the screen that shows it. */
function renderViolations(): string[] {
  const st = useGame.getState();
  const g = st.game;
  const d = derive(g);
  const noop = () => {};
  const out: string[] = [];
  const html = <P extends object>(name: string, el: (props: P) => ReactNode, props: P) => {
    let markup: string;
    try { markup = renderToStaticMarkup(createElement(el as FunctionComponent<P>, props)); } catch (e) { out.push(`${name} threw: ${String(e).slice(0, 300)}`); return; }
    // What the player reads: no broken number or leaked placeholder in the text.
    const text = markup.replace(/<[^>]*>/g, " ");
    const bad = /(NaN|Infinity|undefined|\bnull\b|\[object Object\])/.exec(text);
    if (bad) out.push(`${name} shows "${bad[1]}": …${text.slice(Math.max(0, bad.index - 80), bad.index + 40).replace(/\s+/g, " ")}…`);
  };
  html("TrainingDock", TrainingDock, { game: g, derived: d, onStart: noop, onClaim: noop, onSetFocus: noop });
  html("UpgradePanel", UpgradePanel, { game: g, derived: d, onBuy: noop, onFoundWing: noop });
  html("ResearchPanel", ResearchPanel, { game: g, derived: d, onResearch: noop, onBuyPreprint: noop, savingFor: st.savingFor?.id ?? null, onSaveFor: noop });
  html("DataMarketPanel", DataMarketPanel, { game: g, onBuyData: noop, onBuyTool: noop, onLobby: noop });
  html("CharterPanel", CharterPanel, { game: g, onSet: noop, onLock: noop, onStance: noop });
  html("TrialsPanel", TrialsPanel, { game: g, onStart: noop, onAbandon: noop });
  html("DoctrinePanel", DoctrinePanel, { game: g, onClaim: noop });
  html("ContractsPanel", ContractsPanel, { game: g, onClaim: noop, onClaimSponsor: noop });
  html("ObjectivesPanel", ObjectivesPanel, { game: g, onClaim: noop });
  html("GrandChallengesPanel", GrandChallengesPanel, { game: g, onFund: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop });
  html("AutomationPanel", AutomationPanel, { game: g, onToggle: noop });
  html("InstitutePanel", InstitutePanel, { game: g, onBuy: noop, onEndowFellowship: noop });
  html("ParadigmPanel", ParadigmPanel, { game: g, onBuy: noop });
  html("EmployeesPanel", EmployeesPanel, { game: g, derived: d, candidates: st.candidates, onRecruit: noop, onRefresh: noop, onCloseRecruit: noop, onHireCandidate: noop, onTrain: noop, onAssign: noop, onFire: noop, onBuyPerk: noop });
  html("ReputationModal", ReputationModal, { game: g, onBuy: noop, onBuyEndowment: noop, onPickDirective: noop, onRespecDirective: noop, onClose: noop });
  html("PrestigePanel", PrestigePanel, { game: g, onPrestige: noop, onBuyReputationPerk: noop, onBuyEndowment: noop, onPickDirective: noop, onRespecDirective: noop, onBuyLegacyPerk: noop });
  html("ProductsPanel", ProductsPanel, { game: g, derived: d, onLaunchDraft: noop, onStartUpgrade: noop, onSetPrice: noop, onSetMarketing: noop, onSetEnterprise: noop, onSetEnterprisePrice: noop, onSetChannelMix: noop, onBuyFeature: noop, onRename: noop, onRetire: noop, onSetFlagship: noop, onCounterRival: noop, onPlaceStake: noop });
  for (const p of g.products.active) {
    html(`ProductDetail ${p.id}`, ProductDetail, { game: g, productId: p.id, mods: d.productModsById[p.id], onClose: noop, onStartUpgrade: noop, onSetPrice: noop, onSetMarketing: noop, onSetEnterprise: noop, onSetEnterprisePrice: noop, onSetChannelMix: noop, onBuyFeature: noop, onRename: noop, onRetire: noop, onSetFlagship: noop });
  }
  for (const section of ["now", "long", "collection"] as const) {
    html(`GoalsPanel ${section}`, GoalsPanel, { game: g, section, onSection: noop, onClaimObjective: noop, onClaimContract: noop, onClaimSponsor: noop, onFundChallenge: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop, onStartTrial: noop, onAbandonTrial: noop, onClaimDoctrine: noop, onCollectionSeen: noop });
  }
  html("StatsPanel", StatsPanel, { game: g, derived: d });
  html("RigBayPanel", RigBayPanel, { game: g, onBuy: noop, onEquip: noop, onFuse: noop });
  html("CodexPanel", CodexPanel, { game: g });
  html("MilestonesBoard", MilestonesBoard, { game: g });
  html("AchievementsBoard", AchievementsBoard, { game: g });
  html("ArchiveBoard", ArchiveBoard as unknown as (p: { game: GameState }) => ReactNode, { game: g });
  html("ModifierBar", ModifierBar, { modifiers: g.modifiers, onWork: noop, workShaveSec: 5 });
  if (st.offline) html("OfflineModal", OfflineModal, { summary: st.offline, onClose: noop });
  if (st.worldEvent) html("WorldEventCard", WorldEventCard, { event: st.worldEvent, onDismiss: noop, onChoose: noop });
  return out;
}

let storage: Record<string, string>;
let prevStorage: unknown;

beforeEach(() => {
  storage = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, val: string) => { storage[k] = val; },
    removeItem: (k: string) => { delete storage[k]; },
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_780_000_000_000);
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function inject(mag: number) {
  const v = Big.of(10).pow(mag);
  useGame.setState((s) => ({
    game: {
      ...s.game,
      resources: { compute: s.game.resources.compute.add(v), data: s.game.resources.data.add(v), money: s.game.resources.money.add(v) },
      lifetimeMoney: s.game.lifetimeMoney.add(v),
      stats: { ...s.game.stats, totalMoney: s.game.stats.totalMoney.add(v) },
    },
  }));
}

function runSeed(seed: number, steps: number): string[] {
  const r = mulberry32(seed);
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  vi.spyOn(Math, "random").mockImplementation(rnd);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const S = () => useGame.getState();
  const g = () => S().game;
  // Ids the UI may still hold after the thing is gone (a sold product, a fired hire, a
  // launched draft): a stale tap must be a no-op, never a dangling reference.
  const seenProds = new Set<string>(["prod-none"]);
  const seenEmps = new Set<string>(["emp-none"]);
  const prod = () => {
    for (const p of g().products.active) seenProds.add(p.id);
    return g().products.active.length && r() < 0.85 ? pick(g().products.active).id : pick([...seenProds]);
  };
  const emp = () => {
    for (const e of g().employees) seenEmps.add(e.id);
    return g().employees.length && r() < 0.85 ? pick(g().employees).id : pick([...seenEmps]);
  };

  useGame.setState({ game: createInitialState(), offline: null, event: null, notice: null, worldEvent: null, candidates: null, savingFor: null });
  S().init();

  const backups: string[] = [];
  const acts: Array<[string, number, () => unknown]> = [
    ["advance0", 2, () => S().advance(0)],
    ["advance100", 12, () => S().advance(100)],
    ["advance1s", 6, () => S().advance(1000)],
    ["advance20s", 4, () => S().advance(20_000)],
    ["advanceBig", 2, () => { const ms = 60_000 + r() * CAP_MS; S().advance(ms, ms * (r() < 0.3 ? 3 : 1)); }],
    ["advanceCap", 1, () => S().advance(CAP_MS, CAP_MS * 2)],
    ["startRun", 3, () => S().doStartRun()],
    ["claim", 3, () => S().doClaim()],
    ["upgrade", 5, () => S().doBuyUpgrade(pick(balance.upgrades).id)],
    ["upgradeBulk", 3, () => S().doBuyUpgradeBulk(pick(balance.upgrades).id, r() < 0.3 ? Infinity : 1 + Math.floor(r() * 10))],
    ["research", 6, () => S().doResearch(pick(ALL_RESEARCH).id)],
    ["focus", 2, () => S().setComputeFocus(Math.round(r() * 20) / 20)],
    ["saveFor", 3, () => S().doSaveFor(pick(ALL_RESEARCH).id)],
    ["buyPart", 1, () => S().doBuyComponent(pick(COMPONENTS.catalog).id)],
    ["equipPart", 1, () => {
      const tier = Math.floor(r() * SLOTS_BY_TIER.length);
      const slot = pick(SLOTS_BY_TIER[tier]!);
      const fits = COMPONENTS.catalog.filter((c) => c.class === slot);
      if (fits.length) S().doEquipComponent(tier, slot, r() < 0.2 ? null : pick(fits).id);
    }],
    ["fusePart", 1, () => S().doFuseComponents(pick(COMPONENTS.catalog).id)],
    ["contract", 1, () => S().doClaimContract(pick(CONTRACTS.pool).id)],
    ["work", 1, () => { const m = g().modifiers; if (m.length) S().doWorkProblem(pick(m).id); }],
    ["sponsorRoll", 1, () => S().doRollSponsor(20_000 + Math.floor(r() * 30))],
    ["sponsorClaim", 1, () => S().doClaimSponsor()],
    ["preprint", 1, () => S().doBuyPreprint()],
    ["charter", 1, () => S().doSetCharter(r() < 0.2 ? null : pick(CHARTERS.list).id)],
    ["lockCharter", 1, () => S().doLockCharter()],
    ["stance", 1, () => S().doDeclareStance(pick(["doomer", "accel", null] as const))],
    ["counter", 1, () => S().doCounterRival(pick(MARKET.rivals).name)],
    ["stake", 1, () => S().doPlaceStake(pick(MARKET.rivals).name)],
    ["legacyPerk", 1, () => S().doBuyLegacyPerk(pick(LEGACY.perks).id)],
    ["recruit", 2, () => S().doRecruit()],
    ["reroll", 1, () => S().doRefreshCandidates()],
    ["closeRecruit", 1, () => S().doCloseRecruit()],
    ["hire", 3, () => S().doHireCandidate(Math.floor(r() * 3))],
    ["train", 1, () => S().doTrainEmployee(emp())],
    ["assign", 2, () => S().doAssignEmployeeToProduct(emp(), r() < 0.7 ? prod() : null)],
    ["fire", 1, () => { if (r() < 0.3) S().doFireEmployee(emp()); }],
    ["office", 1, () => S().doBuyOfficePerk(pick(balance.office.perks).id)],
    ["repPerk", 1, () => S().doBuyReputationPerk(pick(REPUTATION.perks).id)],
    ["endow", 1, () => S().doBuyEndowment()],
    ["wing", 1, () => S().doFoundWing()],
    ["directive", 1, () => S().doPickDirective(pick(REPUTATION.endowment.directives.defs).id)],
    ["respec", 1, () => S().doRespecDirective(pick(REPUTATION.endowment.directives.defs).id)],
    ["trial", 1, () => S().doStartTrial(pick(TRIALS.list).id)],
    ["abandonTrial", 1, () => { if (r() < 0.3) S().doAbandonTrial(); }],
    ["flagship", 1, () => S().doSetFlagship(r() < 0.8 ? prod() : null)],
    ["paradigm", 1, () => S().doBuyParadigm(pick(PARADIGMS.list).id)],
    ["doctrine", 1, () => S().doClaimDoctrine(pick(DOCTRINE.perks).id)],
    ["institute", 1, () => S().doBuyInstitute(pick(INSTITUTE.perks).id)],
    ["fellowship", 1, () => S().doEndowFellowship()],
    ["challenge", 1, () => S().doFundChallenge(pick(CHALLENGES.list).id)],
    ["fork", 1, () => { const c = pick(CHALLENGES.list); if (c.forks) S().doChooseFork(c.id, pick(c.forks).id); }],
    ["megaproject", 1, () => S().doFundMegaproject()],
    ["mandate", 1, () => S().doPickMandate(pick(CHALLENGES.megaproject.mandates.defs).id)],
    ["objective", 1, () => S().doClaimObjective(pick(OBJECTIVES.pool).id, pick(["computeMult", "dataMult", "moneyMult", undefined] as const))],
    ["automation", 2, () => S().doToggleAutomation(pick(AUTOMATION.list).id)],
    ["release", 2, () => S().doReleaseProduct(pick(PRODUCTS.types).id, "P")],
    ["launch", 2, () => { const d = g().products.drafts; S().doLaunchDraft(d.length && r() < 0.85 ? pick(d).id : `draft-${Math.floor(r() * 40)}`, pick(PRODUCTS.types).id, "D"); }],
    ["push", 1, () => S().doPushVersion(prod())],
    ["productUpgrade", 1, () => S().doStartUpgrade(prod())],
    ["price", 1, () => S().doSetProductPrice(prod(), PRODUCTS.priceMin + r() * (PRODUCTS.priceMax - PRODUCTS.priceMin))],
    ["marketing", 1, () => S().doSetProductMarketing(prod(), r() * 1e5)],
    ["enterprise", 1, () => S().doSetEnterprise(prod(), r() < 0.5)],
    ["enterprisePrice", 1, () => S().doSetEnterprisePrice(prod(), r() * 5)],
    ["channelMix", 1, () => S().doSetChannelMix(prod(), pick(PRODUCTS.channels).id, r() * 3)],
    ["feature", 1, () => S().doBuyFeature(prod(), pick(productFeatures).id)],
    ["rename", 1, () => S().doRenameProduct(prod(), `R${Math.floor(r() * 99)}`)],
    ["sell", 1, () => { if (r() < 0.3) S().doRetireProduct(prod()); }],
    ["buyData", 1, () => S().doBuyData(pick(balance.dataMarket).id)],
    ["lobby", 1, () => S().doLobby()],
    ["daily", 1, () => S().doClaimDaily()],
    ["worldChoose", 2, () => S().chooseWorldEvent(Math.floor(r() * 3))],
    ["worldDismiss", 1, () => S().dismissWorldEvent()],
    ["dismissOffline", 2, () => S().dismissOffline()],
    ["suspicion", 1, () => useGame.setState((s) => ({ game: { ...s.game, suspicion: Math.min(100, s.game.suspicion + 30) } }))],
    ["ship", 2, () => { inject(12 + Math.floor(r() * 30)); for (const n of ALL_RESEARCH) S().doResearch(n.id); S().doPrestige(pick(MODES)); }],
    ["shipAsIs", 1, () => S().doPrestige(pick(MODES))],
    ["inject", 3, () => inject(3 + Math.floor(r() * 30))],
    ["save", 3, () => S().save()],
    ["relaunch", 2, () => { S().save(); S().init(); }],
    ["exportImport", 2, () => { if (!S().importSave(S().exportSave())) throw new Error("own export refused"); }],
    ["hardReset", Number(process.env.STORE_FUZZ_RESET ?? 0.2), () => S().hardReset()],
    ["exportKeep", 1, () => { backups.push(S().exportSave()); }],
    ["importOld", Number(process.env.STORE_FUZZ_RESET ?? 0.2) * 5, () => { if (backups.length && !S().importSave(pick(backups))) throw new Error("old export refused"); }],
  ];
  const total = acts.reduce((a, x) => a + x[1], 0);
  const choose = () => {
    let x = r() * total;
    for (const a of acts) { x -= a[1]; if (x <= 0) return a; }
    return acts[acts.length - 1]!;
  };

  const found: string[] = [];
  const trail: string[] = [];
  // Which generation raised the pending world-event card: a card is about the lab that
  // drew it, so it must not ride over a Ship into the next one.
  let cardKey = -1;
  let cardShips = 0;
  for (let i = 0; i < steps && found.length < 20; i++) {
    const [name, , f] = choose();
    trail.push(name);
    const prevGame = g();
    const pre = (() => { const st = S(); return serialize(st.savingFor ? { ...st.game, computeFocus: st.savingFor.prevFocus } : st.game); })();
    const where = `seed ${seed} step ${i} (${trail.slice(-6).join(", ")})`;
    try { f(); } catch (e) { found.push(`${where}: threw ${String(e)}`); continue; }
    vi.setSystemTime(Date.now() + 100);
    for (const m of storeViolations()) found.push(`${where}: ${m}`);
    if (name !== "hardReset" && name !== "importOld") for (const m of progressViolations(prevGame, g())) found.push(`${where}: ${m}`);
    const card = S().worldEvent;
    if (card && card.key !== cardKey) { cardKey = card.key; cardShips = g().prestige.ships; }
    else if (card && g().prestige.ships !== cardShips) { found.push(`${where}: world card ${card.id} from ship ${cardShips} still pending at ship ${g().prestige.ships}`); cardShips = g().prestige.ships; }

    if (i % 7 === 0) for (const m of renderViolations()) found.push(`${where}: ${m}`);
    // Persistence seams, every few steps: what save() writes and what exportSave()
    // hands out are the game (with the player's own intensity), and a relaunch from
    // that save restores it.
    if (i % 5 === 0) {
      const st = S();
      const want = serialize(st.savingFor ? { ...st.game, computeFocus: st.savingFor.prevFocus } : st.game);
      st.save();
      const disk = storage[SAVE_KEY];
      if (disk !== want) found.push(`${where}: save() wrote something else: ${disk ? firstDiff(JSON.parse(disk), JSON.parse(want)) : "nothing"}`);
      const blob = st.exportSave();
      let backup = "";
      try { backup = decodeURIComponent(escape(atob(blob))); } catch { backup = blob; }
      if (backup !== want) found.push(`${where}: exportSave differs from the save`);
    }
    if (name === "relaunch" || name === "exportImport") {
      // The step itself saved/exported then loaded: the game now running must be the one
      // that was persisted, as the loader reads it.
      const now = serialize(S().game);
      if (canon(now) !== canon(pre)) found.push(`${where}: ${name} changed the game: ${firstDiff(JSON.parse(canon(now)), JSON.parse(canon(pre)))}`);
    }
  }
  if (process.env.STORE_FUZZ_STATS) {
    const G = g();
    console.log(`seed ${seed}: ships ${G.prestige.ships} products ${G.products.active.length} drafts ${G.products.drafts.length} staff ${G.employees.length} research ${G.research.length} mods ${G.modifiers.length} automation ${Object.values(G.automation).filter(Boolean).length} susp ${G.suspicion.toFixed(0)} money ${G.resources.money.toJSON()}`);
  }
  return found;
}

describe("store-layer invariant fuzz", () => {
  const seeds = Number(process.env.STORE_FUZZ_SEEDS ?? 8);
  const steps = Number(process.env.STORE_FUZZ_STEPS ?? 350);
  for (let k = 0; k < seeds; k++) {
    const seed = 101 + k;
    it(`seed ${seed}: every store action keeps the invariants`, () => {
      expect(runSeed(seed, steps).join("\n")).toBe("");
    });
  }
});
