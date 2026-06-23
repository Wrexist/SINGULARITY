import { useEffect, useRef, useState } from "react";
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
import { canPrestige } from "../engine/prestige";

export function App() {
  useGameLoop();
  const game = useGame((s) => s.game);
  const offline = useGame((s) => s.offline);
  const initialized = useGame((s) => s.initialized);
  const { doStartRun, doClaim, doBuyUpgrade, doResearch, doPrestige, dismissOffline, hardReset } =
    useGame.getState();

  const d = derive(game);

  // Detect a ship (prestige) and fire the celebration moment + haptics.
  const prevShips = useRef(game.prestige.ships);
  const prevWeights = useRef<Big>(game.prestige.legacyWeights);
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const onboarded = useSettings((s) => s.onboarded);
  const completeOnboarding = useSettings((s) => s.completeOnboarding);

  // Progressive disclosure (reveal depth in waves — GDD): Research appears after
  // your first payout (you need Data to research); Prestige once you're on the path.
  const showResearch = game.resources.data.gt(0) || game.research.length > 0;
  const showPrestige = game.research.length > 0;
  const shipReady = canPrestige(game);

  // Transient unlock toasts.
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);
  const pushToast = (text: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((ts) => [...ts, { id, text }]);
  };
  const dropToast = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));
  const seenResearch = useRef(showResearch);
  const seenPrestige = useRef(showPrestige);
  const seenShipReady = useRef(shipReady);
  const syncedToSave = useRef(false);
  useEffect(() => {
    // Wait for the save to hydrate, then sync the "seen" baseline once so we
    // don't toast unlocks the player already had on a returning load.
    if (!initialized) return;
    if (!syncedToSave.current) {
      seenResearch.current = showResearch;
      seenPrestige.current = showPrestige;
      seenShipReady.current = shipReady;
      syncedToSave.current = true;
      return;
    }
    if (showResearch && !seenResearch.current) pushToast("🔬 Research unlocked");
    if (showPrestige && !seenPrestige.current) pushToast("🚀 The path to shipping is open");
    if (shipReady && !seenShipReady.current) pushToast("✨ You can Ship the Model!");
    seenResearch.current = showResearch;
    seenPrestige.current = showPrestige;
    seenShipReady.current = shipReady;
  }, [initialized, showResearch, showPrestige, shipReady]);

  useEffect(() => {
    if (game.prestige.ships > prevShips.current) {
      const gained = game.prestige.legacyWeights.sub(prevWeights.current);
      setCelebration({ gained, total: game.prestige.legacyWeights });
      haptics.celebrate();
      sound.ship();
    }
    prevShips.current = game.prestige.ships;
    prevWeights.current = game.prestige.legacyWeights;
  }, [game.prestige.ships, game.prestige.legacyWeights]);

  // Action handlers wrapped with tactile + audio feedback.
  const onStart = () => { haptics.tap(); sound.tap(); doStartRun(); };
  const onClaim = () => { haptics.success(); sound.success(); doClaim(); };
  const onBuy = (id: string) => { haptics.tap(); sound.purchase(); doBuyUpgrade(id); };
  const onResearch = (id: string) => { haptics.tap(); sound.purchase(); doResearch(id); };

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
        moneyRate={d.passiveMoneyPerSec}
      />

      <main className="stage">
        <TrainingDock game={game} derived={d} onStart={onStart} onClaim={onClaim} />
        <UpgradePanel game={game} onBuy={onBuy} />
        {showResearch && <ResearchPanel game={game} onResearch={onResearch} />}
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
      {!onboarded && !offline && <Onboarding onDone={completeOnboarding} />}
      <ToastStack toasts={toasts} onDone={dropToast} />
    </div>
  );
}
