import { describe, it, expect } from "vitest";
import { rollSponsor, claimSponsor, sponsorView, sponsorIdFor, contractsReputation, contractsBalance } from "./contracts";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
import { applyAutomation, automationEnabled, toggleAutomation } from "./automation";
import { Big } from "./math/Big";

const DAY = 20_640; // an arbitrary local day number

/** A state with the whole base ladder cleared (the sponsor precondition). */
function clearedLadder() {
  const s = createInitialState();
  s.contracts = { completed: contractsBalance.pool.map((d) => d.id) };
  s.stats.totalShips = contractsBalance.pool.length; // sanitizer headroom
  return s;
}

describe("sponsor contracts (IDEAS #9)", () => {
  it("does not roll while the base ladder still has rungs", () => {
    const s = createInitialState();
    expect(rollSponsor(s, DAY)).toBe(s); // same-ref no-op
  });

  it("rolls one deterministic objective per day, anchored above the current stat", () => {
    const s = clearedLadder();
    s.stats.peakMau = 5_000_000;
    s.stats.peakMrr = 12_000;
    s.stats.totalMoney = Big.of(5e9);
    s.stats.peakComputePerSec = Big.of(2_000_000);
    const a = rollSponsor(s, DAY);
    expect(a.sponsor).not.toBeNull();
    expect(a.sponsor!.dayKey).toBe(DAY);
    expect(a.sponsor!.target).toBeGreaterThan(0);
    // Deterministic: same day → same objective; same-day re-roll is a no-op.
    expect(rollSponsor(a, DAY)).toBe(a);
    const b = rollSponsor(s, DAY);
    expect(b.sponsor).toEqual(a.sponsor);
    // Next day replaces it.
    const c = rollSponsor(a, DAY + 1);
    expect(c.sponsor!.dayKey).toBe(DAY + 1);
  });

  it("claim records sponsor_<dayKey>, pays flat rep, and can't double-claim", () => {
    const s = rollSponsor(clearedLadder(), DAY);
    const before = contractsReputation(s);
    // Not met yet → claim is a no-op.
    expect(claimSponsor(s)).toBe(s);
    // Meet the target.
    const met = { ...s, stats: { ...s.stats } };
    const metric = s.sponsor!.metric;
    if (metric === "totalMoney") met.stats.totalMoney = Big.of(s.sponsor!.target * 2);
    else if (metric === "peakComputePerSec") met.stats.peakComputePerSec = Big.of(s.sponsor!.target * 2);
    else if (metric === "peakMau") met.stats.peakMau = s.sponsor!.target * 2;
    else met.stats.peakMrr = s.sponsor!.target * 2;
    expect(sponsorView(met)!.ready).toBe(true);
    const claimed = claimSponsor(met);
    expect(claimed.contracts.completed).toContain(sponsorIdFor(DAY));
    expect(contractsReputation(claimed)).toBe(before + contractsBalance.sponsor.rep);
    expect(claimSponsor(claimed)).toBe(claimed); // done today
    expect(sponsorView(claimed)!.claimed).toBe(true);
  });

  it("survives a save round-trip; crafted sponsor ids are validated + bounded", () => {
    const s = rollSponsor(clearedLadder(), DAY);
    const withClaim = { ...s, contracts: { completed: [...s.contracts.completed, sponsorIdFor(DAY)] } };
    const restored = deserialize(serialize(withClaim));
    expect(restored.sponsor).toEqual(s.sponsor);
    expect(restored.contracts.completed).toContain(sponsorIdFor(DAY));

    const crafted = JSON.parse(serialize(withClaim));
    crafted.sponsor = { dayKey: DAY, metric: "ships", target: 1, rep: 999, title: "x", desc: "y" }; // bad metric
    crafted.contracts.completed.push("sponsor_evil", "sponsor_123", "sponsor_123");
    const loaded = deserialize(JSON.stringify(crafted));
    expect(loaded.sponsor).toBeNull(); // unknown metric → dropped, re-rolls next check
    const sponsors = loaded.contracts.completed.filter((id: string) => id.startsWith("sponsor_"));
    expect(sponsors).toEqual([sponsorIdFor(DAY), "sponsor_123"]); // pattern-valid, deduped
  });

  it("rep from the save is ignored in favor of the balance constant", () => {
    const s = rollSponsor(clearedLadder(), DAY);
    const tampered = JSON.parse(serialize(s));
    tampered.sponsor.rep = 9_999;
    expect(deserialize(JSON.stringify(tampered)).sponsor!.rep).toBe(contractsBalance.sponsor.rep);
  });

  it("a year and more of dailies keeps every point of Reputation through a reload", () => {
    const s = clearedLadder();
    const days = 450; // past the old 400 cap, which trimmed 300 Rep on every load
    s.contracts = { completed: [...s.contracts.completed, ...Array.from({ length: days }, (_, i) => sponsorIdFor(DAY + i))] };
    const before = contractsReputation(s);
    expect(contractsReputation(deserialize(serialize(s)))).toBe(before);
  });
});


describe("sponsors run alongside the ladder from the first Ship", () => {
  it("rolls for a shipped lab mid-ladder, only on lanes it has started", () => {
    const s = createInitialState();
    s.prestige.ships = contractsBalance.sponsor.openAtShips;
    s.stats.totalShips = s.prestige.ships;
    s.stats.peakComputePerSec = Big.of(50_000);
    s.stats.totalMoney = Big.of(2e6);
    // No products yet → peak MAU / MRR are 0 and must never be the lane.
    for (let day = DAY; day < DAY + 40; day++) {
      const r = rollSponsor(s, day);
      expect(r.sponsor).not.toBeNull();
      expect(["peakComputePerSec", "totalMoney"]).toContain(r.sponsor!.metric);
    }
  });

  it("still waits for the ladder in the first generation", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(50_000);
    expect(rollSponsor(s, DAY).sponsor).toBeNull();
  });
});

describe("a met sponsor is never lost", () => {
  /** A veteran lab past the Contract Autopilot's unlock with today's sponsor rolled. */
  function veteranSponsor() {
    const s = clearedLadder();
    s.prestige.ships = 10;
    s.stats.peakComputePerSec = Big.of(5_000);
    s.stats.totalMoney = Big.of(5e6);
    s.stats.peakMau = 200_000;
    s.stats.peakMrr = 800;
    return rollSponsor(s, DAY);
  }
  /** …and met: every lane blown past, whichever one the day rolled. */
  function metSponsor() {
    const rolled = veteranSponsor();
    const met = { ...rolled, stats: { ...rolled.stats } };
    met.stats.peakComputePerSec = Big.of(1e12);
    met.stats.totalMoney = Big.of(1e15);
    met.stats.peakMau = 1e12;
    met.stats.peakMrr = 1e12;
    expect(sponsorView(met)!.ready).toBe(true);
    return met;
  }

  it("the Contract Autopilot claims it like any other met contract", () => {
    const s = toggleAutomation(metSponsor(), "auto_contracts");
    expect(automationEnabled(s, "auto_contracts")).toBe(true);
    const before = contractsReputation(s);
    const after = applyAutomation(s);
    expect(after.contracts.completed).toContain(sponsorIdFor(DAY));
    expect(contractsReputation(after)).toBe(before + contractsBalance.sponsor.rep);
    // Idempotent on the next tick.
    expect(applyAutomation(after).contracts.completed).toEqual(after.contracts.completed);
  });

  it("the Autopilot leaves an unmet sponsor (and a switched-off Autopilot a met one) alone", () => {
    const unmet = toggleAutomation(veteranSponsor(), "auto_contracts");
    expect(sponsorView(unmet)!.ready).toBe(false);
    expect(applyAutomation(unmet).contracts.completed).not.toContain(sponsorIdFor(DAY));
    expect(applyAutomation(metSponsor()).contracts.completed).not.toContain(sponsorIdFor(DAY));
  });

  it("the day rollover banks yesterday's met-but-unclaimed sponsor before rolling today's", () => {
    const s = metSponsor();
    const before = contractsReputation(s);
    const next = rollSponsor(s, DAY + 1);
    expect(next.contracts.completed).toContain(sponsorIdFor(DAY));
    expect(contractsReputation(next)).toBe(before + contractsBalance.sponsor.rep);
    expect(next.sponsor!.dayKey).toBe(DAY + 1);
    // Banked once: a stale re-roll of the old day and back never pays it twice.
    const again = rollSponsor(rollSponsor(next, DAY), DAY + 1);
    expect(again.contracts.completed.filter((id) => id === sponsorIdFor(DAY))).toHaveLength(1);
  });

  it("an unmet sponsor simply expires at the rollover, and a claimed one isn't paid twice", () => {
    const unmet = veteranSponsor();
    expect(sponsorView(unmet)!.ready).toBe(false);
    expect(rollSponsor(unmet, DAY + 1).contracts.completed).not.toContain(sponsorIdFor(DAY));

    const claimed = claimSponsor(metSponsor());
    const next = rollSponsor(claimed, DAY + 1);
    expect(next.contracts.completed.filter((id) => id === sponsorIdFor(DAY))).toHaveLength(1);
  });

  it("a met sponsor is banked even when the board closes instead of rolling over", () => {
    const s = metSponsor();
    // A rung reopening in a first-generation lab closes the sponsor slot.
    const closing = { ...s, prestige: { ...s.prestige, ships: 0 }, contracts: { completed: s.contracts.completed.slice(1) } };
    const next = rollSponsor(closing, DAY + 1);
    expect(next.sponsor).toBeNull();
    expect(next.contracts.completed).toContain(sponsorIdFor(DAY));
  });
});
