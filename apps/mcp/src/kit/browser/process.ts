import { layoutProcess, roundedPath, LINE_H } from "../layout.js";
import type { ProcessSpec } from "../spec.js";
import { unnumbered } from "../format.js";
import { h, s, followups, srOnly, makeMeasure, type Host } from "./dom.js";

type Tone = "cold" | "cool" | "warm" | "hot" | "neutral";
let uid = 0;

export function renderProcess(root: HTMLElement, spec: ProcessSpec, host: Host) {
  const labels = unnumbered(spec.stages.map((st) => st.label));
  spec = { ...spec, stages: spec.stages.map((st, i) => ({ ...st, label: labels[i] })) };
  const n = spec.stages.length;
  const links = Array.from({ length: spec.closed ? n : n - 1 }, (_, i) => spec.links?.[i] ?? {});
  const zones = spec.zones ?? [];
  const container = h("div", { class: "ogk" });
  root.append(container);
  const measure = makeMeasure(container);
  const maxWidth = Math.min(680, Math.max(360, container.clientWidth || 680));
  const layout = layoutProcess({ closed: spec.closed, stages: spec.stages, links, zones, maxWidth }, measure);
  const id = `ogk${++uid}`;
  // Untoned arrows rest in gray; the active stage and its outgoing arrow always get a color.
  const restTone = (i: number): Tone => links[i]?.tone ?? "neutral";
  const stageTone = (i: number): Tone => spec.stages[i].tone ?? links[i]?.tone ?? "cold";
  const kind = spec.closed ? "Cycle" : "Flow";

  container.append(srOnly(`${kind} with ${n} stages: ${spec.stages.map((st) => st.label).join(", ")}.`));

  const stepItems = spec.stages.map((st, i) => h("li", {}, h("button", {
    type: "button", "aria-label": `Stage ${i + 1}: ${st.label}`, onclick: () => select(i),
  }, h("b", {}, String(i + 1)), h("span", {}, st.label))));
  const steps = h("ol", { class: "ogk-steps" }, ...stepItems);
  container.append(steps);
  // When every label does not fit on one line, only the current stage keeps its label.
  steps.classList.toggle("ogk-compact", stepItems[n - 1].offsetTop > stepItems[0].offsetTop);

  const svg = s("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, role: "img", "aria-label": `${kind} diagram` });
  const usedTones = Array.from(new Set([...links.map((_, i) => restTone(i)), ...spec.stages.map((_, i) => stageTone(i))]));
  svg.append(s("defs", {}, ...usedTones.map((t) => s("marker", {
    id: `${id}-arrow-${t}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 10, markerHeight: 10,
    markerUnits: "userSpaceOnUse", orient: "auto-start-reverse",
  }, s("path", { d: "M1 1.5 L9 5 L1 8.5 Z", fill: `var(--ogk-${t}-line)` })))));

  layout.zones.forEach((z, zi) => {
    const tone = zones[zi].tone ?? "neutral";
    svg.append(s("rect", { x: z.rect.x + 1, y: z.rect.y + 1, width: z.rect.w - 2, height: z.rect.h - 2, rx: 14, fill: `var(--ogk-${tone}-tint)`, opacity: 0.55 }));
    const anchorX = z.align === "start" ? z.label.x : z.label.x + z.label.w;
    const text = s("text", { "text-anchor": z.align });
    z.label.lines.forEach((line, k) => text.append(s("tspan", {
      x: anchorX, y: z.label.y + LINE_H * (k + 0.5) + (k === 0 ? 0 : 2), "dominant-baseline": "central",
      class: k === 0 ? "ogk-zone-t" : "ogk-ts",
      style: k === 0 ? `fill:var(--ogk-${tone}-ink)` : undefined,
    }, line)));
    svg.append(text);
  });

  const paint = (path: SVGElement, tone: Tone) => {
    path.setAttribute("stroke", `var(--ogk-${tone}-line)`);
    path.setAttribute("marker-end", `url(#${id}-arrow-${tone})`);
  };
  const linkEls = layout.links.map((l, i) => {
    const tone = restTone(i);
    const path = s("path", { class: "ogk-link", d: roundedPath(l.points) });
    paint(path, tone);
    svg.append(path);
    if (l.label) {
      const text = s("text", { "text-anchor": "middle" });
      l.label.lines.forEach((line, k) => text.append(s("tspan", {
        x: l.label!.x + l.label!.w / 2, y: l.label!.y + LINE_H * (k + 0.5), "dominant-baseline": "central",
        class: "ogk-ts", style: k === 0 ? `fill:var(--ogk-${tone}-ink);font-weight:500` : undefined,
      }, line)));
      svg.append(text);
    }
    return path;
  });

  const nodes = layout.boxes.map((b, i) => {
    const st = spec.stages[i];
    const cx = b.x + b.w / 2;
    const rect = s("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10 });
    const title = s("text", { class: "ogk-t", x: cx, y: st.sublabel ? b.y + 21 : b.y + b.h / 2, "text-anchor": "middle", "dominant-baseline": "central" }, st.label);
    const g = s("g", {
      class: "ogk-node", tabindex: 0, role: "button", "aria-label": `Stage ${i + 1}: ${st.label}`,
      onclick: () => select(i),
      onkeydown: (e: Event) => {
        const key = (e as KeyboardEvent).key;
        if (key === "Enter" || key === " ") { e.preventDefault(); select(i); }
      },
    }, rect, title, st.sublabel ? s("text", { class: "ogk-ts", x: cx, y: b.y + 39, "text-anchor": "middle", "dominant-baseline": "central" }, st.sublabel) : null);
    svg.append(g);
    return { g, rect, title };
  });

  container.append(h("div", { class: "ogk-figure", style: `max-width:${layout.width}px` }, svg));

  const title = h("p", { class: "ogk-card-t" });
  const detail = h("p", {});
  const chips = h("div", { class: "ogk-chips" });
  container.append(h("div", { class: "ogk-card", "aria-live": "polite" }, title, detail, chips));

  let current = 0;
  const row = h("div", { class: "ogk-row" },
    h("button", { type: "button", onclick: () => select(current - 1) }, "Back"),
    h("button", { type: "button", class: "ogk-primary", onclick: () => select(current + 1) }, "Next stage"),
    h("button", { type: "button", class: "ogk-quiet", onclick: () => select(0) }, "Reset"),
  );
  const follow = followups(spec.followups, host);
  if (follow) row.append(follow);
  container.append(row);
  container.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") select(current + 1);
    if (e.key === "ArrowLeft") select(current - 1);
  });

  function select(i: number) {
    current = ((i % n) + n) % n;
    const st = spec.stages[current];
    const tone = stageTone(current);
    nodes.forEach((node, k) => {
      const on = k === current;
      node.g.classList.toggle("ogk-on", on);
      node.rect.style.fill = on ? `var(--ogk-${tone}-tint)` : "";
      node.rect.style.stroke = on ? `var(--ogk-${tone}-line)` : "";
      node.title.style.fill = on ? `var(--ogk-${tone}-ink)` : "";
    });
    linkEls.forEach((el, k) => {
      el.classList.toggle("ogk-on", k === current);
      paint(el, k === current ? links[k]?.tone ?? tone : restTone(k));
    });
    stepItems.forEach((li, k) => { li.className = k < current ? "done" : k === current ? "now" : ""; });
    title.textContent = `${current + 1}. ${st.label}`;
    detail.textContent = st.detail;
    chips.replaceChildren(...(st.chips ?? []).map((c) => h("span", {}, c)));
    chips.style.display = st.chips?.length ? "" : "none";
  }
  select(0);
}
