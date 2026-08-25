/**
 * Emit a deep save (as the app persists it) so UI smoke runs can drive the late-game
 * panels — HQ's boards, the Institute, Fellowships — instead of stopping at the
 * first-session screen a fresh save gives you.
 *
 * Run: npx vite-node scripts/make-seed-save.ts > /tmp/seed.json
 */
import { createInitialState } from "../src/engine/state";
import { serialize } from "../src/engine/save";
import { Big } from "../src/engine/math/Big";
import { balance } from "../src/engine/balance/config";
import { institute as INSTITUTE } from "../src/engine/balance/institute";
import type { GameState } from "../src/engine/types";

const base = createInitialState();

const state: GameState = {
  ...base,
  resources: { compute: Big.of(1e14), data: Big.of(1e14), money: Big.of(1e14) },
  lifetimeMoney: Big.of(1e16),
  // Own the whole research tree so Research/HQ are fully populated.
  research: balance.research.map((r) => r.id),
  upgrades: { ...base.upgrades, rack_basic: 30, rack_server: 12, rack_tpu: 6, auto_claim: 1, auto_train: 1 },
  prestige: { ...base.prestige, ships: 24, legacyWeights: Big.of(5000) },
  stats: { ...base.stats, totalShips: 24, ascensions: 14, playtimeSec: 400_000 },
  // Every Institute wing founded → Fellowships are visible, with Grants left to spend.
  institute: INSTITUTE.perks.map((p) => p.id),
  instituteFellowships: 2,
  computeFocus: 1,
  // A career behind the save, so GOALS -> Collection has an Archive to render. The
  // first two entries deliberately carry NO Archive fields — they stand in for the
  // generations shipped before save v35, which the board must render with an em dash
  // rather than a fabricated zero.
  shipLog: [
    { mode: "deploy", era: 1, asc: false },
    { mode: "sell", era: 2, asc: false },
    ...Array.from({ length: 22 }, (_, i) => {
      const gen = i + 3;
      return {
        mode: gen % 5 === 0 ? "open_source" : "deploy",
        era: Math.min(5, 2 + Math.floor(gen / 6)),
        asc: gen > 10,
        gen,
        legacyMag: 1.4 + gen * 0.16,
        peakComputeMag: 5 + gen * 0.42,
        research: Math.min(balance.research.length, 8 + gen),
        products: Math.min(9, 1 + Math.floor(gen / 3)),
        staff: Math.min(12, Math.floor(gen / 2)),
        ...(gen % 4 === 0 ? { charter: "moonshot" } : {}),
        ...(gen === 7 ? { trial: "trial_ablation" } : {}),
        atSec: 4000 + gen * 15_000,
      };
    }),
  ],
  // Mid-climb on one Trial ladder (rung I banked, rung II offered) and a perk held on
  // BOTH doctrine sides, so the seeded smoke actually walks the Schism track and the
  // ladder card instead of leaving both features unrendered.
  trialsDone: ["trial_ablation", "trial_lean"],
  doctrines: ["doc_trust", "doc_scale"],
};

process.stdout.write(serialize(state));
