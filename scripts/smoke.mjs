// UI smoke: build, serve, drive the app across every destination, assert zero console errors.
//
//   node smoke.mjs            # fresh save
//   node smoke.mjs --seeded   # seed a late-game save first
//
// Exits non-zero on any console error / pageerror / failed request.
import { spawn, execSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const REPO = "/home/user/SINGULARITY";
const OUT = "/tmp/claude-0/-home-user-SINGULARITY/e2df7c69-1a09-5203-a0d2-94793b1bb67f/scratchpad/shots";
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
    // This MUST run as an init script, before any app code executes. Seeding after load
    // and reloading does not work: useGameLoop registers save() on `beforeunload`, so the
    // reload writes the fresh in-memory game straight over the seeded key.
    const seedPath = process.env.SEED_SAVE || join(OUT, "..", "seed.json");
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

  // Dismiss whatever opening overlay is up (onboarding / moments), a few times.
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
  // horizons and expand each folded board, or the smoke covers none of them.
  const goalsBtn = page.locator('.botnav-item:has-text("Goals")').first();
  if (await goalsBtn.count().then((c) => c > 0).catch(() => false)) {
    await goalsBtn.click({ timeout: 1500 }).catch(() => {});
    await sleep(500);
    for (const h of ["Now", "Long game", "Collection"]) {
      const t = page.locator(`.labnav .tab:has-text("${h}")`).first();
      if (await t.count().then((c) => c > 0).catch(() => false)) {
        await t.click({ timeout: 1500 }).catch(() => {});
        await sleep(500);
        const folds = page.locator(".collapsible-toggle");
        const fn = await folds.count().catch(() => 0);
        for (let i = 0; i < fn; i++) {
          const el = folds.nth(i);
          if ((await el.getAttribute("aria-expanded").catch(() => null)) === "false") {
            await el.click({ timeout: 1200 }).catch(() => {});
            await sleep(150);
          }
        }
        await sleep(400);
        await page.screenshot({ path: join(OUT, `goals-${h.replace(/\s+/g, "").toLowerCase()}.png`), fullPage: true });
      }
    }
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
