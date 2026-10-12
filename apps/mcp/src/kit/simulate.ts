// Trial semantics shared by the server's text fallback and the browser view.
// Kept free of zod so the browser bundle stays small.

import { compile } from "./expr.js";
import type { SimulationSpec } from "./spec.js";

export interface Trial { values: Record<string, number>; wins: boolean[] }

// Draws run in order, so a later draw can use an earlier one. NaN never wins.
export function trialRunner(spec: SimulationSpec, rng: () => number = Math.random): () => Trial {
  const draws = spec.draws.map((d) => ({ id: d.id, f: compile(d.formula, { rng }) }));
  const wins = spec.options.map((o) => compile(o.wins, { rng }));
  return () => {
    const values: Record<string, number> = {};
    for (const d of draws) values[d.id] = d.f(values);
    return { values, wins: wins.map((w) => !!w(values)) };
  };
}

export function simulate(spec: SimulationSpec, trials: number, rng: () => number = Math.random): number[] {
  const run = trialRunner(spec, rng);
  const counts = spec.options.map(() => 0);
  for (let t = 0; t < trials; t++) run().wins.forEach((won, i) => { if (won) counts[i]++; });
  return counts;
}
