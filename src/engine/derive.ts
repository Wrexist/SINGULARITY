import { Big } from "./math/Big";
import { balance } from "./balance/config";
import type { ProductStaffLane } from "./balance/config";
import { powerStats } from "./power";
import type { Derived, GameState, ProductMods } from "./types";

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

  // Staff: each hire either multiplies a lab lane (infra) or buffs the product
  // business (product). Payroll is summed for tick(); product buffs fold into
  // productMods. Reductions (serveCost/churn) are floored so they can't zero out.
  // Office perks: morale scales ALL staff OUTPUT (not payroll); a payroll multiplier
  // trims the wage bill. Both are one-time perks living in the upgrades map.
  const morale = officeMorale(state);
  let payrollPerSec = Big.ZERO;
  let hireCut = 0;
  // Product-team roles are handled separately (assignment-aware) below.
  const productRoles: { id: string; lane: ProductStaffLane; perLevel: number; hired: number }[] = [];
  if (balance.staff.enabled) {
    for (const role of balance.staff.roles) {
      const n = state.upgrades[role.id] ?? 0;
      if (n > 0) payrollPerSec = payrollPerSec.add(role.payroll * n); // payroll counts every hire
      if (role.effect.kind === "lane") {
        if (n <= 0) continue;
        const f = 1 + role.effect.perLevel * n * morale;
        if (role.effect.lane === "computeMult") computeMult = computeMult.mul(f);
        else if (role.effect.lane === "dataMult") dataMult = dataMult.mul(f);
        else if (role.effect.lane === "moneyMult") moneyMult = moneyMult.mul(f);
      } else if (role.effect.kind === "meta") {
        if (role.effect.lane === "hireDiscount") hireCut += role.effect.perLevel * n;
      } else {
        productRoles.push({ id: role.id, lane: role.effect.lane, perLevel: role.effect.perLevel, hired: n });
      }
    }
    payrollPerSec = payrollPerSec.mul(officePayrollMult(state));
  }

  // Assignment-aware product buffs: unassigned product-staff buff EVERY product at
  // base rate; assigned ones buff only their product at a focus bonus.
  const assignments = state.products.assignments ?? {};
  const totalAssigned: Record<string, number> = {};
  for (const pid in assignments) {
    for (const rid in assignments[pid]) totalAssigned[rid] = (totalAssigned[rid] ?? 0) + (assignments[pid][rid] ?? 0);
  }
  const emptyUnits = (): Record<ProductStaffLane, number> =>
    ({ upgradeSpeed: 0, acquisition: 0, arpu: 0, serveCost: 0, churn: 0, heat: 0 });
  const buildMods = (u: Record<ProductStaffLane, number>) => ({
    upgradeSpeed: 1 + u.upgradeSpeed,
    acq: 1 + u.acquisition,
    arpu: 1 + u.arpu,
    serveCost: Math.max(0.2, 1 - u.serveCost),
    churn: Math.max(0.2, 1 - u.churn),
    heat: Math.max(0.1, 1 - u.heat),
  });
  // Global baseline from unassigned hires.
  const globalUnits = emptyUnits();
  for (const pr of productRoles) {
    const unassigned = Math.max(0, pr.hired - (totalAssigned[pr.id] ?? 0));
    globalUnits[pr.lane] += unassigned * pr.perLevel * morale;
  }
  const productMods = buildMods(globalUnits);
  const focus = balance.staff.assignFocusMult;
  const productModsById: Record<string, ProductMods> = {};
  for (const p of state.products.active) {
    const u: Record<ProductStaffLane, number> = { ...globalUnits };
    const a = assignments[p.id] ?? {};
    for (const pr of productRoles) u[pr.lane] += (a[pr.id] ?? 0) * pr.perLevel * focus * morale;
    productModsById[p.id] = buildMods(u);
  }
  const hireDiscount = Math.max(0.25, 1 - hireCut); // hires never cheaper than 25% of base

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
    payrollPerSec,
    productMods,
    productModsById,
    hireDiscount,
  };
}
