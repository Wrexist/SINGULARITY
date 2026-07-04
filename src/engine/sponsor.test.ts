import { describe, it, expect } from "vitest";
import { rollSponsor, claimSponsor, sponsorView, sponsorIdFor, contractsReputation, contractsBalance } from "./contracts";
import { serialize, deserialize } from "./save";
import { createInitialState } from "./state";
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
});
