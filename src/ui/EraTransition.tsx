import { eraName, eraBlurb } from "../engine/eras";
import { useReducedMotion } from "./motion";

interface Props {
  era: number;
  /** Rotation seed for the press-release pool (R7.4) — the generation count,
   *  so run 3's re-crossing of an era reads a fresh headline. */
  blurbSeed?: number;
  onDone: () => void;
}

const CONFETTI = Array.from({ length: 22 });
const COLORS = ["#7c5cff", "#2f7bf6", "#16b364", "#ffd60a", "#ff385c"];

/**
 * Era tentpole moment (GDD §5: "era transitions are full-screen events — the
 * hall re-skins, a satirical press release pops"). Fires when the lab crosses
 * into a new era. The room behind has already re-skinned; this announces it.
 */
export function EraTransition({ era, blurbSeed = 0, onDone }: Props) {
  const agi = era >= 5; // Post-Singularity — the capstone tentpole.
  const reducedMotion = useReducedMotion();
  return (
    <div className={`modal-backdrop era-backdrop${agi ? " era-agi" : ""}`} onClick={onDone}>
      {!reducedMotion && <div className="confetti era-confetti" aria-hidden="true">
        {CONFETTI.map((_, i) => (
          <span
            key={i}
            style={{
              ["--x" as string]: `${(Math.random() * 2 - 1).toFixed(2)}`,
              ["--d" as string]: `${(Math.random() * 0.5).toFixed(2)}s`,
              ["--r" as string]: `${Math.floor(Math.random() * 360)}deg`,
              left: `${Math.floor(Math.random() * 100)}%`,
              background: agi ? "#ffd60a" : COLORS[i % COLORS.length],
            }}
          />
        ))}
      </div>}
      <div className="modal era-modal" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">{agi ? "✦ SINGULARITY ✦" : "NEW ERA"}</div>
        <h2 className="era-title">{eraName(era)}</h2>
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
