// App Store marketing screenshots — dark, immersive, multi-feature.
// Captures the running game at 3x, grabs SEVERAL sharp UI elements per scene,
// then composites them as a layered, rotated "feature collage" floating over a
// blurred + dimmed device backdrop with per-scene glow. Renders both iPhone
// (1284×2778, 6.5"/6.7") and iPad (2048×2732, 12.9"/13") sizes.
// Output → appstore/screenshots/ and appstore/screenshots/ipad/.
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
const OUT_PAD = "appstore/screenshots/ipad";
mkdirSync(OUT, { recursive: true });
mkdirSync(OUT_PAD, { recursive: true });

// Brand chip — embed the real app icon so the kicker reads as the actual product.
const ICON_B64 = (() => {
  for (const p of ["appstore/AppIcon-1024.png", "public/icon-512.png", "public/logo-mark.png"]) {
    if (existsSync(p)) return readFileSync(p).toString("base64");
  }
  return null;
})();

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
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

// Per-scene: headline (one <em> accent word), thin subhead, glow color, and a
// list of FOCUS elements to capture sharp. The first focus is the hero (front,
// largest); the rest fan out behind it as a multi-feature collage.
//   { sel, nth?, pre? } — CSS selector, optional nth index, pre=capture before nav
const SCENES = [
  {
    name: "01-hero", seed: RICH, nav: "none",
    head: "Build an AI <em>empire</em>", sub: "A 2.5D data center that grows as you scale",
    glow: "#5b8cff", accent: "#7aa2ff",
    focus: [{ sel: "canvas.hall-canvas" }, { sel: ".resource-bar" }, { sel: ".card", nth: 0 }],
  },
  {
    name: "02-expand", seed: EXPAND, nav: "expand",
    head: "Watch it <em>grow</em>", sub: "Tap the floor — the hall physically expands",
    glow: "#1fd6c2", accent: "#46e6d3",
    focus: [{ sel: ".confirm-modal" }, { sel: "canvas.hall-canvas", pre: true }],
  },
  {
    name: "03-research", seed: RICH, nav: "scroll:Distributed Training",
    head: "Climb the <em>tree</em>", sub: "An absurd AI research tree across every era",
    glow: "#a86bff", accent: "#c79bff",
    focus: [{ sel: ".node-hero" }, { sel: ".node", nth: 4 }, { sel: ".node", nth: 1 }],
  },
  {
    name: "04-ship", seed: CELEBRATE, nav: "shipOpen",
    head: "Ship the <em>model</em>", sub: "Three ways to prestige — bank permanent boosts",
    glow: "#ff7a3c", accent: "#ffae5c",
    focus: [{ sel: ".ship-mode", nth: 0 }, { sel: ".ship-mode", nth: 1 }, { sel: ".ship-mode", nth: 2 }],
  },
  {
    name: "05-market", seed: RICH, nav: "scroll:The Data Bazaar",
    head: "Bend the <em>rules</em>", sub: "Buy data legally… or risk the dark-web Bazaar",
    glow: "#7c5cff", accent: "#a98bff",
    focus: [{ sel: ".card:has-text('Scraped Data Pack')" }, { sel: ".card:has-text('Forum Firehose')" }, { sel: ".heat" }],
  },
  {
    name: "06-honest", seed: RICH, nav: "settings",
    head: "No <em>pay-to-win</em>", sub: "No ads. Plays offline. One optional unlock.",
    glow: "#19c06b", accent: "#4fe39a",
    focus: [{ sel: ".premium-card" }, { sel: ".set-theme", nth: 0 }],
  },
];

// Output sizes. Cards size off deviceW; positions are % of the canvas, so the
// iPad's extra width naturally spreads the collage wider.
const SIZES = [
  { key: "iphone", dir: OUT, w: 1284, h: 2778, deviceW: 980, deviceTop: 470, headSize: 96, subSize: 40, capTop: 150, brandBottom: 74, stars: 60 },
  { key: "ipad", dir: OUT_PAD, w: 2048, h: 2732, deviceW: 1000, deviceTop: 360, headSize: 128, subSize: 52, capTop: 168, brandBottom: 96, stars: 95 },
];

// Collage slot presets by card count. x/y = % of canvas, scale = fraction of
// deviceW for card width, rot = degrees, z = stack order (higher = front).
const SLOTS = {
  1: [{ x: 50, y: 60, scale: 0.78, rot: 0, z: 7 }],
  2: [{ x: 55, y: 63, scale: 0.74, rot: 2, z: 7 }, { x: 39, y: 33, scale: 0.60, rot: -5, z: 6 }],
  3: [{ x: 53, y: 60, scale: 0.66, rot: 2, z: 8 }, { x: 27, y: 33, scale: 0.50, rot: -6, z: 7 }, { x: 75, y: 84, scale: 0.50, rot: 6, z: 6 }],
};

function particles(n, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * 80).toFixed(2);
    const sz = (1 + rnd() * 2.4).toFixed(1), op = (0.05 + rnd() * 0.2).toFixed(2);
    out += `<span class="pt" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;opacity:${op}"></span>`;
  }
  return out;
}

const frameHtml = (scene, baseB64, focuses, size, starSeed) => {
  const g = scene.glow;
  const slots = SLOTS[Math.min(focuses.length, 3)] || SLOTS[1];
  const cards = focuses.slice(0, slots.length).map((f, idx) => {
    const s = slots[idx];
    const cardW = Math.round(s.scale * size.deviceW);
    let cardH = Math.round(cardW / f.aspect);
    const maxH = Math.round(size.h * 0.46);
    const fit = cardH > maxH ? "object-fit:cover;object-position:top" : "";
    cardH = Math.min(cardH, maxH);
    const primary = idx === 0;
    return `<div class="card ${primary ? "card-hero" : ""}" style="left:${s.x}%;top:${s.y}%;width:${cardW}px;height:${cardH}px;z-index:${s.z};transform:translate(-50%,-50%) rotate(${s.rot}deg)">
      <img style="${fit}" src="data:image/png;base64,${f.b64}"></div>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:${size.w}px;height:${size.h}px}
.stage{width:${size.w}px;height:${size.h}px;position:relative;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;
  background:
    radial-gradient(120% 70% at 50% 98%, ${g}38 0%, transparent 60%),
    radial-gradient(90% 50% at 50% 2%, ${g}24 0%, transparent 55%),
    linear-gradient(180deg,#0a0b12 0%,#06070e 55%,#04050a 100%)}
.aura{position:absolute;left:50%;top:58%;width:${Math.round(size.w*1.25)}px;height:${Math.round(size.w*1.25)}px;
  transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(closest-side,${g}55,transparent 70%);filter:blur(70px);opacity:.7}
.aura2{position:absolute;left:24%;top:34%;width:${Math.round(size.w*0.7)}px;height:${Math.round(size.w*0.7)}px;
  transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(closest-side,${scene.accent}40,transparent 70%);filter:blur(80px);opacity:.6}
.pt{position:absolute;border-radius:50%;background:#fff}
.vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(130% 90% at 50% 42%,transparent 45%,rgba(0,0,0,.45) 100%)}

.cap{position:absolute;top:0;left:0;right:0;z-index:9;text-align:center;padding:${size.capTop}px 90px 0}
.cap h1{color:#f4f6ff;font-size:${size.headSize}px;line-height:1.0;font-weight:800;letter-spacing:-.035em;
  text-shadow:0 6px 40px rgba(0,0,0,.5)}
.cap h1 em{font-style:normal;color:${scene.accent};text-shadow:0 0 40px ${g}cc}
.cap p{color:rgba(232,236,255,.64);font-size:${size.subSize}px;font-weight:500;margin-top:28px;letter-spacing:-.005em}

/* blurred, dimmed device backdrop — anchors "this is an app" behind the collage */
.device{position:absolute;left:50%;top:${size.deviceTop}px;width:${size.deviceW}px;z-index:2;
  transform:translateX(-50%);border-radius:${Math.round(size.deviceW*0.08)}px;overflow:hidden;
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 80px 150px -40px rgba(0,0,0,.85),0 0 110px -10px ${g}55}
.device img{width:100%;display:block;filter:blur(18px) brightness(.42) saturate(.9);transform:scale(1.08)}

/* glow disc behind the hero card */
.disc{position:absolute;left:${slots[0].x}%;top:${slots[0].y}%;width:${Math.round(slots[0].scale*size.deviceW*1.35)}px;
  height:${Math.round(slots[0].scale*size.deviceW*1.35)}px;transform:translate(-50%,-50%);z-index:4;
  border-radius:50%;background:radial-gradient(closest-side,${g}66,transparent 72%);filter:blur(30px);opacity:.9}

/* floating sharp feature cards */
.card{position:absolute;border-radius:36px;overflow:hidden;background:#fff;
  border:1px solid rgba(255,255,255,.5);
  box-shadow:0 40px 80px -22px rgba(0,0,0,.7),0 0 60px -10px ${g}aa,inset 0 1px 0 rgba(255,255,255,.6)}
.card-hero{box-shadow:0 60px 110px -22px rgba(0,0,0,.8),0 0 90px -4px ${g},inset 0 1px 0 rgba(255,255,255,.7)}
.card img{width:100%;height:100%;display:block}

.brand{position:absolute;left:0;right:0;bottom:${size.brandBottom}px;z-index:10;text-align:center}
.brand .b{display:inline-flex;align-items:center;gap:18px}
.brand img{width:50px;height:50px;border-radius:13px;display:block;box-shadow:0 4px 14px rgba(0,0,0,.5)}
.brand .dot{width:18px;height:18px;border-radius:50%;background:${scene.accent};box-shadow:0 0 16px ${g}}
.brand span{color:rgba(236,239,255,.74);font-size:${Math.round(size.subSize*0.85)}px;font-weight:700;letter-spacing:.05em}
</style></head><body><div class="stage">
<div class="aura"></div><div class="aura2"></div>
${particles(size.stars, starSeed)}
<div class="device"><img src="data:image/png;base64,${baseB64}"></div>
<div class="disc"></div>
${cards}
<div class="vig"></div>
<div class="cap"><h1>${scene.head}</h1><p>${scene.sub}</p></div>
<div class="brand"><span class="b">${ICON_B64 ? `<img src="data:image/png;base64,${ICON_B64}">` : `<span class="dot"></span>`}<span>Singularity Inc.</span></span></div>
</div></body></html>`;
};

// Capture one focus element sharp → {b64, aspect} | null.
// When nth isn't pinned, scan the first few matches so a zero-size/hidden
// duplicate (e.g. an off-screen .heat) doesn't shadow the real one.
async function grab(app, item) {
  const base = app.locator(item.sel);
  const candidates = item.nth != null
    ? [base.nth(item.nth)]
    : Array.from({ length: Math.min(await base.count().catch(() => 0), 6) }, (_, k) => base.nth(k));
  for (const loc of candidates) {
    // center the element so the sticky resource bar (top) and bottom nav don't
    // get baked into the element screenshot when it sits under them
    await loc.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" })).catch(() => {});
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(150);
    const box = await loc.boundingBox().catch(() => null);
    if (!box || box.width < 40 || box.height < 40) continue;
    const buf = await loc.screenshot().catch(() => null);
    if (!buf) continue;
    return { b64: buf.toString("base64"), aspect: box.width / box.height };
  }
  return null;
}

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
      const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
      await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: true, onboarded: true })));
      await app.addInitScript(([save, now]) => {
        localStorage.setItem("singularity.save.v1", save);
        localStorage.setItem("singularity.lastSeen.v1", now);
      }, [JSON.stringify(scene.seed), String(Date.now())]);
      await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
      await app.waitForSelector("canvas.hall-canvas", { timeout: 10000 }).catch(() => {});
      await sleep(300);
      const collect = app.getByRole("button", { name: "Collect" });
      if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

      // base frame = the clean app screen (blurred device backdrop)
      const base = await app.screenshot();

      // results keyed by original index so collage order is preserved
      const results = new Array(scene.focus.length).fill(null);
      // pass 1: pre-nav captures (e.g. the hall before a modal covers it)
      for (let k = 0; k < scene.focus.length; k++) {
        if (scene.focus[k].pre) results[k] = await grab(app, scene.focus[k]);
      }

      // navigate so the remaining focus elements are on screen / overlays open
      if (scene.nav === "expand") {
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
      } else if (scene.nav?.startsWith("scroll:")) {
        await app.getByText(scene.nav.slice(7)).first().scrollIntoViewIfNeeded().catch(() => {});
        await sleep(300);
      } else if (scene.nav === "shipOpen") {
        await app.getByRole("button", { name: /^Ship —/ }).click().catch(() => {});
        await sleep(500);
      } else if (scene.nav === "settings") {
        await app.getByRole("button", { name: "Settings" }).click().catch(() => {});
        await sleep(400);
      }

      // pass 2: post-nav captures
      for (let k = 0; k < scene.focus.length; k++) {
        if (!scene.focus[k].pre) results[k] = await grab(app, scene.focus[k]);
      }
      await app.close();

      const focuses = results.filter(Boolean);
      if (!focuses.length) console.warn(`  ⚠ no focus elements for ${scene.name}`);
      else if (focuses.length < scene.focus.length) console.warn(`  • ${scene.name}: ${focuses.length}/${scene.focus.length} cards`);

      // composite each output size
      for (const size of SIZES) {
        const framePage = await browser.newPage({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
        await framePage.setContent(frameHtml(scene, base.toString("base64"), focuses, size, 97 + i * 13), { waitUntil: "networkidle" });
        await sleep(200);
        await framePage.screenshot({ path: `${size.dir}/${scene.name}.png` });
        await framePage.close();
      }
      console.log(`✓ ${scene.name} (${focuses.length} cards)`);
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();
