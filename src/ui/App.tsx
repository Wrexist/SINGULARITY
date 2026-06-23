import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { Big } from "../engine/math/Big";
import { haptics } from "./haptics";
import { ResourceBar } from "./ResourceBar";
import { TrainingDock } from "./TrainingDock";
import { UpgradePanel } from "./UpgradePanel";
import { ResearchPanel } from "./ResearchPanel";
import { PrestigePanel } from "./PrestigePanel";
import { OfflineModal } from "./OfflineModal";
import { Celebration } from "./Celebration";

export function App() {
  useGameLoop();
  const game = useGame((s) => s.game);
  const offline = useGame((s) => s.offline);
  const { doStartRun, doClaim, doBuyUpgrade, doResearch, doPrestige, dismissOffline, hardReset } =
    useGame.getState();

  const d = derive(game);

  // Detect a ship (prestige) and fire the celebration moment + haptics.
  const prevShips = useRef(game.prestige.ships);
  const prevWeights = useRef<Big>(game.prestige.legacyWeights);
  const [celebration, setCelebration] = useState<{ gained: Big; total: Big } | null>(null);
  useEffect(() => {
    if (game.prestige.ships > prevShips.current) {
      const gained = game.prestige.legacyWeights.sub(prevWeights.current);
      setCelebration({ gained, total: game.prestige.legacyWeights });
      haptics.celebrate();
    }
    prevShips.current = game.prestige.ships;
    prevWeights.current = game.prestige.legacyWeights;
  }, [game.prestige.ships, game.prestige.legacyWeights]);

  // Action handlers wrapped with tactile feedback.
  const onStart = () => { haptics.tap(); doStartRun(); };
  const onClaim = () => { haptics.success(); doClaim(); };
  const onBuy = (id: string) => { haptics.tap(); doBuyUpgrade(id); };
  const onResearch = (id: string) => { haptics.tap(); doResearch(id); };

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true">
        <span className="blob blob-a" />
        <span className="blob blob-b" />
        <span className="blob blob-c" />
      </div>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <h1>Singularity Inc.</h1>
        </div>
        <span className="phase-tag">prototype</span>
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
        <ResearchPanel game={game} onResearch={onResearch} />
        <PrestigePanel game={game} onPrestige={doPrestige} />

        <footer className="footer">
          <button className="link-btn" onClick={() => { if (confirm("Wipe save and restart?")) hardReset(); }}>
            reset save
          </button>
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
    </div>
  );
}
