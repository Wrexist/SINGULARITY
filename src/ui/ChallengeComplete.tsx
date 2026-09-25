import { useRef } from "react";
import type { GrandChallenge } from "../engine/balance/challenges";
import { iconFor } from "./iconRegistry";
import { GiftIcon } from "./Icons";
import { useDialog } from "./useDialog";

interface Props {
  challenge: GrandChallenge;
  onDone: () => void;
}

/** The tentpole "Grand Challenge complete" moment: the moonshot's icon, its permanent
 *  reward, and the satirical lore beat it unlocks. Reuses the era-modal treatment so it
 *  reads as a genuine milestone, not a toast. Tap anywhere / Escape / the button to dismiss. */
export function ChallengeComplete({ challenge, onDone }: Props) {
  // Escape dismisses, matching every other modal (ReputationModal, ProductDetail, …).
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: onDone, labelledBy: "challenge-complete-title" });

  return (
    <div className="modal-backdrop era-backdrop" onClick={onDone}>
      <div ref={ref} className="modal era-modal challenge-complete" role="dialog" aria-modal="true" aria-labelledby="challenge-complete-title" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">GRAND CHALLENGE COMPLETE</div>
        <div className="challenge-complete-icon" aria-hidden="true">{iconFor(challenge.icon, 52)}</div>
        <h2 className="era-title" id="challenge-complete-title" tabIndex={-1}>{challenge.name}</h2>
        <div className="era-press">
          <span className="era-press-tag"><GiftIcon size={14} /> {challenge.reward.desc}</span>
          <p>{challenge.lore}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>Onward</button>
      </div>
    </div>
  );
}
