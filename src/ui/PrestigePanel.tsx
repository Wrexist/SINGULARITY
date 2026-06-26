import { useState } from "react";
import { canPrestige, legacyWeightsGain, ascensionMultiplier } from "../engine/prestige";
import { currentEra } from "../engine/eras";
import { reputationAvailable } from "../engine/reputation";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";
import { fmt } from "./format";
import { Big } from "../engine/math/Big";
import { ReputationModal } from "./ReputationModal";

interface Props {
  game: GameState;
  onPrestige: () => void;
  onBuyReputationPerk: (id: string) => void;
}

export function PrestigePanel({ game, onPrestige, onBuyReputationPerk }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [repOpen, setRepOpen] = useState(false);
  const repPoints = reputationAvailable(game);
  const repOwned = game.reputation.perks.length;
  const ready = canPrestige(game);
  const gain = legacyWeightsGain(game);
  const have = game.prestige.legacyWeights;
  const researchedCount = balance.research.filter((r) => game.research.includes(r.id)).length;
  const progress = Math.min(100, (researchedCount / balance.research.length) * 100);

  // AGI ascension (Post-Singularity era): a ship here past the Legacy floor is an
  // ascension — a permanent compounding boost. Mirror prestige()'s gate.
  const ascensions = game.stats.ascensions;
  const ascBoost = balance.eras.agi.bonusPerAscension;
  const inAgiEra = currentEra(game) >= 5;
  const willAscend =
    ready &&
    game.prestige.ships + 1 >= balance.eras.agiAtShips &&
    game.stats.totalLegacy.add(gain).gte(Big.of(balance.eras.agi.legacyThreshold));

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

      {(inAgiEra || ascensions > 0) && (
        <div className="agi-banner">
          <span className="agi-mark">✦</span>
          <div>
            <div className="agi-title">Post-Singularity · AGI</div>
            <div className="agi-sub">
              {ascensions} ascension{ascensions === 1 ? "" : "s"} · permanent ×{ascensionMultiplier(game).toFixed(2)} to all output
              {willAscend && <> · <b>next ship ascends (+{Math.round(ascBoost * 100)}%)</b></>}
            </div>
          </div>
        </div>
      )}

      {!ready && (
        <div className="progress small">
          <div className="progress-fill money" style={{ width: `${progress}%` }} />
          <span className="progress-label">
            Research {researchedCount}/{balance.research.length} — build the Inference API to ship
          </span>
        </div>
      )}

      {(repPoints > 0 || repOwned > 0) && (
        <button className="rep-strip" onClick={() => setRepOpen(true)}>
          <span className="rep-strip-mark">🏛️</span>
          <span className="rep-strip-text">Lab Reputation — <b>{repPoints}</b> point{repPoints === 1 ? "" : "s"} to spend{repOwned > 0 ? ` · ${repOwned} perk${repOwned === 1 ? "" : "s"} owned` : ""}</span>
          <span className="rep-strip-go">open ▸</span>
        </button>
      )}

      {!confirming ? (
        <button className={`btn btn-ship${willAscend ? " btn-ascend" : ""}`} disabled={!ready} onClick={() => setConfirming(true)}>
          {!ready ? "Locked — deploy a model first" : willAscend ? `✦ Ascend — gain ${fmt(gain)} weights` : `Ship — gain ${fmt(gain)} weights`}
        </button>
      ) : (
        <div className="confirm">
          <p>
            Reset Compute, Data, $, racks and research. <b>Keep</b> {fmt(gain)} new Legacy
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

      {repOpen && <ReputationModal game={game} onBuy={onBuyReputationPerk} onClose={() => setRepOpen(false)} />}
    </section>
  );
}
