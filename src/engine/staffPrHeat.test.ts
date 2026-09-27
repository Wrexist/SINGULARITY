import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { maybeProductEvent, typeDef } from "./products";
import { derive } from "./derive";
import { products as B } from "./balance/products";
import { balance } from "./balance/config";
import type { Employee, GameState, ProductState } from "./types";

/**
 * Staff PR & Legal (round 8, owner call). The role sells "−10% product Heat, each",
 * but it only scaled a product TYPE's steady Heat — zero for five of the eight types
 * (General, Code, Reasoning, Multimodal, Fast API), where a PR hire bought nothing —
 * and the Heat a product really raises (a breach, a jailbreak, a hallucination in
 * front of a journalist) ignored it on every type. The same blind spot Trust & Safety
 * had (commit "Let Trust & Safety cut the Heat a product's incidents raise"): an
 * incident's Heat is now scaled by the product's Heat multiplier too, the one its
 * steady Heat already uses.
 */

const PR = balance.staff.roles.find((r) => r.id === "staff_pr")!;
const eventIndex = (id: string) => B.events.list.findIndex((e) => e.id === id);
const rollFor = (id: string) => (eventIndex(id) + 0.5) / B.events.list.length;

function pr(n: number, assigned: string | null): Employee[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, name: `PR ${i}`, roleId: PR.id, level: 1, trait: null, assignedProductId: assigned, training: null,
  }));
}

function lab(staff: Employee[]): GameState {
  const s = createInitialState();
  s.prestige.ships = 3;
  const p: ProductState = {
    id: "prod-1", name: "Nimbus", type: "general", version: 2, quality: s.products.frontier,
    priceMult: 1, enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 },
    mau: 1e6, paid: 1e4, buzzSec: 0, ageSec: 5_000, upgrade: null, features: [],
  };
  s.products = { ...s.products, active: [p] };
  s.employees = staff;
  s.heat = 10;
  return s;
}

describe("Staff PR cuts the Heat a product's incidents raise", () => {
  it("the General Assistant has no steady Heat for PR to cut (the premise)", () => {
    expect(typeDef("general").heatPerSec).toBe(0);
    expect(PR.effect).toMatchObject({ kind: "product", lane: "heat" });
  });

  for (const id of ["breach", "jailbreak", "hallucination"]) {
    it(`${id}: less Heat with PR on the product, full Heat without`, () => {
      const ev = B.events.list[eventIndex(id)]!;
      const plain = maybeProductEvent(lab([]), 10, 0, 0, rollFor(id))!;
      const staffed = lab(pr(2, "prod-1"));
      const mult = derive(staffed).productModsById["prod-1"]!.heat;
      expect(mult).toBeLessThan(1);
      const safe = maybeProductEvent(staffed, 10, 0, 0, rollFor(id))!;
      expect(plain.state.heat).toBeCloseTo(10 + ev.heat!, 9);
      expect(safe.state.heat).toBeCloseTo(10 + ev.heat! * mult, 9);
    });
  }

  it("a benched PR hire helps every product's incidents too (company-wide buff)", () => {
    const benched = lab(pr(1, null));
    const mult = derive(benched).productModsById["prod-1"]!.heat;
    expect(mult).toBeLessThan(1);
    const r = maybeProductEvent(benched, 10, 0, 0, rollFor("breach"))!;
    expect(r.state.heat).toBeCloseTo(10 + B.events.list[eventIndex("breach")]!.heat! * mult, 9);
  });

  it("still clamps to the Heat ceiling", () => {
    const s = { ...lab(pr(1, "prod-1")), heat: 99.9 };
    const r = maybeProductEvent(s, 10, 0, 0, rollFor("breach"))!;
    expect(r.state.heat).toBeLessThanOrEqual(balance.heat.max);
  });
});
