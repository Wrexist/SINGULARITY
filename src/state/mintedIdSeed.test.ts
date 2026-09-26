import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { serialize, deserialize } from "../engine/save";
import { launchDraft } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { Employee, GameState } from "../engine/types";

/**
 * Id counters seeded from a restored backup (bug hunt r3, staff). The store mints
 * `emp-N` / `prod-N` from a counter it seeds past every loaded id. A loaded id past
 * 2^53 ("emp-9007199254740993") seeded a counter that `+= 1` could no longer move, so
 * every later hire got the SAME id: assigning, training or firing one of them hit all
 * of them, and the loader's keep-first dedupe deleted the rest (signing bonuses paid)
 * on the next launch. Same for launched products.
 */
const HUGE = "9007199254740993";
const person = (id: string): Employee => ({
  id, name: "A B", roleId: "staff_engineer", level: 1, trait: null, assignedProductId: null, training: null,
});

function backup(): string {
  let s: GameState = createInitialState();
  s.prestige.ships = 3;
  s.research = ["backprop"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.of(1e9) };
  s.products.drafts = [{ id: "d0", quality: 5, ships: 1 }];
  s = launchDraft(s, { draftId: "d0", type: "code", name: "Old", id: `prod-${HUGE}` });
  s.products.drafts = [{ id: "d1", quality: 5, ships: 2 }, { id: "d2", quality: 5, ships: 3 }];
  s.employees = [person(`emp-${HUGE}`), person("emp-3")];
  return serialize(s);
}

let store: Record<string, string>;
let prevStorage: unknown;
beforeEach(() => {
  store = {};
  prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
});
afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
});

describe("ids minted after restoring a backup with an out-of-range id", () => {
  it("every new hire gets its own id, and all of them survive a reload", () => {
    expect(useGame.getState().importSave(backup())).toBe(true);
    const cand = { name: "Ada", roleId: "staff_engineer", trait: null };
    useGame.setState({ candidates: [cand, cand, cand] });
    for (let i = 0; i < 3; i++) expect(useGame.getState().doHireCandidate(0)).toBe(true);
    const ids = useGame.getState().game.employees.map((e) => e.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(deserialize(serialize(useGame.getState().game)).employees).toHaveLength(5);
  });

  it("every newly launched product gets its own id", () => {
    expect(useGame.getState().importSave(backup())).toBe(true);
    expect(useGame.getState().doLaunchDraft("d1", "code", "A")).toBe(true);
    expect(useGame.getState().doLaunchDraft("d2", "code", "B")).toBe(true);
    const ids = useGame.getState().game.products.active.map((p) => p.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("a normal backup still seeds past its own ids", () => {
    let s = createInitialState();
    s.research = ["backprop"];
    s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.of(1e9) };
    s.employees = [person("emp-40")];
    expect(useGame.getState().importSave(serialize(s))).toBe(true);
    useGame.setState({ candidates: [{ name: "Ada", roleId: "staff_engineer", trait: null }] });
    useGame.getState().doHireCandidate(0);
    const minted = useGame.getState().game.employees.map((e) => e.id).filter((id) => id !== "emp-40");
    expect(minted).toHaveLength(1);
    expect(Number(minted[0]!.slice(4))).toBeGreaterThan(40);
  });
});
