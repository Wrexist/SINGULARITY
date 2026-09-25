import { describe, it, expect } from "vitest";
import { useGame, type Candidate } from "./store";
import { Big } from "../engine/math/Big";
import { createInitialState } from "../engine/state";
import { balance } from "../engine/balance/config";
import { derive, runYieldAt, computeBankReach, legacyMultiplier } from "../engine/derive";
import { ALL_RESEARCH, researchTree } from "../engine/researchTree";
import {
  canBuyUpgrade, upgradeCost, planBulkUpgrade, buyUpgradeBulk, canBuyOfficePerk, canBuyResearch,
  researchAvailable, researchCost, buyResearch, buyResearchByHand, canBuyDataOffer, canLobby, lobbyCost, isIncident,
} from "../engine/actions";
import { floorDrawnOut, totalRacks, RACK_IDS } from "../engine/hall";
import { powerStats } from "../engine/power";
import {
  componentsUnlocked, visibleCatalog, canBuyComponent, componentOnSale, freeCopies, canFuse, SLOTS_BY_TIER, buyComponent, equipComponent,
} from "../engine/components";
import { contractBoard, sponsorView } from "../engine/contracts";
import { canBuyPreprint, preprintCost, treeComplete } from "../engine/preprints";
import { canSetCharter, chartersUnlocked, charterHand, chartersBalance, setCharter } from "../engine/charter";
import { doctrineUnlocked, stanceOpen, committedSide, canClaimDoctrine, doctrinePerks, declareStance, type Stance } from "../engine/doctrine";
import { marketLeaderboard, canCounterRival, counterCost, canPlaceStake } from "../engine/market";
import { market as MKT } from "../engine/balance/market";
import { legacyTreeBalance, canBuyLegacyPerk, legacyAvailable, buyLegacyPerk } from "../engine/legacyTree";
import { rosterFull, hireCost, canTrain, trainCost, roleDef, addEmployee, assignEmployee } from "../engine/employees";
import {
  reputationBalance, canBuyReputationPerk, reputationAvailable, earnedReputation, endowmentUnlocked, canBuyEndowment, endowmentCost,
  canFoundWing, wingCost, directivePicksAvailable, canRespecDirective, directiveRespecCost, buyReputationPerk,
  buyEndowment, pickEndowmentDirective,
} from "../engine/reputation";
import { trialsBalance, canQueueTrial, ladderRung, trialLadders, queueTrial } from "../engine/trials";
import { products as PRODUCTS, productFeatures } from "../engine/balance/products";
import { paradigmsBalance, paradigmsUnlocked, canBuyParadigm, buyParadigm } from "../engine/paradigms";
import { instituteBalance, instituteUnlocked, canBuyInstitute, fellowshipsUnlocked, canEndowFellowship, grantsAvailable, fellowshipCost, buyInstitute } from "../engine/institute";
import {
  challengesUnlocked, visibleChallenges, challengeView, canFundChallenge, pendingForkChallenge, megaprojectUnlocked,
  megaprojectView, canFundMegaproject, mandatePicksAvailable, mandateDefs, mandateMods, fundChallenge, chooseFork, fundMegaproject,
} from "../engine/challenges";
import { objectiveBoard, objectivesUnlocked } from "../engine/objectives";
import { objectiveRewardOptions } from "../engine/balance/objectives";
import { automationList, automationUnlocked, automationUnlockedAny, automationEnabled } from "../engine/automation";
import {
  productsUnlocked, maxActiveProducts, canLaunchDraft, canStartUpgrade, versionCostFor, canBuyFeature, retirePayout,
  launchDraft, enterpriseUnlocked,
} from "../engine/products";
import { canPrestige, legacyWeightsForMode, nextRunMultiplier, prestige, type ShipMode } from "../engine/prestige";
import { labReveal } from "../engine/reveal";
import { achievementDefs } from "../engine/achievements";
import { contracts as CONTRACTS } from "../engine/balance/contracts";
import type { GameState } from "../engine/types";

/**
 * GUARD PARITY — every store action against the control that fires it.
 *
 * For each player action in src/state/store.ts this table names the control that
 * triggers it and mirrors, from the component, WHEN that control is drawn and whether
 * it is enabled (disabled / aria-disabled / a click guard) — each mirror names the
 * file it copies, and reads the same engine helper the component reads wherever it
 * reads one. Then, across a spread of realistic and edge labs (fresh, first run,
 * shippable, early and mid generations, a deep-endgame veteran; each also broke and
 * rich; charter windows open and locked; maxed stacks), it asserts:
 *
 *  - an ENABLED control really changes the game when tapped, and a DISABLED one is
 *    a no-op (the store never acts on a greyed-out button, and a live button never
 *    silently does nothing);
 *  - the engine guard (can*) agrees with the control, where the control computes its
 *    own condition instead of calling it;
 *  - what the control QUOTES is what happens: the price on a buy button is the amount
 *    charged, a payout label is the amount paid.
 *
 * A mismatch here is a button that lies. Fix it where the two disagree.
 */

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

const B = (x: number) => Big.of(x);
const RES = (s: GameState, c: Big, d: Big, m: Big): GameState => ({ ...s, resources: { compute: c, data: d, money: m } });
const broke = (s: GameState) => RES(s, Big.ZERO, Big.ZERO, Big.ZERO);
const rich = (s: GameState) => RES(s, B(1e300), B(1e300), B(1e300));

function inject(s: GameState, mag: number): GameState {
  const v = Big.of(10).pow(mag);
  return {
    ...s,
    resources: { compute: s.resources.compute.add(v), data: s.resources.data.add(v), money: s.resources.money.add(v) },
    lifetimeMoney: s.lifetimeMoney.add(v),
    stats: { ...s.stats, totalMoney: s.stats.totalMoney.add(v) },
  };
}

function buyAllResearch(s: GameState, filter: (id: string) => boolean = () => true): GameState {
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of ALL_RESEARCH) {
      if (!filter(r.id)) continue;
      const n = buyResearch(s, r.id);
      if (n !== s) { s = n; changed = true; }
    }
  }
  return s;
}

function buyRacks(s: GameState, n: number): GameState {
  return buyUpgradeBulk(s, "rack_basic", n);
}

let prodSeq = 0;
function launchAll(s: GameState): GameState {
  for (const d of [...s.products.drafts]) {
    if (!canLaunchDraft(s, d.id, "general")) break;
    s = launchDraft(s, { draftId: d.id, type: "general", name: `P${prodSeq}`, id: `fx-prod-${++prodSeq}` });
  }
  return s;
}

let empSeq = 0;
function hire(s: GameState, roleId: string, level = 1): GameState {
  return addEmployee(s, { id: `fx-emp-${++empSeq}`, name: `E ${empSeq}`, roleId, level, trait: null, assignedProductId: null, training: null });
}

/** A realistic multi-generation lab: ship `gens` times (deploy), launching drafts. */
function veteran(gens: number): GameState {
  let s = createInitialState();
  for (let g = 0; g < gens; g++) {
    s = inject(s, 12 + g);
    s = buyUpgradeBulk(s, "rack_basic", 20);
    s = buyAllResearch(s);
    s = prestige(s, "deploy");
    s = launchAll(s);
  }
  return s;
}

/** A deep-endgame lab: dozens of ships, ascensions, the Rep tree bought, the
 *  Institute and Paradigms open, every Grand Challenge done. */
function endgame(): GameState {
  let s = veteran(3);
  const ships = 60;
  s = {
    ...s,
    prestige: { legacyWeights: B(1e9), ships },
    stats: {
      ...s.stats, totalShips: ships, ascensions: 40, totalLegacy: B(1e9),
      peakComputePerSec: B(1e40), openSourceShips: 10,
    },
    achievements: achievementDefs.map((a) => a.id),
    contracts: { completed: CONTRACTS.pool.map((c) => c.id) },
  };
  s = inject(s, 60);
  for (let pass = 0; pass < 4; pass++) for (const p of reputationBalance.perks) s = buyReputationPerk(s, p.id);
  for (let pass = 0; pass < 4; pass++) for (const p of paradigmsBalance.list) s = buyParadigm(s, p.id);
  for (let pass = 0; pass < 4; pass++) for (const p of instituteBalance.perks) s = buyInstitute(s, p.id);
  for (const c of visibleChallenges(s)) {
    for (let i = 0; i < 8 && !s.challenges.completed.includes(c.id); i++) s = fundChallenge(inject(s, 80), c.id).state;
  }
  s = hire(s, "staff_ml");
  s = hire(s, "staff_engineer");
  return s;
}

/** A deep lab mid-way through its meta trees: Rep, Grants and Legacy to spend,
 *  some of each tree bought, a megaproject cycle to pick a mandate for, a
 *  directive to respec, forks chosen — with a bank sized so buys register. */
function endgamePartial(): GameState {
  let s = endgame();
  for (const c of visibleChallenges(s)) {
    const f = c.forks?.[0];
    if (f) s = chooseFork(s, c.id, f.id);
  }
  for (let i = 0; i < 2; i++) s = fundMegaproject(inject(s, 80)).state;
  for (let i = 0; i < 10; i++) s = buyEndowment(s);
  const dir = reputationBalance.endowment.directives.defs[0]!;
  s = pickEndowmentDirective(s, dir.id);
  // Hand back part of every tree so its buttons are live again.
  s = {
    ...s,
    reputation: { spent: 0, perks: s.reputation.perks },
    paradigms: s.paradigms.slice(0, 1),
    institute: s.institute.slice(0, 1),
    legacyInvestments: [],
    repEndowment: 20,
    endowmentDirectives: [dir.id],
    megaprojects: { ...s.megaprojects, mandates: [] },
  };
  s = buyLegacyPerk(s, legacyTreeBalance.perks[0]!.id);
  return RES(s, B(1e12), B(1e12), B(1e12));
}

/** Generation 5 with Safety declared and the window closed by a hand-bought node,
 *  so the Safety doctrine is claimable; a Trial is running and the next is queued. */
function doctrineReady(): GameState {
  let s = veteran(5);
  s = declareStance(s, "doomer");
  s = inject(s, 12);
  s = buyResearchByHand(s, ALL_RESEARCH[0]!.id);
  const ladder = trialsBalance.list.find((t) => t.unlockShips <= s.prestige.ships && !t.requires)!;
  s = { ...s, activeTrial: ladder.id };
  const other = trialsBalance.list.find((t) => t.id !== ladder.id && t.unlockShips <= s.prestige.ships && !t.requires)!;
  s = queueTrial(s, other.id);
  return RES(s, B(1e9), B(1e9), B(1e9));
}

/** Generation 3 with a charter adopted, Safety drifted past the line, one doctrine
 *  perk already held on each side. */
function charterAdopted(): GameState {
  let s = veteran(4);
  s = setCharter(s, charterHand(s)[0]!);
  s = { ...s, alignment: -0.2, doctrines: [] };
  return RES(s, B(1e6), B(1e6), B(1e6));
}

/** Auto-train running flat out on compute-bound runs, the next wave's Compute beyond
 *  the bank's reach: "save for this" territory. */
function walledResearch(): GameState {
  let s = inject(createInitialState(), 9);
  s = buyUpgradeBulk(s, "auto_train", 1);
  s = buyUpgradeBulk(s, "auto_claim", 1);
  s = buyUpgradeBulk(s, "batching", 12);
  let n = 0;
  for (const r of ALL_RESEARCH) {
    if (n >= 12) break;
    const x = buyResearch(s, r.id);
    if (x !== s) { s = x; n++; }
  }
  s = buyUpgradeBulk(s, "rack_basic", 12);
  return RES({ ...s, computeFocus: 1 }, B(10), B(1e9), B(1e3));
}

/** A shipped model waiting in Products with a slot free (some markets still locked),
 *  a Rig Bay with one part fitted and a spare, and a specialist posted to a product. */
function draftAndRig(): GameState {
  let s = veteran(2);
  s = buyAllResearch(inject(s, 16));
  s = prestige(s, "deploy");
  s = inject(s, 7);
  s = buyUpgradeBulk(s, "rack_basic", 4);
  s = buyUpgradeBulk(s, "rack_server", 2);
  s = buyComponent(buyComponent(s, "acc_refurb"), "acc_refurb");
  s = equipComponent(s, 0, "accelerator", "acc_refurb");
  s = hire(s, "staff_ml");
  const emp = s.employees[s.employees.length - 1]!;
  s = assignEmployee(s, emp.id, s.products.active[0]!.id);
  return RES(s, B(1e6), B(1e6), B(1e6));
}

/** A lab whose floor is packed: every slot holds a rack. `drawnOut` also buys the
 *  expansions up to the draw cap first, so the wing card is the next step. */
function fullFloor(drawnOut: boolean): GameState {
  let s = inject(createInitialState(), 14);
  s = buyAllResearch(s);
  if (drawnOut) for (const id of ["expand_s", "expand_e", "expand_s", "expand_e"]) s = buyUpgradeBulk(s, id, Infinity);
  s = buyUpgradeBulk(s, "rack_basic", 10_000);
  return RES(s, B(1e9), B(1e9), B(1e9));
}

interface Lab { name: string; game: GameState; candidates?: Candidate[] }

function labs(): Lab[] {
  const fresh = createInitialState();
  const firstRun: GameState = { ...buyRacks(inject(fresh, 3), 3), run: { active: false, progress: 0, readyToClaim: false } };
  const running: GameState = { ...firstRun, run: { active: true, progress: 0.4, readyToClaim: false, focus: 1 } };
  const ready: GameState = { ...firstRun, run: { active: false, progress: 1, readyToClaim: true, focus: 0.5 } };
  const midGen1 = buyAllResearch(buyRacks(inject(fresh, 7), 12), (id) => ALL_RESEARCH.findIndex((r) => r.id === id) < 8);
  const shippable = buyAllResearch(inject(buyRacks(inject(fresh, 14), 30), 14));
  const gen2 = veteran(1);
  const gen5 = veteran(5);
  const gen5Mid = buyAllResearch(inject(gen5, 16), (id) => ALL_RESEARCH.findIndex((r) => r.id === id) < 6);
  let gen5Staffed = hire(hire(gen5Mid, "staff_ml"), "staff_engineer", balance.staff.maxLevel);
  gen5Staffed = { ...gen5Staffed, employees: gen5Staffed.employees.map((e, i) => (i === 0 ? { ...e, training: { remainingSec: 30, totalSec: 60 } } : e)) };
  const late = endgame();
  const lateLocked = buyAllResearch(inject(late, 90));
  const packed = fullFloor(false);
  const drawn = fullFloor(true);
  const hot: GameState = { ...midGen1, heat: 80, suspicion: 30, modifiers: [
    { id: "outage", target: "computeMult", factor: 0.5, remainingSec: 40, label: "Outage", tone: "bad" },
    { id: "worked", target: "dataMult", factor: 0.7, remainingSec: 40, label: "Worked", tone: "bad", worked: true },
    { id: "buff", target: "moneyMult", factor: 1.5, remainingSec: 40, label: "Buff", tone: "good" },
  ] };
  const candidates: Candidate[] = [
    { name: "Ada L", roleId: "staff_engineer", trait: null },
    { name: "Bo M", roleId: "staff_ml", trait: "mentor", rare: true, level: 3 },
  ];
  const base: Lab[] = [
    { name: "fresh", game: fresh },
    { name: "first run", game: firstRun },
    { name: "run in flight", game: running },
    { name: "run ready", game: ready },
    { name: "mid gen 1", game: midGen1, candidates },
    { name: "shippable", game: shippable, candidates },
    { name: "gen 2 fresh", game: gen2, candidates },
    { name: "gen 5", game: gen5, candidates },
    { name: "gen 5 staffed", game: gen5Staffed, candidates },
    { name: "hot + incidents", game: hot },
    { name: "floor full", game: packed },
    { name: "floor drawn out", game: drawn },
    { name: "endgame", game: late, candidates },
    { name: "endgame, research done", game: lateLocked, candidates },
  ];
  base.push(
    { name: "endgame, trees half bought", game: endgamePartial(), candidates },
    { name: "gen 5, stance locked, trials queued", game: doctrineReady(), candidates },
    { name: "gen 4, charter adopted", game: charterAdopted() },
    { name: "research walled by auto-train", game: walledResearch() },
    { name: "draft waiting, rig fitted, crew posted", game: draftAndRig(), candidates },
    { name: "floor drawn out, Rep to spend", game: { ...drawn, prestige: { ...drawn.prestige, ships: 12 }, stats: { ...drawn.stats, totalShips: 40 }, achievements: achievementDefs.map((a) => a.id) } },
  );
  const out: Lab[] = [];
  for (const l of base) {
    out.push(l, { ...l, name: `${l.name} · broke`, game: broke(l.game) });
    if (l.name !== "fresh") out.push({ ...l, name: `${l.name} · rich`, game: rich(l.game) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Controls — one per rendered button, mirroring the component that draws it.
// ---------------------------------------------------------------------------

interface Control {
  /** Where the control lives and what it is. */
  name: string;
  /** Enabled in the UI (not disabled / aria-disabled, and the click guard passes). */
  enabled: boolean;
  /** The engine guard, when the component computes its own condition. */
  engine?: boolean;
  /** Tap it. */
  act: () => void;
  /** Its only effect is on the resource balances (a Data buy), which a huge bank
   *  can swallow below Big precision: no visible change is then correct. */
  resourceOnly?: boolean;
  /** What the control quotes vs what happened; a message on mismatch. */
  quote?: (before: GameState, after: GameState) => string | null;
}

const S = () => useGame.getState();
/** Equal within Big precision: a charge far below the balance it comes out of is dust. */
const near = (a: Big, b: Big, scale: Big = Big.ZERO) => a.sub(b).abs().lte(b.abs().mul(1e-9).add(scale.abs().mul(1e-12)).add(1e-9));
const dropped = (label: string, lane: "compute" | "data" | "money", quoted: Big) => (b: GameState, a: GameState) => {
  const got = b.resources[lane].sub(a.resources[lane]);
  return near(got, quoted, b.resources[lane]) ? null : `${label}: charged ${got.toJSON()} ${lane}, button quotes ${quoted.toJSON()}`;
};

function controls(g: GameState, candidates: Candidate[] | null): Control[] {
  const c: Control[] = [];
  const d = derive(g);
  const reveal = labReveal(g);

  // ---- TrainingDock.tsx ----
  if (g.run.readyToClaim) {
    const y = runYieldAt(g, d, g.run.focus);
    c.push({
      name: "Dock: Claim payout", enabled: true, act: () => S().doClaim(),
      quote: (b, a) => (near(a.resources.data.sub(b.resources.data), y.data, b.resources.data) && near(a.resources.money.sub(b.resources.money), y.money, b.resources.money)
        ? null : `claim paid ${a.resources.data.sub(b.resources.data).toJSON()} data, floated ${y.data.toJSON()}`),
    });
  } else {
    const canStart = !g.run.active && !g.run.readyToClaim && g.resources.compute.gte(d.runComputeCost);
    c.push({ name: "Dock: Start training run", enabled: canStart, act: () => S().doStartRun(), quote: dropped("start run", "compute", d.runComputeCost) });
  }
  if (d.autoTrain) {
    const v = g.computeFocus >= 0.5 ? 0.25 : 0.75;
    c.push({ name: "Dock: intensity slider", enabled: true, act: () => S().setComputeFocus(v) });
  }

  // ---- UpgradePanel.tsx (Build) ----
  const racks = totalRacks(g);
  const drawnOut = floorDrawnOut(g);
  const showExpansions = racks >= balance.hall.expansionRevealRacks;
  const isExpansion = (k: string) => k === "floorCols" || k === "floorRows";
  const power = powerStats(g);
  const showPower = balance.power.enabled && power.drawKw >= balance.power.revealAtDrawKw;
  const buildDefs = balance.upgrades
    .filter((def) => def.market !== "darkweb")
    .filter((def) => showExpansions || !isExpansion(def.effect.kind))
    .filter((def) => !drawnOut || !isExpansion(def.effect.kind))
    .filter((def) => showPower || def.effect.kind !== "powerCapacity");
  for (const def of buildDefs) {
    const owned = g.upgrades[def.id] ?? 0;
    const affordable = canBuyUpgrade(g, def.id);
    c.push({
      name: `Build ×1: ${def.id}`, enabled: affordable, act: () => S().doBuyUpgrade(def.id),
      quote: dropped(`buy ${def.id}`, def.cost.resource, upgradeCost(def, owned)),
    });
    for (const want of [10, Infinity]) {
      const plan = affordable ? planBulkUpgrade(g, def.id, want) : null;
      const showBulk = !!plan && plan.count > 1;
      const quoted = showBulk ? plan!.totalCost : upgradeCost(def, owned);
      c.push({
        name: `Build ×${want}: ${def.id}`, enabled: affordable, act: () => S().doBuyUpgradeBulk(def.id, want),
        quote: (b, a) => {
          const bought = (a.upgrades[def.id] ?? 0) - (b.upgrades[def.id] ?? 0);
          const expected = showBulk ? plan!.count : 1;
          if (bought !== expected) return `bulk ${def.id} ×${want} bought ${bought}, card says ×${expected}`;
          return dropped(`bulk ${def.id}`, def.cost.resource, quoted)(b, a);
        },
      });
    }
  }
  // Wing card (drawn once the floor is drawn out).
  if (drawnOut) c.push({ name: "Build: Found a wing", enabled: canFoundWing(g), act: () => S().doFoundWing(),
    quote: (b, a) => (a.reputation.spent - b.reputation.spent === wingCost(g) ? null : "wing charged a different Rep cost") });

  // ---- RigBayPanel.tsx ----
  if (componentsUnlocked(g)) {
    const catalog = visibleCatalog(g);
    const tiers = SLOTS_BY_TIER.map((_, t) => t).filter((t) => (g.upgrades[RACK_IDS[t]!] ?? 0) > 0);
    for (const tier of tiers) {
      for (const slot of SLOTS_BY_TIER[tier]!) {
        const current = g.components.loadout[tier]?.[slot] ?? null;
        if (current) c.push({ name: `Rig: remove t${tier} ${slot}`, enabled: true, act: () => S().doEquipComponent(tier, slot, null) });
        for (const def of catalog.filter((x) => x.class === slot)) {
          const isCurrent = current === def.id;
          const hasFree = freeCopies(g, def.id) > 0;
          const affordable = canBuyComponent(g, def.id);
          const inUse = !hasFree && (g.components.owned[def.id] ?? 0) > 0 && !componentOnSale(g, def.id);
          const action = isCurrent ? "equipped" : hasFree ? "equip" : affordable ? "buy" : inUse ? "inUse" : "poor";
          c.push({
            name: `Rig: t${tier} ${slot} ← ${def.id} (${action})`,
            enabled: action === "equip" || action === "buy",
            act: () => { if (action === "buy") S().doBuyComponent(def.id); S().doEquipComponent(tier, slot, def.id); },
            quote: (b, a) => {
              if (a.components.loadout[tier]?.[slot] !== def.id) return `tapping ${def.id} left t${tier} ${slot} = ${a.components.loadout[tier]?.[slot]}`;
              return action === "buy" ? dropped(`buy part ${def.id}`, "money", B(def.cost))(b, a) : null;
            },
          });
          if (canFuse(g, def.id) && def.fusesInto) c.push({ name: `Rig: fuse ${def.id}`, enabled: true, act: () => S().doFuseComponents(def.id) });
        }
      }
    }
  }

  // ---- CharterPanel.tsx ----
  if (chartersUnlocked(g)) {
    const editable = canSetCharter(g);
    if (editable) {
      for (const ch of chartersBalance.list.filter((x) => charterHand(g).includes(x.id) || x.id === g.charter)) {
        const on = g.charter === ch.id;
        c.push({ name: `Charter: ${on ? "drop" : "adopt"} ${ch.id}`, enabled: true, act: () => S().doSetCharter(on ? null : ch.id) });
      }
      if (g.charter) c.push({ name: "Charter: Lock in", enabled: true, act: () => S().doLockCharter() });
    }
    if (doctrineUnlocked(g) && stanceOpen(g)) {
      const side = committedSide(g);
      for (const id of ["doomer", null, "accel"] as Stance[]) {
        const on = id === null ? g.alignment === 0 : side === id;
        c.push({ name: `Stance: ${id ?? "center"}`, enabled: !on, act: () => { if (!on) S().doDeclareStance(id); } });
      }
    }
  }

  // ---- ResearchPanel.tsx ----
  if (reveal.research) {
    const bankReach = computeBankReach(g, d);
    const walled = (x: Big) => bankReach !== null && x.gt(bankReach);
    const visible = researchTree(g).filter((def) => g.research.includes(def.id) || researchAvailable(g, def.id)
      || def.requires.every((r) => g.research.includes(r) || researchAvailable(g, r)));
    for (const def of visible) {
      const owned = g.research.includes(def.id);
      const avail = researchAvailable(g, def.id);
      const canBuy = canBuyResearch(g, def.id);
      const rc = researchCost(g, def);
      const savable = !owned && avail && !canBuy && def.cost.compute > 0 && walled(rc.compute) && g.resources.data.gte(rc.data);
      c.push({
        name: `Research: ${def.id}${savable ? " (save for this)" : ""}`,
        enabled: canBuy || savable,
        act: () => { if (canBuy) S().doResearch(def.id); else if (savable) S().doSaveFor(def.id); },
        // A buy charges the quoted cost; a "save for this" tap pins the node and eases
        // the slider (the card then reads "banking for this").
        quote: canBuy
          ? (b, a) => dropped(`research ${def.id}`, "compute", rc.compute)(b, a) ?? dropped(`research ${def.id}`, "data", rc.data)(b, a)
          : (b, a) => (S().savingFor?.id === def.id && a.computeFocus < b.computeFocus ? null : `save-for ${def.id} did not pin and ease the slider`),
      });
    }
    if (treeComplete(g) && balance.preprints.enabled && g.preprints < balance.preprints.maxPerRun) {
      const pc = preprintCost(g);
      c.push({ name: "Research: publish preprint", enabled: canBuyPreprint(g), act: () => S().doBuyPreprint(),
        quote: (b, a) => dropped("preprint", "compute", pc.compute)(b, a) ?? dropped("preprint", "data", pc.data)(b, a) });
    }
  }

  // ---- ParadigmPanel.tsx ----
  if (paradigmsUnlocked(g)) {
    for (const p of paradigmsBalance.list) {
      const isOwned = g.paradigms.includes(p.id);
      c.push({ name: `Paradigm: ${p.id}`, enabled: !isOwned && canBuyParadigm(g, p.id), act: () => S().doBuyParadigm(p.id),
        quote: (b, a) => (reputationAvailable(b) - reputationAvailable(a) === p.cost ? null : `paradigm ${p.id} took a different Rep cost than ${p.cost}`) });
    }
  }

  // ---- DataMarketPanel.tsx ----
  if (reveal.market) {
    for (const o of balance.dataMarket) {
      c.push({
        name: `Market: ${o.id}`, enabled: canBuyDataOffer(g, o.id), resourceOnly: !o.risk, act: () => { S().doBuyData(o.id); },
        // A licensed batch is exactly what the card says: +data for the price.
        ...(o.risk ? {} : {
          quote: (b: GameState, a: GameState) => dropped(`offer ${o.id}`, "money", B(o.cost))(b, a)
            ?? (near(a.resources.data.sub(b.resources.data), B(o.data), b.resources.data) ? null : `offer ${o.id} delivered a different amount of data`),
        }),
      });
    }
    if (g.heat > balance.heat.lobby.minHeat) {
      c.push({ name: "Market: Lobby", enabled: canLobby(g), act: () => S().doLobby(), quote: dropped("lobby", "money", lobbyCost(g)) });
    }
    for (const def of balance.upgrades.filter((u) => u.market === "darkweb")) {
      c.push({ name: `Market tool: ${def.id}`, enabled: canBuyUpgrade(g, def.id), act: () => S().doBuyUpgrade(def.id),
        quote: dropped(`tool ${def.id}`, "money", upgradeCost(def, g.upgrades[def.id] ?? 0)) });
    }
  }

  // ---- PrestigePanel.tsx (+ ReputationModal.tsx) ----
  if (reveal.prestige) {
    const ready = canPrestige(g);
    if (ready) {
      for (const m of Object.values(balance.prestige.shipModes).filter((x) => g.prestige.ships >= x.unlockShips)) {
        const mode = m.id as ShipMode;
        const banked = legacyWeightsForMode(g, mode);
        const next = nextRunMultiplier(g, mode);
        c.push({
          name: `Ship: ${mode}`, enabled: true, act: () => S().doPrestige(mode),
          quote: (b, a) => {
            const got = a.prestige.legacyWeights.sub(b.prestige.legacyWeights);
            if (!near(got, banked, b.prestige.legacyWeights)) return `ship ${mode} banked ${got.toJSON()}, button quotes ${banked.toJSON()}`;
            const mult = legacyMultiplier(legacyAvailable(a));
            return near(mult, next) || a.activeTrial ? null : `ship ${mode} starts ×${mult.toJSON()}, button quotes ×${next.toJSON()}`;
          },
        });
      }
    }
    if (g.prestige.legacyWeights.gt(0) && legacyTreeBalance.enabled) {
      for (const p of legacyTreeBalance.perks) {
        const owned = g.legacyInvestments.includes(p.id);
        c.push({ name: `Legacy: ${p.id}`, enabled: !owned && canBuyLegacyPerk(g, p.id), act: () => S().doBuyLegacyPerk(p.id),
          quote: (b, a) => (near(legacyAvailable(b).sub(legacyAvailable(a)), B(p.cost), legacyAvailable(b)) ? null : `legacy ${p.id} took a different weight count`) });
      }
    }
    // ReputationModal.tsx
    for (const perk of reputationBalance.perks) {
      const got = g.reputation.perks.includes(perk.id);
      c.push({ name: `Rep perk: ${perk.id}`, enabled: !got && canBuyReputationPerk(g, perk.id), act: () => S().doBuyReputationPerk(perk.id),
        quote: (b, a) => (a.reputation.spent - b.reputation.spent === perk.cost ? null : `rep perk ${perk.id} charged a different cost`) });
    }
    if (endowmentUnlocked(g)) {
      const cost = endowmentCost(g);
      c.push({ name: "Rep: Endow the next level", enabled: canBuyEndowment(g), act: () => S().doBuyEndowment(),
        quote: (b, a) => (a.reputation.spent - b.reputation.spent === cost ? null : "endowment charged a different cost") });
      if (canRespecDirective(g)) {
        for (const id of [...new Set(g.endowmentDirectives)]) {
          const fee = directiveRespecCost(g);
          c.push({ name: `Rep: respec ${id}`, enabled: true, act: () => S().doRespecDirective(id),
            quote: (b, a) => (a.reputation.spent - b.reputation.spent === fee ? null : "respec charged a different fee") });
        }
      }
      if (directivePicksAvailable(g) > 0) {
        for (const dd of reputationBalance.endowment.directives.defs) c.push({ name: `Rep: directive ${dd.id}`, enabled: true, act: () => S().doPickDirective(dd.id) });
      }
    }
  }

  // ---- InstitutePanel.tsx (HQ) ----
  if (instituteUnlocked(g)) {
    for (const p of instituteBalance.perks) {
      const isOwned = g.institute.includes(p.id);
      c.push({ name: `Institute: ${p.id}`, enabled: !isOwned && canBuyInstitute(g, p.id), act: () => S().doBuyInstitute(p.id),
        quote: (b, a) => (grantsAvailable(b) - grantsAvailable(a) === p.cost ? null : `wing ${p.id} took a different grant count than ${p.cost}`) });
    }
    if (fellowshipsUnlocked(g)) {
      const cost = fellowshipCost(g);
      c.push({ name: "Institute: endow fellowship", enabled: canEndowFellowship(g), act: () => S().doEndowFellowship(),
        quote: (b, a) => (grantsAvailable(b) - grantsAvailable(a) === cost ? null : "fellowship took a different grant count") });
    }
  }

  // ---- AutomationPanel.tsx (HQ) ----
  if (automationUnlockedAny(g)) {
    for (const def of automationList()) {
      const on = automationUnlocked(g, def.id) && !!g.automation[def.id];
      c.push({ name: `Automation: ${def.id}`, enabled: automationUnlocked(g, def.id), act: () => S().doToggleAutomation(def.id),
        quote: (_b, a) => (automationEnabled(a, def.id) === !on ? null : `switch ${def.id} did not flip`) });
    }
  }

  // ---- GOALS: ObjectivesPanel.tsx ----
  if (objectivesUnlocked(g)) {
    for (const v of objectiveBoard(g)) {
      if (!v.ready) continue;
      for (const o of objectiveRewardOptions(v.def.reward)) {
        // The lane button's boost lands on that lane at the quoted strength.
        c.push({ name: `Objective: ${v.def.id} → ${o.target}`, enabled: true, act: () => S().doClaimObjective(v.def.id, o.target),
          quote: (_b, a) => {
            const m = a.modifiers.find((x) => x.id === `obj_${v.def.id}`);
            return m && m.target === o.target && m.factor === o.factor && m.remainingSec === o.durationSec ? null : `objective ${v.def.id} paid a different boost than ×${o.factor} ${o.target}`;
          } });
      }
    }
  }
  // ---- GOALS: ContractsPanel.tsx ----
  for (const v of contractBoard(g)) {
    c.push({ name: `Contract: ${v.def.id}`, enabled: v.ready, act: () => S().doClaimContract(v.def.id),
      quote: (b, a) => (earnedReputation(a) - earnedReputation(b) === v.def.rep ? null : `contract ${v.def.id} paid a different Rep than +${v.def.rep}`) });
  }
  const sp = sponsorView(g);
  if (sp) c.push({ name: "Contract: sponsor", enabled: sp.ready, act: () => S().doClaimSponsor(),
    quote: (b, a) => (earnedReputation(a) - earnedReputation(b) === sp.def.rep ? null : `sponsor paid a different Rep than +${sp.def.rep}`) });
  // ---- GOALS: GrandChallengesPanel.tsx ----
  if (challengesUnlocked(g)) {
    for (const def of visibleChallenges(g)) {
      const v = challengeView(g, def.id)!;
      if (!v.complete) c.push({ name: `Challenge: fund ${def.id}`, enabled: canFundChallenge(g, def.id), act: () => { S().doFundChallenge(def.id); } });
      if (pendingForkChallenge(g, def.id) && def.forks) {
        for (const f of def.forks) c.push({ name: `Challenge: fork ${def.id}/${f.id}`, enabled: true, act: () => S().doChooseFork(def.id, f.id) });
      }
    }
    if (megaprojectUnlocked(g)) {
      const mega = megaprojectView(g);
      if (!mega.maxed) c.push({ name: "Megaproject: fund", enabled: canFundMegaproject(g), act: () => { S().doFundMegaproject(); } });
      if (mandatePicksAvailable(g) > 0) {
        for (const md of mandateDefs()) {
          const lane = md.lane === "all" ? "compute" : md.lane;
          c.push({ name: `Mandate: ${md.id}`, enabled: true, act: () => S().doPickMandate(md.id),
            quote: (b, a) => (Math.abs(mandateMods(a)[lane].div(mandateMods(b)[lane]).toNumber() - (1 + md.value)) < 1e-9 ? null : `mandate ${md.id} is not ${md.desc}`) });
        }
      }
    }
  }
  // ---- GOALS: TrialsPanel.tsx ----
  if (trialsBalance.enabled && g.prestige.ships >= Math.min(...trialsBalance.list.map((t) => t.unlockShips))) {
    if (g.activeTrial) c.push({ name: "Trial: abandon", enabled: true, act: () => S().doAbandonTrial() });
    for (const ladder of trialLadders()) {
      const rungs = trialsBalance.list.filter((x) => x.ladder === ladder);
      const current = ladderRung(g, ladder);
      const t = current && g.activeTrial === current.id ? rungs.find((x) => x.requires === current.id) : current ?? rungs[rungs.length - 1]!;
      if (!t || g.activeTrial === t.id || g.trialsDone.includes(t.id)) continue;
      const queued = g.queuedTrial === t.id;
      // "Queued ✓ — Starts with your next run": the next Ship really starts it.
      c.push({ name: `Trial: next run ${t.id}`, enabled: canQueueTrial(g, t.id) || queued, act: () => S().doStartTrial(t.id),
        ...(queued ? {} : {
          quote: (_b: GameState, a: GameState) => {
            const shipped = prestige({ ...a, research: [...new Set([...a.research, balance.prestige.capabilityResearch])] }, "deploy");
            return shipped.activeTrial === t.id ? null : `queued ${t.id} but the Ship started ${shipped.activeTrial}`;
          },
        }) });
    }
  }
  // ---- GOALS: DoctrinePanel.tsx ----
  if (doctrineUnlocked(g)) {
    for (const p of doctrinePerks()) {
      const isOwned = g.doctrines.includes(p.id);
      c.push({ name: `Doctrine: ${p.id}`, enabled: !isOwned && canClaimDoctrine(g, p.id), act: () => S().doClaimDoctrine(p.id) });
    }
  }

  // ---- Products: ProductsPanel.tsx + ProductDetail.tsx ----
  if (productsUnlocked(g)) {
    const slotsFull = g.products.active.length >= maxActiveProducts(g);
    if (!slotsFull) {
      for (const dr of g.products.drafts) {
        for (const t of PRODUCTS.types) {
          c.push({ name: `Launch: ${dr.id} as ${t.id}`, enabled: canLaunchDraft(g, dr.id, t.id), act: () => { S().doLaunchDraft(dr.id, t.id, "Named"); } });
        }
      }
    }
    const board = marketLeaderboard(g);
    const myBest = board.find((b) => b.isYou)?.users ?? 0;
    for (const e of board) {
      const strikes = e.isYou ? 0 : (g.rivalOps.strikes[e.name] ?? 0);
      const targetable = !e.isYou && MKT.counterplay.enabled && g.products.active.length > 0 && e.users > myBest && strikes < MKT.counterplay.maxStrikesPerRival;
      if (targetable) {
        const ready = canCounterRival(g, e.name);
        const cost = counterCost(g, e.name);
        c.push({ name: `Rival: blitz ${e.name}`, enabled: ready, act: () => { S().doCounterRival(e.name); }, quote: dropped("blitz", "money", B(cost)) });
      }
      const stakeable = !e.isYou && g.rivalStake == null && g.products.active.length > 0 && e.users > myBest;
      if (stakeable) c.push({ name: `Rival: stake ${e.name}`, enabled: true, engine: canPlaceStake(g, e.name), act: () => S().doPlaceStake(e.name) });
    }
    for (const p of g.products.active) {
      if (!p.upgrade) {
        const vc = versionCostFor(g, p.version);
        c.push({
          name: `Product ${p.id}: research v${p.version + 1}`, enabled: canStartUpgrade(g, p.id), act: () => S().doStartUpgrade(p.id),
          quote: (b, a) => dropped("version", "compute", B(vc.compute * PRODUCTS.upgrade.upfrontFrac))(b, a) ?? dropped("version", "data", B(vc.data * PRODUCTS.upgrade.upfrontFrac))(b, a),
        });
      }
      if (PRODUCTS.flagship.enabled) {
        const isFlagship = g.flagship.productId === p.id;
        c.push({ name: `Product ${p.id}: flagship toggle`, enabled: true, act: () => S().doSetFlagship(isFlagship ? null : p.id) });
      }
      const payout = retirePayout(g, p.id);
      c.push({ name: `Product ${p.id}: sell`, enabled: true, act: () => S().doRetireProduct(p.id),
        quote: (b, a) => (near(a.resources.money.sub(b.resources.money), B(payout), b.resources.money) ? null : `sale paid a different amount than ${payout}`) });
      c.push({ name: `Product ${p.id}: price dial`, enabled: true, act: () => S().doSetProductPrice(p.id, p.priceMult === 1 ? 1.5 : 1) });
      if (enterpriseUnlocked(g)) c.push({ name: `Product ${p.id}: enterprise switch`, enabled: true, act: () => S().doSetEnterprise(p.id, !p.enterprise) });
      if (p.enterprise) c.push({ name: `Product ${p.id}: enterprise price`, enabled: true, act: () => S().doSetEnterprisePrice(p.id, p.enterprisePrice === 1 ? 1.5 : 1) });
      const mktCap = Math.max(1, Math.round(p.quality * PRODUCTS.marketingCapPerQuality));
      const budget = Math.min(p.marketingPerSec, mktCap) === mktCap ? 0 : mktCap;
      c.push({ name: `Product ${p.id}: marketing budget`, enabled: true, act: () => S().doSetProductMarketing(p.id, budget) });
      for (const ch of PRODUCTS.channels) {
        const w = Math.max(0, p.channelMix[ch.id] ?? 0);
        c.push({ name: `Product ${p.id}: channel ${ch.id}`, enabled: true, act: () => S().doSetChannelMix(p.id, ch.id, w >= 0.5 ? 0.25 : 0.75) });
      }
      for (const f of productFeatures) {
        if (p.features.includes(f.id)) continue;
        c.push({ name: `Product ${p.id}: feature ${f.id}`, enabled: canBuyFeature(g, p.id, f.id), act: () => S().doBuyFeature(p.id, f.id),
          quote: dropped(`feature ${f.id}`, "money", B(f.cost)) });
      }
      c.push({ name: `Product ${p.id}: rename`, enabled: true, act: () => S().doRenameProduct(p.id, `${p.name}X`) });
    }
  }

  // ---- Team: EmployeesPanel.tsx ----
  if (reveal.staff) {
    const full = rosterFull(g);
    if (candidates) {
      candidates.forEach((cand, i) => {
        const cost = hireCost(cand.roleId) * d.hireDiscount;
        const afford = g.resources.money.gte(cost);
        c.push({ name: `Team: hire candidate ${i}`, enabled: afford && !full, act: () => { S().doHireCandidate(i); }, quote: dropped("hire", "money", B(cost)) });
      });
    } else {
      c.push({ name: "Team: Recruit", enabled: !full, act: () => S().doRecruit() });
    }
    for (const e of g.employees) {
      if (!e.training) {
        c.push({ name: `Team: train ${e.id}`, enabled: canTrain(g, e.id), act: () => S().doTrainEmployee(e.id), quote: dropped("train", "money", B(trainCost(e))) });
      }
      c.push({ name: `Team: fire ${e.id}`, enabled: true, act: () => S().doFireEmployee(e.id) });
      if (roleDef(e.roleId)?.team === "product") {
        for (const p of g.products.active) if (e.assignedProductId !== p.id) c.push({ name: `Team: assign ${e.id} → ${p.id}`, enabled: true, act: () => S().doAssignEmployeeToProduct(e.id, p.id) });
        if (e.assignedProductId) c.push({ name: `Team: bench ${e.id}`, enabled: true, act: () => S().doAssignEmployeeToProduct(e.id, null) });
      }
    }
    if (balance.office.enabled) {
      for (const perk of balance.office.perks) {
        const owned = (g.upgrades[perk.id] ?? 0) > 0;
        c.push({ name: `Team: office perk ${perk.id}`, enabled: !owned && canBuyOfficePerk(g, perk.id), act: () => S().doBuyOfficePerk(perk.id),
          quote: dropped(`office ${perk.id}`, "money", B(perk.cost)) });
      }
    }
  }

  // ---- ModifierBar.tsx / HallCanvas.tsx: work an incident ----
  for (const m of g.modifiers) {
    c.push({ name: `Incident: work ${m.id}`, enabled: isIncident(m) && m.worked !== true, act: () => S().doWorkProblem(m.id) });
  }
  return c;
}

/** A stable text form of the game for "did the tap change anything?". */
const key = (g: GameState, candidates: Candidate[] | null = null) =>
  JSON.stringify({ g, candidates }, (_k, v) => (v instanceof Big ? `B:${v.toJSON()}` : v));
const huge = (g: GameState) => g.resources.compute.gt(1e15) || g.resources.data.gt(1e15) || g.resources.money.gt(1e15);

function reset(game: GameState, candidates: Candidate[] | null) {
  useGame.setState({ game, candidates, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
}

describe("guard parity — every control against the store action it fires", () => {
  const all = labs();

  it("builds a spread of labs that exercise the gates", () => {
    expect(all.length).toBeGreaterThan(30);
    const late = all.find((l) => l.name === "endgame")!.game;
    expect(megaprojectUnlocked(late)).toBe(true);
    expect(instituteUnlocked(late)).toBe(true);
    expect(endowmentUnlocked(late)).toBe(true);
    expect(canPrestige(all.find((l) => l.name === "shippable")!.game)).toBe(true);
    expect(floorDrawnOut(all.find((l) => l.name === "floor drawn out")!.game)).toBe(true);
  });

  it("reaches every control both live and greyed out somewhere in the spread", () => {
    // Each store action must be exercised ENABLED at least once (else the table
    // proves nothing about it), and the gated ones DISABLED at least once too.
    const on = new Set<string>();
    const off = new Set<string>();
    for (const lab of all) for (const ctl of controls(lab.game, lab.candidates ?? null)) (ctl.enabled ? on : off).add(ctl.name);
    const live = (re: RegExp) => [...on].some((n) => re.test(n));
    const grey = (re: RegExp) => [...off].some((n) => re.test(n));
    const both = [
      /^Dock: Start/, /^Build ×1: rack_/, /^Build ×10: /, /^Build ×Infinity: /, /^Build: Found a wing/,
      /^Research: [a-z_]+$/, /^Research: publish preprint/, /^Paradigm: /, /^Market: /, /^Market: Lobby/, /^Market tool: /,
      /^Legacy: /, /^Rep perk: /, /^Institute: inst_/, /^Challenge: fund /, /^Megaproject: fund/, /^Trial: next run /,
      /^Doctrine: /, /^Launch: /, /^Rival: blitz /, /^Product .*: research v/, /^Product .*: feature /, /^Team: hire /,
      /^Team: train /, /^Team: office perk /, /^Incident: work /, /^Contract: [a-z_]+$/, /^Stance: /,
    ];
    const liveOnly = [
      /^Dock: Claim/, /^Dock: intensity/, /^Rig: .*\(equip\)/, /^Rig: remove/, /^Research: .*\(save for this\)/, /^Charter: adopt/,
      /^Charter: drop/, /^Charter: Lock in/, /^Ship: deploy/, /^Ship: hard/, /^Ship: splash/, /^Rep: Endow/, /^Rep: respec/,
      /^Rep: directive/, /^Institute: endow fellowship/, /^Automation: /, /^Objective: /, /^Challenge: fork /, /^Mandate: /,
      /^Trial: abandon/, /^Rival: stake /, /^Product .*: (flagship|sell|price|enterprise|marketing|channel|rename)/,
      /^Team: Recruit/, /^Team: fire /, /^Team: assign /, /^Team: bench /,
    ];
    if (!live(/^Rig: .*\(buy\)/) || !grey(/^Rig: .*\(poor\)/)) throw new Error("Rig Bay buy never both live and poor");
    const missing = [
      ...both.filter((re) => !live(re) || !grey(re)).map((re) => `${re} live=${live(re)} greyed=${grey(re)}`),
      ...liveOnly.filter((re) => !live(re)).map((re) => `${re} never live`),
    ];
    expect(missing).toEqual([]);
  });

  for (const lab of all) {
    it(`${lab.name}: enabled controls act, disabled ones do nothing, quotes hold`, () => {
      const problems: string[] = [];
      const list = controls(lab.game, lab.candidates ?? null);
      for (const ctl of list) {
        if (ctl.engine !== undefined && ctl.engine !== ctl.enabled) {
          problems.push(`${ctl.name}: UI enabled=${ctl.enabled} but engine guard=${ctl.engine}`);
        }
        reset(lab.game, lab.candidates ?? null);
        const before = S().game;
        const k0 = key(before, S().candidates);
        ctl.act();
        const after = S().game;
        const changed = key(after, S().candidates) !== k0;
        if (ctl.enabled && !changed && !(ctl.resourceOnly && huge(before))) problems.push(`${ctl.name}: ENABLED but the tap changed nothing`);
        if (!ctl.enabled && changed) problems.push(`${ctl.name}: DISABLED but the tap changed the game`);
        if (ctl.enabled && changed && ctl.quote) {
          const msg = ctl.quote(before, after);
          if (msg) problems.push(`${ctl.name}: ${msg}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
