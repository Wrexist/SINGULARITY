// App Store marketing screenshots — premium, "alive" 3D-framed.
// Captures the running game at 3x, then composites each scene into a 1284×2778
// (6.5"/6.7") marketing shot with depth: an isometric data-center floor grid,
// drifting glow particles, aurora light, a branded kicker chip, gradient-accent
// headlines, a perspective-tilted device with a contact shadow + floor
// reflection + colored halo, and floating frosted feature badges.
// Output → appstore/screenshots/.
//
// Run: node scripts/store-screenshots.mjs
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
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

// Brand chip — embed the real app icon so the kicker reads as the actual product.
const ICON_B64 = (() => {
  for (const p of ["appstore/AppIcon-1024.png", "public/icon-512.png", "public/logo-mark.png"]) {
    if (existsSync(p)) return readFileSync(p).toString("base64");
  }
  return null;
})();

// Poll the preview server until it answers, instead of guessing with a fixed
// sleep (flaky on slow machines: goto() could hit a dead port).
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`Preview server never became ready at ${url}`);
}

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

// Per-scene: short headline with one <em> accent word, a thin subhead, a single
// per-scene glow color, and a gentle device tilt. Dark, minimal, premium —
// matching the owner's reference deck.
const SCENES = [
  {
    name: "01-hero", seed: RICH,
    head: "Build an AI <em>empire</em>", sub: "Scale one GPU into a planet-sized compute cluster",
    glow: "#5b8cff", accent: "#7aa2ff", tilt: -5,
  },
  {
    name: "02-expand", seed: EXPAND, interact: "expand",
    head: "Watch it <em>grow</em>", sub: "Tap the floor to expand — the hall grows with you",
    glow: "#1fd6c2", accent: "#46e6d3", tilt: 5,
  },
  {
    name: "03-research", seed: RICH, interact: "scrollResearch",
    head: "Climb the <em>tree</em>", sub: "An absurd AI research tree across every era",
    glow: "#a86bff", accent: "#c79bff", tilt: -5,
  },
  {
    name: "04-ship", seed: CELEBRATE, interact: "ship",
    head: "Ship the <em>model</em>", sub: "Prestige and reset for permanent Legacy boosts",
    glow: "#ff7a3c", accent: "#ffae5c", tilt: 5,
  },
  {
    name: "05-market", seed: RICH, interact: "scrollMarket",
    head: "Bend the <em>rules</em>", sub: "Buy data legally… or risk the dark-web Bazaar",
    glow: "#7c5cff", accent: "#a98bff", tilt: -5,
  },
  {
    name: "06-honest", seed: RICH, interact: "settings",
    head: "No <em>pay-to-win</em>", sub: "No ads. Plays offline. One optional unlock.",
    glow: "#19c06b", accent: "#4fe39a", tilt: 5,
  },
];

// Deterministic faint star/particle field (no Math.random at module load — keep
// the frame reproducible build-to-build).
function particles(n, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * 70).toFixed(2);
    const sz = (1 + rnd() * 2.4).toFixed(1), op = (0.06 + rnd() * 0.22).toFixed(2);
    out += `<span class="pt" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;opacity:${op}"></span>`;
  }
  return out;
}

const frameHtml = (scene, b64, i) => {
  const g = scene.glow;
  const tilt = scene.tilt;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:1284px;height:2778px}
.stage{width:1284px;height:2778px;position:relative;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;
  background:
    radial-gradient(110% 70% at 50% 96%, ${g}33 0%, transparent 60%),
    radial-gradient(90% 55% at 50% 4%, ${g}1f 0%, transparent 55%),
    linear-gradient(180deg,#0a0b12 0%,#070810 55%,#05060c 100%)}

/* big soft per-scene glow centered behind the device */
.aura{position:absolute;left:50%;top:54%;width:1500px;height:1500px;transform:translate(-50%,-50%);
  border-radius:50%;background:radial-gradient(closest-side,${g}55,transparent 70%);
  filter:blur(60px);opacity:.7}

/* faint stars */
.pt{position:absolute;border-radius:50%;background:#fff}

/* caption */
.cap{position:absolute;top:0;left:0;right:0;z-index:5;text-align:center;padding:150px 90px 0}
.cap h1{color:#f4f6ff;font-size:96px;line-height:1.0;font-weight:800;letter-spacing:-.035em;
  text-shadow:0 6px 40px rgba(0,0,0,.5)}
.cap h1 em{font-style:normal;color:${scene.accent};
  text-shadow:0 0 38px ${g}cc}
.cap p{color:rgba(232,236,255,.62);font-size:40px;font-weight:500;margin-top:30px;letter-spacing:-.005em}

/* device with gentle perspective tilt + rim glow + contact shadow */
.scene3d{position:absolute;left:0;right:0;top:480px;bottom:150px;z-index:4;
  display:flex;justify-content:center;align-items:flex-start;perspective:2800px}
.dwrap{position:relative;width:1000px;transform-style:preserve-3d;
  transform:rotateX(4deg) rotateY(${tilt}deg) rotateZ(${tilt < 0 ? -0.8 : 0.8}deg)}
.contact{position:absolute;left:50%;bottom:-40px;width:760px;height:120px;transform:translateX(-50%);
  background:rgba(0,0,0,.6);border-radius:50%;filter:blur(50px);z-index:-2}
.phone{position:relative;width:1000px;padding:16px;border-radius:80px;
  background:linear-gradient(160deg,#23262f,#0d0e14);
  border:1px solid rgba(255,255,255,.14);
  box-shadow:0 80px 140px -40px rgba(0,0,0,.85),
             0 0 90px -10px ${g}66,
             inset 0 1px 0 rgba(255,255,255,.22)}
.phone img{width:100%;display:block;border-radius:64px}
.phone::after{content:"";position:absolute;inset:0;border-radius:80px;pointer-events:none;
  background:linear-gradient(125deg,rgba(255,255,255,.16) 0%,transparent 22%,transparent 80%,rgba(255,255,255,.06) 100%)}

/* bottom brand chip */
.brand{position:absolute;left:0;right:0;bottom:74px;z-index:6;text-align:center}
.brand .b{display:inline-flex;align-items:center;gap:18px}
.brand img{width:48px;height:48px;border-radius:12px;display:block;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.brand .dot{width:18px;height:18px;border-radius:50%;background:${scene.accent};box-shadow:0 0 16px ${g}}
.brand span{color:rgba(236,239,255,.72);font-size:34px;font-weight:700;letter-spacing:.04em}
</style></head><body><div class="stage">
<div class="aura"></div>
${particles(60, 97 + i * 13)}
<div class="cap"><h1>${scene.head}</h1><p>${scene.sub}</p></div>
<div class="scene3d"><div class="dwrap">
  <div class="contact"></div>
  <div class="phone"><img src="data:image/png;base64,${b64}"></div>
</div></div>
<div class="brand"><span class="b">${ICON_B64 ? `<img src="data:image/png;base64,${ICON_B64}">` : `<span class="dot"></span>`}<span>Singularity Inc.</span></span></div>
</div></body></html>`;
};

async function run() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    for (let i = 0; i < SCENES.length; i++) {
      const scene = SCENES[i];
      // 1) capture the app at 3x for a crisp source frame
      const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
      // reducedMotion calms the floating "+gain" toasts so they don't overlap the
      // resource numbers in a still capture (the hall still renders a clean frame).
      await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: true, onboarded: true })));
      await app.addInitScript(([save, now]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", now);
      }, [JSON.stringify(scene.seed), String(Date.now())]);
      await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      // Wait for the hall canvas (and its marker bridge) rather than a blind sleep.
      await app.waitForSelector("canvas.hall-canvas", { timeout: 10000 }).catch(() => {});
      await sleep(300);
      const collect = app.getByRole("button", { name: "Collect" });
      if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

      if (scene.interact === "expand") {
        await app.waitForFunction(() => Array.isArray(window.__HALL_MARKERS__) && window.__HALL_MARKERS__.length > 0, { timeout: 5000 }).catch(() => {});
        const t = await app.evaluate(() => {
          const c = document.querySelector("canvas.hall-canvas");
          if (!c) return null;
          const r = c.getBoundingClientRect();
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

      // 2) composite into the marketing frame at exact 1284×2778
      const framePage = await browser.newPage({ viewport: { width: 1284, height: 2778 }, deviceScaleFactor: 1 });
      await framePage.setContent(frameHtml(scene, raw.toString("base64"), i), { waitUntil: "networkidle" });
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
