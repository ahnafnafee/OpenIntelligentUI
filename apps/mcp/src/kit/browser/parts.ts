import type { PartsSpec } from "../spec.js";
import { fmt } from "../format.js";
import { h, followups, srOnly, type Host } from "./dom.js";

// Gray goes last so it reads as "other" rather than as a main part.
const PALETTE = [0, 1, 2, 3, 4, 6, 7, 5].map((i) => `var(--ogk-c${i})`);

export function renderParts(root: HTMLElement, spec: PartsSpec, host: Host) {
  const container = h("div", { class: "ogk" });
  root.append(container);
  // A part keeps its color in every case, so switching cases compares like with like.
  const labels = [...new Set(spec.cases.flatMap((c) => c.parts.map((p) => p.label)))];
  const color = (label: string) => PALETTE[labels.indexOf(label) % PALETTE.length];
  const value = (v: number) => fmt(v, spec.format, spec.unit);
  const share = (v: number, sum: number) => `${Math.round((v / sum) * 100)}%`;

  container.append(srOnly(`Breakdown of ${spec.totalLabel ?? "the total"} into ${labels.join(", ")}.`));
  const buttons = spec.cases.map((c, i) => h("button", { type: "button", "aria-pressed": "false", onclick: () => show(i) }, c.label));
  if (buttons.length > 1) container.append(h("div", { class: "ogk-seg", role: "group", "aria-label": "Case" }, ...buttons));
  const total = h("p", { class: "ogk-total" });
  const segments = new Map(labels.map((l) => [l, h("div", { style: `background:${color(l)}` })]));
  const bar = h("div", { class: "ogk-bar", role: "img" }, ...segments.values());
  const legend = h("div", { class: "ogk-parts" });
  container.append(total, bar, legend);
  if (spec.note) container.append(h("p", { class: "ogk-note" }, spec.note));
  const follow = followups(spec.followups, host);
  if (follow) container.append(follow);

  function show(index: number) {
    const c = spec.cases[index];
    const sum = c.parts.reduce((s, p) => s + p.value, 0);
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
    total.replaceChildren(h("b", {}, value(sum)), spec.totalLabel ?? "total");
    segments.forEach((el, label) => {
      const part = c.parts.find((p) => p.label === label);
      el.style.display = part ? "" : "none";
      el.style.flexGrow = String(part?.value ?? 0);
      el.title = part ? `${label}: ${value(part.value)}, ${share(part.value, sum)}` : "";
    });
    bar.setAttribute("aria-label", c.parts.map((p) => `${p.label} ${share(p.value, sum)}`).join(", "));
    legend.replaceChildren(...c.parts.flatMap((p) => [
      h("i", { style: `background:${color(p.label)}` }),
      h("span", {}, p.label),
      h("span", { class: "ogk-num" }, value(p.value)),
      h("span", { class: "ogk-share" }, share(p.value, sum)),
      ...(p.note ? [h("span", { class: "ogk-pnote" }, p.note)] : []),
    ]));
  }
  show(0);
}
