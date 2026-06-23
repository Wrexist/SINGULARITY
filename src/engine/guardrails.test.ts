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

  it("never calls Date.now() inside the engine (time must be passed in)", () => {
    const offenders = files
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => /Date\.now\s*\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
