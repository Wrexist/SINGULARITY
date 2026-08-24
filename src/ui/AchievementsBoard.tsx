import { useMemo, useState } from "react";
import type { GameState } from "../engine/types";
import { achievementDefs, achievementProgress } from "../engine/achievements";
import type { AchCategory } from "../engine/balance/achievements";
import type { ReactNode } from "react";
import { BoltIcon, CoinIcon, TeamIcon, RocketIcon, TargetIcon, CheckIcon, LockIcon, HelpIcon } from "./Icons";

const CAT_META: Record<AchCategory, { label: string; icon: ReactNode; hue: number }> = {
  scale: { label: "Scale", icon: <BoltIcon size={16} />, hue: 265 },
  business: { label: "Business", icon: <CoinIcon size={16} />, hue: 150 },
  team: { label: "Team", icon: <TeamIcon size={16} />, hue: 200 },
  legacy: { label: "Legacy", icon: <RocketIcon size={16} />, hue: 28 },
  meta: { label: "Meta", icon: <TargetIcon size={16} />, hue: 330 },
};
const CATS = Object.keys(CAT_META) as AchCategory[];
type Filter = "all" | AchCategory;

// Secret achievements stay secret, but a wall of identical "Keep playing…" lines read
// as copy-paste. Vary the tease by a stable per-id hash so each masked card feels
// distinct without revealing its condition.
const SECRET_TEASES = [
  "Keep playing to discover this one.",
  "You'll know it when you trip over it.",
  "Not everything announces itself.",
  "Some milestones prefer to make an entrance.",
  "This one is earned, not explained.",
  "The lab keeps a few secrets.",
  "Do something worth writing down.",
  "Hidden — for now.",
];
const secretTease = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SECRET_TEASES[h % SECRET_TEASES.length]!;
};


/**
 * The Achievements collection — a cross-system badge wall with progress. Reads the
 * lifetime-stats store via achievementProgress; honest goals, no rewards to
 * chase-buy (the badge is the point). Secret ones stay masked until earned.
 *
 * Was a modal hung off the nav bar; now a board inside GOALS → Collection, so the
 * game's collections live with its other goals instead of behind their own door.
 */
export function AchievementsBoard({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<Filter>("all");
  const unlocked = useMemo(() => new Set(game.achievements), [game.achievements]);
  const total = achievementDefs.length;
  const earned = unlocked.size;

  const shown = filter === "all" ? achievementDefs : achievementDefs.filter((a) => a.cat === filter);

  return (
    <>
      <div className="ach-progress-track"><div className="ach-progress-fill" style={{ width: `${(earned / total) * 100}%` }} /></div>
      {earned === total && (
        <p className="panel-capstone">Every badge earned. HR has run out of trophies — take the rest of the singularity off.</p>
      )}

      <div className="pd-tabs ach-cats" role="tablist">
        <button className={`pd-tab ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All</button>
        {CATS.map((c) => (
          <button
            key={c}
            className={`pd-tab ${filter === c ? "on" : ""}`}
            onClick={() => setFilter(c)}
            aria-label={CAT_META[c].label}
            title={CAT_META[c].label}
          >
            {CAT_META[c].icon}
          </button>
        ))}
      </div>

      <div className="ach-grid">
        {shown.map((def) => {
          const got = unlocked.has(def.id);
          const masked = def.secret && !got;
          const pct = got ? 1 : achievementProgress(game, def);
          const hue = CAT_META[def.cat].hue;
          return (
            <div className={`ach-card ${got ? "got" : ""}`} key={def.id}>
              <span
                className="ach-badge"
                style={got ? { background: `hsl(${hue} 65% 90%)`, color: `hsl(${hue} 60% 35%)` } : undefined}
              >
                {got ? CAT_META[def.cat].icon : masked ? <HelpIcon size={16} /> : <LockIcon size={15} />}
              </span>
              <div className="ach-card-main">
                <div className="ach-name">{masked ? "Secret achievement" : def.label}</div>
                <div className="ach-desc">{masked ? secretTease(def.id) : def.desc}</div>
                {!got && !masked && (
                  <div className="ach-bar"><div className="ach-bar-fill" style={{ width: `${pct * 100}%`, background: `hsl(${hue} 60% 55%)` }} /></div>
                )}
              </div>
              {got && <span className="ach-check"><CheckIcon size={13} /></span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
