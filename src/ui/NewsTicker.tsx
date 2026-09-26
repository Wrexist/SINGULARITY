import { memo, useEffect, useMemo, useState } from "react";
import { useGame } from "../state/store";
import { useReducedMotion } from "./motion";
import { buildNews, reactiveNews } from "../engine/news";

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

/** How long a BREAKING line holds the wire before the feed resumes (App clears it). */
export const BREAKING_MS = 14000;

function NewsTickerImpl({ breaking = null }: { breaking?: Breaking | null }) {
  const reduced = useReducedMotion();
  // Signature: the lines about the player's lab themselves. The ticker reshuffles (and
  // re-renders) only when one of them changes, never on the 10Hz trickle. A hand-picked
  // key (era · ships · lean · rank) missed Heat, headcount, the Endowment, preprints
  // and the product count, so those lines came late or outlived what they reported.
  const sig = useGame((s) => reactiveNews(s.game).join("\n"));
  const pool = useMemo(() => shuffled(buildNews(useGame.getState().game)), [sig]);
  const [n, setN] = useState(0);
  const i = n % pool.length;

  useEffect(() => {
    if (reduced) return; // respect reduced motion — hold on one headline
    const t = window.setInterval(() => setN((x) => x + 1), 11000); // was 8.2s — calmer feed cadence
    return () => window.clearInterval(t);
  }, [reduced]);

  // A BREAKING line holds the wire while App keeps it (it clears it after BREAKING_MS).
  const live = breaking;

  return (
    <div className={`news-ticker${live ? ` breaking ${live.tone}` : ""}`} aria-label="AI industry newswire" aria-live={live ? "polite" : undefined}>
      <span className="news-wire" aria-hidden="true">{live ? "◉ BREAKING" : "◉ WIRE"}</span>
      {live
        ? <span className="news-line" key={`b${live.key}`}>{live.text}</span>
        : <span className="news-line" key={`${sig}|${i}`}>{pool[i]}</span>}
    </div>
  );
}

/** Memoised: App re-renders at 10Hz, and this component's props are stable (it reads
 *  the store itself where it needs live state), so those renders were pure waste. */
export const NewsTicker = memo(NewsTickerImpl);
