import { useEffect, useMemo, useState } from "react";
import type { GameState } from "../engine/types";
import { achievementDefs, achievementProgress } from "../engine/achievements";
import type { AchCategory } from "../engine/balance/achievements";
import { TrophyIcon } from "./Icons";

const CAT_META: Record<AchCategory, { label: string; icon: string; hue: number }> = {
  scale: { label: "Scale", icon: "⚡", hue: 265 },
  business: { label: "Business", icon: "💰", hue: 150 },
  team: { label: "Team", icon: "👥", hue: 200 },
  legacy: { label: "Legacy", icon: "🚀", hue: 28 },
  meta: { label: "Meta", icon: "🎯", hue: 330 },
};
const CATS = Object.keys(CAT_META) as AchCategory[];
type Filter = "all" | AchCategory;

/** Phase 3 — the Achievements collection: a cross-system badge wall with progress.
 *  Reads the lifetime-stats store via achievementProgress; honest goals, no rewards
 *  to chase-buy (the badge is the point). Secret ones stay masked until earned. */
export function AchievementsModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const unlocked = useMemo(() => new Set(game.achievements), [game.achievements]);
  const total = achievementDefs.length;
  const earned = unlocked.size;

  const shown = filter === "all" ? achievementDefs : achievementDefs.filter((a) => a.cat === filter);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ach-modal" role="dialog" aria-modal="true" aria-label="Achievements" onClick={(e) => e.stopPropagation()}>
        <div className="pd-head">
          <div>
            <h2 className="ach-title"><TrophyIcon size={20} /> Achievements</h2>
            <div className="ach-count">{earned} / {total} unlocked</div>
          </div>
          <button className="link-btn" onClick={onClose}>close</button>
        </div>

        <div className="ach-progress-track"><div className="ach-progress-fill" style={{ width: `${(earned / total) * 100}%` }} /></div>

        <div className="pd-tabs ach-cats" role="tablist">
          <button className={`pd-tab ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All</button>
          {CATS.map((c) => (
            <button key={c} className={`pd-tab ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>
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
                  {got ? CAT_META[def.cat].icon : masked ? "❓" : "🔒"}
                </span>
                <div className="ach-card-main">
                  <div className="ach-name">{masked ? "Secret achievement" : def.label}</div>
                  <div className="ach-desc">{masked ? "Keep playing to discover this one." : def.desc}</div>
                  {!got && !masked && (
                    <div className="ach-bar"><div className="ach-bar-fill" style={{ width: `${pct * 100}%`, background: `hsl(${hue} 60% 55%)` }} /></div>
                  )}
                </div>
                {got && <span className="ach-check">✓</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
