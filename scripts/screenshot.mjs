// Screenshot helper — captures the running game so the owner can see builds.
//
// Usage:
//   npm run shot                  # default: phone viewport, light interaction
//   npm run shot -- --name foo    # custom output name
//   npm run shot -- --wide        # desktop viewport
//
// It builds the app, serves the production build on a local port, drives a
// headless Chromium to the page, and writes a PNG into ./screenshots/.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

// In sandboxed environments Playwright's CDN may be blocked, so prefer a
// pre-installed Chromium. Checks $CHROME_PATH, then common locations.
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const roots = ["/opt/pw-browsers", "/root/.cache/ms-playwright"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const candidate = join(root, dir, "chrome-linux", "chrome");
      if (existsSync(candidate)) return candidate;
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

const args = process.argv.slice(2);
const getFlag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const name = getFlag("name", "singularity");
const wide = has("wide");
const port = 4317;

mkdirSync("screenshots", { recursive: true });

console.log("Building production bundle...");
execSync("npm run build", { stdio: "inherit" });

console.log(`Serving on :${port}...`);
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
  stdio: "ignore",
});

let browser;
try {
  await sleep(1500);
  const executablePath = findChrome();
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: wide ? { width: 1280, height: 800 } : { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  // Mark onboarding as seen by default so it doesn't cover other captures;
  // --onboard skips this to show the first-run welcome overlay.
  if (!has("onboard")) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "singularity.settings.v1",
        JSON.stringify({ sound: true, haptics: true, reducedMotion: false, onboarded: true }),
      );
    });
  }

  // --offline: seed a mid-game save last seen 2h ago to trigger the WIWA screen.
  const offlineMs = has("offline") ? 2 * 3600 * 1000 : 0;

  // By default, seed a representative mid-game save so the UI looks alive.
  // --fresh: empty new lab. --celebrate: ready-to-ship state (then click Ship).
  if (!has("fresh")) {
    const seed = has("celebrate") || has("rich")
      ? {
          version: 2,
          resources: { compute: "120000", data: "8000", money: "5000000" },
          upgrades: { rack_basic: 50, rack_server: 30, rack_tpu: 16, overclock: 6, data_pipeline: 6, monetize: 6, auto_claim: 1, auto_train: 1, expand_e: 3, expand_s: 3 },
          research: ["backprop", "curated_data", "distributed", "distillation", "inference_api"],
          run: { active: true, progress: 0.4, readyToClaim: false },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "100000000",
          heat: 30,
          modifiers: [
            { id: "viral_demo", target: "moneyMult", factor: 2, remainingSec: 32, label: "Revenue ×2", tone: "good" },
            { id: "gpu_shortage", target: "computeMult", factor: 0.6, remainingSec: 18, label: "Compute ×0.6", tone: "bad" },
          ],
        }
      : has("claim")
      ? {
          version: 3,
          resources: { compute: "5000", data: "600", money: "3000" },
          upgrades: { rack_basic: 8, rack_server: 3, rack_tpu: 1 },
          research: ["backprop", "curated_data", "distributed"],
          run: { active: false, progress: 1, readyToClaim: true },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "5000",
          heat: 0,
          modifiers: [],
        }
      : has("era")
      ? {
          // One research short of era 1 (needs 2 nodes); clicking the next one
          // crosses the boundary live and fires the era-transition moment.
          version: 2,
          resources: { compute: "3000", data: "400", money: "1500" },
          upgrades: { rack_basic: 5, rack_server: 2 },
          research: ["backprop"],
          run: { active: false, progress: 0, readyToClaim: false },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "1500",
          heat: 0,
        }
      : {
          version: 2,
          resources: { compute: "850", data: "140", money: "2600" },
          upgrades: { rack_basic: 6, rack_server: 1, overclock: 1, data_pipeline: 2, monetize: 1, web_scraper: 3 },
          research: ["backprop", "curated_data"],
          run: { active: true, progress: 0.64, readyToClaim: false },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "4200",
          heat: 58,
        };
    await page.addInitScript(
      ([save, lastSeen]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", lastSeen);
      },
      [JSON.stringify(seed), String(Date.now() - offlineMs)],
    );
  }
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await sleep(900);

  // Page-load latency can trip the "while you were away" modal; dismiss it so it
  // doesn't cover interactive elements (unless we're capturing it deliberately).
  if (!has("offline")) {
    const collect = page.getByRole("button", { name: "Collect" });
    if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});
  }

  if (has("celebrate")) {
    // Drive the prestige flow to trigger the celebration overlay.
    await page.getByRole("button", { name: /^Ship —/ }).click();
    await page.getByRole("button", { name: /Ship it/ }).click();
    await sleep(700); // let confetti + card animate in
  }

  if (has("settings")) {
    await page.getByRole("button", { name: "Settings" }).click();
    await sleep(500);
  }

  if (has("stats")) {
    await page.getByRole("button", { name: /Lab Stats/ }).click();
    await sleep(400);
  }

  if (has("market")) {
    await page.getByText("The Data Bazaar").scrollIntoViewIfNeeded();
    await sleep(400);
  }

  if (has("era")) {
    // Buy the second research node → cross into era 1 → fire the moment.
    await page.getByRole("button", { name: /Curated Dataset/ }).click();
    await sleep(700);
  }

  if (has("claim")) {
    // The claim button bobs (infinite animation), so bypass the stability wait.
    await page.getByRole("button", { name: /Claim payout/ }).click({ force: true });
    await sleep(230); // catch the burst mid-rise
  }

  if (has("worldevent")) {
    // Inject a representative world event via the debug store handle.
    await page.evaluate(() => {
      const store = (window).__SINGULARITY_STORE__;
      store.setState({
        worldEvent: {
          key: 1,
          id: "viral_demo",
          headline: "Your Demo Goes Viral",
          body: "A cherry-picked clip trends. Nobody asks about the failure cases. Revenue ×2 while the hype lasts.",
          tone: "good",
          summary: "Revenue ×2 · 45s",
        },
      });
    });
    await sleep(400);
  }

  const out = `screenshots/${name}.png`;
  await page.screenshot({ path: out, fullPage: has("full") });
  console.log(`Saved ${out}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
