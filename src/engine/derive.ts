import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { Derived, GameState } from "./types";

/**
 * Fold owned upgrades, research, and prestige into the stats the sim and UI use.
 * Pure and cheap — safe to call every frame. Keeping this the single source of
 * "current rates" means tick() and the UI never disagree.
 */
export function derive(state: GameState): Derived {
  let computeFlat = Big.of(balance.baseComputePerSec);
  let computeMult = Big.ONE;
  let dataMult = Big.ONE;
  let moneyMult = Big.ONE;
  let runDurationSec = balance.run.durationSec;
  let passiveMoneyPerSec = Big.ZERO;
  let autoClaim = false;
  let autoTrain = false;

  // Upgrades
  for (const def of balance.upgrades) {
    const level = state.upgrades[def.id] ?? 0;
    if (level <= 0) continue;
    switch (def.effect.kind) {
      case "computeFlat":
        computeFlat = computeFlat.add(def.effect.perLevel * level);
        break;
      case "computeMult":
        computeMult = computeMult.mul(Math.pow(1 + def.effect.perLevel, level));
        break;
      case "dataMult":
        dataMult = dataMult.mul(1 + def.effect.perLevel * level);
        break;
      case "moneyMult":
        moneyMult = moneyMult.mul(1 + def.effect.perLevel * level);
        break;
      case "runSpeedMult":
        runDurationSec *= Math.pow(1 - def.effect.perLevel, level);
        break;
      case "autoClaim":
        autoClaim = true;
        break;
      case "autoTrain":
        autoTrain = true;
        break;
    }
  }

  // Research (one-time nodes)
  for (const def of balance.research) {
    if (!state.research.includes(def.id)) continue;
    switch (def.effect.kind) {
      case "computeMult":
        computeMult = computeMult.mul(def.effect.factor);
        break;
      case "dataMult":
        dataMult = dataMult.mul(def.effect.factor);
        break;
      case "moneyMult":
        moneyMult = moneyMult.mul(def.effect.factor);
        break;
      case "runSpeed":
        runDurationSec *= def.effect.factor;
        break;
      case "unlockPassiveMoney":
        passiveMoneyPerSec = passiveMoneyPerSec.add(def.effect.perSec);
        break;
    }
  }

  // Prestige: permanent global multiplier from Legacy Weights.
  const legacyMult = Big.ONE.add(
    state.prestige.legacyWeights.mul(balance.prestige.multiplierPerPoint),
  );
  computeMult = computeMult.mul(legacyMult);
  dataMult = dataMult.mul(legacyMult);
  moneyMult = moneyMult.mul(legacyMult);
  passiveMoneyPerSec = passiveMoneyPerSec.mul(legacyMult);

  return {
    computePerSec: computeFlat.mul(computeMult),
    dataMult,
    moneyMult,
    runDurationSec: Math.max(0.5, runDurationSec),
    passiveMoneyPerSec,
    autoClaim,
    autoTrain,
    runComputeCost: Big.of(balance.run.computeCost),
    runDataYield: Big.of(balance.run.dataYield).mul(dataMult),
    runMoneyYield: Big.of(balance.run.moneyYield).mul(moneyMult),
    legacyMult,
  };
}
