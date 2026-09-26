import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { installMiniDom, uninstallMiniDom, type MiniElement } from "./miniDom";
import { createInitialState } from "../engine/state";
import { balance } from "../engine/balance/config";
import { industryNews } from "../engine/balance/news";
import type { GameState } from "../engine/types";

/**
 * The newswire mixes in lines about the player's own lab (a regulator hearing when
 * Heat runs hot, a headcount line, the Endowment, preprints, a sprawling product
 * line). It rebuilt its pool only when era, ship count, faction lean or market rank
 * changed, so those lines never appeared when they became true, and a stale one
 * ("Regulators name-check Singularity Inc. in a hearing") kept running long after
 * Heat had cooled to zero.
 */

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let NewsTicker: typeof import("./NewsTicker").NewsTicker;
let useGame: typeof import("../state/store").useGame;
let useSettings: typeof import("./settings").useSettings;
let container: MiniElement;

beforeAll(async () => {
  installMiniDom();
  React = await import("react");
  ({ createRoot } = await import("react-dom/client"));
  ({ NewsTicker } = await import("./NewsTicker"));
  ({ useGame } = await import("../state/store"));
  ({ useSettings } = await import("./settings"));
});

let mounted: import("react-dom/client").Root | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  if (mounted) { const r = mounted; mounted = null; React.act(() => r.unmount()); }
});
afterAll(() => uninstallMiniDom());

const HEARING = "Regulators name-check Singularity Inc. in a hearing";

describe("the newswire's lines about the player's lab", () => {
  it("follow the lab when Heat runs hot and cools again", () => {
    // Hold the wire on its first line (reduced motion) and keep the shuffle in order,
    // so the line on screen is the pool's head: a reactive line when one applies.
    useSettings.setState({ reducedMotion: true });
    vi.spyOn(Math, "random").mockReturnValue(0.99999);
    const cold: GameState = { ...createInitialState(), research: ["backprop"], heat: 0 };
    useGame.setState({ game: cold, worldEvent: null, event: null, notice: null, offline: null });

    container = installMiniDom();
    const root = createRoot(container as unknown as Element);
    React.act(() => root.render(React.createElement(NewsTicker, {})));
    mounted = root;
    expect(container.textContent).toContain(industryNews[0]!);

    React.act(() => useGame.setState((s) => ({ game: { ...s.game, heat: balance.heat.max } })));
    expect(container.textContent).toContain(HEARING);

    React.act(() => useGame.setState((s) => ({ game: { ...s.game, heat: 0 } })));
    expect(container.textContent).not.toContain(HEARING);
    expect(container.textContent).toContain(industryNews[0]!);
  });

  it("pick up a new headcount line without waiting for a ship", () => {
    useSettings.setState({ reducedMotion: true });
    vi.spyOn(Math, "random").mockReturnValue(0.99999);
    useGame.setState({ game: { ...createInitialState(), research: ["backprop"] }, worldEvent: null, event: null, notice: null, offline: null });
    container = installMiniDom();
    const root = createRoot(container as unknown as Element);
    React.act(() => root.render(React.createElement(NewsTicker, {})));
    mounted = root;
    const staff = Array.from({ length: 10 }, (_, i) => ({ ...createInitialState().employees[0], id: `e${i}` }));
    React.act(() => useGame.setState((s) => ({ game: { ...s.game, employees: staff as GameState["employees"] } })));
    expect(container.textContent).toContain("staffs up again");
  });
});
