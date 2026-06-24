import type { ActiveModifier } from "../engine/types";

/** Live chips for active world-event modifiers, counting down. */
export function ModifierBar({ modifiers }: { modifiers: ActiveModifier[] }) {
  if (modifiers.length === 0) return null;
  return (
    <div className="modbar" aria-label="Active effects">
      {modifiers.map((m) => (
        <span key={m.id} className={`modchip ${m.tone}`}>
          {m.label} <em>{Math.ceil(m.remainingSec)}s</em>
        </span>
      ))}
    </div>
  );
}
