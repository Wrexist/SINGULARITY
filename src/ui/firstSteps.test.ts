import { describe, it, expect } from "vitest";
import { firstStepsVisible, firstStepsDone } from "./FirstSteps";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";

/**
 * FIRST STEPS is the opening coach: while it is up it also blanks the notice slot
 * (daily boost, advisor chip, goal strip) and the news ticker. So once a player is
 * past it, it must never come back — a checklist that reappears asking for a rack
 * the full floor cannot take strands the player with no advisor and no daily bar.
 */
describe("FIRST STEPS checklist", () => {
  const pastTheOpening = () => {
    const s = createInitialState();
    s.lifetimeMoney = Big.of(1e6); // started and claimed
    s.upgrades = { rack_basic: 3 };
    return s;
  };

  it("shows for a brand-new lab", () => {
    expect(firstStepsVisible(createInitialState())).toBe(true);
  });

  it("retires once the loop is learned", () => {
    expect(firstStepsDone(pastTheOpening())).toBe(true);
    expect(firstStepsVisible(pastTheOpening())).toBe(false);
  });

  it("stays retired after every Consumer rack is upgraded in place", () => {
    // A full floor evicts the lowest tier when a better rack is bought, so a
    // first-generation player who keeps upgrading ends with zero Consumer racks.
    const s = pastTheOpening();
    s.upgrades = { rack_basic: 0, rack_server: 71, rack_tpu: 49 };
    expect(s.prestige.ships).toBe(0);
    expect(firstStepsDone(s)).toBe(true);
    expect(firstStepsVisible(s)).toBe(false);
  });
});
