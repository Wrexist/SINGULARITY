import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Architecture guardrail (CLAUDE.md hard rule): the engine must have ZERO React
 * imports. This keeps it pure, testable, and portable (what later lets a Steam
 * port reuse the core). If this test ever fails, React leaked into the engine —
 * move the offending code into src/ui/ instead.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip block + line comments so a purity scan matches real CALLS, not the many
 *  doc comments that mention `Math.random()`/`Date.now()` to explain the pattern
 *  ("the store supplies Math.random()"). Good enough for a guardrail — it ignores
 *  the rare `//` inside a string literal, which never carries these tokens here. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("engine architecture guardrails", () => {
  const engineDir = join(process.cwd(), "src", "engine");
  const files = walk(engineDir);

  it("contains source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("has zero React imports anywhere in src/engine", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /from\s+["']react/.test(src) || /require\(\s*["']react/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  // The deterministic-engine invariant (CLAUDE.md hard rule): tick/derive and all
  // engine code must be pure — the UI/store own the wall clock and RNG. Any of
  // these tokens as a real call means non-determinism leaked in; pass the value
  // in from the store instead (see the `store supplies …` comments in actions.ts).
  const src = (f: string) => stripComments(readFileSync(f, "utf8"));
  const engineFiles = () => files.filter((f) => !f.endsWith(".test.ts"));

  it("never calls Date.now() inside the engine (time must be passed in)", () => {
    const offenders = engineFiles().filter((f) => /Date\.now\s*\(/.test(src(f)));
    expect(offenders).toEqual([]);
  });

  it("never calls Math.random() inside the engine (rolls must be passed in)", () => {
    const offenders = engineFiles().filter((f) => /Math\.random\s*\(/.test(src(f)));
    expect(offenders).toEqual([]);
  });

  it("never reads a wall clock (performance.now / new Date) inside the engine", () => {
    const offenders = engineFiles().filter((f) => {
      const code = src(f);
      return /performance\.now\s*\(/.test(code) || /new\s+Date\s*\(/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  // The other half of the deterministic-engine invariant: the engine must not touch
  // the PLATFORM either — storage, DOM, or network all live in the store/UI layer
  // (the same boundary that keeps a future Steam/desktop port cheap). Call-shaped
  // patterns so doc prose like "the offline window." can't false-positive.
  it("never touches storage, DOM, or network inside the engine", () => {
    const offenders = engineFiles().filter((f) => {
      const code = src(f);
      return (
        /localStorage\s*[.[]/.test(code) ||
        /\bwindow\s*\./.test(code) ||
        /\bdocument\s*\./.test(code) ||
        /\bfetch\s*\(/.test(code)
      );
    });
    expect(offenders).toEqual([]);
  });
});
