import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { releaseProduct, PRODUCT_NAME_MAX } from "./products";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";

/**
 * A product's name is the one field of a saved product nobody clamped. A save (or a
 * pasted backup) whose product name was not a string — null from a hand edit, a number
 * — DROPPED the whole product on load: its users, subscribers, version and crew, over
 * a label. A string of any length loaded as-is, so a 10,000-character name went
 * straight into every card and toast, as did control and bidi-override characters.
 * Filter, don't wipe: the product stays and the name is cleaned like a rename.
 */

function savedWithName(name: unknown): string {
  let s = createInitialState();
  s.prestige = { ...s.prestige, ships: 1 };
  s.resources = { ...s.resources, compute: Big.of(1e9), data: Big.of(1e9) };
  s = releaseProduct(s, { type: "general", name: "Nova", id: "prod-1" });
  s.products.active[0]!.mau = 123_456;
  const raw = JSON.parse(serialize(s));
  raw.products.active[0].name = name;
  return JSON.stringify(raw);
}

describe("loading a product with a hostile name", () => {
  it.each([[null], [42], [{}], [undefined]])("keeps the product when its name is %j", (name) => {
    const g = deserialize(savedWithName(name));
    expect(g.products.active).toHaveLength(1);
    expect(g.products.active[0]!.mau).toBe(123_456);
    expect(g.products.active[0]!.name).toBe("Untitled");
  });

  it("clamps a 10,000-character name to the rename cap", () => {
    const g = deserialize(savedWithName("W".repeat(10_000)));
    expect(g.products.active[0]!.name).toBe("W".repeat(PRODUCT_NAME_MAX));
  });

  it("strips control and bidi-override characters", () => {
    const g = deserialize(savedWithName("‮No\nva\u0000"));
    expect(g.products.active[0]!.name).toBe("No va");
  });

  it("leaves an ordinary name alone", () => {
    expect(deserialize(savedWithName("Ca$h Cow")).products.active[0]!.name).toBe("Ca$h Cow");
  });
});
