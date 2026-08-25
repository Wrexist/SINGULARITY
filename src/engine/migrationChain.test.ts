import { describe, it, expect } from "vitest";
import { migrate, serialize, deserialize } from "./save";
import { SAVE_VERSION, createInitialState } from "./state";

/**
 * Migration-chain guards.
 *
 * Two branches independently claimed v31 → v32 for different fields (Frontier Race
 * stakes / charter streak / Endowment respecs on one side, Institute Fellowships on the
 * other). Merged naively, one set of fields would have been skipped for every save that
 * had already migrated past that step — silent, permanent, and invisible in a diff.
 *
 * These pin the two properties that make that impossible to reintroduce: the chain must
 * END at SAVE_VERSION, and every intermediate version must reach it.
 *
 * This is the ONE place SAVE_VERSION is pinned. Feature test files used to carry
 * their own `expect(SAVE_VERSION).toBe(34)` literals, which broke on every unrelated
 * bump while catching nothing this file misses: bumping SAVE_VERSION without adding
 * the matching `if (s.version === N)` step fails the second test below, because the
 * old version no longer reaches the new one.
 */
describe("migration chain", () => {
  it("ends exactly at SAVE_VERSION", () => {
    expect(migrate({} as never).version).toBe(SAVE_VERSION);
  });

  it("carries every version from 0 to the current one", () => {
    for (let v = 0; v <= SAVE_VERSION; v++) {
      expect(migrate({ version: v } as never).version).toBe(SAVE_VERSION);
    }
  });

  it("defaults every field added at each of the last two steps", () => {
    const g = createInitialState();
    // A v31 save predates BOTH v32 and v33 — it must pick up both sets.
    const raw31 = JSON.parse(serialize(g));
    raw31.version = 31;
    for (const k of ["instituteFellowships", "rivalStake", "charterStreak", "endowmentRespecs"]) delete raw31[k];
    const from31 = deserialize(JSON.stringify(raw31));
    expect(from31.instituteFellowships).toBe(0);
    expect(from31.rivalStake).toBe(null);
    expect(from31.charterStreak).toBe(0);
    expect(from31.endowmentRespecs).toBe(0);

    // A v32 save already has main's fields but predates Fellowships.
    const raw32 = JSON.parse(serialize(g));
    raw32.version = 32;
    delete raw32.instituteFellowships;
    expect(deserialize(JSON.stringify(raw32)).instituteFellowships).toBe(0);
  });
});
