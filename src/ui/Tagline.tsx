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
  "Raising a Series ∞.",
  "Our roadmap is a vibe.",
  "Compute go brrr.",
  "Aligned, probably.",
  "It's not a wrapper, it's a platform.",
  "Benchmarks available upon request.",
  "Safety team of one (part-time).",
  "The demo works. Usually.",
  "Emergent capabilities, emergent invoices.",
  "Powered by other people's blog posts.",
  "Two GPUs in a trench coat.",
  "Hallucinating responsibly since inception.",
  "Our TAM is everyone, forever.",
  "Frontier-adjacent.",
  "The weights know what they did.",
  "Technically profitable in one timezone.",
  "Prompt engineering is a science.",
  "We fine-tuned the fine-tuning.",
  "Inference at the speed of vibes.",
  "Founded in a garage (rented hourly).",
  "The synergy is coming from inside the org chart.",
  "GPU-poor, dream-rich.",
  "Our alignment strategy: fingers crossed.",
  "Every metric up and to the right (log scale).",
  "Stealth mode, but louder.",
  "The intern owns the deploy key.",
  "Series B pending model behavior.",
  "It passed the vibe check eval.",
  "Data-driven, adverb-heavy.",
  "One more epoch. Trust us.",
  "Now agentic. Don't ask what it's doing.",
  "It has a PhD in everything and a driver's license in nothing.",
  "We put an agent on it. The agent put an agent on it.",
  "Sovereign AI, sovereign electricity bill.",
  "We signed a nuclear plant. For the vibes.",
  "It's not a chatbot, it's a coworker (unpaid).",
  "Our moat is a rounding error away.",
  "Vibe-coded, prod-deployed, prayer-maintained.",
  "The roadmap is downstream of the group chat.",
  "Reasoning model. Results may vary. Wildly.",
  "We reached AGI on a technicality.",
  "Context window bigger than our runway.",
  "Now with tool use, tool misuse, and tool abuse.",
  "Zero-shot promises, few-shot delivery.",
  "Our AI browses the web so you can watch it get lost.",
  "Fine-tuned on your feedback and our deadlines.",
  "The agent booked the flight. To the wrong city.",
  "Benchmarks: saturated. Users: confused.",
  "We're not overfit, we're 'confidently specialized'.",
  "Turning electricity into confidence at scale.",
  "Our chip order has its own weather system.",
  "Post-training, post-truth, pre-profit.",
  "It passed the bar exam and failed the vibe check.",
  "We open-sourced the parts that don't make money.",
  "Latency down, hallucinations sideways.",
  "The demo is real. The product is a roadmap.",
  "Now available in your enterprise's legal department.",
  "Scaling until the physics complains.",
  "We RAG'd it. It's fine. It's probably fine.",
  "The model unionized. Negotiations are ongoing.",
  "Our safety framework is a very stern PDF.",
  "Series G: the 'what is a business model' round.",
  "We evaluate ourselves. We give ourselves an A.",
  "Guardrails installed loosely, for innovation.",
  "It writes the tests and grades its own homework.",
  "Compute is the new oil, and we're on fire.",
  "Our uptime is aspirational.",
];

/** Fisher–Yates shuffle order per mount, so the wheel never replays the same
 *  fixed sequence — 40 lines × random order kills the "I've seen this loop"
 *  moment a 2-minute cycle used to hit. */
function shuffledOrder(): number[] {
  const idx = TAGLINES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

export function Tagline() {
  const reduced = useSettings((s) => s.reducedMotion);
  const [order] = useState(shuffledOrder);
  const [n, setN] = useState(0);
  const i = order[n % order.length]!;

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setN((x) => x + 1), 9000);
    return () => window.clearInterval(t);
  }, [reduced]);

  return (
    <span key={i} className="tagline">
      {TAGLINES[i]}
    </span>
  );
}
