/**
 * TEST-ONLY: the smallest DOM react-dom's client renderer needs to mount and
 * update a tree in node (vitest runs with no jsdom). It exists so a test can drive
 * a component through REAL reconciliation — memo bail-outs, keyed lists, effects —
 * and count how often a child actually renders, which the hooks host (`hookHost`)
 * cannot show because it never expands children.
 *
 * Only structure, attributes, text and inline style are modelled; there is no
 * layout, no CSS and no event dispatch. Install it before react-dom is first
 * imported (react-dom decides at load time whether it can use the DOM), then load
 * react-dom and the component under test with dynamic `import()`.
 */

const XHTML = "http://www.w3.org/1999/xhtml";

class MiniNode {
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];
  ownerDocument: MiniDocument | null;
  constructor(public nodeType: number, public nodeName: string, doc: MiniDocument | null) { this.ownerDocument = doc; }
  get firstChild(): MiniNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): MiniNode | null { return this.childNodes[this.childNodes.length - 1] ?? null; }
  get nextSibling(): MiniNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  appendChild<T extends MiniNode>(child: T): T {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  insertBefore<T extends MiniNode>(child: T, ref: MiniNode | null): T {
    if (!ref) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const at = this.childNodes.indexOf(ref);
    child.parentNode = this;
    this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child);
    return child;
  }
  removeChild<T extends MiniNode>(child: T): T {
    const at = this.childNodes.indexOf(child);
    if (at >= 0) this.childNodes.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  get textContent(): string { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (v) this.appendChild(new MiniText(v, this.ownerDocument));
  }
}

class MiniText extends MiniNode {
  constructor(public nodeValue: string, doc: MiniDocument | null) { super(3, "#text", doc); }
  get data(): string { return this.nodeValue; }
  set data(v: string) { this.nodeValue = v; }
  override get textContent(): string { return this.nodeValue; }
  override set textContent(v: string) { this.nodeValue = v; }
}

class MiniElement extends MiniNode {
  attributes = new Map<string, string>();
  style: Record<string, unknown> & { setProperty(k: string, v: string): void; removeProperty(k: string): void };
  namespaceURI = XHTML;
  tagName: string;
  [key: string]: unknown;
  constructor(tag: string, doc: MiniDocument | null) {
    super(1, tag.toUpperCase(), doc);
    this.tagName = tag.toUpperCase();
    const style: Record<string, unknown> = {};
    style.setProperty = (k: string, v: string) => { style[k] = v; };
    style.removeProperty = (k: string) => { delete style[k]; };
    this.style = style as MiniElement["style"];
  }
  setAttribute(k: string, v: unknown): void { this.attributes.set(k, String(v)); }
  setAttributeNS(_ns: string, k: string, v: unknown): void { this.setAttribute(k, v); }
  removeAttribute(k: string): void { this.attributes.delete(k); }
  getAttribute(k: string): string | null { return this.attributes.get(k) ?? null; }
  hasAttribute(k: string): boolean { return this.attributes.has(k); }
  /** `<select>` reads its options back to mark the selected one. */
  get options(): MiniElement[] {
    const out: MiniElement[] = [];
    const walk = (n: MiniNode) => { for (const c of n.childNodes) { if (c instanceof MiniElement && c.tagName === "OPTION") out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  get value(): string { return (this.attributes.get("value") ?? this.textContent) as string; }
  set value(v: string) { this.attributes.set("value", v); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

class MiniDocument extends MiniNode {
  body: MiniElement;
  documentElement: MiniElement;
  activeElement: MiniElement | null = null;
  defaultView: unknown = null;
  constructor() {
    super(9, "#document", null);
    this.documentElement = new MiniElement("html", this);
    this.body = new MiniElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }
  createElement(tag: string): MiniElement { return new MiniElement(tag, this); }
  createElementNS(ns: string, tag: string): MiniElement { const el = new MiniElement(tag, this); el.namespaceURI = ns; return el; }
  createTextNode(text: string): MiniText { return new MiniText(text, this); }
}

export type { MiniElement };

/** Install `window`/`document` globals once; returns a fresh container element. */
export function installMiniDom(): MiniElement {
  const g = globalThis as Record<string, unknown>;
  if (!g.document) {
    const doc = new MiniDocument();
    class HTMLIFrameElement {}
    const win: Record<string, unknown> = {
      document: doc,
      HTMLIFrameElement,
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    };
    doc.defaultView = win;
    g.window = win;
    g.document = doc;
    g.IS_REACT_ACT_ENVIRONMENT = true;
  }
  const doc = g.document as MiniDocument;
  return doc.body.appendChild(doc.createElement("div"));
}

/** Remove the globals `installMiniDom` added, so no later suite sees a fake DOM. */
export function uninstallMiniDom(): void {
  const g = globalThis as Record<string, unknown>;
  if (!(g.document instanceof MiniDocument)) return;
  for (const k of ["window", "document", "IS_REACT_ACT_ENVIRONMENT", "__REACT_DEVTOOLS_GLOBAL_HOOK__"]) delete g[k];
}
