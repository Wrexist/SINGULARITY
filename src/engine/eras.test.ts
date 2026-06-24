import { describe, it, expect } from "vitest";
import { currentEra, eraName, ERA_COUNT } from "./eras";
import { createInitialState } from "./state";

describe("eras", () => {
  it("a fresh lab is era 0 (garage closet)", () => {
    expect(currentEra(createInitialState())).toBe(0);
  });

  it("reaches era 1 once enough research is owned", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data"];
    expect(currentEra(s)).toBe(0); // below the startup threshold
    s.research = ["backprop", "curated_data", "mixed_precision"];
    expect(currentEra(s)).toBe(1);
  });

  it("reaches era 2 via the Inference API capability", () => {
    const s = createInitialState();
    s.research = ["backprop", "curated_data", "distributed", "distillation", "inference_api"];
    expect(currentEra(s)).toBe(2);
  });

  it("stays era 2 after a prestige reset (research clears, ships persists)", () => {
    const s = createInitialState();
    s.prestige.ships = 1; // shipped before; research has been reset to []
    expect(s.research).toHaveLength(0);
    expect(currentEra(s)).toBe(2);
  });

  it("exposes a name for every era index", () => {
    for (let i = 0; i < ERA_COUNT; i++) expect(eraName(i).length).toBeGreaterThan(0);
  });
});
