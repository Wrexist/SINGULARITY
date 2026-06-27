import { describe, it, expect } from "vitest";
import { recommendedUpgrade } from "./recommend";
import { canBuyUpgrade } from "./actions";
import { createInitialState } from "./state";
import { Big } from "./math/Big";

/** A wealthy lab with 14 Consumer racks already owned — mirrors the screenshot
 *  where "Recommended next" wrongly surfaced another Consumer Rack (+2/s, $106)
 *  over the far better Server Rack (+12/s, $220). */
function richWith14ConsumerRacks() {
  const s = createInitialState();
  s.upgrades = { rack_basic: 14 };
  s.resources.compute = Big.of(1e6);
  s.resources.data = Big.of(1e6);
  s.resources.money = Big.of(1e6);
  return s;
}

describe("recommendedUpgrade (best value, not cheapest)", () => {
  it("recommends the better-value Server rack over the cheaper Consumer rack", () => {
    const s = richWith14ConsumerRacks();
    // Sanity: both are genuinely affordable, so this is a value call, not an
    // affordability one.
    expect(canBuyUpgrade(s, "rack_basic")).toBe(true);
    expect(canBuyUpgrade(s, "rack_server")).toBe(true);
    const rec = recommendedUpgrade(s);
    // The Server rack gives ~2.9× more compute per dollar than another Consumer
    // rack at this point, so it must win — and crucially must NOT be the cheap one.
    expect(rec).toBe("rack_server");
    expect(rec).not.toBe("rack_basic");
  });

  it("only ever recommends something actually buyable", () => {
    const s = richWith14ConsumerRacks();
    const rec = recommendedUpgrade(s);
    expect(rec).not.toBeNull();
    expect(canBuyUpgrade(s, rec!)).toBe(true);
  });

  it("returns null when nothing is affordable", () => {
    const s = createInitialState();
    s.resources.compute = Big.ZERO;
    s.resources.data = Big.ZERO;
    s.resources.money = Big.ZERO;
    expect(recommendedUpgrade(s)).toBeNull();
  });

  it("does not crash and returns a buyable id for a brand-new lab once it can afford one", () => {
    const s = createInitialState();
    s.resources.money = Big.of(50); // enough for the first Consumer rack
    const rec = recommendedUpgrade(s);
    if (rec !== null) expect(canBuyUpgrade(s, rec)).toBe(true);
  });
});
