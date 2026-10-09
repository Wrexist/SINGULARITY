// App Store "creative assets" (iOS 27 / App Store Connect Asset Library):
//   • Product page header  — 3840×1646 (21:9), wordless brand art
//   • Search results       — 3840×2560 (3:2), "state the obvious": the hall + one line
//   • Universal            — 5244×2950 (16:9) PNG, usable for both placements
// All opaque (Apple rejects alpha). Focal art sits inside Apple's centred art-safe
// area (header template: x 1097–2743, y 493–1154) so device crops never clip it.
//
// The hall is painted by the game's OWN renderer at 4× (the in-app canvas caps DPR
// at 2 — too soft for a 3840px canvas), with the sky/vignette fills skipped so it
// floats on our backdrop. Output → appstore/creative/.
//
// Run: node scripts/store-creative-assets.mjs
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { findChrome, waitForServer } from "./store-screenshots.mjs";

const PORT = 4321;
// Hall render size (CSS px, painted at 4×). Generous padding around the room so the
// renderer's own glows have room to fade before the feathered edge. ROOM_K converts a
// "room width" design value into the <img> width (measured: the walls span ~862 CSS px
// of the 1300px render for this seed).
const HALL_W = 1300, HALL_H = 900;
const ROOM_K = HALL_W / 862;
const OUT = "appstore/creative";
mkdirSync(OUT, { recursive: true });

// A late-game, post-Singularity lab: the AGI era lights the core orb above the racks —
// the literal "singularity" the game is named for.
const SEED = {
  version: 3,
  resources: { compute: "184000", data: "9.2e6", money: "12500000" },
  upgrades: { rack_basic: 90, rack_server: 60, rack_tpu: 40, overclock: 8, data_pipeline: 8, monetize: 8, auto_claim: 1, auto_train: 1, expand_e: 6, expand_s: 6 },
  research: ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "rlhf", "caching", "distillation", "moe", "inference_api", "scaling_laws"],
  run: { active: true, progress: 0.62, readyToClaim: false },
  prestige: { legacyWeights: "240", ships: 12 },
  lifetimeMoney: "5.0e8", heat: 0, modifiers: [],
};
// The search asset's floating stat card uses the same mid-game save as the screenshots.
const UI_SEED = { ...SEED, upgrades: { ...SEED.upgrades, rack_basic: 50, rack_server: 30, rack_tpu: 16, expand_e: 3, expand_s: 3 }, prestige: { legacyWeights: "240", ships: 3 } };

// Render the hall (CSS W×H at `dpr`) with a transparent background → base64 PNG.
async function renderHall(page, W, H, dpr) {
  const url = await page.evaluate(async ([save, W, H, dpr]) => {
    const { deserialize } = await import("/src/engine/save.ts");
    const { buildHallModel } = await import("/src/render/hallModel.ts");
    const R = await import("/src/render/hallRenderer.ts");
    const model = buildHallModel(deserialize(save), 0);
    model.sides = []; // no expansion "+ $cost" markers (Apple: no prices in store art)
    model.skyline = []; // no rival towers — they read as clutter outside the app frame
    const c = document.createElement("canvas");
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Skip every full-canvas fill (sky, bloom, vignette, alignment tint) — their hard
    // rectangle edges would show on our backdrop, which paints its own glow instead.
    const fill = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => {
      if (x === 0 && y === 0 && w === W && h === H) return;
      fill(x, y, w, h);
    };
    R.drawHallStatic(ctx, model, W, H, 0.08); // daytime phase: no star field
    R.drawHallDynamic(ctx, model, { width: W, height: H, timeMs: 5000, reducedMotion: true, spawnFrom: 1e9, spawnT: 1, burst: 0, dpr });
    return c.toDataURL("image/png");
  }, [JSON.stringify(SEED), W, H, dpr]);
  return url.split(",")[1];
}

// Sharp capture of the live resource bar (compute / data / money) from the real app.
async function grabResourceBar(browser) {
  const app = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 4 });
  await app.addInitScript(([save, now]) => {
    localStorage.setItem("singularity.settings.v1", JSON.stringify({ reducedMotion: true, onboarded: true, shipExplained: true }));
    localStorage.setItem("singularity.paywall.v1", JSON.stringify({ launchShown: true, shipArmed: true, shipShown: true, lastAutoAt: 0 }));
    localStorage.setItem("singularity.save.v1", save);
    localStorage.setItem("singularity.lastSeen.v1", now);
  }, [JSON.stringify(UI_SEED), String(Date.now())]);
  await app.addInitScript(() => {
    const css = ".modal-backdrop{display:none!important}.daily-bar,.toast-stack{display:none!important}";
    const apply = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
  });
  await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await sleep(1200);
  const bar = app.locator(".resource-bar").first();
  const box = await bar.boundingBox();
  const b64 = (await bar.screenshot()).toString("base64");
  await app.close();
  return { b64, aspect: box.width / box.height };
}

const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

function stars(n, seed, maxY = 70) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 100).toFixed(2), y = (rnd() * maxY).toFixed(2);
    const sz = (2 + rnd() * 3.5).toFixed(1), op = (0.06 + rnd() * 0.22).toFixed(2);
    out += `<i class="st" style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;opacity:${op}"></i>`;
  }
  return out;
}

// Shared backdrop: deep indigo night, a violet core bloom behind the orb, a warm
// horizon band (echoing the renderer's own sky) and a perspective floor grid.
const backdropCss = (w, h) => `
*{margin:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;background:#0c0b1c}
.stage{position:relative;width:${w}px;height:${h}px;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Inter","Segoe UI",system-ui,sans-serif;
  background:linear-gradient(180deg,#0d0c20 0%,#151331 46%,#1a1638 62%,#0b0a19 100%)}
.band{position:absolute;left:-10%;right:-10%;height:${Math.round(h * 0.26)}px;
  background:radial-gradient(50% 50% at 50% 50%,rgba(150,64,96,.34),transparent 72%);filter:blur(60px)}
.bloom{position:absolute;border-radius:50%;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(146,108,255,.42),rgba(96,72,220,.14) 55%,transparent 78%);filter:blur(40px)}
.grid{position:absolute;left:-60%;right:-60%;bottom:-6%;z-index:1;
  background-image:linear-gradient(rgba(150,140,255,.16) 3px,transparent 3px),linear-gradient(90deg,rgba(150,140,255,.16) 3px,transparent 3px);
  background-size:220px 220px;transform:perspective(1600px) rotateX(74deg);transform-origin:bottom center;
  -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 70%);mask-image:linear-gradient(to top,#000 0%,transparent 70%);opacity:.55}
.st{position:absolute;border-radius:50%;background:#e6e8ff;z-index:1}
.hall{position:absolute;z-index:3;transform:translate(-50%,-50%);
  -webkit-mask-image:radial-gradient(closest-side,#000 64%,transparent 100%);mask-image:radial-gradient(closest-side,#000 64%,transparent 100%)}
.pool{position:absolute;z-index:2;border-radius:50%;transform:translate(-50%,-50%);
  background:radial-gradient(closest-side,rgba(52,210,170,.16),rgba(90,120,255,.10) 50%,transparent 75%);filter:blur(50px)}
.grain{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:.10;mix-blend-mode:overlay;background-image:url("${GRAIN}");background-size:360px 360px}
.vig{position:absolute;inset:0;z-index:8;pointer-events:none;background:radial-gradient(120% 100% at 50% 44%,transparent 48%,rgba(4,4,12,.62) 100%)}`;

// Header — wordless (the App Store overlays the name/icon/Get), hall centred on the
// art-safe area, flanks left to ambient night so wide displays feel like a horizon.
// Also the Universal (16:9) asset: Apple centre-crops it into both the 21:9 header and
// the 3:2 search slot, so it must stay centred and wordless too.
function headerHtml(hall, { w = 3840, h = 1646, room = 1450 } = {}) {
  const hw = Math.round(room * ROOM_K); // the room itself spans `room` px — inside the art-safe width
  return `<!doctype html><html><head><meta charset="utf-8"><style>${backdropCss(w, h)}</style></head><body><div class="stage">
  <div class="band" style="top:${Math.round(h * 0.30)}px"></div>
  <div class="bloom" style="left:50%;top:42%;width:${Math.round(room * 1.4)}px;height:${Math.round(room * 1.05)}px"></div>
  ${stars(Math.round(w / 35), 7, 55)}
  <div class="grid" style="height:${Math.round(h * 0.62)}px"></div>
  <div class="pool" style="left:50%;top:66%;width:${Math.round(room * 1.8)}px;height:${Math.round(room * 0.62)}px"></div>
  <img class="hall" src="data:image/png;base64,${hall}" style="left:50%;top:${Math.round(h * 0.57)}px;width:${hw}px">
  <div class="grain"></div><div class="vig"></div>
</div></body></html>`;
}

// Search results — must sell the game in half a second: the hall large on the right,
// one plain line on the left, and the real resource bar as proof of play.
function searchHtml(hall, bar, { w, h }) {
  const s = w / 3840; // scale everything off the 3840 design
  const hw = Math.round(1720 * ROOM_K * s);
  const hx = Math.round(2620 * s), hy = Math.round(1300 * s);
  const tx = Math.round(330 * s);
  const barW = Math.round(1260 * s);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${backdropCss(w, h)}
.copy{position:absolute;z-index:9;left:${tx}px;top:50%;transform:translateY(-58%);width:${Math.round(1560 * s)}px}
.kick{display:inline-flex;align-items:center;gap:${Math.round(22 * s)}px;padding:${Math.round(22 * s)}px ${Math.round(40 * s)}px;border-radius:999px;
  background:rgba(255,255,255,.06);border:${Math.max(2, Math.round(3 * s))}px solid rgba(255,255,255,.14);margin-bottom:${Math.round(64 * s)}px}
.kick i{width:${Math.round(22 * s)}px;height:${Math.round(22 * s)}px;border-radius:50%;background:#a993ff;box-shadow:0 0 ${Math.round(24 * s)}px #8a6bff}
.kick b{color:rgba(232,234,255,.82);font-size:${Math.round(44 * s)}px;font-weight:700;letter-spacing:.22em}
h1{color:#f6f7ff;font-size:${Math.round(236 * s)}px;line-height:.96;font-weight:800;letter-spacing:-.045em;text-shadow:0 ${Math.round(16 * s)}px ${Math.round(90 * s)}px rgba(0,0,0,.5)}
h1 em{font-style:normal;background:linear-gradient(105deg,#b9a6ff,#ffffff 52%,#8fd8ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
p{color:rgba(224,228,255,.62);font-size:${Math.round(78 * s)}px;font-weight:500;line-height:1.28;margin-top:${Math.round(56 * s)}px;letter-spacing:-.01em}
.bar{position:absolute;z-index:9;left:${tx}px;top:${Math.round(h * 0.5 + 640 * s)}px;width:${barW}px;border-radius:${Math.round(56 * s)}px;padding:${Math.max(3, Math.round(5 * s))}px;
  background:linear-gradient(150deg,rgba(255,255,255,.75),rgba(170,150,255,.4) 40%,rgba(255,255,255,.1) 80%);
  box-shadow:0 ${Math.round(60 * s)}px ${Math.round(120 * s)}px -${Math.round(30 * s)}px rgba(0,0,0,.8),0 0 ${Math.round(120 * s)}px -${Math.round(20 * s)}px rgba(130,100,255,.7)}
.bar div{border-radius:${Math.round(51 * s)}px;overflow:hidden;background:#fff}
.bar img{display:block;width:100%}
</style></head><body><div class="stage">
  <div class="band" style="top:${Math.round(h * 0.34)}px"></div>
  <div class="bloom" style="left:${hx}px;top:${Math.round(hy - 260 * s)}px;width:${Math.round(2100 * s)}px;height:${Math.round(1800 * s)}px"></div>
  ${stars(Math.round(140 * s), 11, 60)}
  <div class="grid" style="height:${Math.round(h * 0.55)}px"></div>
  <div class="pool" style="left:${hx}px;top:${Math.round(hy + 420 * s)}px;width:${Math.round(2400 * s)}px;height:${Math.round(900 * s)}px"></div>
  <img class="hall" src="data:image/png;base64,${hall}" style="left:${hx}px;top:${hy}px;width:${hw}px">
  <div class="copy"><div class="kick"><i></i><b>AI COMPUTE TYCOON</b></div>
    <h1>Build an<br>AI <em>empire</em></h1>
    <p>Grow a data center from one rack<br>to the Singularity.</p></div>
  <div class="bar"><div><img src="data:image/png;base64,${bar.b64}"></div></div>
  <div class="grain"></div><div class="vig"></div>
</div></body></html>`;
}

async function shoot(browser, html, w, h, path, type) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await sleep(300);
  await page.screenshot({ path, type, ...(type === "jpeg" ? { quality: 95 } : {}) });
  await page.close();
  console.log(`✓ ${path}`);
}

async function run() {
  const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  let browser;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    const hall = await renderHall(page, HALL_W, HALL_H, 4);
    if (process.env.DUMP) (await import("node:fs")).writeFileSync(process.env.DUMP, Buffer.from(hall, "base64"));
    await page.close();
    const bar = await grabResourceBar(browser);

    // JPEG for the 21:9 / 3:2 slots (no alpha channel by construction); the 16:9
    // universal slot only accepts PNG (Chrome writes an opaque RGB PNG — no alpha).
    await shoot(browser, headerHtml(hall), 3840, 1646, `${OUT}/header-3840x1646.jpg`, "jpeg");
    await shoot(browser, searchHtml(hall, bar, { w: 3840, h: 2560 }), 3840, 2560, `${OUT}/search-3840x2560.jpg`, "jpeg");
    await shoot(browser, headerHtml(hall, { w: 5244, h: 2950, room: 1900 }), 5244, 2950, `${OUT}/universal-5244x2950.png`, "png");
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();
