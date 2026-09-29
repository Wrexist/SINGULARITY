/**
 * Trailer capture: records every shot from the REAL built game (Dark appearance),
 * frame-accurately. Playwright's fake clock drives Date, timers, performance.now and
 * requestAnimationFrame, and the capture advances it exactly 1/30 s per frame, so the
 * hall's motion is smooth no matter how long each screenshot takes.
 *
 *   node scripts/trailer/capture.mjs <seedDir> <outDir> [shotName...]
 *
 * Two shot kinds:
 *  - "stage": the hall canvas alone, full frame at 1920x1080 (960x540 CSS at 2x). The
 *    game caps its canvas at 2x DPR, so the stage enlarges the hall's box instead —
 *    still the game's own renderer, just given the whole screen.
 *  - "phone": the full app at an iPhone Pro Max viewport (430x932 CSS at 2x).
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const [, , SEEDS, OUT, ...ONLY] = process.argv;
const PORT = 4731;
const FPS = 30;
const CHROME = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;

// Ambient interruptions (world-event cards, the daily bar, toasts) would cover a
// shot's subject, so they are hidden for the capture.
const QUIET = ".modal-backdrop:has(.world-modal){display:none!important}.daily-bar{display:none!important}.toast-stack{display:none!important}";

const SHOTS = [
  { name: "hall_closet", kind: "stage", seed: "closet", frames: 170 },
  { name: "hall_garage", kind: "stage", seed: "garage", frames: 60 },
  { name: "hall_floor", kind: "stage", seed: "floor", frames: 60 },
  { name: "hall_hall", kind: "stage", seed: "hall", frames: 60 },
  { name: "hall_campus", kind: "stage", seed: "campus", frames: 300 },
  { name: "ui_build", kind: "phone", seed: "showcase", frames: 90 },
  { name: "ui_research", kind: "phone", seed: "showcase", frames: 90, nav: "research" },
  { name: "ui_products", kind: "phone", seed: "showcase", frames: 90, nav: "products" },
  { name: "ui_team", kind: "phone", seed: "showcase", frames: 90, nav: "team" },
  { name: "ui_charter", kind: "phone", seed: "newgen", frames: 90, nav: "charter" },
  { name: "ui_bazaar", kind: "phone", seed: "showcase", frames: 90, nav: "bazaar" },
  { name: "ui_ship", kind: "phone", seed: "shipready", frames: 150, nav: "ship" },
];

async function waitForServer(url) {
  for (let i = 0; i < 80; i++) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error("preview server did not start");
}

async function openShot(browser, shot) {
  const stage = shot.kind === "stage";
  const ctx = await browser.newContext({
    viewport: stage ? { width: 960, height: 540 } : { width: 430, height: 932 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.clock.install({ time: new Date("2026-09-27T12:00:00Z") });
  const save = readFileSync(join(SEEDS, `${shot.seed}.json`), "utf8");
  await page.addInitScript(([save, quiet]) => {
    localStorage.setItem("singularity.settings.v1", JSON.stringify({
      sound: false, music: false, haptics: false, reducedMotion: false, onboarded: true, shipExplained: true, appearance: "dark",
    }));
    localStorage.setItem("singularity.save.v1", save);
    localStorage.setItem("singularity.lastSeen.v1", String(Date.now()));
    localStorage.setItem("singularity.paywall.v1", JSON.stringify({ launchShown: true, shipArmed: true, shipShown: true, lastAutoAt: 0 }));
    const st = document.createElement("style");
    st.textContent = quiet;
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(st));
  }, [save, QUIET]);
  await page.goto(`http://localhost:${PORT}/`);
  // install() alone keeps time flowing in real time between calls; pause it so the
  // game only advances when the capture steps it (exactly one frame per screenshot).
  await page.clock.pauseAt(new Date("2026-09-27T12:00:01Z"));
  await page.clock.runFor(1500);

  const section = async (label) => {
    await page.locator(".labnav button", { hasText: label }).first().click().catch(() => {});
    await page.clock.runFor(500);
  };
  const tab = async (label) => {
    await page.locator("nav.botnav button", { hasText: label }).first().click().catch(() => {});
    await page.clock.runFor(600);
  };
  const scrollTo = async (text, offset = -120) => {
    await page.evaluate(([text, offset]) => {
      // The element that holds the text itself (a title may also hold a badge).
      const el = [...document.querySelectorAll("body *")].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().startsWith(text)));
      if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top + offset);
    }, [text, offset]);
    await page.clock.runFor(400);
  };

  if (stage) {
    await page.evaluate(() => {
      const st = document.createElement("style");
      st.textContent = `*{visibility:hidden!important}.hall,.hall *{visibility:visible!important}
        html,body{background:#05060c!important;overflow:hidden!important}
        .hall{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483000!important;border-radius:0!important;margin:0!important;border:0!important;box-shadow:none!important}
        .hall-wings,.hall-wings-hit{display:none!important}
        .hall-tag{transform:scale(1.2);transform-origin:top left;left:30px!important;top:26px!important}`;
      document.head.appendChild(st);
      // A transformed/filtered ancestor would trap the fixed stage inside its box.
      for (let el = document.querySelector(".hall")?.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        el.style.transform = "none"; el.style.filter = "none"; el.style.contain = "none";
        el.style.willChange = "auto"; el.style.animation = "none"; el.style.backdropFilter = "none";
      }
    });
    await page.clock.runFor(600);
  } else if (shot.nav === "research") {
    await section("Research");
  } else if (shot.nav === "products") {
    await tab("Products");
  } else if (shot.nav === "team") {
    await tab("Team");
  } else if (shot.nav === "charter") {
    await scrollTo("Lab Charter", -170);
  } else if (shot.nav === "bazaar") {
    await section("Research");
    await scrollTo("The Data Bazaar", -150);
  } else if (shot.nav === "ship") {
    await section("HQ");
    const open = page.getByRole("button", { name: /choose how/i }).first();
    await open.scrollIntoViewIfNeeded().catch(() => {});
    await open.click().catch(() => {});
    await page.clock.runFor(500);
    await page.locator(".ship-mode").first().click().catch(() => {});
    await page.clock.runFor(120);
  }
  return { page, ctx, errors };
}

async function run() {
  const server = spawn(join(process.cwd(), "node_modules/.bin/vite"), ["preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ["--no-sandbox"] });
  let failed = false;
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    for (const shot of SHOTS) {
      if (ONLY.length && !ONLY.includes(shot.name)) continue;
      const dir = join(OUT, shot.name);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const { page, ctx, errors } = await openShot(browser, shot);
      const t0 = Date.now();
      for (let f = 0; f < shot.frames; f++) {
        await page.clock.runFor(1000 / FPS);
        await page.screenshot({ path: join(dir, `${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 94 });
      }
      console.log(`${shot.name}: ${shot.frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s, console errors: ${errors.length}`);
      if (errors.length) { failed = true; console.log("  " + errors.slice(0, 3).join("\n  ")); }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
  if (failed) process.exitCode = 1;
}

run();
