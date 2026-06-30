// App Store preview video — clean, marketable, ~19s, 886×1920 H.264.
// Reuses the screenshot capture pipeline (captureScene) so the video matches the
// store screenshots exactly, then animates an intro → 6 feature beats → CTA outro
// with entrances, float, device zoom and crossfades. Frames are rendered
// deterministically and encoded with ffmpeg (libx264 + silent AAC).
// Output → appstore/preview.mp4
//
// Run: node scripts/store-preview-video.mjs
import { spawn, execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { SCENES, captureScene, findChrome, waitForServer, ICON_B64 } from "./store-screenshots.mjs";

const PORT = 4319;
const FPS = 30;
const OUT = "appstore/preview.mp4";
const FFMPEG = process.env.FFMPEG || "ffmpeg";

// Video canvas + proportional layout (same aspect/feel as the 1284×2778 shots).
const V = { w: 886, h: 1920, deviceW: 676, deviceTop: 324, headSize: 66, subSize: 28, capTop: 104, brandBottom: 56 };

const SLOTS = {
  1: [{ x: 50, y: 57, scale: 1.00, rot: 0, z: 7 }],
  2: [{ x: 52, y: 66, scale: 0.96, rot: 1.5, z: 7 }, { x: 47, y: 31, scale: 0.84, rot: -3.5, z: 6 }],
  3: [{ x: 55, y: 74, scale: 0.82, rot: 1.5, z: 8 }, { x: 43, y: 49, scale: 0.78, rot: -3, z: 7 }, { x: 54, y: 26, scale: 0.72, rot: 3, z: 6 }],
};
const GRAIN = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

// ---- timeline (seconds) ----
const INTRO_END = 2.4;
const SCENE_START = 2.1, SCENE_STEP = 2.3, SCENE_DUR = 2.7;
const windows = SCENES.map((_, i) => ({ s: +(SCENE_START + i * SCENE_STEP).toFixed(3), e: +(SCENE_START + i * SCENE_STEP + SCENE_DUR).toFixed(3), dur: SCENE_DUR }));
const OUTRO_START = +(windows[windows.length - 1].e - 0.3).toFixed(3);
const END = +(OUTRO_START + 3.2).toFixed(3);
const TOTAL_FRAMES = Math.ceil(END * FPS);

function bg(scene) {
  const g = scene.glow, ac = scene.accent;
  return `background:
    radial-gradient(80% 50% at 50% 0%, ${g}26 0%, transparent 60%),
    radial-gradient(70% 45% at 84% 30%, ${ac}1c 0%, transparent 60%),
    radial-gradient(120% 75% at 50% 102%, ${g}40 0%, transparent 62%),
    linear-gradient(180deg,#0b0c14 0%,#070810 52%,#04040a 100%)`;
}

function cardHtml(f, slot, scene, primary) {
  const cardW = Math.round(slot.scale * V.deviceW);
  let cardH = Math.round(cardW / f.aspect);
  const maxH = Math.round(V.h * 0.46);
  const fit = cardH > maxH ? "object-fit:cover;object-position:top" : "";
  cardH = Math.min(cardH, maxH);
  const r = Math.round(V.deviceW * 0.05);
  const pin = primary && scene.pin
    ? `<span class="vpin" style="top:-${Math.round(V.subSize*0.5)}px;left:${Math.round(V.deviceW*0.05)}px;padding:${Math.round(V.subSize*0.22)}px ${Math.round(V.subSize*0.46)}px;font-size:${Math.round(V.subSize*0.52)}px;background:linear-gradient(135deg,${scene.accent},${scene.glow});box-shadow:0 8px 20px -6px ${scene.glow}">${scene.pin}</span>` : "";
  const shadow = primary
    ? `0 60px 110px -26px rgba(0,0,0,.82),0 0 100px -10px ${scene.glow}cc`
    : `0 40px 80px -26px rgba(0,0,0,.74),0 0 64px -14px ${scene.glow}99`;
  return `<div class="vcard" style="left:${slot.x}%;top:${slot.y}%;width:${cardW}px;height:${cardH}px;z-index:${slot.z};transform:translate(-50%,-50%) rotate(${slot.rot}deg)">
    <div class="vanim" style="border-radius:${r}px;padding:3px;background:linear-gradient(150deg,rgba(255,255,255,.85),${scene.accent}66 38%,rgba(255,255,255,.12) 78%);box-shadow:${shadow}">
      ${pin}<div class="vinner" style="border-radius:${r-3}px"><img style="${fit}" src="data:image/png;base64,${f.b64}"></div>
    </div></div>`;
}

function sceneLayer(scene, base, focuses, i) {
  const g = scene.glow, ac = scene.accent;
  const slots = SLOTS[Math.min(focuses.length, 3)] || SLOTS[1];
  const bezel = Math.round(V.deviceW * 0.016), outR = Math.round(V.deviceW * 0.085), inR = outR - bezel;
  const islW = Math.round(V.deviceW * 0.30), islH = Math.round(V.deviceW * 0.034);
  const cards = focuses.slice(0, slots.length).map((f, idx) => cardHtml(f, slots[idx], scene, idx === 0)).join("");
  return `<div class="vscene" id="vscene-${i}" style="${bg(scene)}">
    <div class="grid" style="background-image:linear-gradient(${ac}26 2px,transparent 2px),linear-gradient(90deg,${ac}26 2px,transparent 2px)"></div>
    <div class="horizon" style="background:radial-gradient(60% 100% at 50% 0%,${g}55,transparent 72%)"></div>
    <div class="aura" style="background:radial-gradient(closest-side,${g}4d,transparent 70%)"></div>
    <div class="aura2" style="background:radial-gradient(closest-side,${ac}3a,transparent 70%)"></div>
    <div class="device" style="border-radius:${outR}px;padding:${bezel}px"><div class="scr" style="border-radius:${inR}px"><img src="data:image/png;base64,${base}"><div class="island" style="top:${bezel + Math.round(V.deviceW*0.014)}px;width:${islW}px;height:${islH}px;border-radius:${islH}px"></div></div></div>
    <div class="disc" style="left:${slots[0].x}%;top:${slots[0].y}%;width:${Math.round(slots[0].scale*V.deviceW*1.4)}px;height:${Math.round(slots[0].scale*V.deviceW*1.4)}px;background:radial-gradient(closest-side,${g}5c,transparent 72%)"></div>
    ${cards}
    <div class="vcap"><div class="vkick"><i style="background:${ac};box-shadow:0 0 16px ${g}"></i><b>${scene.tag}</b></div><h1 class="vhead">${scene.head.replace(/<em>/g, `<em style="background:linear-gradient(110deg,${ac},#fff 55%,${ac});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 22px ${g}aa)">`)}</h1><p class="vsub">${scene.sub}</p></div>
    <div class="vbrand">${ICON_B64 ? `<img src="data:image/png;base64,${ICON_B64}">` : ""}<span>Singularity Inc.</span></div>
  </div>`;
}

function pageHtml(layers) {
  const acc = SCENES[0].accent, gl = SCENES[0].glow;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:${V.w}px;height:${V.h}px;overflow:hidden;background:#04040a;
  font-family:-apple-system,"SF Pro Display","Segoe UI",system-ui,sans-serif}
.stage{position:relative;width:${V.w}px;height:${V.h}px;overflow:hidden;background:#04040a}
.vscene{position:absolute;inset:0;opacity:0;will-change:opacity}
.grid{position:absolute;left:-45%;right:-45%;bottom:-12%;height:72%;background-size:110px 110px;
  transform:perspective(1100px) rotateX(75deg);transform-origin:bottom center;
  -webkit-mask-image:linear-gradient(to top,#000 2%,transparent 64%);mask-image:linear-gradient(to top,#000 2%,transparent 64%);opacity:.5}
.horizon{position:absolute;left:0;right:0;top:50%;height:300px;filter:blur(24px);opacity:.7}
.aura{position:absolute;left:50%;top:60%;width:${Math.round(V.w*1.3)}px;height:${Math.round(V.w*1.3)}px;transform:translate(-50%,-50%);border-radius:50%;filter:blur(70px);opacity:.75}
.aura2{position:absolute;left:22%;top:30%;width:${Math.round(V.w*0.72)}px;height:${Math.round(V.w*0.72)}px;transform:translate(-50%,-50%);border-radius:50%;filter:blur(80px);opacity:.6}
.device{position:absolute;left:50%;top:${V.deviceTop}px;width:${V.deviceW}px;transform:translateX(-50%);
  background:linear-gradient(155deg,#2a2c36 0%,#15161d 42%,#0a0b10 100%);
  box-shadow:0 80px 140px -46px rgba(0,0,0,.9),0 0 120px -14px ${gl}55,inset 0 2px 1px rgba(255,255,255,.22),inset 0 -2px 2px rgba(0,0,0,.6);will-change:transform}
.scr{position:relative;overflow:hidden;background:#0a0b10}
.scr img{width:100%;display:block;filter:blur(13px) brightness(.4) saturate(.92);transform:scale(1.1)}
.scr::after{content:"";position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.14) 0%,transparent 24%,transparent 82%,rgba(255,255,255,.05) 100%)}
.island{position:absolute;left:50%;transform:translateX(-50%);background:#04050a;z-index:3;box-shadow:inset 0 0 4px rgba(255,255,255,.12)}
.disc{position:absolute;transform:translate(-50%,-50%);border-radius:50%;filter:blur(34px);opacity:.9;z-index:4}
.vcard{position:absolute}
.vanim{width:100%;height:100%;opacity:0;will-change:transform,opacity}
.vinner{width:100%;height:100%;overflow:hidden;background:#fff}
.vinner img{width:100%;height:100%;display:block}
.vpin{position:absolute;z-index:2;border-radius:999px;color:#0a0b10;font-weight:800;letter-spacing:.12em}
.vcap{position:absolute;top:0;left:0;right:0;z-index:9;text-align:center;padding:${V.capTop}px 56px 0;will-change:transform,opacity}
.vkick{display:inline-flex;align-items:center;gap:10px;margin-bottom:${Math.round(V.headSize*0.34)}px;padding:${Math.round(V.subSize*0.34)}px ${Math.round(V.subSize*0.62)}px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 24px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.18)}
.vkick i{width:${Math.round(V.subSize*0.34)}px;height:${Math.round(V.subSize*0.34)}px;border-radius:50%}
.vkick b{color:rgba(238,241,255,.82);font-size:${Math.round(V.subSize*0.62)}px;font-weight:700;letter-spacing:.2em}
.vhead{color:#f6f8ff;font-size:${V.headSize}px;line-height:.98;font-weight:800;letter-spacing:-.04em;text-shadow:0 8px 40px rgba(0,0,0,.55)}
.vhead em{font-style:normal}
.vsub{color:rgba(228,233,255,.66);font-size:${V.subSize}px;font-weight:500;margin-top:${Math.round(V.subSize*0.66)}px;letter-spacing:-.005em}
.vbrand{position:absolute;left:0;right:0;bottom:${V.brandBottom}px;z-index:10;display:flex;align-items:center;justify-content:center;gap:12px}
.vbrand img{width:${Math.round(V.subSize*1.2)}px;height:${Math.round(V.subSize*1.2)}px;border-radius:${Math.round(V.subSize*0.3)}px;box-shadow:0 6px 18px rgba(0,0,0,.55)}
.vbrand span{color:rgba(236,239,255,.72);font-size:${Math.round(V.subSize*0.82)}px;font-weight:700;letter-spacing:.06em}

/* intro + outro */
.full{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:20;
  background:radial-gradient(90% 60% at 50% 30%, ${acc}22 0%, transparent 60%),linear-gradient(180deg,#0b0c14,#05060c)}
.full img{width:${Math.round(V.deviceW*0.34)}px;height:${Math.round(V.deviceW*0.34)}px;border-radius:${Math.round(V.deviceW*0.08)}px;box-shadow:0 30px 70px -16px rgba(0,0,0,.7),0 0 70px -10px ${gl}88;will-change:transform}
.ititle{margin-top:${Math.round(V.headSize*0.5)}px;color:#f6f8ff;font-size:${Math.round(V.headSize*1.12)}px;font-weight:850;letter-spacing:-.04em}
.isub{margin-top:${Math.round(V.subSize*0.5)}px;color:rgba(228,233,255,.66);font-size:${V.subSize}px;font-weight:500}
.octa{margin-top:${Math.round(V.headSize*0.46)}px;display:inline-block;padding:${Math.round(V.subSize*0.6)}px ${Math.round(V.subSize*1.3)}px;border-radius:999px;
  background:linear-gradient(135deg,${acc},${gl});color:#06070e;font-size:${Math.round(V.subSize*0.92)}px;font-weight:800;letter-spacing:.02em;box-shadow:0 16px 40px -10px ${gl}}
.ofoot{margin-top:${Math.round(V.subSize*0.9)}px;color:rgba(228,233,255,.5);font-size:${Math.round(V.subSize*0.72)}px;font-weight:600;letter-spacing:.08em}

.grain{position:absolute;inset:0;z-index:30;pointer-events:none;opacity:.11;mix-blend-mode:overlay;background-image:url("${GRAIN}");background-size:300px 300px}
.vig{position:absolute;inset:0;z-index:30;pointer-events:none;background:radial-gradient(135% 92% at 50% 40%,transparent 46%,rgba(0,0,0,.5) 100%)}
</style></head><body><div class="stage">
${layers}
<div class="full" id="intro">
  ${ICON_B64 ? `<img class="ilogo" src="data:image/png;base64,${ICON_B64}">` : ""}
  <div class="ititle">Singularity Inc.</div>
  <div class="isub">Build an AI compute empire.</div>
</div>
<div class="full" id="outro">
  ${ICON_B64 ? `<img class="ologo" src="data:image/png;base64,${ICON_B64}">` : ""}
  <div class="ititle">Build the singularity.</div>
  <div class="octa">Free on the App Store</div>
  <div class="ofoot">NO ADS · NO PAY-TO-WIN · PLAYS OFFLINE</div>
</div>
<div class="grain"></div><div class="vig"></div>
</div>
<script>
const WIN = ${JSON.stringify(windows)};
const INTRO_END = ${INTRO_END}, OUTRO_START = ${OUTRO_START}, END = ${END};
const clamp = (v)=>Math.max(0,Math.min(1,v));
const ease = (p)=>{p=clamp(p);return 1-Math.pow(1-p,3)};
function fade(t,s,e,inDur,outDur){ if(t<s||t>e) return 0; return ease((t-s)/inDur) * (t>e-outDur ? 1-ease((t-(e-outDur))/outDur) : 1); }
window.__render = function(t){
  // intro
  const intro = document.getElementById('intro');
  const io = fade(t, 0, INTRO_END, 0.45, 0.45);
  intro.style.display = io>0?'flex':'none'; intro.style.opacity = io;
  if(io>0){ const p=ease(Math.min(1,t/0.8)); const lg=intro.querySelector('.ilogo'); if(lg) lg.style.transform=\`scale(\${0.86+0.14*p}) translateY(\${(1-p)*16}px)\`; }
  // scenes
  WIN.forEach((w,i)=>{
    const el=document.getElementById('vscene-'+i);
    const op = fade(t, w.s, w.e, 0.45, 0.4);
    el.style.display = op>0?'block':'none'; el.style.opacity = op;
    if(op<=0) return;
    const lt=t-w.s;
    el.querySelectorAll('.vanim').forEach((c,idx)=>{
      const e=ease((lt-idx*0.09)/0.55), x=ease((lt-(w.dur-0.45))/0.45), fl=Math.sin((lt+idx*0.7)*1.7)*4;
      c.style.opacity=Math.max(0,e*(1-x));
      c.style.transform=\`translateY(\${(1-e)*70 - fl}px) scale(\${0.9+0.1*e + x*0.04})\`;
    });
    const cap=el.querySelector('.vcap'); const ce=ease(lt/0.5);
    cap.style.opacity=Math.max(0,ce); cap.style.transform=\`translateY(\${(1-ce)*-22}px)\`;
    const dev=el.querySelector('.device'); dev.style.transform=\`translateX(-50%) scale(\${1+0.05*Math.min(1,lt/w.dur)})\`;
  });
  // outro
  const outro=document.getElementById('outro');
  const oo = t>=OUTRO_START ? ease(Math.min(1,(t-OUTRO_START)/0.55)) : 0;
  outro.style.display = oo>0?'flex':'none'; outro.style.opacity = oo;
  if(oo>0){ const p=ease(Math.min(1,(t-OUTRO_START)/0.8)); const lg=outro.querySelector('.ologo'); if(lg) lg.style.transform=\`scale(\${0.86+0.14*p})\`; }
};
</script>
</body></html>`;
}

async function run() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  const framesDir = mkdtempSync(join(tmpdir(), "sing-preview-"));
  let browser;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const executablePath = findChrome();
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });

    console.log("Capturing scene assets…");
    const layers = [];
    for (let i = 0; i < SCENES.length; i++) {
      const { base, focuses } = await captureScene(browser, SCENES[i], PORT);
      layers.push(sceneLayer(SCENES[i], base.toString("base64"), focuses, i));
      console.log(`  ✓ ${SCENES[i].name} (${focuses.length} cards)`);
    }

    const page = await browser.newPage({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1 });
    await page.setContent(pageHtml(layers.join("\n")), { waitUntil: "networkidle" });
    await sleep(300);

    console.log(`Rendering ${TOTAL_FRAMES} frames (${(END).toFixed(1)}s @ ${FPS}fps)…`);
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const t = f / FPS;
      await page.evaluate((tt) => window.__render(tt), t);
      await page.screenshot({ path: join(framesDir, `f_${String(f).padStart(4, "0")}.png`) });
      if (f % 60 === 0) console.log(`  frame ${f}/${TOTAL_FRAMES}`);
    }
    await page.close();

    console.log("Encoding H.264…");
    mkdirSync("appstore", { recursive: true });
    const args = [
      "-y", "-framerate", String(FPS), "-i", join(framesDir, "f_%04d.png"),
      "-f", "lavfi", "-t", String(END), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", OUT,
    ];
    execSync(`${FFMPEG} ${args.map((a) => `'${a}'`).join(" ")}`, { stdio: "inherit" });
    console.log(`\n✓ ${OUT}  (${(END).toFixed(1)}s, ${V.w}×${V.h})`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    rmSync(framesDir, { recursive: true, force: true });
  }
}

run();
