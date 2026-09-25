import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serialize, deserialize } from "./save";
import { SAVE_VERSION } from "./state";
import { derive } from "./derive";
import { tick } from "./tick";
import { earnedReputation } from "./reputation";

/**
 * Saves written by the SHIPPED engines, loaded by today's.
 *
 * Each fixture was produced by the engine exactly as it stood at that save version —
 * `git archive <sha> src/engine`, then driven through eleven ships of real play
 * (research, racks, every ship mode the build had, products launched and priced,
 * staff hired, charters, contracts, reputation and legacy perks, Rig Bay parts,
 * automation, early Grand Challenge funding) and left mid-run with a training run
 * in flight — and saved with that build's own serialize():
 *
 *   v11 a7e2a0b · v13 4acb9ba · v17 eb7884f · v23 1236db6 · v28 ba42036 · v31 387662c
 *   v32 f8a2a1a · v34 e63c998 · v35 ada910b · v36 73faece · v37 eaac6a0
 *
 * The promise to a returning player is that the migration chain plus the sanitizers
 * only ADD what an old save lacks: every field the old build wrote must come back
 * with the same value. A diff here means an update would silently take something.
 */

const VERSIONS = ["v11", "v13", "v17", "v23", "v28", "v31", "v32", "v34", "v35", "v36", "v37"];

function fixture(v: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/saves/${v}.json`, import.meta.url)), "utf8");
}

/** Every path in `old` whose value is missing or different in `now`. */
function lostOrChanged(old: unknown, now: unknown, path: string, out: string[]): void {
  if (JSON.stringify(old) === JSON.stringify(now)) return;
  if (now === undefined) { out.push(`lost ${path}`); return; }
  if (old && now && typeof old === "object" && typeof now === "object" && !Array.isArray(old)) {
    for (const k of Object.keys(old)) lostOrChanged((old as Record<string, unknown>)[k], (now as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  if (Array.isArray(old) && Array.isArray(now) && old.length === now.length) {
    old.forEach((v, i) => lostOrChanged(v, now[i], `${path}[${i}]`, out));
    return;
  }
  out.push(`changed ${path}: ${JSON.stringify(old)?.slice(0, 160)} -> ${JSON.stringify(now)?.slice(0, 160)}`);
}

describe("saves from every shipped save version load intact", () => {
  for (const v of VERSIONS) {
    it(`${v}: nothing the old build wrote is lost or changed`, () => {
      const raw = fixture(v);
      const old = JSON.parse(raw);
      expect(old.version).toBe(Number(v.slice(1)));
      const game = deserialize(raw);
      expect(game.version).toBe(SAVE_VERSION);
      const now = JSON.parse(serialize(game));
      const out: string[] = [];
      lostOrChanged({ ...old, version: 0 }, { ...now, version: 0 }, "$", out);
      expect(out).toEqual([]);
    });

    it(`${v}: the migrated lab runs, and reloads to itself`, () => {
      const game = deserialize(fixture(v));
      expect(game.prestige.ships).toBe(11);
      const d = derive(game);
      for (const b of [d.computePerSec, d.dataPerSec, d.runDataYield, d.runMoneyYield]) expect(b.isFinite()).toBe(true);
      expect(Number.isFinite(earnedReputation(game))).toBe(true);
      let t = game;
      for (let i = 0; i < 20; i++) t = tick(t, 500);
      t = tick(t, 3_600_000);
      for (const r of [t.resources.compute, t.resources.data, t.resources.money]) {
        expect(r.isFinite()).toBe(true);
        expect(r.gte(0)).toBe(true);
      }
      const once = serialize(game);
      expect(serialize(deserialize(once))).toBe(once);
    });
  }
});
