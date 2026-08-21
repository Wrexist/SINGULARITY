import { roleDef } from "./employees";

/**
 * Flavor copy for the high-frequency transactional notices/toasts — the beats a
 * player sees dozens of times per session (a model version ships, a fresh model
 * is ready to commercialise, a version enters research, a product is sold, a hire
 * joins, someone is let go). Each of these was a single frozen template; giving
 * them small pools stops the moment-to-moment text from repeating.
 *
 * Pure + deterministic: a stable seed (usually name + a number) picks the line, so
 * a given event always reads the same way, but the session as a whole varies — no
 * clock, no RNG, unit-testable. Engine-side (no store/UI imports) so both the
 * store's notice queue and App's toast handlers can share it.
 */

/** FNV-1a — a tiny stable string hash (no Math.random, no clock). */
const hashStr = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const pick = <T>(pool: readonly T[], seed: string): T => pool[hashStr(seed) % pool.length]!;

// ---- A model version ships (store.ts notice; every version bump) ----
const VERSION_SHIP_TAILS = [
  "back at the frontier",
  "the changelog is one line and a shrug",
  "now with 12% more state-of-the-art",
  "the benchmarks blinked first",
  "rivals quietly update their comparison charts",
  "the release notes lie beautifully",
  "briefly the best model you own",
  "the demo worked, this time",
  "ships with confidence and one known issue",
  "the eval numbers went up and to the right",
];
export function versionShipNote(name: string, version: number): string {
  return `${name} v${version} shipped — ${pick(VERSION_SHIP_TAILS, `${name}#${version}`)}`;
}

// ---- A fresh model is waiting to be commercialised (App.tsx; every ship) ----
const MODEL_READY = [
  "Your shipped model is ready — commercialise it free in Products.",
  "Fresh weights in hand — turn the model into a product in Products.",
  "The model's done; spin it into a product over in Products.",
  "You've got a raw model to sell — launch it from the Products tab.",
  "Model ready to monetise — make it a product in Products.",
  "The flagship is trained. Commercialise it free in the Products tab.",
  "Weights banked — the free draft is sitting in Products.",
  "That checkpoint wants a product page. Products tab, free launch.",
  "The run left you a deployable draft — Products has it queued.",
  "One trained model, zero price tag: commercialise it in Products.",
];
export function modelReadyNote(shipCount: number): string {
  return pick(MODEL_READY, `ready${shipCount}`);
}

// ---- A version enters research (App.tsx; every upgrade start) ----
export function researchStartNote(name: string, nextVersion: number): string {
  const tails = [
    `researching v${nextVersion}…`,
    `training v${nextVersion} — the GPUs are warming up`,
    `v${nextVersion} is in the oven`,
    `chasing v${nextVersion}; checkpoints incoming`,
    `v${nextVersion} enters the lab`,
    `v${nextVersion} begins — the eval suite stretches, nervously`,
    `cooking v${nextVersion} on the good racks`,
    `v${nextVersion}: now with ambition`,
    `the loss curve and you, together again — v${nextVersion}`,
    `v${nextVersion} queued; the data pipeline sighs`,
  ];
  return `${name} — ${pick(tails, `${name}~${nextVersion}`)}`;
}

// ---- A product is retired/sold (App.tsx; every retire) ----
const SOLD_TAILS = [
  "the acqui-hire rumours were greatly exaggerated",
  "wound down with dignity",
  "someone will fork it by morning",
  "the users have been 'migrated'",
  "sunset with a tasteful blog post",
  "the servers spin down at midnight",
  "added to the graveyard slide, fondly",
  "its Discord already misses it",
  "remembered in a retrospective nobody reads",
  "the postmortem is one slide: 'growth'",
];
export function soldNote(name: string, moneyStr: string): string {
  return `Sold ${name} for ${moneyStr} — ${pick(SOLD_TAILS, `sold:${name}`)}`;
}

// ---- A specialist is hired (App.tsx; every hire — was silent) ----
const HIRE_TAILS = [
  "signs the offer and asks about the coffee",
  "joins; #announcements briefly rejoices",
  "starts Monday, badge photo already regrettable",
  "is onboarded; the laptop arrives eventually",
  "joins the lab and immediately has opinions",
  "accepts, negotiates one extra monitor, wins",
  "cites your blog post in the interview; gets the job",
  "brings a mechanical keyboard. Everyone hears it.",
  "requests 'compute budget' in the first sentence",
  "already redecorating the team channel emoji",
];
export function hireWelcome(name: string, roleId: string): string {
  const role = roleDef(roleId)?.name ?? "specialist";
  return `${name} joins as ${role} — ${pick(HIRE_TAILS, `hire:${name}:${roleId}`)}`;
}

// ---- A specialist is let go (App.tsx; every fire — was silent) ----
const FIRE_TAILS = [
  "off 'pursuing other opportunities', effective immediately",
  "leaving to 'spend time with family' (a startup)",
  "the farewell doc already has 200 heart reactions",
  "garden leave starts now; the tan starts later",
  "exit interview scheduled, then quietly cancelled",
  "the desk plant stays; it has seniority",
  "their commit streak ends at 214 days",
  "LinkedIn updates to 'open to work' within the hour",
  "takes the good whiteboard markers, symbolically",
  "the offboarding doc is one line: 'see you at their launch'",
];
export function fireSendoff(name: string, roleId: string): string {
  const role = roleDef(roleId)?.name ?? "specialist";
  return `${name} (${role}) let go — ${pick(FIRE_TAILS, `fire:${name}:${roleId}`)}`;
}
