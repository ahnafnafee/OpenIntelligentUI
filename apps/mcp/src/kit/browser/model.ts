import { compile, type Compiled } from "../expr.js";
import type { ModelSpec } from "../spec.js";
import { h, s, followups, srOnly, makeMeasure, type Host } from "./dom.js";
import { fmt, niceTicks } from "../format.js";

const SERIES = ["var(--ogk-c0)", "var(--ogk-c2)", "var(--ogk-c1)"];
const MAX_POINTS = 400;

export function renderModel(root: HTMLElement, spec: ModelSpec, host: Host) {
  const container = h("div", { class: "ogk" });
  root.append(container);
  container.append(srOnly(`Model with ${spec.inputs.map((i) => i.label).join(", ")}.`));

  const scope: Record<string, number> = Object.fromEntries(spec.inputs.map((i) => [i.id, i.value]));
  const outputs = spec.outputs.map((o) => ({ ...o, f: compile(o.formula) }));
  const ordered = [...outputs.filter((o) => o.emphasis), ...outputs.filter((o) => !o.emphasis)];
  const chart = spec.chart && {
    ...spec.chart,
    // The view gets the raw arguments, where a bound may still be a JSON number.
    from: compile(String(spec.chart.x.from)),
    to: compile(String(spec.chart.x.to)),
    series: spec.chart.series.map((ser) => ({ label: ser.label, f: compile(ser.formula) })),
  };

  const inputs = h("div", { class: "ogk-inputs" });
  container.append(inputs);
  const sliders = spec.inputs.map((inp) => {
    const value = h("b", {});
    const input = h("input", {
      type: "range", min: inp.min, max: inp.max, step: inp.step, value: inp.value, "aria-label": inp.label,
      oninput: () => { scope[inp.id] = Number(input.value); update(); },
    }) as HTMLInputElement;
    inputs.append(h("div", { class: "ogk-input" }, h("label", {}, inp.label, value), input));
    return { inp, input, value };
  });

  const metrics = ordered.map((o) => {
    const value = h("b", {});
    const card = h("div", { class: o.emphasis ? "ogk-metric ogk-em" : "ogk-metric" }, h("span", {}, o.label), value);
    return { o, value, card };
  });
  container.append(h("div", { class: "ogk-metrics", "aria-live": "polite" }, ...metrics.map((m) => m.card)));

  const legend = h("div", { class: "ogk-legend" });
  const svg = s("svg", { role: "img", "aria-label": chart ? `${chart.type === "line" ? "Line" : "Bar"} chart of ${chart.series.map((c) => c.label).join(" and ")}` : "" });
  if (chart) {
    if (chart.series.length > 1) {
      chart.series.forEach((ser, i) => legend.append(h("span", {}, h("i", { style: `background:${SERIES[i]}` }), ser.label)));
      container.append(legend);
    }
    container.append(svg);
  }
  if (spec.note) container.append(h("p", { class: "ogk-note" }, spec.note));
  const row = h("div", { class: "ogk-row" }, h("button", { type: "button", class: "ogk-quiet", onclick: reset }, "Reset"));
  const follow = followups(spec.followups, host);
  if (follow) row.append(follow);
  container.append(row);

  function reset() {
    sliders.forEach((sl) => { sl.input.value = String(sl.inp.value); scope[sl.inp.id] = sl.inp.value; });
    update();
  }

  const safe = (f: Compiled, sc: Record<string, number>) => { try { return f(sc); } catch { return NaN; } };
  const measure = makeMeasure(container);

  // The chart is drawn at the container's own width so its text keeps its size,
  // and redrawn when that width changes, as on a phone turning sideways.
  let drawnWidth = 0;
  // The redraw waits a frame: resizing inside the callback would make the browser report a loop.
  if (chart) new ResizeObserver(() => { if (container.clientWidth !== drawnWidth) requestAnimationFrame(drawChart); }).observe(container);

  function drawChart() {
    if (!chart) return;
    drawnWidth = container.clientWidth;
    const W = Math.max(280, drawnWidth || 640);
    const H = Math.round(Math.min(220, Math.max(180, W * 0.55)));
    let x0 = safe(chart.from, scope);
    let x1 = safe(chart.to, scope);
    if (!Number.isFinite(x0) || !Number.isFinite(x1)) { svg.replaceChildren(); return; }
    if (x1 < x0) [x0, x1] = [x1, x0];
    let step = chart.x.step ?? (x1 - x0) / 60;
    if (!(step > 0)) step = 1;
    if ((x1 - x0) / step > MAX_POINTS) step = (x1 - x0) / MAX_POINTS;
    const xs: number[] = [];
    for (let x = x0; x <= x1 + step * 1e-9; x += step) xs.push(Number(x.toFixed(10)));
    if (xs.length < 2) xs.push(x0 + step);
    const data = chart.series.map((ser) => xs.map((x) => safe(ser.f, { ...scope, [chart.x.id]: x })));
    const finite = data.flat().filter(Number.isFinite);
    const lo = Math.min(0, ...finite);
    const hi = Math.max(lo + 1, ...finite);
    const yTicks = niceTicks(lo, hi, 5);
    const yMin = yTicks[0];
    const yMax = yTicks[yTicks.length - 1];
    const yFmt = spec.chart!.y?.format ?? outputs.find((o) => o.emphasis)?.format ?? outputs[0].format;
    const yLabels = yTicks.map((t) => fmt(t, yFmt, spec.chart!.y?.unit));
    const yTitle = spec.chart!.y?.label;
    // The left margin fits the widest tick label, plus the rotated title when there is one.
    const pad = { l: Math.ceil(Math.max(...yLabels.map((t) => measure(t, "small")))) + (yTitle ? 30 : 14), r: 16, t: 12, b: 40 };
    const xTicks = niceTicks(x0, x1, Math.max(3, Math.floor((W - pad.l - pad.r) / 56))).filter((t) => t >= x0 - 1e-9 && t <= x1 + 1e-9);
    const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const parts: SVGElement[] = [];
    yTicks.forEach((t, i) => {
      parts.push(s("line", { class: "ogk-gridline", x1: pad.l, x2: W - pad.r, y1: sy(t), y2: sy(t) }));
      parts.push(s("text", { class: "ogk-axis", x: pad.l - 8, y: sy(t), "text-anchor": "end", "dominant-baseline": "central" }, yLabels[i]));
    });
    xTicks.forEach((t) => parts.push(s("text", { class: "ogk-axis", x: sx(t), y: H - pad.b + 18, "text-anchor": "middle" }, fmt(t, chart.x.format ?? "number", chart.x.unit))));
    parts.push(s("text", { class: "ogk-axis", x: (pad.l + W - pad.r) / 2, y: H - 4, "text-anchor": "middle" }, chart.x.label));
    if (yTitle) parts.push(s("text", { class: "ogk-axis", x: 12, y: (pad.t + H - pad.b) / 2, "text-anchor": "middle", transform: `rotate(-90 12 ${(pad.t + H - pad.b) / 2})` }, yTitle));

    if (chart.type === "line") {
      data.forEach((ys, si) => {
        const d = ys.map((y, i) => (Number.isFinite(y) ? `${i === 0 || !Number.isFinite(ys[i - 1]) ? "M" : "L"}${sx(xs[i]).toFixed(1)} ${sy(y).toFixed(1)}` : "")).join(" ");
        parts.push(s("path", { d, fill: "none", stroke: SERIES[si], "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
        const last = ys.length - 1;
        if (Number.isFinite(ys[last])) parts.push(s("circle", { cx: sx(xs[last]), cy: sy(ys[last]), r: 4, fill: SERIES[si] }));
      });
    } else {
      const groupW = (W - pad.l - pad.r) / xs.length;
      const barW = Math.max(2, Math.min(28, (groupW * 0.72) / data.length));
      data.forEach((ys, si) => ys.forEach((y, i) => {
        if (!Number.isFinite(y)) return;
        const cx = pad.l + groupW * (i + 0.5) + (si - (data.length - 1) / 2) * barW;
        const top = sy(Math.max(0, y));
        const bottom = sy(Math.min(0, y));
        parts.push(s("rect", { x: cx - barW / 2 + 0.5, y: top, width: barW - 1, height: Math.max(1, bottom - top), rx: 2, fill: SERIES[si] }));
      }));
    }
    svg.replaceChildren(...parts);
  }

  function update() {
    sliders.forEach((sl) => { sl.value.textContent = fmt(scope[sl.inp.id], sl.inp.format, sl.inp.unit); });
    metrics.forEach((m) => { m.value.textContent = fmt(safe(m.o.f, scope), m.o.format, m.o.unit); });
    drawChart();
  }
  update();
}
