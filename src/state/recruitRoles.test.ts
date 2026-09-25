import { describe, it, expect } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { productsUnlocked } from "../engine/products";
import { balance } from "../engine/balance/config";

/** Recruits only offer roles that can do something yet (r4 bug hunt). */
const productRoles = new Set(balance.staff.roles.filter((r) => r.team === "product").map((r) => r.id));

describe("recruit rolls", () => {
  it("offer no product-team roles before products exist", () => {
    const g = createInitialState();
    g.research = ["backprop"];
    expect(productsUnlocked(g)).toBe(false);
    useGame.setState({ game: g, candidates: [] });
    for (let i = 0; i < 60; i++) {
      useGame.getState().doRefreshCandidates();
      for (const c of useGame.getState().candidates ?? []) expect(productRoles.has(c.roleId)).toBe(false);
    }
  });

  it("offer the whole roster once products are open", () => {
    const g = createInitialState();
    g.prestige.ships = 2;
    g.research = ["backprop"];
    expect(productsUnlocked(g)).toBe(true);
    useGame.setState({ game: g, candidates: [] });
    let sawProduct = false;
    for (let i = 0; i < 60 && !sawProduct; i++) {
      useGame.getState().doRefreshCandidates();
      sawProduct = (useGame.getState().candidates ?? []).some((c) => productRoles.has(c.roleId));
    }
    expect(sawProduct).toBe(true);
  });
});
