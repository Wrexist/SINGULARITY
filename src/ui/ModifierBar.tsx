import type { ActiveModifier } from "../engine/types";

/** A persistent (non-countdown) status chip, e.g. an active standing the player
 *  should keep in view — regulator scrutiny, an open commitment, etc. */
export interface StatusChip {
  key: string;
  label: string;
  tone: "good" | "bad" | "neutral";
}

/** Live chips for active world-event modifiers (counting down) plus any persistent
 *  status chips — a light always-visible status ticker. The row is ALWAYS rendered
 *  at a fixed height (chips scroll horizontally, never wrap) so chips appearing or
 *  expiring can never shift the layout below. */
export function ModifierBar({ modifiers, status = [] }: { modifiers: ActiveModifier[]; status?: StatusChip[] }) {
  // Display-dedupe by label+tone: a boost applied per-resource (e.g. the daily's
  // three ×1.5 mults) is ONE chip to the player, not three identical ones.
  const chips: ActiveModifier[] = [];
  const seen = new Map<string, ActiveModifier>();
  for (const m of modifiers) {
    const key = `${m.label}|${m.tone}`;
    const prior = seen.get(key);
    if (!prior) { seen.set(key, m); chips.push(m); }
    else if (m.remainingSec > prior.remainingSec) { chips[chips.indexOf(prior)] = m; seen.set(key, m); }
  }
  return (
    <div className="modbar" aria-label="Active effects">
      {status.map((s) => (
        <span key={s.key} className={`modchip ${s.tone}`}>{s.label}</span>
      ))}
      {chips.map((m) => (
        <span key={m.id} className={`modchip ${m.tone}`}>
          {m.label} <em>{Math.ceil(m.remainingSec)}s</em>
        </span>
      ))}
    </div>
  );
}
