import { useGame } from "../state/store";
import { useGameLoop } from "../state/useGameLoop";
import { derive } from "../engine/derive";
import { ResourceBar } from "./ResourceBar";
import { TrainingDock } from "./TrainingDock";
import { UpgradePanel } from "./UpgradePanel";
import { ResearchPanel } from "./ResearchPanel";
import { PrestigePanel } from "./PrestigePanel";
import { OfflineModal } from "./OfflineModal";

export function App() {
  useGameLoop();
  const game = useGame((s) => s.game);
  const offline = useGame((s) => s.offline);
  const { doStartRun, doClaim, doBuyUpgrade, doResearch, doPrestige, dismissOffline, hardReset } =
    useGame.getState();

  const d = derive(game);

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
        <TrainingDock game={game} derived={d} onStart={doStartRun} onClaim={doClaim} />
        <UpgradePanel game={game} onBuy={doBuyUpgrade} />
        <ResearchPanel game={game} onResearch={doResearch} />
        <PrestigePanel game={game} onPrestige={doPrestige} />

        <footer className="footer">
          <button className="link-btn" onClick={() => { if (confirm("Wipe save and restart?")) hardReset(); }}>
            reset save
          </button>
        </footer>
      </main>

      {offline && <OfflineModal summary={offline} onClose={dismissOffline} />}
    </div>
  );
}
