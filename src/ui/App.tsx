import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { useSettings } from "./settings";
import { ResourceBar } from "./ResourceBar";
import { TrainingDock } from "./TrainingDock";
import { UpgradePanel } from "./UpgradePanel";
import { ResearchPanel } from "./ResearchPanel";
import { PrestigePanel } from "./PrestigePanel";
import { OfflineModal } from "./OfflineModal";
import { Celebration } from "./Celebration";
import { SettingsSheet } from "./SettingsSheet";
import { ToastStack, type ToastData } from "./Toast";
import { StatsPanel } from "./StatsPanel";
import { Tagline } from "./Tagline";
import { Onboarding } from "./Onboarding";
import { DataMarketPanel } from "./DataMarketPanel";
import { EmployeesPanel } from "./EmployeesPanel";
import { ProductsPanel } from "./ProductsPanel";
import { AchievementsModal } from "./AchievementsModal";
import { EventLog } from "./EventLog";
import { FxCanvas } from "./FxCanvas";
import { burst as fxBurst } from "./fx";
import { ProductLaunch } from "./ProductLaunch";
import { productsUnlocked, productMetrics, typeDef, retirePayout } from "../engine/products";
import { nextAction, attentionCounts } from "../engine/advisor";
import { fmtMoney } from "./format";
import type { ProductTypeId } from "../engine/balance/products";
import { iap } from "./iap";
import { balance } from "../engine/balance/config";
import { HallCanvas } from "./HallCanvas";
import { ExpandConfirm } from "./ExpandConfirm";
import { EraTransition } from "./EraTransition";
import { WorldEventCard } from "./WorldEventCard";
import { ModifierBar } from "./ModifierBar";
import { canPrestige } from "../engine/prestige";
import { currentEra } from "../engine/eras";

export function App() {
  useGameLoop();
  const game = useGame((s) => s.game);
  const offline = useGame((s) => s.offline);
  const initialized = useGame((s) => s.initialized);
  const event = useGame((s) => s.event);
  const notice = useGame((s) => s.notice);
  const worldEvent = useGame((s) => s.worldEvent);
  const candidates = useGame((s) => s.candidates);
  const { doStartRun, doClaim, doBuyUpgrade, doBuyOfficePerk, doBuyReputationPerk, doResearch, doBuyData, doPrestige, setComputeFocus,
    doRecruit, doRefreshCandidates, doCloseRecruit, doHireCandidate, doTrainEmployee, doAssignEmployeeToProduct, doFireEmployee,
    doLaunchDraft, doStartUpgrade, doSetProductPrice, doSetProductMarketing, doSetEnterprise, doSetEnterprisePrice, doSetChannelMix, doBuyFeature, doRenameProduct, doRetireProduct,
    dismissOffline, dismissWorldEvent, chooseWorldEvent, hardReset } =
    useGame.getState();

  const d = useMemo(() => derive(game), [game]);
  // Advisor: one "do this next" nudge + small per-tab attention counts. Memoized
  // per tick (same cadence as derive) — a handful of product checks, no clock.
  const advice = useMemo(() => nextAction(game), [game]);
  const attention = useMemo(() => attentionCounts(game), [game]);

  // Detect a ship (prestige) and fire the celebration moment + haptics.
  const prevShips = useRef(game.prestige.ships);
  const prevWeights = useRef<Big>(game.prestige.legacyWeights);
  const prevAscensions = useRef(game.stats.ascensions);
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big } | null>(null);
  const [eraMoment, setEraMoment] = useState<number | null>(null);
  const [launch, setLaunch] = useState<{ type: ProductTypeId; name: string } | null>(null);
  const [pendingExpansion, setPendingExpansion] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [flash, setFlash] = useState(0); // AGI ascension screen flash (key replays the anim)
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const music = useSettings((s) => s.music);
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);

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

  // Progressive disclosure (reveal depth in waves — GDD): Research appears after
  // your first payout (you need Data to research); Prestige once you're on the path.
  const showResearch = game.resources.data.gt(0) || game.research.length > 0;
  const showPrestige = game.research.length > 0;
  const showMarket = game.research.length > 0;
  const showStaff = balance.staff.enabled && game.research.length >= balance.staff.revealAtResearch;
  const showProducts = productsUnlocked(game);
  const [tab, setTab] = useState<"lab" | "products" | "employees">("lab");
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
  const seenResearch = useRef(showResearch);
  const seenPrestige = useRef(showPrestige);
  const seenMarket = useRef(showMarket);
  const seenShipReady = useRef(shipReady);
  const syncedToSave = useRef(false);
  useEffect(() => {
    // Wait for the save to hydrate, then sync the "seen" baseline once so we
    // don't toast unlocks the player already had on a returning load.
    if (!initialized) return;
    if (!syncedToSave.current) {
      seenResearch.current = showResearch;
      seenPrestige.current = showPrestige;
      seenMarket.current = showMarket;
      seenShipReady.current = shipReady;
      syncedToSave.current = true;
      return;
    }
    if (showResearch && !seenResearch.current) pushToast("🔬 Research unlocked");
    if (showMarket && !seenMarket.current) pushToast("🛒 Data Market unlocked");
    if (showPrestige && !seenPrestige.current) pushToast("🚀 The path to shipping is open");
    if (shipReady && !seenShipReady.current) pushToast("✨ You can Ship the Model!");
    seenResearch.current = showResearch;
    seenPrestige.current = showPrestige;
    seenMarket.current = showMarket;
    seenShipReady.current = shipReady;
  }, [initialized, showResearch, showPrestige, showMarket, shipReady]);

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
    // Achievement unlocks (🏅) get their own bright chime so they feel distinct.
    if (notice.tone === "good") {
      if (notice.message.startsWith("🏅")) {
        haptics.success(); sound.achievement();
        // Burst from the topbar trophy — "it went into your collection".
        const el = document.querySelector('[aria-label="Achievements"]');
        if (el) { const r = el.getBoundingClientRect(); fxBurst(r.left + r.width / 2, r.top + r.height / 2, { count: 22, power: 1.1, colors: ["#ff9f0a", "#ffd60a", "#9b51e0"] }); }
      }
      else {
        haptics.celebrate(); sound.success();
        // A milestone (🏆) is a chase-ladder payoff — bloom gold from the screen centre.
        if (notice.message.startsWith("🏆") && !reducedMotion) {
          fxBurst(window.innerWidth / 2, window.innerHeight * 0.4, { count: 30, power: 1.6, colors: ["#ff9f0a", "#ffd60a", "#16b364"] });
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
        pushToast(`📉 ${p.name} is falling behind rivals — push a new version`, "bad");
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
      setCelebration({ gained, total: game.prestige.legacyWeights });
      haptics.celebrate();
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
  const onBuy = (id: string) => { haptics.tap(); sound.purchase(); doBuyUpgrade(id); };
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
    if (p && !p.upgrade) pushToast(`🔬 ${p.name} — researching v${p.version + 1}…`, "neutral");
  };
  const onRetireProductFx = (id: string) => {
    const p = game.products.active.find((x) => x.id === id);
    if (!p) return;
    const payout = retirePayout(game, id);
    if (!window.confirm(`Sell ${p.name} for ${fmtMoney(Big.of(Math.round(payout)))}? This is permanent.`)) return;
    doRetireProduct(id);
    haptics.success(); sound.purchase();
    pushToast(`🏷️ Sold ${p.name} for ${fmtMoney(Big.of(Math.round(payout)))}`, "neutral");
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
          <span className="brand-mark" />
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
      <ModifierBar modifiers={game.modifiers} />

      <main className="stage">
        {advice && (
          <button
            className="advisor-bar"
            onClick={() => { haptics.tap(); setTab(advice.tab); }}
            aria-label={`Suggested next: ${advice.text}`}
          >
            <span className="advisor-icon">💡</span>
            <span className="advisor-text">{advice.text}</span>
            {advice.tab !== tab && <span className="advisor-go">{advice.tab === "lab" ? "Lab" : advice.tab === "products" ? "Products" : "Employees"} ▸</span>}
          </button>
        )}
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
            <HallCanvas onExpand={setPendingExpansion} />
            <TrainingDock game={game} derived={d} onStart={onStart} onClaim={onClaim} onSetFocus={setComputeFocus} />
            <UpgradePanel game={game} derived={d} onBuy={onBuy} />
            {showResearch && <ResearchPanel game={game} derived={d} onResearch={onResearch} />}
            {showMarket && <DataMarketPanel game={game} onBuyData={onBuyData} onBuyTool={onBuy} />}
            {showPrestige && <PrestigePanel game={game} onPrestige={doPrestige} onBuyReputationPerk={(id) => { haptics.success(); sound.purchase(); doBuyReputationPerk(id); }} />}
            <StatsPanel game={game} derived={d} />
            <EventLog log={log} />
          </>
        )}

        <footer className="footer">
          <button
            className="link-btn"
            onClick={() => { if (confirm("Wipe the save and start over? The investors will understand.")) hardReset(); }}
          >
            reset save
          </button>
          <span className="footer-flavor">Singularity Inc. — disrupting disruption since today.</span>
        </footer>
      </main>

      <nav className="botnav" role="tablist" aria-label="Primary">
        <button className={`botnav-item ${tab === "lab" ? "on" : ""}`} role="tab" aria-selected={tab === "lab"} onClick={() => { haptics.tap(); setTab("lab"); }}>
          <span className="botnav-ic">🧪</span><span className="botnav-lbl">Lab</span>
          {attention.lab > 0 && <span className="botnav-badge">{attention.lab}</span>}
        </button>
        {showProducts && (
          <button className={`botnav-item ${tab === "products" ? "on" : ""}`} role="tab" aria-selected={tab === "products"} onClick={() => { haptics.tap(); setTab("products"); }}>
            <span className="botnav-ic">📦</span><span className="botnav-lbl">Products</span>
            {attention.products > 0 && <span className="botnav-badge">{attention.products}</span>}
          </button>
        )}
        {showStaff && (
          <button className={`botnav-item ${tab === "employees" ? "on" : ""}`} role="tab" aria-selected={tab === "employees"} onClick={() => { haptics.tap(); setTab("employees"); }}>
            <span className="botnav-ic">👥</span><span className="botnav-lbl">Team</span>
            {attention.employees > 0 && <span className="botnav-badge">{attention.employees}</span>}
          </button>
        )}
        <button className="botnav-item" onClick={() => { haptics.tap(); setShowAchievements(true); }} aria-label="Achievements">
          <span className="botnav-ic">🏆</span><span className="botnav-lbl">Awards</span>
          {game.achievements.length > 0 && <span className="botnav-badge alt">{game.achievements.length}</span>}
        </button>
        <button className="botnav-item" onClick={() => { haptics.tap(); setShowSettings(true); }} aria-label="Settings">
          <span className="botnav-ic">⚙️</span><span className="botnav-lbl">More</span>
        </button>
      </nav>

      {offline && <OfflineModal summary={offline} onClose={dismissOffline} />}
      {celebration && (
        <Celebration
          weightsGained={celebration.gained}
          totalWeights={celebration.total}
          onDone={() => setCelebration(null)}
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
      {eraMoment !== null && <EraTransition era={eraMoment} onDone={() => setEraMoment(null)} />}
      {launch && (
        <ProductLaunch
          name={launch.name}
          typeName={typeDef(launch.type).name}
          onDone={() => setLaunch(null)}
        />
      )}
      {worldEvent && (
        <WorldEventCard
          event={worldEvent}
          onDismiss={dismissWorldEvent}
          onChoose={(i) => { haptics.tap(); sound.tap(); chooseWorldEvent(i); }}
        />
      )}
      {!onboarded && !offline && <Onboarding onDone={completeOnboarding} />}
      <ToastStack toasts={toasts} onDone={dropToast} />
      <FxCanvas reducedMotion={reducedMotion} />
      {flash > 0 && !reducedMotion && <div key={flash} className="screen-flash" aria-hidden="true" onAnimationEnd={() => setFlash(0)} />}
    </div>
  );
}
