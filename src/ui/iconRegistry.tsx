/**
 * Icon registry — resolves a string key from the balance data (automation autopilots,
 * Grand Challenges) to a real line-icon component. Keeps the pure balance files free of
 * JSX/emoji: they name an icon, the UI renders the high-quality SVG. Unknown keys fall
 * back to a neutral sparkle so a new entry never renders blank.
 */
import type { ReactNode } from "react";
import {
  TargetIcon, RocketIcon, TeamIcon, WrenchIcon, DocIcon,
  SunIcon, HelixIcon, ScrollIcon, ShieldIcon, NetworkIcon, InfinityIcon, SparkIcon,
} from "./Icons";

const REGISTRY: Record<string, (size: number) => ReactNode> = {
  // Automation autopilots
  target: (s) => <TargetIcon size={s} />,
  rocket: (s) => <RocketIcon size={s} />,
  hr: (s) => <TeamIcon size={s} />,
  wrench: (s) => <WrenchIcon size={s} />,
  doc: (s) => <DocIcon size={s} />,
  // Grand Challenges
  sun: (s) => <SunIcon size={s} />,
  helix: (s) => <HelixIcon size={s} />,
  scroll: (s) => <ScrollIcon size={s} />,
  shield: (s) => <ShieldIcon size={s} />,
  network: (s) => <NetworkIcon size={s} />,
  infinity: (s) => <InfinityIcon size={s} />,
};

export function iconFor(key: string, size = 18): ReactNode {
  return (REGISTRY[key] ?? ((s: number) => <SparkIcon size={s} />))(size);
}
