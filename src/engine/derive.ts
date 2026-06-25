import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { computeStaffEffects, teamMorale, type StaffEffects } from "./employees";
import { powerStats } from "./power";
import type { Derived, Employee, GameState } from "./types";

// Single-slot memo for the staff aggregation (see derive()). Keyed on the employees
// array IDENTITY (stable between ticks) + morale + the product-id set.
let staffCache: { employees: Employee[]; morale: number; idsKey: string; fx: StaffEffects } | null = null;
function staffCacheGet(employees: Employee[], morale: number, idsKey: string): StaffEffects | null {
  return staffCache && staffCache.employees === employees && staffCache.morale === morale && staffCache.idsKey === idsKey
    ? staffCache.fx : null;
}
function staffCacheSet(employees: Employee[], morale: number, idsKey: string, fx: StaffEffects): StaffEffects {
  staffCache = { employees, morale, idsKey, fx };
  return fx;
}

/** Morale multiplier on all staff output from owned office perks (1 = baseline). */
export function officeMorale(state: GameState): number {
  if (!balance.office.enabled) return 1;
  let m = 1;
  for (const perk of balance.office.perks) {
    if ((state.upgrades[perk.id] ?? 0) > 0) m += perk.morale;
  }
  return m;
}

/** Payroll multiplier from owned office perks (≤ 1 trims the wage bill). */
export function officePayrollMult(state: GameState): number {
  if (!balance.office.enabled) return 1;
  let mult = 1;
  for (const perk of balance.office.perks) {
    if ((state.upgrades[perk.id] ?? 0) > 0) mult *= perk.payrollMult;
  }
  return mult;
}

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
      case "powerCapacity":
        // Phase 2 power capacity — consumed by powerStats(), not production here.
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

  // Staff are individual people now. Morale (office perks + Mentor traits) scales
  // every person's output; office perks also trim payroll. computeStaffEffects folds
  // the whole roster into lane multipliers, payroll, and per-product buffs (benched
  // people buff all products at base rate; assigned ones focus on theirs at 2×).
  const morale = officeMorale(state) + teamMorale(state.employees);
  // Cross-tick memo: the staff aggregation is O(employees × products) but its inputs
  // (the employees array reference, morale, the product-id set) only change on
  // hire/fire/train/assign/perk — not every 10Hz tick. derive() runs every render, so
  // caching here turns ~100+ employees into a no-op on the common path.
  const idsKey = state.products.active.map((p) => p.id).join(",");
  const fx = staffCacheGet(state.employees, morale, idsKey)
    ?? staffCacheSet(state.employees, morale, idsKey,
      computeStaffEffects(state.employees, state.products.active.map((p) => p.id), morale, balance.staff.assignFocusMult));
  computeMult = computeMult.mul(fx.computeMultF);
  dataMult = dataMult.mul(fx.dataMultF);
  moneyMult = moneyMult.mul(fx.moneyMultF);
  const payrollPerSec = Big.of(fx.payroll).mul(officePayrollMult(state));
  const productMods = fx.productMods;
  const productModsById = fx.productModsById;
  const hireDiscount = Math.max(0.25, 1 - fx.hireCut); // hires never cheaper than 25% of base

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

  // AGI ascension: a permanent, compounding boost earned by shipping in the
  // Post-Singularity era (stats.ascensions). Stays 1.0 through the whole early/mid
  // game (ascensions = 0 until the deep endgame), so the tuned curve is untouched.
  const ascensionMult = Big.ONE.add(balance.eras.agi.bonusPerAscension * state.stats.ascensions);
  computeMult = computeMult.mul(ascensionMult);
  dataMult = dataMult.mul(ascensionMult);
  moneyMult = moneyMult.mul(ascensionMult);
  passiveMoneyPerSec = passiveMoneyPerSec.mul(ascensionMult);
  // Scraper output rides the global Legacy + ascension boost (kept separate from
  // the per-run dataMult lane so the two data sources stay legible).
  const dataPerSec = dataPerSecFlat.mul(legacyMult).mul(ascensionMult);

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
    payrollPerSec,
    productMods,
    productModsById,
    hireDiscount,
  };
}
