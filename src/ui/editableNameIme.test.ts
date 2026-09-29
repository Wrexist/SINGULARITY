import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { EditableName } from "./EditableName";
import { hookHost, findElements } from "./hookHost";

/**
 * Renaming a product with a Japanese, Chinese or Korean keyboard: the player types
 * kana/pinyin and presses Enter (or Return on iOS) to CONFIRM the IME candidate. That
 * keydown arrives with `isComposing` set (Safari/WebKit report it as keyCode 229), and
 * the field treated it as "done": it committed the half-composed reading and closed,
 * so the product was renamed to "にほ" instead of "日本". Escape while composing (which
 * only dismisses the candidate list) likewise threw the whole edit away.
 */

type Key = { key: string; keyCode: number; nativeEvent: { isComposing: boolean }; preventDefault: () => void };
const key = (k: string, composing: boolean, keyCode = composing ? 229 : k === "Enter" ? 13 : 27): Key =>
  ({ key: k, keyCode, nativeEvent: { isComposing: composing }, preventDefault: () => {} });

function openEditor(onCommit: (n: string) => void) {
  const host = hookHost();
  const props = { value: "Nova", onCommit };
  let tree = host.render(EditableName, props) as ReactElement;
  (tree.props as { onClick: () => void }).onClick();
  tree = host.render(EditableName, props) as ReactElement;
  const input = () => findElements(host.render(EditableName, props), (el) => el.type === "input")[0];
  return { input, type: (v: string) => (input()!.props as { onChange: (e: { target: { value: string } }) => void }).onChange({ target: { value: v } }) };
}

const press = (el: ReactElement | undefined, k: Key) => (el!.props as { onKeyDown: (e: Key) => void }).onKeyDown(k);

describe("EditableName and IME composition", () => {
  it("an Enter that confirms an IME candidate does not commit the rename", () => {
    const onCommit = vi.fn();
    const ed = openEditor(onCommit);
    ed.type("にほ");
    press(ed.input(), key("Enter", true));
    expect(onCommit).not.toHaveBeenCalled();
    expect(ed.input()).toBeDefined(); // still editing
  });

  it("WebKit's post-composition Enter (keyCode 229, isComposing false) does not commit either", () => {
    const onCommit = vi.fn();
    const ed = openEditor(onCommit);
    ed.type("日本");
    press(ed.input(), key("Enter", false, 229));
    expect(onCommit).not.toHaveBeenCalled();
    expect(ed.input()).toBeDefined();
  });

  it("Escape while composing keeps the edit open", () => {
    const onCommit = vi.fn();
    const ed = openEditor(onCommit);
    ed.type("にほ");
    press(ed.input(), key("Escape", true));
    expect(ed.input()).toBeDefined();
  });

  it("a plain Enter after composition commits the composed name", () => {
    const onCommit = vi.fn();
    const ed = openEditor(onCommit);
    ed.type("日本");
    press(ed.input(), key("Enter", false));
    expect(onCommit).toHaveBeenCalledWith("日本");
    expect(ed.input()).toBeUndefined();
  });
});
