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
  // By default, seed a representative mid-game save so the UI looks alive.
  // --fresh: empty new lab. --celebrate: ready-to-ship state (then click Ship).
  if (!has("fresh")) {
    const seed = has("celebrate")
      ? {
          version: 1,
          resources: { compute: "120000", data: "8000", money: "5000000" },
          upgrades: { rack_basic: 12, rack_server: 4, rack_tpu: 1, overclock: 6, data_pipeline: 6, monetize: 6, auto_claim: 1, auto_train: 1 },
          research: ["backprop", "curated_data", "distributed", "distillation", "inference_api"],
          run: { active: true, progress: 0.4, readyToClaim: false },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "100000000",
        }
      : {
          version: 1,
          resources: { compute: "850", data: "140", money: "2600" },
          upgrades: { rack_basic: 6, rack_server: 1, overclock: 1, data_pipeline: 2, monetize: 1 },
          research: ["backprop", "curated_data"],
          run: { active: true, progress: 0.64, readyToClaim: false },
          prestige: { legacyWeights: "0", ships: 0 },
          lifetimeMoney: "4200",
        };
    await page.addInitScript(
      ([save, now]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", now);
      },
      [JSON.stringify(seed), String(Date.now())],
    );
  }
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await sleep(900);

  if (has("celebrate")) {
    // Drive the prestige flow to trigger the celebration overlay.
    await page.getByRole("button", { name: /^Ship —/ }).click();
    await page.getByRole("button", { name: /Ship it/ }).click();
    await sleep(700); // let confetti + card animate in
  }

  const out = `screenshots/${name}.png`;
  await page.screenshot({ path: out, fullPage: has("full") });
  console.log(`Saved ${out}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
