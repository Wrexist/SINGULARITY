import { useState } from "react";
import { canPrestige, legacyWeightsGain } from "../engine/prestige";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";

interface Props {
  game: GameState;
  onPrestige: () => void;
}

export function PrestigePanel({ game, onPrestige }: Props) {
  const [confirming, setConfirming] = useState(false);
  const ready = canPrestige(game);
  const gain = legacyWeightsGain(game);
  const have = game.prestige.legacyWeights;
  const progress = Math.min(
    100,
    (game.lifetimeMoney.toNumber() / balance.prestige.requirement) * 100,
  );

  return (
    <section className="panel prestige">
      <h2 className="panel-title">Ship the Model</h2>
      <p className="prestige-blurb">
        Ship your flagship model to reset the lab and bank <b>Legacy Weights</b> —
        a permanent +{(balance.prestige.multiplierPerPoint * 100).toFixed(0)}% global boost each.
      </p>

      <div className="prestige-stats">
        <span>Held weights: <b>{fmt(have)}</b> (×{fmt(Big.ONE.add(have.mul(balance.prestige.multiplierPerPoint)))})</span>
        <span>Models shipped: <b>{game.prestige.ships}</b></span>
      </div>

      {!ready && (
        <div className="progress small">
          <div className="progress-fill money" style={{ width: `${progress}%` }} />
          <span className="progress-label">
            {fmt(game.lifetimeMoney)} / {fmt(Big.of(balance.prestige.requirement))} lifetime money
          </span>
        </div>
      )}

      {!confirming ? (
        <button className="btn btn-ship" disabled={!ready} onClick={() => setConfirming(true)}>
          {ready ? `Ship — gain ${fmt(gain)} weights` : "Locked"}
        </button>
      ) : (
        <div className="confirm">
          <p>
            Reset Compute, Data, Money, racks and research. <b>Keep</b> {fmt(gain)} new Legacy
            Weights (total {fmt(have.add(gain))}). Sure?
          </p>
          <div className="confirm-row">
            <button className="btn btn-ship" onClick={() => { onPrestige(); setConfirming(false); }}>
              Ship it 🚀
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
