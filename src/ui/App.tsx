import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { useSettings } from "./settings";
import { GearIcon } from "./Icons";
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
import { StaffPanel } from "./StaffPanel";
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
  const worldEvent = useGame((s) => s.worldEvent);
  const { doStartRun, doClaim, doBuyUpgrade, doHireStaff, doResearch, doBuyData, doPrestige, dismissOffline, dismissWorldEvent, hardReset } =
    useGame.getState();

  const d = derive(game);

  // Detect a ship (prestige) and fire the celebration moment + haptics.
  const prevShips = useRef(game.prestige.ships);
  const prevWeights = useRef<Big>(game.prestige.legacyWeights);
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big } | null>(null);
  const [eraMoment, setEraMoment] = useState<number | null>(null);
  const [pendingExpansion, setPendingExpansion] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);

  // Progressive disclosure (reveal depth in waves — GDD): Research appears after
  // your first payout (you need Data to research); Prestige once you're on the path.
  const showResearch = game.resources.data.gt(0) || game.research.length > 0;
  const showPrestige = game.research.length > 0;
  const showMarket = game.research.length > 0;
  const showStaff = balance.staff.enabled && game.research.length >= balance.staff.revealAtResearch;
  const shipReady = canPrestige(game);
  const era = currentEra(game);

  // Transient unlock toasts.
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);
  // Cap the stack so a burst of simultaneous unlocks can't bury the screen
  // (keep the most recent few). Stable identities so child timers don't reset.
  const MAX_TOASTS = 3;
  const pushToast = useCallback((text: string, tone: ToastData["tone"] = "neutral") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((ts) => [...ts, { id, text, tone }].slice(-MAX_TOASTS));
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
    if (era > seenEra.current) { setEraMoment(era); haptics.celebrate(); sound.ship(); }
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

  const syncedShips = useRef(false);
  useEffect(() => {
    // Guard against the empty→loaded hydration: a returning player with ships>0
    // must NOT see a "Model Shipped" celebration on every launch.
    if (!initialized) return;
    if (!syncedShips.current) {
      prevShips.current = game.prestige.ships;
      prevWeights.current = game.prestige.legacyWeights;
      syncedShips.current = true;
      return;
    }
    if (game.prestige.ships > prevShips.current) {
      const gained = game.prestige.legacyWeights.sub(prevWeights.current);
      setCelebration({ gained, total: game.prestige.legacyWeights });
      haptics.celebrate();
      sound.ship();
    }
    prevShips.current = game.prestige.ships;
    prevWeights.current = game.prestige.legacyWeights;
  }, [initialized, game.prestige.ships, game.prestige.legacyWeights]);

  // Action handlers wrapped with tactile + audio feedback.
  const onStart = () => { haptics.tap(); sound.tap(); doStartRun(); };
  const onClaim = () => { haptics.success(); sound.success(); doClaim(); };
  const onBuy = (id: string) => { haptics.tap(); sound.purchase(); doBuyUpgrade(id); };
  const onHire = (id: string) => { haptics.tap(); sound.purchase(); doHireStaff(id); };
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
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
          <GearIcon />
        </button>
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
        <HallCanvas onExpand={setPendingExpansion} />
        <TrainingDock game={game} derived={d} onStart={onStart} onClaim={onClaim} />
        <UpgradePanel game={game} onBuy={onBuy} />
        {showResearch && <ResearchPanel game={game} onResearch={onResearch} />}
        {showStaff && <StaffPanel game={game} derived={d} onHire={onHire} />}
        {showMarket && <DataMarketPanel game={game} onBuyData={onBuyData} onBuyTool={onBuy} />}
        {showPrestige && <PrestigePanel game={game} onPrestige={doPrestige} />}
        <StatsPanel game={game} derived={d} />

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

      {offline && <OfflineModal summary={offline} onClose={dismissOffline} />}
      {celebration && (
        <Celebration
          weightsGained={celebration.gained}
          totalWeights={celebration.total}
          onDone={() => setCelebration(null)}
        />
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      {pendingExpansion && (
        <ExpandConfirm
          id={pendingExpansion}
          onConfirm={() => { onBuy(pendingExpansion); setPendingExpansion(null); }}
          onDecline={() => setPendingExpansion(null)}
        />
      )}
      {eraMoment !== null && <EraTransition era={eraMoment} onDone={() => setEraMoment(null)} />}
      {worldEvent && <WorldEventCard event={worldEvent} onDismiss={dismissWorldEvent} />}
      {!onboarded && !offline && <Onboarding onDone={completeOnboarding} />}
      <ToastStack toasts={toasts} onDone={dropToast} />
    </div>
  );
}
