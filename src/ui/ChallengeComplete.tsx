import type { GrandChallenge } from "../engine/balance/challenges";

interface Props {
  challenge: GrandChallenge;
  onDone: () => void;
}

/** The tentpole "Grand Challenge complete" moment: the moonshot's icon, its permanent
 *  reward, and the satirical lore beat it unlocks. Reuses the era-modal treatment so it
 *  reads as a genuine milestone, not a toast. Tap anywhere / the button to dismiss. */
export function ChallengeComplete({ challenge, onDone }: Props) {
  return (
    <div className="modal-backdrop era-backdrop" onClick={onDone}>
      <div className="modal era-modal challenge-complete" onClick={(e) => e.stopPropagation()}>
        <div className="era-kicker">GRAND CHALLENGE COMPLETE</div>
        <div className="challenge-complete-icon" aria-hidden="true">{challenge.icon}</div>
        <h2 className="era-title">{challenge.name}</h2>
        <div className="era-press">
          <span className="era-press-tag">🎁 {challenge.reward.desc}</span>
          <p>{challenge.lore}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>Onward</button>
      </div>
    </div>
  );
}
