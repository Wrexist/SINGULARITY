import { describe, it, expect } from "vitest";
import { upgradeFlavor } from "./flavor";

describe("R7.1 — tiered upgrade flavor", () => {
  it("falls back to the base description below the first tier", () => {
    expect(upgradeFlavor("rack_basic", 0, "base")).toBe("base");
    expect(upgradeFlavor("rack_basic", 5, "base")).toBe("base"); // first tier is at 6
  });

  it("escalates as you own more, picking the highest reached tier", () => {
    const at6 = upgradeFlavor("rack_basic", 6, "base");
    const at16 = upgradeFlavor("rack_basic", 16, "base");
    const at30 = upgradeFlavor("rack_basic", 30, "base");
    expect(at6).not.toBe("base");
    expect(at16).not.toBe(at6);
    expect(at30).not.toBe(at16);
    // Way past the top tier still shows the top tier (no overflow).
    expect(upgradeFlavor("rack_basic", 999, "base")).toBe(at30);
  });

  it("returns the fallback for upgrades with no tiered flavor", () => {
    expect(upgradeFlavor("auto_train", 50, "automate it")).toBe("automate it");
  });
});
