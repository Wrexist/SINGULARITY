// App Store "Header and Search Results" creative — the product-page header (21:9,
// 3840×1646) and the search-results visual (3:2, 3840×2560). Unlike the older
// wordless art in store-creative-assets.mjs, these show the REAL app: three light-mode
// screens captured from a seeded late-game save at iPhone @3x, set in a modern
// iPhone frame, with one short benefit headline and the app name. Each slot gets an
// A and B variant for Product Page Optimization.
//
//   node scripts/store-header-assets.mjs          # build + capture + compose
//   node scripts/store-header-assets.mjs compose  # re-compose from saved captures
//
// Output → appstore/creative/ (PNG, no alpha). Captures → appstore/creative/src/.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const OUT = "appstore/creative";
const SRC = `${OUT}/src`;
mkdirSync(SRC, { recursive: true });

// A rich, aspirational late-game lab: full hall, a team with real names, live products.
export const SEED = {
  version: 7,
  resources: { compute: "4.8e8", data: "6.2e7", money: "3.9e7" },
  upgrades: {
    rack_basic: 50, rack_server: 30, rack_tpu: 16, overclock: 8, data_pipeline: 8, monetize: 8,
    auto_claim: 1, auto_train: 1, expand_e: 4, expand_s: 4, // maxed: no "+$cost" markers in the hall perk_snacks: 1, perk_remote: 1,
  },
  employees: [
    { id: "emp-1", name: "Ada Okafor", roleId: "staff_ml", level: 3, trait: "tenx", assignedProductId: "prod-1", training: null },
    { id: "emp-2", name: "Grace Lindqvist", roleId: "staff_sre", level: 2, trait: "steady", assignedProductId: "prod-1", training: null },
    { id: "emp-3", name: "Mateo Ruiz", roleId: "staff_growth", level: 2, trait: "workaholic", assignedProductId: "prod-2", training: null },
    { id: "emp-4", name: "Priya Raman", roleId: "staff_sales", level: 2, trait: "mentor", assignedProductId: "prod-2", training: null },
    { id: "emp-5", name: "Kenji Sato", roleId: "staff_engineer", level: 2, trait: "frugal", assignedProductId: "prod-1", training: null },
    { id: "emp-6", name: "Noor Haddad", roleId: "staff_pr", level: 1, trait: "steady", assignedProductId: null, training: null },
  ],
  research: ["backprop", "curated_data", "mixed_precision", "data_aug", "distributed", "rlhf", "caching", "distillation", "moe", "inference_api", "scaling_laws"],
  run: { active: true, progress: 0.62, readyToClaim: false },
  prestige: { legacyWeights: "240", ships: 6 },
  lifetimeMoney: "2.0e9",
  heat: 22,
  modifiers: [],
  alignment: 0,
  computeFocus: 0.7,
  products: {
    frontier: 18, sold: 2,
    milestones: ["first_launch", "users_100k", "mrr_1k", "version_5"],
    drafts: [],
    assignments: { "prod-1": { staff_growth: 1, staff_ml: 1 } },
    active: [
      { id: "prod-1", name: "Cortex", type: "code", version: 7, quality: 15, priceMult: 1.2, marketingPerSec: 20000, channelMix: { ads: 0.5, influencer: 0.5 }, enterprise: true, enterprisePrice: 1.5, mau: 1200000, paid: 95000, buzzSec: 0, upgrade: null, features: ["cdn", "sso", "support"] },
      { id: "prod-2", name: "Lumen", type: "multimodal", version: 4, quality: 12, priceMult: 1.3, marketingPerSec: 2500, mau: 640000, paid: 28000, buzzSec: 0, upgrade: null, features: ["mobile", "onboarding"] },
      { id: "prod-3", name: "Nimbus", type: "general", version: 3, quality: 9, priceMult: 1.2, marketingPerSec: 1200, mau: 2500000, paid: 40000, buzzSec: 0, upgrade: null, features: [] },
    ],
  },
};

// Hide anything transient or price-bearing so the art never shows a "$" cost tag,
// a toast, or a random event modal mid-capture.
export const HIDE_CSS = [
  ".modal-backdrop:has(.world-modal)", ".notice-slot", ".daily-bar", ".toast-stack", ".notice-stack",
].map((s) => `${s}{display:none!important}`).join("");

async function capture() {
  console.log("Building…");
  execSync("npm run build", { stdio: "inherit" });
  const server = await preview({ preview: { port: 4319, strictPort: true }, logLevel: "silent" });
  const url = "http://localhost:4319/";
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
  try {
    // iPhone 16 Pro logical size; @3x → 1206×2622 screens.
    const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, colorScheme: "light" });
    page.on("console", (m) => { if (m.type() === "error") console.warn("  console error:", m.text()); });
    await page.addInitScript(([save, css]) => {
      localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: false, music: false, haptics: false, reducedMotion: true, onboarded: true, shipExplained: true, appearance: "light" }));
      localStorage.setItem("singularity.paywall.v1", JSON.stringify({ launchShown: true, shipArmed: true, shipShown: true, lastAutoAt: 0 }));
      localStorage.setItem("singularity.save.v1", save);
      localStorage.setItem("singularity.lastSeen.v1", String(Date.now()));
      const apply = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
      if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
    }, [JSON.stringify(SEED), HIDE_CSS]);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("canvas.hall-canvas", { timeout: 15000 }).catch(() => {});
    await sleep(1200);
    const collect = page.getByRole("button", { name: "Collect" });
    if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});
    for (let d = 0; d < 4; d++) {
      if (!(await page.locator(".world-modal").count().catch(() => 0))) break;
      await page.locator(".world-choice, .world-modal .btn-primary, .world-modal .btn").first().click().catch(() => {});
      await sleep(250);
    }
    await sleep(600);
    await page.screenshot({ path: `${SRC}/screen-lab.png` });
    console.log("  screen-lab.png");

    await page.locator(".botnav-item", { hasText: "Team" }).click();
    await sleep(700);
    await page.screenshot({ path: `${SRC}/screen-team.png` });
    await page.locator(".emp-person").first().screenshot({ path: `${SRC}/card-team.png` });
    console.log("  screen-team.png, card-team.png");

    await page.locator(".botnav-item", { hasText: "Products" }).click();
    await sleep(700);
    await page.screenshot({ path: `${SRC}/screen-products.png` });
    await page.locator(".prod-card").first().screenshot({ path: `${SRC}/card-product.png` });
    console.log("  screen-products.png, card-product.png");
  } finally {
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  }
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv[2] !== "compose") await capture();
if (isMain && existsSync(`${SRC}/screen-lab.png`)) {
  const { compose } = await import("./store-header-compose.mjs");
  await compose();
}
