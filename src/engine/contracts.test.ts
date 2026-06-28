import { describe, it, expect } from "vitest";
import {
  activeContracts,
  contractReady,
  claimContract,
  contractBoard,
  contractsReputation,
  contractsBalance,
} from "./contracts";
import { earnedReputation } from "./reputation";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";

const SLOTS = contractsBalance.slots;
const firstId = contractsBalance.pool[0]!.id;
const firstTarget = contractsBalance.pool[0]!.target; // "boot" — 50 compute/s

describe("contracts — board derivation", () => {
  it("shows the first `slots` uncompleted pool entries, in order", () => {
    const s = createInitialState();
    const board = activeContracts(s);
    expect(board).toHaveLength(SLOTS);
    expect(board.map((d) => d.id)).toEqual(contractsBalance.pool.slice(0, SLOTS).map((d) => d.id));
  });

  it("advances the board as contracts are completed", () => {
    const s = createInitialState();
    s.contracts.completed = [contractsBalance.pool[0]!.id];
    const board = activeContracts(s);
    expect(board.map((d) => d.id)).not.toContain(contractsBalance.pool[0]!.id);
    // The (slots+1)-th pool entry now slides onto the board.
    expect(board.map((d) => d.id)).toContain(contractsBalance.pool[SLOTS]!.id);
  });
});

describe("contracts — readiness & claiming", () => {
  it("is not ready until the metric meets the target", () => {
    const s = createInitialState();
    expect(contractReady(s, firstId)).toBe(false);
    s.stats.peakComputePerSec = Big.of(firstTarget);
    expect(contractReady(s, firstId)).toBe(true);
  });

  it("claiming a ready contract records it and grants its Reputation", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(firstTarget);
    const before = earnedReputation(s);
    const after = claimContract(s, firstId);
    expect(after.contracts.completed).toContain(firstId);
    expect(earnedReputation(after)).toBe(before + contractsBalance.pool[0]!.rep);
  });

  it("does not double-claim or claim an unmet contract (pure no-ops)", () => {
    const s = createInitialState();
    expect(claimContract(s, firstId)).toBe(s); // unmet → same reference
    s.stats.peakComputePerSec = Big.of(firstTarget);
    const once = claimContract(s, firstId);
    expect(claimContract(once, firstId)).toBe(once); // already done → same reference
  });

  it("won't claim a contract that isn't on the board even if met", () => {
    const s = createInitialState();
    // A far-down-the-ladder contract not yet surfaced.
    const lateId = contractsBalance.pool[contractsBalance.pool.length - 1]!.id;
    s.stats.peakComputePerSec = Big.of(1e9); // meets it numerically
    expect(activeContracts(s).some((d) => d.id === lateId)).toBe(false);
    expect(contractReady(s, lateId)).toBe(false);
  });

  it("contractBoard reports live progress clamped to 0..1", () => {
    const s = createInitialState();
    s.stats.peakComputePerSec = Big.of(firstTarget / 2);
    const card = contractBoard(s).find((c) => c.def.id === firstId)!;
    expect(card.progress).toBeCloseTo(0.5, 2);
    expect(card.ready).toBe(false);
  });
});

describe("contracts — endgame metrics", () => {
  it("evaluates the new peakMau and ascensions contracts from stats", () => {
    const s = createInitialState();
    // Complete everything up to the endgame entries so they reach the board.
    const ascended = contractsBalance.pool.find((d) => d.metric === "ascensions")!;
    const mau = contractsBalance.pool.find((d) => d.metric === "peakMau")!;
    s.contracts.completed = contractsBalance.pool
      .filter((d) => d.id !== ascended.id && d.id !== mau.id)
      .map((d) => d.id);
    s.stats.ascensions = ascended.target;
    s.stats.peakMau = mau.target;
    expect(contractReady(s, ascended.id)).toBe(true);
    expect(contractReady(s, mau.id)).toBe(true);
  });
});

describe("contracts — reputation accounting", () => {
  it("sums only completed contracts' rewards", () => {
    const s = createInitialState();
    expect(contractsReputation(s)).toBe(0);
    s.contracts.completed = [contractsBalance.pool[0]!.id, contractsBalance.pool[1]!.id];
    expect(contractsReputation(s)).toBe(contractsBalance.pool[0]!.rep + contractsBalance.pool[1]!.rep);
  });
});

describe("contracts — persistence", () => {
  it("survives a save round-trip", () => {
    const s = createInitialState();
    s.contracts.completed = [firstId];
    const back = deserialize(serialize(s));
    expect(back.contracts.completed).toEqual([firstId]);
  });

  it("an old (pre-contracts) save migrates to an empty board", () => {
    const s = createInitialState();
    const json = JSON.parse(serialize(s));
    delete json.contracts; // simulate a v11 save with no contracts field
    json.version = 11;
    const back = deserialize(JSON.stringify(json));
    expect(back.contracts).toEqual({ completed: [] });
  });
});
