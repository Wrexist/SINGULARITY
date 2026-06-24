import { balance } from "../engine/balance/config";
import { upgradeCost, canBuyUpgrade } from "../engine/actions";
import { useGame } from "../state/store";
import { fmtMoney } from "./format";

interface Props {
  id: string;
  onConfirm: () => void;
  onDecline: () => void;
}

/** Confirm/decline popup for buying a hall expansion by tapping the floor. */
export function ExpandConfirm({ id, onConfirm, onDecline }: Props) {
  const game = useGame((s) => s.game);
  const def = balance.upgrades.find((u) => u.id === id);
  if (!def) return null;

  const owned = game.upgrades[id] ?? 0;
  const cost = upgradeCost(def, owned);
  const affordable = canBuyUpgrade(game, id);
  const maxed = owned >= def.max;
  const adds =
    def.effect.kind === "floorCols"
      ? `+${def.effect.perLevel} floor columns`
      : def.effect.kind === "floorRows"
        ? `+${def.effect.perLevel} floor rows`
        : "more floor";

  return (
    <div className="modal-backdrop" onClick={onDecline}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-kicker">EXPAND THE HALL</div>
        <h2>{def.name}</h2>
        <p className="modal-sub">{def.desc}</p>
        <div className="confirm-row">
          <span>Adds</span>
          <b style={{ color: "var(--compute)" }}>{adds}</b>
        </div>
        <div className="confirm-row">
          <span>Cost</span>
          <b className={affordable ? "" : "confirm-unaff"}>{fmtMoney(cost)}</b>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onDecline}>
            Decline
          </button>
          <button className="btn btn-primary" disabled={!affordable || maxed} onClick={onConfirm}>
            {maxed ? "Maxed" : affordable ? "Confirm" : "Can't afford"}
          </button>
        </div>
      </div>
    </div>
  );
}
