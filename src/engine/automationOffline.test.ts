import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { tick } from "./tick";
import { applyOffline } from "./offline";
import { applyAutomation } from "./automation";
import { balance } from "./balance/config";
import { Big } from "./math/Big";
import type { GameState, ProductState } from "./types";

/**
 * The autopilots are pure (applyAutomation), but only the store's advance() ran them:
 * once per frame with the app open, and once at the very END of a resume or offline
 * catch-up. So a Version Autopilot owner who closed the app for a night came back to
 * every product still on the version it had when they left, rivals far ahead and
 * subscribers bled away, while the app left open had shipped two versions of each.
 */

function product(id: string, type: ProductState["type"]): ProductState {
  return {
    id, name: id, type, version: 1, quality: 80, priceMult: 1, enterprise: false, enterprisePrice: 1,
    marketingPerSec: 0, channelMix: {}, mau: 5_000_000, paid: 100_000, buzzSec: 0, ageSec: 600, upgrade: null, features: [],
  };
}

/** A late-game lab with two products at the frontier and the Version Autopilot on. */
function autopilotLab(): GameState {
  const s = createInitialState();
  return {
    ...s,
    research: balance.research.filter((r) => !r.exclusiveGroup).map((r) => r.id),
    upgrades: { ...s.upgrades, rack_basic: 60, rack_server: 40, rack_tpu: 30, expand_e: 4, expand_s: 4, auto_claim: 1, auto_train: 1 },
    prestige: { ...s.prestige, ships: 24, legacyWeights: Big.of(5000) },
    products: { ...s.products, frontier: 80, active: [product("p1", "general"), product("p2", "code")], drafts: [] },
    automation: { auto_upgrade: true },
  };
}

/** The app left open: the store ticks, then runs the autopilots, every frame. (1 s
 *  frames keep an 8-hour reference fast; the autopilot reacts within a second.) */
function open(s: GameState, ms: number): GameState {
  for (let t = 0; t < ms; t += 1000) s = applyAutomation(tick(s, 1000));
  return s;
}

describe("the autopilots keep working through an offline catch-up", () => {
  it("the Version Autopilot ships the versions overnight that the open app ships", () => {
    const s = autopilotLab();
    const night = 8 * 3_600_000;
    // What the store does on a cold launch: catch up, then the next frame's autopilots.
    const away = applyAutomation(applyOffline(s, night).state);
    const live = open(s, night);
    const versions = (g: GameState) => g.products.active.map((p) => p.version);
    expect(Math.min(...versions(live))).toBeGreaterThanOrEqual(3); // the premise: two versions each
    for (let i = 0; i < live.products.active.length; i++) {
      // Shipped while away (it used to be still on v1, its first upgrade only starting
      // on return), and at most one version behind: each step reacts up to 5 min late.
      expect(versions(away)[i]!).toBeGreaterThanOrEqual(2);
      expect(versions(live)[i]! - versions(away)[i]!).toBeLessThanOrEqual(1);
    }
  });
});
