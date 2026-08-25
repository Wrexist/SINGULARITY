import type { GameState } from "../engine/types";
import { doctrineBalance, committedSide, canClaimDoctrine, schismRevealed, schismDepth } from "../engine/doctrine";
import type { DoctrineSide } from "../engine/balance/doctrine";

interface Props {
  game: GameState;
  onClaim: (id: string) => void;
}

const SIDE_LABEL: Record<DoctrineSide, string> = { doomer: "Safety", accel: "Acceleration", schism: "Schism" };
const SIDE_HINT: Record<DoctrineSide, string> = {
  doomer: "Commit to Safety (steer world events doomer) to claim.",
  accel: "Commit to Acceleration (steer world events accel) to claim.",
  // The Schism's own hint is per-perk (it depends on how deep both sides run), so
  // this generic one only covers the alignment half of its gate.
  schism: "Claimed from the center — commit to neither side this run.",
};

/**
 * Doctrine Consequences — your STANCE as a build. Commit to Safety or Acceleration
 * (via faction world-event choices) and claim that side's exclusive permanent perks.
 * The other side stays visible but locked — a reason to replay committed the other way.
 * Hidden until factions matter; curve-safe (see engine/doctrine.ts).
 */
/** Rendered inside a Collapsible (which supplies the section + title) — body only. */
export function DoctrinePanel({ game, onClaim }: Props) {
  const owned = new Set(game.doctrines);
  const side = committedSide(game);

  const depth = schismDepth(game);

  const track = (s: DoctrineSide) => (
    <div className={`doctrine-track ${s === "schism" ? "doctrine-schism" : ""}`} key={s}>
      <div className="doctrine-track-head">
        {SIDE_LABEL[s]}
        {side === s && <span className="doctrine-active">· your stance</span>}
        {s === "schism" && side === null && <span className="doctrine-active">· uncommitted</span>}
      </div>
      {doctrineBalance.perks.filter((p) => p.side === s).map((p) => {
        const isOwned = owned.has(p.id);
        const can = canClaimDoctrine(game, p.id);
        const lockedByReq = !!p.requires && !owned.has(p.requires);
        // A Schism rung short on both-sides depth says so with the number, since that
        // is the part of the gate the player is actually working toward.
        const shortOfDepth = p.minPerSide !== undefined && depth < p.minPerSide;
        return (
          <button key={p.id} className={`doctrine-perk meta-item ${isOwned ? "owned" : can ? "affordable" : lockedByReq ? "locked" : ""}`} disabled={isOwned || !can} onClick={() => onClaim(p.id)}>
            <div className="doctrine-main">
              <span className="doctrine-name">{p.name}{isOwned ? " ✓" : ""}</span>
              <span className="doctrine-desc">{p.desc}</span>
              {!isOwned && lockedByReq && <span className="doctrine-req">needs the perk above</span>}
              {!isOwned && !lockedByReq && !can && shortOfDepth && (
                <span className="doctrine-req">Hold {p.minPerSide} perks on each side — you have {depth}.</span>
              )}
              {!isOwned && !lockedByReq && !can && !shortOfDepth && side !== s && <span className="doctrine-req">{SIDE_HINT[s]}</span>}
            </div>
            <span className="doctrine-claim">{isOwned ? "held" : can ? "Claim" : "—"}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {/* First-run scaffolding — hide once the player has claimed a doctrine perk. */}
      {game.doctrines.length === 0 && (
        <p className="doctrine-note">
          Your stance is a build. Commit to a side to claim its perks — the other stays locked, to draw you back another run.
        </p>
      )}
      <div className="doctrine-tracks">
        {track("doomer")}
        {track("accel")}
        {/* The Schism appears only once you hold a perk on BOTH sides. Before that it
            isn't locked content to stare at — it isn't yet part of your story. */}
        {schismRevealed(game) && track("schism")}
      </div>
    </>
  );
}

/** Doctrine perks claimed / total — for the Collapsible badge. The total counts only
 *  what the player can SEE: while the Schism is unrevealed, a "2/9" badge would leak
 *  that three perks exist somewhere the panel shows nothing about. */
export function doctrineDoneCount(game: GameState): number {
  return doctrineBalance.perks.filter((p) => game.doctrines.includes(p.id)).length;
}
export function doctrineTotal(game: GameState): number {
  const revealed = schismRevealed(game);
  return doctrineBalance.perks.filter((p) => revealed || p.side !== "schism").length;
}
