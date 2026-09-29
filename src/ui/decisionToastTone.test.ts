import { describe, it, expect } from "vitest";
import { applyWorldEvent } from "../engine/actions";
import { negotiationOffer } from "../engine/negotiation";
import { createInitialState } from "../engine/state";
import { decisionToast } from "./decisionToast";

/**
 * The decision-confirm toast was always the win tone (bug hunt r4, reported-only;
 * fixed r6). Picking "Back them (−12% cash, integrity)" toasted "Back them — -12%
 * $" under the green check-mark, exactly like "+35% cash". The
 * toast's tone now follows what the pick does.
 */

const choicesOf = (id: string) => applyWorldEvent(createInitialState(), id).event.choices!;

describe("decision confirmation tone", () => {
  it("a cash cost confirms in the bad tone", () => {
    const [backThem] = choicesOf("choice_whistleblower");
    expect(decisionToast(backThem!)).toEqual({ text: "Back them — -12% $", tone: "bad" });
    expect(decisionToast(choicesOf("choice_regulator_deal")[0]!).tone).toBe("bad");
  });

  it("a gain still confirms in the good tone", () => {
    expect(decisionToast(choicesOf("choice_regulator_deal")[1]!).tone).toBe("good");
    expect(decisionToast(choicesOf("choice_whistleblower")[1]!).tone).toBe("good");
  });

  it("Chen's trade-offs confirm neutrally, never as a win", () => {
    const s = createInitialState();
    for (const c of negotiationOffer(s).choices!) expect(decisionToast(c).tone).toBe("neutral");
  });
});
