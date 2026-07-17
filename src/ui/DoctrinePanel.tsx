import type { GameState } from "../engine/types";
import { doctrineBalance, doctrineUnlocked, committedSide, canClaimDoctrine } from "../engine/doctrine";
import type { DoctrineSide } from "../engine/balance/doctrine";

interface Props {
  game: GameState;
  onClaim: (id: string) => void;
}

const SIDE_LABEL: Record<DoctrineSide, string> = { doomer: "Safety", accel: "Acceleration" };
const SIDE_HINT: Record<DoctrineSide, string> = {
  doomer: "Commit to Safety (steer world events doomer) to claim.",
  accel: "Commit to Acceleration (steer world events accel) to claim.",
};

/**
 * Doctrine Consequences — your STANCE as a build. Commit to Safety or Acceleration
 * (via faction world-event choices) and claim that side's exclusive permanent perks.
 * The other side stays visible but locked — a reason to replay committed the other way.
 * Hidden until factions matter; curve-safe (see engine/doctrine.ts).
 */
export function DoctrinePanel({ game, onClaim }: Props) {
  if (!doctrineUnlocked(game)) return null;
  const owned = new Set(game.doctrines);
  const side = committedSide(game);
  const doneCount = doctrineBalance.perks.filter((p) => owned.has(p.id)).length;

  const track = (s: DoctrineSide) => (
    <div className="doctrine-track" key={s}>
      <div className="doctrine-track-head">
        {SIDE_LABEL[s]}{side === s && <span className="doctrine-active">· your stance</span>}
      </div>
      {doctrineBalance.perks.filter((p) => p.side === s).map((p) => {
        const isOwned = owned.has(p.id);
        const can = canClaimDoctrine(game, p.id);
        const lockedByReq = !!p.requires && !owned.has(p.requires);
        return (
          <button key={p.id} className={`doctrine-perk ${isOwned ? "owned" : ""}`} disabled={isOwned || !can} onClick={() => onClaim(p.id)}>
            <div className="doctrine-main">
              <span className="doctrine-name">{p.name}{isOwned ? " ✓" : ""}</span>
              <span className="doctrine-desc">{p.desc}</span>
              {!isOwned && lockedByReq && <span className="doctrine-req">needs the perk above</span>}
              {!isOwned && !lockedByReq && !can && side !== s && <span className="doctrine-req">{SIDE_HINT[s]}</span>}
            </div>
            <span className="doctrine-claim">{isOwned ? "held" : can ? "Claim" : "—"}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="panel doctrine">
      <div className="doctrine-head">
        <h2 className="panel-title" style={{ margin: 0 }}>Doctrine</h2>
        <span className="doctrine-count">{doneCount}/{doctrineBalance.perks.length}</span>
      </div>
      <p className="doctrine-note">
        Your stance is a build. Commit to a side to claim its perks — the other stays locked, to draw you back another run.
      </p>
      <div className="doctrine-tracks">
        {track("doomer")}
        {track("accel")}
      </div>
    </section>
  );
}
