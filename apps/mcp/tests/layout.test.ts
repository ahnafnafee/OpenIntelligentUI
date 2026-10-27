import { describe, it, expect } from "vitest";
import { layoutProcess, checkProcessLayout, type Measure, type ProcessInput } from "../src/kit/layout";

// Deterministic stand-in for canvas text measurement.
const measure: Measure = (text, font) => text.length * (font === "label" ? 8.2 : 6.8);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const WORDS = ["heat", "cold", "gas", "liquid", "valve", "pressure", "coil", "flow", "cycle", "carbon", "water", "light", "sugar", "energy", "signal", "layer"];

function phrase(r: () => number, maxChars: number) {
  let s = "";
  while (s.length < maxChars) {
    const w = WORDS[Math.floor(r() * WORDS.length)];
    if ((s + " " + w).trim().length > maxChars) break;
    s = (s + " " + w).trim();
    if (r() < 0.35) break;
  }
  return s || "step";
}

function randomInput(seed: number): ProcessInput {
  const r = rng(seed);
  const n = 2 + Math.floor(r() * 7);
  const closed = r() < 0.6;
  const zones = closed && r() < 0.5 ? [{ label: phrase(r, 18) }, { label: phrase(r, 18) }] : [];
  const stages = Array.from({ length: n }, () => ({
    label: phrase(r, 26),
    sublabel: r() < 0.6 ? phrase(r, 34) : undefined,
    zone: zones.length && r() < 0.5 ? Math.floor(r() * zones.length) : undefined,
  }));
  const linkCount = closed ? n : n - 1;
  const links = Array.from({ length: linkCount }, () =>
    r() < 0.6 ? { label: phrase(r, 18), sublabel: r() < 0.5 ? phrase(r, 18) : undefined } : {},
  );
  return { closed, stages, links, zones, maxWidth: 680 };
}

describe("layoutProcess invariants", () => {
  it("holds for 400 random specs", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const input = randomInput(seed);
      const layout = layoutProcess(input, measure);
      const problems = checkProcessLayout(layout, input, measure);
      expect(problems, `seed ${seed}: ${JSON.stringify(input)}`).toEqual([]);
    }
  });

  it("holds for open flows of 9 to 12 stages with long labels", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed * 7919);
      const n = 9 + Math.floor(r() * 4);
      const stages = Array.from({ length: n }, () => ({ label: phrase(r, 32), sublabel: r() < 0.6 ? phrase(r, 30) : undefined }));
      const links = Array.from({ length: n - 1 }, () => (r() < 0.6 ? { label: phrase(r, 22), sublabel: r() < 0.5 ? phrase(r, 22) : undefined } : {}));
      const input: ProcessInput = { closed: false, stages, links, zones: [], maxWidth: 680 };
      const problems = checkProcessLayout(layoutProcess(input, measure), input, measure);
      expect(problems, `seed ${seed}: ${JSON.stringify(input)}`).toEqual([]);
    }
  });

  it("fits within the maximum width", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const layout = layoutProcess(randomInput(seed), measure);
      expect(layout.width).toBeLessThanOrEqual(680);
    }
  });
});

describe("layoutProcess placement", () => {
  const fridge: ProcessInput = {
    closed: true,
    maxWidth: 680,
    zones: [{ label: "Inside the fridge", sublabel: "about 4°C" }, { label: "Your kitchen", sublabel: "about 22°C" }],
    stages: [
      { label: "Compressor", sublabel: "squeezes the vapor" },
      { label: "Condenser coils", sublabel: "gives heat to the room", zone: 1 },
      { label: "Expansion valve", sublabel: "drops the pressure" },
      { label: "Evaporator coils", sublabel: "soaks up heat", zone: 0 },
    ],
    links: [
      { label: "hot gas", sublabel: "high pressure" },
      { label: "warm liquid", sublabel: "high pressure" },
      { label: "cold mist", sublabel: "low pressure" },
      { label: "cool vapor", sublabel: "low pressure" },
    ],
  };

  it("puts each zone's stages on its own side and keeps stage order clockwise", () => {
    const layout = layoutProcess(fridge, measure);
    const cx = (i: number) => layout.boxes[i].x + layout.boxes[i].w / 2;
    expect(cx(3)).toBeLessThan(layout.width / 2);
    expect(cx(1)).toBeGreaterThan(layout.width / 2);
    expect(layout.zones).toHaveLength(2);
    expect(checkProcessLayout(layout, fridge, measure)).toEqual([]);
  });

  it("links every stage to the next, closing the loop", () => {
    const layout = layoutProcess(fridge, measure);
    expect(layout.links.map((l) => [l.from, l.to])).toEqual([[0, 1], [1, 2], [2, 3], [3, 0]]);
  });

  it("has a checker that catches overlaps, off-edge arrows, and labels on boxes", () => {
    const good = layoutProcess(fridge, measure);
    const stacked = structuredClone(good);
    stacked.boxes[1] = { ...stacked.boxes[0] };
    expect(checkProcessLayout(stacked, fridge, measure).some((p) => p.includes("overlap"))).toBe(true);
    const detached = structuredClone(good);
    const [x, y] = detached.links[0].points[0];
    detached.links[0].points[0] = [x + 30, y + 30];
    expect(checkProcessLayout(detached, fridge, measure).some((p) => p.includes("does not start"))).toBe(true);
    const covered = structuredClone(good);
    covered.links[0].label = { ...covered.boxes[2], lines: ["x"] };
    expect(checkProcessLayout(covered, fridge, measure).some((p) => p.includes("label of link 0 overlaps box"))).toBe(true);
  });

  it("keeps a too-wide cycle compact so it can scale down on a phone", () => {
    const wide = layoutProcess(fridge, measure);
    const narrow = { ...fridge, maxWidth: 300 };
    const layout = layoutProcess(narrow, measure);
    expect(layout.height).toBeLessThanOrEqual(wide.height * 1.2);
    expect(checkProcessLayout(layout, narrow, measure).filter((p) => !p.startsWith("width"))).toEqual([]);
  });

  it("keeps an open flow compact when one box is wider than the space", () => {
    const flow: ProcessInput = { ...fridge, closed: false, zones: [], links: fridge.links.slice(0, 3), maxWidth: 120 };
    const layout = layoutProcess(flow, measure);
    const roomy = layoutProcess({ ...flow, maxWidth: 680 }, measure);
    expect(layout.height).toBeLessThanOrEqual(roomy.height * 3);
    expect(checkProcessLayout(layout, flow, measure).filter((p) => !p.startsWith("width"))).toEqual([]);
  });

  it("chains an open flow without a closing link", () => {
    const flow: ProcessInput = { ...fridge, closed: false, zones: [], links: fridge.links.slice(0, 3) };
    const layout = layoutProcess(flow, measure);
    expect(layout.links.map((l) => [l.from, l.to])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(checkProcessLayout(layout, flow, measure)).toEqual([]);
  });
});
