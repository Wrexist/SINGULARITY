import { describe, it, expect } from "vitest";
import { Big } from "./math/Big";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { tick } from "./tick";
import { derive } from "./derive";
import { balance } from "./balance/config";
import { ALL_RESEARCH } from "./researchTree";
import {
  startRun, claimRun, buyUpgrade, buyUpgradeBulk, planBulkUpgrade, buyOfficePerk, buyResearch, buyResearchByHand,
  lobby, grantDailyBoost, workProblem, buyDataOffer, applyWorldEventChoice, maybeHeatEvent, maybeWorldEvent,
} from "./actions";
import { prestige, canPrestige, legacyWeightsForMode, shipWouldAscend, type ShipMode } from "./prestige";
import {
  releaseProduct, launchDraft, pushVersion, startUpgrade, setProductPrice, setProductMarketing, setEnterprise,
  setEnterprisePrice, setChannelMix, buyFeature, retireProduct, retirePayout, renameProduct, maybeProductEvent,
} from "./products";
import { addEmployee, assignEmployee, fireEmployee, startTraining } from "./employees";
import { claimContract, rollSponsor, claimSponsor } from "./contracts";
import { buyPreprint } from "./preprints";
import { setCharter, lockCharter, charterHand } from "./charter";
import { declareStance, claimDoctrine } from "./doctrine";
import { counterRival, placeStake } from "./market";
import { buyLegacyPerk, legacyAvailable } from "./legacyTree";
import {
  buyReputationPerk, buyEndowment, pickEndowmentDirective, respecDirective, foundWing, earnedReputation,
} from "./reputation";
import { queueTrial, abandonTrial } from "./trials";
import { setFlagship } from "./flagship";
import { buyParadigm } from "./paradigms";
import { buyInstitute, endowFellowship } from "./institute";
import { fundChallenge, chooseFork, fundMegaproject, pickMandate } from "./challenges";
import { claimObjective } from "./objectives";
import { toggleAutomation, applyAutomation, automationEnabled } from "./automation";
import { buyComponent, equipComponent, fuseComponents } from "./components";
import { applyNegotiationChoice, negotiationDue } from "./negotiation";
import { applyOffline } from "./offline";
import { products as PRODUCTS, productFeatures } from "./balance/products";
import { contracts as CONTRACTS } from "./balance/contracts";
import { objectives as OBJECTIVES } from "./balance/objectives";
import { legacyTree as LEGACY } from "./balance/legacyTree";
import { reputation as REPUTATION } from "./balance/reputation";
import { trials as TRIALS } from "./balance/trials";
import { paradigms as PARADIGMS } from "./balance/paradigms";
import { doctrine as DOCTRINE } from "./balance/doctrine";
import { institute as INSTITUTE } from "./balance/institute";
import { challenges as CHALLENGES } from "./balance/challenges";
import { automation as AUTOMATION } from "./balance/automation";
import { components as COMPONENTS, SLOTS_BY_TIER } from "./balance/components";
import { market as MARKET } from "./balance/market";
import type { GameState } from "./types";

/**
 * Property-based invariant fuzzer over the REAL engine.
 *
 * A seeded walk plays many generations with random-but-legal player actions (racks and
 * upgrades in bulk, research incl. forks, charters, the Stance, the Trials queue, every
 * ship mode, products, staff, contracts, challenges, the data market, lobbying,
 * world-event and regulator choices, save/load round trips, huge offline windows) and
 * after EVERY step asserts the invariants the game is built on:
 *
 *  - nothing in the state or its derived rates is NaN / Infinity, and no resource,
 *    count or rate is negative; bounded gauges (Heat, suspicion, stance, intensity,
 *    run progress) stay in range and paid subscribers never exceed users;
 *  - lifetime stats (peaks, totals, counters) never go down, lifetimeMoney only drops
 *    at a Ship, Legacy Weights never drop, and uninvested weights only drop when they
 *    are invested;
 *  - earned Reputation never drops and never falls below what has been spent;
 *  - permanent collections (achievements, contracts, trials, challenges, objectives)
 *    never lose an entry;
 *  - the state's bookkeeping agrees with itself (ships, Legacy, fork exclusivity,
 *    prerequisites, fitted parts, product ids, flagship, assignments, caps);
 *  - no transition mutates its input, and derive() is pure: a structurally identical
 *    copy of the state derives exactly the same;
 *  - load(save(s)) saves back to the same bytes (modulo float dust / set order);
 *  - tick(a + b) matches tick(a) then tick(b) wherever the cut cannot legitimately
 *    matter (compute, Data, Heat, users; Money for a lab without products or payroll);
 *  - what the game quotes is what happens: a Ship banks the Legacy it quoted and
 *    ascends exactly when predicted, a sale pays its quoted price, a bulk buy charges
 *    its planned total.
 *
 * Resources are topped up now and then ("inject"), up past a JS number's range, so a
 * walk reaches the deep endgame in a few hundred steps; every state it visits is one
 * the engine's own actions produced. Deterministic: a seeded PRNG, no wall clock.
 * FUZZ_SEEDS / FUZZ_STEPS widen a local run; the default stays well under 10 s.
 */

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES = Object.keys(balance.prestige.shipModes) as ShipMode[];

function buyAllResearch(s: GameState): GameState {
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of ALL_RESEARCH) {
      const n = buyResearch(s, r.id);
      if (n !== s) { s = n; changed = true; }
    }
  }
  return s;
}

function inject(s: GameState, mag: number): GameState {
  const v = Big.of(10).pow(mag);
  return {
    ...s,
    resources: { compute: s.resources.compute.add(v), data: s.resources.data.add(v), money: s.resources.money.add(v) },
    lifetimeMoney: s.lifetimeMoney.add(v),
    stats: { ...s.stats, totalMoney: s.stats.totalMoney.add(v) },
  };
}

/** A structurally identical, reference-fresh copy (Bigs are immutable, so shared). */
function deepCopy<T>(v: T): T {
  if (v instanceof Big || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(deepCopy) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = deepCopy(x);
  return out as T;
}

/** Every number (and Big) reachable from `v`, with its path. */
function* leaves(v: unknown, path: string): Generator<[string, number | Big]> {
  if (v instanceof Big) { yield [path, v]; return; }
  if (typeof v === "number") { yield [path, v]; return; }
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* leaves(v[i], `${path}[${i}]`); return; }
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) yield* leaves(x, `${path}.${k}`);
}

const isBad = (x: number | Big) => (x instanceof Big ? !x.isFinite() : !Number.isFinite(x));
const isNeg = (x: number | Big) => (x instanceof Big ? x.lt(0) : x < 0);

/** Paths allowed to be negative: the stance slider (−1 doomer … +1 accel). */
const SIGNED = /^\$\.alignment$|^\$\.lastShipReport\.alignment$/;

/** A stable text form of a Derived (Big → string), for purity comparisons. */
function deriveKey(s: GameState): string {
  return JSON.stringify(derive(s), (_k, v) => (v instanceof Big ? `B:${v.toJSON()}` : v));
}

/** Where two serialized saves differ, ignoring float dust and id-set order. */
function saveDiff(a: string, b: string): string | null {
  if (a === b) return null;
  const out: string[] = [];
  const num = (v: unknown): number | null =>
    typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v) ? Number(v) : null;
  const walk = (x: unknown, y: unknown, path: string) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    const nx = num(x); const ny = num(y);
    if (nx !== null && ny !== null) {
      if (Math.abs(nx - ny) <= 1e-9 * Math.max(1, Math.abs(nx), Math.abs(ny))) return;
    } else if (Array.isArray(x) && Array.isArray(y) && x.every((v) => typeof v === "string") && y.every((v) => typeof v === "string")) {
      if (JSON.stringify([...x].sort()) === JSON.stringify([...y].sort())) return;
    } else if (Array.isArray(x) && Array.isArray(y) && x.length === y.length) {
      x.forEach((v, i) => walk(v, y[i], `${path}[${i}]`));
      return;
    } else if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const vx = (x as Record<string, unknown>)[k];
        const vy = (y as Record<string, unknown>)[k];
        if ((vx === false && vy === undefined) || (vy === false && vx === undefined)) continue;
        // An upgrade count of 0 (an in-place rack upgrade evicted the last one) is absent.
        if ((vx === 0 && vy === undefined) || (vy === 0 && vx === undefined)) continue;
        walk(vx, vy, `${path}.${k}`);
      }
      return;
    }
    out.push(`${path}: ${JSON.stringify(x)?.slice(0, 200)} vs ${JSON.stringify(y)?.slice(0, 200)}`);
  };
  walk(JSON.parse(a), JSON.parse(b), "$");
  return out.length ? out.join("\n") : null;
}

/** Every invariant that must hold of a single state. Returns the violations. */
function stateViolations(s: GameState): string[] {
  const v: string[] = [];
  for (const [path, x] of leaves(s, "$")) {
    if (isBad(x)) v.push(`${path} is not finite (${String(x instanceof Big ? x.toJSON() : x)})`);
    else if (isNeg(x) && !SIGNED.test(path)) v.push(`${path} is negative (${x instanceof Big ? x.toJSON() : x})`);
  }
  const d = derive(s);
  for (const [path, x] of leaves(d, "$derive")) {
    if (isBad(x)) v.push(`${path} is not finite`);
    else if (isNeg(x)) v.push(`${path} is negative (${x instanceof Big ? x.toJSON() : x})`);
  }
  if (s.heat > balance.heat.max) v.push(`heat ${s.heat} over max`);
  if (s.suspicion > 100) v.push(`suspicion ${s.suspicion} over 100`);
  if (s.alignment < -1 || s.alignment > 1) v.push(`alignment ${s.alignment} out of [-1,1]`);
  if (s.computeFocus > 1) v.push(`computeFocus ${s.computeFocus} over 1`);
  if (s.run.progress > 1) v.push(`run.progress ${s.run.progress} over 1`);
  if (s.run.active && s.run.readyToClaim) v.push("run both active and ready to claim");
  for (const p of s.products.active) {
    if (p.paid > p.mau * (1 + 1e-9) + 1e-9) v.push(`product ${p.id}: paid ${p.paid} > mau ${p.mau}`);
    if (p.version < 1) v.push(`product ${p.id}: version ${p.version}`);
  }
  const earned = earnedReputation(s);
  if (earned + 1e-9 < s.reputation.spent) v.push(`reputation spent ${s.reputation.spent} > earned ${earned}`);

  // Bookkeeping that must agree with itself.
  const st = s.stats;
  if (st.totalShips !== s.prestige.ships) v.push(`stats.totalShips ${st.totalShips} != prestige.ships ${s.prestige.ships}`);
  if (st.totalLegacy.sub(s.prestige.legacyWeights).abs().gt(st.totalLegacy.mul(1e-9))) {
    v.push(`stats.totalLegacy ${st.totalLegacy.toJSON()} != legacyWeights ${s.prestige.legacyWeights.toJSON()}`);
  }
  if (st.totalMoney.lt(s.lifetimeMoney.mul(1 - 1e-9))) v.push(`all-time earnings ${st.totalMoney.toJSON()} < this run's ${s.lifetimeMoney.toJSON()}`);
  for (const k of ["ascensions", "openSourceShips", "safetyShips"] as const) {
    if (st[k] > st.totalShips) v.push(`stats.${k} ${st[k]} > ships ${st.totalShips}`);
  }
  if (s.shipLog.length > Math.min(balance.prestige.shipLogCap, st.totalShips)) v.push(`shipLog ${s.shipLog.length} entries for ${st.totalShips} ships`);
  if (new Set(s.research).size !== s.research.length) v.push("research holds a duplicate");
  for (const r of ALL_RESEARCH) {
    if (!s.research.includes(r.id)) continue;
    if (!r.requires.every((q) => s.research.includes(q))) v.push(`research ${r.id} owned without its prerequisites`);
    if (r.exclusiveGroup && ALL_RESEARCH.some((o) => o.id !== r.id && o.exclusiveGroup === r.exclusiveGroup && s.research.includes(o.id))) {
      v.push(`both sides of fork ${r.exclusiveGroup} owned`);
    }
  }
  if (s.activeTrial && s.trialsDone.includes(s.activeTrial)) v.push(`active Trial ${s.activeTrial} is already banked`);
  if (s.queuedTrial && s.trialsDone.includes(s.queuedTrial)) v.push(`queued Trial ${s.queuedTrial} is already banked`);
  const ids = new Set(s.products.active.map((p) => p.id));
  if (ids.size !== s.products.active.length) v.push("two products share an id");
  if (s.flagship.productId !== null && !ids.has(s.flagship.productId)) v.push(`flagship ${s.flagship.productId} is not a live product`);
  for (const e of s.employees) {
    if (e.assignedProductId !== null && !ids.has(e.assignedProductId)) v.push(`${e.id} assigned to missing product ${e.assignedProductId}`);
  }
  if (s.employees.length > balance.staff.maxRoster) v.push(`roster ${s.employees.length} over the cap`);
  if (s.megaprojects.mandates.length > s.megaprojects.level) v.push("more mandates than megaproject cycles");
  for (const id of Object.keys(s.challenges.forks)) if (!s.challenges.completed.includes(id)) v.push(`fork chosen on open challenge ${id}`);
  for (const [id, n] of Object.entries(s.components.owned)) {
    let used = 0;
    for (const slots of s.components.loadout) for (const x of Object.values(slots)) if (x === id) used++;
    if (used > n) v.push(`part ${id} fitted ${used}x with ${n} owned`);
  }
  s.components.loadout.forEach((slots, tier) => {
    const rack = ["rack_basic", "rack_server", "rack_tpu"][tier]!;
    if (Object.values(slots).some(Boolean) && (s.upgrades[rack] ?? 0) <= 0) v.push(`parts fitted to rack tier ${tier} with no racks`);
  });
  if ((s.run.active || s.run.readyToClaim) !== (s.run.focus !== undefined)) v.push(`run.focus ${s.run.focus} on run ${JSON.stringify(s.run)}`);
  return v;
}

const relDiff = (a: Big, b: Big): number => {
  const m = a.abs().max(b.abs());
  return m.lte(1e-9) ? 0 : a.sub(b).abs().div(m).toNumber();
};

/**
 * tick(a + b) against tick(a) then tick(b). Only where the split cannot legitimately
 * matter: no Research Director (its purchases land at a tick boundary, and a node
 * bought sooner compounds), the same research, milestones and achievements either way
 * (one-time rewards and discrete buys land at tick boundaries too). Compute, Data and
 * Heat must then agree; Money too for a lab without products or payroll (a product's
 * margin and the income-capped payroll are settled per window by design).
 */
function additivityViolations(s: GameState, r: () => number): string[] {
  if (s.reputation.perks.includes("rep_autoresearch")) return [];
  // The autopilots act between a long window's 5-minute steps (claiming Objective
  // boosts, starting versions), so where the cut falls decides when they act.
  if (AUTOMATION.list.some((a) => automationEnabled(s, a.id))) return [];
  const sizes = [100, 700, 5_000, 60_000, 400_000];
  const a = sizes[Math.floor(r() * sizes.length)]!;
  const b = sizes[Math.floor(r() * sizes.length)]!;
  const one = tick(s, a + b);
  const two = tick(tick(s, a), b);
  if (one.research.join() !== two.research.join()) return [];
  if (one.products.milestones.join() !== two.products.milestones.join()) return [];
  if (one.achievements.join() !== two.achievements.join()) return [];
  const v: string[] = [];
  const tol = 0.02;
  const cmp = (label: string, x: Big, y: Big) => {
    const dd = relDiff(x, y);
    if (dd > tol) v.push(`tick(${a}+${b}) ${label} ${x.toJSON()} vs split ${y.toJSON()} (${(dd * 100).toFixed(1)}%)`);
  };
  cmp("compute", one.resources.compute, two.resources.compute);
  cmp("data", one.resources.data, two.resources.data);
  if (s.products.active.length === 0 && derive(s).payrollPerSec.lte(0)) {
    cmp("money", one.resources.money, two.resources.money);
    cmp("lifetimeMoney", one.lifetimeMoney, two.lifetimeMoney);
  }
  // Users compound the same however the window is cut (word of mouth is per capita).
  // Not across a version upgrade: it lands at the end of the tick it completes in, so
  // where the cut falls decides how long the new version grows inside the window.
  if (!s.products.active.some((p) => p.upgrade)) {
    const users = (x: GameState) => Big.of(x.products.active.reduce((sum, p) => sum + p.mau, 0));
    const du = relDiff(users(one), users(two));
    if (du > 0.05) v.push(`tick(${a}+${b}) users ${users(one).toJSON()} vs split ${users(two).toJSON()} (${(du * 100).toFixed(1)}%)`);
  }
  if (Math.abs(one.heat - two.heat) > 0.5) v.push(`tick(${a}+${b}) heat ${one.heat} vs split ${two.heat}`);
  if (Math.abs(one.stats.playtimeSec - two.stats.playtimeSec) > 1e-6) v.push("playtime differs");
  return v;
}

/** What the panels quote before an action is what the action then does. */
function quoteViolations(s: GameState, r: () => number): string[] {
  const v: string[] = [];
  // Within Big precision: a charge far below the balance it comes out of is dust.
  const close = (x: Big, y: Big, scale: Big) => x.sub(y).abs().lte(y.abs().mul(1e-9).add(scale.mul(1e-12)).add(1e-9));
  if (canPrestige(s)) {
    const mode = MODES[Math.floor(r() * MODES.length)]!;
    const after = prestige(s, mode);
    const gained = after.prestige.legacyWeights.sub(s.prestige.legacyWeights);
    const quoted = legacyWeightsForMode(s, mode);
    if (!close(gained, quoted, s.prestige.legacyWeights)) v.push(`ship ${mode} banked ${gained.toJSON()} Legacy, quoted ${quoted.toJSON()}`);
    const ascended = after.stats.ascensions > s.stats.ascensions;
    if (ascended !== shipWouldAscend(s, mode)) v.push(`ship ${mode} ascended=${ascended}, predicted ${!ascended}`);
  }
  for (const p of s.products.active) {
    const quote = Big.of(retirePayout(s, p.id));
    const got = retireProduct(s, p.id).resources.money.sub(s.resources.money);
    if (!close(got, quote, s.resources.money)) v.push(`selling ${p.id} paid ${got.toJSON()}, quoted ${quote.toJSON()}`);
  }
  const u = balance.upgrades[Math.floor(r() * balance.upgrades.length)]!;
  const want = r() < 0.5 ? 10 : Infinity;
  const plan = planBulkUpgrade(s, u.id, want);
  const spent = s.resources[u.cost.resource].sub(buyUpgradeBulk(s, u.id, want).resources[u.cost.resource]);
  if (!close(spent, plan.totalCost, s.resources[u.cost.resource])) v.push(`bulk ${u.id} x${want} charged ${spent.toJSON()}, planned ${plan.totalCost.toJSON()}`);
  return v;
}

const STAT_KEYS = Object.keys(createInitialState().stats) as (keyof GameState["stats"])[];

/** Invariants over one transition `prev --name--> next`. */
function stepViolations(name: string, prev: GameState, next: GameState): string[] {
  const v: string[] = [];
  for (const k of STAT_KEYS) {
    const a = prev.stats[k]; const b = next.stats[k];
    // A Big → string → Big reload can shave the last float digit: allow that dust.
    const dropped = a instanceof Big ? (b as Big).lt(a.mul(1 - 1e-12)) : (b as number) < (a as number) * (1 - 1e-12);
    if (dropped) v.push(`stats.${k} dropped ${a instanceof Big ? a.toJSON() : a} -> ${b instanceof Big ? (b as Big).toJSON() : b}`);
  }
  const shipped = next.prestige.ships > prev.prestige.ships;
  if (!shipped && next.lifetimeMoney.lt(prev.lifetimeMoney.mul(1 - 1e-12))) {
    v.push(`lifetimeMoney dropped without a ship ${prev.lifetimeMoney.toJSON()} -> ${next.lifetimeMoney.toJSON()}`);
  }
  if (next.prestige.legacyWeights.lt(prev.prestige.legacyWeights.mul(1 - 1e-12))) v.push("legacyWeights dropped");
  if (name !== "legacyPerk" && legacyAvailable(next).lt(legacyAvailable(prev).mul(1 - 1e-12))) {
    v.push(`uninvested Legacy dropped outside an investment ${legacyAvailable(prev).toJSON()} -> ${legacyAvailable(next).toJSON()}`);
  }
  if (earnedReputation(next) + 1e-9 < earnedReputation(prev)) {
    v.push(`earned Reputation dropped ${earnedReputation(prev)} -> ${earnedReputation(next)}`);
  }
  if (next.reputation.spent < prev.reputation.spent) v.push("reputation.spent dropped");
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
  keeps("paradigms", prev.paradigms, next.paradigms);
  keeps("institute", prev.institute, next.institute);
  keeps("doctrines", prev.doctrines, next.doctrines);
  keeps("legacyInvestments", prev.legacyInvestments, next.legacyInvestments);
  if (!shipped) keeps("research", prev.research, next.research);
  if (next.facilityWings < prev.facilityWings) v.push("facilityWings dropped");
  if (next.repEndowment < prev.repEndowment) v.push("repEndowment dropped");
  if (next.megaprojects.level < prev.megaprojects.level) v.push("megaproject level dropped");
  if (next.instituteFellowships < prev.instituteFellowships) v.push("fellowships dropped");
  if (next.prestige.ships < prev.prestige.ships) v.push("ships dropped");
  if (next.products.sold < prev.products.sold) v.push("products.sold dropped");
  return v;
}

/** An engaged player for `secs` seconds: keep a run going, buy every affordable node
 *  and the cheapest affordable upgrades, one second at a time. Reaches the honest
 *  mid-game shapes (Auto-Train, compute-bound runs, passive money) that random taps
 *  on a topped-up lab rarely produce. */
function play(state: GameState, secs: number): GameState {
  let s = state;
  for (let t = 0; t < secs; t++) {
    s = tick(s, 1000);
    s = claimRun(s);
    s = startRun(s);
    for (const r of ALL_RESEARCH) if (!r.exclusiveGroup) s = buyResearchByHand(s, r.id);
    for (let k = 0; k < 8; k++) {
      let best: string | null = null;
      let bestCost: Big | null = null;
      for (const u of balance.upgrades) {
        if (u.cost.resource !== "money" || s.resources.money.lt(1)) continue;
        const next = buyUpgrade(s, u.id);
        if (next === s) continue;
        const cost = s.resources.money.sub(next.resources.money);
        if (!bestCost || cost.lt(bestCost)) { best = u.id; bestCost = cost; }
      }
      if (!best) break;
      s = buyUpgrade(s, best);
    }
  }
  return s;
}

function walker(seed: number) {
  const r = mulberry32(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  let prodN = 0;
  let empN = 0;
  const step = (s: GameState): [string, GameState] => {
    const prod = s.products.active.length ? pick(s.products.active) : null;
    const emp = s.employees.length ? pick(s.employees) : null;
    const acts: Array<[string, () => GameState]> = [
      ["tick", () => tick(s, 50 + r() * 20_000)],
      ["play", () => play(s, 5 + Math.floor(r() * 60))],
      ["tick", () => tick(s, 100)],
      ["bigTick", () => tick(s, 60_000 + r() * 3_600_000)],
      ["offline", () => applyOffline(s, r() * 60 * 3_600_000, r() < 0.5 ? balance.offline.maxHours : balance.offline.premiumMaxHours).state],
      ["startRun", () => startRun(s)],
      ["claimRun", () => claimRun(s)],
      ["upgrade", () => buyUpgrade(s, pick(balance.upgrades).id)],
      ["upgradeBulk", () => buyUpgradeBulk(s, pick(balance.upgrades).id, r() < 0.3 ? Infinity : 1 + Math.floor(r() * 10))],
      ["office", () => buyOfficePerk(s, pick(balance.office.perks).id)],
      ["research", () => buyResearchByHand(s, pick(ALL_RESEARCH).id)],
      ["allResearch", () => buyAllResearch(s)],
      ["focus", () => ({ ...s, computeFocus: Math.round(r() * 20) / 20 })],
      ["lobby", () => lobby(s)],
      ["daily", () => grantDailyBoost(s)],
      ["dataOffer", () => buyDataOffer(s, pick(balance.dataMarket).id, r()).state],
      ["work", () => (s.modifiers.length ? workProblem(s, pick(s.modifiers).id) : s)],
      ["worldChoice", () => applyWorldEventChoice(s, pick(balance.worldEvents.list).id, Math.floor(r() * 2)).state],
      ["worldEvent", () => maybeWorldEvent(s, 1e6, 0, r())?.state ?? s],
      ["heatEvent", () => maybeHeatEvent({ ...s, heat: Math.max(s.heat, 1) }, 1e6, 0, r())?.state ?? s],
      ["productEvent", () => maybeProductEvent(s, 1e6, 0, r(), r())?.state ?? s],
      ["regulator", () => {
        const hot = { ...s, suspicion: Math.min(100, s.suspicion + 40) };
        return negotiationDue(hot) ? applyNegotiationChoice(hot, Math.floor(r() * 3)) : s;
      }],
      ["release", () => releaseProduct(s, { type: pick(PRODUCTS.types).id, name: `P${prodN}`, id: `prod-${++prodN}` })],
      ["launch", () => (s.products.drafts.length
        ? launchDraft(s, { draftId: pick(s.products.drafts).id, type: pick(PRODUCTS.types).id, name: "D", id: `prod-${++prodN}` })
        : s)],
      ["push", () => (prod ? pushVersion(s, prod.id) : s)],
      ["productUpgrade", () => (prod ? startUpgrade(s, prod.id) : s)],
      ["price", () => (prod ? setProductPrice(s, prod.id, PRODUCTS.priceMin + r() * (PRODUCTS.priceMax - PRODUCTS.priceMin)) : s)],
      ["marketing", () => (prod ? setProductMarketing(s, prod.id, r() * 1e6) : s)],
      ["enterprise", () => (prod ? setEnterprise(s, prod.id, r() < 0.5) : s)],
      ["enterprisePrice", () => (prod ? setEnterprisePrice(s, prod.id, r() * 5) : s)],
      ["channelMix", () => (prod ? setChannelMix(s, prod.id, pick(PRODUCTS.channels).id, r() * 3) : s)],
      ["feature", () => (prod ? buyFeature(s, prod.id, pick(productFeatures).id) : s)],
      ["sell", () => (prod && r() < 0.3 ? retireProduct(s, prod.id) : s)],
      ["rename", () => (prod ? renameProduct(s, prod.id, `R${Math.floor(r() * 100)}`) : s)],
      ["flagship", () => setFlagship(s, prod && r() < 0.8 ? prod.id : null)],
      ["hire", () => addEmployee(s, {
        id: `emp-${++empN}`, name: "E", roleId: pick(balance.staff.roles).id, level: 1 + Math.floor(r() * 3),
        trait: r() < 0.3 ? null : pick(balance.staff.traits).id, assignedProductId: null, training: null,
      })],
      ["assign", () => (emp ? assignEmployee(s, emp.id, prod && r() < 0.6 ? prod.id : null) : s)],
      ["fire", () => (emp && r() < 0.2 ? fireEmployee(s, emp.id) : s)],
      ["train", () => (emp ? startTraining(s, emp.id) : s)],
      ["contract", () => claimContract(s, pick(CONTRACTS.pool).id)],
      ["sponsorRoll", () => rollSponsor(s, 19_000 + Math.floor(r() * 50))],
      ["sponsorClaim", () => claimSponsor(s)],
      ["preprint", () => buyPreprint(s)],
      ["charter", () => { const h = charterHand(s); return h.length ? setCharter(s, pick(h)) : s; }],
      ["lockCharter", () => lockCharter(s)],
      ["stance", () => declareStance(s, pick(["doomer", "accel", null] as const))],
      ["doctrine", () => claimDoctrine(s, pick(DOCTRINE.perks).id)],
      ["counter", () => counterRival(s, pick(MARKET.rivals).name)],
      ["stake", () => placeStake(s, pick(MARKET.rivals).name)],
      ["legacyPerk", () => buyLegacyPerk(s, pick(LEGACY.perks).id)],
      ["repWindfall", () => ({ ...s, stats: { ...s.stats, stakesRepEarned: s.stats.stakesRepEarned + 500 } })],
      ["repPerk", () => buyReputationPerk(s, pick(REPUTATION.perks).id)],
      ["endow", () => buyEndowment(s)],
      ["directive", () => pickEndowmentDirective(s, pick(REPUTATION.endowment.directives.defs).id)],
      ["respec", () => respecDirective(s, pick(REPUTATION.endowment.directives.defs).id)],
      ["wing", () => foundWing(s)],
      ["queueTrial", () => queueTrial(s, r() < 0.1 ? null : pick(TRIALS.list).id)],
      ["abandonTrial", () => (r() < 0.2 ? abandonTrial(s) : s)],
      ["paradigm", () => buyParadigm(s, pick(PARADIGMS.list).id)],
      ["institute", () => buyInstitute(s, pick(INSTITUTE.perks).id)],
      ["fellowship", () => endowFellowship(s)],
      ["challenge", () => fundChallenge(s, pick(CHALLENGES.list).id).state],
      ["fork", () => { const c = pick(CHALLENGES.list); return c.forks ? chooseFork(s, c.id, pick(c.forks).id) : s; }],
      ["megaproject", () => fundMegaproject(s).state],
      ["mandate", () => pickMandate(s, pick(CHALLENGES.megaproject.mandates.defs).id)],
      ["objective", () => claimObjective(s, pick(OBJECTIVES.pool).id, pick(["computeMult", "dataMult", "moneyMult"] as const))],
      ["automation", () => toggleAutomation(s, pick(AUTOMATION.list).id)],
      ["autopilots", () => applyAutomation(s)],
      ["buyPart", () => buyComponent(s, pick(COMPONENTS.catalog).id)],
      ["equipPart", () => {
        const tier = Math.floor(r() * SLOTS_BY_TIER.length);
        const slot = pick(SLOTS_BY_TIER[tier]!);
        const fits = COMPONENTS.catalog.filter((d) => d.class === slot);
        return fits.length ? equipComponent(s, tier, slot, r() < 0.2 ? null : pick(fits).id) : s;
      }],
      ["fusePart", () => fuseComponents(s, pick(COMPONENTS.catalog).id)],
      ["reload", () => deserialize(serialize(s))],
      ["inject", () => inject(s, 3 + Math.floor(r() * 40))],
      // The deep endgame: past a JS number's range (1.8e308), where every
      // Big → number conversion becomes Infinity.
      ["injectHuge", () => inject(s, 290 + Math.floor(r() * 120))],
      ["ship", () => prestige(buyAllResearch(inject(s, 12 + Math.floor(r() * 30))), pick(MODES))],
      ["shipAsIs", () => prestige(s, pick(MODES))],
    ];
    const [name, f] = pick(acts);
    return [name, f()];
  };
  return { r, step };
}

describe("invariant fuzz over real multi-generation play", () => {
  for (const seed of Array.from({ length: Number(process.env.FUZZ_SEEDS ?? 6) }, (_, i) => 11 + i)) {
    it(`seed ${seed}: every step keeps the game's invariants`, () => {
      const { r, step } = walker(seed);
      let s = createInitialState();
      const trail: string[] = [];
      const found: string[] = [];
      for (let i = 0; i < Number(process.env.FUZZ_STEPS ?? 450) && found.length < 40; i++) {
        const before = serialize(s);
        const [name, next] = step(s);
        // Every engine transition is pure: the input state is never mutated.
        if (serialize(s) !== before) found.push(`seed ${seed}, step ${i} (${name}): mutated its input state`);
        trail.push(name);
        const where = `seed ${seed}, step ${i} (${trail.slice(-5).join(", ")}), ship ${next.prestige.ships}`;
        for (const m of stateViolations(next)) found.push(`${where}: ${m}`);
        for (const m of stepViolations(name, s, next)) found.push(`${where}: ${m}`);
        // derive() purity: a reference-fresh copy derives exactly the same.
        if (deriveKey(next) !== deriveKey(deepCopy(next))) found.push(`${where}: derive() differs on an identical copy`);
        // load(save(s)) round-trips.
        const saved = serialize(next);
        const d = saveDiff(saved, serialize(deserialize(saved)));
        if (d) found.push(`${where}: save round trip:\n${d}`);
        // tick(a + b) ≈ tick(a) then tick(b).
        if (i % 4 === 0) for (const m of additivityViolations(next, r)) found.push(`${where}: ${m}`);
        // Quotes match outcomes.
        if (i % 10 === 0) for (const m of quoteViolations(next, r)) found.push(`${where}: ${m}`);
        s = next;
      }
      expect(found.slice(0, 40).join("\n")).toBe("");
    });
  }
});
