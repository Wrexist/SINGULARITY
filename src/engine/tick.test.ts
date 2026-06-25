import { describe, it, expect } from "vitest";
import { tick } from "./tick";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

describe("tick — passive compute", () => {
  it("accrues base compute over time", () => {
    const s = createInitialState();
    const next = tick(s, 10_000); // 10s
    expect(next.resources.compute.eq(balance.baseComputePerSec * 10)).toBe(true);
  });

  it("is deterministic: same inputs produce the same output", () => {
    const s = createInitialState();
    const a = tick(s, 5000);
    const b = tick(s, 5000);
    expect(a.resources.compute.eq(b.resources.compute)).toBe(true);
  });

  it("does not mutate the input state", () => {
    const s = createInitialState();
    tick(s, 5000);
    expect(s.resources.compute.eq(0)).toBe(true);
  });

  it("returns the same state for non-positive elapsed time", () => {
    const s = createInitialState();
    expect(tick(s, 0)).toBe(s);
  });
});

describe("tick — training run progression", () => {
  it("advances an active run and completes it into ready-to-claim", () => {
    const s = createInitialState();
    s.run = { active: true, progress: 0, readyToClaim: false };
    const d = derive(s);
    const next = tick(s, d.runDurationSec * 1000);
    expect(next.run.active).toBe(false);
    expect(next.run.readyToClaim).toBe(true);
  });

  it("does not auto-claim without the upgrade", () => {
    const s = createInitialState();
    s.run = { active: true, progress: 0, readyToClaim: false };
    const next = tick(s, 60_000);
    expect(next.resources.data.eq(0)).toBe(true);
    expect(next.run.readyToClaim).toBe(true);
  });
});

describe("tick — automation", () => {
  it("auto-claims a finished run and auto-trains the next one", () => {
    const s = createInitialState();
    s.upgrades = { auto_claim: 1, auto_train: 1 };
    s.resources.compute = Big.of(1_000_000);
    s.run = { active: true, progress: 0, readyToClaim: false };
    const next = tick(s, 60_000);
    // Many runs should have completed, paying out Data and Money.
    expect(next.resources.data.gt(0)).toBe(true);
    expect(next.resources.money.gt(0)).toBe(true);
  });
});

describe("tick — compute focus (auto-train banking)", () => {
  it("focus = 1 behaves like before: auto-train fires at runCost", () => {
    const s = createInitialState(); // computeFocus defaults to 1
    s.upgrades = { auto_train: 1 };
    s.resources.compute = Big.of(1e9);
    expect(tick(s, 1).run.active).toBe(true);
  });

  it("auto-train waits for runCost / focus, so Compute can bank up", () => {
    const s = createInitialState();
    s.upgrades = { auto_train: 1 };
    s.computeFocus = 0.5; // threshold = 2 × runCost
    const cost = derive(s).runComputeCost;
    // Between runCost and 2×runCost → auto-train holds, banking Compute.
    s.resources.compute = cost.mul(1.5);
    expect(tick(s, 1).run.active).toBe(false);
    // Above 2×runCost → it fires.
    const s2 = { ...s, resources: { ...s.resources, compute: cost.mul(2.5) } };
    expect(tick(s2, 1).run.active).toBe(true);
  });

  it("focus = 0 holds auto-train entirely (Compute banks, nothing spent)", () => {
    const s = createInitialState();
    s.upgrades = { auto_train: 1 };
    s.computeFocus = 0;
    s.resources.compute = Big.of(1e9);
    const next = tick(s, 1000);
    expect(next.run.active).toBe(false);
    expect(next.resources.compute.gt(1e9)).toBe(true); // income banked, no run cost
  });
});

describe("tick — passive money capability", () => {
  it("generates passive money once the inference API is researched", () => {
    const s = createInitialState();
    s.research = ["inference_api"];
    const next = tick(s, 10_000);
    expect(next.resources.money.gt(0)).toBe(true);
    expect(next.lifetimeMoney.gt(0)).toBe(true);
  });
});
