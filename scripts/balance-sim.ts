/**
 * Balance simulator (Step 0.11). Drives the REAL engine with a transparent
 * greedy auto-player and prints a progression timeline: when each upgrade /
 * research / automation first lands, time-to-first-prestige, the resource curve,
 * and the longest "wall" (gap with no purchase). This is how we tune the curve
 * with evidence instead of hand-guessing (GDD §11.3, LEARNINGS).
 *
 * Run: npx vite-node scripts/balance-sim.ts
 *
 * The policy is intentionally simple and documented so it's easy to reason about:
 *   1. Keep a training run going (auto once automations are bought).
 *   2. Buy automations as soon as affordable.
 *   3. Buy research in order as soon as affordable.
 *   4. Spend spare resources on the cheapest affordable production upgrade,
 *      while reserving enough compute to keep starting runs.
 * It approximates an engaged-but-not-frame-perfect player.
 */
import { createInitialState } from "../src/engine/state";
import { tick } from "../src/engine/tick";
import { derive } from "../src/engine/derive";
import {
  startRun,
  claimRun,
  buyUpgrade,
  canBuyUpgrade,
  upgradeCost,
  buyResearch,
  canBuyResearch,
  researchAvailable,
  buyDataOffer,
} from "../src/engine/actions";
import { canPrestige, legacyWeightsGain, prestige } from "../src/engine/prestige";
import { powerStats } from "../src/engine/power";
import { floorFull } from "../src/engine/hall";
import {
  releaseProduct, setProductMarketing, pushVersion, canPushVersion, productMetrics,
  launchDraft, canLaunchDraft,
} from "../src/engine/products";
import { currentEra } from "../src/engine/eras";
import { products as PRODUCTS, type ProductTypeId } from "../src/engine/balance/products";
import { Big } from "../src/engine/math/Big";
import { balance } from "../src/engine/balance/config";
import type { GameState } from "../src/engine/types";

const STEP_MS = 250; // simulation granularity
const MAX_MINUTES = 240; // give up after this much sim time
const MAX_MS = MAX_MINUTES * 60 * 1000;
const MAX_GENERATIONS = 3; // how many prestige generations to time

interface Event {
  atMs: number;
  label: string;
}

function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

/**
 * Analytical view of the Data Market — the cleanest way to judge the risk
 * premium without rolling dice. For each offer, expected Data and expected
 * cost (shady offers include the raid fine and the heat-scaled raid chance),
 * then Data-per-$. The Bazaar SHOULD beat legit on EV when cold, and the
 * advantage SHOULD erode as Heat climbs — that's the whole tension.
 */
function analyzeMarket(): void {
  console.log("\n=== DATA MARKET — expected value (data per $) ===");
  const heatLevels = [0, 50, 100];
  const ramp = (h: number) => (h / balance.heat.max) * balance.heat.raidScaleAtMax;
  console.log("  vendor / offer                         | clean d/$ | EV d/$ @heat 0/50/100");
  for (const o of balance.dataMarket) {
    const cleanRatio = o.data / o.cost;
    let evCol: string;
    if (!o.risk) {
      evCol = `${cleanRatio.toFixed(2)} (safe)`;
    } else {
      const r = o.risk;
      const evs = heatLevels.map((h) => {
        const raid = Math.min(r.raidChance + ramp(h), 1 - r.poisonChance);
        const poison = r.poisonChance;
        const clean = 1 - raid - poison;
        const evData = o.data * (clean + poison * r.poisonDataFactor + raid * r.raidDataFactor);
        const evCost = o.cost + raid * r.fine;
        return (evData / evCost).toFixed(2);
      });
      evCol = evs.join(" / ");
    }
    const name = `${o.vendor} — ${o.name}`.padEnd(38);
    console.log(`  ${name} | ${cleanRatio.toFixed(2).padStart(9)} | ${evCol}`);
  }
}

/**
 * When data is the ONLY thing blocking the next reachable research node, an
 * engaged player buys legit data to unblock it. Models the market's intended
 * role (a money→data accelerator) using only safe vendors (deterministic).
 */
function maybeBuyData(state: GameState): { state: GameState; bought: string[] } {
  let s = state;
  const bought: string[] = [];
  // Find a node whose requirements are met and whose compute cost is covered,
  // but which is blocked on data.
  const blocked = balance.research.find(
    (def) =>
      researchAvailable(s, def.id) &&
      s.resources.compute.gte(def.cost.compute) &&
      s.resources.data.lt(def.cost.data),
  );
  if (!blocked) return { state: s, bought };

  const legit = balance.dataMarket.filter((o) => !o.shady).sort((a, b) => a.cost - b.cost);
  let guard = 0;
  while (guard++ < 500 && s.resources.data.lt(blocked.cost.data)) {
    // Best data-per-$ legit offer we can afford while keeping a money reserve
    // (spend at most 60% of the bankroll on any single data buy).
    const spendCap = s.resources.money.mul(0.6);
    const affordable = legit
      .filter((o) => spendCap.gte(o.cost))
      .sort((a, b) => b.data / b.cost - a.data / a.cost)[0];
    if (!affordable) break;
    const { state: next } = buyDataOffer(s, affordable.id, 0.99); // clean (legit ignores roll)
    if (next === s) break;
    s = next;
    bought.push(`buy-data:${affordable.id}`);
  }
  return { state: s, bought };
}

function autoBuy(state: GameState, useMarket: boolean): { state: GameState; bought: string[] } {
  let s = state;
  const bought: string[] = [];

  // 1. If enabled, buy legit data to unblock a data-gated research node.
  if (useMarket) {
    const r = maybeBuyData(s);
    s = r.state;
    bought.push(...r.bought);
  }

  // 1b. If power is throttling Compute, buy the cheapest affordable capacity
  //     upgrade to clear it (a real player fixes a throttle before it bites).
  if (balance.power.enabled) {
    let guard = 0;
    while (guard++ < 50 && powerStats(s).throttled) {
      const cap = balance.upgrades
        .filter((d) => d.effect.kind === "powerCapacity" && canBuyUpgrade(s, d.id))
        .map((d) => ({ d, cost: upgradeCost(d, s.upgrades[d.id] ?? 0) }))
        .filter(({ cost }) => s.resources.money.gte(cost))
        .sort((a, b) => (a.cost.gt(b.cost) ? 1 : -1))[0];
      if (!cap) break;
      s = buyUpgrade(s, cap.d.id);
      bought.push(cap.d.id);
    }
  }

  // 2. Automations first (data-gated, huge QoL).
  for (const id of ["auto_claim", "auto_train"]) {
    if (canBuyUpgrade(s, id)) {
      s = buyUpgrade(s, id);
      bought.push(id);
    }
  }

  // 3. Research in defined order.
  for (const def of balance.research) {
    if (canBuyResearch(s, def.id)) {
      s = buyResearch(s, def.id);
      bought.push(`research:${def.id}`);
    }
  }

  // 4. Spend spare resources on the cheapest affordable production upgrade.
  //    Reserve enough compute to keep launching runs. Loop until nothing cheap.
  //    Hall expansions ARE included now: racks are floor-capped, so an engaged
  //    player buys floor space to unblock more racks once the room fills.
  let guard = 0;
  while (guard++ < 200) {
    // A reasonable player buys the BEST rack they can afford, not the cheapest —
    // wasting permanent floor slots on consumer cards is a rookie mistake. So
    // when several rack tiers are affordable, only consider the highest tier.
    const affordableRacks = balance.upgrades.filter(
      (d) => d.effect.kind === "computeFlat" && canBuyUpgrade(s, d.id),
    );
    const bestRackPerLevel = affordableRacks.reduce(
      (m, d) => Math.max(m, d.effect.kind === "computeFlat" ? d.effect.perLevel : 0),
      0,
    );
    const candidates = balance.upgrades
      .filter(
        (d) =>
          d.effect.kind !== "autoClaim" &&
          d.effect.kind !== "autoTrain",
      )
      .filter((d) => canBuyUpgrade(s, d.id))
      // Drop lower-tier racks when a better one is affordable.
      .filter((d) => d.effect.kind !== "computeFlat" || d.effect.perLevel >= bestRackPerLevel)
      // Only buy headroom when it's the ACTIVE constraint: power capacity when
      // throttled, hall expansions when the floor is full. Otherwise the sim
      // spends on spare capacity before it's needed and skews the baseline.
      .filter((d) => d.effect.kind !== "powerCapacity" || powerStats(s).throttled)
      .filter((d) => (d.effect.kind !== "floorCols" && d.effect.kind !== "floorRows") || floorFull(s))
      .map((d) => ({ d, cost: upgradeCost(d, s.upgrades[d.id] ?? 0) }))
      // Don't spend compute we need to run training; keep a buffer.
      .filter(({ d, cost }) => {
        if ((d.cost.resource as string) !== "compute") return true;
        return s.resources.compute.sub(cost).gte(balance.run.minCompute * 3);
      })
      .sort((a, b) => (a.cost.gt(b.cost) ? 1 : -1));

    const cheapest = candidates[0];
    if (!cheapest) break;
    // Affordability spend rule: only buy if it costs < 60% of the held resource,
    // so the player isn't perpetually broke (keeps the loop feeling fluid).
    const held = s.resources[cheapest.d.cost.resource];
    if (cheapest.cost.gt(held.mul(0.6))) break;
    s = buyUpgrade(s, cheapest.d.id);
    bought.push(cheapest.d.id);
  }

  return { state: s, bought };
}

function run(useMarket = false) {
  let state = createInitialState();
  const events: Event[] = [];
  const seen = new Set<string>();
  const samples: { min: number; compute: string; data: string; money: string; income: string }[] = [];

  let t = 0;
  let lastPurchaseAt = 0;
  let longestWall = 0;
  let prestigeAt: number | null = null;
  let genStartMs = 0;
  const generations: { gen: number; durationMs: number; weights: string }[] = [];

  const record = (label: string) => {
    if (!seen.has(label)) {
      seen.add(label);
      events.push({ atMs: t, label });
    }
  };

  while (t < MAX_MS) {
    state = tick(state, STEP_MS);

    // Manual loop assist: claim ready runs, start when idle (engine auto-* take
    // over once bought, but this covers the pre-automation phase).
    if (state.run.readyToClaim) state = claimRun(state);
    if (!state.run.active && !state.run.readyToClaim) {
      const started = startRun(state);
      if (started !== state) state = started;
    }

    const { state: afterBuy, bought } = autoBuy(state, useMarket);
    state = afterBuy;
    if (bought.length > 0) {
      // Only measure walls during the first generation (the learning run).
      if (generations.length === 0) {
        const gap = t - lastPurchaseAt;
        if (gap > longestWall) longestWall = gap;
        lastPurchaseAt = t;
      }
      for (const b of bought) record(b);
    }

    if (canPrestige(state)) {
      if (prestigeAt === null) {
        prestigeAt = t;
        record(`PRESTIGE (gain ${legacyWeightsGain(state).format()} weights)`);
      }
      // Meta-loop: time each generation, then ship and keep simulating.
      const totalWeights = state.prestige.legacyWeights.add(legacyWeightsGain(state));
      generations.push({
        gen: generations.length + 1,
        durationMs: t - genStartMs,
        weights: totalWeights.format(),
      });
      genStartMs = t;
      if (generations.length >= MAX_GENERATIONS) break;
      state = prestige(state);
    }

    // Sample once per simulated minute.
    if (t % 60000 === 0) {
      const d = derive(state);
      samples.push({
        min: t / 60000,
        compute: state.resources.compute.format(),
        data: state.resources.data.format(),
        money: state.resources.money.format(),
        income: d.computePerSec.format() + " c/s",
      });
    }

    t += STEP_MS;
  }

  // ---- Report ----
  console.log(`\n=== SINGULARITY INC — BALANCE SIM ${useMarket ? "(market player)" : "(baseline)"} ===`);
  console.log(`Policy: greedy engaged player${useMarket ? " + buys legit data when data-blocked" : ""}, ${STEP_MS}ms steps, cap ${MAX_MINUTES}m\n`);

  console.log("Milestone timeline:");
  for (const e of events) console.log(`  ${fmtClock(e.atMs).padStart(7)}  ${e.label}`);

  console.log("\nResource curve (per minute):");
  console.log("   min |   compute |     data |    money | income");
  for (const s of samples) {
    console.log(
      `  ${String(s.min).padStart(4)} | ${s.compute.padStart(9)} | ${s.data.padStart(8)} | ${s.money.padStart(8)} | ${s.income}`,
    );
  }

  console.log("\nMeta-loop (prestige generations — each should be faster):");
  for (const g of generations) {
    console.log(`  Gen ${g.gen}: ${fmtClock(g.durationMs).padStart(7)} to ship  (total weights after: ${g.weights})`);
  }

  console.log("\nSummary:");
  if (prestigeAt !== null) {
    console.log(`  First prestige at: ${fmtClock(prestigeAt)}`);
  } else {
    console.log(`  First prestige: NOT REACHED within ${MAX_MINUTES}m  <-- too slow`);
  }
  const allResearch = balance.research.every((r) => seen.has(`research:${r.id}`));
  console.log(`  All research before prestige: ${allResearch ? "yes" : "NO  <-- gate too cheap/early"}`);
  console.log(`  Longest wall (no purchase): ${fmtClock(longestWall)}`);
  console.log("");
}

run(false);
run(true);
analyzeMarket();

/**
 * R0.2 — LONG-HAUL sim. The baseline `run()` only times 3 lab-only generations;
 * this models the actual long game so we can SEE (not guess) the endgame the R4
 * work targets: the legacy-multiplier snowball (do generations collapse to
 * sub-minute ships?), the era cadence, the Compute/Data/Money decoupling, and
 * whether products are a real Compute/Data sink. Staff are individual employees
 * rolled in the store (RNG, not pure), so — like the baseline — they're out of
 * scope here; this drives the lab loop + the products business (launch deployed
 * drafts, push versions to catch the frontier).
 */
function autoBuyProducts(state: GameState): GameState {
  let s = state;
  // Commercialise any deployed draft into a free slot (deploy ships deposit one).
  for (const draft of [...s.products.drafts]) {
    if (canLaunchDraft(s, draft.id, "general")) {
      const next = launchDraft(s, { draftId: draft.id, type: "general", name: `Sim ${draft.id}`, id: `p_${draft.id}` });
      if (next !== s) s = next;
    }
  }
  // Keep each product near the frontier (the Compute/Data sink we want to weigh),
  // and run a light marketing budget capped by quality.
  for (const p of s.products.active) {
    if (canPushVersion(s, p.id)) s = pushVersion(s, p.id);
    const mktCap = Math.max(1, p.quality * PRODUCTS.marketingCapPerQuality * 0.3);
    s = setProductMarketing(s, p.id, mktCap);
  }
  return s;
}

function runLongHaul(maxGen = 20): void {
  let state = createInitialState();
  let t = 0;
  let genStartMs = 0;
  let lastWeights = 0;
  let seenEra = currentEra(state);
  const eraArrivals: { era: number; atMs: number }[] = [];
  const gens: {
    gen: number; durationMs: number; weights: number; legacyMult: number; era: number;
    perHr: number; ratioDC: number; ratioMC: number;
  }[] = [];

  while (t < MAX_MS && gens.length < maxGen) {
    state = tick(state, STEP_MS);
    if (state.run.readyToClaim) state = claimRun(state);
    if (!state.run.active && !state.run.readyToClaim) {
      const started = startRun(state);
      if (started !== state) state = started;
    }
    state = autoBuy(state, true).state;
    state = autoBuyProducts(state);

    const era = currentEra(state);
    if (era > seenEra) { eraArrivals.push({ era, atMs: t }); seenEra = era; }

    if (canPrestige(state)) {
      const total = state.prestige.legacyWeights.add(legacyWeightsGain(state));
      const totalN = Number(total.toNumber());
      const dur = t - genStartMs;
      const d = derive(state);
      const c = Math.max(1, d.computePerSec.toNumber());
      gens.push({
        gen: gens.length + 1,
        durationMs: dur,
        weights: totalN,
        legacyMult: d.legacyMult.toNumber(),
        era,
        perHr: dur > 0 ? ((totalN - lastWeights) / (dur / 3_600_000)) : 0,
        ratioDC: state.resources.data.toNumber() / c,
        ratioMC: state.resources.money.toNumber() / c,
      });
      lastWeights = totalN;
      genStartMs = t;
      state = prestige(state);
    }
    t += STEP_MS;
  }

  console.log("\n=== SINGULARITY INC — LONG-HAUL (lab + products, market on) ===");
  console.log(`Policy: greedy player + commercialise drafts + push versions. ${maxGen} gens or ${MAX_MINUTES}m cap.\n`);
  console.log("  gen | ship time | tot weights | legacyMult | era | weights/hr |  data/cmp |  $/cmp");
  for (const g of gens) {
    console.log(
      `  ${String(g.gen).padStart(3)} | ${fmtClock(g.durationMs).padStart(9)} | ` +
      `${g.weights.toExponential(2).padStart(11)} | ${("×" + g.legacyMult.toFixed(1)).padStart(10)} | ` +
      `${String(g.era).padStart(3)} | ${g.perHr.toExponential(1).padStart(10)} | ` +
      `${g.ratioDC.toExponential(1).padStart(9)} | ${g.ratioMC.toExponential(1).padStart(7)}`,
    );
  }

  console.log("\nEra arrivals:");
  if (eraArrivals.length === 0) console.log("  (no new era reached past the start era)");
  for (const e of eraArrivals) console.log(`  Era ${e.era} at ${fmtClock(e.atMs)}`);

  console.log("\nLong-haul summary:");
  const subMinute = gens.filter((g) => g.durationMs < 60_000).length;
  console.log(`  Generations simulated: ${gens.length}`);
  console.log(`  Sub-minute ships: ${subMinute}/${gens.length}  ${subMinute > gens.length / 2 ? "<-- meta-loop collapsing (R4.1 target)" : ""}`);
  if (gens.length > 1) {
    const first = gens[0]!, last = gens[gens.length - 1]!;
    console.log(`  Gen 1 ship ${fmtClock(first.durationMs)} -> Gen ${last.gen} ship ${fmtClock(last.durationMs)}`);
    console.log(`  data/compute ratio: ${first.ratioDC.toExponential(1)} -> ${last.ratioDC.toExponential(1)}  (rising = Data decoupling, R4.3)`);
    console.log(`  money/compute ratio: ${first.ratioMC.toExponential(1)} -> ${last.ratioMC.toExponential(1)}`);
  }
  console.log("");
}

runLongHaul(20);

/**
 * PHASE 3 — product economics check. Release one product, set a marketing budget,
 * push a version every 5 min (catch the frontier), and report subs/MRR/margin over
 * 30 min. Validates that high-ARPU types reward paid marketing (LTV:CAC > 1) and
 * become profitable, while low-ARPU types lean on virality.
 */
function runProduct(typeId: ProductTypeId, marketingPerSec: number, minutes = 30): void {
  let s = createInitialState();
  s.prestige.ships = 9; // unlock every product type for the scenario
  s.resources.compute = Big.of("1e12");
  s.resources.data = Big.of("1e12");
  s.resources.money = Big.of("1e9");
  s = releaseProduct(s, { type: typeId, name: "Sim", id: "s1" });
  s = setProductMarketing(s, "s1", marketingPerSec);

  console.log(`\n=== PRODUCT SIM: ${typeId} (marketing ≤${marketingPerSec}/s, gated by quality, +version/5m) ===`);
  console.log("  min |     subs |       MRR/s |    margin/s | competitiveness | mkt/s");
  let t = 0;
  const STEP = 1000;
  while (t < minutes * 60000) {
    // The marketing dial is capped by quality (game progress), so a weak early
    // model literally can't spend the late-game budget — mirror that here.
    const p0 = s.products.active[0]!;
    const mktCap = Math.max(1, p0.quality * PRODUCTS.marketingCapPerQuality);
    s = setProductMarketing(s, "s1", Math.min(marketingPerSec, mktCap));
    s = tick(s, STEP);
    if (t > 0 && t % 300000 === 0 && canPushVersion(s, "s1")) s = pushVersion(s, "s1");
    if (t % 60000 === 0) {
      const p = s.products.active[0]!;
      const m = productMetrics(p, s.products.frontier);
      console.log(
        `  ${String(t / 60000).padStart(3)} | ${String(Math.round(m.paid)).padStart(8)} | ` +
        `${m.mrr.toFixed(0).padStart(11)} | ${(m.margin >= 0 ? "+" : "") + m.margin.toFixed(0).padStart(10)} | ${String(Math.round(m.qf * 100) + "%").padStart(14)} | ${Math.round(p.marketingPerSec)}`,
      );
    }
    t += STEP;
  }
}

runProduct("code", 3000, 30);
runProduct("general", 800, 30);
runProduct("domain", 4000, 30);
