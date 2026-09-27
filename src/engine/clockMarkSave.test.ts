import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./save";
import { SAVE_VERSION, createInitialState } from "./state";

/** Save v40: the offline clock guard's high-water mark (src/state/clockGuard.ts). */
describe("save v40: clockMark", () => {
  it("a v39 save loads with no mark (the store falls back to its lastSeen stamp)", () => {
    const raw = JSON.parse(serialize(createInitialState()));
    raw.version = 39;
    delete raw.clockMark;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.clockMark).toBe(0);
  });

  it("round-trips a real mark", () => {
    const s = { ...createInitialState(), clockMark: 1_780_000_123_456 };
    expect(deserialize(serialize(s)).clockMark).toBe(1_780_000_123_456);
  });

  it("filters a hostile mark to 0 instead of trusting it or dropping the save", () => {
    for (const bad of [-5, 0, Number.NaN, "1780000000000", null, true, {}, 9e15, 1e308]) {
      const raw = JSON.parse(serialize({ ...createInitialState(), upgrades: { rack_basic: 3 } }));
      raw.clockMark = bad;
      const loaded = deserialize(JSON.stringify(raw));
      expect(loaded.clockMark).toBe(0);
      expect(loaded.upgrades.rack_basic).toBe(3); // the rest of the lab survives
    }
    const raw = JSON.parse(serialize(createInitialState()));
    raw.clockMark = 1_780_000_000_000.7;
    expect(deserialize(JSON.stringify(raw)).clockMark).toBe(1_780_000_000_000);
  });
});
