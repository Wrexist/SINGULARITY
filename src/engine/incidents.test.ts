import { describe, it, expect } from "vitest";
import { workProblem } from "./actions";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import type { ActiveModifier } from "./types";

const bad = (id: string, remainingSec = 60): ActiveModifier => ({
  id,
  target: "computeMult",
  factor: 0.6,
  remainingSec,
  label: "Compute ×0.6",
  tone: "bad",
});

describe("incident theater — workProblem (IDEAS #5)", () => {
  it("shaves a flat bounded slice off a bad modifier, once", () => {
    const s = createInitialState();
    s.modifiers = [bad("gpu_shortage")];
    const next = workProblem(s, "gpu_shortage");
    expect(next.modifiers[0]!.remainingSec).toBe(60 - balance.worldEvents.workShaveSec);
    expect(next.modifiers[0]!.worked).toBe(true);
    // Second tap: same-ref no-op — the shave is once per incident.
    expect(workProblem(next, "gpu_shortage")).toBe(next);
  });

  it("never goes below zero and ignores good/unknown/expired modifiers", () => {
    const s = createInitialState();
    s.modifiers = [
      bad("almost_done", 4),
      { ...bad("hype"), tone: "good" as const },
      bad("expired", 0),
    ];
    const shaved = workProblem(s, "almost_done");
    expect(shaved.modifiers[0]!.remainingSec).toBe(0); // clamped
    expect(workProblem(s, "hype")).toBe(s); // good tone → no-op
    expect(workProblem(s, "expired")).toBe(s); // already over → no-op
    expect(workProblem(s, "nope")).toBe(s); // unknown id → no-op
  });

  it("only touches the targeted modifier", () => {
    const s = createInitialState();
    s.modifiers = [bad("a"), bad("b")];
    const next = workProblem(s, "b");
    expect(next.modifiers[0]!.remainingSec).toBe(60);
    expect(next.modifiers[0]!.worked).toBeUndefined();
    expect(next.modifiers[1]!.worked).toBe(true);
  });
});
