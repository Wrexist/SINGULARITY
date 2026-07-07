// App Store preview video — App Store Review compliant, ~20s, 886×1920 H.264.
//
// Apple App Store Review Guidelines require that an app preview:
//   • 2.3.4 — shows the app in use via full-screen video SCREEN CAPTURES, with
//     NO device images / device frames / bezels around the app.
//   • 2.3.7 — contains NO references to the app's price (including "free" or
//     "discounted"). Price/monetization messaging belongs in the description.
//
// So this builder does NOT composite the app inside a phone mockup or show the
// paid "Premium" screen. Instead it records the LIVE, running app FULL-SCREEN
// (the real hall canvas animating, resource meters ticking, modals opening as we
// drive it), and burns in short text overlays for clarity — which Apple allows
// ("video screen captures of the app that may include narration and video or
// textual overlays for added clarity"). Frames are captured deterministically
// and encoded with ffmpeg (libx264 + silent AAC).
// Output → appstore/preview.mp4
//
// Run: node scripts/store-preview-video.mjs
import { spawn, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { SCENES, findChrome, waitForServer, ICON_B64 } from "./store-screenshots.mjs";

const PORT = 4319;
const FPS = 30;
const OUT = "appstore/preview.mp4";
const FFMPEG = process.env.FFMPEG || "ffmpeg";

// Final canvas. The live app is captured at a phone viewport (443×960) at 2x so
// each screenshot is exactly 886×1920 — the real app screen, edge to edge, no
// frame. 886/1920 ≈ 0.4615 matches a modern iPhone portrait aspect.
const V = { w: 886, h: 1920, vw: 443, vh: 960, dsf: 2 };

// ---- timeline (seconds) ----
const INTRO = 1.7, BEAT = 2.6, OUTRO = 2.6;
const DIP = 0.18;      // soft dark dip at each segment edge (masks the cut)
const CAP_IN = 0.5;    // caption slide/fade-in
const framesFor = (sec) => Math.round(sec * FPS);

// Beats reuse the real game states/seeds the screenshot pipeline drives into,
// but with price-free captions and WITHOUT the paid "Premium/Settings" screen
// (which shows a $ price and would violate 2.3.7). `head` marks its accent word
// with |bars|.
const S = SCENES;
const BEATS = [
  { seed: S[0].seed, nav: "none",     tag: "AI COMPUTE TYCOON",   head: "Build an AI |empire|",  sub: "A 2.5D data center that grows as you scale", glow: S[0].glow, accent: S[0].accent },
  { seed: S[1].seed, nav: "expand",   tag: "IT PHYSICALLY GROWS", head: "Watch it |grow|",       sub: "Tap the floor — the hall physically expands", glow: S[1].glow, accent: S[1].accent },
  { seed: S[2].seed, nav: "research", tag: "PROGRESSION SPINE",   head: "Climb the |tree|",      sub: "An absurd AI research tree across every era", glow: S[2].glow, accent: S[2].accent },
  { seed: S[0].seed, nav: "ship",     tag: "PRESTIGE LOOP",       head: "Ship the |model|",      sub: "Reset to bank permanent Legacy boosts",       glow: S[3].glow, accent: S[3].accent },
  { seed: S[4].seed, nav: "market",   tag: "RISK & REWARD",       head: "Bend the |rules|",      sub: "Buy data legally… or risk the dark-web Bazaar", glow: S[4].glow, accent: S[4].accent },
  { seed: S[0].seed, nav: "none",     tag: "IDLE, DONE RIGHT",    head: "Plays |offline|",       sub: "Your lab keeps earning while you're away",     glow: "#19c06b", accent: "#5ce6a0" },
];

// Ambient distractions the live app can throw during a 2.6s capture — random
// "world event" modals, the daily-boost banner, transient toasts. They cover the
// beat's intended content (and can carry off-message flavor text), so hide them
// for a clean, on-message capture. Injected at page-load so nothing flashes.
const SUPPRESS_CSS =
  ".modal-backdrop:has(.world-modal){display:none!important}" +
  ".daily-bar{display:none!important}" +
  ".toast-stack{display:none!important}";

// ---- shared page-side helpers (run inside the browser) ----

// Inject a fixed, full-screen text-overlay layer over the live app. This is a
// permitted "textual overlay" — the app itself still fills the frame underneath.
function injectOverlay(beat) {
  const [pre, accent, post] = beat.head.split("|");
  const el = document.getElementById("__ov") || (() => {
    const d = document.createElement("div"); d.id = "__ov"; document.body.appendChild(d);
    const st = document.createElement("style"); st.id = "__ovcss"; document.head.appendChild(st);
    st.textContent = `
      #__ov{position:fixed;inset:0;z-index:2147483000;pointer-events:none;
        font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif}
      #__scrim{position:absolute;top:0;left:0;right:0;height:40%;
        -webkit-mask-image:linear-gradient(180deg,#000 42%,transparent);mask-image:linear-gradient(180deg,#000 42%,transparent)}
      #__cap{position:absolute;top:5.2%;left:0;right:0;text-align:center;padding:0 34px;will-change:transform,opacity}
      #__kick{display:inline-flex;align-items:center;gap:9px;margin-bottom:15px;padding:7px 13px;border-radius:999px;
        background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);
        box-shadow:0 8px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.2)}
      #__kick i{width:9px;height:9px;border-radius:50%}
      #__kick b{color:rgba(240,243,255,.86);font-size:13px;font-weight:700;letter-spacing:.2em}
      #__head{color:#f6f8ff;font-size:52px;line-height:1;font-weight:800;letter-spacing:-.035em;
        text-shadow:0 6px 34px rgba(0,0,0,.7),0 2px 6px rgba(0,0,0,.6)}
      #__head em{font-style:normal}
      #__sub{color:rgba(232,237,255,.9);font-size:21px;font-weight:500;margin-top:12px;letter-spacing:-.005em;
        text-shadow:0 2px 12px rgba(0,0,0,.75)}
      #__dim{position:absolute;inset:0;background:#04040a;opacity:0}`;
    return d;
  })();
  el.innerHTML =
    `<div id="__scrim" style="background:linear-gradient(180deg,rgba(4,5,10,.9),rgba(4,5,10,.32) 60%,transparent)"></div>` +
    `<div id="__cap"><div id="__kick"><i style="background:${beat.accent};box-shadow:0 0 14px ${beat.glow}"></i><b>${beat.tag}</b></div>` +
    `<div id="__head">${pre}<em style="background:linear-gradient(110deg,${beat.accent},#fff 55%,${beat.accent});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 20px ${beat.glow}aa)">${accent}</em>${post}</div>` +
    `<div id="__sub">${beat.sub}</div></div>` +
    `<div id="__dim"></div>`;
  // per-frame driver: caption reveal + edge dip
  window.__drive = (cap, dim) => {
    const c = document.getElementById("__cap");
    if (c) { c.style.opacity = String(cap); c.style.transform = `translateY(${(1 - cap) * -18}px)`; }
    const s = document.getElementById("__scrim"); if (s) s.style.opacity = String(cap);
    const d = document.getElementById("__dim"); if (d) d.style.opacity = String(dim);
  };
}

const ease = (p) => { p = Math.max(0, Math.min(1, p)); return 1 - Math.pow(1 - p, 3); };
// dark dip at both segment edges → adjacent segments meet mid-dip, hiding the cut
function edgeDim(i, n) {
  const inS = ease(1 - (i / FPS) / DIP);
  const outS = ease(1 - ((n - 1 - i) / FPS) / DIP);
  return Math.max(0, Math.max(inS, outS)) * 0.6;
}

// Drive the live app into a beat's state (mirrors the screenshot pipeline's
// navigation) and hold the page open so we can record it animating.
async function openBeat(browser, beat) {
  const app = await browser.newPage({ viewport: { width: V.vw, height: V.vh }, deviceScaleFactor: V.dsf });
  // reducedMotion:false so the hall actually animates on camera (the screenshot
  // pipeline uses true; a video wants the motion).
  await app.addInitScript(() => localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: true, haptics: true, reducedMotion: false, onboarded: true })));
  await app.addInitScript(([save, now]) => {
    localStorage.setItem("singularity.save.v1", save);
    localStorage.setItem("singularity.lastSeen.v1", now);
  }, [JSON.stringify(beat.seed), String(Date.now())]);
  await app.addInitScript((css) => {
    const apply = () => { const s = document.createElement("style"); s.id = "__suppress"; s.textContent = css; document.head.appendChild(s); };
    if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
  }, SUPPRESS_CSS);
  await app.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await app.waitForSelector("canvas.hall-canvas", { timeout: 10000 }).catch(() => {});
  await sleep(350);

  const collect = app.getByRole("button", { name: "Collect" });
  if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

  // clear any stray world-event modal so the intended state is on screen
  for (let d = 0; d < 4; d++) {
    if (!(await app.locator(".world-modal").count().catch(() => 0))) break;
    const choice = app.locator(".world-choice").first();
    if (await choice.count().catch(() => 0)) await choice.click().catch(() => {});
    else await app.locator(".world-modal .btn-primary, .world-modal .btn").first().click().catch(() => {});
    await sleep(250);
  }

  // Lab sub-section switch (Build / Research / HQ) — the tree and the Data Bazaar
  // both live under the "Research" tab; the ship modes live under "HQ".
  const goSection = async (label) => {
    const btn = app.locator(".labnav button", { hasText: label }).first();
    if (await btn.count().catch(() => 0)) { await btn.click().catch(() => {}); await sleep(400); }
  };

  if (beat.nav === "expand") {
    await app.waitForFunction(() => Array.isArray(window.__HALL_MARKERS__) && window.__HALL_MARKERS__.length > 0, { timeout: 5000 }).catch(() => {});
    const t = await app.evaluate(() => {
      const c = document.querySelector("canvas.hall-canvas");
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const m = (window.__HALL_MARKERS__ || []).find((x) => !x.maxed);
      return m ? { x: r.left + m.centroid.x, y: r.top + m.centroid.y } : null;
    });
    if (t) await app.mouse.click(t.x, t.y);
    await sleep(450);
  } else if (beat.nav === "research") {
    await goSection("Research");
  } else if (beat.nav === "market") {
    await goSection("Research");
    await app.getByText("The Data Bazaar").first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(350);
  } else if (beat.nav === "ship") {
    await goSection("HQ");
    const shipBtn = app.getByRole("button", { name: /choose how/i });
    for (let a = 0; a < 3; a++) {
      await shipBtn.scrollIntoViewIfNeeded().catch(() => {});
      await shipBtn.click().catch(() => {});
      await app.waitForSelector(".ship-mode", { timeout: 3500 }).catch(() => {});
      if (await app.locator(".ship-mode").count().catch(() => 0)) break;
      await sleep(300);
    }
    await sleep(300);
  }

  await app.evaluate(injectOverlay, beat);
  await app.evaluate(() => window.__drive(0, 0.6)).catch(() => {}); // start mid-dip, caption hidden
  return app;
}

// ---- intro / outro (branded, price-free, no device frame) ----
function cardHtml(kind, title, sub, accent, glow) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:${V.w}px;height:${V.h}px;overflow:hidden;background:#04040a;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif}
.wrap{position:relative;width:${V.w}px;height:${V.h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
  background:radial-gradient(85% 55% at 50% 32%, ${accent}26 0%, transparent 60%),
             radial-gradient(120% 75% at 50% 104%, ${glow}3a 0%, transparent 60%),
             linear-gradient(180deg,#0b0c14 0%,#070810 54%,#04040a 100%)}
.logo{width:214px;height:214px;border-radius:48px;
  box-shadow:0 40px 90px -20px rgba(0,0,0,.75),0 0 90px -12px ${glow}aa;will-change:transform,opacity}
.title{margin-top:40px;color:#f6f8ff;font-size:58px;font-weight:850;letter-spacing:-.04em;will-change:opacity,transform}
.sub{margin-top:16px;color:rgba(230,235,255,.72);font-size:24px;font-weight:500;will-change:opacity}
.grain{position:absolute;inset:0;pointer-events:none;opacity:.5;
  background:radial-gradient(130% 90% at 50% 40%,transparent 48%,rgba(0,0,0,.5) 100%)}
</style></head><body><div class="wrap">
  ${ICON_B64 ? `<img id="logo" class="logo" src="data:image/png;base64,${ICON_B64}">` : ""}
  <div id="title" class="title">${title}</div>
  <div id="sub" class="sub">${sub}</div>
  <div class="grain"></div>
</div>
<script>
const ease=(p)=>{p=Math.max(0,Math.min(1,p));return 1-Math.pow(1-p,3)};
window.__r=function(t,dur,dim){
  const p=ease(Math.min(1,t/0.8));
  const lg=document.getElementById('logo'); if(lg){lg.style.opacity=String(ease(Math.min(1,t/0.5)));lg.style.transform='scale('+(0.9+0.1*p)+')';}
  const ti=document.getElementById('title'); if(ti){const q=ease(Math.min(1,(t-0.15)/0.6));ti.style.opacity=String(q);ti.style.transform='translateY('+((1-q)*14)+'px)';}
  const su=document.getElementById('sub'); if(su)su.style.opacity=String(ease(Math.min(1,(t-0.35)/0.6)));
  let d=document.getElementById('__dim'); if(!d){d=document.createElement('div');d.id='__dim';d.style.cssText='position:absolute;inset:0;background:#04040a';document.querySelector('.wrap').appendChild(d);} d.style.opacity=String(dim);
};
</script></body></html>`;
}

async function run() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  const framesDir = mkdtempSync(join(tmpdir(), "sing-preview-"));
  let browser, frame = 0;
  const shot = async (page) => { await page.screenshot({ path: join(framesDir, `f_${String(frame++).padStart(4, "0")}.png`) }); };

  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    // intro
    console.log("Rendering intro…");
    const introPage = await browser.newPage({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1 });
    await introPage.setContent(cardHtml("intro", "Singularity Inc.", "Build an AI compute empire.", S[0].accent, S[0].glow), { waitUntil: "networkidle" });
    const nIntro = framesFor(INTRO);
    for (let i = 0; i < nIntro; i++) {
      await introPage.evaluate(([t, d]) => window.__r(t, 0, d), [i / FPS, edgeDim(i, nIntro)]);
      await shot(introPage);
    }
    await introPage.close();

    // beats — live app, full screen
    for (let b = 0; b < BEATS.length; b++) {
      console.log(`Recording beat ${b + 1}/${BEATS.length} — ${BEATS[b].head.replace(/\|/g, "")}…`);
      const app = await openBeat(browser, BEATS[b]);
      const n = framesFor(BEAT);
      for (let i = 0; i < n; i++) {
        const cap = ease(Math.min(1, (i / FPS) / CAP_IN));
        await app.evaluate(([c, d]) => window.__drive(c, d), [cap, edgeDim(i, n)]);
        await shot(app);
      }
      await app.close();
    }

    // outro (no price references)
    console.log("Rendering outro…");
    const outroPage = await browser.newPage({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1 });
    await outroPage.setContent(cardHtml("outro", "Build the singularity.", "AI Data-Center Empire Builder", "#5b8cff", "#8fb0ff"), { waitUntil: "networkidle" });
    const nOutro = framesFor(OUTRO);
    for (let i = 0; i < nOutro; i++) {
      await outroPage.evaluate(([t, d]) => window.__r(t, 0, d), [i / FPS, edgeDim(i, nOutro)]);
      await shot(outroPage);
    }
    await outroPage.close();

    console.log(`Encoding H.264 (${frame} frames, ${(frame / FPS).toFixed(1)}s)…`);
    mkdirSync("appstore", { recursive: true });
    const dur = frame / FPS;
    const args = [
      "-y", "-framerate", String(FPS), "-i", join(framesDir, "f_%04d.png"),
      "-f", "lavfi", "-t", String(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", OUT,
    ];
    execSync(`${FFMPEG} ${args.map((a) => `'${a}'`).join(" ")}`, { stdio: "inherit" });
    console.log(`\n✓ ${OUT}  (${dur.toFixed(1)}s, ${V.w}×${V.h}, no device frame, no price references)`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    rmSync(framesDir, { recursive: true, force: true });
  }
}

run();
