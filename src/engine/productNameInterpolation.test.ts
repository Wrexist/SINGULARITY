import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { maybeChurnFlavor, maybeProductEvent, releaseProduct, renameProduct } from "./products";
import { products as B } from "./balance/products";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * Product toasts put the product's name into a line of copy. Two churn lines name the
 * product twice ("Is {name} still being maintained?" — an actual {name} user), and a
 * string `.replace` fills only the first, so the toast showed a literal "{name}". A
 * player-typed name with a `$` in it ("Ca$h Cow") was also read as a replacement
 * pattern, so "$&" or "$'" pasted copy into the name. Walk every line.
 */

// Every special replacement pattern String.prototype.replace understands.
const NAME = "Ca$h $& $' $$ Co";

function labWith(p: Partial<ProductState>): GameState {
  let s = createInitialState();
  s.prestige = { ...s.prestige, ships: 1 };
  s.resources = { ...s.resources, compute: Big.of(1e9), data: Big.of(1e9) };
  s = releaseProduct(s, { type: "general", name: "Temp", id: "p1" });
  s = renameProduct(s, "p1", NAME); // the player's own rename
  expect(s.products.active[0]!.name).toBe(NAME);
  s.products = { ...s.products, active: s.products.active.map((x) => ({ ...x, ...p })) };
  return s;
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("product toasts interpolate the product's name in full", () => {
  it("every churn flavor line names the product exactly where the copy says, with no stray {name}", () => {
    for (const reason of ["stale", "pricey"] as const) {
      const lines = B.flavor.lines[reason];
      // A stale product (far behind the frontier) or a pricey one (dial at max), bleeding subs.
      const s = reason === "stale"
        ? labWith({ quality: 1, paid: B.flavor.minPaid * 10, mau: B.flavor.minPaid * 20, priceMult: 1, buzzSec: 0 })
        : labWith({ quality: 1e9, paid: B.flavor.minPaid * 10, mau: B.flavor.minPaid * 20, priceMult: 3, buzzSec: 0 });
      if (reason === "stale") s.products = { ...s.products, frontier: 1e6 };
      else s.products = { ...s.products, frontier: 1 };
      lines.forEach((line, i) => {
        const r = maybeChurnFlavor(s.products, 1e6, 0, 0, (i + 0.5) / lines.length);
        expect(r, `${reason} line ${i}`).not.toBeNull();
        expect(r!.reason).toBe(reason);
        expect(r!.message, line).not.toContain("{name}");
        expect(count(r!.message, NAME), line).toBe(count(line, "{name}"));
      });
    }
  });

  it("every product ops event names the product verbatim", () => {
    const list = B.events.list;
    const s = labWith({ mau: B.events.minMau * 10, paid: B.events.minMau });
    list.forEach((ev, i) => {
      const r = maybeProductEvent(s, 1e6, 0, 0, (i + 0.5) / list.length);
      expect(r, ev.id).not.toBeNull();
      expect(r!.message, ev.id).not.toContain("{name}");
      expect(count(r!.message, NAME), ev.id).toBe(count(ev.message, "{name}"));
    });
  });
});
