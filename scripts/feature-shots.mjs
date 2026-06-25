// Feature screenshots — captures the Phase 3 product-business surfaces so the
// owner can see every new feature. Seeds a rich late-game save, then shoots the
// Products tab, a product detail screen (team assignment + feature tree), and the
// Employees tab (teams + office perks).
//
//   node scripts/feature-shots.mjs
import { spawn, execSync } from "node:child_process";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
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

// A rich save (v7) showing every new system at once.
const SEED = {
  version: 7,
  resources: { compute: "5e8", data: "5e7", money: "5e7" },
  upgrades: {
    rack_basic: 40, rack_server: 20, rack_tpu: 10, overclock: 5, data_pipeline: 5, monetize: 5, auto_claim: 1, auto_train: 1,
    perk_snacks: 1, perk_remote: 1,
  },
  employees: [
    { id: "emp-1", name: "Ada Lovelace", roleId: "staff_ml", level: 3, trait: "tenx", assignedProductId: "prod-1", training: null },
    { id: "emp-2", name: "Grace Hopper", roleId: "staff_sre", level: 2, trait: "steady", assignedProductId: "prod-1", training: null },
    { id: "emp-3", name: "Linus Torvalds", roleId: "staff_growth", level: 1, trait: "workaholic", assignedProductId: "prod-2", training: { remainingSec: 48, totalSec: 120 } },
    { id: "emp-4", name: "Fei-Fei Chen", roleId: "staff_sales", level: 2, trait: "prima_donna", assignedProductId: null, training: null },
    { id: "emp-5", name: "Dennis Ritchie", roleId: "staff_engineer", level: 2, trait: "frugal", assignedProductId: null, training: null },
    { id: "emp-6", name: "Noor Haddad", roleId: "staff_pr", level: 1, trait: "mentor", assignedProductId: null, training: null },
  ],
  research: ["backprop", "curated_data", "distributed", "distillation", "inference_api"],
  run: { active: true, progress: 0.5, readyToClaim: false },
  prestige: { legacyWeights: "5", ships: 4 },
  lifetimeMoney: "1e9",
  heat: 20,
  modifiers: [],
  alignment: 0,
  computeFocus: 0.7,
  products: {
    frontier: 18,
    sold: 2,
    milestones: ["first_launch", "users_100k", "mrr_1k", "version_5"],
    drafts: [{ id: "draft-4", quality: 16, ships: 4 }],
    assignments: { "prod-1": { staff_growth: 2, staff_ml: 1 } },
    active: [
      { id: "prod-1", name: "Cortex", type: "code", version: 7, quality: 15, priceMult: 1.2, marketingPerSec: 20000, channelMix: { ads: 0.5, influencer: 0.5 }, enterprise: true, enterprisePrice: 1.5, mau: 1200000, paid: 95000, buzzSec: 0, upgrade: { targetVersion: 8, remainingCompute: 200000, remainingData: 20000, remainingSec: 40, totalSec: 90 }, features: ["cdn", "sso", "support"] },
      { id: "prod-2", name: "Lumen", type: "multimodal", version: 4, quality: 12, priceMult: 1.0, marketingPerSec: 12000, mau: 600000, paid: 28000, buzzSec: 0, upgrade: null, features: ["mobile", "onboarding"] },
      { id: "prod-3", name: "Nimbus", type: "general", version: 3, quality: 9, priceMult: 0.8, marketingPerSec: 6000, mau: 2500000, paid: 40000, buzzSec: 0, upgrade: null, features: [] },
    ],
  },
};

const port = 4318;
mkdirSync("screenshots", { recursive: true });
console.log("Building production bundle...");
execSync("npm run build", { stdio: "inherit" });
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore" });

let browser;
try {
  await sleep(1500);
  const executablePath = findChrome();
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(
    ([save]) => {
      localStorage.setItem("singularity.settings.v1", JSON.stringify({ sound: false, haptics: false, reducedMotion: true, onboarded: true }));
      localStorage.setItem("singularity.save.v1", save);
      localStorage.setItem("singularity.lastSeen.v1", String(Date.now()));
    },
    [JSON.stringify(SEED)],
  );
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
  await sleep(900);
  const collect = page.getByRole("button", { name: "Collect" });
  if (await collect.isVisible().catch(() => false)) await collect.click().catch(() => {});

  // 1) Products tab — portfolio (drafts + cards + milestones).
  await page.getByRole("tab", { name: "Products" }).click();
  await sleep(500);
  await page.screenshot({ path: "screenshots/feat-products.png", fullPage: true });
  console.log("Saved feat-products.png");

  // 2) Product detail — open Cortex (research in progress, team + features).
  await page.getByText("details ▸").first().click();
  await sleep(500);
  const modal = page.locator(".pd-modal");
  await modal.screenshot({ path: "screenshots/feat-detail-top.png" });
  // Each sub-tab is its own focused pane now — capture Marketing + Upgrades.
  await page.getByRole("tab", { name: "Marketing" }).click();
  await sleep(300);
  await modal.screenshot({ path: "screenshots/feat-detail-marketing.png" });
  await page.getByRole("tab", { name: "Upgrades" }).click();
  await sleep(300);
  await modal.screenshot({ path: "screenshots/feat-detail-features.png" });
  console.log("Saved feat-detail-top/marketing/features.png");
  // Close modal.
  await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.click(8, 8).catch(() => {});
  await sleep(300);

  // 3) Employees tab — clean Team view (compact board + collapsed Lab roster).
  await page.getByRole("tab", { name: "Employees" }).click();
  await sleep(500);
  await page.screenshot({ path: "screenshots/feat-employees.png", fullPage: true });
  console.log("Saved feat-employees.png");

  // 4) Hire sub-tab — candidate picker.
  await page.getByRole("tab", { name: "Hire" }).click();
  await sleep(300);
  await page.getByRole("button", { name: /Recruit talent/ }).click();
  await sleep(400);
  await page.screenshot({ path: "screenshots/feat-recruit.png", fullPage: true });
  console.log("Saved feat-recruit.png");

  // 5) Achievements modal (Phase 3).
  await page.mouse.click(8, 8).catch(() => {});
  await sleep(200);
  await page.getByRole("button", { name: "Achievements" }).click();
  await sleep(400);
  const achModal = page.locator(".ach-modal");
  await achModal.screenshot({ path: "screenshots/feat-achievements.png" });
  console.log("Saved feat-achievements.png");
} finally {
  if (browser) await browser.close();
  server.kill();
}
