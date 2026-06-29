import type { ActiveModifier } from "../engine/types";

/** A persistent (non-countdown) status chip, e.g. an active standing the player
 *  should keep in view — regulator scrutiny, an open commitment, etc. */
export interface StatusChip {
  key: string;
  label: string;
  tone: "good" | "bad" | "neutral";
}

/** Live chips for active world-event modifiers (counting down) plus any persistent
 *  status chips — a light always-visible status ticker. */
export function ModifierBar({ modifiers, status = [] }: { modifiers: ActiveModifier[]; status?: StatusChip[] }) {
  if (modifiers.length === 0 && status.length === 0) return null;
  return (
    <div className="modbar" aria-label="Active effects">
      {status.map((s) => (
        <span key={s.key} className={`modchip ${s.tone}`}>{s.label}</span>
      ))}
      {modifiers.map((m) => (
        <span key={m.id} className={`modchip ${m.tone}`}>
          {m.label} <em>{Math.ceil(m.remainingSec)}s</em>
        </span>
      ))}
    </div>
  );
}
