#!/usr/bin/env node
/**
 * Validate App Store metadata (appstore/metadata/<locale>/) against App Store
 * Connect field limits and the ASO rules documented in appstore/METADATA.md.
 *
 *   node scripts/validate-store-metadata.mjs            # all locales
 *   node scripts/validate-store-metadata.mjs de-DE ja   # specific locales
 *
 * Exits 1 if any locale FAILs. Warnings don't fail the run.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "appstore/metadata";
// App Store Connect limits (characters = code points, which is how ASC counts).
const LIMITS = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "keywords.txt": 100,
  "promotional_text.txt": 170,
  "description.txt": 4000,
  "release_notes.txt": 4000,
};
const REQUIRED = Object.keys(LIMITS);
const chars = (s) => [...s].length;
// Pictographic emoji are rejected/risky in name/subtitle/keywords and off-brand
// everywhere (the game's design language is monochrome line icons — CLAUDE.md).
const EMOJI = /\p{Extended_Pictographic}/u;
const HARD_EMOJI_FILES = new Set(["name.txt", "subtitle.txt", "keywords.txt"]);

const args = process.argv.slice(2);
const locales = (args.length
  ? args
  : readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
).sort();

let failed = 0;
let warned = 0;

for (const loc of locales) {
  const dir = join(ROOT, loc);
  const problems = [];
  const warns = [];
  const text = {};

  for (const f of REQUIRED) {
    const p = join(dir, f);
    if (!existsSync(p)) { problems.push(`missing ${f}`); continue; }
    const s = readFileSync(p, "utf8").trim();
    text[f] = s;
    if (!s) { problems.push(`${f} is empty`); continue; }
    const n = chars(s);
    if (n > LIMITS[f]) problems.push(`${f}: ${n} chars > limit ${LIMITS[f]}`);
    if (EMOJI.test(s)) {
      (HARD_EMOJI_FILES.has(f) ? problems : warns).push(`${f}: contains pictographic emoji`);
    }
  }

  // Brand must never be translated/transliterated (owner rule: Latin brand everywhere).
  if (text["name.txt"] && !/^Singularity Inc\./.test(text["name.txt"])) {
    problems.push(`name.txt must start with "Singularity Inc." (got "${text["name.txt"]}")`);
  }

  // Keyword-field rules from METADATA.md: comma-separated, no space after commas,
  // no duplicates, and no words wasted on terms already in the name/subtitle
  // (Apple combines words across name + subtitle + keywords).
  if (text["keywords.txt"]) {
    const kw = text["keywords.txt"];
    if (/,\s/.test(kw)) problems.push("keywords: space after a comma (wasted characters)");
    if (/\n/.test(kw)) problems.push("keywords: must be a single line");
    const toks = kw.split(",").map((t) => t.trim()).filter(Boolean);
    const seen = new Set();
    for (const t of toks) {
      const k = t.toLowerCase();
      if (seen.has(k)) problems.push(`keywords: duplicate term "${t}"`);
      seen.add(k);
    }
    const hay = `${text["name.txt"] ?? ""} ${text["subtitle.txt"] ?? ""}`.toLowerCase();
    for (const t of toks) {
      const k = t.toLowerCase();
      const ascii = /^[\x20-\x7f]+$/.test(k);
      const dup = ascii
        ? new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u").test(hay)
        : hay.includes(k); // CJK & friends: substring is the right notion
      if (dup) problems.push(`keywords: "${t}" already indexed via name/subtitle`);
    }
    if (/(^|,)(free|gratis|gratuit|kostenlos)(,|$)/i.test(kw)) {
      warns.push('keywords: contains a "free" term (Apple discourages; usually wasted)');
    }
  }

  const status = problems.length ? "FAIL" : warns.length ? "PASS (warn)" : "PASS";
  if (problems.length) failed++;
  if (warns.length) warned++;
  const counts = REQUIRED.map((f) => (text[f] ? `${f.split(".")[0]}=${chars(text[f])}` : `${f.split(".")[0]}=∅`)).join(" ");
  console.log(`${status.padEnd(11)} ${loc.padEnd(8)} ${counts}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  for (const w of warns) console.log(`  ~ ${w}`);
}

console.log(`\n${locales.length} locale(s): ${locales.length - failed} pass, ${failed} fail, ${warned} with warnings.`);
process.exit(failed ? 1 : 0);
