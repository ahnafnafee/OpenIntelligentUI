// Tiny DOM builders shared by the kit components.

import type { Font, Measure } from "../layout.js";

type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el: Element, attrs: Attrs, children: Child[]) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v as EventListener);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c === false || c === null || c === undefined) continue;
    el.append(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const h = (tag: string, attrs: Attrs = {}, ...children: Child[]) =>
  apply(document.createElement(tag), attrs, children) as HTMLElement;

export const s = (tag: string, attrs: Attrs = {}, ...children: Child[]) =>
  apply(document.createElementNS(SVG_NS, tag), attrs, children) as SVGElement;

export interface Host {
  sendPrompt: (text: string) => unknown;
  openLink: (url: string) => unknown;
}

export function followups(items: string[] | undefined, host: Host) {
  if (!items?.length) return null;
  return h("div", { class: "ogk-follow" }, ...items.map((q) =>
    h("button", { type: "button", onclick: () => host.sendPrompt(q) }, `${q} ↗`)));
}

export function srOnly(text: string) {
  return h("h2", { class: "sr-only" }, text);
}

// Canvas text measurement in the same font the SVG text renders with.
export function makeMeasure(root: Element): Measure {
  const family = getComputedStyle(root).fontFamily || "system-ui, sans-serif";
  const ctx = document.createElement("canvas").getContext("2d");
  const fonts: Record<Font, string> = { label: `500 14px ${family}`, sub: `400 12px ${family}`, small: `400 12px ${family}` };
  const cache = new Map<string, number>();
  return (text, font) => {
    const key = `${font}|${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      if (ctx) { ctx.font = fonts[font]; w = ctx.measureText(text).width * 1.04; }
      else w = text.length * (font === "label" ? 8.2 : 6.8);
      cache.set(key, w);
    }
    return w;
  };
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
