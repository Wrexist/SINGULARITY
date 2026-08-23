import { useEffect, useState } from "react";
import { useReducedMotion } from "./motion";
import { burst as fxBurst } from "./fx";

interface Props {
  name: string;
  typeName: string;
  onDone: () => void;
}

/** A short, randomized satirical launch blurb. Pure (no Date.now/Math.random in
 *  the engine — this is UI flavor only, so a render-time pick is fine). */
const BLURBS = [
  "is now in general availability. Analysts are calling it \"a product that exists.\"",
  "ships today. The roadmap is a vibe, but the launch is real.",
  "is live. Three competitors quietly updated their pitch decks.",
  "enters the market. Twitter has Opinions. The waitlist is, regrettably, gone.",
  "is GA. A VC has already asked if it's \"AI-native enough.\" It is.",
  "launches to a grateful and slightly confused public.",
  "is out. The changelog is one line; the celebration is company-wide.",
  "goes live. Somewhere, a competitor's roadmap just gained a Q3 item.",
  "ships. The demo worked on the third try, which counts.",
  "is available now. Pricing is \"contact us,\" which means it's expensive.",
  "launches. The landing page has a gradient, a waitlist, and a dream.",
  "is GA. Early adopters are already asking for the features you cut.",
  "ships today. Marketing called it revolutionary; engineering called it Tuesday.",
  "is live. The status page is green. Enjoy it while it lasts.",
  "enters general availability, along with a blog post nobody will finish reading.",
  "is out in the world. The API keys are flowing and the rate limits are lovingly cruel.",
  "ships. It does one thing well and three things eventually.",
  "is live. A 40-tweet thread explains why it matters. It has 12 likes.",
  "goes GA. The onboarding has exactly one too many steps, as tradition demands.",
  "is available. A competitor's spreadsheet just added a row with your name.",
  "ships to production — the only environment that has ever truly mattered.",
  "launches. The founders are \"humbled and excited,\" in that order, allegedly.",
  "is live. It's not for everyone — just everyone with a credit card and a use case.",
  "ships. The launch tweet has a typo. It will not be fixed. It is now folklore.",
];

export function ProductLaunch({ name, typeName, onDone }: Props) {
  const reducedMotion = useReducedMotion();
  // Stable per-mount pick without engine-forbidden randomness: hash the name.
  const blurb = BLURBS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % BLURBS.length]!;
  // A fast two-beat sequence — Deploying… (a sweep) → LIVE (the press release).
  // Reduced motion skips straight to the live state. Kept under a second so the
  // repeated mid-game launches never feel like a forced cinematic.
  const [live, setLive] = useState(reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
    const t = window.setTimeout(() => setLive(true), 850);
    return () => window.clearTimeout(t);
  }, [reducedMotion]);
  // The moment it flips live, a small ship-tinted bloom over the modal — the
  // "we just deployed something important" beat (fx.ts self-gates on reduce-motion).
  useEffect(() => {
    if (live && !reducedMotion) {
      fxBurst(window.innerWidth / 2, window.innerHeight * 0.38, { count: 20, power: 1.2, colors: ["#ff5a3c", "#ffd60a", "#16b364"] });
    }
  }, [live, reducedMotion]);
  return (
    <div className="modal-backdrop era-backdrop launch-moment" onClick={live ? onDone : undefined}>
      <div className="modal era-modal launch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker launch-kicker">{live ? "PRODUCT LAUNCH" : "DEPLOYING"}</div>
        <h2 className="era-title">{name}</h2>
        {live ? (
          <>
            <div className="era-press">
              <span className="era-press-tag">{typeName.toUpperCase()}</span>
              <p><b>{name}</b> {blurb}</p>
            </div>
            <button className="btn btn-primary" onClick={onDone}>
              Ship it
            </button>
          </>
        ) : (
          <div className="launch-sweep" role="progressbar" aria-label="Deploying">
            <div className="launch-sweep-fill" />
          </div>
        )}
      </div>
    </div>
  );
}
