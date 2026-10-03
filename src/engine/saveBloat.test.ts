import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { derive } from "./derive";

/**
 * Hostile-save hardening (2026-10 audit). Each case was reproduced through the real
 * deserialize: a crafted buff that never expired, unknown keys and megabyte strings that
 * rode every autosave, repeated achievement / milestone / draft ids. All clamp or filter
 * — none wipes the save.
 */
const roundTrip = (mutate: (raw: Record<string, any>) => void) => {
  const raw = JSON.parse(serialize(createInitialState())) as Record<string, any>;
  mutate(raw);
  return deserialize(JSON.stringify(raw));
};
const MB = "x".repeat(1_000_000);

describe("modifiers", () => {
  it("a crafted buff is clamped to the game's band, not kept at ×1e300 forever", () => {
    const base = derive(createInitialState()).computePerSec.toNumber();
    const g = roundTrip((r) => {
      r.modifiers = [{ id: "evil", target: "computeMult", factor: 1e300, remainingSec: 1e300, label: MB, tone: "good", junk: MB }];
    });
    const m = g.modifiers[0]!;
    expect(m.factor).toBeLessThanOrEqual(10);
    expect(m.remainingSec).toBeLessThanOrEqual(3600);
    expect(m.label.length).toBeLessThanOrEqual(64);
    expect("junk" in m).toBe(false);
    expect(derive(g).computePerSec.toNumber()).toBeLessThanOrEqual(base * 10 + 1e-9);
  });

  it("a real buff loads unchanged", () => {
    const mod = { id: "daily_computeMult", target: "computeMult", factor: 1.5, remainingSec: 120, label: "Daily ×1.5", tone: "good" };
    const g = roundTrip((r) => { r.modifiers = [mod]; });
    expect(g.modifiers).toEqual([mod]);
  });
});

describe("bloat", () => {
  it("unknown keys and huge strings do not survive a load", () => {
    const g = roundTrip((r) => {
      r.products.junk = MB;
      r.employees = [{ id: "emp-1", name: MB + "‮", roleId: "staff_researcher", level: 1, trait: null, assignedProductId: null, training: null }];
    });
    const out = serialize(g);
    expect(out.length).toBeLessThan(200_000);
    expect("junk" in g.products).toBe(false);
    expect(g.employees).toHaveLength(1);
    for (const e of g.employees) {
      expect(e.name.length).toBeLessThanOrEqual(40);
      expect(e.name).not.toMatch(/‮/);
    }
  });
});

describe("collections", () => {
  it("achievements and milestones keep known ids, each once", () => {
    const g = roundTrip((r) => {
      r.achievements = ["compute_1k", "compute_1k", "bogus"];
      r.products.milestones = ["first_launch", "first_launch", "nope"];
    });
    expect(g.achievements).toEqual(["compute_1k"]);
    expect(g.products.milestones).toEqual(["first_launch"]);
  });

  it("drafts keep one per id with a sane ship count", () => {
    const g = roundTrip((r) => {
      r.products.drafts = [{ id: "d1", quality: 5, ships: -5 }, { id: "d1", quality: 9, ships: 1e300 }, { id: "d2", quality: 3, ships: 1e300 }];
    });
    expect(g.products.drafts.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(g.products.drafts[0]!.ships).toBe(0);
    expect(g.products.drafts[1]!.ships).toBeLessThanOrEqual(1e7);
  });
});
