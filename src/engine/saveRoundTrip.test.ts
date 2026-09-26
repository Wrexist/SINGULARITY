import { describe, it } from "vitest";
import { Big } from "./math/Big";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { tick } from "./tick";
import { balance } from "./balance/config";
import { ALL_RESEARCH } from "./researchTree";
import {
  startRun, claimRun, buyUpgrade, buyUpgradeBulk, buyOfficePerk, buyResearch, lobby, grantDailyBoost, workProblem,
  buyDataOffer, applyWorldEventChoice,
} from "./actions";
import { prestige, type ShipMode } from "./prestige";
import {
  releaseProduct, launchDraft, pushVersion, startUpgrade, setProductPrice, setProductMarketing, setEnterprise,
  setEnterprisePrice, setChannelMix, buyFeature, retireProduct, renameProduct,
} from "./products";
import { addEmployee, assignEmployee, fireEmployee, startTraining } from "./employees";
import { claimContract, rollSponsor, claimSponsor } from "./contracts";
import { buyPreprint } from "./preprints";
import { setCharter, lockCharter, charterHand } from "./charter";
import { declareStance, claimDoctrine } from "./doctrine";
import { counterRival, placeStake } from "./market";
import { buyLegacyPerk } from "./legacyTree";
import { buyReputationPerk, buyEndowment, pickEndowmentDirective, respecDirective, foundWing } from "./reputation";
import { startTrial, abandonTrial } from "./trials";
import { setFlagship } from "./flagship";
import { buyParadigm } from "./paradigms";
import { buyInstitute, endowFellowship } from "./institute";
import { fundChallenge, chooseFork, fundMegaproject, pickMandate } from "./challenges";
import { claimObjective } from "./objectives";
import { toggleAutomation, applyAutomation } from "./automation";
import { buyComponent, equipComponent, fuseComponents } from "./components";
import { applyNegotiationChoice, negotiationDue } from "./negotiation";
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
 * Save round-trip fuzz over REAL play.
 *
 * A seeded walk drives the actual engine through dozens of generations — buying,
 * researching, shipping in every mode, Trials, charters, the Stance, staff (hired,
 * assigned, benched, trained, fired), products (launched, priced, marketed, upgraded,
 * sold, flagshipped), contracts and sponsors, Grand Challenges and their forks,
 * Megaprojects and Mandates, the Reputation tree down to the Endowment, Directives
 * and Wings, the Institute, Rig Bay parts, the regulator — and after every step asserts:
 *
 *  1. load(save(s)) saves back to the same thing: the loader keeps every field the
 *     running game actually produces (sanitizers only ever trim hostile input), and
 *  2. periodically, ticking the reloaded state matches ticking the live one, so
 *     nothing that drives the simulation lives outside the save.
 *
 * Resources are topped up between steps ("inject") so the walk reaches the deep
 * endgame in a few thousand steps; every state it visits is still one the engine's
 * own actions produced. Deterministic: a seeded PRNG, no wall clock.
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

/**
 * Where two serialized saves differ, ignoring what carries no meaning: key order, the
 * order of an id SET (the loader rebuilds some in definition order), an autopilot
 * stored as `false` vs absent, and float dust from a Big → string → Big trip.
 */
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
        walk(vx, vy, `${path}.${k}`);
      }
      return;
    }
    out.push(`${path}: ${JSON.stringify(x)?.slice(0, 240)} vs ${JSON.stringify(y)?.slice(0, 240)}`);
  };
  walk(JSON.parse(a), JSON.parse(b), "$");
  return out.length ? out.join("\n") : null;
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
      ["bigTick", () => tick(s, 60_000 + r() * 3_600_000)],
      ["startRun", () => startRun(s)],
      ["claimRun", () => claimRun(s)],
      ["upgrade", () => buyUpgrade(s, pick(balance.upgrades).id)],
      ["upgradeBulk", () => buyUpgradeBulk(s, pick(balance.upgrades).id, 1 + Math.floor(r() * 10))],
      ["office", () => buyOfficePerk(s, pick(balance.office.perks).id)],
      ["research", () => buyResearch(s, pick(ALL_RESEARCH).id)],
      ["allResearch", () => buyAllResearch(s)],
      ["focus", () => ({ ...s, computeFocus: Math.round(r() * 20) / 20 })],
      ["lobby", () => lobby(s)],
      ["daily", () => grantDailyBoost(s)],
      ["dataOffer", () => buyDataOffer(s, pick(balance.dataMarket).id, r()).state],
      ["work", () => (s.modifiers.length ? workProblem(s, pick(s.modifiers).id) : s)],
      ["worldEvent", () => applyWorldEventChoice(s, pick(balance.worldEvents.list).id, Math.floor(r() * 2)).state],
      // Chen only sits down when the negotiation is due (no truce pending), as in play.
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
      // A null placement is the hand-bench (sets `benched`, save v38).
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
      // Reputation earned from stakes won (a real stat) funds the deep Rep sinks.
      ["repWindfall", () => ({ ...s, stats: { ...s.stats, stakesRepEarned: s.stats.stakesRepEarned + 500 } })],
      ["repPerk", () => buyReputationPerk(s, pick(REPUTATION.perks).id)],
      ["endow", () => buyEndowment(s)],
      ["directive", () => pickEndowmentDirective(s, pick(REPUTATION.endowment.directives.defs).id)],
      ["respec", () => respecDirective(s, pick(REPUTATION.endowment.directives.defs).id)],
      ["wing", () => foundWing(s)],
      ["trial", () => startTrial(s, pick(TRIALS.list).id)],
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
      ["inject", () => inject(s, 3 + Math.floor(r() * 40))],
      ["ship", () => prestige(buyAllResearch(inject(s, 12 + Math.floor(r() * 30))), pick(MODES))],
    ];
    const [name, f] = pick(acts);
    return [name, f()];
  };
  return { r, step };
}

describe("save round-trip fuzz over real multi-generation play", () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}: every persisted field survives a reload, and the reload ticks the same`, () => {
      const { r, step } = walker(seed);
      let s = createInitialState();
      const trail: string[] = [];
      for (let i = 0; i < 1200; i++) {
        const [name, next] = step(s);
        trail.push(name);
        s = next;
        const saved = serialize(s);
        const reloaded = deserialize(saved);
        let d = saveDiff(saved, serialize(reloaded));
        if (!d && i % 10 === 0) {
          const dt = 100 + r() * 30_000;
          d = saveDiff(serialize(tick(s, dt)), serialize(tick(reloaded, dt)));
          if (d) d = `after a ${Math.round(dt)}ms tick:\n${d}`;
        }
        if (d) throw new Error(`seed ${seed}, step ${i} (…${trail.slice(-6).join(", ")}), ship ${s.prestige.ships}:\n${d}`);
      }
    });
  }
});
