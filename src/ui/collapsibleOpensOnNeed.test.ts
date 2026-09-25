import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { Collapsible } from "./Collapsible";
import { GoalsPanel } from "./GoalsPanel";
import { hookHost, findElements } from "./hookHost";
import { createInitialState } from "../engine/state";
import { contractBoard } from "../engine/contracts";
import { Big } from "../engine/math/Big";

/**
 * A fold's `defaultOpen` is its "something in here needs you" signal: GOALS passes
 * `counts.contracts > 0` for Contracts, and the same for a Doctrine perk to claim, a
 * Grand Challenge fork, a running Trial. It was read once, at mount. A player on
 * GOALS › Now (claiming Objectives, say) with Contracts folded, when a contract came
 * due (Seed Round and Seven Figures fill from income, a "Save for this" pin lands the
 * first research node) got the "Claim the … contract" chip, tapped it — and nothing
 * happened: the chip lands on GOALS › Now, already on screen, and the claim button
 * stayed inside the shut fold. A fold now opens when its need arrives.
 */
const body = (tree: ReactElement) => findElements(tree, (el) => el.props && (el.props as { className?: string }).className === "collapsible-body").length > 0;
const props = (defaultOpen: boolean) => ({ title: "Contracts", defaultOpen, children: createElement("p", null, "Claim") });

describe("a fold and the need that opens it", () => {
  it("opens when its need arrives after it mounted shut", () => {
    const host = hookHost();
    expect(body(host.render(Collapsible, props(false)))).toBe(false);
    host.render(Collapsible, props(true));
    expect(body(host.render(Collapsible, props(true)))).toBe(true);
  });

  it("stays shut once the player closes it, while the same need stands", () => {
    const host = hookHost();
    const tree = host.render(Collapsible, props(true));
    expect(body(tree)).toBe(true);
    const toggle = findElements(tree, (el) => (el.props as { className?: string }).className === "collapsible-toggle")[0]!;
    (toggle.props as { onClick: () => void }).onClick();
    expect(body(host.render(Collapsible, props(true)))).toBe(false);
    expect(body(host.render(Collapsible, props(true)))).toBe(false);
  });

  it("does not snap shut under the player's thumb when the need is met", () => {
    const host = hookHost();
    host.render(Collapsible, props(true));
    host.render(Collapsible, props(false));
    expect(body(host.render(Collapsible, props(false)))).toBe(true);
  });

  it("GOALS › Now asks the Contracts fold to open once a contract is due", () => {
    const base = createInitialState();
    const noop = () => {};
    const panel = (game: ReturnType<typeof createInitialState>) => hookHost().render(GoalsPanel, {
      game, section: "now", onSection: noop, onClaimObjective: noop, onClaimContract: noop, onClaimSponsor: noop,
      onFundChallenge: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop,
      onStartTrial: noop, onAbandonTrial: noop, onClaimDoctrine: noop, onCollectionSeen: noop,
    });
    const fold = (tree: ReactElement) => findElements(tree, (el) => el.type === Collapsible && (el.props as { title: string }).title === "Contracts")[0]!;
    const waiting = { ...base, resources: { ...base.resources, data: Big.of(5) }, lifetimeMoney: Big.of(5), stats: { ...base.stats, totalMoney: Big.of(5) } };
    expect(contractBoard(waiting).some((c) => c.ready)).toBe(false);
    expect((fold(panel(waiting)).props as { defaultOpen: boolean }).defaultOpen).toBe(false);
    const due = { ...waiting, research: ["backprop"] };
    expect(contractBoard(due).some((c) => c.ready)).toBe(true);
    expect((fold(panel(due)).props as { defaultOpen: boolean }).defaultOpen).toBe(true);
  });
});
