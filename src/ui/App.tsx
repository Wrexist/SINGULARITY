import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { dayPhase } from "../render/hallRenderer";
import { stakePayout } from "../engine/market";
import { useSettings } from "./settings";
import { useReducedMotion } from "./motion";
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
import { FirstSteps, firstStepsVisible } from "./FirstSteps";
import { gameCenterSubmitScores, gameCenterUnlock } from "./gameCenter";
import { DataMarketPanel } from "./DataMarketPanel";
import { EmployeesPanel } from "./EmployeesPanel";
import { ProductsPanel } from "./ProductsPanel";
import { AchievementsModal } from "./AchievementsModal";
import { ContractsPanel } from "./ContractsPanel";
import { CharterPanel } from "./CharterPanel";
import { CodexPanel } from "./CodexPanel";
import { EventLog } from "./EventLog";
import { FxCanvas } from "./FxCanvas";
import { burst as fxBurst, floatText as fxFloat, FX_PALETTES } from "./fx";
import { ProductLaunch } from "./ProductLaunch";
import { productsUnlocked, typeDef, retirePayout } from "../engine/products";
import { advisorItems, type AdvisorTab, type LabSection } from "../engine/advisor";
import { nextGoal } from "../engine/goals";
import { marketLeaderboard, playerMarketRank, rivalsBeaten } from "../engine/market";
import { FlaskIcon, BoxIcon, TeamIcon, TrophyIcon, GearIcon, GiftIcon, TargetIcon } from "./Icons";
import { fmt, fmtMoney } from "./format";
import type { ProductTypeId } from "../engine/balance/products";
import { iap } from "./iap";
import { isPremium } from "../state/premium";
import { scheduleReturnReminder, cancelReturnReminder } from "./notifications";
import { balance } from "../engine/balance/config";
import { HallCanvas } from "./HallCanvas";
import { sampleHistory, resetHistory, SAMPLE_MS } from "./history";
import { NewsTicker } from "./NewsTicker";
import { ExpandConfirm } from "./ExpandConfirm";
import { ConfirmSheet } from "./ConfirmSheet";
import { RigBayPanel } from "./RigBayPanel";
import { componentsUnlocked, earnedDefs } from "../engine/components";

// Trophy-part defs are static catalog data — resolve once, not per render.
const TROPHY_DEFS = earnedDefs();

// Rotating framings for a claimed contract — picked by hashing the contract id so
// each deal reads the same way every time but the board as a whole feels varied.
const CONTRACT_DONE_QUIPS = [
  "Delivered",
  "Signed and shipped",
  "The client is thrilled",
  "Deliverable accepted",
  "Another one in the bag",
  "Milestone booked",
  "Invoice sent",
  "Handshake complete",
];

// A morning-momentum flavor line for the daily boost — varied by day so the once-a-day
// beat feels like a new day at the lab, not the same confetti every time.
const DAILY_QUIPS = [
  "The clusters are warm and the coffee is hot",
  "A good day to ship",
  "Morning standup went suspiciously well",
  "The GPUs are purring",
  "Overnight training actually converged",
  "The team came in early — for once",
  "Investors sent a suspiciously nice email",
  "Every dashboard is green. Enjoy it.",
];
import { EraTransition } from "./EraTransition";
import { WorldEventCard } from "./WorldEventCard";
import { ModifierBar } from "./ModifierBar";
import { regulatorIsNamed, regulatorState } from "../engine/regulator";
import { canPrestige } from "../engine/prestige";
import { chartersUnlocked } from "../engine/charter";
import { preprintsUnlocked } from "../engine/preprints";
import { legacyAvailable } from "../engine/legacyTree";
import { endowmentUnlocked } from "../engine/reputation";
import { canBuyOfficePerk } from "../engine/actions";
import { modelReadyNote, researchStartNote, soldNote, hireWelcome, fireSendoff } from "../engine/notices";
import { challengesUnlocked, challengeById } from "../engine/challenges";
import { GrandChallengesPanel } from "./GrandChallengesPanel";
import { TrialsPanel, trialsDoneCount, trialsTotal } from "./TrialsPanel";
import { trialsUnlocked } from "../engine/trials";
import { ParadigmPanel } from "./ParadigmPanel";
import { paradigmsUnlocked } from "../engine/paradigms";
import { DoctrinePanel, doctrineDoneCount, doctrineTotal } from "./DoctrinePanel";
import { doctrineUnlocked } from "../engine/doctrine";
import { InstitutePanel } from "./InstitutePanel";
import { instituteUnlocked, grantsAvailable } from "../engine/institute";
import { Collapsible } from "./Collapsible";
import { ChallengeComplete } from "./ChallengeComplete";
import { objectivesUnlocked } from "../engine/objectives";
import { ObjectivesPanel } from "./ObjectivesPanel";
import { automationUnlockedAny } from "../engine/automation";
import { AutomationPanel } from "./AutomationPanel";
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
  const { doStartRun, doClaim, doBuyUpgrade, doBuyUpgradeBulk, doBuyOfficePerk, doBuyReputationPerk, doBuyEndowment, doPickDirective, doRespecDirective, doPlaceStake, doBuyLegacyPerk, doResearch, doBuyData, doPrestige, setComputeFocus,
    doRecruit, doRefreshCandidates, doCloseRecruit, doHireCandidate, doTrainEmployee, doAssignEmployeeToProduct, doFireEmployee,
    doLaunchDraft, doStartUpgrade, doSetProductPrice, doSetProductMarketing, doSetEnterprise, doSetEnterprisePrice, doSetChannelMix, doBuyFeature, doRenameProduct, doRetireProduct,
    doClaimContract, doClaimSponsor, doBuyPreprint, doSetCharter, doLobby, dismissOffline, dismissWorldEvent, chooseWorldEvent, doClaimDaily, hardReset,
    doBuyComponent, doEquipComponent, doFuseComponents, doLockCharter, doCounterRival, doFundChallenge, doChooseFork, doFundMegaproject, doClaimObjective, doToggleAutomation, doStartTrial, doAbandonTrial, doSetFlagship, doBuyParadigm, doClaimDoctrine, doBuyInstitute } =
    useGame.getState();

  const d = useMemo(() => derive(game), [game]);
  // The advisor list feeds three things from one scan (memoized per tick, same
  // cadence as derive — a handful of product checks, no clock): the per-tab nav
  // badges, the per-Lab-section badges, and the single "next action" nudge chip.
  // A waiting run-claim is counted in the BADGES only (not the chip — the big
  // bobbing Claim button is its own nudge): with the Lab sectioned, the button
  // can be off-screen on Research/HQ, and a claim must never be signal-less.
  const advisor = useMemo(() => advisorItems(game, d), [game, d]);
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
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big; report: ShipReport; ascended?: boolean } | null>(null);
  const [eraMoment, setEraMoment] = useState<number | null>(null);
  const [launch, setLaunch] = useState<{ type: ProductTypeId; name: string } | null>(null);
  const [pendingExpansion, setPendingExpansion] = useState<string | null>(null);
  const [pendingRetire, setPendingRetire] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [challengeDoneId, setChallengeDoneId] = useState<string | null>(null); // Grand Challenge just completed → moment
  const [flash, setFlash] = useState(0); // AGI ascension screen flash (key replays the anim)
  const [dailyOn, setDailyOn] = useState(() => dailyAvailable());
  // The "next goal" carrot: the era/contract/achievement closest to popping
  // (see engine/goals.ts). Only computed when the notice slot would actually
  // show it (slot priority is daily > nudge > goal) — no point scanning 50+
  // achievement metrics at 10Hz to produce a hidden result.
  // The opening FIRST STEPS coach owns the whole first-session screen. While it's up
  // (first generation, before the loop closes), suppress the competing notice-slot
  // strips and the satirical news ticker so a brand-new player sees ONE thing to do —
  // then the world "comes alive" as a reward once they've learned the loop (2026-07).
  const firstSteps = firstStepsVisible(game);
  const goal = useMemo(() => (dailyOn || nudge || firstSteps ? null : nextGoal(game)), [game, dailyOn, nudge, firstSteps]);
  const reducedMotion = useReducedMotion();
  const hallTheme = useSettings((s) => s.hallTheme);
  const music = useSettings((s) => s.music);
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);
  const shipExplained = useSettings((s) => s.shipExplained);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const markShipExplained = useSettings((s) => s.markShipExplained);
  const achievementsSeen = useSettings((s) => s.achievementsSeen);
  const markAchievementsSeen = useSettings((s) => s.markAchievementsSeen);
  const [showShipExplainer, setShowShipExplainer] = useState(false);

  // Rate-history sampler for the Lab Stats sparklines (session-only, UI-side).
  // Reads this render's derive via a ref so the interval never re-arms.
  const dRef = useRef(d);
  dRef.current = d;
  useEffect(() => {
    const t = window.setInterval(
      () => sampleHistory(dRef.current.computePerSec, dRef.current.dataPerSec, dRef.current.passiveMoneyPerSec),
      SAMPLE_MS,
    );
    return () => window.clearInterval(t);
  }, []);

  // "Booted" flips once the opening entrance has played; from then on, tab and
  // section swaps use the fast rise-nav settle instead of the full cinematic
  // stagger (see styles.css .app-booted).
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 950);
    return () => window.clearTimeout(t);
  }, []);

  // The moment queue's head: exactly ONE full-screen moment renders at a time,
  // by priority. Dismissing the head lets the next pending one show.
  const moment = offline ? "offline"
    : celebration ? "celebration"
    : eraMoment !== null ? "era"
    : challengeDoneId ? "challenge"
    : launch ? "launch"
    : worldEvent ? "world"
    : null;

  const era = currentEra(game);

  // Ambient music bed — follow the Music setting; pause while the tab is hidden
  // (battery). Starts on the first user gesture if audio isn't unlocked yet.
  // Era-keyed (IMPROVEMENTS #3): the pad retunes as the lab crosses eras.
  useEffect(() => {
    sound.setMusicEra(era);
    const apply = () => sound.setMusic(music && !document.hidden);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [music, era]);

  // Day/night shading for the music bed (the hall's cycle, heard): night sits a
  // touch darker. Synced per render (10Hz) but quantised to 24 phase buckets so
  // the smooth setTargetAtTime ramps are only re-aimed ~every 10s.
  const daylightBucket = useRef(-1);
  useEffect(() => {
    const bucket = Math.round(dayPhase(Date.now()) * 24); // UI owns the wall clock
    if (bucket !== daylightBucket.current) {
      daylightBucket.current = bucket;
      sound.setMusicDaylight(bucket / 24);
    }
  });

  // Re-validate the premium entitlement against StoreKit at launch (native only;
  // no-op on web). Keeps the localStorage cache from being the source of truth.
  useEffect(() => { void iap.refresh(); }, []);

  // Return reminders (opt-in, native-only): on background, schedule ONE honest
  // notification for when the offline cap fills; on return, cancel it. Reads fresh
  // state in the handler so it always reflects the current setting / production /
  // premium cap. A safe no-op on web and until the player enables the toggle.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (!useSettings.getState().notifyReminders) return;
        const g = useGame.getState().game;
        const producing = derive(g).computePerSec.gt(0) || g.products.active.length > 0;
        const capHours = isPremium() ? balance.offline.premiumMaxHours : balance.offline.maxHours;
        void scheduleReturnReminder(capHours, producing);
      } else {
        void cancelReturnReminder();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // The daily boost was only checked at mount, so a session left open across the
  // day rollover never saw the bar reappear. Re-check on a slow tick and whenever
  // the app returns to the foreground (the common idle-game resume path).
  // The sponsor contract (IDEAS #9) rides the same cadence: the store rolls a
  // fresh objective when the local day changes (no-op until the ladder clears).
  useEffect(() => {
    const check = () => {
      setDailyOn((on) => on || dailyAvailable());
      useGame.getState().doRollSponsor(Math.floor(Date.now() / 86_400_000));
    };
    check();
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
    setLog((l) => [{ id, text, tone, at: Date.now() }, ...l].slice(0, MAX_LOG));
  }, []);
  // Log-only sibling of pushToast: records an event to the "Recent activity" log
  // WITHOUT a transient popup. Routine confirmations of the player's own tap (a
  // hire appearing in the roster, a research node completing in-panel, a sold
  // product leaving the list) are already confirmed by the UI they act on — a
  // toast on top is noise. The event still lands in EventLog, so no information is
  // lost; the player can review it there. (De-noising audit, 2026-07.)
  const logEvent = useCallback((text: string, tone: ToastData["tone"] = "neutral") => {
    toastId.current += 1;
    setLog((l) => [{ id: toastId.current, text, tone, at: Date.now() }, ...l].slice(0, MAX_LOG));
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
    // Systems that used to appear as unexplained new panels (onboarding audit): one
    // line each, the first time they unlock, saying what they are and where to find them.
    { key: "charter", fact: chartersUnlocked(game), when: true, text: "Lab Charter unlocked — pick a run focus on the Build tab before you lock into research.", tone: "good" },
    { key: "rigbay", fact: componentsUnlocked(game), when: true, text: "Rig Bay unlocked — slot components into your racks for extra output. It's on the Build tab.", tone: "good" },
    { key: "preprints", fact: preprintsUnlocked(game), when: true, text: "Research tree complete — publish frontier Preprints in Research for a repeatable, escalating boost.", tone: "good" },
    { key: "legacytree", fact: legacyAvailable(game).gt(0), when: true, text: "Legacy Investments unlocked — spend Legacy Weights on a permanent lane focus in HQ → Prestige.", tone: "good" },
    { key: "endowment", fact: endowmentUnlocked(game), when: true, text: "Reputation Endowment unlocked — you own the whole perk tree; pour surplus Reputation into a permanent, escalating boost in HQ → Lab Reputation.", tone: "good" },
    // Heat used to explain itself only by punishing you (pre-launch audit).
    { key: "heat", fact: game.heat >= 25, when: true, text: "Regulatory Heat is rising — fines and raids get likelier. Time and lobbying cool it.", tone: "neutral" },
    // Gentle backup nudge (R8.2): once real progress exists and no backup ever
    // has, say it ONCE. No timers, no urgency — a fact-transition like the rest.
    { key: "backup", fact: game.prestige.ships >= 2 && lastBackupAt === null, when: true, text: "Two generations banked — your save lives only on this device. Back it up in More → Back up.", tone: "neutral" },
    // Rig Bay trophies (C2): one row per trophy part. Trophies persist across
    // prestige (carryEarnedComponents), so the fact never flips back — one toast
    // per save, ever.
    ...TROPHY_DEFS.map((def) => ({
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
    if (!initialized || shipExplained) return;
    if (game.prestige.ships > 0) {
      // Shipped before the explainer found a clear stage (or on a veteran save)
      // — the lesson is learned; retire the sheet so it never shows stale.
      setShowShipExplainer(false);
      markShipExplained();
      return;
    }
    if (shipReady) setShowShipExplainer(true);
  }, [initialized, shipReady, shipExplained, game.prestige.ships, markShipExplained]);

  // Era transitions: a full-screen tentpole moment when the lab crosses an era.
  // Guarded by the same hydration sync so it never fires on a returning load.
  const seenEra = useRef(era);
  const syncedEra = useRef(false);
  const eraShips = useRef(game.prestige.ships); // ships count at the last era-effect run
  useEffect(() => {
    if (!initialized) return;
    if (!syncedEra.current) { seenEra.current = era; eraShips.current = game.prestige.ships; syncedEra.current = true; return; }
    // The era beat has its OWN chord (sound.era()). A ship that crosses an era already
    // fired haptics.celebrate() + sound.ship() in the claim effect, so this effect adds
    // ONLY the era chord there. But a research-driven crossing (era 0→1, or era→2 via the
    // Scale-Up node) has no ship, so it needs its own celebrate haptic — fire it only when
    // ships DIDN'T change, so a ship-crossing never double-buzzes.
    if (era > seenEra.current) {
      setEraMoment(era);
      sound.era();
      if (game.prestige.ships === eraShips.current) haptics.epic();
    }
    eraShips.current = game.prestige.ships;
    seenEra.current = era;
  }, [initialized, era]);

  // Game Center achievement mirror: unlocks that happen THIS session get pushed
  // (hydration-synced like the toasts, so a returning save doesn't re-fire 37
  // calls at launch; GC ignores re-unlocks anyway, this just avoids the spam).
  const seenAch = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!initialized) return;
    if (seenAch.current === null) { seenAch.current = new Set(game.achievements); return; }
    for (const id of game.achievements) {
      if (!seenAch.current.has(id)) { seenAch.current.add(id); void gameCenterUnlock(id); }
    }
  }, [initialized, game.achievements]);

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
      pushToast(myRank === 1 ? "You're #1 on the AI market!" : `You overtook ${passed?.name ?? "a rival"} — now #${myRank} on the market!`, "good");
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
    // Notice triage (de-noising audit, 2026-07): achievements, level-ups, and the
    // neutral churn quips already have their own confirmation — the Awards modal +
    // "new" badge, the Team star-pop, and low-stakes ambient flavor respectively —
    // so a transient toast on top just trains players to ignore toasts. Route those
    // to the log-only channel (their fx/haptics below are UNCHANGED); keep toasts
    // for the beats that genuinely want the screen: milestones, shipped versions,
    // discoveries, and bad ops events.
    const logOnly = notice.kind === "achievement" || notice.kind === "levelup" || notice.tone === "neutral";
    if (logOnly) logEvent(notice.message, notice.tone);
    else pushToast(notice.message, notice.tone);
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
          fxBurst(cx, cy, { count: 22, power: 1.1, colors: [...FX_PALETTES.achievement] });
        }
      }
      else {
        haptics.celebrate(); sound.success();
        // A milestone is a chase-ladder payoff — bloom gold from the screen centre.
        if (notice.kind === "milestone" && !reducedMotion) {
          fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 30, power: 1.6, colors: [...FX_PALETTES.win] });
        }
        // A specialist levelling up gets a small gold star-pop near the Team tab.
        if (notice.kind === "levelup" && !reducedMotion) {
          const team = Array.from(document.querySelectorAll(".botnav-lbl")).find((n) => n.textContent === "Team")?.parentElement;
          const r = team?.getBoundingClientRect();
          const cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
          const cy = r ? r.top + r.height / 2 : window.innerHeight * 0.5;
          fxBurst(cx, cy, { count: 18, power: 1.1, colors: [...FX_PALETTES.win] });
        }
      }
    }
    else if (notice.tone === "bad") { haptics.warn(); sound.alert(); }
    else haptics.tap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.key]);

  // (Staleness "falling behind rivals" was ALSO a one-time "bad" toast here — removed as
  // redundant noise. The same qf<0.5 condition is already surfaced, more calmly and
  // persistently, by the advisor chip (a tappable wayfinder → Products) and the Products
  // tab attention badge, with ambient churn quips for flavor. One alert channel, not four.)

  // Incident "all clear": when the last active BAD modifier resolves (burns out or is
  // worked to zero), a bright two-note resolve confirms it — the problem you were
  // tapping actually ENDED. A prestige wipe isn't a win, so ships must be unchanged.
  const prevBadIncidents = useRef<Set<string>>(new Set());
  const incidentsSynced = useRef(false);
  useEffect(() => {
    if (!initialized) return;
    const now = new Set(game.modifiers.filter((m) => m.tone === "bad" && m.remainingSec > 0).map((m) => m.id));
    const before = prevBadIncidents.current;
    if (incidentsSynced.current && before.size > 0 && now.size === 0 && game.prestige.ships === prevShips.current) {
      sound.incidentCleared();
      logEvent("All clear — the incident burned out.", "good");
    }
    prevBadIncidents.current = now;
    incidentsSynced.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.modifiers, initialized]);

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
      const ascended = game.stats.ascensions > prevAscensions.current;
      resetHistory(); // the new generation's sparklines start from its own floor
      setCelebration({ gained, total: game.prestige.legacyWeights, report, ascended });
      if (ascended) haptics.epic(); else haptics.celebrate();
      // Game Center: push the career totals (silent no-op without the plugin).
      void gameCenterSubmitScores(game);
      // The flagship you just shipped is waiting as a free-to-launch product —
      // make sure the player knows (a ship that "gave nothing" was the #1 confusion).
      if (game.products.drafts.length > 0) {
        pushToast(modelReadyNote(game.prestige.ships), "good");
      }
      // An AGI ascension (a ship in the Post-Singularity era) gets the grander beat:
      // the ascend fanfare + a gold screen flash + a big central particle bloom.
      if (ascended) {
        sound.ascend();
        setFlash((k) => k + 1);
        if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight / 2, { count: 48, power: 2.2, colors: [...FX_PALETTES.epic] });
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
    // Confirm the claim in words — the confetti was pretty but wordless. Vary the line
    // by local day so returning tomorrow reads as a fresh day, not a repeat.
    const pct = Math.round((balance.daily.factor - 1) * 100);
    const min = Math.round(balance.daily.durationSec / 60);
    const quip = DAILY_QUIPS[Math.floor(Date.now() / 86_400_000) % DAILY_QUIPS.length]!;
    logEvent(`${quip} · +${pct}% output for ${min} min`, "good");
    if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight * 0.32, { count: 30, power: 1.5, colors: [...FX_PALETTES.brand] });
  };
  // Hardware buys float the rate you actually gained ("+120/s") at the tap point —
  // seeing the number go up IS the reward. Derived before/after the synchronous
  // action; only rate-moving buys float (power/floor purchases stay quiet).
  const onBuy = (id: string, count = 1, at?: { x: number; y: number }) => {
    // Bigger batches get the heavier success haptic — a Max buy should feel weightier
    // than a single tap. (Haptics no-op when the setting is off, like the rest of fx.)
    if (count >= 10) haptics.success(); else haptics.tap();
    sound.purchase();
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
  const onHireCandidate = (i: number) => {
    // Capture the candidate BEFORE the hire (doHireCandidate removes them). A named
    // person joining used to be silent — now they get a welcome-aboard beat.
    const c = useGame.getState().candidates?.[i];
    // Only celebrate a hire that actually happened — a stale tap on an unaffordable
    // candidate must not buzz + play the purchase chime for a phantom signing.
    if (!doHireCandidate(i)) { haptics.warn(); return; }
    haptics.celebrate(); sound.purchase();
    if (c) logEvent(hireWelcome(c.name, c.roleId), "good");
  };
  const onTrain = (id: string) => { haptics.tap(); sound.tap(); doTrainEmployee(id); };
  const onAssignEmp = (id: string, productId: string | null) => { haptics.tap(); doAssignEmployeeToProduct(id, productId); };
  const onFire = (id: string) => {
    // Look up the person before they're gone, then give them a send-off (was silent).
    const e = game.employees.find((x) => x.id === id);
    haptics.tap(); doFireEmployee(id);
    if (e) logEvent(fireSendoff(e.name, e.roleId), "neutral");
  };
  const onBuyPerk = (id: string) => {
    // Surface WHAT you bought — office perks have satirical copy that was never shown.
    const perk = canBuyOfficePerk(game, id) ? balance.office.perks.find((p) => p.id === id) : null;
    haptics.tap(); sound.purchase(); doBuyOfficePerk(id);
    if (perk) logEvent(`${perk.name} — ${perk.desc}`, "good");
  };
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
    if (p && !p.upgrade) logEvent(researchStartNote(p.name, p.version + 1), "neutral");
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
    logEvent(soldNote(p.name, fmtMoney(Big.of(Math.round(payout)))), "neutral");
  };
  const onClaimContract = (id: string, rep: number, title: string) => {
    doClaimContract(id);
    haptics.celebrate(); sound.success();
    // Name the deliverable and vary the framing so a claim reads like closing a
    // real contract, not a generic "+Rep" ping. Stable per contract (hash the id).
    const quip = CONTRACT_DONE_QUIPS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CONTRACT_DONE_QUIPS.length]!;
    logEvent(`${quip}: "${title}" · +${rep} Lab Reputation`, "good");
    if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 24, power: 1.3, colors: [...FX_PALETTES.win] });
  };
  const onFundChallenge = (id: string, at?: { x: number; y: number }) => {
    const completed = doFundChallenge(id);
    if (completed) {
      // The moonshot's tentpole payoff — a full-screen moment with its lore + reward,
      // plus a central bloom and the achievement chord. Earned once, ever, per challenge.
      haptics.celebrate(); sound.achievement();
      setChallengeDoneId(id);
      if (!reducedMotion) fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 40, power: 1.8, colors: [...FX_PALETTES.brand, "#fff"] });
    } else {
      // A contribution: light feedback + a floater at the tap so the resource drain reads
      // as progress in place (no toast — the bar animating is the confirmation).
      haptics.tap(); sound.purchase();
      if (at && !reducedMotion) fxFloat(at.x, at.y - 6, "funded", "#7c5cff", 14);
    }
  };
  const onToggleAutomation = (id: string) => { haptics.tap(); sound.tap(); doToggleAutomation(id); };
  const onClaimObjective = (id: string, target?: "computeMult" | "dataMult" | "moneyMult", at?: { x: number; y: number }) => {
    doClaimObjective(id, target);
    // Juice at the tap: a small burst + a satisfied chord. The reward itself is visible
    // in place (resources tick up for a windfall, a boost chip appears in the bar) — no
    // toast needed, keeping the frequent early/mid claims clean.
    haptics.celebrate(); sound.success();
    if (at && !reducedMotion) fxBurst(at.x, at.y, { count: 16, power: 1.1, colors: [...FX_PALETTES.brand] });
  };
  const onResearch = (id: string) => {
    haptics.tap(); sound.purchase();
    const had = game.research.includes(id);
    doResearch(id);
    // Surface the node's satirical flavor as a breakthrough toast — completing research
    // used to be silent. Only on a REAL new unlock (doResearch no-ops if unaffordable).
    if (!had && useGame.getState().game.research.includes(id)) {
      // Skip the flavor toast on the VERY FIRST research: that same tap already fires the
      // "Data Market / path to shipping unlocked" transition toasts, and a third on top
      // read as a burst for a brand-new player. Later breakthroughs keep their flavor.
      const def = balance.research.find((r) => r.id === id);
      if (def && useGame.getState().game.research.length > 1) logEvent(`Breakthrough: ${def.name} — ${def.desc}`, "good");
    }
  };
  const onBuyData = (id: string, at?: { x: number; y: number }) => {
    const outcome = doBuyData(id);
    if (!outcome) return;
    // Buying data is a repeatable grind — a toast on every tap was the game's most
    // reproducible spam. Clean hauls now float "+X data" at the tap point (exactly like
    // hardware buys), quiet and in-place; only the raid/poison STING keeps its interrupt.
    if (outcome.kind === "clean") {
      haptics.success();
      sound.success();
      if (at) fxFloat(at.x, at.y - 6, `+${fmt(outcome.dataGained)} data`, "#9b51e0", 15);
    } else {
      pushToast(outcome.message, "bad");
      haptics.warn();
      sound.alert();
    }
  };

  return (
    <div className={`app${reducedMotion ? " reduce-motion" : ""}${booted ? " app-booted" : ""}${tab === "lab" && section === "build" ? " app-split" : ""}`}>
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
        status={regulatorIsNamed(game) ? [{ key: "regulator", label: `${regulatorState(game).name}: ${regulatorState(game).label}`, tone: "bad" as const }] : []}
        workShaveSec={balance.worldEvents.workShaveSec}
        onWork={(id) => {
          // Accessible twin of tapping the incident in the hall (HallCanvas): shave a
          // bounded slice off a bad modifier, once. Same feedback as a claim.
          haptics.tap(); sound.tap();
          useGame.getState().doWorkProblem(id);
        }}
      />

      <main className="stage">
        {/* One fixed-height notice slot, ALWAYS rendered, showing exactly one
            strip (daily > advisor nudge > goal carrot). Strips appearing and
            vanishing must never shove the section tabs / hall / buttons below —
            the slot reserves the space, only its content swaps. */}
        <div className="notice-slot">
          {firstSteps ? null : dailyOn ? (
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
            derived={d}
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
            onSetFlagship={(id) => { haptics.tap(); sound.tap(); doSetFlagship(id); }}
            onCounterRival={(name) => {
              if (!doCounterRival(name)) return;
              haptics.success(); sound.alert();
              logEvent(`Press blitz lands on ${name} — their comms team scrambles.`, "good");
            }}
            onPlaceStake={(name) => {
              doPlaceStake(name);
              haptics.tap(); sound.tap();
              logEvent(`Stake placed: outrank ${name} by your next ship for +${stakePayout(name)} Rep.`, "good");
            }}
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
                    ? <span className="tab-dot ship-pulse" role="status" aria-label="Ship ready" />
                    : labAttention.hq > 0 && <span className="tab-dot">{labAttention.hq}</span>}
                </button>
              </nav>
            )}
            {section === "build" && (
              <>
                {/* iPad split (IMPROVEMENTS #22): on wide screens these two
                    wrappers become grid columns — the hall + core loop stays
                    put on the left while the buy panels scroll on the right.
                    On phones they're display:contents, so the DOM change is
                    layout-invisible (same flat stage as before). */}
                <div className="stage-left">
                  <HallCanvas onExpand={setPendingExpansion} />
                  {!firstSteps && <NewsTicker />}
                  {firstSteps && <FirstSteps game={game} />}
                  <TrainingDock game={game} derived={d} onStart={onStart} onClaim={onClaim} onSetFocus={setComputeFocus} />
                </div>
                <div className="stage-right">
                  {objectivesUnlocked(game) && <ObjectivesPanel game={game} onClaim={onClaimObjective} />}
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
                </div>
              </>
            )}
            {section === "research" && (
              <>
                {showResearch && <ResearchPanel game={game} derived={d} onResearch={onResearch} onBuyPreprint={() => { haptics.success(); sound.purchase(); doBuyPreprint(); }} />}
                {paradigmsUnlocked(game) && <ParadigmPanel game={game} onBuy={(id) => { haptics.celebrate(); sound.purchase(); doBuyParadigm(id); }} />}
                {showMarket && <DataMarketPanel game={game} onBuyData={onBuyData} onBuyTool={onBuy} onLobby={() => { haptics.tap(); sound.purchase(); doLobby(); }} />}
              </>
            )}
            {section === "hq" && (
              <>
                {showPrestige && <PrestigePanel game={game} onPrestige={doPrestige} onBuyReputationPerk={(id) => { haptics.success(); sound.purchase(); doBuyReputationPerk(id); }} onBuyEndowment={() => { haptics.celebrate(); sound.purchase(); doBuyEndowment(); }} onPickDirective={(id) => { haptics.celebrate(); sound.purchase(); doPickDirective(id); }}             onRespecDirective={(id) => { doRespecDirective(id); haptics.tap(); sound.tap(); }} onBuyLegacyPerk={(id) => { haptics.success(); sound.purchase(); doBuyLegacyPerk(id); }} />}
                {showResearch && <ContractsPanel game={game} onClaim={onClaimContract} onClaimSponsor={() => { haptics.success(); sound.success(); doClaimSponsor(); }} />}
                {automationUnlockedAny(game) && <AutomationPanel game={game} onToggle={onToggleAutomation} />}
                {challengesUnlocked(game) && <GrandChallengesPanel game={game} onFund={onFundChallenge} onChooseFork={(id, forkId) => { haptics.celebrate(); sound.purchase(); doChooseFork(id, forkId); }} onFundMegaproject={(at) => { const done = doFundMegaproject(); if (done) { haptics.epic(); sound.megaproject(); if (at) fxBurst(at.x, at.y, { count: 26, power: 1.4, colors: [...FX_PALETTES.epic] }); } else { haptics.tap(); sound.tap(); } }} />}
                {trialsUnlocked(game) && (
                  <Collapsible title="Trials" defaultOpen={!!game.activeTrial} badge={game.activeTrial ? "running" : `${trialsDoneCount(game)}/${trialsTotal}`}>
                    <TrialsPanel
                      game={game}
                      onStart={(id) => { haptics.success(); sound.tap(); doStartTrial(id); }}
                      onAbandon={() => { haptics.tap(); doAbandonTrial(); }}
                    />
                  </Collapsible>
                )}
                {doctrineUnlocked(game) && (
                  <Collapsible title="Doctrine" badge={`${doctrineDoneCount(game)}/${doctrineTotal}`}>
                    <DoctrinePanel game={game} onClaim={(id) => { haptics.celebrate(); sound.success(); doClaimDoctrine(id); }} />
                  </Collapsible>
                )}
                {instituteUnlocked(game) && (
                  <Collapsible title="The Institute" defaultOpen={grantsAvailable(game) > 0} badge={grantsAvailable(game) > 0 ? `${grantsAvailable(game)} grants` : "founded"}>
                    <InstitutePanel game={game} onBuy={(id) => { haptics.celebrate(); sound.institute(); doBuyInstitute(id); }} />
                  </Collapsible>
                )}
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
        <button className={`botnav-item ${tab === "lab" ? "on" : ""} ${shipReady && tab !== "lab" ? "ship-ready" : ""}`} aria-current={tab === "lab" ? "page" : undefined} aria-label={shipReady && tab !== "lab" ? "Lab — ready to ship" : undefined} onClick={() => { haptics.tap(); if (shipReady && tab !== "lab") goSection("hq"); goTab("lab"); }}>
          <span className="botnav-ic"><FlaskIcon size={23} /></span><span className="botnav-lbl">Lab</span>
          {/* Ship-ready is signalled AMBIENTLY here by the pulsing icon (the
              `ship-ready` class) — the word "Ship" was a redundant text badge on
              the SAME button (de-noising audit 2026-07: ambient over text, per
              CLAUDE.md). The value framing + wayfinding still live in the advisor
              chip and the HQ "Ship" pill; screen readers get the aria-label above.
              The numeric attention badge still surfaces other pulls in the Lab. */}
          {attention.lab > 0 && <span className="botnav-badge">{attention.lab}</span>}
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
        <button className="botnav-item" onClick={() => { haptics.tap(); markAchievementsSeen(game.achievements.length); setShowAchievements(true); }} aria-label="Achievements">
          <span className="botnav-ic"><TrophyIcon size={23} /></span><span className="botnav-lbl">Awards</span>
          {/* Badge = NEW unlocks since the modal was last opened, matching the
              other badges' "needs you" semantics (a lifetime total here just
              trained players to ignore badges everywhere). */}
          {game.achievements.length > achievementsSeen && <span className="botnav-badge alt">{game.achievements.length - achievementsSeen}</span>}
        </button>
        <button className="botnav-item" onClick={() => { haptics.tap(); setShowSettings(true); }} aria-label="Settings">
          <span className="botnav-ic"><GearIcon size={22} /></span><span className="botnav-lbl">More</span>
        </button>
      </nav>

      {/* MOMENT QUEUE: the full-screen moments render ONE at a time, by priority
          (offline recap > ship celebration > era transition > grand-challenge
          complete > product launch > world event). Each keeps its own state;
          dismissing one lets the next in line show. Replaces pairwise !x guards —
          any same-tick combination now sequences instead of stacking. */}
      {moment === "offline" && offline && <OfflineModal summary={offline} onClose={dismissOffline} />}
      {moment === "celebration" && celebration && (
        <Celebration
          weightsGained={celebration.gained}
          totalWeights={celebration.total}
          report={celebration.report}
          ascended={celebration.ascended === true}
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
      {moment === "challenge" && challengeDoneId && challengeById.get(challengeDoneId) && (
        <ChallengeComplete challenge={challengeById.get(challengeDoneId)!} onDone={() => setChallengeDoneId(null)} />
      )}
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
      {moment === "era" && eraMoment !== null && <EraTransition era={eraMoment} blurbSeed={game.prestige.ships} onDone={() => setEraMoment(null)} />}
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
          onChoose={(i) => {
            haptics.tap(); sound.tap();
            // Confirm the decision + its consequence. Matters most for instant
            // resource grants, which (unlike timed buffs) leave no modifier-bar
            // trace — so without this the high-agency choice had zero feedback.
            const choice = worldEvent.choices?.[i];
            chooseWorldEvent(i);
            if (choice) {
              const decision = choice.label.replace(/\s*\([^)]*\)\s*$/, "");
              pushToast(choice.summary ? `${decision} — ${choice.summary}` : `Decided: ${decision}`, "good");
            }
          }}
        />
      )}
      {/* One-time "what does Shipping do" explainer, shown the first time a ship
          is ready (persisted in settings — the scariest button in the game
          deserves one screen before it's pressed). */}
      {moment === null && showShipExplainer && game.prestige.ships === 0 && (
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
      {/* Onboarding waits for a clear stage: any full-screen moment (offline,
          launch, celebration…) plays first — never two overlays stacked. */}
      {!onboarded && moment === null && <Onboarding onDone={completeOnboarding} />}
      <ToastStack toasts={toasts} onDone={dropToast} />
      <FxCanvas reducedMotion={reducedMotion} />
      {flash > 0 && !reducedMotion && <div key={flash} className="screen-flash" aria-hidden="true" onAnimationEnd={() => setFlash(0)} />}
    </div>
  );
}
