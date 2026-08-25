// UI smoke: build, serve, drive the app across every destination, assert zero console errors.
//
//   node smoke.mjs            # fresh save
//   node smoke.mjs --seeded   # seed a late-game save first
//
// Exits non-zero on any console error / pageerror / failed request.
import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const REPO = "/home/user/SINGULARITY";
// Screenshots and the seed fixture live under the OS temp dir by default. This used
// to be a hardcoded path into one particular agent session's scratchpad, which meant
// the seeded run silently verified against whatever stale seed.json happened to still
// be sitting there — a fixture nothing regenerated and nothing checked the age of.
const OUT = process.env.SMOKE_OUT || join(tmpdir(), "singularity-smoke", "shots");
const port = 4319;
const seeded = process.argv.includes("--seeded");

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of ["/opt/pw-browsers", "/root/.cache/ms-playwright"]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const rel of [["chrome-linux", "chrome"], ["chrome-linux64", "chrome"]]) {
        const c = join(root, dir, ...rel);
        if (existsSync(c)) return c;
      }
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

mkdirSync(OUT, { recursive: true });
console.log("Building...");
execSync("npm run build", { cwd: REPO, stdio: "inherit" });

const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
  cwd: REPO,
  stdio: "ignore",
});

const problems = [];
let browser;
try {
  await sleep(2000);
  browser = await chromium.launch({ executablePath: findChrome() });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  if (seeded) {
    // Seed a deep save (generated from the real engine by scripts/make-seed-save.ts) so
    // the late-game panels actually render — a fresh save stops at FIRST STEPS and never
    // reaches HQ, which is where most panel work lands.
    //
    // REGENERATED on every seeded run, never reused: a fixture that outlives the code
    // it exercises is a fixture that quietly stops testing it. The generator is the
    // real engine, so the seed is always at the current SAVE_VERSION with the current
    // field shapes.
    //
    // This MUST run as an init script, before any app code executes. Seeding after load
    // and reloading does not work: useGameLoop registers save() on `beforeunload`, so the
    // reload writes the fresh in-memory game straight over the seeded key.
    const seedPath = process.env.SEED_SAVE || join(OUT, "..", "seed.json");
    if (!process.env.SEED_SAVE) {
      mkdirSync(join(OUT, ".."), { recursive: true });
      execSync(`npx vite-node scripts/make-seed-save.ts > ${JSON.stringify(seedPath)}`, { cwd: REPO, stdio: ["ignore", "ignore", "inherit"], shell: "/bin/bash" });
    }
    const save = readFileSync(seedPath, "utf8");
    await ctx.addInitScript(
      ({ save: s, now }) => {
        localStorage.setItem("singularity.save.v1", s);
        localStorage.setItem("singularity.lastSeen.v1", String(now));
        localStorage.setItem(
          "singularity.settings.v1",
          JSON.stringify({ onboarded: true, shipExplained: true, sound: false, music: false })
        );
      },
      { save, now: Date.now() }
    );
  }

  const page = await ctx.newPage();

  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
    if (m.type() === "warning" && /React|key|prop|hook/i.test(m.text())) problems.push(`react warn: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (!u.startsWith("data:") && !u.includes("favicon")) problems.push(`requestfailed: ${u}`);
  });

  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });

  if (seeded) {
    // Seed a deep save (generated from the real engine by scripts/make-seed-save.ts)
    // so the late-game panels actually render — a fresh save stops at FIRST STEPS and
    // never reaches HQ, which is where most panel work lands.
    const seedPath = process.env.SEED_SAVE || join(OUT, "..", "seed.json");
    const save = readFileSync(seedPath, "utf8");
    await page.evaluate((s) => {
      localStorage.setItem("singularity.save.v1", s);
      localStorage.setItem("singularity.lastSeen.v1", String(Date.now()));
      // Skip onboarding so the run starts on the game itself.
      localStorage.setItem(
        "singularity.settings.v1",
        JSON.stringify({ onboarded: true, shipExplained: true, sound: false, music: false })
      );
    }, save);
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1200);
  }

  // Dismiss whatever overlay is up (onboarding / moments / a world event that fired
  // mid-run). Extracted because a seeded run keeps ticking while the walk proceeds, so
  // a modal can appear at ANY point and swallow the next click — which is exactly how
  // the wing walk started failing intermittently once the strict assertions landed.
  const dismissOverlays = async () => {
    for (let i = 0; i < 8; i++) {
      const btn = page.locator(
        'button:has-text("Take the first step"), button:has-text("Got it"), button:has-text("Continue"), ' +
        'button:has-text("Begin"), button:has-text("Onward"), button:has-text("Nice"), button:has-text("Close"), button:has-text("Skip")'
      ).first();
      if (await btn.count().then((c) => c > 0).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await sleep(400);
      } else break;
    }
  };
  await dismissOverlays();

  await page.screenshot({ path: join(OUT, "01-open.png") });

  // Drive the core loop a bit so systems unlock.
  for (let i = 0; i < 60; i++) {
    const start = page.locator('button:has-text("Start"), button:has-text("Claim"), button:has-text("Train")').first();
    if (await start.count().then((c) => c > 0).catch(() => false)) {
      await start.click({ timeout: 800 }).catch(() => {});
    }
    await sleep(120);
  }
  await page.screenshot({ path: join(OUT, "02-loop.png") });

  // Visit every bottom-nav destination and every Lab section.
  const navLabels = ["Lab", "Products", "Team", "Goals", "More"];
  for (const lbl of navLabels) {
    const b = page.locator(`.botnav-item:has-text("${lbl}")`).first();
    if (await b.count().then((c) => c > 0).catch(() => false)) {
      await b.click({ timeout: 1500 }).catch(() => {});
      await sleep(600);
      await page.screenshot({ path: join(OUT, `nav-${lbl.toLowerCase()}.png`) });
      // Close any modal that opened.
      const close = page.locator('button[aria-label="Close"], .sheet-close, button:has-text("Close")').first();
      if (await close.count().then((c) => c > 0).catch(() => false)) {
        await close.click({ timeout: 1000 }).catch(() => {});
        await sleep(300);
      }
    }
  }

  // GOALS owns every goal board since the 2026-08 consolidation — walk its
  // horizons and expand each folded board. This section deliberately does NOT
  // swallow failures: a missing Goals destination or a missing horizon is exactly
  // the regression this smoke exists to catch, and a silent catch here would let
  // the run pass while covering none of it.
  // The nav sweep above finishes on More, which opens the Settings sheet — its
  // backdrop covers the nav bar. Close it before asserting on GOALS, or the strict
  // click below fails on an overlay rather than on a real regression.
  for (let i = 0; i < 3; i++) {
    const backdrop = page.locator(".sheet-backdrop, .modal-backdrop");
    if ((await backdrop.count()) === 0) break;
    await backdrop.first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await sleep(350);
  }
  if ((await page.locator(".sheet-backdrop, .modal-backdrop").count()) > 0) {
    throw new Error("SMOKE: an overlay stayed open and would hide the rest of the run");
  }

  const goalsBtn = page.locator('.botnav-item:has-text("Goals")').first();
  if ((await goalsBtn.count()) === 0) throw new Error("SMOKE: the Goals nav destination is missing");
  await goalsBtn.click({ timeout: 2000 });
  await sleep(600);
  // A brand-new save has no horizon switcher at all (Collection is the only thing
  // that exists yet) — that is by design. But once the switcher appears, every
  // horizon must be present and clickable.
  const horizonCount = await page.locator(".labnav .tab").count();
  if (horizonCount > 0) {
    for (const h of ["Now", "Long game", "Collection"]) {
      const t = page.locator(`.labnav .tab:has-text("${h}")`).first();
      if ((await t.count()) === 0) throw new Error(`SMOKE: GOALS horizon "${h}" is missing`);
      await t.click({ timeout: 2000 });
      await sleep(500);
      const folds = page.locator(".collapsible-toggle");
      const fn = await folds.count();
      for (let i = 0; i < fn; i++) {
        const el = folds.nth(i);
        if ((await el.getAttribute("aria-expanded")) === "false") {
          await el.click({ timeout: 1500 });
          await sleep(150);
        }
      }
      await sleep(400);
      await page.screenshot({ path: join(OUT, `goals-${h.replace(/\s+/g, "").toLowerCase()}.png`), fullPage: true });

      // The 2026-08 depth panels, asserted where they live. Only on the seeded run:
      // the seed save (scripts/make-seed-save.ts) is built to carry a career in the
      // shipLog, a Trial ladder mid-climb, and a perk on BOTH doctrine sides, which
      // is what makes each of these renderable at all.
      if (seeded && h === "Collection") {
        await dismissOverlays();
        const gens = await page.locator(".archive-row").count();
        if (gens === 0) throw new Error("SMOKE: The Archive rendered no generations on a save with a shipLog");
        // The seed's two oldest entries are pre-v35 and recorded nothing; the board
        // must show an em dash for those rather than inventing a zero.
        const dashes = await page.locator(".archive-stats dd").filter({ hasText: "\u2014" }).count();
        if (dashes === 0) throw new Error("SMOKE: The Archive showed no em dash for the seed's unrecorded generations");
        console.log(`  Archive: ${gens} generations, ${dashes} unrecorded fields as an em dash`);
      }
      if (seeded && h === "Long game") {
        const rungs = await page.locator(".trial-rungs").count();
        if (rungs === 0) throw new Error("SMOKE: no Trial ladder rung markers rendered");
        const schism = await page.locator(".doctrine-schism .doctrine-perk").count();
        if (schism === 0) throw new Error("SMOKE: the Doctrine Schism track did not reveal on a save holding perks on both sides");
        console.log(`  Depth: ${rungs} Trial ladders, Schism track with ${schism} rungs`);
      }
    }
  } else {
    console.log("  (fresh save: GOALS has no horizon switcher yet — expected)");
  }

  const labBtn = page.locator('.botnav-item:has-text("Lab")').first();
  if (await labBtn.count().then((c) => c > 0).catch(() => false)) await labBtn.click().catch(() => {});
  await sleep(400);
  for (const sec of ["Build", "Research", "HQ"]) {
    const t = page.locator(`.labnav .tab:has-text("${sec}")`).first();
    if (await t.count().then((c) => c > 0).catch(() => false)) {
      await t.click({ timeout: 1500 }).catch(() => {});
      await sleep(600);
      await page.screenshot({ path: join(OUT, `lab-${sec.toLowerCase()}.png`), fullPage: true });
      // Expand every folded board so their contents are actually exercised and shot —
      // a collapsed panel renders nothing, so a smoke that never opens them proves nothing.
      const toggles = page.locator(".collapsible-toggle");
      const n = await toggles.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        await toggles.nth(i).click({ timeout: 1200 }).catch(() => {});
        await sleep(150);
      }
      await sleep(500);
      await page.screenshot({ path: join(OUT, `lab-${sec.toLowerCase()}-expanded.png`), fullPage: true });

      // Facility Wings live on Build. Only asserted on the seeded run — the seed
      // (scripts/make-seed-save.ts) founds two wings and spills racks past the first
      // floor, which is what makes the switcher and the multi-floor layout exist.
      if (seeded && sec === "Build") {
        await dismissOverlays();
        const wingTabs = page.locator(".hall-wing");
        const n = await wingTabs.count();
        if (n < 2) throw new Error(`SMOKE: the hall wing switcher showed ${n} wings on a save with wings founded`);
        // Walk every floor: each must repaint (the model is cached on a signature that
        // has to include the viewed wing, or switching floors would change nothing).
        for (let w = 0; w < n; w++) {
          await wingTabs.nth(w).click({ timeout: 1500 });
          await sleep(400);
          const on = await page.locator(".hall-wing.on").innerText();
          if (!on) throw new Error(`SMOKE: wing ${w} did not become the current floor`);
          // Shoot EVERY floor, not just the one the walk happens to end on — a full
          // wing and an empty one are different renders, and only shooting the last
          // proves nothing about the first.
          await page.screenshot({ path: join(OUT, `hall-wing-${w}.png`) });
        }
        // The found-a-wing action must be offered on a save whose block is leased
        // out — that is the whole point of the feature, and a silently missing card
        // would leave the lab at its old hard ceiling with no way past it.
        const found = page.locator(".wing-found");
        if (!(await found.count())) throw new Error("SMOKE: the found-a-wing action is missing on a maxed-out floor");
        const foundText = (await found.first().innerText()).replace(/\n/g, " ");
        await found.first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(OUT, "wing-found.png") });
        console.log(`  Wings: switcher walked ${n} floors; offer reads "${foundText}"`);
      }
    }
  }

  console.log(`\nScreenshots in ${OUT}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

if (problems.length) {
  console.error(`\n=== ${problems.length} PROBLEM(S) ===`);
  for (const p of [...new Set(problems)]) console.error(" - " + p);
  process.exit(1);
}
console.log("\nSMOKE CLEAN — zero console errors.");
