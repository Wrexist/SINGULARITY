import { eraName, eraBlurb } from "../engine/eras";
import { useRef } from "react";
import { useReducedMotion } from "./motion";
import { useDialog } from "./useDialog";
import { useConfetti, confettiStyle } from "./confetti";

interface Props {
  era: number;
  /** Rotation seed for the press-release pool (R7.4) — the generation count,
   *  so run 3's re-crossing of an era reads a fresh headline. */
  blurbSeed?: number;
  onDone: () => void;
}

const CONFETTI_COUNT = 22;
const COLORS = ["#7c5cff", "#2f7bf6", "#16b364", "#ffd60a", "#ff385c"];

/**
 * Era tentpole moment (GDD §5: "era transitions are full-screen events — the
 * hall re-skins, a satirical press release pops"). Fires when the lab crosses
 * into a new era. The room behind has already re-skinned; this announces it.
 */
export function EraTransition({ era, blurbSeed = 0, onDone }: Props) {
  const agi = era >= 5; // Post-Singularity — the capstone tentpole.
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: onDone, labelledBy: "era-title" });
  const confetti = useConfetti(CONFETTI_COUNT);
  return (
    <div className={`modal-backdrop era-backdrop${agi ? " era-agi" : ""}`} onClick={onDone}>
      {!reducedMotion && <div className="confetti era-confetti" aria-hidden="true">
        {confetti.map((p, i) => (
          <span key={i} style={confettiStyle(p, agi ? "#ffd60a" : COLORS[i % COLORS.length]!)} />
        ))}
      </div>}
      <div ref={ref} className="modal era-modal" role="dialog" aria-modal="true" aria-labelledby="era-title" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">{agi ? "✦ SINGULARITY ✦" : "NEW ERA"}</div>
        <h2 id="era-title" className="era-title" tabIndex={-1}>{eraName(era)}</h2>
        <div className="era-press">
          <span className="era-press-tag">{agi ? "AUTO-GENERATED" : "PRESS RELEASE"}</span>
          <p>{eraBlurb(era, blurbSeed)}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>
          {agi ? "Ascend" : "Onwards & upwards"}
        </button>
      </div>
    </div>
  );
}
