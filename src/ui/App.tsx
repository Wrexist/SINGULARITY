import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { useSettings } from "./settings";
import { themeAccent } from "./hallThemes";
import { dailyAvailable, markDailyClaimed } from "./daily";
import { ResourceBar } from "./ResourceBar";
import { TrainingDock } from "./TrainingDock";
import { UpgradePanel } from "./UpgradePanel";
import { ResearchPanel } from "./ResearchPanel";
import { PrestigePanel } from "./PrestigePanel";
import { OfflineModal } from "./OfflineModal";
import { Celebration, type ShipReport } from "./Celebration";
import { SettingsSheet } from "./SettingsSheet";
import { ToastStack, type ToastData } from "./Toast";
import { StatsPanel } from "./StatsPanel";
import { Tagline } from "./Tagline";
import { Onboarding } from "./Onboarding";
import { DataMarketPanel } from "./DataMarketPanel";
import { EmployeesPanel } from "./EmployeesPanel";
import { ProductsPanel } from "./ProductsPanel";
import { AchievementsModal } from "./AchievementsModal";
import { ContractsPanel } from "./ContractsPanel";
import { CharterPanel } from "./CharterPanel";
import { CodexPanel } from "./CodexPanel";
import { EventLog } from "./EventLog";
import { FxCanvas } from "./FxCanvas";
import { burst as fxBurst, floatText as fxFloat } from "./fx";
import { ProductLaunch } from "./ProductLaunch";
import { productsUnlocked, productMetrics, typeDef, retirePayout } from "../engine/products";
import { advisorItems, type AdvisorTab, type LabSection } from "../engine/advisor";
import { nextGoal } from "../engine/goals";
import { marketLeaderboard, playerMarketRank, rivalsBeaten } from "../engine/market";
import { FlaskIcon, BoxIcon, TeamIcon, TrophyIcon, GearIcon, GiftIcon, TargetIcon } from "./Icons";
import { fmt, fmtMoney } from "./format";
import type { ProductTypeId } from "../engine/balance/products";
import { iap } from "./iap";
import { balance } from "../engine/balance/config";
import { HallCanvas } from "./HallCanvas";
import { ExpandConfirm } from "./ExpandConfirm";
import { ConfirmSheet } from "./ConfirmSheet";
import { RigBayPanel } from "./RigBayPanel";
import { componentsUnlocked, earnedDefs } from "../engine/components";
import { EraTransition } from "./EraTransition";
import { WorldEventCard } from "./WorldEventCard";
import { ModifierBar } from "./ModifierBar";
import { regulatorIsNamed, regulatorState } from "../engine/regulator";
import { canPrestige } from "../engine/prestige";
import { currentEra } from "../engine/eras";
import { recordTelemetry } from "../state/telemetry";

export function App() {
  useGameLoop();
  const game = useGame((s) => s.game);
  const offline = useGame((s) => s.offline);
  const initialized = useGame((s) => s.initialized);
  const event = useGame((s) => s.event);
  const notice = useGame((s) => s.notice);
  const worldEvent = useGame((s) => s.worldEvent);
  const candidates = useGame((s) => s.candidates);
  const { doStartRun, doClaim, doBuyUpgrade, doBuyUpgradeBulk, doBuyOfficePerk, doBuyReputationPerk, doBuyLegacyPerk, doResearch, doBuyData, doPrestige, setComputeFocus,
    doRecruit, doRefreshCandidates, doCloseRecruit, doHireCandidate, doTrainEmployee, doAssignEmployeeToProduct, doFireEmployee,
    doLaunchDraft, doStartUpgrade, doSetProductPrice, doSetProductMarketing, doSetEnterprise, doSetEnterprisePrice, doSetChannelMix, doBuyFeature, doRenameProduct, doRetireProduct,
    doClaimContract, doSetCharter, doLobby, dismissOffline, dismissWorldEvent, chooseWorldEvent, doClaimDaily, hardReset,
    doBuyComponent, doEquipComponent, doFuseComponents, doLockCharter } =
    useGame.getState();

  const d = useMemo(() => derive(game), [game]);
  // The advisor list feeds three things from one scan (memoized per tick, same
  // cadence as derive — a handful of product checks, no clock): the per-tab nav
  // badges, the per-Lab-section badges, and the single "next action" nudge chip.
  // A waiting run-claim is counted in the BADGES only (not the chip — the big
  // bobbing Claim button is its own nudge): with the Lab sectioned, the button
  // can be off-screen on Research/HQ, and a claim must never be signal-less.
  const advisor = useMemo(() => advisorItems(game), [game]);
  const claimWaiting = game.run.readyToClaim;
  const attention = useMemo(() => {
    const counts: Record<AdvisorTab, number> = { lab: 0, products: 0, employees: 0 };
    for (const it of advisor) counts[it.tab] += 1;
    if (claimWaiting) counts.lab += 1;
    return counts;
  }, [advisor, claimWaiting]);
  const labAttention = useMemo(() => {
    const counts: Record<LabSection, number> = { build: 0, research: 0, hq: 0 };
    for (const it of advisor) if (it.tab === "lab" && it.section) counts[it.section] += 1;
    if (claimWaiting) counts.build += 1;
    return counts;
  }, [advisor, claimWaiting]);
  const nudge = advisor[0] ?? null;

  // Detect a ship (prestige) and fire the celebration moment + haptics.
  const prevShips = useRef(game.prestige.ships);
  const prevWeights = useRef<Big>(game.prestige.legacyWeights);
  const prevAscensions = useRef(game.stats.ascensions);
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big; report: ShipReport } | null>(null);
  const [eraMoment, setEraMoment] = useState<number | null>(null);
  const [launch, setLaunch] = useState<{ type: ProductTypeId; name: string } | null>(null);
  const [pendingExpansion, setPendingExpansion] = useState<string | null>(null);
  const [pendingRetire, setPendingRetire] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [flash, setFlash] = useState(0); // AGI ascension screen flash (key replays the anim)
  const [dailyOn, setDailyOn] = useState(() => dailyAvailable());
  // The "next goal" carrot: the era/contract/achievement closest to popping
  // (see engine/goals.ts). Only computed when the notice slot would actually
  // show it (slot priority is daily > nudge > goal) — no point scanning 50+
  // achievement metrics at 10Hz to produce a hidden result.
  const goal = useMemo(() => (dailyOn || nudge ? null : nextGoal(game)), [game, dailyOn, nudge]);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const hallTheme = useSettings((s) => s.hallTheme);
  const music = useSettings((s) => s.music);
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);
  const shipExplained = useSettings((s) => s.shipExplained);
  const markShipExplained = useSettings((s) => s.markShipExplained);
  const [showShipExplainer, setShowShipExplainer] = useState(false);

  // The moment queue's head: exactly ONE full-screen moment renders at a time,
  // by priority. Dismissing the head lets the next pending one show.
  const moment = offline ? "offline"
    : celebration ? "celebration"
    : eraMoment !== null ? "era"
    : launch ? "launch"
    : worldEvent ? "world"
    : null;

  // Ambient music bed — follow the Music setting; pause while the tab is hidden
  // (battery). Starts on the first user gesture if audio isn't unlocked yet.
  useEffect(() => {
    const apply = () => sound.setMusic(music && !document.hidden);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [music]);

  // Re-validate the premium entitlement against StoreKit at launch (native only;
  // no-op on web). Keeps the localStorage cache from being the source of truth.
  useEffect(() => { void iap.refresh(); }, []);

  // The daily boost was only checked at mount, so a session left open across the
  // day rollover never saw the bar reappear. Re-check on a slow tick and whenever
  // the app returns to the foreground (the common idle-game resume path).
  useEffect(() => {
    const check = () => setDailyOn((on) => on || dailyAvailable());
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);

  // Hall theme drives an app-wide accent (--accent) so picking a theme visibly
  // recolours the chrome (nav, selection rings, accent surfaces) — not just the
  // hall tint. Set on the document root so portals (modals/toasts) inherit it too.
  // Cosmetic only; semantic resource colours (compute/data/money) never change.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", themeAccent(hallTheme));
    return () => { root.style.removeProperty("--accent"); };
  }, [hallTheme]);

  // Progressive disclosure (reveal depth in waves — GDD): Research appears after
  // your first payout (you need Data to research); Prestige once you're on the path.
  const showResearch = game.resources.data.gt(0) || game.research.length > 0;
  const showPrestige = game.research.length > 0;
  const showMarket = game.research.length > 0;
  const showStaff = balance.staff.enabled && game.research.length >= balance.staff.revealAtResearch;
  const showProducts = productsUnlocked(game);
  const [tab, setTab] = useState<"lab" | "products" | "employees">("lab");
  // The Lab's sub-sections (Build / Research / HQ) — the anti-noise structure.
  // Before Research unlocks there's nothing to section, so the switcher stays
  // hidden and the Lab renders the Build core alone (reveal depth in waves, GDD).
  const [labSection, setLabSection] = useState<LabSection>("build");
  const labSectioned = showResearch;
  const section: LabSection = labSectioned ? labSection : "build";
  const goSection = useCallback((next: LabSection) => {
    setLabSection((cur) => {
      // Land at the top of the new section — mid-scroll positions from the old
      // section are meaningless in the new one.
      if (cur !== next) window.scrollTo(0, 0);
      return next;
    });
  }, []);
  // Telemetry (R8.1): count a tab switch when the player navigates to a *different*
  // tab. On-device only; no-op when opted out (see src/state/telemetry.ts).
  const goTab = useCallback((next: "lab" | "products" | "employees") => {
    setTab((cur) => {
      if (cur !== next) recordTelemetry({ kind: "tab", t: Date.now(), tab: next });
      return next;
    });
  }, []);
  const shipReady = canPrestige(game);
  const era = currentEra(game);

  // Transient unlock toasts.
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);
  // Cap the stack so a burst of simultaneous unlocks can't bury the screen
  // (keep the most recent few). Stable identities so child timers don't reset.
  const MAX_TOASTS = 3;
  // A capped, session-only history of everything that toasted, so the player can
  // review what happened after the transient toasts fade (legibility = the feature).
  const [log, setLog] = useState<ToastData[]>([]);
  const MAX_LOG = 40;
  const pushToast = useCallback((text: string, tone: ToastData["tone"] = "neutral") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((ts) => [...ts, { id, text, tone }].slice(-MAX_TOASTS));
    setLog((l) => [{ id, text, tone }, ...l].slice(0, MAX_LOG));
  }, []);
  const dropToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  // Transition toasts, data-driven: each row is a keyed fact of the state; when a
  // fact CHANGES after hydration, its message fires once. One list to add the next
  // toast to (a single row), one seen-map, one sync — no per-toast ref plumbing,
  // and no way to add a toast but forget its hydration baseline (which would
  // re-toast returning players). The faction row keys on the tilt DIRECTION
  // (doomer/accel), so a lab that later flips sides is told about the flip too.
  const alignDir = game.alignment === 0 ? "" : game.alignment > 0 ? "accel" : "doomer";
  const transitionToasts: { key: string; fact: string | boolean; when: string | boolean; text: string; tone: ToastData["tone"] }[] = [
    { key: "research", fact: showResearch, when: true, text: "Research unlocked", tone: "good" },
    { key: "market", fact: showMarket, when: true, text: "Data Market unlocked", tone: "good" },
    { key: "prestige", fact: showPrestige, when: true, text: "The path to shipping is open", tone: "good" },
    { key: "shipReady", fact: shipReady, when: true, text: "You can Ship the Model!", tone: "good" },
    { key: "align", fact: alignDir, when: "accel", text: "Your choices tilt the lab accelerationist — faster, hotter. See Lab Stats.", tone: "neutral" },
    { key: "align", fact: alignDir, when: "doomer", text: "Your choices tilt the lab doomer — safer, steadier. See Lab Stats.", tone: "neutral" },
    { key: "autoTrain", fact: d.autoTrain, when: true, text: "Auto-train online — runs restart themselves. Set your training intensity.", tone: "good" },
    { key: "hired", fact: game.stats.employeesHired > 0, when: true, text: "First hire aboard — specialists level up as they work", tone: "good" },
    // Heat used to explain itself only by punishing you (pre-launch audit).
    { key: "heat", fact: game.heat >= 25, when: true, text: "Regulatory Heat is rising — fines and raids get likelier. Time and lobbying cool it.", tone: "neutral" },
    // Rig Bay trophies (C2): one row per trophy part. Trophies persist across
    // prestige (carryEarnedComponents), so the fact never flips back — one toast
    // per save, ever.
    ...earnedDefs().map((def) => ({
      key: `trophy_${def.id}`,
      fact: (game.components.owned[def.id] ?? 0) > 0,
      when: true as const,
      text: `Trophy hardware earned: ${def.name} — fit it in the Rig Bay`,
      tone: "good" as const,
    })),
  ];
  const seenFacts = useRef<Record<string, string | boolean>>({});
  const syncedToSave = useRef(false);
  // Effect dep: a compact signature of all facts, so the effect runs exactly when
  // one of them changes (not on every 10Hz render).
  const factSignature = transitionToasts.map((t) => `${t.key}=${t.fact}`).join("|");
  useEffect(() => {
    // Wait for the save to hydrate, then sync the "seen" baseline once so we
    // don't toast facts the player already had on a returning load.
    if (!initialized) return;
    // Check ALL rows before updating the seen-map — rows can share a key (the
    // two faction directions), and an interleaved write would mask the second.
    if (syncedToSave.current) {
      for (const t of transitionToasts) {
        if (seenFacts.current[t.key] !== t.fact && t.fact === t.when) pushToast(t.text, t.tone);
      }
    }
    for (const t of transitionToasts) seenFacts.current[t.key] = t.fact;
    syncedToSave.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, factSignature]);

  // First-ever ship-ready: queue the one-time explainer (settings-persisted).
  // Only for a first-generation lab — veterans already know what shipping does.
  useEffect(() => {
    if (!initialized || shipExplained || game.prestige.ships > 0) return;
    if (shipReady) setShowShipExplainer(true);
  }, [initialized, shipReady, shipExplained, game.prestige.ships]);

  // Era transitions: a full-screen tentpole moment when the lab crosses an era.
  // Guarded by the same hydration sync so it never fires on a returning load.
  const seenEra = useRef(era);
  const syncedEra = useRef(false);
  useEffect(() => {
    if (!initialized) return;
    if (!syncedEra.current) { seenEra.current = era; syncedEra.current = true; return; }
    if (era > seenEra.current) { setEraMoment(era); haptics.celebrate(); sound.ship(); sound.era(); }
    seenEra.current = era;
  }, [initialized, era]);

  // Market climbing: a celebratory beat each time you reach a NEW best rank on the
  // AI leaderboard (overtaking a named rival). Best-rank-only so it never spams on
  // rank wobble; hydration-synced so it never fires on a returning load.
  const myRank = useMemo(() => playerMarketRank(game), [game]);
  const bestRank = useRef<number | null>(null);
  const syncedRank = useRef(false);
  useEffect(() => {
    if (!initialized || myRank == null) return;
    if (!syncedRank.current) { bestRank.current = myRank; syncedRank.current = true; return; }
    if (bestRank.current != null && myRank < bestRank.current) {
      bestRank.current = myRank;
      const passed = marketLeaderboard(game).slice(myRank).find((e) => !e.isYou);
      pushToast(myRank === 1 ? "🏆 You're #1 on the AI market!" : `📈 You overtook ${passed?.name ?? "a rival"} — now #${myRank} on the market!`, "good");
      haptics.celebrate(); sound.success();
    }
  }, [initialized, myRank]);

  // Ambient world events: feedback when a new card appears.
  useEffect(() => {
    if (!worldEvent) return;
    if (worldEvent.tone === "good") { haptics.success(); sound.success(); }
    else { haptics.warn(); sound.alert(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldEvent?.key]);

  // Regulatory events (heat-driven) surface as weighty toasts with feedback.
  useEffect(() => {
    if (!event) return;
    pushToast(event.message, event.tone);
    // A fine/raid must FEEL bad — never the celebratory ship fanfare.
    if (event.tone === "bad") { haptics.warn(); sound.alert(); }
    else { haptics.celebrate(); sound.success(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.key]);

  // Churn-reason flavor quips — satirical, low-weight. A light tap (NOT the heavy
  // regulatory warn) keeps them feeling like ambient color, not an alarm.
  useEffect(() => {
    if (!notice) return;
    pushToast(notice.message, notice.tone);
    // A "good" notice is a win (version shipped, milestone, viral) — full beat. A
    // "bad" ops event (outage/breach) feels bad. Neutral churn quips stay a light tap.
    // Achievement unlocks get their own bright chime so they feel distinct.
    if (notice.tone === "good") {
      if (notice.kind === "achievement") {
        haptics.success(); sound.achievement();
        // Burst from the topbar trophy — "it went into your collection". If the
        // trophy is scrolled off-screen, bloom from the screen centre so the
        // celebration is never invisible.
        if (!reducedMotion) {
          const el = document.querySelector('[aria-label="Achievements"]');
          const r = el?.getBoundingClientRect();
          const onScreen = r && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
          const cx = onScreen ? r!.left + r!.width / 2 : window.innerWidth / 2;
          const cy = onScreen ? r!.top + r!.height / 2 : window.innerHeight * 0.4;
          fxBurst(cx, cy, { count: 22, power: 1.1, colors: ["#ff9f0a", "#ffd60a", "#9b51e0"] });
        }
      }
      else {
        haptics.celebrate(); sound.success();
        // A milestone is a chase-ladder payoff — bloom gold from the screen centre.
        if (notice.kind === "milestone" && !reducedMotion) {
          fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 30, power: 1.6, colors: ["#ff9f0a", "#ffd60a", "#16b364"] });
        }
        // A specialist levelling up gets a small gold star-pop near the Team tab.
        if (notice.kind === "levelup" && !reducedMotion) {
          const team = Array.from(document.querySelectorAll(".botnav-lbl")).find((n) => n.textContent === "Team")?.parentElement;
          const r = team?.getBoundingClientRect();
          const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
          const cy = r ? r.top + r.height / 2 : window.innerHeight * 0.5;
          fxBurst(cx, cy, { count: 18, power: 1.1, colors: ["#ffd60a", "#ff9f0a", "#16b364"] });
        }
      }
    }
    else if (notice.tone === "bad") { haptics.warn(); sound.alert(); }
    else haptics.tap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.key]);

  // Staleness nudge: when a live product slips below ~50% competitiveness (rivals
  // pulled ahead since its last version), poke the player once to push an update.
  // Ref-tracked per product so it fires on the downward crossing, not every tick.
  const staleSeen = useRef<Record<string, boolean>>({});
  // Cheap per-render signal so the effect only re-runs when a product crosses the
  // staleness line (or the roster changes) — NOT every 10Hz tick, since
  // `game.products` is a fresh object reference every frame.
  const staleKey = game.products.active
    .map((p) => `${p.id}:${productMetrics(p, game.products.frontier).qf < 0.5 ? 1 : 0}`)
    .join("|");
  useEffect(() => {
    if (!initialized) return;
    const frontier = game.products.frontier;
    const live = new Set(game.products.active.map((p) => p.id));
    for (const p of game.products.active) {
      const qf = productMetrics(p, frontier).qf;
      const wasStale = staleSeen.current[p.id] ?? false;
      if (qf < 0.5 && !wasStale) {
        pushToast(`${p.name} is falling behind rivals — push a new version`, "bad");
        staleSeen.current[p.id] = true;
      } else if (qf >= 0.66 && wasStale) {
        staleSeen.current[p.id] = false; // re-armed once you've caught back up
      }
    }
    // Forget retired products so a recycled id can re-arm.
    for (const id of Object.keys(staleSeen.current)) {
      if (!live.has(id)) delete staleSeen.current[id];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, staleKey]);

  const syncedShips = useRef(false);
  useEffect(() => {
    // Guard against the empty→loaded hydration: a returning player with ships>0
    // must NOT see a "Model Shipped" celebration on every launch.
    if (!initialized) return;
    if (!syncedShips.current) {
      prevShips.current = game.prestige.ships;
      prevWeights.current = game.prestige.legacyWeights;
      prevAscensions.current = game.stats.ascensions;
      syncedShips.current = true;
      return;
    }
    if (game.prestige.ships > prevShips.current) {
      const gained = game.prestige.legacyWeights.sub(prevWeights.current);
      // Prefer the just-finished run's peaks (captured by prestige before the reset)
      // so the report reflects THIS generation, not all-time career bests. Fall back
      // to career stats only if the snapshot is somehow absent.
      const ship = game.lastShipReport;
      const report = {
        gen: game.prestige.ships,
        rank: playerMarketRank(game),
        peakCompute: ship?.peakCompute ?? game.stats.peakComputePerSec,
        peakMrr: ship?.peakMrr ?? game.stats.peakMrr,
        era: currentEra(game),
        alignment: game.alignment,
        productsLive: game.products.active.length,
        rivalsBeaten: rivalsBeaten(game),
      };
      setCelebration({ gained, total: game.prestige.legacyWeights, report });
      haptics.celebrate();
      // The flagship you just shipped is waiting as a free-to-launch product —
      // make sure the player knows (a ship that "gave nothing" was the #1 confusion).
      if (game.products.drafts.length > 0) {
        pushToast("Your shipped model is ready — commercialise it free in Products", "good");
      }
      // An AGI ascension (a ship in the Post-Singularity era) gets the grander beat:
      // the ascend fanfare + a gold screen flash + a big central particle bloom.
      if (game.stats.ascensions > prevAscensions.current) {
        sound.ascend();
        setFlash((k) => k + 1);
        if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight / 2, { count: 48, power: 2.2, colors: ["#a855f7", "#ffd60a", "#ff9f0a", "#fff"] });
      } else sound.ship();
    }
    prevShips.current = game.prestige.ships;
    prevWeights.current = game.prestige.legacyWeights;
    prevAscensions.current = game.stats.ascensions;
  }, [initialized, game.prestige.ships, game.prestige.legacyWeights]);

  // Action handlers wrapped with tactile + audio feedback.
  const onStart = () => { haptics.tap(); sound.tap(); doStartRun(); };
  const onClaim = () => { haptics.success(); sound.success(); doClaim(); };
  const onClaimDaily = () => {
    haptics.celebrate(); sound.success(); doClaimDaily(); markDailyClaimed(); setDailyOn(false);
    if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight * 0.32, { count: 30, power: 1.5, colors: ["#7c5cff", "#ffd60a", "#16b364", "#2f7bf6"] });
  };
  // Hardware buys float the rate you actually gained ("+120/s") at the tap point —
  // seeing the number go up IS the reward. Derived before/after the synchronous
  // action; only rate-moving buys float (power/floor purchases stay quiet).
  const onBuy = (id: string, count = 1, at?: { x: number; y: number }) => {
    haptics.tap(); sound.purchase();
    // `d` (this render's derive) is the pre-buy baseline — rates only move on
    // purchases/modifier changes, so re-deriving "before" would duplicate it.
    const before = at ? d : null;
    if (count > 1) doBuyUpgradeBulk(id, count); else doBuyUpgrade(id);
    if (at && before) {
      const after = derive(useGame.getState().game);
      const dc = after.computePerSec.sub(before.computePerSec);
      const dd = after.dataPerSec.sub(before.dataPerSec);
      const dm = after.passiveMoneyPerSec.sub(before.passiveMoneyPerSec);
      if (dc.gt(0)) fxFloat(at.x, at.y - 6, `+${fmt(dc)}/s`, "#2f7bf6", 15);
      else if (dd.gt(0)) fxFloat(at.x, at.y - 6, `+${fmt(dd)}/s`, "#9b51e0", 15);
      else if (dm.gt(0)) fxFloat(at.x, at.y - 6, `+$${fmt(dm)}/s`, "#16b364", 15);
    }
  };
  const onHireCandidate = (i: number) => { haptics.celebrate(); sound.purchase(); doHireCandidate(i); };
  const onTrain = (id: string) => { haptics.tap(); sound.tap(); doTrainEmployee(id); };
  const onAssignEmp = (id: string, productId: string | null) => { haptics.tap(); doAssignEmployeeToProduct(id, productId); };
  const onFire = (id: string) => { haptics.tap(); doFireEmployee(id); };
  const onBuyPerk = (id: string) => { haptics.tap(); sound.purchase(); doBuyOfficePerk(id); };
  const onLaunchDraft = (draftId: string, type: ProductTypeId, name: string) => {
    // Only fire the tentpole moment if the launch actually happened (a stale tap
    // on a full/unaffordable portfolio must not celebrate a phantom product).
    if (!doLaunchDraft(draftId, type, name)) { haptics.warn(); return; }
    haptics.celebrate(); sound.ship();
    setLaunch({ type, name });
  };
  const onStartUpgrade = (id: string) => {
    const p = game.products.active.find((x) => x.id === id);
    doStartUpgrade(id);
    // Kicking off research is a small commit beat; the big payoff lands when it
    // COMPLETES (the store fires a "good" notice → celebration in the notice effect).
    haptics.tap(); sound.tap();
    if (p && !p.upgrade) pushToast(`${p.name} — researching v${p.version + 1}…`, "neutral");
  };
  // Selling a product asks first via the in-app ConfirmSheet (never window.confirm
  // — native panel, and it froze the game loop while open). Cancelling leaves the
  // product-management sheet exactly as it was.
  const onRetireProductFx = (id: string) => setPendingRetire(id);
  const retireTarget = pendingRetire ? game.products.active.find((x) => x.id === pendingRetire) ?? null : null;
  const confirmRetire = () => {
    const id = pendingRetire;
    setPendingRetire(null);
    if (!id) return;
    const p = game.products.active.find((x) => x.id === id);
    if (!p) return;
    const payout = retirePayout(game, id);
    doRetireProduct(id);
    haptics.success(); sound.purchase();
    pushToast(`Sold ${p.name} for ${fmtMoney(Big.of(Math.round(payout)))}`, "neutral");
  };
  const onClaimContract = (id: string, rep: number) => {
    doClaimContract(id);
    haptics.celebrate(); sound.success();
    pushToast(`Contract complete — +${rep} Lab Reputation`, "good");
    if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 24, power: 1.3, colors: ["#ff9f0a", "#ffd60a", "#16b364"] });
  };
  const onResearch = (id: string) => { haptics.tap(); sound.purchase(); doResearch(id); };
  const onBuyData = (id: string) => {
    const outcome = doBuyData(id);
    if (!outcome) return;
    // The reveal IS the dopamine: reward clean hauls, sting the bad rolls.
    if (outcome.kind === "clean") {
      pushToast(outcome.message, "neutral");
      haptics.success();
      sound.success();
    } else {
      pushToast(outcome.message, "bad");
      haptics.warn();
      sound.alert();
    }
  };

  return (
    <div className={`app${reducedMotion ? " reduce-motion" : ""}`}>
      <div className="aurora" aria-hidden="true">
        <span className="blob blob-a" />
        <span className="blob blob-b" />
        <span className="blob blob-c" />
      </div>

      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.png" alt="Singularity Inc." width={30} height={30} />
          <div className="brand-text">
            <h1>Singularity Inc.</h1>
            <Tagline />
          </div>
        </div>
      </header>

      <ResourceBar
        compute={game.resources.compute}
        data={game.resources.data}
        money={game.resources.money}
        computeRate={d.computePerSec}
        dataRate={d.dataPerSec}
        moneyRate={d.passiveMoneyPerSec}
      />
      <ModifierBar
        modifiers={game.modifiers}
        status={regulatorIsNamed(game) ? [{ key: "regulator", label: `⚖ ${regulatorState(game).name}: ${regulatorState(game).label}`, tone: "bad" as const }] : []}
      />

      <main className="stage">
        {/* One fixed-height notice slot, ALWAYS rendered, showing exactly one
            strip (daily > advisor nudge > goal carrot). Strips appearing and
            vanishing must never shove the section tabs / hall / buttons below —
            the slot reserves the space, only its content swaps. */}
        <div className="notice-slot">
          {dailyOn ? (
            <button className="daily-bar" onClick={onClaimDaily} aria-label="Claim your daily boost">
              <span className="daily-ic"><GiftIcon size={18} /></span>
              <span className="daily-text"><b>Daily boost</b> — +{Math.round((balance.daily.factor - 1) * 100)}% for {Math.round(balance.daily.durationSec / 60)} min</span>
              <span className="daily-go">Claim</span>
            </button>
          ) : nudge ? (
            /* The advisor's single next action, as a tappable wayfinder. It only
               exists when the engine sees a waiting decision or a real problem
               (advisor.ts is deliberately conservative), and tapping it lands the
               player exactly where the action lives — tab AND Lab section. */
            <button
              className="advisor-chip"
              onClick={() => {
                haptics.tap(); sound.tap();
                goTab(nudge.tab);
                // Only deep-link into a Lab section while the section switcher
                // exists — before that the Lab renders Build alone, and setting a
                // hidden section would both dead-tap now and mis-land later.
                if (nudge.tab === "lab" && nudge.section && labSectioned) goSection(nudge.section);
              }}
            >
              <span className="advisor-mark" aria-hidden="true">➤</span>
              <span className="advisor-text">{nudge.text}</span>
              <span className="advisor-go" aria-hidden="true">›</span>
            </button>
          ) : goal ? (
            /* The next-goal carrot: whatever chase (era / contract / achievement)
               is closest to popping, ticking up live. Tap lands where it resolves. */
            <button
              className="goal-strip"
              title={goal.desc}
              onClick={() => {
                haptics.tap();
                if (goal.kind === "achievement") setShowAchievements(true);
                else if (goal.kind === "milestone") goTab("products");
                else {
                  goTab("lab");
                  if (labSectioned) goSection(goal.kind === "era" && era === 0 ? "research" : "hq");
                }
              }}
            >
              <span className="goal-fill" style={{ width: `${Math.round(goal.progress * 100)}%` }} aria-hidden="true" />
              <span className="goal-ic"><TargetIcon size={14} /></span>
              <span className="goal-text"><b>Next goal:</b> {goal.label}</span>
              <span className="goal-pct">{Math.floor(goal.progress * 100)}%</span>
            </button>
          ) : null}
        </div>
        {tab === "products" && showProducts ? (
          <ProductsPanel
            game={game}
            onLaunchDraft={onLaunchDraft}
            onStartUpgrade={onStartUpgrade}
            onSetPrice={doSetProductPrice}
            onSetMarketing={doSetProductMarketing}
            onSetEnterprise={doSetEnterprise}
            onSetEnterprisePrice={doSetEnterprisePrice}
            onSetChannelMix={doSetChannelMix}
            onBuyFeature={doBuyFeature}
            onRename={doRenameProduct}
            onRetire={onRetireProductFx}
          />
        ) : tab === "employees" && showStaff ? (
          <EmployeesPanel
            game={game} derived={d} candidates={candidates}
            onRecruit={() => { haptics.tap(); sound.tap(); doRecruit(); }}
            onRefresh={doRefreshCandidates}
            onCloseRecruit={doCloseRecruit}
            onHireCandidate={onHireCandidate}
            onTrain={onTrain}
            onAssign={onAssignEmp}
            onFire={onFire}
            onBuyPerk={onBuyPerk}
          />
        ) : (
          <>
            {/* Lab sub-sections keep the tab legible: Build (the hall + core loop),
                Research (tree + data market), HQ (ship/prestige, contracts, records).
                Only ONE section renders at a time — also a 10Hz render-cost win. */}
            {labSectioned && (
              <nav className="labnav" aria-label="Lab sections">
                <button className={`tab ${section === "build" ? "on" : ""}`} aria-current={section === "build" ? "true" : undefined} onClick={() => { haptics.tap(); goSection("build"); }}>
                  Build{labAttention.build > 0 && <span className="tab-dot">{labAttention.build}</span>}
                </button>
                <button className={`tab ${section === "research" ? "on" : ""}`} aria-current={section === "research" ? "true" : undefined} onClick={() => { haptics.tap(); goSection("research"); }}>
                  Research{labAttention.research > 0 && <span className="tab-dot">{labAttention.research}</span>}
                </button>
                <button className={`tab ${section === "hq" ? "on" : ""}`} aria-current={section === "hq" ? "true" : undefined} onClick={() => { haptics.tap(); goSection("hq"); }}>
                  HQ{shipReady && section !== "hq"
                    ? <span className="tab-dot ship">Ship</span>
                    : labAttention.hq > 0 && <span className="tab-dot">{labAttention.hq}</span>}
                </button>
              </nav>
            )}
            {section === "build" && (
              <>
                <HallCanvas onExpand={setPendingExpansion} />
                <TrainingDock game={game} derived={d} onStart={onStart} onClaim={onClaim} onSetFocus={setComputeFocus} />
                <CharterPanel
                  game={game}
                  onSet={(id) => { haptics.tap(); sound.tap(); doSetCharter(id); }}
                  onLock={() => { haptics.success(); sound.purchase(); doLockCharter(); }}
                />
                <UpgradePanel game={game} derived={d} onBuy={onBuy} />
                {componentsUnlocked(game) && (
                  <RigBayPanel
                    game={game}
                    onBuy={(id) => { haptics.tap(); sound.purchase(); doBuyComponent(id); }}
                    onEquip={(tier, slot, id) => { haptics.success(); sound.tap(); doEquipComponent(tier, slot, id); }}
                    onFuse={(id) => { haptics.celebrate(); sound.purchase(); doFuseComponents(id); }}
                  />
                )}
              </>
            )}
            {section === "research" && (
              <>
                {showResearch && <ResearchPanel game={game} derived={d} onResearch={onResearch} />}
                {showMarket && <DataMarketPanel game={game} onBuyData={onBuyData} onBuyTool={onBuy} onLobby={() => { haptics.tap(); sound.purchase(); doLobby(); }} />}
              </>
            )}
            {section === "hq" && (
              <>
                {showPrestige && <PrestigePanel game={game} onPrestige={doPrestige} onBuyReputationPerk={(id) => { haptics.success(); sound.purchase(); doBuyReputationPerk(id); }} onBuyLegacyPerk={(id) => { haptics.success(); sound.purchase(); doBuyLegacyPerk(id); }} />}
                {showResearch && <ContractsPanel game={game} onClaim={onClaimContract} />}
                <StatsPanel game={game} derived={d} />
                {game.prestige.ships > 0 && <CodexPanel game={game} />}
                <EventLog log={log} />
              </>
            )}
            {/* Pre-sectioning (very early game): the reference tails stay inline so
                the session log and stats are never unreachable. */}
            {!labSectioned && (
              <>
                <StatsPanel game={game} derived={d} />
                <EventLog log={log} />
              </>
            )}
          </>
        )}

        <footer className="footer">
          <button className="link-btn" onClick={() => setConfirmReset(true)}>
            reset save
          </button>
          <span className="footer-flavor">Singularity Inc. — disrupting disruption since today.</span>
        </footer>
      </main>

      <nav className="botnav" aria-label="Primary">
        {/* Destinations use aria-current; Awards/More are actions (open modals),
            so this is a nav bar, not a tablist (the panes aren't tab panels). */}
        <button className={`botnav-item ${tab === "lab" ? "on" : ""} ${shipReady && tab !== "lab" ? "ship-ready" : ""}`} aria-current={tab === "lab" ? "page" : undefined} onClick={() => { haptics.tap(); if (shipReady && tab !== "lab") goSection("hq"); goTab("lab"); }}>
          <span className="botnav-ic"><FlaskIcon size={23} /></span><span className="botnav-lbl">Lab</span>
          {shipReady && tab !== "lab"
            ? <span className="botnav-badge ship" aria-label="Ready to ship">Ship</span>
            : attention.lab > 0 && <span className="botnav-badge">{attention.lab}</span>}
        </button>
        {showProducts && (
          <button className={`botnav-item ${tab === "products" ? "on" : ""}`} aria-current={tab === "products" ? "page" : undefined} onClick={() => { haptics.tap(); goTab("products"); }}>
            <span className="botnav-ic"><BoxIcon size={23} /></span><span className="botnav-lbl">Products</span>
            {attention.products > 0 && <span className="botnav-badge">{attention.products}</span>}
          </button>
        )}
        {showStaff && (
          <button className={`botnav-item ${tab === "employees" ? "on" : ""}`} aria-current={tab === "employees" ? "page" : undefined} onClick={() => { haptics.tap(); goTab("employees"); }}>
            <span className="botnav-ic"><TeamIcon size={23} /></span><span className="botnav-lbl">Team</span>
            {attention.employees > 0 && <span className="botnav-badge">{attention.employees}</span>}
          </button>
        )}
        <button className="botnav-item" onClick={() => { haptics.tap(); setShowAchievements(true); }} aria-label="Achievements">
          <span className="botnav-ic"><TrophyIcon size={23} /></span><span className="botnav-lbl">Awards</span>
          {game.achievements.length > 0 && <span className="botnav-badge alt">{game.achievements.length}</span>}
        </button>
        <button className="botnav-item" onClick={() => { haptics.tap(); setShowSettings(true); }} aria-label="Settings">
          <span className="botnav-ic"><GearIcon size={22} /></span><span className="botnav-lbl">More</span>
        </button>
      </nav>

      {/* MOMENT QUEUE: the five full-screen moments render ONE at a time, by
          priority (offline recap > ship celebration > era transition > product
          launch > world event). Each keeps its own state; dismissing one lets
          the next in line show. Replaces pairwise !x guards — any same-tick
          combination now sequences instead of stacking. */}
      {moment === "offline" && offline && <OfflineModal summary={offline} onClose={dismissOffline} />}
      {moment === "celebration" && celebration && (
        <Celebration
          weightsGained={celebration.gained}
          totalWeights={celebration.total}
          report={celebration.report}
          onDone={() => {
            setCelebration(null);
            // A fresh run starts at the hall — don't leave the Lab parked on HQ.
            setLabSection("build");
            // Land the player on their reward: a freshly-shipped model waiting to
            // be commercialised. Removes the "I shipped and got nothing" dead-end.
            if (productsUnlocked(game) && game.products.drafts.length > 0) setTab("products");
          }}
        />
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      {showAchievements && <AchievementsModal game={game} onClose={() => setShowAchievements(false)} />}
      {pendingExpansion && (
        <ExpandConfirm
          id={pendingExpansion}
          onConfirm={() => { onBuy(pendingExpansion); setPendingExpansion(null); }}
          onDecline={() => setPendingExpansion(null)}
        />
      )}
      {retireTarget && (
        <ConfirmSheet
          kicker="SELL PRODUCT"
          title={`Sell ${retireTarget.name}?`}
          body={`Take the ${fmtMoney(Big.of(Math.round(retirePayout(game, retireTarget.id))))} buyout. This is permanent — the product and its users are gone.`}
          confirmLabel="Sell it"
          danger
          onConfirm={confirmRetire}
          onCancel={() => setPendingRetire(null)}
        />
      )}
      {confirmReset && (
        <ConfirmSheet
          kicker="HARD RESET"
          title="Wipe the save and start over?"
          body="Everything goes — Legacy, Reputation, products, the lot. The investors will understand."
          confirmLabel="Wipe it"
          danger
          onConfirm={() => {
            setConfirmReset(false);
            // hardReset clears the store, not App-local nav — land the fresh
            // save on the Lab's Build pane, not wherever the old one was parked.
            setTab("lab");
            setLabSection("build");
            hardReset();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {moment === "era" && eraMoment !== null && <EraTransition era={eraMoment} onDone={() => setEraMoment(null)} />}
      {moment === "launch" && launch && (
        <ProductLaunch
          name={launch.name}
          typeName={typeDef(launch.type).name}
          onDone={() => setLaunch(null)}
        />
      )}
      {moment === "world" && worldEvent && (
        <WorldEventCard
          event={worldEvent}
          onDismiss={dismissWorldEvent}
          onChoose={(i) => { haptics.tap(); sound.tap(); chooseWorldEvent(i); }}
        />
      )}
      {/* One-time "what does Shipping do" explainer, shown the first time a ship
          is ready (persisted in settings — the scariest button in the game
          deserves one screen before it's pressed). */}
      {moment === null && showShipExplainer && (
        <ConfirmSheet
          kicker="SHIP THE MODEL"
          title="Your first Ship is ready"
          body="Shipping resets this run — Compute, Data, $, racks, parts and research — and banks Legacy Weights: a permanent boost to every future run. Your team, products, trophies, achievements and Reputation all stay. Shipping is how you grow."
          confirmLabel="Got it"
          hideCancel
          onConfirm={() => { markShipExplained(); setShowShipExplainer(false); }}
          onCancel={() => { markShipExplained(); setShowShipExplainer(false); }}
        />
      )}
      {!onboarded && !offline && <Onboarding onDone={completeOnboarding} />}
      <ToastStack toasts={toasts} onDone={dropToast} />
      <FxCanvas reducedMotion={reducedMotion} />
      {flash > 0 && !reducedMotion && <div key={flash} className="screen-flash" aria-hidden="true" onAnimationEnd={() => setFlash(0)} />}
    </div>
  );
}
