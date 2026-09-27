import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame, type FiredEvent } from "./store";
import { createInitialState } from "../engine/state";
import { balance } from "../engine/balance/config";
import { Big } from "../engine/math/Big";
import type { GameState, ProductState } from "../engine/types";

/**
 * A resume window shorter than the recap threshold (5 to 20 minutes) has no "while you
 * were away" screen, so the store's own "version shipped" notice is the only word of a
 * version shipped in it. That notice asked "was upgrading, now isn't" — but the Version
 * Autopilot runs between a window's 5-minute steps, so a version can start AND ship
 * inside the window (it was not upgrading before), or ship with the next one already
 * under way (it is upgrading after). Both shipped silently. The away recap was fixed to
 * compare versions before and after; the notice now does the same.
 */

function product(id: string, over: Partial<ProductState> = {}): ProductState {
  return {
    id, name: id, type: "general", version: 1, quality: 40, priceMult: 1, enterprise: false, enterprisePrice: 1,
    marketingPerSec: 0, channelMix: {}, mau: 5_000_000, paid: 100_000, buzzSec: 0, ageSec: 600, upgrade: null, features: [],
    ...over,
  };
}

function autopilotLab(p: ProductState): GameState {
  const s = createInitialState();
  return {
    ...s,
    research: balance.research.filter((r) => !r.exclusiveGroup).map((r) => r.id),
    upgrades: { ...s.upgrades, rack_basic: 60, rack_server: 40, rack_tpu: 30, expand_e: 4, expand_s: 4, auto_claim: 1, auto_train: 1 },
    prestige: { ...s.prestige, ships: 24, legacyWeights: Big.of(5000) },
    products: { ...s.products, frontier: 80, active: [p], drafts: [] },
    automation: { auto_upgrade: true },
    resources: { compute: Big.of(1e40), data: Big.of(1e40), money: Big.of(1e12) },
  };
}

/** Advance a resume window, then drain the notice queue frame by frame. */
function noticesAfterWindow(windowMs: number): FiredEvent[] {
  const seen: FiredEvent[] = [];
  const grab = () => { const n = useGame.getState().notice; if (n && !seen.some((x) => x.key === n.key)) seen.push(n); };
  useGame.getState().advance(windowMs);
  grab();
  for (let i = 0; i < 200; i++) { useGame.getState().advance(100); grab(); }
  return seen;
}

beforeEach(() => { vi.spyOn(Math, "random").mockReturnValue(0.99); });
afterEach(() => { vi.restoreAllMocks(); });

describe("the version-shipped notice after a short resume window", () => {
  it("names a version started and shipped inside the window", () => {
    useGame.setState({ game: autopilotLab(product("p1")), offline: null, notice: null, event: null, worldEvent: null, savingFor: null });
    const windowMs = 15 * 60_000;
    expect(windowMs).toBeLessThan(balance.offline.resumeRecapMinMs);
    const notices = noticesAfterWindow(windowMs);
    const after = useGame.getState().game.products.active[0]!;
    expect(after.version).toBeGreaterThan(1); // the premise: the autopilot shipped one
    expect(notices.some((n) => n.kind === "ship")).toBe(true);
  });
});
