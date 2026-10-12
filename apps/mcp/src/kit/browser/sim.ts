import type { SimulationSpec } from "../spec.js";
import { trialRunner } from "../simulate.js";
import { fmt, plural } from "../format.js";
import { h, followups, srOnly, reducedMotion, type Host } from "./dom.js";

const OPTION = [0, 2, 1, 3].map((i) => `var(--ogk-c${i})`);
const FRAMES = 24;

export function renderSimulation(root: HTMLElement, spec: SimulationSpec, host: Host) {
  const container = h("div", { class: "ogk" });
  root.append(container);
  const run = trialRunner(spec);
  const runSize = spec.runSize ?? 1000;
  const trials = plural(spec.trial);
  const Trial = spec.trial[0].toUpperCase() + spec.trial.slice(1);
  const expected = (i: number) => spec.options[i].expectedLabel ?? fmt((spec.options[i].expected ?? 0) * 100, "percent");
  let total = 0;
  let counts = spec.options.map(() => 0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  container.append(srOnly(`Simulation: ${spec.options.map((o) => o.label).join(" versus ")}.`));
  container.append(h("p", { class: "ogk-status" }, spec.question ?? `How often does each option win?`));

  const rows = spec.options.map((o, i) => {
    const big = h("span", { class: "ogk-big" });
    const fill = h("div", { class: "ogk-fill", style: `background:${OPTION[i]}` });
    const track = h("div", { class: "ogk-track" }, fill);
    if (o.expected !== undefined) {
      track.append(h("div", { class: "ogk-mark", style: `left:${o.expected * 100}%`, title: `Expected ${expected(i)}` }, h("span", {}, expected(i))));
    }
    const count = h("span", { class: "ogk-cnt" });
    return { label: h("span", { class: "ogk-lbl" }, h("i", { style: `background:${OPTION[i]}` }), o.label), big, track, fill, count };
  });
  container.append(h("div", { class: "ogk-sim" }, ...rows.flatMap((r) => [r.label, r.big, r.track, r.count])));

  const trace = h("p", { class: "ogk-trace" });
  const insight = h("p", { class: "ogk-insight", "aria-live": "polite" });
  const playButton = h("button", { type: "button", class: "ogk-primary", onclick: playOne }, `Play one ${spec.trial}`);
  const runButton = h("button", { type: "button", onclick: runMany }, `Run ${fmt(runSize, "integer")} ${trials}`);
  container.append(trace, insight, h("div", { class: "ogk-row" },
    playButton, runButton, h("button", { type: "button", class: "ogk-quiet", onclick: clear }, "Clear")));
  if (spec.note) container.append(h("p", { class: "ogk-note" }, spec.note));
  const follow = followups(spec.followups, host);
  if (follow) container.append(follow);

  function record() {
    const result = run();
    total++;
    result.wins.forEach((won, i) => { if (won) counts[i]++; });
    return result;
  }

  function tally(n: number) {
    for (let t = 0; t < n; t++) record();
  }

  function playOne() {
    const result = record();
    const values = Object.entries(result.values).map(([k, v]) => `${k} = ${fmt(v)}`).join(", ");
    const winners = spec.options.filter((_, i) => result.wins[i]).map((o) => o.label);
    const verdict = winners.length ? `${winners.join(" and ")} ${winners.length > 1 ? "win" : "wins"}` : "no option wins";
    trace.textContent = `${Trial} ${fmt(total, "integer")}: ${values}, so ${verdict}.`;
    update();
  }

  function runMany() {
    if (timer) return;
    trace.textContent = "";
    if (reducedMotion()) { tally(runSize); update(); return; }
    const per = Math.ceil(runSize / FRAMES);
    let left = runSize;
    playButton.toggleAttribute("disabled", true);
    runButton.toggleAttribute("disabled", true);
    const frame = () => {
      const n = Math.min(per, left);
      tally(n);
      left -= n;
      update();
      if (left > 0) timer = setTimeout(frame, 30);
      else {
        timer = undefined;
        playButton.toggleAttribute("disabled", false);
        runButton.toggleAttribute("disabled", false);
      }
    };
    frame();
  }

  function clear() {
    if (timer) { clearTimeout(timer); timer = undefined; }
    playButton.toggleAttribute("disabled", false);
    runButton.toggleAttribute("disabled", false);
    total = 0;
    counts = spec.options.map(() => 0);
    trace.textContent = "";
    update();
  }

  function summary() {
    if (total === 0) return "";
    if (total < 100) return `Results swing a lot over a few ${trials}. Run more to see where they settle.`;
    const best = counts.indexOf(Math.max(...counts));
    if (counts[best] === 0) return `After ${fmt(total, "integer")} ${trials}, no option has won yet.`;
    const rate = counts[best] / total;
    const o = spec.options[best];
    const head = `After ${fmt(total, "integer")} ${trials}, ${o.label} wins ${fmt(rate * 100, "percent")} of the time`;
    if (o.expected === undefined) return `${head}.`;
    return Math.abs(rate - o.expected) <= 0.02 ? `${head}, close to the expected ${expected(best)}.` : `${head}; the expected rate is ${expected(best)}.`;
  }

  function update() {
    rows.forEach((r, i) => {
      const rate = total ? counts[i] / total : 0;
      r.big.textContent = total ? `${Math.round(rate * 100)}%` : "?";
      r.big.classList.toggle("ogk-idle", total === 0);
      r.fill.style.width = `${rate * 100}%`;
      r.count.textContent = `${fmt(counts[i], "integer")} of ${fmt(total, "integer")}`;
    });
    insight.textContent = summary();
  }
  update();
}
