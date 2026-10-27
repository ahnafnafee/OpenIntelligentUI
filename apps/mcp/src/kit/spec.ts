// Specs for the kit's MCP tools: zod shapes the host validates, cross-field
// checks zod cannot express, and plain-text fallbacks for clients without UI.

import * as z from "zod";
import { compile, variables, ExprError } from "./expr.js";
import { plural, unnumbered } from "./format.js";
import { MAX_CYCLE_STAGES } from "./layout.js";
import { simulate } from "./simulate.js";

// Open flows wrap into rows, so they can run longer than a cycle's fixed placements.
export const MAX_STAGES = 12;

export const KIT_COMPONENTS = ["process", "model", "simulation", "parts"] as const;
export type KitComponent = (typeof KIT_COMPONENTS)[number];

// Factories, not shared instances: the JSON Schema converter turns a reused zod
// object into a $ref, and some clients drop $ref before the model reads the schema.
const tone = () => z.enum(["cold", "cool", "warm", "hot", "neutral"]);
const id = () => z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,23}$/, "Use a short identifier such as rate or years");
const followups = z.array(z.string().min(1).max(80)).max(3).optional()
  .describe("Up to three next questions; each becomes a button that asks Claude");
const note = z.string().max(160).optional().describe("One short caption, such as 'Example numbers'");

export const processShape = {
  closed: z.boolean().describe("true for a cycle that returns to the first stage, false for a one-way flow"),
  stages: z.array(z.object({
    label: z.string().min(1).max(32),
    sublabel: z.string().max(30).optional(),
    detail: z.string().min(1).max(280).describe("One or two sentences shown when this stage is selected"),
    chips: z.array(z.string().min(1).max(28)).max(4).optional().describe("Facts about this stage, such as 'High pressure'"),
    zone: z.number().int().min(0).max(7).optional().describe("Index into zones"),
    tone: tone().optional(),
  })).min(2).max(MAX_STAGES),
  links: z.array(z.object({
    label: z.string().max(22).optional(),
    sublabel: z.string().max(22).optional(),
    tone: tone().optional(),
  })).max(8).optional().describe("Arrow i runs from stage i to the next stage; in a cycle the last arrow returns to the first stage"),
  zones: z.array(z.object({
    label: z.string().min(1).max(24),
    sublabel: z.string().max(24).optional(),
    tone: tone().optional(),
  })).max(2).optional().describe("Up to two regions, drawn as the left and right halves"),
  followups,
};

const formatFields = () => ({
  format: z.enum(["number", "integer", "currency", "percent"]).optional().describe("currency for money, percent for rates given as 0 to 100"),
  unit: z.string().max(12).optional().describe("Suffix such as kg or km/h; with currency, a magnitude such as k or bn"),
});
// A number or a formula; coerced to text so the schema has one type instead of a union.
const bound = (what: string) => z.coerce.string().min(1).max(200).describe(`${what}: a number or a formula over the input ids`);

export const modelShape = {
  inputs: z.array(z.object({
    id: id(), label: z.string().min(1).max(32),
    min: z.number(), max: z.number(), step: z.number().positive(), value: z.number(),
    ...formatFields(),
  })).min(1).max(4),
  outputs: z.array(z.object({
    label: z.string().min(1).max(32),
    formula: z.string().min(1).max(400).describe("Formula over the input ids, such as start * (1 + rate/100)^years"),
    emphasis: z.boolean().optional().describe("Show as the headline number"),
    ...formatFields(),
  })).min(1).max(4),
  chart: z.object({
    type: z.enum(["line", "bar"]),
    x: z.object({
      id: id(), label: z.string().min(1).max(32),
      from: bound("Start of the x range"),
      to: bound("End of the x range"),
      step: z.number().positive().optional(),
      ...formatFields(),
    }),
    y: z.object({ label: z.string().min(1).max(32), ...formatFields() }).optional(),
    series: z.array(z.object({
      label: z.string().min(1).max(24),
      formula: z.string().min(1).max(400).describe("Formula over the x id and the input ids"),
    })).min(1).max(3),
  }).optional(),
  note,
  followups,
};

export const simulationShape = {
  question: z.string().max(90).optional().describe("Status line, such as 'Does switching beat staying?'"),
  trial: z.string().min(1).max(20).describe("What one run is called, such as 'game' or 'roll'"),
  draws: z.array(z.object({
    id: id(), formula: z.string().min(1).max(200).describe("Random value for each trial, such as randint(1, 3); may use earlier draws"),
  })).min(1).max(6),
  options: z.array(z.object({
    label: z.string().min(1).max(20),
    wins: z.string().min(1).max(200).describe("Formula over the draws that is true when this option wins, such as pick != car"),
    expected: z.number().min(0).max(1).optional().describe("Theoretical win rate, drawn as a marker"),
    expectedLabel: z.string().max(10).optional().describe("Marker caption, such as '2/3'"),
  })).min(1).max(4),
  runSize: z.number().int().min(10).max(10000).optional(),
  note,
  followups,
};

export const partsShape = {
  cases: z.array(z.object({
    label: z.string().min(1).max(24),
    parts: z.array(z.object({
      label: z.string().min(1).max(28),
      value: z.number().min(0),
      note: z.string().max(80).optional(),
    })).min(2).max(8),
  })).min(1).max(4).describe("One case is a single breakdown; several cases get a switcher"),
  totalLabel: z.string().max(24).optional(),
  ...formatFields(),
  note,
  followups,
};

const objects = {
  process: z.object(processShape),
  model: z.object(modelShape),
  simulation: z.object(simulationShape),
  parts: z.object(partsShape),
};
export type ProcessSpec = z.infer<typeof objects.process>;
export type ModelSpec = z.infer<typeof objects.model>;
export type SimulationSpec = z.infer<typeof objects.simulation>;
export type PartsSpec = z.infer<typeof objects.parts>;

function checkFormula(label: string, formula: string, allowed: string[], problems: string[]) {
  try {
    compile(formula);
    const unknown = variables(formula).filter((v) => !allowed.includes(v));
    if (unknown.length) problems.push(`${label} uses ${unknown.join(", ")}, which ${unknown.length > 1 ? "are" : "is"} not defined; available: ${allowed.join(", ") || "none"}`);
  } catch (e) {
    problems.push(`${label}: ${(e as Error).message}`);
  }
}

// Cross-field rules; an empty list means the spec can be drawn.
export function validateSpec(component: KitComponent, spec: unknown): string[] {
  const parsed = objects[component].safeParse(spec);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".") || "spec"}: ${i.message}`);
  const problems: string[] = [];
  if (component === "process") {
    const s = parsed.data as ProcessSpec;
    if (s.closed && s.stages.length > MAX_CYCLE_STAGES) {
      problems.push(`stages: a cycle can have at most ${MAX_CYCLE_STAGES} stages, so draw a longer process as a flow with closed: false`);
    }
    const maxLinks = s.closed ? s.stages.length : s.stages.length - 1;
    if ((s.links?.length ?? 0) > maxLinks) problems.push(`links: at most ${maxLinks} for ${s.stages.length} stages in a ${s.closed ? "cycle" : "flow"}`);
    s.stages.forEach((st, i) => {
      if (st.zone !== undefined && st.zone >= (s.zones?.length ?? 0)) problems.push(`stages.${i}.zone: no zone ${st.zone}`);
    });
    if (s.zones?.length && !s.closed) problems.push("zones: only cycles support zones");
  }
  if (component === "model") {
    const s = parsed.data as ModelSpec;
    const ids = s.inputs.map((i) => i.id);
    if (new Set(ids).size !== ids.length) problems.push("inputs: ids must be unique");
    s.inputs.forEach((inp, i) => {
      if (inp.min >= inp.max) problems.push(`inputs.${i}: min must be below max`);
      if (inp.value < inp.min || inp.value > inp.max) problems.push(`inputs.${i}: value must be between min and max`);
    });
    s.outputs.forEach((o, i) => checkFormula(`outputs.${i}.formula`, o.formula, ids, problems));
    if (s.chart) {
      if (ids.includes(s.chart.x.id)) problems.push("chart.x.id: must differ from the input ids");
      for (const end of ["from", "to"] as const) checkFormula(`chart.x.${end}`, s.chart.x[end], ids, problems);
      s.chart.series.forEach((ser, i) => checkFormula(`chart.series.${i}.formula`, ser.formula, [...ids, s.chart!.x.id], problems));
    }
  }
  if (component === "simulation") {
    const s = parsed.data as SimulationSpec;
    const seen: string[] = [];
    s.draws.forEach((d, i) => {
      checkFormula(`draws.${i}.formula`, d.formula, [...seen], problems);
      if (seen.includes(d.id)) problems.push(`draws.${i}.id: ${d.id} is already used`);
      seen.push(d.id);
    });
    s.options.forEach((o, i) => checkFormula(`options.${i}.wins`, o.wins, seen, problems));
  }
  if (component === "parts") {
    const s = parsed.data as PartsSpec;
    s.cases.forEach((c, i) => {
      if (c.parts.reduce((sum, p) => sum + p.value, 0) <= 0) problems.push(`cases.${i}: values must add up to more than 0`);
      if (new Set(c.parts.map((p) => p.label)).size !== c.parts.length) problems.push(`cases.${i}: part labels must be unique`);
    });
  }
  return problems;
}

const plain = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

// Plain-text version of each component for clients that cannot render MCP Apps.
export function describeSpec(component: KitComponent, spec: unknown): string {
  if (component === "process") {
    const s = spec as ProcessSpec;
    const labels = unnumbered(s.stages.map((st) => st.label));
    const lines = s.stages.map((st, i) => `${i + 1}. ${labels[i]}${st.sublabel ? ` (${st.sublabel})` : ""}: ${st.detail}`);
    return [`${s.closed ? "Cycle" : "Flow"} with ${s.stages.length} stages${s.closed ? ", returning to stage 1" : ""}:`, ...lines].join("\n");
  }
  if (component === "model") {
    const s = spec as ModelSpec;
    const scope = Object.fromEntries(s.inputs.map((i) => [i.id, i.value]));
    const inputs = s.inputs.map((i) => `${i.label} = ${plain(i.value)}${i.unit ? ` ${i.unit}` : ""}`).join(", ");
    const outputs = s.outputs.map((o) => {
      try { return `${o.label}: ${plain(compile(o.formula)(scope))}${o.unit ? ` ${o.unit}` : ""}`; } catch (e) { return `${o.label}: ${(e as Error).message}`; }
    });
    return [`With ${inputs}:`, ...outputs].join("\n");
  }
  if (component === "simulation") {
    const s = spec as SimulationSpec;
    const n = s.runSize ?? 1000;
    const counts = simulate(s, n);
    const lines = s.options.map((o, i) => `${o.label} won ${plain(counts[i])} of ${plain(n)} ${plural(s.trial)} (${Math.round((counts[i] / n) * 100)}%)${o.expected !== undefined ? `, expected ${o.expectedLabel ?? `${Math.round(o.expected * 100)}%`}` : ""}`);
    return [`Simulated ${plain(n)} ${plural(s.trial)}:`, ...lines].join("\n");
  }
  const s = spec as PartsSpec;
  return s.cases.map((c) => {
    const total = c.parts.reduce((sum, p) => sum + p.value, 0);
    const parts = c.parts.map((p) => `${p.label}: ${plain(p.value)}${s.unit ? ` ${s.unit}` : ""} (${Math.round((p.value / total) * 100)}%)`);
    return [`${c.label}, ${s.totalLabel ?? "total"} ${plain(total)}${s.unit ? ` ${s.unit}` : ""}:`, ...parts].join("\n");
  }).join("\n\n");
}

export { ExprError };
