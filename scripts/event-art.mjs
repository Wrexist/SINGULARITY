// In-App Event media from the REAL game: the 3D lab (explore view, UI hidden) rendered
// at Apple's exact sizes — event card 1920×1080 (16:9) and event details page 1080×1920
// (9:16) — saved as JPEG (Apple rejects images with an alpha channel). No borders or
// gradients are added: the App Store applies its own.
//
// Needs a production build served locally (npx vite build && npx vite preview --port N)
// and a seed save to render. Usage:
//   SEED=path/to/save.json PORT=4330 NAME=sponsor node scripts/event-art.mjs
// Output → appstore/in-app-events/art/<NAME>-card.jpg and <NAME>-details.jpg
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

/** The bundled Chromium (as scripts/store-screenshots.mjs finds it; that module runs its
 *  pipeline on import, so the lookup is repeated here). */
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of ["/opt/pw-browsers", "/root/.cache/ms-playwright"]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const c = join(root, dir, "chrome-linux", "chrome");
      if (existsSync(c)) return c;
    }
  }
  return undefined;
}

const SEED = process.env.SEED;
const PORT = Number(process.env.PORT || 4330);
const NAME = process.env.NAME || "event";
const ZOOM = Number(process.env.ZOOM || 3);
if (!SEED) {
  console.error("event-art: set SEED=<save.json>");
  process.exit(1);
}
const OUT = "appstore/in-app-events/art";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const save = readFileSync(SEED, "utf8");
const problems = [];

for (const [kind, width, height] of [["card", 1920, 1080], ["details", 1080, 1920]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ save, now }) => {
    localStorage.setItem("singularity.save.v1", save);
    localStorage.setItem("singularity.lastSeen.v1", String(now));
    localStorage.setItem("singularity.settings.v1", JSON.stringify({ onboarded: true, shipExplained: true, sound: false, music: false, lab3d: true }));
    localStorage.setItem("singularity.paywall.v1", JSON.stringify({ launchShown: true, shipArmed: true, shipShown: true, lastAutoAt: 0 }));
    localStorage.setItem("singularity.hall3dHint.v1", "1");
  }, { save, now: Date.now() });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${kind}: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await sleep(1500);
  for (let i = 0; i < 6; i++) {
    const b = page.locator('.world-choice, button:has-text("Got it"), button:has-text("Continue"), button:has-text("Nice"), button:has-text("Close")').first();
    if (await b.count()) { await b.click({ timeout: 1500 }).catch(() => {}); await sleep(400); } else break;
  }
  await page.locator(".hall3d-expand").click();
  await sleep(2500);
  // The world only: hide every overlay the explore view draws on top of it.
  await page.addStyleTag({ content: ".hall3d-hud,.hall3d-close,.hall3d-labels,.hall3d-anchor,.hall3d-hint,.rack-card,.toast,.toasts{display:none!important}" });
  // Close enough that the floor lettering (the overview's labels) has faded out. Portrait
  // aims a little higher, leaving the lower part calmer for the text the App Store lays
  // over a details page.
  const portrait = height > width;
  await page.mouse.move(width * 0.5, height * (portrait ? 0.46 : 0.55));
  for (let i = 0; i < ZOOM; i++) { await page.mouse.wheel(0, -200); await sleep(120); }
  await sleep(2200);
  await page.screenshot({ path: `${OUT}/${NAME}-${kind}.jpg`, type: "jpeg", quality: 92 });
  console.log(`event-art: ${OUT}/${NAME}-${kind}.jpg (${width}×${height})`);
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error("event-art: page errors:\n" + problems.join("\n"));
  process.exit(1);
}
