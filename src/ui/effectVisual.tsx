/**
 * Maps an upgrade/research effect to a visual identity — a tinted icon chip — so
 * a list of buys reads at a glance ("blue = compute, green = money, violet =
 * automation") instead of a wall of identical cards. Pure presentational.
 */
import type { ReactNode } from "react";
import {
  ComputeIcon, DataIcon, MoneyIcon, BoltIcon, ServerIcon, ExpandIcon, RepeatIcon, GaugeIcon, SparkIcon,
} from "./Icons";

type Meta = { tint: string; icon: ReactNode };

const C = { compute: "#2f7bf6", data: "#9b51e0", money: "#16b364", speed: "#f97316", power: "#f5a623", floor: "#64748b", auto: "#7c5cff" };

/** Per effect-kind icon + tint. Shared by research and (non-rack) upgrades. */
function metaForKind(kind: string, sz = 19): Meta {
  switch (kind) {
    case "computeFlat": return { tint: C.compute, icon: <ComputeIcon size={sz} /> };
    case "computeMult": return { tint: C.compute, icon: <BoltIcon size={sz} /> };
    case "dataMult":
    case "dataPerSec": return { tint: C.data, icon: <DataIcon size={sz} /> };
    case "moneyMult": return { tint: C.money, icon: <MoneyIcon size={sz} /> };
    case "runSpeedMult": return { tint: C.speed, icon: <BoltIcon size={sz} /> };
    case "powerCapacity": return { tint: C.power, icon: <GaugeIcon size={sz} /> };
    case "floorCols":
    case "floorRows": return { tint: C.floor, icon: <ExpandIcon size={sz} /> };
    case "autoClaim":
    case "autoTrain": return { tint: C.auto, icon: <RepeatIcon size={sz} /> };
    default: return { tint: C.auto, icon: <SparkIcon size={sz} /> };
  }
}

/** A tinted rounded-square icon chip. */
function Chip({ meta, className = "card-ic" }: { meta: Meta; className?: string }) {
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
