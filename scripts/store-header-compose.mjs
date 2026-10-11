// Composes the App Store header (21:9, 3840×1646) and search-results visual
// (3:2, 3840×2560) from the real-app captures in appstore/creative/src. Kept separate
// from the capture step so the layout can be iterated without rebuilding the app:
//
//   node scripts/store-header-assets.mjs compose
//
// Layout rules (Apple crops and overlays both slots):
// - Header: everything that matters sits inside Apple's centred art-safe box
//   (x 1097–2743, y 493–1154 of 3840×1646). The flanks are quiet background only, so
//   any crop on iPhone / iPad / Mac keeps the headline and the phones.
// - Search: a ≥6% clear margin on every edge; the App Store draws its own name row.
// - Copy: one short benefit headline + the app name. No prices, no "AI" buzzwords.
// - Output is PNG with the alpha channel stripped (App Store Connect rejects alpha).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { PNG } = require("playwright-core/lib/utilsBundle");

const OUT = "appstore/creative";
const SRC = `${OUT}/src`;
const uri = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;

const COPY = {
  A: "From one GPU to a planet-sized lab.",
  B: "Your lab keeps earning while you sleep.",
};

const FONT = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Inter, Roboto, sans-serif`;

// Modern iPhone (Pro) frame around a real 402×874-pt screen capture. `w` = outer width px.
function phone(src, w, extra = "") {
  const r = w * 0.155, bezel = w * 0.028, isl = w * 0.27;
  return `<div class="phone" style="width:${w}px;height:${w * 2.12}px;border-radius:${r}px;padding:${bezel}px;${extra}">
    <div class="screen" style="border-radius:${r - bezel}px;--sb:${w * 0.135}px;background-image:url(${src})">
      <div class="status" style="height:var(--sb);font-size:${w * 0.042}px;padding:0 ${w * 0.085}px">
        <span>9:41</span><span class="sbi"><i class="sig"></i><i class="bat"></i></span></div>
      <div class="island" style="width:${isl}px;height:${isl * 0.29}px;top:${w * 0.03}px"></div>
    </div></div>`;
}

const brand = (size) => `<div class="brand" style="font-size:${size}px">
  <img src="${uri("appstore/AppIcon-1024.png")}" style="width:${size * 1.9}px;height:${size * 1.9}px;border-radius:${size * 0.45}px">
  <span>Singularity Inc.</span></div>`;

const BASE_CSS = `
  *{box-sizing:border-box;margin:0}
  html,body{width:100%;height:100%;overflow:hidden}
  body{font-family:${FONT};color:#141a33;position:relative;
    background:
      radial-gradient(60% 70% at 50% 62%, #ffffff 0%, rgba(255,255,255,0) 70%),
      radial-gradient(40% 50% at 18% 30%, rgba(99,102,241,.18), rgba(99,102,241,0) 70%),
      radial-gradient(40% 50% at 84% 72%, rgba(34,197,94,.14), rgba(34,197,94,0) 70%),
      radial-gradient(35% 45% at 80% 18%, rgba(168,85,247,.14), rgba(168,85,247,0) 70%),
      linear-gradient(160deg,#eef1f8 0%,#e7ebf7 55%,#eef1f8 100%);}
  .grid{position:absolute;inset:0;opacity:.55;
    background-image:linear-gradient(rgba(79,70,229,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(79,70,229,.06) 1px,transparent 1px);
    background-size:96px 96px;mask-image:radial-gradient(60% 60% at 50% 55%,#000 30%,transparent 80%)}
  .phone{position:absolute;background:linear-gradient(145deg,#3a3f4b,#16181d 40%,#2b2f38);
    box-shadow:0 0 0 2px #5b606b inset,0 60px 120px rgba(30,27,75,.28),0 18px 40px rgba(30,27,75,.20)}
  .screen{position:relative;width:100%;height:100%;overflow:hidden;background-size:100% auto;background-position:center var(--sb);background-repeat:no-repeat;background-color:#eef1f8}
  .status{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;font-weight:600;color:#141a33;background:#eef1f8}
  .sbi{display:inline-flex;gap:.35em;align-items:center}
  .sig{display:inline-block;width:1.05em;height:.7em;background:#141a33;clip-path:polygon(0 100%,100% 0,100% 100%)}
  .bat{display:inline-block;width:1.45em;height:.68em;border:.09em solid #141a33;border-radius:.2em;padding:.08em;background:linear-gradient(90deg,#141a33 0 80%,transparent 80%) content-box}
  .island{position:absolute;left:50%;transform:translateX(-50%);background:#0b0c0f;border-radius:999px}
  .brand{display:inline-flex;align-items:center;gap:.55em;font-weight:700;letter-spacing:-.01em;color:#2b3150}
  .brand img{box-shadow:0 6px 18px rgba(30,27,75,.25)}
  h1{font-weight:800;letter-spacing:-.025em;line-height:1.04;color:#141a33}
  h1 em{font-style:normal;background:linear-gradient(90deg,#4f46e5,#7c3aed 55%,#16a34a);-webkit-background-clip:text;background-clip:text;color:transparent}
`;

const accent = (t) => t.replace(/(planet-sized lab|while you sleep)/, "<em>$1</em>");

// ---- Header 3840×1646 ----------------------------------------------------------
// Safe box: x 1097–2743 (w 1646), y 493–1154 (h 661). Copy on the left half of the box,
// a fan of three phones on the right half; phones bleed downward past the box (that
// part only shows on wide displays, and it's just more of the real screen).
function headerHTML(variant) {
  const lab = uri(`${SRC}/screen-lab.png`), team = uri(`${SRC}/screen-team.png`), prod = uri(`${SRC}/screen-products.png`);
  const phones = variant === "A"
    ? phone(prod, 330, "left:2010px;top:600px;transform:rotate(-7deg);z-index:1") +
      phone(team, 330, "left:2420px;top:600px;transform:rotate(7deg);z-index:1") +
      phone(lab, 380, "left:2190px;top:480px;z-index:2")
    : phone(lab, 380, "left:2180px;top:480px;z-index:2") +
      `<img class="card" src="${uri(`${SRC}/card-team.png`)}" style="left:1990px;top:880px;width:400px;transform:rotate(-4deg)">` +
      `<img class="card" src="${uri(`${SRC}/card-product.png`)}" style="left:2470px;top:560px;width:400px;transform:rotate(4deg)">`;
  return `<!doctype html><html><head><style>${BASE_CSS}
    .card{position:absolute;z-index:3;border-radius:28px;box-shadow:0 30px 70px rgba(30,27,75,.25)}
    .copy{position:absolute;left:1130px;top:560px;width:820px}
    .copy h1{font-size:104px;margin-top:34px}
  </style></head><body><div class="grid"></div>
    <div class="copy">${brand(40)}<h1>${accent(COPY[variant])}</h1></div>
    ${phones}
  </body></html>`;
}

// ---- Search results 3840×2560 --------------------------------------------------
// Headline + name across the top third, phones below; 240px+ clear margin all round.
function searchHTML(variant) {
  const lab = uri(`${SRC}/screen-lab.png`), team = uri(`${SRC}/screen-team.png`), prod = uri(`${SRC}/screen-products.png`);
  const phones = variant === "A"
    ? phone(prod, 600, "left:960px;top:1060px;transform:rotate(-8deg);z-index:1") +
      phone(team, 600, "left:2280px;top:1060px;transform:rotate(8deg);z-index:1") +
      phone(lab, 690, "left:1575px;top:880px;z-index:2")
    : phone(lab, 700, "left:1570px;top:880px;z-index:2") +
      `<img class="card" src="${uri(`${SRC}/card-team.png`)}" style="left:700px;top:1360px;width:860px;transform:rotate(-4deg)">` +
      `<img class="card" src="${uri(`${SRC}/card-product.png`)}" style="left:2280px;top:1120px;width:860px;transform:rotate(4deg)">`;
  return `<!doctype html><html><head><style>${BASE_CSS}
    .card{position:absolute;z-index:3;border-radius:48px;box-shadow:0 40px 100px rgba(30,27,75,.25)}
    .copy{position:absolute;left:0;right:0;top:250px;text-align:center}
    .copy h1{font-size:176px;margin-top:44px}
    /* the phones bleed off the bottom on purpose; keep their lower edge soft */
    .fade{position:absolute;left:0;right:0;bottom:0;height:420px;z-index:5;background:linear-gradient(rgba(238,241,248,0),#eef1f8 85%)}
  </style></head><body><div class="grid"></div>
    <div class="copy">${brand(62)}<h1>${accent(COPY[variant])}</h1></div>
    ${phones}<div class="fade"></div>
  </body></html>`;
}

function stripAlpha(buf) {
  const png = PNG.sync.read(buf);
  return PNG.sync.write(png, { colorType: 2, inputHasAlpha: true });
}

export async function compose() {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const jobs = [
      ["header", 3840, 1646, headerHTML],
      ["search", 3840, 2560, searchHTML],
    ];
    for (const [name, w, h, html] of jobs) {
      for (const v of ["A", "B"]) {
        await page.setViewportSize({ width: w, height: h });
        await page.setContent(html(v), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const file = `${OUT}/${name}-${w}x${h}-${v}.png`;
        writeFileSync(file, stripAlpha(await page.screenshot()));
        console.log(`  ${file}`);
      }
    }
  } finally {
    await browser.close();
  }
}
