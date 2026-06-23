import { useEffect, useState } from "react";
import { useSettings } from "./settings";

// The satirical voice (design spine §5) — pure flavor, zero gameplay effect.
const TAGLINES = [
  "Definitely not a bubble.",
  "Now with 40% more synergy.",
  "Move fast and break inference.",
  "Pre-revenue, post-hype.",
  "We achieved AGI (internally).",
  "Scaling laws are a lifestyle.",
  "Your data is our passion.",
  "Disrupting disruption.",
  "Ethically sourced gradients.",
  "The model is the moat.",
];

export function Tagline() {
  const reduced = useSettings((s) => s.reducedMotion);
  const [i, setI] = useState(() => Math.floor(Math.random() * TAGLINES.length));

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % TAGLINES.length), 9000);
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <span key={i} className="tagline">
      {TAGLINES[i]}
    </span>
  );
}
