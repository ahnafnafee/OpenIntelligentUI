// Browser entry for the kit, bundled into dist/kit.js and inlined into each
// MCP App view. Exposes window.OGUIKit for the view's boot script.

import { KIT_CSS } from "./style.js";
import { h, type Host } from "./dom.js";
import { renderProcess } from "./process.js";
import { renderModel } from "./model.js";
import { renderSimulation } from "./sim.js";
import { renderParts } from "./parts.js";

const RENDERERS: Record<string, (root: HTMLElement, spec: never, host: Host) => void> = {
  process: renderProcess,
  model: renderModel,
  simulation: renderSimulation,
  parts: renderParts,
};

// Layout measures text on a canvas, which uses fallback metrics until the font loads.
async function fontsLoaded(root: Element) {
  const family = getComputedStyle(root).fontFamily;
  const loads = ["500 14px", "400 12px"].map((f) => document.fonts.load(`${f} ${family}`).catch(() => []));
  await Promise.race([Promise.all(loads), new Promise((done) => setTimeout(done, 1500))]);
}

function showError(root: HTMLElement, message: string) {
  root.replaceChildren(h("p", { class: "ogk-error", role: "alert" }, message));
}

async function render(component: string, spec: unknown, root: HTMLElement, host: Host) {
  if (!document.getElementById("ogk-css")) document.head.append(h("style", { id: "ogk-css" }, KIT_CSS));
  await fontsLoaded(root);
  root.replaceChildren();
  try {
    const draw = RENDERERS[component];
    if (!draw) throw new Error(`unknown component "${component}"`);
    draw(root, spec as never, host);
  } catch (e) {
    showError(root, `This ${component} could not be drawn: ${(e as Error).message}`);
  }
}

Object.assign(window, { OGUIKit: { render, showError } });
