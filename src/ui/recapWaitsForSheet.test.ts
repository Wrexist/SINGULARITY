import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { App } from "./App";
import { OfflineModal } from "./OfflineModal";
import { SettingsSheet } from "./SettingsSheet";
import { ExpandConfirm } from "./ExpandConfirm";
import { HallCanvas } from "./HallCanvas";
import { Portal } from "./Portal";
import { hookHost, findElements } from "./hookHost";
import { useGame } from "../state/store";
import { createInitialState } from "../engine/state";
import { summarizeWindow } from "../engine/offline";
import { tick } from "../engine/tick";

/**
 * A "while you were away" recap raised on RESUME is uninvited: the loop raises it
 * whenever the phone comes back, and the player may have locked it with a sheet
 * open (Settings, a hall-expansion confirm, a product / Rig Bay / Reputation sheet).
 *
 * Every moment renders inside `.app`, which is its own stacking context, so a
 * portalled sheet paints above ALL of them, and Settings' backdrop outranks a
 * modal's. A recap that did not wait was drawn UNDERNEATH the open sheet while its
 * dialog hook took keyboard focus, trapped Tab inside it and answered Escape: a
 * keyboard player was moved into a dialog they could not see, and one Escape threw
 * the recap away unread. Like the era and world moments, it now waits for the sheet.
 */
const away = 45 * 60 * 1000;
const recap = () => {
  const before = createInitialState();
  const after = tick({ ...before, upgrades: { ...before.upgrades, rack_basic: 5 } }, away);
  return summarizeWindow(before, after, away, away);
};

const has = (tree: ReactElement, type: unknown) => findElements(tree, (el) => el.type === type).length > 0;
const click = (tree: ReactElement, ariaLabel: string) => {
  const btn = findElements(tree, (el) => (el.props as Record<string, unknown>)["aria-label"] === ariaLabel)[0];
  if (!btn) throw new Error(`no element labelled ${ariaLabel}`);
  (btn.props as { onClick: () => void }).onClick();
};

describe("resume recap and an open sheet", () => {
  beforeEach(() => {
    useGame.setState({ game: createInitialState(), initialized: true, offline: null, worldEvent: null, event: null, notice: null });
  });

  it("holds the recap while Settings is open, then shows it", () => {
    const host = hookHost();
    let tree = host.render(App, {});
    click(tree, "Settings");
    tree = host.render(App, {});
    expect(has(tree, SettingsSheet)).toBe(true);

    useGame.setState({ offline: recap() });
    tree = host.render(App, {});
    expect(has(tree, OfflineModal)).toBe(false);

    const sheet = findElements(tree, (el) => el.type === SettingsSheet)[0]!;
    (sheet.props as { onClose: () => void }).onClose();
    tree = host.render(App, {});
    expect(has(tree, SettingsSheet)).toBe(false);
    expect(has(tree, OfflineModal)).toBe(true);
  });

  it("holds the recap while a hall-expansion confirm is open", () => {
    const host = hookHost();
    let tree = host.render(App, {});
    const hall = findElements(tree, (el) => el.type === HallCanvas)[0]!;
    (hall.props as { onExpand: (id: string) => void }).onExpand("expand_e");
    tree = host.render(App, {});
    expect(has(tree, ExpandConfirm)).toBe(true);

    useGame.setState({ offline: recap() });
    tree = host.render(App, {});
    expect(has(tree, OfflineModal)).toBe(false);

    const confirm = findElements(tree, (el) => el.type === ExpandConfirm)[0]!;
    (confirm.props as { onDecline: () => void }).onDecline();
    tree = host.render(App, {});
    expect(has(tree, OfflineModal)).toBe(true);
  });

  describe("with a portalled sheet up (product detail, Rig Bay picker, Reputation)", () => {
    const portal = hookHost({ runEffects: true });
    const g = globalThis as { document?: unknown };
    let hadDocument = false;
    beforeEach(() => {
      // Portal hands its children to react-dom's createPortal, which only checks
      // that the target looks like an element; its mount effect is what counts.
      hadDocument = "document" in g;
      if (!hadDocument) g.document = { body: { nodeType: 1 } };
      portal.render(Portal, { children: null });
    });
    afterEach(() => {
      portal.unmount();
      if (!hadDocument) delete g.document;
    });

    it("holds the recap until the sheet closes", () => {
      const host = hookHost();
      useGame.setState({ offline: recap() });
      expect(has(host.render(App, {}), OfflineModal)).toBe(false);
      portal.unmount();
      expect(has(host.render(App, {}), OfflineModal)).toBe(true);
    });
  });

  it("still opens straight away when nothing is in the way", () => {
    useGame.setState({ offline: recap() });
    expect(has(hookHost().render(App, {}), OfflineModal)).toBe(true);
  });
});
