import { describe, it, expect } from "vitest";
import { effectLabel } from "./effectVisual";
import { balance } from "../engine/balance/config";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";

/**
 * The Inference API research card (bug hunt r7, goal copy parity). Its effect pill
 * read "+$0.3/s passive", but the node pays 0.3 Money/sec for EVERY Compute/sec the
 * lab produces (derive: passiveMoneyPerSec × computePerSec). A lab at 5,000 Compute/s
 * earns $1,500/s from it, five thousand times what the card promised, so the node
 * that gates the first Ship looked like the weakest buy on the tree.
 */

const node = balance.research.find((r) => r.effect.kind === "unlockPassiveMoney")!;
const perSec = (node.effect as { perSec: number }).perSec;

describe("the passive-income research card quotes what it pays", () => {
  it("pays perSec Money/sec per Compute/sec (the premise)", () => {
    const s = createInitialState();
    s.upgrades.rack_server = 40;
    const before = derive(s);
    const d = derive({ ...s, research: [node.id] });
    expect(before.passiveMoneyPerSec.eq(0)).toBe(true);
    expect(d.passiveMoneyPerSec.div(d.computePerSec).toNumber()).toBeCloseTo(perSec, 12);
    expect(d.passiveMoneyPerSec.toNumber()).toBeGreaterThan(100 * perSec); // far above "$0.3/s"
  });

  it("names the rate per Compute/s, not a flat $/s", () => {
    const label = effectLabel(node.effect);
    expect(label).toContain(`$${perSec}/s`);
    expect(label).toMatch(/per Compute\/s/);
  });
});
