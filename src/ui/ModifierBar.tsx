import type { ActiveModifier } from "../engine/types";
import { isIncident } from "../engine/actions";
import { GearIcon } from "./Icons";

/** A persistent (non-countdown) status chip, e.g. an active standing the player
 *  should keep in view — regulator scrutiny, an open commitment, etc. */
export interface StatusChip {
  key: string;
  label: string;
  tone: "good" | "bad" | "neutral";
}

/** A per-lane family's ids end in the lane they boost (`daily_computeMult`). */
const LANE_SUFFIX = /_(computeMult|dataMult|moneyMult)$/;

/** Live chips for active world-event modifiers (counting down) plus any persistent
 *  status chips — a light always-visible status ticker. The row is ALWAYS rendered
 *  at a fixed height (chips scroll horizontally, never wrap) so chips appearing or
 *  expiring can never shift the layout below.
 *
 *  A BAD modifier can be "worked" once (IDEAS #5) to shave a bounded slice off its
 *  timer. That action used to be reachable ONLY by tapping the aria-hidden hall
 *  canvas; passing `onWork` makes those chips real, accessible buttons here too. */
export function ModifierBar({
  modifiers, status = [], onWork, workShaveSec = 0,
}: {
  modifiers: ActiveModifier[];
  status?: StatusChip[];
  onWork?: (id: string) => void;
  workShaveSec?: number;
}) {
  // Display-dedupe a per-lane family: a boost applied per-resource (the daily's three
  // ×1.5 mults `daily_<lane>`, open-source momentum `momentum_<lane>`) is ONE chip to
  // the player, not three identical ones. Only a family merges — two different events
  // that share a label ("Compute ×1.5" twice) both apply, so both show.
  const chips: ActiveModifier[] = [];
  const seen = new Map<string, number>(); // dedupe key → index into chips
  for (const m of modifiers) {
    const key = `${m.id.replace(LANE_SUFFIX, "")}|${m.label}|${m.tone}`;
    const at = seen.get(key);
    if (at === undefined) { seen.set(key, chips.length); chips.push(m); }
    else if (m.remainingSec > chips[at]!.remainingSec) chips[at] = m;
  }
  // Tone is carried by colour alone on screen; say it for screen readers.
  const toneWord = (tone: string) => (tone === "good" ? "Buff: " : tone === "bad" ? "Setback: " : "");
  return (
    <div className="modbar" role="group" aria-label="Active effects">
      {status.map((s) => (
        <span key={s.key} className={`modchip ${s.tone}`}>{toneWord(s.tone) && <span className="sr-only">{toneWord(s.tone)}</span>}{s.label}</span>
      ))}
      {chips.map((m) => {
        // A not-yet-worked incident is an actionable button; everything else is a
        // plain status chip. Guard on onWork so the bar still works without it. A
        // factor-1 marker (the regulator truce) is a status, not a setback — neutral,
        // and never workable (shaving it only brought Chen back sooner).
        const workable = !!onWork && isIncident(m) && m.worked !== true;
        const tone = m.factor === 1 ? "neutral" : m.tone;
        if (workable) {
          return (
            <button
              key={m.id}
              className={`modchip ${m.tone} workable`}
              onClick={() => onWork!(m.id)}
              title={`Work the problem — shave ${workShaveSec}s off ${m.label}`}
              aria-label={`Setback: ${m.label}, ${Math.ceil(m.remainingSec)} seconds left. Work the problem to shave ${workShaveSec} seconds.`}
            >
              {m.label} <em>{Math.ceil(m.remainingSec)}s</em>
              <span className="modchip-work" aria-hidden="true"><GearIcon size={11} /> −{workShaveSec}s</span>
            </button>
          );
        }
        return (
          <span key={m.id} className={`modchip ${tone}`}>
            {toneWord(tone) && <span className="sr-only">{toneWord(tone)}</span>}{m.label} <em>{Math.ceil(m.remainingSec)}s</em>
          </span>
        );
      })}
    </div>
  );
}
