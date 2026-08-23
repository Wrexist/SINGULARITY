import { useEffect, useMemo, useState } from "react";
import { useGame } from "../state/store";
import { useReducedMotion } from "./motion";
import { buildNews } from "../engine/news";
import { currentEra } from "../engine/eras";
import { playerMarketRank } from "../engine/market";

/**
 * The AI Industry Newswire — an ambient satirical ticker under the hall, so idle
 * time (between the ~2.5-min world events) has a world that keeps moving. Pure
 * flavor, zero gameplay effect. Reacts to the player: a few headlines reference your
 * lab's standing (see engine/news.ts buildNews). Perf-careful — it subscribes only
 * to a coarse signature, so it re-renders when your standing changes, not every tick.
 */
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function NewsTicker() {
  const reduced = useReducedMotion();
  // Coarse signature: era · ships · faction lean · market rank. The ticker only
  // reshuffles (and re-renders) when one of these changes — never on the 10Hz trickle.
  const sig = useGame((s) => {
    const g = s.game;
    const a = g.alignment >= 0.4 ? "a" : g.alignment <= -0.4 ? "d" : "n";
    return `${currentEra(g)}|${g.prestige.ships}|${a}|${playerMarketRank(g) ?? 0}`;
  });
  const pool = useMemo(() => shuffled(buildNews(useGame.getState().game)), [sig]);
  const [n, setN] = useState(0);
  const i = n % pool.length;

  useEffect(() => {
    if (reduced) return; // respect reduced motion — hold on one headline
    const t = window.setInterval(() => setN((x) => x + 1), 11000); // was 8.2s — calmer feed cadence
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <div className="news-ticker" aria-label="AI industry newswire">
      <span className="news-wire" aria-hidden="true">◉ WIRE</span>
      <span className="news-line" key={`${sig}|${i}`}>{pool[i]}</span>
    </div>
  );
}
