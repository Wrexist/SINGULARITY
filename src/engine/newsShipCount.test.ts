import { describe, it, expect } from "vitest";
import { reactiveNews } from "./news";
import { createInitialState } from "./state";

/**
 * The newswire announced a model that had not shipped yet: after twelve Ships it read
 * "Singularity Inc. ships model #13; the press release was written by model #12".
 * `prestige.ships` counts models already shipped, so the latest one is #12.
 */
describe("the ship-count headline", () => {
  it("names the model the lab actually shipped last", () => {
    const s = createInitialState();
    s.prestige.ships = 12;
    const line = reactiveNews(s).find((l) => l.includes("ships model #"));
    expect(line).toBe("Singularity Inc. ships model #12; the press release was written by model #11.");
  });
});
