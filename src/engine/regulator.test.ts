import { describe, it, expect } from "vitest";
import { regulatorState, suspicionEventMult, regulatorIsNamed, addSuspicion } from "./regulator";
import { buyDataOffer, lobby, applyHeatEvent, maybeHeatEvent } from "./actions";
import { createInitialState } from "./state";
import { prestige } from "./prestige";
import { serialize, deserialize } from "./save";
import { balance } from "./balance/config";
import { Big } from "./math/Big";

const R = balance.regulator;

describe("B3 — the Regulator (suspicion)", () => {
  it("a clean lab is Unwatched with identity scrutiny (curve-safe)", () => {
    const s = createInitialState();
    expect(s.suspicion).toBe(0);
    expect(regulatorState(s).index).toBe(0);
    expect(regulatorState(s).label).toBe("Unwatched");
    expect(suspicionEventMult(s)).toBe(1);
    expect(regulatorIsNamed(s)).toBe(false);
  });

  it("tiers escalate with suspicion; scrutiny multiplier rises", () => {
    expect(regulatorState({ ...createInitialState(), suspicion: 30 }).label).toBe("On the radar");
    expect(regulatorState({ ...createInitialState(), suspicion: 60 }).label).toBe("Under investigation");
    expect(regulatorState({ ...createInitialState(), suspicion: 90 }).label).toBe("Personal vendetta");
    expect(suspicionEventMult({ ...createInitialState(), suspicion: R.max })).toBeCloseTo(1 + R.eventChanceBoostAtMax, 6);
  });

  it("addSuspicion clamps to [0, max]", () => {
    expect(addSuspicion(createInitialState(), -10).suspicion).toBe(0);
    expect(addSuspicion(createInitialState(), 999).suspicion).toBe(R.max);
  });

  it("a shady Bazaar buy raises suspicion; a legit buy does not", () => {
    const s = createInitialState();
    s.resources.money = Big.of(1e9);
    // First offer is legit (Meta dump in the data market), last entries are shady.
    const legit = balance.dataMarket.find((o) => !o.risk)!;
    const shady = balance.dataMarket.find((o) => o.risk)!;
    expect(buyDataOffer(s, legit.id, 0.99).state.suspicion).toBe(0);
    expect(buyDataOffer(s, shady.id, 0.99).state.suspicion).toBe(R.perShadyBuy);
  });

  it("lobbying appeases the regulator (cuts suspicion)", () => {
    const s = { ...createInitialState(), heat: 50, suspicion: 80, resources: { ...createInitialState().resources, money: Big.of(1e9) } };
    const after = lobby(s);
    expect(after.suspicion).toBeLessThan(80);
    expect(after.suspicion).toBeCloseTo(80 * (1 - R.lobbyReduction), 6);
  });

  it("regulatory events get signed by the regulator once escalated", () => {
    const cold = applyHeatEvent({ ...createInitialState(), suspicion: 0 }, balance.heatEvents[0]!.id);
    expect(cold.event.message).not.toContain(R.name);
    const hot = applyHeatEvent({ ...createInitialState(), suspicion: 90 }, balance.heatEvents[0]!.id);
    expect(hot.event.message).toContain(R.name);
  });

  it("a watched lab is audited more often at the same Heat", () => {
    const base = { ...createInitialState(), heat: 50 };
    const watched = { ...base, suspicion: R.max };
    // A fire-roll that misses when unwatched (chance 0.015) but lands under the ×2.5
    // escalated chance (0.0375). heatFrac 0.5 × 0.03/s × 1s = 0.015 base.
    const probe = 0.02;
    expect(maybeHeatEvent(base, 1, probe, 0)).toBeNull();
    expect(maybeHeatEvent(watched, 1, probe, 0)).not.toBeNull();
  });

  it("suspicion persists across prestige (long memory) and a save round-trip", () => {
    const s = { ...createInitialState(), suspicion: 42, research: [balance.prestige.capabilityResearch], lifetimeMoney: Big.of("1e8") };
    expect(prestige(s).suspicion).toBe(42);
    expect(deserialize(serialize(s)).suspicion).toBe(42);
    // Old saves (pre-v16) migrate to a clean slate.
    const old = JSON.parse(serialize(s));
    delete old.suspicion; old.version = 15;
    expect(deserialize(JSON.stringify(old)).suspicion).toBe(0);
  });
});
