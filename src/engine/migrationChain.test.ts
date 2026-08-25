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
 * This is also the ONE place SAVE_VERSION is pinned to a literal. Feature test files
 * used to carry their own copies, which broke on every unrelated bump while catching
 * nothing the chain tests miss — but the pin itself is worth keeping, in exactly one
 * spot: the chain tests prove the migration is INTERNALLY consistent, and a bump with
 * a matching step passes them whether or not the bump was intended. The literal is
 * what makes a version bump a deliberate act.
 */
describe("migration chain", () => {
  /**
   * The tripwire. Bumping SAVE_VERSION is a decision with consequences for every
   * installed save, so it must never happen as a side effect of an edit somewhere
   * else — this line has to be changed on purpose, in the same commit, by someone
   * who has read the checklist below.
   *
   * Bumping it? Then also:
   *   1. add the `if (s.version === N)` step in save.ts `migrate()`, defaulting every
   *      new field to its identity value (never back-fill invented history);
   *   2. sanitize each new field in `deserialize` — saves are hostile input, so clamp,
   *      bound and known-id-filter rather than trusting or wiping;
   *   3. add a test that loads a save stamped at the PREVIOUS version and asserts the
   *      new fields arrive at their defaults.
   */
  it("is at the version this commit intends", () => {
    expect(SAVE_VERSION).toBe(36);
  });

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
