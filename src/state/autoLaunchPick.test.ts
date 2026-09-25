import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";
import type { DraftModel, GameState } from "../engine/types";

/**
 * Launch Autopilot promises "a freshly-shipped model is commercialised into any free
 * product slot". It launched drafts[0] — the OLDEST raw model on the shelf, since each
 * Ship appends its draft at the end. Drafts pile up while every slot is taken, so the
 * moment a slot freed up (a sale, a new slot perk) the autopilot turned the weakest,
 * most out-of-date model into a product that was far behind rivals on day one, and the
 * strong model the player had just shipped stayed on the shelf until it fell off the cap.
 */
const draft = (ships: number, quality: number): DraftModel => ({ id: `draft-${ships}`, ships, quality });

function lab(drafts: DraftModel[]): GameState {
  const s = createInitialState();
  s.prestige.ships = 6;
  s.automation = { auto_launch: true };
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.ZERO };
  s.products = { ...s.products, frontier: 90, drafts };
  return s;
}

describe("Launch Autopilot picks the model to commercialise", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => {
    // advance() rolls world / product events with Math.random; roll "no event".
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });

  it("launches the model you just shipped, not the oldest one on the shelf", () => {
    // Five ships' worth of drafts, oldest first (the order prestige() appends them in).
    const shelf = [draft(2, 20), draft(3, 35), draft(4, 50), draft(5, 70), draft(6, 90)];
    const s = lab(shelf);
    // No live product: all three base slots are free.
    useGame.setState({ game: s, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    useGame.getState().advance(100, 100);
    const g = useGame.getState().game;
    // Every free slot (3) is filled — with the three strongest models.
    const launched = g.products.active.map((p) => p.quality).sort((a, b) => b - a);
    expect(launched).toEqual([90, 70, 50]);
    expect(g.products.drafts.map((d) => d.id).sort()).toEqual(["draft-2", "draft-3"]);
  });

  it("a single free slot gets the strongest draft", () => {
    const s = lab([draft(4, 30), draft(5, 60)]);
    useGame.setState({ game: s, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    // Two live products, so exactly one slot is open.
    const filler = (id: string) => ({
      id, name: id, type: "general" as const, version: 1, quality: 90, priceMult: 1, enterprise: false,
      enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 0, paid: 0, buzzSec: 0,
      ageSec: 0, upgrade: null, features: [],
    });
    useGame.setState({ game: { ...s, products: { ...s.products, active: [filler("fx-a"), filler("fx-b")] } } });
    useGame.getState().advance(100, 100);
    const g = useGame.getState().game;
    const fresh = g.products.active.filter((p) => !p.id.startsWith("fx-"));
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.quality).toBe(60);
    expect(g.products.drafts.map((d) => d.id)).toEqual(["draft-4"]);
  });
});
