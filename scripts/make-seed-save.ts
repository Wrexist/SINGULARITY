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
};

process.stdout.write(serialize(state));
