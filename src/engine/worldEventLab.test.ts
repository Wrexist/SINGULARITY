import { describe, it, expect } from "vitest";
import { maybeWorldEvent } from "./actions";
import { createInitialState } from "./state";
import { balance, type WorldEvent, type WorldEventEffect } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * About one world event in eight is a product event: a rival launch ("your shipped
 * products suddenly look a step behind") or a buzz wave ("your products get a buzz
 * wave"). They fired in the first generation, which has no Products tab, and a buzz
 * wave fired on a lab with no live product, where the "good" event granted nothing.
 */

const LIST = balance.worldEvents.list as WorldEvent[];
const t = balance.worldEvents.factionThreshold;
const isProductEffect = (e: WorldEventEffect | undefined) => e?.kind === "frontierJump" || e?.kind === "productBuzz";
const effectsOf = (e: WorldEvent) => [e.effect, ...(e.choices ?? []).map((c) => c.effect)];

function product(id: string, type: ProductState["type"]): ProductState {
  return {
    id, name: id, type, version: 1, quality: 1, priceMult: 1, enterprise: false, enterprisePrice: 1,
    marketingPerSec: 0, channelMix: { ads: 1 }, mau: 10_000, paid: 100, buzzSec: 0, ageSec: 100, upgrade: null, features: [],
  };
}

function lab(opts: { ships?: number; live?: ProductState[]; alignment?: number } = {}): GameState {
  const s = createInitialState();
  s.research = ["backprop"];
  s.resources = { compute: Big.of(1000), data: Big.of(1000), money: Big.of(1000) };
  s.prestige = { ...s.prestige, ships: opts.ships ?? 0 };
  s.alignment = opts.alignment ?? 0;
  s.products = { ...s.products, active: opts.live ?? [] };
  return s;
}

/** Every id maybeWorldEvent can roll for this lab, over each recent window a sequel needs. */
function reachable(s: GameState): Set<string> {
  const seen = new Set<string>();
  const windows: string[][] = [[], ...LIST.filter((e) => e.after).map((e) => [e.after!])];
  for (const recent of windows) {
    for (let r = 0; r < 1; r += 0.0005) {
      const res = maybeWorldEvent(s, 1, 0, r, recent);
      if (res) seen.add(res.event.id);
    }
  }
  return seen;
}

describe("a world event only fires when the lab has what it acts on", () => {
  const productEvents = LIST.filter((e) => effectsOf(e).some(isProductEffect)).map((e) => e.id);

  it("a first-generation lab (no Products tab) never rolls a product or rival-launch event", () => {
    for (const alignment of [0, -t - 0.1, t + 0.1]) {
      const seen = reachable(lab({ ships: 0, alignment }));
      expect(seen.size).toBeGreaterThan(10);
      expect([...seen].filter((id) => productEvents.includes(id))).toEqual([]);
    }
  });

  it("with Products open but nothing live, a rival launch can land (drafts compete) but a buzz wave cannot", () => {
    const seen = reachable(lab({ ships: 2, alignment: t + 0.1 }));
    const buzz = LIST.filter((e) => e.effect?.kind === "productBuzz").map((e) => e.id);
    expect([...seen].filter((id) => buzz.includes(id))).toEqual([]);
    expect(seen.has("competitor_launch")).toBe(true);
  });

  it("a lab with a live product can roll every product event again", () => {
    const seen = new Set<string>();
    for (const alignment of [0, -t - 0.1, t + 0.1]) {
      for (const id of reachable(lab({ ships: 2, live: [product("a", "general")], alignment }))) seen.add(id);
    }
    for (const id of productEvents) expect(seen.has(id), id).toBe(true);
  });
});
