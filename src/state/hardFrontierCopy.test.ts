import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useGame } from "./store";
import { prestige, type ShipMode } from "../engine/prestige";
import { tick } from "../engine/tick";
import { launchDraft, typeDef, rivalLead } from "../engine/products";
import { createInitialState } from "../engine/state";
import { summarizeWindow } from "../engine/offline";
import { versionShipNote, versionsShipNote } from "../engine/notices";
import { balance } from "../engine/balance/config";
import { productMilestones } from "../engine/balance/products";
import { Big } from "../engine/math/Big";
import { OfflineModal } from "../ui/OfflineModal";
import type { GameState, ProductState } from "../engine/types";

/**
 * A Hard ship keeps rivals ahead for the whole generation: a new version reaches the
 * frontier LESS their lead (products.ts rivalLead/reachableQuality). The version-shipped
 * notice and the "while you were away" recap still told the player the product was
 * "back at the frontier". In a Hard generation they now say it got as close as rivals
 * allow; every other generation reads exactly as before.
 */

/** A lab one Ship past `mode`, carrying one product (or two) whose version is about to land. */
function genAfter(mode: ShipMode, products = 1): GameState {
  let s = createInitialState();
  s.prestige.ships = 6;
  s.research = [balance.prestige.capabilityResearch];
  s.lifetimeMoney = Big.of(1e10);
  s.products.frontier = 10;
  s.products.drafts = [{ id: "draft-1", quality: 10, ships: 1 }];
  s = launchDraft(s, { draftId: "draft-1", type: "general", name: "Chat", id: "prod-1" });
  s = prestige(s, mode);
  const base = s.products.active[0]!;
  const almostDone = (p: ProductState, id: string, name: string): ProductState => ({
    ...p, id, name, mau: typeDef("general").tam,
    upgrade: { targetVersion: p.version + 1, remainingCompute: 0, remainingData: 0, remainingSec: 0.05, totalSec: 60 },
  });
  const active = [almostDone(base, "prod-1", "Chat")];
  if (products > 1) active.push(almostDone(base, "prod-2", "Code"));
  // Milestones already held, so the recap's few story lines go to the version.
  return { ...s, products: { ...s.products, active, milestones: productMilestones.map((m) => m.id) } };
}

/** A product name whose single-version notice uses the frontier line (the pool is
 *  picked by a stable hash of name + version). */
function frontierName(version: number): string {
  for (let i = 0; i < 500; i++) {
    const n = `Model ${i}`;
    if (versionShipNote(n, version).includes("back at the frontier")) return n;
  }
  throw new Error("no name lands on the frontier line");
}

describe("a Hard generation's version copy says rivals are still ahead", () => {
  it("the Hard fixture really keeps a rival lead (and Deploy does not)", () => {
    expect(rivalLead(genAfter("hard"))).toBeGreaterThan(0);
    expect(rivalLead(genAfter("deploy"))).toBe(0);
  });

  it("the single-version notice drops the frontier line in a Hard generation only", () => {
    const n = frontierName(4);
    expect(versionShipNote(n, 4)).toBe(`${n} v4 shipped — back at the frontier`);
    expect(versionShipNote(n, 4, false)).toBe(`${n} v4 shipped — back at the frontier`);
    expect(versionShipNote(n, 4, true)).toBe(`${n} v4 shipped — as close as rivals allow`);
    // Other tails are true either way, so they are untouched.
    for (let v = 1; v < 40; v++) {
      const plain = versionShipNote("Chat", v);
      if (!plain.includes("frontier")) expect(versionShipNote("Chat", v, true)).toBe(plain);
      expect(versionShipNote("Chat", v, true)).not.toMatch(/frontier/);
    }
  });

  it("the several-at-once notice follows the same rule", () => {
    expect(versionsShipNote(3)).toBe("3 products shipped new versions — back at the frontier");
    expect(versionsShipNote(3, true)).toBe("3 products shipped new versions — as close as rivals allow");
  });

  it("the offline recap says 'as close as rivals allow' in a Hard generation, 'back at the frontier' otherwise", () => {
    const recap = (mode: ShipMode) => {
      const before = genAfter(mode);
      const after = tick(before, 1000);
      expect(after.products.active[0]!.version).toBe(before.products.active[0]!.version + 1);
      const summary = summarizeWindow(before, after, 3_600_000, 3_600_000);
      return renderToStaticMarkup(createElement(OfflineModal, { summary, onClose: () => {} }));
    };
    const hard = recap("hard");
    expect(hard).toContain("as close as rivals allow");
    expect(hard).not.toContain("back at the frontier");
    const deploy = recap("deploy");
    expect(deploy).toContain("back at the frontier");
    expect(deploy).not.toContain("as close as rivals allow");
  });
});

describe("the live version-shipped notice", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0.99); });

  function shipNotices(start: GameState): string[] {
    useGame.setState({ game: start, offline: null, notice: null, event: null, worldEvent: null });
    const out: string[] = [];
    for (let i = 0; i < 60; i++) {
      useGame.getState().advance(100, 100);
      const n = useGame.getState().notice;
      if (n && /shipped/.test(n.message) && !out.includes(n.message)) out.push(n.message);
    }
    return out;
  }

  it("two versions landing together in a Hard generation read as close as rivals allow", () => {
    expect(shipNotices(genAfter("hard", 2))).toEqual(["2 products shipped new versions — as close as rivals allow"]);
  });

  it("one version landing in a Hard generation never claims the frontier", () => {
    const s = genAfter("hard");
    const v = s.products.active[0]!.version + 1;
    const n = frontierName(v);
    const one = { ...s, products: { ...s.products, active: [{ ...s.products.active[0]!, name: n }] } };
    expect(shipNotices(one)).toEqual([`${n} v${v} shipped — as close as rivals allow`]);
  });

  it("a Deploy generation is unchanged", () => {
    expect(shipNotices(genAfter("deploy", 2))).toEqual(["2 products shipped new versions — back at the frontier"]);
  });
});
