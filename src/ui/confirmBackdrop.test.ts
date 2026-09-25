import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ReactElement } from "react";
import { SettingsSheet } from "./SettingsSheet";
import { ConfirmSheet } from "./ConfirmSheet";
import { hookHost, findElements, pathTo, bubbleClick } from "./hookHost";
import { useGame } from "../state/store";
import { createInitialState } from "../engine/state";

/**
 * "Restore this backup" asks first, in a ConfirmSheet rendered from INSIDE the
 * Settings sheet. The confirm portals to <body>, but React bubbles a click through
 * its own tree, so a tap on the confirm's backdrop, the usual way to back out,
 * travelled on to Settings' backdrop and closed the whole sheet as well. The player
 * lost the pasted backup text and the open section, and had to start over.
 */
const props = (onClose: () => void) => ({ onClose, onReset: () => {} });
const byClass = (tree: ReactElement, cls: string) =>
  findElements(tree, (el) => typeof (el.props as { className?: unknown }).className === "string" &&
    ((el.props as { className: string }).className.split(" ").includes(cls)));
const byText = (tree: ReactElement, text: string) =>
  findElements(tree, (el) => el.type === "button" && (el.props as { children?: unknown }).children === text);

/** Open "Back up & restore", paste `blob` and ask to restore it. */
function openRestoreConfirm(host: ReturnType<typeof hookHost>, onClose: () => void, blob: string): ReactElement {
  let tree = host.render(SettingsSheet, props(onClose));
  const head = byClass(tree, "set-backup-head")[0]!;
  (head.props as { onClick: () => void }).onClick();
  tree = host.render(SettingsSheet, props(onClose));
  const input = findElements(tree, (el) => (el.props as { id?: string }).id === "set-restore-text")[0]!;
  (input.props as { onChange: (e: { target: { value: string } }) => void }).onChange({ target: { value: blob } });
  tree = host.render(SettingsSheet, props(onClose));
  (byText(tree, "Restore this backup")[0]!.props as { onClick: () => void }).onClick();
  return host.render(SettingsSheet, props(onClose));
}

/** The full React path of a click on `pick(confirm tree)`: Settings → ConfirmSheet → target. */
function confirmPath(tree: ReactElement, pick: (confirmTree: ReactElement) => ReactElement): ReactElement[] {
  const confirm = findElements(tree, (el) => el.type === ConfirmSheet)[0];
  if (!confirm) throw new Error("no restore confirm open");
  const outer = pathTo(tree, confirm)!;
  const inner = hookHost().render(ConfirmSheet, confirm.props as Parameters<typeof ConfirmSheet>[0]);
  return [...outer, ...pathTo(inner, pick(inner))!];
}

describe("restore confirm inside Settings", () => {
  let blob = "";
  beforeEach(() => {
    useGame.setState({ game: createInitialState(), offline: null, savingFor: null });
    blob = useGame.getState().exportSave();
  });

  it("a tap on the confirm's backdrop backs out of the confirm only", () => {
    const onClose = vi.fn();
    const host = hookHost();
    let tree = openRestoreConfirm(host, onClose, blob);
    bubbleClick(confirmPath(tree, (c) => byClass(c, "modal-backdrop")[0]!));
    tree = host.render(SettingsSheet, props(onClose));
    expect(findElements(tree, (el) => el.type === ConfirmSheet)).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    // The pasted backup is still there to restore.
    const input = findElements(tree, (el) => (el.props as { id?: string }).id === "set-restore-text")[0]!;
    expect((input.props as { value: string }).value).toBe(blob);
  });

  it("Cancel backs out of the confirm only", () => {
    const onClose = vi.fn();
    const host = hookHost();
    const tree = openRestoreConfirm(host, onClose, blob);
    bubbleClick(confirmPath(tree, (c) => byText(c, "Cancel")[0]!));
    expect(findElements(host.render(SettingsSheet, props(onClose)), (el) => el.type === ConfirmSheet)).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a tap on Settings' own backdrop still closes Settings", () => {
    const onClose = vi.fn();
    const tree = hookHost().render(SettingsSheet, props(onClose));
    bubbleClick(pathTo(tree, byClass(tree, "sheet-backdrop")[0]!)!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
