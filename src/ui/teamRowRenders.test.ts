import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { installMiniDom, type MiniElement } from "./miniDom";
import { createInitialState } from "../engine/state";
import { Big } from "../engine/math/Big";
import { balance } from "../engine/balance/config";
import type { Employee, GameState, ProductState } from "../engine/types";

/**
 * The Team tab with a late-game roster. The store ticks at 10Hz and every tick hands
 * the panel a new `game`, but a person who is not training keeps the SAME Employee
 * object across ticks. Every person row used to re-render on every tick anyway (only
 * the avatar and the stars were memoized), and each row also ran `canTrain`, a scan
 * of the whole roster: at 512 staff the Team tab kept the main thread ~60% busy on a
 * throttled phone. A row now renders when its person (or its own open/selected
 * state) changes, and not because the money ticked.
 *
 * The count is taken the way React DevTools' "highlight updates" does it, through
 * the renderer's commit hook: a row's host element carries a new props object only
 * when the component that returned it ran again.
 */

type Fiber = { child: Fiber | null; sibling: Fiber | null; type: unknown; memoizedProps: Record<string, unknown> | null };
const seenProps = new WeakSet<object>();
let rowRenders = 0;
const isRow = (f: Fiber) => f.type === "div" && typeof f.memoizedProps?.className === "string"
  && /^emp-person( |$)/.test(f.memoizedProps.className as string);
function countCommit(root: { current: Fiber }) {
  const stack: Fiber[] = [root.current];
  while (stack.length) {
    const f = stack.pop()!;
    if (isRow(f) && f.memoizedProps && !seenProps.has(f.memoizedProps)) { seenProps.add(f.memoizedProps); rowRenders++; }
    if (f.child) stack.push(f.child);
    if (f.sibling) stack.push(f.sibling);
  }
}

let container: MiniElement;
let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let EmployeesPanel: typeof import("./EmployeesPanel").EmployeesPanel;
let useGame: typeof import("../state/store").useGame;
let derive: typeof import("../engine/derive").derive;

beforeAll(async () => {
  installMiniDom();
  (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject: () => 1, checkDCE: () => {}, onScheduleFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => countCommit(root),
    onCommitFiberUnmount: () => {}, onPostCommitFiberRoot: () => {},
  };
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  ({ EmployeesPanel } = await import("./EmployeesPanel"));
  ({ useGame } = await import("../state/store"));
  ({ derive } = await import("../engine/derive"));
});

const ROLES = ["staff_ml", "staff_sre", "staff_success", "staff_growth", "staff_sales", "staff_pr", "staff_researcher", "staff_engineer", "staff_ops", "staff_data_eng"];
const product = (id: string): ProductState => ({
  id, name: `App ${id}`, type: "code", version: 2, quality: 10, priceMult: 1, enterprise: false,
  enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 }, mau: 20_000, paid: 3_000, buzzSec: 0,
  ageSec: 5_000, upgrade: null, features: [],
});
function lateLab(n: number): GameState {
  const s = createInitialState();
  s.prestige.ships = 6;
  s.research = ["backprop"];
  s.resources = { compute: Big.ZERO, data: Big.ZERO, money: Big.of(1e12) };
  s.products = { ...s.products, frontier: 10, active: [product("p1"), product("p2"), product("p3")] };
  // Half the product crew is placed, half is idle; no one is training.
  s.employees = Array.from({ length: n }, (_, i): Employee => ({
    id: `fx-${i}`, name: `Person ${i}`, roleId: ROLES[i % ROLES.length]!, level: 1 + (i % 4), trait: null,
    assignedProductId: i % 2 === 0 && i % 10 < 6 ? `p${1 + (i % 3)}` : null, training: null,
  }));
  return s;
}

function mount() {
  const noop = () => {};
  function Host() {
    const game = useGame((s) => s.game);
    const d = React.useMemo(() => derive(game), [game]);
    // Like App: fresh callbacks every render.
    return React.createElement(EmployeesPanel, {
      game, derived: d, candidates: null,
      onRecruit: () => noop(), onRefresh: () => noop(), onCloseRecruit: () => noop(), onHireCandidate: () => noop(),
      onTrain: (id: string) => useGame.getState().doTrainEmployee(id),
      onAssign: (id: string, p: string | null) => useGame.getState().doAssignEmployeeToProduct(id, p),
      onFire: (id: string) => useGame.getState().doFireEmployee(id),
      onBuyPerk: () => noop(),
    });
  }
  container = installMiniDom();
  const root = createRoot(container as unknown as Element);
  React.act(() => root.render(React.createElement(Host)));
  mounted = root;
  return root;
}
let mounted: import("react-dom/client").Root | null = null;
afterEach(() => { if (mounted) { const r = mounted; mounted = null; React.act(() => r.unmount()); } });
const tickN = (n: number) => { for (let k = 0; k < n; k++) React.act(() => useGame.getState().advance(100)); };
const find = (pred: (el: MiniElement) => boolean): MiniElement[] => {
  const out: MiniElement[] = [];
  const walk = (n: MiniElement) => { for (const c of n.childNodes as MiniElement[]) { if (c.nodeType === 1) { if (pred(c)) out.push(c); walk(c); } } };
  walk(container);
  return out;
};
const cls = (el: MiniElement) => el.getAttribute("class") ?? "";
const propsOf = (el: MiniElement) => el[Object.keys(el).find((k) => k.startsWith("__reactProps$"))!] as Record<string, (...a: unknown[]) => void>;

describe("Team tab rows with a large roster", () => {
  const N = balance.staff.maxRoster;

  it("re-renders no People row on ticks where no one changes", () => {
    useGame.setState({ game: lateLab(N), candidates: null, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    mount();
    expect(find((el) => /^emp-person( |$)/.test(cls(el)))).toHaveLength(N);
    rowRenders = 0;
    tickN(20);
    // The money moved every tick (products bill), so the panel itself re-rendered.
    expect(rowRenders).toBeLessThanOrEqual(2);
  });

  it("re-renders no Projects row on ticks where no one changes", () => {
    useGame.setState({ game: lateLab(N), candidates: null, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    mount();
    const tab = find((el) => el.tagName === "BUTTON" && el.getAttribute("role") === "tab" && el.textContent.startsWith("Projects"))[0]!;
    React.act(() => propsOf(tab).onClick!());
    const idle = useGame.getState().game.employees.filter((e) => ["staff_ml", "staff_sre", "staff_success", "staff_growth", "staff_sales", "staff_pr"].includes(e.roleId) && !e.assignedProductId).length;
    expect(find((el) => /^emp-person( |$)/.test(cls(el)))).toHaveLength(idle);
    rowRenders = 0;
    tickN(20);
    expect(rowRenders).toBeLessThanOrEqual(2);
  });

  it("still opens, trains, assigns and fires through the memoized rows", () => {
    useGame.setState({ game: lateLab(40), candidates: null, savingFor: null, offline: null, notice: null, event: null, worldEvent: null });
    mount();
    const rowOf = (id: string) => find((el) => /^emp-person( |$)/.test(cls(el)) && el.textContent.includes(useGame.getState().game.employees.find((e) => e.id === id)!.name))[0]!;
    const btn = (label: string) => find((el) => el.tagName === "BUTTON" && el.textContent.startsWith(label));
    // fx-1 is an idle SRE (product crew). Open their card.
    React.act(() => propsOf(rowOf("fx-1")).onClick!());
    expect(btn("Fire")).toHaveLength(1);
    expect(cls(rowOf("fx-1"))).toMatch(/\bsel\b/);
    // Train.
    React.act(() => propsOf(btn("Train")[0]!).onClick!());
    expect(useGame.getState().game.employees.find((e) => e.id === "fx-1")!.training).not.toBeNull();
    expect(find((el) => cls(el) === "emp-act-train")).toHaveLength(1);
    // Assign… jumps to Projects with this person picked; tapping a project places them.
    React.act(() => propsOf(btn("Assign…")[0]!).onClick!());
    expect(find((el) => cls(el) === "emp-place-hint")).toHaveLength(1);
    const proj = find((el) => /^emp-proj( |$)/.test(cls(el)))[1]!;
    React.act(() => propsOf(proj).onClick!());
    expect(useGame.getState().game.employees.find((e) => e.id === "fx-1")!.assignedProductId).toBe("p2");
    expect(find((el) => cls(el) === "emp-place-hint")).toHaveLength(0);
    // Tap a crew avatar to bench them again.
    const crewBtn = find((el) => el.tagName === "BUTTON" && /emp-crew-av/.test(cls(el)) && (el.getAttribute("title") ?? "").startsWith("Person 1 "))[0]!;
    React.act(() => propsOf(crewBtn).onClick!({ stopPropagation: () => {} }));
    expect(useGame.getState().game.employees.find((e) => e.id === "fx-1")!.assignedProductId).toBeNull();
    // Assign from the Available list, then pick a project.
    React.act(() => propsOf(btn("Assign").find((b) => b.textContent === "Assign")!).onClick!());
    expect(btn("Picking…")).toHaveLength(1);
    React.act(() => propsOf(find((el) => /^emp-proj( |$)/.test(cls(el)))[0]!).onClick!());
    const placed = useGame.getState().game.employees.filter((e) => e.assignedProductId === "p1").length;
    expect(placed).toBeGreaterThan(0);
    // Back to People and fire someone.
    const people = find((el) => el.tagName === "BUTTON" && el.getAttribute("role") === "tab" && el.textContent === "People")[0]!;
    React.act(() => propsOf(people).onClick!());
    React.act(() => propsOf(rowOf("fx-3")).onClick!());
    React.act(() => propsOf(btn("Fire")[0]!).onClick!());
    expect(useGame.getState().game.employees.some((e) => e.id === "fx-3")).toBe(false);
    expect(btn("Fire")).toHaveLength(0);
  });
});
