// Raw in-app screenshots (no marketing frame) for the website's phone mockups.
// Drives the live app into each state and captures the clean viewport.
// Output → docs/assets/app-01..06.png
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { SCENES, findChrome, waitForServer } from "./store-screenshots.mjs";

const PORT = 4320;
mkdirSync("docs/assets", { recursive: true });

async function run() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i];
      const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
      try {
      await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: true, onboarded: true })));
      await app.addInitScript(([save, now]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", now);
      }, [JSON.stringify(s.seed), String(Date.now())]);
      await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await app.waitForSelector("canvas.hall-canvas", { timeout: 10000 }).catch(() => {});
      await sleep(300);
      const collect = app.getByRole("button", { name: "Collect" });
      if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});
      for (let d = 0; d < 4; d++) {
        const wm = app.locator(".world-modal");
        if (!(await wm.count().catch(() => 0))) break;
        const choice = app.locator(".world-choice").first();
        if (await choice.count().catch(() => 0)) await choice.click().catch(() => {});
        else await app.locator(".world-modal .btn-primary, .world-modal .btn").first().click().catch(() => {});
        await sleep(250);
      }
      if (s.nav === "expand") {
        await app.waitForFunction(() => Array.isArray(window.__HALL_MARKERS__) && window.__HALL_MARKERS__.length > 0, { timeout: 5000 }).catch(() => {});
        const t = await app.evaluate(() => {
          const c = document.querySelector("canvas.hall-canvas"); if (!c) return null;
          const r = c.getBoundingClientRect();
          const m = (window.__HALL_MARKERS__ || []).find((x) => !x.maxed);
          return m ? { x: r.left + m.centroid.x, y: r.top + m.centroid.y } : null;
        });
        if (t) await app.mouse.click(t.x, t.y);
        await sleep(400);
      } else if (s.nav?.startsWith("scroll:")) {
        await app.getByText(s.nav.slice(7)).first().scrollIntoViewIfNeeded().catch(() => {});
        await sleep(300);
      } else if (s.nav === "shipOpen") {
        const b = app.getByRole("button", { name: /^Ship —/ });
        for (let a = 0; a < 3; a++) { await b.scrollIntoViewIfNeeded().catch(() => {}); await b.click().catch(() => {}); await app.waitForSelector(".ship-mode", { timeout: 3000 }).catch(() => {}); if (await app.locator(".ship-mode").count().catch(() => 0)) break; await sleep(250); }
        await sleep(300);
      } else if (s.nav === "settings") {
        await app.getByRole("button", { name: "Settings" }).click().catch(() => {});
        await sleep(400);
      }
      const name = `docs/assets/app-${s.name.slice(0, 2)}.png`;
      await app.screenshot({ path: name });
      console.log(`✓ ${name}`);
      } catch (err) {
        console.error(`✗ ${s.name} failed:`, err.message);
      } finally {
        await app.close().catch(() => {});
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
run();
