/**
 * Visual identity for upgrade/research effects — a tinted icon chip + a short
 * effect pill — so a list of buys reads at a glance ("blue = compute, green =
 * money, violet = automation") instead of a wall of identical cards.
 *
 * Handles BOTH effect schemas: upgrades use additive `perLevel`, research uses
 * multiplicative `factor` (and `perSec` for passive money).
 */
import type { ReactNode } from "react";
import {
  ComputeIcon, DataIcon, MoneyIcon, BoltIcon, ServerIcon, ExpandIcon, RepeatIcon, GaugeIcon, SparkIcon,
} from "./Icons";

/** Loose shape covering both the upgrade and research effect unions. */
export type AnyEffect = { kind: string; perLevel?: number; factor?: number; perSec?: number };

type Meta = { tint: string; icon: ReactNode };

const C = { compute: "#2f7bf6", data: "#9b51e0", money: "#16b364", speed: "#f97316", power: "#f5a623", floor: "#64748b", auto: "var(--accent)" };

/** Per effect-kind icon + tint. Covers upgrade and research kind names. */
export function metaForKind(kind: string, sz = 19): Meta {
  switch (kind) {
    case "computeFlat": return { tint: C.compute, icon: <ComputeIcon size={sz} /> };
    case "computeMult": return { tint: C.compute, icon: <BoltIcon size={sz} /> };
    case "dataMult":
    case "dataPerSec": return { tint: C.data, icon: <DataIcon size={sz} /> };
    case "moneyMult":
    case "unlockPassiveMoney": return { tint: C.money, icon: <MoneyIcon size={sz} /> };
    case "runSpeedMult":
    case "runSpeed": return { tint: C.speed, icon: <BoltIcon size={sz} /> };
    case "powerCapacity": return { tint: C.power, icon: <GaugeIcon size={sz} /> };
    case "floorCols":
    case "floorRows": return { tint: C.floor, icon: <ExpandIcon size={sz} /> };
    case "autoClaim":
    case "autoTrain": return { tint: C.auto, icon: <RepeatIcon size={sz} /> };
    default: return { tint: C.auto, icon: <SparkIcon size={sz} /> };
  }
}

const pctp = (n: number) => `${Math.round(n * 100)}%`;

/** A concise, human effect label generated from the effect DATA (not the prose). */
export function effectLabel(e: AnyEffect): string {
  switch (e.kind) {
    case "computeFlat": return `+${e.perLevel} Compute/s`;
    case "dataPerSec": return `+${e.perLevel} Data/s`;
    case "computeMult": return e.factor != null ? `×${e.factor} Compute` : `+${pctp(e.perLevel ?? 0)} Compute`;
    case "dataMult": return e.factor != null ? `×${e.factor} Data` : `+${pctp(e.perLevel ?? 0)} Data`;
    case "moneyMult": return e.factor != null ? `×${e.factor} Money` : `+${pctp(e.perLevel ?? 0)} Money`;
    case "runSpeedMult": return `−${pctp(e.perLevel ?? 0)} run time`;
    case "runSpeed": return "Faster training";
    case "powerCapacity": return `+${e.perLevel} kW power`;
    case "floorCols":
    case "floorRows": return `+${e.perLevel} floor`;
    case "autoClaim": return "Auto-claims runs";
    case "autoTrain": return "Auto-runs the lab";
    case "unlockPassiveMoney": return `+$${e.perSec}/s passive`;
    default: return "Upgrade";
  }
}

/** A small filled pill showing the effect, tinted to its lane. */
export function EffectPill({ effect }: { effect: AnyEffect }) {
  const { tint } = metaForKind(effect.kind);
  return (
    <span className="eff-pill" style={{ color: tint, background: `color-mix(in srgb, ${tint} 10%, transparent)` }}>
      {effectLabel(effect)}
    </span>
  );
}

/** A tinted rounded-square icon chip. */
function Chip({ meta, className }: { meta: Meta; className: string }) {
  return (
    <span className={className} style={{ background: `color-mix(in srgb, ${meta.tint} 12%, transparent)`, color: meta.tint }}>
      {meta.icon}
    </span>
  );
}


/**
 * Research chip wrapped in a progress ring: the effect-tinted icon "charges up" (0→1)
 * as you close on affording the node — an at-a-glance, alive readout in the effect's
 * own colour. `pct` is clamped here. `showPct` renders a % badge for the hero focal
 * card (mirrors the reference "in production" ring). The conic fill interpolates via a
 * registered --pct custom property, so it eases smoothly between ticks.
 */
export function ResearchRingIcon({ kind, pct, showPct = false }: { kind: string; pct: number; showPct?: boolean }) {
  return <RingIcon meta={metaForKind(kind)} icClass="node-ic" pct={pct} showPct={showPct} />;
}

/**
 * Hardware/upgrade chip in the same progress ring as research — the Build tab reads as
 * alive and consistent with the Research tab. Racks keep their "server" glyph.
 */
/** The three rack tiers finally read as distinct hardware: basic=green, server=blue,
 *  TPU=violet (the same ramp the hall rack swatch uses). Any other rack falls back to
 *  compute-blue. Static tint only — identical with/without reduced motion. */
const RACK_TIER_TINT: Record<string, string> = { rack_basic: "rgb(52,210,126)", rack_server: "rgb(63,134,240)", rack_tpu: "rgb(155,81,224)" };
export function UpgradeRingIcon({ id, kind, pct, showPct = false }: { id: string; kind: string; pct: number; showPct?: boolean }) {
  const meta = id.startsWith("rack")
    ? { tint: RACK_TIER_TINT[id] ?? C.compute, icon: <ServerIcon size={19} /> }
    : metaForKind(kind);
  return <RingIcon meta={meta} icClass="card-ic" pct={pct} showPct={showPct} />;
}

/** Monochrome tier mark for a rack (★ / ★★ / ★★★), or "" for non-racks. */
export function rackTierMark(id: string): string {
  return id === "rack_basic" ? "★" : id === "rack_server" ? "★★" : id === "rack_tpu" ? "★★★" : "";
}

/** Shared ring wrapper: a conic --pct dial around a tinted icon chip, with an optional
 *  % badge for the hero focal card. `pct` is clamped here. */
function RingIcon({ meta, icClass, pct, showPct }: { meta: Meta; icClass: string; pct: number; showPct: boolean }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  return (
    <span className="icon-ring" style={{ ["--pct" as string]: p, ["--ring-color" as string]: meta.tint }}>
      <Chip meta={meta} className={icClass} />
      {showPct && (
        <span className="icon-ring-pct">{Math.round(p * 100)}<span className="icon-ring-pct-sign">%</span></span>
      )}
    </span>
  );
}

/** Upgrade grouping — Hardware (racks/floor/power), Boosts (multipliers), Automation. */
export type UpGroup = "Hardware" | "Boosts" | "Automation";
export function upgradeGroup(id: string, kind: string): UpGroup {
  if (kind === "autoClaim" || kind === "autoTrain") return "Automation";
  if (id.startsWith("rack") || kind === "floorCols" || kind === "floorRows" || kind === "powerCapacity") return "Hardware";
  return "Boosts";
}
export const UP_GROUP_ORDER: UpGroup[] = ["Hardware", "Boosts", "Automation"];
