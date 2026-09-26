import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize, deserialize } from "../engine/save";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { Employee, GameState } from "../engine/types";

/**
 * The loader keeps at most balance.staff.maxRoster people. Hiring had no cap, so a
 * deep player's hires past it were paid for and then deleted on the next launch
 * (2026-09 bug hunt). The store now refuses the hire before charging the bonus.
 */
const MAX = balance.staff.maxRoster;
// Fixture ids stay clear of the store's minted `emp-N` ids (the app seeds its id
// counter past loaded ones; this test does not load through init()).
const person = (i: number): Employee => ({
  id: `fx-${i}`, name: `N${i}`, roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null,
});
const lab = (n: number): GameState => {
  const s = createInitialState();
  s.research = ["backprop"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.of(1e30) };
  s.employees = Array.from({ length: n }, (_, i) => person(i + 1));
  return s;
};
const candidate = { name: "Ada", roleId: "staff_engineer", trait: null };

describe("hiring at the roster cap", () => {
  beforeEach(() => {
    useGame.setState({ game: lab(MAX - 1), candidates: [candidate, candidate], savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
  });

  it("fills the last seat, then refuses without charging the signing bonus", () => {
    expect(useGame.getState().doHireCandidate(0)).toBe(true);
    const full = useGame.getState().game;
    expect(full.employees.length).toBe(MAX);

    expect(useGame.getState().doHireCandidate(0)).toBe(false);
    const after = useGame.getState().game;
    expect(after.employees.length).toBe(MAX);
    expect(after.resources.money.eq(full.resources.money)).toBe(true);
    expect(after.stats.employeesHired).toBe(full.stats.employeesHired);
  });

  it("everyone hired survives a reload", () => {
    useGame.getState().doHireCandidate(0);
    useGame.getState().doHireCandidate(0);
    const live = useGame.getState().game;
    const back = deserialize(serialize(live));
    expect(back.employees.map((e) => e.id)).toEqual(live.employees.map((e) => e.id));
  });
});
