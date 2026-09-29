import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { EditableName } from "./EditableName";
import { hookHost, findElements } from "./hookHost";
import { PRODUCT_NAME_MAX, cleanProductName } from "../engine/products";

/**
 * The rename field let the player type 32 characters while the rename kept 24, so a
 * long name was silently cut after the player had seen it whole. The field's limit is
 * now the rename's own cap.
 */
describe("the product rename field", () => {
  it("holds exactly as many characters as the rename keeps", () => {
    const host = hookHost();
    const props = { value: "Nova", onCommit: () => {} };
    const tree = host.render(EditableName, props) as ReactElement;
    (tree.props as { onClick: () => void }).onClick();
    const input = findElements(host.render(EditableName, props), (el) => el.type === "input")[0]!;
    const max = (input.props as { maxLength: number }).maxLength;
    expect(max).toBe(PRODUCT_NAME_MAX);
    const typed = "Quasar Deep Reasoner Pro".slice(0, max).padEnd(max, "x");
    expect(cleanProductName(typed)).toBe(typed);
  });
});
