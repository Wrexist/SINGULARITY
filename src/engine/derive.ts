import { Big } from "./math/Big";
import { balance } from "./balance/config";
import { computeStaffEffects, teamMorale, type StaffEffects } from "./employees";
import { reputationMods } from "./reputation";
import { alignmentProductionMods, alignmentProductMods } from "./alignment";
import { charterMods } from "./charter";
import { ascensionMultiplier } from "./prestige";
import { powerStats } from "./power";
import type { Derived, Employee, GameState } from "./types";

// Single-slot memo for the staff aggregation (see derive()). Keyed on the employees
// array IDENTITY (stable between ticks) + morale + the product-id set.
// INVARIANT: this relies on Employee objects being treated as IMMUTABLE — every
// roster change must produce a NEW array (the codebase's update pattern already does
// this). A caller that mutated an employee in place without swapping the array
// reference would read a stale `fx`. Keep updates immutable to preserve determinism.
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
  let payrollPerSec = Big.of(fx.payroll).mul(officePayrollMult(state));
  // R5.5 cross-system folds: alignment → product acquisition/Heat, and regulatory
  // Heat → product churn (a sketchy lab bleeds customers). All identity at
  // neutral/cold, so a fresh run's product economics — and the sim — are untouched.
  const ap = alignmentProductMods(state);
  const heatChurnMult = 1 + (state.heat / balance.heat.max) * balance.heat.productChurnAtMax;
  const applyCross = (m: typeof fx.productMods) => ({
    ...m,
    acq: m.acq * ap.acq,
    heat: m.heat * ap.heat,
    churn: m.churn * heatChurnMult,
  });
  const productMods = applyCross(fx.productMods);
  const productModsById = Object.fromEntries(
    Object.entries(fx.productModsById).map(([id, m]) => [id, applyCross(m)]),
  );
  const hireDiscount = Math.max(balance.staff.hireDiscountFloor, 1 - fx.hireCut); // floored hire discount

  // World-event modifiers: time-limited global multipliers (buffs/debuffs).
  for (const m of state.modifiers) {
    if (m.remainingSec <= 0) continue;
    if (m.target === "computeMult") computeMult = computeMult.mul(m.factor);
    else if (m.target === "dataMult") dataMult = dataMult.mul(m.factor);
    else if (m.target === "moneyMult") moneyMult = moneyMult.mul(m.factor);
  }

  // Prestige: permanent global multiplier from Legacy Weights.
  // Diminishing in weights (R4.1): worth exactly 1 at zero weights (first prestige
  // untouched), and each later weight is worth a little less so the meta-loop
  // doesn't collapse to sub-minute ships.
  const legacyMult = Big.ONE.add(
    state.prestige.legacyWeights.pow(balance.prestige.multiplierExponent).mul(balance.prestige.multiplierPerPoint),
  );
  computeMult = computeMult.mul(legacyMult);
  dataMult = dataMult.mul(legacyMult);
  moneyMult = moneyMult.mul(legacyMult);
  // NOTE: passiveMoneyPerSec is NOT multiplied by global lane mults here — it is
  // `acc × computePerSec` at the return, and computePerSec already carries legacy,
  // ascension and rep-compute/global. Applying them here too would square them
  // (the bug the Phase-3 review caught). Global boosts reach passive money exactly
  // once, through compute.

  // AGI ascension: a permanent, compounding boost earned by shipping in the
  // Post-Singularity era (stats.ascensions). Stays 1.0 through the whole early/mid
  // game (ascensions = 0 until the deep endgame), so the tuned curve is untouched.
  const ascensionMult = Big.of(ascensionMultiplier(state));
  computeMult = computeMult.mul(ascensionMult);
  dataMult = dataMult.mul(ascensionMult);
  moneyMult = moneyMult.mul(ascensionMult);

  // Lab Reputation perks — permanent global multipliers bought with meta-currency.
  // Owned perks are empty on a fresh run, so this is 1.0 until the player spends.
  const rep = reputationMods(state);
  computeMult = computeMult.mul(rep.computeMult);
  dataMult = dataMult.mul(rep.dataMult);
  moneyMult = moneyMult.mul(rep.moneyMult);
  if (rep.payrollMult !== 1) payrollPerSec = payrollPerSec.mul(rep.payrollMult);
  // Scraper output is its own lane (does NOT ride compute), so global boosts —
  // Legacy, ascension, AND reputation data perks — must be applied to it directly.
  const dataPerSec = dataPerSecFlat.mul(legacyMult).mul(ascensionMult).mul(rep.dataMult);

  // Faction alignment: a strategic lane-tilt (accelerationist trades money for
  // compute, doomer the reverse). Identity at neutral, so the curve/sim are
  // untouched. Applied to compute & money only — not the scraper data lane.
  const align = alignmentProductionMods(state);
  computeMult = computeMult.mul(align.computeMult);
  moneyMult = moneyMult.mul(align.moneyMult);

  // Lab Charter (R6.1): the run's chosen triangle tilt. Identity (1.0) on a
  // charter-less run — including the first — so the tuned curve is untouched.
  const ch = charterMods(state);
  computeMult = computeMult.mul(ch.computeMult);
  dataMult = dataMult.mul(ch.dataMult);
  moneyMult = moneyMult.mul(ch.moneyMult);

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
    runDurationSec: Math.max(balance.run.minDurationSec, runDurationSec),
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
