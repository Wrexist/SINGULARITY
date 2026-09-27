/**
 * Trailer seeds: saves at each stage of a lab's life, built with the real engine so
 * every shot in the trailer is genuine game state (no mock-ups).
 *
 * Run: npx tsx scripts/trailer/seeds.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInitialState } from "../../src/engine/state";
import { serialize } from "../../src/engine/save";
import { Big } from "../../src/engine/math/Big";
import { balance } from "../../src/engine/balance/config";
import { launchDraft } from "../../src/engine/products";
import { addEmployee, assignEmployee } from "../../src/engine/employees";
import { tick } from "../../src/engine/tick";
import { canPrestige } from "../../src/engine/prestige";
import type { GameState, Employee } from "../../src/engine/types";

const out = process.argv[2] ?? "trailer-seeds";
mkdirSync(out, { recursive: true });

const base = (): GameState => createInitialState();
const allResearch = balance.research.map((r) => r.id);

function lab(p: {
  racks: [number, number, number];
  money: number;
  compute?: number;
  data?: number;
  research?: string[];
  ships?: number;
  legacy?: number;
  expand?: number;
  wings?: number;
  extra?: Partial<GameState>;
}): GameState {
  const s = base();
  const [a, b, c] = p.racks;
  s.upgrades = {
    ...s.upgrades,
    rack_basic: a, rack_server: b, rack_tpu: c,
    overclock: Math.min(20, Math.floor(a / 3)), data_pipeline: Math.min(20, Math.floor(a / 4)), monetize: Math.min(20, Math.floor(a / 4)),
    auto_claim: a > 3 ? 1 : 0, auto_train: a > 3 ? 1 : 0,
    ...(p.expand ? { expand_e: p.expand, expand_s: p.expand } : {}),
  };
  s.resources = { compute: Big.of(p.compute ?? p.money / 5), data: Big.of(p.data ?? p.money / 10), money: Big.of(p.money) };
  s.lifetimeMoney = Big.of(p.money * 4);
  s.stats = { ...s.stats, totalMoney: Big.of(p.money * 4), totalShips: p.ships ?? 0, playtimeSec: 3600 * (1 + (p.ships ?? 0)) };
  s.research = p.research ?? [];
  s.prestige = { ...s.prestige, ships: p.ships ?? 0, legacyWeights: Big.of(p.legacy ?? 0) };
  s.run = { ...s.run, active: true, progress: 0.35, readyToClaim: false };
  if (p.wings) (s as GameState & { facilityWings: number }).facilityWings = p.wings;
  return { ...s, ...(p.extra ?? {}) };
}

const seeds: Record<string, GameState> = {
  // A server closet: the first rack, the first run.
  closet: lab({ racks: [1, 0, 0], money: 60 }),
  // A garage lab a few minutes in.
  garage: lab({ racks: [9, 3, 0], money: 4.2e4, research: allResearch.slice(0, 3) }),
  // A real floor.
  floor: lab({ racks: [24, 12, 6], money: 3.5e6, research: allResearch.slice(0, 8), ships: 1, legacy: 40 }),
  // A full hall, leased out.
  hall: lab({ racks: [50, 30, 16], money: 1.25e7, research: allResearch.slice(0, 11), ships: 3, legacy: 240, expand: 3 }),
  // Planet-scale: every wing founded, the whole tree, a career behind it.
  campus: lab({ racks: [120, 110, 100], money: 1e15, research: allResearch, ships: 24, legacy: 5000, expand: 4, wings: 3 }),
};

/** A mid-career lab with a real product portfolio and crew, grown by the engine itself. */
function showcase(): GameState {
  let s = lab({ racks: [50, 40, 30], money: 4e9, research: allResearch.slice(0, 14), ships: 8, legacy: 900, expand: 4 });
  s.products = {
    ...s.products,
    drafts: [
      { id: "d1", quality: s.products.frontier, ships: 8 },
      { id: "d2", quality: s.products.frontier, ships: 8 },
      { id: "d3", quality: s.products.frontier, ships: 8 },
    ],
  };
  s = launchDraft(s, { draftId: "d1", type: "general", name: "Helix", id: "prod-1" });
  s = launchDraft(s, { draftId: "d2", type: "code", name: "Forge", id: "prod-2" });
  s = launchDraft(s, { draftId: "d3", type: "reasoning", name: "Oracle", id: "prod-3" });
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, marketingPerSec: 40, channelMix: { ads: 0.6, organic: 0.4 } })) } };
  const crew: Array<[string, string, string | null, number]> = [
    ["Ada Park", "staff_researcher", "tenx", 4], ["Ravi Menon", "staff_engineer", "workaholic", 3],
    ["Lena Ortiz", "staff_ml", "mentor", 3], ["Sam Okafor", "staff_ops", "steady", 2],
    ["Mia Chen", "staff_engineer", "steady", 2], ["Jonas Berg", "staff_researcher", "frugal", 1],
  ];
  crew.forEach(([name, roleId, trait, level], i) => {
    const e: Employee = { id: `emp-${i + 1}`, name, roleId, level, trait, assignedProductId: null, training: null };
    s = addEmployee(s, e);
  });
  s = assignEmployee(s, "emp-2", "prod-2");
  s = assignEmployee(s, "emp-5", "prod-1");
  // Play it: 40 minutes, keeping each product current with the frontier as a player
  // shipping versions would, then let the paying base settle with marketing off.
  for (let m = 0; m < 40; m++) {
    for (let i = 0; i < 60; i++) s = tick(s, 1000);
    s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, quality: Math.max(p.quality, s.products.frontier), version: 1 + Math.floor(m / 12) })) } };
  }
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, marketingPerSec: 0 })) } };
  for (let i = 0; i < 10 * 60; i++) s = tick(s, 1000);
  s = { ...s, products: { ...s.products, active: s.products.active.map((p) => ({ ...p, quality: s.products.frontier })) } };
  s.run = { ...s.run, active: true, progress: 0.4, readyToClaim: false };
  return s;
}
seeds.showcase = showcase();
// A ship-ready lab (the capability node and everything under it researched), for a
// real Ship and its celebration on camera.
{
  const s = lab({ racks: [50, 30, 16], money: 1.25e7, research: allResearch.slice(0, 24), ships: 3, legacy: 240, expand: 3 });
  if (!s.research.includes(balance.prestige.capabilityResearch)) s.research = [...s.research, balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(8e9);
  if (!canPrestige(s)) throw new Error("shipready seed cannot ship");
  seeds.shipready = s;
}
// The start of a fresh generation: the Charter hand and the Stance are open.
seeds.newgen = lab({ racks: [2, 0, 0], money: 5e3, ships: 9, legacy: 1400 });

for (const [name, s] of Object.entries(seeds)) writeFileSync(join(out, `${name}.json`), serialize(s));
console.log(`wrote ${Object.keys(seeds).join(", ")} to ${out}`);
