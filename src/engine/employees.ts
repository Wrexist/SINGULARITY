import { balance } from "./balance/config";
import type { StaffRole, StaffTrait, ProductStaffLane } from "./balance/config";
import type { Employee, GameState, ProductMods } from "./types";

/**
 * PHASE 3 — individual employees. People (not counts) with a name, a job (role), a
 * seniority level, a personality trait, an optional product assignment, and optional
 * in-progress training. Pure & deterministic: names/traits/ids are minted by the
 * store (like product ids) and passed in. Output folds into derive's lanes.
 */

const S = balance.staff;
const ROLE_BY_ID: Record<string, StaffRole> = Object.fromEntries(S.roles.map((r) => [r.id, r]));
const TRAIT_BY_ID: Record<string, StaffTrait> = Object.fromEntries(S.traits.map((t) => [t.id, t]));

export function roleDef(id: string): StaffRole | undefined { return ROLE_BY_ID[id]; }
export function traitDef(id: string | null): StaffTrait | undefined { return id ? TRAIT_BY_ID[id] : undefined; }

/** Output multiplier from a person's seniority level (1 = junior). */
export function levelEffectMult(level: number): number {
  return 1 + (Math.max(1, level) - 1) * S.levelEffectStep;
}
function levelPayrollMult(level: number): number {
  return 1 + (Math.max(1, level) - 1) * S.levelPayrollStep;
}

/** A person's total output multiplier (level × trait). */
export function employeeEffectMult(emp: Employee): number {
  return levelEffectMult(emp.level) * (traitDef(emp.trait)?.effectMult ?? 1);
}

/** A person's salary (Money/sec): role base × level × trait. */
export function employeePayroll(emp: Employee): number {
  const role = roleDef(emp.roleId);
  if (!role) return 0;
  return role.payroll * levelPayrollMult(emp.level) * (traitDef(emp.trait)?.payrollMult ?? 1);
}

// ---------- Training (timed) ----------

export function trainDurationSec(level: number): number {
  return S.trainBaseSec * Math.pow(S.trainSecGrowth, Math.max(0, level - 1));
}
export function trainCost(emp: Employee): number {
  const role = roleDef(emp.roleId);
  return role ? role.hire.base * S.trainCostMult * emp.level : 0;
}

export function canTrain(state: GameState, empId: string): boolean {
  const emp = state.employees.find((e) => e.id === empId);
  if (!emp || emp.training || emp.level >= S.maxLevel) return false;
  return state.resources.money.gte(trainCost(emp));
}

/** Begin timed training (pay upfront; level up on completion). */
export function startTraining(state: GameState, empId: string): GameState {
  if (!canTrain(state, empId)) return state;
  const emp = state.employees.find((e) => e.id === empId)!;
  const dur = trainDurationSec(emp.level);
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(trainCost(emp)) },
    employees: state.employees.map((e) =>
      e.id === empId ? { ...e, training: { remainingSec: dur, totalSec: dur } } : e,
    ),
  };
}

export interface TrainingResult { employees: Employee[]; completed: { id: string; name: string; level: number }[]; }

/** Advance all in-progress training by `seconds`; completed ones level up. Pure. */
export function advanceTraining(employees: Employee[], seconds: number): TrainingResult {
  if (seconds <= 0 || !employees.some((e) => e.training)) return { employees, completed: [] };
  const completed: { id: string; name: string; level: number }[] = [];
  const next = employees.map((e) => {
    if (!e.training) return e;
    const remainingSec = e.training.remainingSec - seconds;
    if (remainingSec <= 0) {
      const level = Math.min(S.maxLevel, e.level + 1);
      completed.push({ id: e.id, name: e.name, level });
      return { ...e, level, training: null };
    }
    return { ...e, training: { ...e.training, remainingSec } };
  });
  return { employees: next, completed };
}

// ---------- Roster transitions (pure) ----------

/** Assign a person to a product (or null to bench them). Infra roles ignore the
 *  product (they always work on the lab) but may still be benched/un-benched. */
export function assignEmployee(state: GameState, empId: string, productId: string | null): GameState {
  const target = productId && state.products.active.some((p) => p.id === productId) ? productId : null;
  return {
    ...state,
    employees: state.employees.map((e) => (e.id === empId ? { ...e, assignedProductId: target } : e)),
  };
}

export function fireEmployee(state: GameState, empId: string): GameState {
  return { ...state, employees: state.employees.filter((e) => e.id !== empId) };
}

export function addEmployee(state: GameState, emp: Employee): GameState {
  return {
    ...state,
    employees: [...state.employees, emp],
    stats: { ...state.stats, employeesHired: state.stats.employeesHired + 1 },
  };
}

/** Hire signing-bonus cost for a candidate of a role. */
export function hireCost(roleId: string): number {
  const role = roleDef(roleId);
  return role ? role.hire.base * S.hireSigningMult : 0;
}

// ---------- Aggregation into derive ----------

/** Extra global morale from Mentor-type traits (added to office morale). */
export function teamMorale(employees: Employee[]): number {
  let m = 0;
  for (const e of employees) m += traitDef(e.trait)?.teamMorale ?? 0;
  return m;
}

export interface StaffEffects {
  /** Lane multipliers to fold into the Big production lanes. */
  computeMultF: number; dataMultF: number; moneyMultF: number;
  /** Recruiter hire-cost reduction (accumulated units; derive floors it). */
  hireCut: number;
  /** Total salary/sec before office payroll multiplier. */
  payroll: number;
  /** Global product buffs (from unassigned product staff). */
  productMods: ProductMods;
  /** Per-product buffs (global + that product's focused assignees). */
  productModsById: Record<string, ProductMods>;
}

const emptyUnits = (): Record<ProductStaffLane, number> =>
  ({ upgradeSpeed: 0, acquisition: 0, arpu: 0, serveCost: 0, churn: 0, heat: 0 });
const buildMods = (u: Record<ProductStaffLane, number>): ProductMods => ({
  upgradeSpeed: 1 + u.upgradeSpeed,
  acq: 1 + u.acquisition,
  arpu: 1 + u.arpu,
  serveCost: Math.max(0.2, 1 - u.serveCost),
  churn: Math.max(0.2, 1 - u.churn),
  heat: Math.max(0.1, 1 - u.heat),
});

/** Fold the whole roster into lane multipliers, payroll, and product buffs. `morale`
 *  scales every person's output; `focus` is the assigned-vs-unassigned bonus.
 *
 *  Diminishing returns: within each lane, contributors are ranked by raw output and
 *  the k-th (0-indexed) is weighted by 1/(1 + k·perLaneRate). This makes the first
 *  few (and the highest-level / best-trait) people count most, while a wall of
 *  juniors stacked on one lane pays full salary for steeply falling output —
 *  rewarding a tight, trained team over zerg-hiring. Payroll is never diminished. */
export function computeStaffEffects(
  employees: Employee[],
  activeProductIds: string[],
  morale: number,
  focus: number,
): StaffEffects {
  let payroll = 0;
  const activeSet = new Set(activeProductIds);
  // Raw per-lane contributions, collected first so we can rank + dampen them.
  const laneMult: Record<"computeMult" | "dataMult" | "moneyMult", number[]> = {
    computeMult: [], dataMult: [], moneyMult: [],
  };
  const metaHire: number[] = [];
  const emptyLaneList = (): Record<ProductStaffLane, { value: number; bucket: string }[]> =>
    ({ upgradeSpeed: [], acquisition: [], arpu: [], serveCost: [], churn: [], heat: [] });
  const prodLane = emptyLaneList();

  for (const e of employees) {
    const role = roleDef(e.roleId);
    if (!role) continue;
    payroll += employeePayroll(e);
    const eff = employeeEffectMult(e) * morale;
    if (role.effect.kind === "lane") {
      laneMult[role.effect.lane].push(role.effect.perLevel * eff);
    } else if (role.effect.kind === "meta") {
      if (role.effect.lane === "hireDiscount") metaHire.push(role.effect.perLevel * employeeEffectMult(e));
    } else {
      // Assigned to a LIVE product → that product's focus bucket; else benched (global).
      const bucket = e.assignedProductId && activeSet.has(e.assignedProductId) ? e.assignedProductId : "";
      prodLane[role.effect.lane].push({ value: role.effect.perLevel * eff, bucket });
    }
  }

  const dimRate = S.diminishing.perLaneRate;
  const decay = (rank: number) => 1 / (1 + rank * dimRate);
  // Additive lanes: Σ value·decay(rank), strongest first.
  const dampSum = (vals: number[]) =>
    vals.sort((a, b) => b - a).reduce((s, v, k) => s + v * decay(k), 0);
  // Multiplicative lanes: Π (1 + value·decay(rank)), strongest first.
  const dampMult = (vals: number[]) =>
    vals.sort((a, b) => b - a).reduce((m, v, k) => m * (1 + v * decay(k)), 1);

  const computeMultF = dampMult(laneMult.computeMult);
  const dataMultF = dampMult(laneMult.dataMult);
  const moneyMultF = dampMult(laneMult.moneyMult);
  const hireCut = dampSum(metaHire);

  const globalUnits = emptyUnits();
  const focusUnits: Record<string, Record<ProductStaffLane, number>> = {};
  for (const id of activeProductIds) focusUnits[id] = emptyUnits();
  // Rank each product lane WITHIN each destination bucket — the benched/global pool
  // and each product's focus pool are ranked independently — so a benched person's
  // company-wide buff is never penalised by how many people are assigned elsewhere
  // (those flow into a different bucket entirely), and vice versa.
  (Object.keys(prodLane) as ProductStaffLane[]).forEach((lane) => {
    const byBucket = new Map<string, number[]>();
    for (const e of prodLane[lane]) {
      const key = e.bucket && focusUnits[e.bucket] ? e.bucket : ""; // "" = benched/global
      const list = byBucket.get(key) ?? [];
      if (!byBucket.has(key)) byBucket.set(key, list);
      list.push(e.value);
    }
    for (const [key, vals] of byBucket) {
      vals.sort((a, b) => b - a);
      vals.forEach((v, k) => {
        const dv = v * decay(k);
        if (key) focusUnits[key]![lane] += dv * focus;
        else globalUnits[lane] += dv;
      });
    }
  });

  const productModsById: Record<string, ProductMods> = {};
  for (const id of activeProductIds) {
    const u: Record<ProductStaffLane, number> = { ...globalUnits };
    const f = focusUnits[id]!;
    (Object.keys(f) as ProductStaffLane[]).forEach((lane) => { u[lane] += f[lane]; });
    productModsById[id] = buildMods(u);
  }
  return {
    computeMultF, dataMultF, moneyMultF, hireCut, payroll,
    productMods: buildMods(globalUnits),
    productModsById,
  };
}
