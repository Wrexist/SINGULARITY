import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { startRun, claimRun } from "./actions";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * A run is paid for when it STARTS (runComputeCost at the intensity then in effect), so
 * its payout must be priced at that same intensity — not at whatever the Training
 * intensity slider reads when the run is claimed. It used to re-derive at claim time:
 * easing the slider mid-run (which "Save for this" and the advisor both tell players to
 * do) cut the in-flight run's payout by up to 70%, and the reverse — start a 30%-cost
 * light run, crank the slider before it lands — paid 3.3x the Compute invested.
 */
function lab(focus: number, automation = false): GameState {
  const s = createInitialState();
  s.upgrades = { rack_basic: 20, rack_server: 5, ...(automation ? { auto_claim: 1, auto_train: 1 } : {}) };
  s.resources = { compute: Big.of(1e6), data: Big.ZERO, money: Big.ZERO };
  s.computeFocus = focus;
  return s;
}

/** Start a run by hand at `startFocus`, move the slider to `claimFocus`, finish + claim. */
function manualCycle(startFocus: number, claimFocus: number) {
  let s = lab(startFocus);
  const atStart = derive(s);
  const c0 = s.resources.compute;
  s = startRun(s);
  const paid = c0.sub(s.resources.compute);
  s = { ...s, computeFocus: claimFocus };
  s = tick(s, 10_000);
  expect(s.run.readyToClaim).toBe(true);
  const before = { data: s.resources.data, money: s.resources.money };
  s = claimRun(s);
  return {
    atStart,
    paid,
    data: s.resources.data.sub(before.data),
    money: s.resources.money.sub(before.money),
  };
}

const ratio = (a: Big, b: Big) => a.div(b).toNumber();

describe("run payout is priced at the intensity the run started at", () => {
  it("easing the slider mid-run no longer shrinks the run already paid for", () => {
    const r = manualCycle(1, 0);
    expect(r.paid.eq(r.atStart.runComputeCost)).toBe(true);
    expect(ratio(r.money, r.atStart.runMoneyYield)).toBeCloseTo(1, 9);
    expect(ratio(r.data, r.atStart.runDataYield)).toBeCloseTo(1, 9);
  });

  it("cranking the slider mid-run no longer inflates a light run (no free lunch)", () => {
    const r = manualCycle(0, 1);
    expect(ratio(r.money, r.atStart.runMoneyYield)).toBeCloseTo(1, 9);
    expect(ratio(r.data, r.atStart.runDataYield)).toBeCloseTo(1, 9);
  });

  it("an unchanged slider pays exactly the derived yield (identity for the tuned curve)", () => {
    const r = manualCycle(1, 1);
    expect(r.money.eq(r.atStart.runMoneyYield)).toBe(true);
    expect(r.data.eq(r.atStart.runDataYield)).toBe(true);
  });

  it("the auto-train / auto-claim path in tick() pays the started intensity too", () => {
    let s = lab(1, true);
    s.resources.compute = Big.ZERO;
    const full = derive(s);
    s = { ...s, resources: { ...s.resources, compute: full.runComputeCost } };
    s = tick(s, 50); // auto-train fires a full-intensity run
    expect(s.run.active).toBe(true);
    s = { ...s, computeFocus: 0 }; // e.g. a "Save for this" pin holding training
    const before = s.resources.money;
    s = tick(s, 6_000); // the run lands and auto-claims; focus 0 starts no new one
    expect(s.run.active).toBe(false);
    expect(ratio(s.resources.money.sub(before), full.runMoneyYield)).toBeCloseTo(1, 9);
  });

  it("a run left waiting for its claim is paid at its own intensity when auto-claim takes it", () => {
    let s = lab(1);
    s = startRun(s);
    s = tick(s, 10_000);
    expect(s.run.readyToClaim).toBe(true);
    const full = derive(s);
    s = { ...s, computeFocus: 0.2, upgrades: { ...s.upgrades, auto_claim: 1 } };
    const before = s.resources.data;
    s = tick(s, 100);
    expect(s.run.readyToClaim).toBe(false);
    expect(ratio(s.resources.data.sub(before), full.runDataYield)).toBeCloseTo(1, 9);
  });
});

describe("run intensity persists (save v37)", () => {
  it("round-trips the started intensity of an in-flight run", () => {
    let s = startRun(lab(0.25));
    s = { ...s, computeFocus: 0.9 };
    const back = deserialize(serialize(s));
    expect(back.run.active).toBe(true);
    expect(back.run.focus).toBe(0.25);
    expect(back.computeFocus).toBe(0.9);
  });

  it("a v36 save's in-flight run is priced at the saved slider, exactly as before", () => {
    const s = lab(0.4);
    const raw = JSON.parse(serialize({ ...s, run: { active: true, progress: 0.5, readyToClaim: false } }));
    raw.version = 36;
    delete raw.run.focus;
    const back = deserialize(JSON.stringify(raw));
    expect(back.version).toBe(37);
    expect(back.run.focus).toBe(0.4);
    const ready = { ...raw, run: { active: false, progress: 1, readyToClaim: true } };
    expect(deserialize(JSON.stringify(ready)).run.focus).toBe(0.4);
  });

  it("sanitizes a hostile run intensity instead of trusting or wiping it", () => {
    const s = lab(0.6);
    const base = JSON.parse(serialize({ ...s, run: { active: true, progress: 0.3, readyToClaim: false } }));
    const load = (focus: unknown) => deserialize(JSON.stringify({ ...base, run: { ...base.run, focus } })).run;
    expect(load(7).focus).toBe(1);
    expect(load(-3).focus).toBe(0);
    expect(load("1").focus).toBe(0.6); // not a number → the saved slider
    expect(load(null).focus).toBe(0.6);
    // Idle runs carry no intensity at all.
    const idle = deserialize(JSON.stringify({ ...base, run: { active: false, progress: 0, readyToClaim: false, focus: 0.1 } })).run;
    expect(idle.focus).toBeUndefined();
    expect(load(0.3).progress).toBe(0.3);
  });
});
