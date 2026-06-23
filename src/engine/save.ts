import { Big } from "./math/Big";
import { SAVE_VERSION, createInitialState } from "./state";
import type { GameState } from "./types";

/**
 * Versioned save/load. Big values serialize to strings (Big.toJSON) so saves are
 * plain JSON and survive precision. Migration exists from day one (CLAUDE.md):
 * even with a stub, the pattern is in place before we need it.
 */

interface SavedShape {
  version: number;
  resources: { compute: string; data: string; money: string };
  upgrades: Record<string, number>;
  research: string[];
  run: GameState["run"];
  prestige: { legacyWeights: string; ships: number };
  lifetimeMoney: string;
}

export function serialize(state: GameState): string {
  const shape: SavedShape = {
    version: SAVE_VERSION,
    resources: {
      compute: state.resources.compute.toJSON(),
      data: state.resources.data.toJSON(),
      money: state.resources.money.toJSON(),
    },
    upgrades: state.upgrades,
    research: state.research,
    run: state.run,
    prestige: {
      legacyWeights: state.prestige.legacyWeights.toJSON(),
      ships: state.prestige.ships,
    },
    lifetimeMoney: state.lifetimeMoney.toJSON(),
  };
  return JSON.stringify(shape);
}

export function deserialize(json: string): GameState {
  const raw = migrate(JSON.parse(json));
  const fresh = createInitialState();
  return {
    version: SAVE_VERSION,
    resources: {
      compute: Big.of(raw.resources.compute),
      data: Big.of(raw.resources.data),
      money: Big.of(raw.resources.money),
    },
    upgrades: raw.upgrades ?? fresh.upgrades,
    research: raw.research ?? fresh.research,
    run: raw.run ?? fresh.run,
    prestige: {
      legacyWeights: Big.of(raw.prestige.legacyWeights),
      ships: raw.prestige.ships,
    },
    lifetimeMoney: Big.of(raw.lifetimeMoney),
  };
}

/**
 * Bring any older save up to the current shape. Each version bump appends a
 * step here. v0 (pre-versioning) → v1 is the seed pattern.
 */
export function migrate(raw: any): SavedShape {
  let s = raw;
  if (s.version === undefined || s.version === 0) {
    // v0 → v1: introduce the version field and lifetimeMoney if absent.
    s = { ...s, version: 1, lifetimeMoney: s.lifetimeMoney ?? s.resources?.money ?? "0" };
  }
  // Future: if (s.version === 1) { ...migrate to 2...; s.version = 2; }
  return s as SavedShape;
}
