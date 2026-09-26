import { describe, it, expect } from "vitest";
import { applyWorldEvent, applyWorldEventChoice } from "./actions";
import { createInitialState } from "./state";
import { balance, type WorldEvent } from "./balance/config";
import { typeDef } from "./products";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * A table walk over every world event: the numbers its copy promises are the numbers
 * it applies, and its card text is clean. A buzz-wave event's card said "Product buzz
 * · 60s" while each live product got 60s x its type's hype (18s for a Small model,
 * 90s for a Multimodal Studio), so the card may only quote a length every product gets.
 */

const LIST = balance.worldEvents.list as WorldEvent[];

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

describe("every world event, walked as a table", () => {
  it.each(LIST.map((e) => [e.id, e] as const))("%s: clean copy, and the numbers it quotes are the numbers it applies", (_id, def) => {
    expect(def.weight).toBeGreaterThan(0);
    expect(def.headline.trim()).not.toBe("");
    expect(def.body.trim()).not.toBe("");
    expect(!!def.effect !== !!(def.choices && def.choices.length)).toBe(true);
    const texts = [def.headline, def.body, ...(def.choices ?? []).map((c) => c.label)];
    for (const text of texts) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);

    const branches = def.choices
      ? def.choices.map((c, i) => ({ copy: c.label, effect: c.effect, run: (s: GameState) => applyWorldEventChoice(s, def.id, i) }))
      : [{ copy: def.body, effect: def.effect!, run: (s: GameState) => applyWorldEvent(s, def.id) }];

    for (const { copy, effect, run } of branches) {
      const s = lab({ ships: 3, live: [product("a", "general"), product("b", "small")] });
      const { state, event } = run(s);
      expect(event.summary).not.toMatch(/undefined|NaN|Infinity|\[object/);
      if (effect.kind === "grantPct") {
        const pct = Math.round(effect.pct * 100);
        expect(copy).toMatch(new RegExp(`[+−-]?${Math.abs(pct)}%`));
        expect(state.resources[effect.resource].toNumber()).toBeCloseTo(1000 * (1 + effect.pct), 6);
        expect(event.summary).toContain(`${Math.abs(pct)}%`);
      } else if (effect.kind === "buff") {
        expect(copy).toContain(`×${effect.factor}`);
        const mod = state.modifiers.find((m) => m.id === def.id)!;
        expect(mod.factor).toBe(effect.factor);
        expect(mod.remainingSec).toBe(effect.durationSec);
        expect(mod.tone).toBe(effect.factor < 1 ? "bad" : "good");
        expect(event.summary).toContain(`×${effect.factor}`);
        expect(event.summary).toContain(`${effect.durationSec}s`);
      } else if (effect.kind === "frontierJump") {
        expect(state.products.frontier).toBeCloseTo(s.products.frontier + effect.amount, 9);
      } else {
        // A buzz wave: the card may only quote a length every live product really gets.
        const quoted = /(\d+)s\b/.exec(event.summary);
        for (const p of state.products.active) {
          const got = p.buzzSec;
          expect(got).toBeGreaterThan(0);
          if (quoted) expect(got, `${p.type} buzz vs "${event.summary}"`).toBe(Number(quoted[1]));
          expect(got).toBe(effect.durationSec * typeDef(p.type).hype);
        }
      }
    }
  });
});
