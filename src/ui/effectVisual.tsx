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

const C = { compute: "#2f7bf6", data: "#9b51e0", money: "#16b364", speed: "#f97316", power: "#f5a623", floor: "#64748b", auto: "#7c5cff" };

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
    <span className="eff-pill" style={{ color: tint, background: `${tint}1a` }}>
      {effectLabel(effect)}
    </span>
  );
}

/** A tinted rounded-square icon chip. */
function Chip({ meta, className }: { meta: Meta; className: string }) {
  return (
    <span className={className} style={{ background: `${meta.tint}1f`, color: meta.tint }}>
      {meta.icon}
    </span>
  );
}

/** Upgrade chip — racks get a distinct "server" glyph; everything else by effect. */
export function UpgradeIcon({ id, kind }: { id: string; kind: string }) {
  const meta = id.startsWith("rack")
    ? { tint: C.compute, icon: <ServerIcon size={19} /> }
    : metaForKind(kind);
  return <Chip meta={meta} className="card-ic" />;
}

/** Research chip — by the node's effect. */
export function ResearchIcon({ kind }: { kind: string }) {
  return <Chip meta={metaForKind(kind)} className="node-ic" />;
}

/** Upgrade grouping — Hardware (racks/floor/power), Boosts (multipliers), Automation. */
export type UpGroup = "Hardware" | "Boosts" | "Automation";
export function upgradeGroup(id: string, kind: string): UpGroup {
  if (kind === "autoClaim" || kind === "autoTrain") return "Automation";
  if (id.startsWith("rack") || kind === "floorCols" || kind === "floorRows" || kind === "powerCapacity") return "Hardware";
  return "Boosts";
}
export const UP_GROUP_ORDER: UpGroup[] = ["Hardware", "Boosts", "Automation"];
