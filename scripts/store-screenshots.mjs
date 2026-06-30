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
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

export function findChrome() {
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
export const ICON_B64 = (() => {
  for (const p of ["appstore/AppIcon-1024.png", "public/icon-512.png", "public/logo-mark.png"]) {
    if (existsSync(p)) return readFileSync(p).toString("base64");
  }
  return null;
})();

export async function waitForServer(url, timeoutMs = 30000) {
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
export const SCENES = [
  {
    name: "01-hero", seed: RICH, nav: "none", tag: "AI COMPUTE TYCOON", pin: "LIVE",
    head: "Build an AI <em>empire</em>", sub: "A 2.5D data center that grows as you scale",
    glow: "#5b8cff", accent: "#8fb0ff",
    focus: [{ sel: "canvas.hall-canvas" }, { sel: ".resource-bar" }],
  },
  {
    name: "02-expand", seed: EXPAND, nav: "expand", tag: "IT PHYSICALLY GROWS", pin: "TAP TO BUILD",
    head: "Watch it <em>grow</em>", sub: "Tap the floor — the hall physically expands",
    glow: "#1fd6c2", accent: "#5cead9",
    focus: [{ sel: ".confirm-modal" }, { sel: "canvas.hall-canvas", pre: true }],
  },
  {
    name: "03-research", seed: RICH, nav: "scroll:Distributed Training", tag: "PROGRESSION SPINE", pin: "RESEARCH",
    head: "Climb the <em>tree</em>", sub: "An absurd AI research tree across every era",
    glow: "#a86bff", accent: "#c9a4ff",
    focus: [{ sel: ".node-hero" }, { sel: ".node", nth: 4 }, { sel: ".node", nth: 1 }],
  },
  {
    name: "04-ship", seed: CELEBRATE, nav: "shipOpen", tag: "PRESTIGE LOOP", pin: "PRESTIGE",
    head: "Ship the <em>model</em>", sub: "Three ways to prestige — bank permanent boosts",
    glow: "#ff7a3c", accent: "#ffb066",
    focus: [{ sel: ".ship-mode", nth: 0 }, { sel: ".ship-mode", nth: 1 }, { sel: ".ship-mode", nth: 2 }],
  },
  {
    name: "05-market", seed: RICH, nav: "scroll:The Data Bazaar", tag: "RISK & REWARD", pin: "DARK WEB",
    head: "Bend the <em>rules</em>", sub: "Buy data legally… or risk the dark-web Bazaar",
    glow: "#7c5cff", accent: "#ad93ff",
    focus: [{ sel: ".card:has-text('Scraped Data Pack')" }, { sel: ".card:has-text('Forum Firehose')" }, { sel: ".heat" }],
  },
  {
    name: "06-honest", seed: RICH, nav: "settings", tag: "HONEST BY DESIGN", pin: "ONE-TIME",
    head: "No <em>pay-to-win</em>", sub: "No ads. Plays offline. One optional unlock.",
    glow: "#19c06b", accent: "#5ce6a0",
    focus: [{ sel: ".premium-card" }],
  },
];

// Output sizes. Cards size off deviceW; positions are % of the canvas, so the
// iPad's extra width naturally spreads the collage wider.
const SIZES = [
  { key: "iphone", dir: OUT, w: 1284, h: 2778, deviceW: 980, deviceTop: 470, headSize: 96, subSize: 40, capTop: 150, brandBottom: 74, stars: 60 },
  { key: "ipad", dir: OUT_PAD, w: 2048, h: 2732, deviceW: 980, deviceTop: 470, headSize: 116, subSize: 48, capTop: 140, brandBottom: 92, stars: 95 },
];

// Collage slot presets by card count. x/y = % of canvas, scale = fraction of
// deviceW for card width, rot = degrees, z = stack order (higher = front).
const SLOTS = {
  1: [{ x: 50, y: 57, scale: 1.00, rot: 0, z: 7 }],
  2: [{ x: 52, y: 66, scale: 0.96, rot: 1.5, z: 7 }, { x: 47, y: 31, scale: 0.84, rot: -3.5, z: 6 }],
  3: [{ x: 55, y: 74, scale: 0.82, rot: 1.5, z: 8 }, { x: 43, y: 49, scale: 0.78, rot: -3, z: 7 }, { x: 54, y: 26, scale: 0.72, rot: 3, z: 6 }],
};

// Tiling film-grain (kills gradient banding, adds a premium texture).
const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

function particles(n, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * 78).toFixed(2);
    const sz = (1 + rnd() * 2.2).toFixed(1), op = (0.05 + rnd() * 0.18).toFixed(2);
    out += `<span class="pt" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;opacity:${op}"></span>`;
  }
  return out;
}

const frameHtml = (scene, baseB64, focuses, size, starSeed) => {
  const g = scene.glow, ac = scene.accent;
  const slots = SLOTS[Math.min(focuses.length, 3)] || SLOTS[1];
  const bezel = Math.round(size.deviceW * 0.016);
  const outR = Math.round(size.deviceW * 0.085);
  const inR = outR - bezel;
  const islW = Math.round(size.deviceW * 0.30), islH = Math.round(size.deviceW * 0.034);

  const cards = focuses.slice(0, slots.length).map((f, idx) => {
    const s = slots[idx];
    const cardW = Math.round(s.scale * size.deviceW);
    let cardH = Math.round(cardW / f.aspect);
    const maxH = Math.round(size.h * 0.46);
    const fit = cardH > maxH ? "object-fit:cover;object-position:top" : "";
    cardH = Math.min(cardH, maxH);
    const primary = idx === 0;
    const pin = primary && scene.pin
      ? `<span class="pin">${scene.pin}</span>` : "";
    return `<div class="card ${primary ? "hero" : ""}" style="left:${s.x}%;top:${s.y}%;width:${cardW}px;height:${cardH}px;z-index:${s.z};transform:translate(-50%,-50%) rotate(${s.rot}deg)">
      ${pin}<div class="inner"><img style="${fit}" src="data:image/png;base64,${f.b64}"></div></div>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:${size.w}px;height:${size.h}px}
.stage{width:${size.w}px;height:${size.h}px;position:relative;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif;
  background:
    radial-gradient(80% 50% at 50% 0%, ${g}26 0%, transparent 60%),
    radial-gradient(70% 45% at 84% 30%, ${ac}1c 0%, transparent 60%),
    radial-gradient(120% 75% at 50% 102%, ${g}40 0%, transparent 62%),
    linear-gradient(180deg,#0b0c14 0%,#070810 52%,#04040a 100%)}

/* isometric data-center floor receding to a glowing horizon */
.grid{position:absolute;left:-45%;right:-45%;bottom:-12%;height:72%;z-index:1;
  background-image:linear-gradient(${ac}26 2px,transparent 2px),linear-gradient(90deg,${ac}26 2px,transparent 2px);
  background-size:110px 110px;
  transform:perspective(1100px) rotateX(75deg);transform-origin:bottom center;
  -webkit-mask-image:linear-gradient(to top,#000 2%,transparent 64%);mask-image:linear-gradient(to top,#000 2%,transparent 64%);
  opacity:.5}
.horizon{position:absolute;left:0;right:0;top:50%;height:380px;z-index:1;
  background:radial-gradient(60% 100% at 50% 0%,${g}55,transparent 72%);filter:blur(26px);opacity:.7}

/* soft bloom orbs */
.aura{position:absolute;left:50%;top:60%;width:${Math.round(size.w*1.3)}px;height:${Math.round(size.w*1.3)}px;z-index:1;
  transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,${g}4d,transparent 70%);filter:blur(80px);opacity:.75}
.aura2{position:absolute;left:22%;top:30%;width:${Math.round(size.w*0.72)}px;height:${Math.round(size.w*0.72)}px;z-index:1;
  transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,${ac}3a,transparent 70%);filter:blur(90px);opacity:.6}
.pt{position:absolute;border-radius:50%;background:#fff;z-index:1}

/* caption */
.cap{position:absolute;top:0;left:0;right:0;z-index:9;text-align:center;padding:${size.capTop}px 80px 0}
.kick{display:inline-flex;align-items:center;gap:14px;margin-bottom:${Math.round(size.headSize*0.34)}px;
  padding:${Math.round(size.subSize*0.34)}px ${Math.round(size.subSize*0.62)}px;border-radius:999px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  box-shadow:0 8px 26px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18)}
.kick i{width:${Math.round(size.subSize*0.34)}px;height:${Math.round(size.subSize*0.34)}px;border-radius:50%;
  background:${ac};box-shadow:0 0 16px ${g}}
.kick b{color:rgba(238,241,255,.82);font-size:${Math.round(size.subSize*0.62)}px;font-weight:700;letter-spacing:.2em}
.cap h1{color:#f6f8ff;font-size:${size.headSize}px;line-height:.98;font-weight:800;letter-spacing:-.04em;
  text-shadow:0 8px 50px rgba(0,0,0,.55)}
.cap h1 em{font-style:normal;
  background:linear-gradient(110deg,${ac},#ffffff 55%,${ac});-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;filter:drop-shadow(0 0 32px ${g}aa)}
.cap p{color:rgba(228,233,255,.66);font-size:${size.subSize}px;font-weight:500;margin-top:${Math.round(size.subSize*0.66)}px;letter-spacing:-.005em}

/* realistic device backdrop (frame + island + screen glare), blurred/dimmed */
.device{position:absolute;left:50%;top:${size.deviceTop}px;width:${size.deviceW}px;z-index:2;
  transform:translateX(-50%);border-radius:${outR}px;padding:${bezel}px;
  background:linear-gradient(155deg,#2a2c36 0%,#15161d 42%,#0a0b10 100%);
  box-shadow:0 90px 160px -46px rgba(0,0,0,.9),0 0 130px -14px ${g}55,
             inset 0 2px 1px rgba(255,255,255,.22),inset 0 -2px 2px rgba(0,0,0,.6)}
.device .scr{position:relative;border-radius:${inR}px;overflow:hidden;background:#0a0b10}
.device .scr img{width:100%;display:block;filter:blur(16px) brightness(.4) saturate(.92);transform:scale(1.1)}
.device .scr::after{content:"";position:absolute;inset:0;
  background:linear-gradient(125deg,rgba(255,255,255,.14) 0%,transparent 24%,transparent 82%,rgba(255,255,255,.05) 100%)}
.island{position:absolute;top:${bezel + Math.round(size.deviceW*0.014)}px;left:50%;transform:translateX(-50%);
  width:${islW}px;height:${islH}px;border-radius:${islH}px;background:#04050a;z-index:3;
  box-shadow:inset 0 0 4px rgba(255,255,255,.12)}

/* glow disc behind the hero card */
.disc{position:absolute;left:${slots[0].x}%;top:${slots[0].y}%;width:${Math.round(slots[0].scale*size.deviceW*1.4)}px;
  height:${Math.round(slots[0].scale*size.deviceW*1.4)}px;transform:translate(-50%,-50%);z-index:4;
  border-radius:50%;background:radial-gradient(closest-side,${g}5c,transparent 72%);filter:blur(36px);opacity:.9}

/* floating feature cards — gradient hairline frame + layered shadow + glow */
.card{position:absolute;border-radius:${Math.round(size.deviceW*0.044)}px;padding:3px;
  background:linear-gradient(150deg,rgba(255,255,255,.85),${ac}66 38%,rgba(255,255,255,.12) 78%);
  box-shadow:0 44px 90px -26px rgba(0,0,0,.72),0 0 70px -16px ${g}99}
.card.hero{box-shadow:0 64px 120px -26px rgba(0,0,0,.82),0 0 110px -10px ${g}cc}
.card .inner{width:100%;height:100%;border-radius:${Math.round(size.deviceW*0.044)-3}px;overflow:hidden;background:#fff}
.card .inner img{width:100%;height:100%;display:block}
.pin{position:absolute;top:-${Math.round(size.subSize*0.5)}px;left:${Math.round(size.deviceW*0.05)}px;z-index:2;
  padding:${Math.round(size.subSize*0.22)}px ${Math.round(size.subSize*0.46)}px;border-radius:999px;
  background:linear-gradient(135deg,${ac},${g});color:#0a0b10;
  font-size:${Math.round(size.subSize*0.52)}px;font-weight:800;letter-spacing:.12em;
  box-shadow:0 10px 24px -6px ${g},0 2px 0 rgba(255,255,255,.4) inset}

/* grain + vignette on top */
.grain{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:.11;mix-blend-mode:overlay;
  background-image:url("${GRAIN}");background-size:300px 300px}
.vig{position:absolute;inset:0;z-index:8;pointer-events:none;
  background:radial-gradient(135% 92% at 50% 40%,transparent 46%,rgba(0,0,0,.5) 100%)}

.brand{position:absolute;left:0;right:0;bottom:${size.brandBottom}px;z-index:10;text-align:center}
.brand .b{display:inline-flex;align-items:center;gap:16px}
.brand img{width:${Math.round(size.subSize*1.15)}px;height:${Math.round(size.subSize*1.15)}px;border-radius:${Math.round(size.subSize*0.3)}px;display:block;box-shadow:0 6px 18px rgba(0,0,0,.55)}
.brand span{color:rgba(236,239,255,.72);font-size:${Math.round(size.subSize*0.82)}px;font-weight:700;letter-spacing:.06em}
</style></head><body><div class="stage">
<div class="grid"></div><div class="horizon"></div><div class="aura"></div><div class="aura2"></div>
${particles(size.stars, starSeed)}
<div class="device"><div class="scr"><img src="data:image/png;base64,${baseB64}"><div class="island"></div></div></div>
<div class="disc"></div>
${cards}
<div class="grain"></div><div class="vig"></div>
<div class="cap"><div class="kick"><i></i><b>${scene.tag}</b></div><h1>${scene.head}</h1><p>${scene.sub}</p></div>
<div class="brand"><span class="b">${ICON_B64 ? `<img src="data:image/png;base64,${ICON_B64}">` : ""}<span>Singularity Inc.</span></span></div>
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

// Drive the live app into a scene and capture {base, focuses} — shared by the
// screenshot compositor and the preview-video builder.
export async function captureScene(browser, scene, port) {
  const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 });
  await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: true, onboarded: true })));
  await app.addInitScript(([save, now]) => {
    localStorage.setItem("singularity.save.v1", save);
    localStorage.setItem("singularity.lastSeen.v1", now);
  }, [JSON.stringify(scene.seed), String(Date.now())]);
  await app.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await app.waitForSelector("canvas.hall-canvas", { timeout: 10000 }).catch(() => {});
  await sleep(300);
  const collect = app.getByRole("button", { name: "Collect" });
  if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

  // dismiss any stray "BREAKING" world-event modal so it can't bleed into a
  // captured element (it shares the centered modal box) or block a floor tap
  for (let d = 0; d < 4; d++) {
    const wm = app.locator(".world-modal");
    if (!(await wm.count().catch(() => 0))) break;
    const choice = app.locator(".world-choice").first();
    if (await choice.count().catch(() => 0)) await choice.click().catch(() => {});
    else await app.locator(".world-modal .btn-primary, .world-modal .btn").first().click().catch(() => {});
    await sleep(250);
  }

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
    // open the prestige choices and WAIT for them — clicking + a fixed sleep is
    // flaky (the button may not be in view yet), which left the ship beat empty
    const shipBtn = app.getByRole("button", { name: /^Ship —/ });
    for (let a = 0; a < 3; a++) {
      await shipBtn.scrollIntoViewIfNeeded().catch(() => {});
      await shipBtn.click().catch(() => {});
      await app.waitForSelector(".ship-mode", { timeout: 3500 }).catch(() => {});
      if (await app.locator(".ship-mode").count().catch(() => 0)) break;
      await sleep(300);
    }
    await sleep(300);
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
  return { base, focuses };
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
      const { base, focuses } = await captureScene(browser, scene, PORT);

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

// Only run the screenshot generator when executed directly (not on import).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
