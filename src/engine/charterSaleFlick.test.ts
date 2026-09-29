import { describe, it, expect } from "vitest";
import { launchDraft, retirePayout, retireProduct, milestoneValue } from "./products";
import { setCharter, lockCharter, canSetCharter, charterHand } from "./charter";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { products as B } from "./balance/products";
import type { GameState } from "./types";

/**
 * r6 exploit hunt: the Product Company charter multiplies every product's ARPU ×2.5,
 * and a sale (and the revenue ladders) is priced on that buffed revenue. At the start
 * of a run the charter is still open to change, so a player could pick Product
 * Company, sell every product at ×2.5 and pick Cash Machine in the same frame: the
 * run never flew the charter, and the sale paid 2.5× what the product earned. The same
 * flick lifted the permanent peakMrr (contracts, sponsor, achievements) and the $/s
 * milestones. A charter still open to change is not counted until it is locked.
 */

/** Ship 10 deals Product Company and Cash Machine; a mature, settled Code product. */
function matureLab(): GameState {
  let s = createInitialState();
  s.prestige.ships = 10;
  s.products.drafts = [{ id: "draft-1", quality: 20, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "code", name: "Coder", id: "prod-1" });
  s = {
    ...s,
    products: {
      ...s.products,
      active: s.products.active.map((p) => ({ ...p, mau: 400_000, ageSec: 2 * B.retireMaturitySec })),
    },
  };
  for (let i = 0; i < 600; i++) s = tick(s, 1000);
  return s;
}

describe("a charter picked and dropped in one frame", () => {
  it("deals both charters and leaves the start-of-run window open", () => {
    const s = matureLab();
    expect(charterHand(s)).toEqual(expect.arrayContaining(["product_company", "cash_machine"]));
    expect(canSetCharter(s)).toBe(true);
  });

  it("can't sell a product at the Product Company price for a run that flies another charter", () => {
    const s = matureLab();
    const fair = retirePayout(s, "prod-1");
    expect(fair).toBeGreaterThan(0);
    const picked = setCharter(s, "product_company");
    expect(picked.charter).toBe("product_company");
    const flicked = setCharter(retireProduct(picked, "prod-1"), "cash_machine");
    expect(flicked.charter).toBe("cash_machine");
    const gained = flicked.resources.money.sub(s.resources.money).toNumber();
    expect(gained).toBeLessThanOrEqual(fair * 1.001);
    expect(flicked.lifetimeMoney.sub(s.lifetimeMoney).toNumber()).toBeLessThanOrEqual(fair * 1.001);
  });

  it("still pays the charter's price once the run commits to it", () => {
    const s = matureLab();
    const fair = retirePayout(s, "prod-1");
    const locked = lockCharter(setCharter(s, "product_company"));
    expect(canSetCharter(locked)).toBe(false);
    expect(retirePayout(locked, "prod-1")).toBeGreaterThan(fair * 2.4);
    const sold = retireProduct(locked, "prod-1");
    expect(sold.resources.money.sub(locked.resources.money).toNumber()).toBeCloseTo(retirePayout(locked, "prod-1"), 0);
  });

  it("can't lift the permanent revenue peak or a $/s milestone with the flick", () => {
    const s = matureLab();
    const flicked = setCharter(tick(setCharter(s, "product_company"), 100), "cash_machine");
    const control = tick(s, 100);
    expect(flicked.stats.peakMrr).toBeLessThanOrEqual(control.stats.peakMrr * 1.001);
    expect(flicked.products.milestones).toEqual(control.products.milestones);
    // Committed, the charter's revenue counts on the very next tick.
    const flown = tick(lockCharter(setCharter(s, "product_company")), 100);
    expect(flown.stats.peakMrr).toBeGreaterThan(control.stats.peakMrr * 2.4);
    expect(milestoneValue(lockCharter(setCharter(s, "product_company")), "mrr"))
      .toBeGreaterThan(milestoneValue(s, "mrr") * 2.4);
  });
});
