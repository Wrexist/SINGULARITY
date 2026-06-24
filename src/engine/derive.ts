import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { powerStats } from "./power";
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
  let dataPerSecFlat = Big.ZERO;
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
      case "dataPerSec":
        dataPerSecFlat = dataPerSecFlat.add(def.effect.perLevel * level);
        break;
      case "floorCols":
      case "floorRows":
        // Hall geometry only — affects the rendered floor, not production.
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

  // World-event modifiers: time-limited global multipliers (buffs/debuffs).
  for (const m of state.modifiers) {
    if (m.remainingSec <= 0) continue;
    if (m.target === "computeMult") computeMult = computeMult.mul(m.factor);
    else if (m.target === "dataMult") dataMult = dataMult.mul(m.factor);
    else if (m.target === "moneyMult") moneyMult = moneyMult.mul(m.factor);
  }

  // Prestige: permanent global multiplier from Legacy Weights.
  const legacyMult = Big.ONE.add(
    state.prestige.legacyWeights.mul(balance.prestige.multiplierPerPoint),
  );
  computeMult = computeMult.mul(legacyMult);
  dataMult = dataMult.mul(legacyMult);
  moneyMult = moneyMult.mul(legacyMult);
  passiveMoneyPerSec = passiveMoneyPerSec.mul(legacyMult);
  // Scraper output rides the global Legacy boost (kept separate from the
  // per-run dataMult lane so the two data sources stay legible).
  const dataPerSec = dataPerSecFlat.mul(legacyMult);

  let computePerSec = computeFlat.mul(computeMult);
  // PHASE 2 (flagged off): power/heat soft-cap throttles Compute when the racks
  // draw more than your capacity. Dormant until balance.power.enabled is true.
  if (balance.power.enabled) {
    computePerSec = computePerSec.mul(powerStats(state).thermalFactor);
  }
  // Run cost scales with compute production (floored early game) so payouts
  // scale with the operation. Yields are proportional to compute invested.
  const runComputeCost = computePerSec
    .mul(balance.run.costSeconds)
    .max(balance.run.minCompute);

  return {
    computePerSec,
    dataMult,
    moneyMult,
    runDurationSec: Math.max(0.5, runDurationSec),
    passiveMoneyPerSec: passiveMoneyPerSec.mul(computePerSec),
    dataPerSec,
    autoClaim,
    autoTrain,
    runComputeCost,
    runDataYield: runComputeCost.mul(balance.run.dataPerCompute).mul(dataMult),
    runMoneyYield: runComputeCost.mul(balance.run.moneyPerCompute).mul(moneyMult),
    legacyMult,
  };
}
