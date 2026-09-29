import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./save";
import { SAVE_VERSION, createInitialState } from "./state";

/** Save v41: the Daily Boost's last claimed local day (the store owns the live value). */
describe("save v41: dailyDay", () => {
  it("a v40 save loads with no claim (the store takes in the old per-device key)", () => {
    const raw = JSON.parse(serialize({ ...createInitialState(), upgrades: { rack_basic: 2 } }));
    raw.version = 40;
    delete raw.dailyDay;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.dailyDay).toBe(0);
    expect(loaded.upgrades.rack_basic).toBe(2);
  });

  it("round-trips a real claim day", () => {
    const s = { ...createInitialState(), dailyDay: 20_723 };
    expect(deserialize(serialize(s)).dailyDay).toBe(20_723);
  });

  it("filters a hostile claim day to 'never' instead of trusting it or dropping the save", () => {
    for (const bad of [-5, 0, -0.5, Number.NaN, "20723", null, true, {}, [], 2e8, 1e308]) {
      const raw = JSON.parse(serialize({ ...createInitialState(), upgrades: { rack_basic: 3 } }));
      raw.dailyDay = bad;
      const loaded = deserialize(JSON.stringify(raw));
      expect(loaded.dailyDay).toBe(0);
      expect(loaded.upgrades.rack_basic).toBe(3);
    }
    const raw = JSON.parse(serialize(createInitialState()));
    raw.dailyDay = 20_723.9;
    expect(deserialize(JSON.stringify(raw)).dailyDay).toBe(20_723);
  });
});
