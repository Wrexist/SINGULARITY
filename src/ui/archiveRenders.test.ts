import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { installMiniDom, uninstallMiniDom, type MiniElement } from "./miniDom";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/**
 * GOALS > Collection > The Archive lists every generation the log keeps (up to
 * shipLogCap, 60) at ~25 elements a row. It read only the ship log, but it took the
 * whole `game` and re-rendered all of it on every 10Hz tick while open. It now
 * renders when the log changes (a Ship), and a tick leaves it alone.
 */

type Fiber = { child: Fiber | null; sibling: Fiber | null; type: unknown; memoizedProps: Record<string, unknown> | null };
const seenProps = new WeakSet<object>();
let rowRenders = 0;
const isRow = (f: Fiber) => f.type === "div" && typeof f.memoizedProps?.className === "string"
  && /^archive-row( |$)/.test(f.memoizedProps.className as string);
function countCommit(root: { current: Fiber }) {
  const stack: Fiber[] = [root.current];
  while (stack.length) {
    const f = stack.pop()!;
    if (isRow(f) && f.memoizedProps && !seenProps.has(f.memoizedProps)) { seenProps.add(f.memoizedProps); rowRenders++; }
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
}

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ArchiveBoard: typeof import("./ArchiveBoard").ArchiveBoard;
let useGame: typeof import("../state/store").useGame;
let container: MiniElement;

beforeAll(async () => {
  installMiniDom();
  // React DevTools' own hook: react-dom reports every commit to it.
  (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject: () => 1, checkDCE: () => {}, onScheduleFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => countCommit(root),
    onCommitFiberUnmount: () => {}, onPostCommitFiberRoot: () => {},
  };
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  ({ ArchiveBoard } = await import("./ArchiveBoard"));
  ({ useGame } = await import("../state/store"));
});

let mounted: import("react-dom/client").Root | null = null;
afterEach(() => { if (mounted) { const r = mounted; mounted = null; React.act(() => r.unmount()); } });
afterAll(() => uninstallMiniDom());

function careerLab(): GameState {
  const s = createInitialState();
  s.research = ["backprop"];
  s.resources = { compute: Big.of(1e6), data: Big.of(1e6), money: Big.of(1e9) };
  s.upgrades = { ...s.upgrades, rack_basic: 5 };
  const n = balance.prestige.shipLogCap;
  s.prestige = { ...s.prestige, ships: n };
  s.stats = { ...s.stats, totalShips: n };
  s.shipLog = Array.from({ length: n }, (_, i) => ({
    mode: "deploy", era: 1, asc: false, gen: i + 1, legacyMag: 1 + i * 0.1, peakComputeMag: 5 + i * 0.2,
    research: 10, products: 1, staff: 2, atSec: 1000 * (i + 1),
  }));
  return s;
}

describe("the Archive while the game ticks", () => {
  it("does not re-render its rows when no generation was shipped", () => {
    useGame.setState({ game: careerLab(), candidates: null, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    function Host() {
      const game = useGame((s) => s.game);
      return React.createElement(ArchiveBoard, { game });
    }
    container = installMiniDom();
    const root = createRoot(container as unknown as Element);
    React.act(() => root.render(React.createElement(Host)));
    mounted = root;
    const rows = () => {
      let n = 0;
      const walk = (el: MiniElement) => { for (const c of el.childNodes as MiniElement[]) if (c.nodeType === 1) { if (/^archive-row( |$)/.test(c.getAttribute("class") ?? "")) n++; walk(c); } };
      walk(container);
      return n;
    };
    expect(rows()).toBe(balance.prestige.shipLogCap);
    const before = useGame.getState().game;
    rowRenders = 0;
    for (let k = 0; k < 20; k++) React.act(() => useGame.getState().advance(100));
    expect(useGame.getState().game).not.toBe(before); // the lab really ticked
    expect(rowRenders).toBe(0);

    // A new generation on the log still shows up.
    React.act(() => useGame.setState((st) => ({ game: { ...st.game, shipLog: [...st.game.shipLog.slice(1), { mode: "sell", era: 2, asc: true, gen: 61 }] } })));
    expect(rows()).toBe(balance.prestige.shipLogCap);
    expect(container.textContent).toContain("Gen 61");
  });
});
