import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { ContractsPanel } from "./ContractsPanel";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { fmtFloor } from "./format";
import { useSettings } from "./settings";
import { createInitialState } from "../engine/state";
import { objectives as O } from "../engine/balance/objectives";
import { contracts as CONTRACTS } from "../engine/balance/contracts";
import { challenges as C } from "../engine/balance/challenges";
import { objectiveBoard } from "../engine/objectives";
import { contractBoard } from "../engine/contracts";
import { challengeView } from "../engine/challenges";
import { Big } from "../engine/math/Big";

/**
 * "X / target" counters a hair short of the target (bug hunt r4, number formatting).
 * The counters used the display formatter, which rounds to three significant figures —
 * so 4,996 of a 5,000 Compute/sec objective read "5K / 5K", 999,600 of the Megacluster
 * contract read "1M / 1M", and a Grand Challenge lane funded to $24.96B of $25B read
 * "$25B / $25B" with no check mark and a "100%" bar, while nothing could be claimed and
 * the Fund button still asked for more. Peak metrics plateau between purchases, so such
 * a card can sit there indefinitely. The progress side of a counter must never round up
 * onto its target.
 */

const noop = () => {};
afterEach(() => useSettings.setState({ scientificNotation: false }));

describe("fmtFloor", () => {
  it("rounds down at the display precision, and is exact on round values", () => {
    expect(fmtFloor(Big.of(4_996))).toBe("4.99K");
    expect(fmtFloor(Big.of(999_600))).toBe("999K");
    expect(fmtFloor(Big.of(24.96e9))).toBe("24.9B");
    expect(fmtFloor(Big.of(9.96))).toBe("9.9");
    expect(fmtFloor(Big.of(5_000))).toBe("5K");
    expect(fmtFloor(Big.of(1_150))).toBe("1.15K");
    expect(fmtFloor(Big.of(0.3))).toBe("0.3");
    expect(fmtFloor(Big.of(12))).toBe("12");
    expect(fmtFloor(Big.of("9.996e40"))).toBe("9.99e40");
  });

  it("follows the scientific-notation setting", () => {
    useSettings.setState({ scientificNotation: true });
    expect(fmtFloor(Big.of(999_600))).toBe("9.99e5");
    expect(fmtFloor(Big.of(1e6))).toBe("1.00e6");
  });
});

describe("progress counters never read as met while short", () => {
  it("an objective at 4,996 of 5,000 Compute/sec", () => {
    const s = createInitialState();
    s.lifetimeMoney = Big.of(1);
    s.objectives = { completed: O.pool.filter((o) => o.id !== "o_cmp3").map((o) => o.id) };
    s.stats.peakComputePerSec = Big.of(4_996);
    expect(objectiveBoard(s)[0]!.ready).toBe(false);
    const html = renderToStaticMarkup(createElement(ObjectivesPanel, { game: s, onClaim: noop }));
    expect(html).toContain("4.99K / 5K");
  });

  it("a contract at 999,600 of 1,000,000 Compute/sec", () => {
    const s = createInitialState();
    s.contracts = { completed: CONTRACTS.pool.filter((c) => c.id !== "megacluster").map((c) => c.id) };
    s.stats.peakComputePerSec = Big.of(999_600);
    expect(contractBoard(s)[0]!.ready).toBe(false);
    const html = renderToStaticMarkup(createElement(ContractsPanel, { game: s, onClaim: noop, onClaimSponsor: noop }));
    expect(html).toContain("999K / 1M");
  });

  it("a Grand Challenge lane funded to $24.96B of $25B", () => {
    const s = createInitialState();
    s.prestige.ships = 60;
    const def = C.list[0]!;
    const cost = challengeView(s, def.id)!.cost;
    s.challenges = { funded: { [def.id]: { compute: cost.compute, data: cost.data, money: cost.money.mul(0.9984) } }, completed: [], forks: {} };
    const v = challengeView(s, def.id)!;
    expect(v.done.money).toBe(false);
    expect(v.complete).toBe(false);
    const html = renderToStaticMarkup(createElement(GrandChallengesPanel, {
      game: s, onFund: noop, onChooseFork: noop, onFundMegaproject: noop, onPickMandate: noop,
    }));
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain(`$${fmtFloor(cost.money.mul(0.9984))}/$${fmtFloor(cost.money)}`);
    expect(text).not.toContain(`$${fmtFloor(cost.money)}/$${fmtFloor(cost.money)}`);
    expect(text).toContain("99%");
    expect(text).not.toContain("100%");
  });
});
