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
} from "../src/engine/actions";
import { canPrestige, legacyWeightsGain, prestige } from "../src/engine/prestige";
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

function autoBuy(state: GameState): { state: GameState; bought: string[] } {
  let s = state;
  const bought: string[] = [];

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
  let guard = 0;
  while (guard++ < 200) {
    const candidates = balance.upgrades
      .filter((d) => d.effect.kind !== "autoClaim" && d.effect.kind !== "autoTrain")
      .filter((d) => canBuyUpgrade(s, d.id))
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

function run() {
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

    const { state: afterBuy, bought } = autoBuy(state);
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
  console.log("\n=== SINGULARITY INC — BALANCE SIM ===");
  console.log(`Policy: greedy engaged player, ${STEP_MS}ms steps, cap ${MAX_MINUTES}m\n`);

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

run();
