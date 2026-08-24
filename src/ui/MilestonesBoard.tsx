import type { GameState } from "../engine/types";
import { productMilestones } from "../engine/balance/products";
import { milestoneValue } from "../engine/products";
import { m$ } from "./format";


/**
 * Product Milestones — a chase ladder for growing and perfecting the portfolio,
 * persisted across prestige (a collection, like Achievements).
 *
 * Lived folded inside the Products tab, which made it the seventh place a player
 * had to check to answer "what should I do next?". It now sits beside the other
 * collection in GOALS; the Products tab keeps the products themselves.
 */
export function MilestonesBoard({ game }: { game: GameState }) {
  const done = new Set(game.products.milestones);
  return (
    <div className="prod-ms-grid">
      {productMilestones.map((mDef) => {
        const isDone = done.has(mDef.id);
        const val = milestoneValue(game, mDef.metric);
        const pct = Math.max(0, Math.min(1, val / mDef.threshold));
        return (
          <div className={`prod-ms ${isDone ? "done" : ""}`} key={mDef.id} title={mDef.desc}>
            <div className="prod-ms-top">
              <span className="prod-ms-name">{isDone ? "✓ " : ""}{mDef.label}</span>
              <span className="prod-ms-reward">+{m$(mDef.reward)}</span>
            </div>
            <div className="prod-ms-desc">{mDef.desc}</div>
            {!isDone && <div className="prod-bar prod-ms-bar"><div className="prod-bar-fill" style={{ width: `${pct * 100}%`, background: "var(--data)" }} /></div>}
          </div>
        );
      })}
    </div>
  );
}
