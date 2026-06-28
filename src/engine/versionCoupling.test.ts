import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { versionCost, versionCostFor } from "./products";
import { derive } from "./derive";
import { products as B } from "./balance/products";

/**
 * R4.3 re-coupling: a new version costs `versionDataSecondsOfOutput` seconds of the
 * player's current Data output ON TOP of the flat base, so Data stays a real sink in
 * the endgame instead of decaying to nothing against exponential Data production.
 */
describe("version cost Data re-coupling (R4.3)", () => {
  it("with no Data production the live cost equals the flat base (curve-safe)", () => {
    const s = createInitialState();
    // A fresh lab produces no Data (no scraper, no run yielding), so the economy term is 0.
    expect(derive(s).dataPerSec.toNumber()).toBe(0);
    const v = 1;
    expect(versionCostFor(s, v).data).toBeCloseTo(versionCost(v).data, 6);
    expect(versionCostFor(s, v).compute).toBe(versionCost(v).compute); // compute untouched
  });

  it("adds exactly N seconds of current Data output to the Data cost", () => {
    const s = createInitialState();
    // Stand up some Data production via the scraper line so dataPerSec > 0.
    s.upgrades.web_scraper = 5;
    const dps = derive(s).dataPerSec.toNumber();
    expect(dps).toBeGreaterThan(0);
    const v = 3;
    const expected = versionCost(v).data + dps * B.versionDataSecondsOfOutput;
    expect(versionCostFor(s, v).data).toBeCloseTo(expected, 3);
  });

  it("scales with the economy: more Data output → strictly higher version cost", () => {
    const lo = createInitialState();
    lo.upgrades.web_scraper = 2;
    const hi = createInitialState();
    hi.upgrades.web_scraper = 20;
    expect(versionCostFor(hi, 1).data).toBeGreaterThan(versionCostFor(lo, 1).data);
  });
});
