// App Store marketing screenshots — premium, Liquid-Glass framed.
// Captures the running game at 3x, then composites each scene into a 1290×2796
// (6.7") marketing shot: aurora-gradient background, a bold caption, and the app
// screen in a frosted-glass device frame. Output → appstore/screenshots/.
//
// Run: node scripts/store-screenshots.mjs
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of ["/opt/pw-browsers", "/root/.cache/ms-playwright"]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const c = join(root, dir, "chrome-linux", "chrome");
      if (existsSync(c)) return c;
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

const PORT = 4318;
const OUT = "appstore/screenshots";
mkdirSync(OUT, { recursive: true });

// ---- Seeds (curated to show an abundant, aspirational, satisfying lab) ----
const RICH = {
  version: 3,
  resources: { compute: "184000", data: "9.2e6", money: "12500000" },
  upgrades: { rack_basic: 50, rack_server: 30, rack_tpu: 16, overclock: 8, data_pipeline: 8, monetize: 8, auto_claim: 1, auto_train: 1, expand_e: 3, expand_s: 3 },
  research: ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "rlhf", "caching", "distillation", "moe", "inference_api", "scaling_laws"],
  run: { active: true, progress: 0.62, readyToClaim: false },
  prestige: { legacyWeights: "240", ships: 3 },
  lifetimeMoney: "5.0e8",
  heat: 34,
  modifiers: [{ id: "viral_demo", target: "moneyMult", factor: 2, remainingSec: 38, label: "Revenue ×2", tone: "good" }],
};
const CELEBRATE = { ...RICH, run: { active: true, progress: 0.4, readyToClaim: false }, prestige: { legacyWeights: "0", ships: 0 }, lifetimeMoney: "1.0e8" };
const EXPAND = {
  version: 3,
  resources: { compute: "9000", data: "1200", money: "42000" },
  upgrades: { rack_basic: 9, rack_server: 4, rack_tpu: 1, overclock: 2, data_pipeline: 2 },
  research: ["backprop", "curated_data", "mixed_precision"],
  run: { active: true, progress: 0.5, readyToClaim: false },
  prestige: { legacyWeights: "0", ships: 0 }, lifetimeMoney: "42000", heat: 0, modifiers: [],
};
const ERA = {
  version: 3,
  resources: { compute: "3200", data: "520", money: "2600" },
  upgrades: { rack_basic: 6, rack_server: 2 },
  research: ["backprop"],
  run: { active: false, progress: 0, readyToClaim: false },
  prestige: { legacyWeights: "0", ships: 0 }, lifetimeMoney: "2600", heat: 0, modifiers: [],
};

const SCENES = [
  { name: "01-hero", seed: RICH, head: "Build an AI<br>compute empire", sub: "A 2.5D data center that grows as you scale",
    grad: ["#1b2a6b", "#5a2d8f"], blobs: [["#3f86f0", -8, 6], ["#9b51e0", 70, -6]] },
  { name: "02-expand", seed: EXPAND, interact: "expand", head: "Tap to expand<br>your lab", sub: "Buy floor space — the room grows with you",
    grad: ["#0b6b73", "#1f3fa0"], blobs: [["#22d3c5", 65, 4], ["#3f86f0", -10, 60]] },
  { name: "03-research", seed: RICH, interact: "scrollResearch", head: "Climb an absurd<br>AI tech tree", sub: "Branching research across every era",
    grad: ["#3a2480", "#7a2f9c"], blobs: [["#9b51e0", -6, 8], ["#ff5a8a", 72, 66]] },
  { name: "04-ship", seed: CELEBRATE, interact: "ship", head: "Ship the Model", sub: "Prestige — reset for permanent boosts",
    grad: ["#a8331f", "#d98a2b"], blobs: [["#ff5a3c", -8, 4], ["#ffb43c", 70, 60]] },
  { name: "05-market", seed: RICH, interact: "scrollMarket", head: "Buy data…<br>legally, or not", sub: "Risk the dark-web Bazaar — mind the heat",
    grad: ["#2a1a5e", "#181f55"], blobs: [["#7c3aed", -6, 8], ["#2f7bf6", 68, 66]] },
  { name: "06-honest", seed: RICH, interact: "settings", head: "No ads.<br>No pay-to-win.", sub: "One optional unlock. Plays fully offline.",
    grad: ["#0f7a52", "#1f6fb0"], blobs: [["#16b364", -8, 6], ["#2f7bf6", 70, 64]] },
];

const frameHtml = (scene, b64) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:1290px;height:2796px}
.stage{width:1290px;height:2796px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;
  background:linear-gradient(165deg,${scene.grad[0]},${scene.grad[1]})}
.blob{position:absolute;width:760px;height:760px;border-radius:50%;filter:blur(130px);opacity:.5}
.cap{z-index:2;text-align:center;padding:150px 96px 0}
.cap h1{color:#fff;font-size:108px;line-height:1.0;font-weight:800;letter-spacing:-.035em;text-shadow:0 8px 50px rgba(0,0,0,.28)}
.cap p{color:rgba(255,255,255,.85);font-size:44px;font-weight:600;margin-top:34px;letter-spacing:-.01em}
.wrap{margin-top:80px;z-index:2}
.phone{width:1016px;padding:16px;border-radius:80px;background:rgba(255,255,255,.16);
  border:1px solid rgba(255,255,255,.4);
  box-shadow:0 70px 130px -30px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.55);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.phone img{width:100%;display:block;border-radius:64px}
</style></head><body><div class="stage">
${scene.blobs.map(([c, l, t]) => `<span class="blob" style="background:${c};left:${l}%;top:${t}%"></span>`).join("")}
<div class="cap"><h1>${scene.head}</h1><p>${scene.sub}</p></div>
<div class="wrap"><div class="phone"><img src="data:image/png;base64,${b64}"></div></div>
</div></body></html>`;

async function run() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  try {
    await sleep(1500);
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    for (const scene of SCENES) {
      // 1) capture the app at 3x for a crisp source frame
      const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
      await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: false, onboarded: true })));
      await app.addInitScript(([save, now]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", now);
      }, [JSON.stringify(scene.seed), String(Date.now())]);
      await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await sleep(800);
      const collect = app.getByRole("button", { name: "Collect" });
      if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

      if (scene.interact === "expand") {
        const t = await app.evaluate(() => {
          const c = document.querySelector("canvas.hall-canvas"); const r = c.getBoundingClientRect();
          const m = (window.__HALL_MARKERS__ || []).find((x) => !x.maxed);
          return m ? { x: r.left + m.centroid.x, y: r.top + m.centroid.y } : null;
        });
        if (t) await app.mouse.click(t.x, t.y);
        await sleep(400);
      } else if (scene.interact === "scrollResearch") {
        await app.getByText("Distributed Training").scrollIntoViewIfNeeded().catch(() => {});
        await sleep(300);
      } else if (scene.interact === "scrollMarket") {
        await app.getByText("The Data Bazaar").scrollIntoViewIfNeeded().catch(() => {});
        await sleep(300);
      } else if (scene.interact === "ship") {
        await app.getByRole("button", { name: /^Ship —/ }).click().catch(() => {});
        await app.getByRole("button", { name: /Ship it/ }).click().catch(() => {});
        await sleep(700);
      } else if (scene.interact === "settings") {
        await app.getByRole("button", { name: "Settings" }).click().catch(() => {});
        await sleep(400);
      }

      const raw = await app.screenshot();
      await app.close();

      // 2) composite into the marketing frame at exact 1290×2796
      const framePage = await browser.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
      await framePage.setContent(frameHtml(scene, raw.toString("base64")), { waitUntil: "networkidle" });
      await sleep(250);
      await framePage.screenshot({ path: `${OUT}/${scene.name}.png` });
      await framePage.close();
      console.log(`✓ ${scene.name}`);
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();
