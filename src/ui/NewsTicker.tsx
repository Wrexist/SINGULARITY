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

/** A world event running on the wire instead of as a card (see App.tsx). */
export interface Breaking {
  key: number;
  text: string;
  tone: "good" | "bad";
}

/** How long a BREAKING line holds the wire before the feed resumes. */
const BREAKING_MS = 14000;

export function NewsTicker({ breaking = null }: { breaking?: Breaking | null }) {
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

  // A fresh BREAKING line takes the wire for a while, then the feed resumes. Keyed on
  // the event, so the same story never re-takes the wire after it has expired.
  const [liveKey, setLiveKey] = useState<number | null>(null);
  useEffect(() => {
    if (!breaking) return;
    setLiveKey(breaking.key);
    const t = window.setTimeout(() => setLiveKey((k) => (k === breaking.key ? null : k)), BREAKING_MS);
    return () => window.clearTimeout(t);
  }, [breaking?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = breaking && liveKey === breaking.key ? breaking : null;

  return (
    <div className={`news-ticker${live ? ` breaking ${live.tone}` : ""}`} aria-label="AI industry newswire" aria-live={live ? "polite" : undefined}>
      <span className="news-wire" aria-hidden="true">{live ? "◉ BREAKING" : "◉ WIRE"}</span>
      {live
        ? <span className="news-line" key={`b${live.key}`}>{live.text}</span>
        : <span className="news-line" key={`${sig}|${i}`}>{pool[i]}</span>}
    </div>
  );
}
