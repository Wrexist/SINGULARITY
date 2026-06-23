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
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await sleep(600);
  const out = `screenshots/${name}.png`;
  await page.screenshot({ path: out });
  console.log(`Saved ${out}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}
