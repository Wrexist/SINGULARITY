import { describe, it, expect } from "vitest";
import { newTransitionMemory, stepTransitionToasts, type TransitionToast } from "./transitionToasts";

/**
 * Transition toasts are the "X unlocked" onboarding lines. Several of their facts
 * reset on a Ship (research, the market, auto-train, the Rig Bay), so a line keyed
 * only on the last value came back every generation — about five toasts per Ship
 * in the late game, against the calm-UI rule. One-time lines fire once; only the
 * rows that describe a recurring status (the faction tilt, rising heat) re-arm.
 */
const row = (key: string, fact: string | boolean, extra: Partial<TransitionToast> = {}): TransitionToast =>
  ({ key, fact, when: true, text: `${key} unlocked`, tone: "good", ...extra });

const fired = (rows: TransitionToast[], mem: ReturnType<typeof newTransitionMemory>) =>
  stepTransitionToasts(rows, mem).map((t) => t.key);

describe("transition toasts", () => {
  it("records the hydrated save as the baseline without toasting", () => {
    const mem = newTransitionMemory();
    expect(fired([row("research", true), row("market", false)], mem)).toEqual([]);
    expect(fired([row("research", true), row("market", true)], mem)).toEqual(["market"]);
  });

  it("fires a one-time unlock line once, not again every generation", () => {
    const mem = newTransitionMemory();
    fired([row("research", false), row("autoTrain", false)], mem); // fresh lab
    expect(fired([row("research", true), row("autoTrain", false)], mem)).toEqual(["research"]);
    expect(fired([row("research", true), row("autoTrain", true)], mem)).toEqual(["autoTrain"]);
    for (let gen = 2; gen <= 4; gen++) {
      // A Ship resets Data, research and upgrades: both facts go false...
      expect(fired([row("research", false), row("autoTrain", false)], mem)).toEqual([]);
      // ...and come back with the new generation's first payout and buys.
      expect(fired([row("research", true), row("autoTrain", true)], mem)).toEqual([]);
    }
  });

  it("never fires a one-time line whose fact was already true at hydration", () => {
    const mem = newTransitionMemory();
    fired([row("rigbay", true)], mem); // returning player, mid-generation
    fired([row("rigbay", false)], mem); // they Ship
    expect(fired([row("rigbay", true)], mem)).toEqual([]);
  });

  it("re-arms rows that describe a recurring status", () => {
    const mem = newTransitionMemory();
    const heat = (on: boolean) => row("heat", on, { repeat: true });
    fired([heat(false)], mem);
    expect(fired([heat(true)], mem)).toEqual(["heat"]);
    fired([heat(false)], mem);
    expect(fired([heat(true)], mem)).toEqual(["heat"]);
  });

  it("tells a lab about a faction flip, both ways", () => {
    const mem = newTransitionMemory();
    const align = (dir: string) => [
      row("align", dir, { when: "accel", text: "accel", repeat: true }),
      row("align", dir, { when: "doomer", text: "doomer", repeat: true }),
    ];
    fired(align(""), mem);
    expect(stepTransitionToasts(align("accel"), mem).map((t) => t.text)).toEqual(["accel"]);
    expect(stepTransitionToasts(align("doomer"), mem).map((t) => t.text)).toEqual(["doomer"]);
    expect(stepTransitionToasts(align("accel"), mem).map((t) => t.text)).toEqual(["accel"]);
  });
});
