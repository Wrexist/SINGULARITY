import { balance } from "../engine/balance/config";
import { canBuyUpgrade, upgradeCost } from "../engine/actions";
import type { GameState } from "../engine/types";
import { currentEra } from "../engine/eras";
import { powerStats } from "../engine/power";
import { productMetrics } from "../engine/products";
import { products as PRODUCTS_BAL } from "../engine/balance/products";
import { componentsUnlocked, componentDef, SLOTS_BY_TIER } from "../engine/components";
import type { SlotClass } from "../engine/balance/components";
import { regulatorState, regulatorIsNamed } from "../engine/regulator";
import { marketLeaderboard } from "../engine/market";
import { charters } from "../engine/balance/charters";
import { RACK_IDS, hallDims, hallCapacity, hallRoomSplit, type Dir } from "../engine/hall";

export { hallDims, hallExpansion, type Dir } from "../engine/hall";

/**
 * The hall VIEW-MODEL: a pure description of what to draw, derived from game
 * state. The manifestation rule lives here: rack counts → boxes, and floor
 * expansions bought on each SIDE → a bigger room (grown in that direction) that
 * fits more of them. No canvas, no React, no engine mutation.
 */

export interface HallRack {
  /** 0 = consumer GPU, 1 = server GPU, 2 = TPU pod. */
  tier: number;
  /** 0..1 — how packed the room reads (height/glow). */
  density: number;
}

/** Bare Metal (Rig Bay manifestation): one entry per component bay on a tier's
 *  racks. grade 0 = an EMPTY open socket (the rack reads unfinished); 1..3 =
 *  standard/enterprise/prototype — the fitted part's visible flair. */
export interface RigSlotView {
  cls: SlotClass;
  grade: number;
}

/** Staff identity (IDEAS #7): each floor agent IS a real employee. index into
 *  game.employees matches (first 14), so a tap can open that person's card. */
export interface AgentView {
  name: string;
  role: string;
  team: "infra" | "product";
  trait: string | null;
  level: number;
  /** The 10× hire — gets a golden body + sparkle on the floor. */
  tenx: boolean;
  /** Index of the product beam this person is assigned to, or null (roams). */
  beam: number | null;
}

/** A buyable expansion affordance shown on one side of the floor. */
export interface SideMarker {
  dir: Dir;
  id: string;
  cost: number;
  maxed: boolean;
  affordable: boolean;
}

export interface HallModel {
  racks: HallRack[];
  /** Floor dimensions (grow with expansions). */
  cols: number;
  rows: number;
  /** Grid origin offset so growth is directional (west/north push into negatives). */
  gxMin: number;
  gyMin: number;
  sides: SideMarker[];
  active: boolean;
  /** The lab is "running the business": a training run OR live products earning.
   *  Keeps the hall visibly alive between manual runs once you have products. */
  busy: boolean;
  readyToClaim: boolean;
  progress: number;
  era: number;
  total: number;
  /** Interior partition lines (tile coords) that split the floor into rooms, or null. */
  splitGx: number | null;
  splitGy: number | null;
  /** Wall-mounted cooling units PER WALL — grows as you buy power/cooling gear so
   *  the manifestation rule holds (GDD §5: "upgrade cooling, fans spin"). */
  coolingUnits: number;
  /** 0..1 overclock intensity (from the Overclock Firmware upgrade). Drives a
   *  hotter rack glow so this software multiplier actually shows in the hall. */
  overclock: number;
  /** Auto-train owned → a little "ops bot" roams the floor (the automation, made
   *  visible). */
  autoBot: boolean;
  /** 0..1 data-pipeline intensity → denser/brighter drifting data-motes. */
  dataFlow: number;
  /** C2 — power draw ÷ capacity (>1 = throttled). Drives a thermal "heat shimmer"
   *  + red rim over the racks so the power soft-cap is legible in the room. */
  loadFrac: number;
  /** C2 — headcount → little agents working on the floor (staff made visible). */
  staff: number;
  /** C2 — one entry per live product: 0..1 beam intensity (revenue, normalised to the
   *  portfolio's top earner) → glowing "uplink beams" rising from the floor. */
  beams: number[];
  /** Per-product launch/viral "buzz" (0..1, = buzzSec / window). Drives a brief, brighter
   *  beam surge so a product going viral is FELT in the room. Refreshed per-frame in
   *  HallCanvas (buzzSec decays every tick), like heatCrates/skyline — index-aligned to `beams`. */
  beamBuzz: number[];
  /** C2 — faction alignment (−1 doomer … +1 accel) → a subtle room colour tint. */
  alignment: number;
  /** Bare Metal — per-tier component bays (index = rack tier), or null while the
   *  Rig Bay is still locked (pre-unlock racks draw with no bays at all, so the
   *  reveal moment is also a visual change in the room). */
  rigs: RigSlotView[][] | null;
  /** IDEAS #7 — the floor agents as real people (first 14 employees, in order). */
  agents: AgentView[];
  /** IDEAS #2 — Supervisor Chen patrols once scrutiny is a named, personal
   *  presence (regulator tier ≥ nameFromTier). Null = clean lab, no inspector. */
  regulator: { name: string; label: string; blurb: string } | null;
  /** IDEAS #3 — unmarked black crates by the entrance while regulatory Heat is
   *  up (0..6): the dark-web supply chain, physically lingering until you cool
   *  off. Refreshed per frame by HallCanvas (heat moves every tick), like
   *  marker affordability. */
  heatCrates: number;
  /** IDEAS #8 — the run's chosen charter, hung as a banner on the back wall. */
  charter: { id: string; name: string } | null;
  /** IDEAS #4 — rival datacenters on the horizon, tallest = market leader.
   *  Empty pre-first-ship (the market doesn't know you exist yet). */
  skyline: SkylineTower[];
  /** IDEAS #6 — the Legacy Wall: latest shipped generations as trophy plinths. */
  wall: { era: number; asc: boolean }[];
  /** IDEAS #5 — incident theater: each BAD timed modifier manifests on a
   *  deterministic rack (smoke + warn blink). Tapping it once "works the
   *  problem" (bounded time-shave); worked incidents keep smoking, smaller. */
  incidents: IncidentView[];
  /** IDEAS #5 — good-tone modifiers draw a small crowd of onlookers at the
   *  front lip (hype made visible). Count of extra figures, capped. */
  crowd: number;
}

export interface IncidentView {
  id: string;
  rackIndex: number;
  worked: boolean;
}

/** Small deterministic string hash (incident → rack placement). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** One horizon silhouette: h 0..1 (share of the market leader), dim = press-blitzed. */
export interface SkylineTower {
  h: number;
  dim: boolean;
  you: boolean;
}

/** The horizon race (IDEAS #4): rivals as datacenter silhouettes, your own tower
 *  rising among them. Pure; gated on having shipped (pre-ship the market UI is
 *  hidden too, so the room stays quiet until the race exists). */
export function buildSkyline(game: GameState): SkylineTower[] {
  if (game.prestige.ships === 0) return [];
  const board = marketLeaderboard(game);
  const max = board.reduce((m, e) => Math.max(m, e.users), 1);
  const rivals = board.filter((e) => !e.isYou);
  const you = board.filter((e) => e.isYou).reduce((m, e) => Math.max(m, e.users), 0);
  const towers: SkylineTower[] = rivals.map((r) => ({
    h: Math.max(0.15, r.users / max),
    dim: (game.rivalOps.strikes[r.name] ?? 0) > 0,
    you: false,
  }));
  if (you > 0) towers.splice(Math.floor(towers.length / 2), 0, { h: Math.max(0.12, you / max), dim: false, you: true });
  return towers;
}

/** Heat (0..100) → how many unmarked crates sit by the entrance. */
export function heatCrateCount(heat: number): number {
  return Math.max(0, Math.min(6, Math.floor(heat / 16)));
}

/** Power/cooling infrastructure ids (drive the visible wall units). Exported so
 *  HallCanvas's cache signature derives from the same source and never goes
 *  stale if a new powerCapacity upgrade is added. */
export const POWER_IDS = balance.upgrades.filter((u) => u.effect.kind === "powerCapacity").map((u) => u.id);

// Only the two OPEN sides are expandable — the back-left and back-right edges
// have walls (see drawRoom). So no north/west expansion.
const SIDE_DEFS: { dir: Dir; id: string }[] = [
  { dir: "s", id: "expand_s" },
  { dir: "e", id: "expand_e" },
];

const upgById = (id: string) => balance.upgrades.find((u) => u.id === id)!;

const GRADE_IDX: Record<string, number> = { standard: 1, enterprise: 2, prototype: 3 };

/** The per-tier bay view: which slots exist, what grade sits in each (0 = empty). */
function rigViews(game: GameState): RigSlotView[][] | null {
  if (!componentsUnlocked(game)) return null;
  return SLOTS_BY_TIER.map((slots, tier) =>
    slots.map((cls) => {
      const id = game.components.loadout[tier]?.[cls];
      const def = id ? componentDef(id) : undefined;
      return { cls, grade: def ? (GRADE_IDX[def.grade] ?? 1) : 0 };
    }),
  );
}

function sideMarkers(game: GameState): SideMarker[] {
  return SIDE_DEFS.map(({ dir, id }) => {
    const def = upgById(id);
    const lvl = game.upgrades[id] ?? 0;
    return {
      dir,
      id,
      cost: upgradeCost(def, lvl).toNumber(),
      maxed: lvl >= def.max,
      affordable: canBuyUpgrade(game, id),
    };
  });
}

export function buildHallModel(game: GameState): HallModel {
  const { cols, rows, gxMin, gyMin } = hallDims(game);
  const capacity = hallCapacity(game);
  const era = currentEra(game);

  // Cooling/power gear manifests as wall units (per wall). The cap is raised (C2) so
  // a serious facility's cooling visibly SCALES with investment instead of plateauing
  // at 3 — the wall layout spaces them evenly, so up to 6 still reads cleanly.
  const powerLevels = POWER_IDS.reduce((s, id) => s + (game.upgrades[id] ?? 0), 0);
  const coolingUnits = Math.min(6, (era >= 2 ? 1 : 0) + powerLevels);

  // Thermal load: rack power draw vs. capacity. >1 = throttled (the racks run hot).
  const power = powerStats(game);
  const loadFrac = power.capacityKw > 0 ? power.drawKw / power.capacityKw : 0;

  // Staff on the floor + product "uplink beams" sized by revenue (normalised to the
  // top earner so the biggest product is the tallest beam). Pure reads of state.
  const staff = game.employees.length;
  const roleById = new Map(balance.staff.roles.map((r) => [r.id, r]));
  const beamIndexByProduct = new Map(game.products.active.map((p, i) => [p.id, i]));
  const agents: AgentView[] = game.employees.slice(0, 14).map((e) => {
    const role = roleById.get(e.roleId);
    return {
      name: e.name,
      role: role?.name ?? e.roleId,
      team: role?.team ?? "infra",
      trait: e.trait,
      level: e.level,
      tenx: e.trait === "tenx",
      beam: e.assignedProductId !== null ? (beamIndexByProduct.get(e.assignedProductId) ?? null) : null,
    };
  });
  const reg = regulatorState(game);
  const mrrs = game.products.active.map((p) => Math.max(0, productMetrics(p, game.products.frontier).mrr));
  const maxMrr = mrrs.reduce((m, v) => Math.max(m, v), 0) || 1;
  const beams = mrrs.map((m) => Math.max(0.18, Math.min(1, m / maxMrr)));
  // Launch/viral "buzz" per product (0..1) — a bright, self-limiting beam surge so a
  // product going viral is felt in the room. Index-aligned to `beams`; refreshed
  // per-frame in HallCanvas since buzzSec decays every tick.
  const buzzWin = PRODUCTS_BAL.buzzDurationSec;
  const beamBuzz = game.products.active.map((p) => (buzzWin > 0 ? Math.max(0, Math.min(1, p.buzzSec / buzzWin)) : 0));

  // Manifest software upgrades that used to change only a number: overclock makes
  // racks visibly run hotter; auto-train puts a little ops bot on the floor; the data
  // pipeline thickens the drifting data-motes so a cleaner pipeline is FELT in the room.
  const overclock = Math.min(1, (game.upgrades["overclock"] ?? 0) * 0.1);
  const autoBot = (game.upgrades["auto_train"] ?? 0) > 0;
  const dataFlow = Math.min(1, (game.upgrades["data_pipeline"] ?? 0) * 0.12);

  const owned = RACK_IDS.map((id) => game.upgrades[id] ?? 0);
  const totalOwned = owned[0]! + owned[1]! + owned[2]!;
  const fits = totalOwned <= capacity;
  const density = totalOwned > 0 ? Math.max(0.45, Math.min(1, totalOwned / Math.max(1, capacity))) : 0;

  // Per-tier draw counts. When oversubscribed we downsample proportionally, but
  // flooring each tier independently can leave the floor under-filled (e.g.
  // owned [1,1,100], capacity 10 → [0,0,9]). Distribute the floored-away
  // remainder by largest fractional part so all `capacity` slots are used.
  const drawCounts = fits
    ? [...owned]
    : owned.map((count) => Math.floor((capacity * count) / totalOwned));
  if (!fits) {
    let leftover = capacity - drawCounts.reduce((sum, c) => sum + c, 0);
    const byFraction = owned
      .map((count, tier) => ({ tier, frac: (capacity * count) / totalOwned - drawCounts[tier]! }))
      .sort((a, b) => b.frac - a.frac);
    for (const { tier } of byFraction) {
      if (leftover <= 0) break;
      drawCounts[tier]! += 1;
      leftover--;
    }
  }

  const racks: HallRack[] = [];
  let remaining = capacity;
  for (let tier = 0; tier < drawCounts.length && remaining > 0; tier++) {
    const draw = Math.min(drawCounts[tier]!, remaining);
    for (let i = 0; i < draw; i++) racks.push({ tier, density });
    remaining -= draw;
  }

  return {
    racks,
    cols,
    rows,
    gxMin,
    gyMin,
    sides: sideMarkers(game),
    beamBuzz,
    active: game.run.active,
    busy: game.run.active || game.products.active.length > 0,
    readyToClaim: game.run.readyToClaim,
    progress: game.run.progress,
    era,
    total: racks.length,
    coolingUnits,
    overclock,
    autoBot,
    dataFlow,
    loadFrac,
    staff,
    beams,
    alignment: game.alignment,
    rigs: rigViews(game),
    agents,
    regulator: regulatorIsNamed(game) ? { name: reg.name, label: reg.label, blurb: reg.blurb } : null,
    heatCrates: heatCrateCount(game.heat),
    charter: (() => {
      const def = game.charter ? charters.list.find((c) => c.id === game.charter) : undefined;
      return def ? { id: def.id, name: def.name } : null;
    })(),
    skyline: buildSkyline(game),
    wall: game.shipLog.slice(-8).map((e) => ({ era: e.era, asc: e.asc })),
    incidents:
      racks.length > 0
        ? game.modifiers
            .filter((m) => m.tone === "bad" && m.remainingSec > 0)
            .map((m) => ({ id: m.id, rackIndex: hashStr(m.id) % racks.length, worked: m.worked === true }))
        : [],
    crowd: Math.min(6, game.modifiers.filter((m) => m.tone === "good" && m.remainingSec > 0).length * 2),
    ...hallRoomSplit(game),
  };
}
