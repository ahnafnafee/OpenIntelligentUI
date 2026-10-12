// Deterministic layout for process diagrams (closed cycles and open flows).
// Boxes are sized from measured text, connectors are orthogonal polylines
// clipped to box edges, and every label is placed where it collides with
// nothing. The renderer draws exactly what this module computes.

export type Font = "label" | "sub" | "small";
export type Measure = (text: string, font: Font) => number;
export interface Rect { x: number; y: number; w: number; h: number }
export type Point = [number, number];

export interface ProcessInput {
  closed: boolean;
  stages: { label: string; sublabel?: string; zone?: number }[];
  links: ({ label?: string; sublabel?: string } | undefined)[];
  zones: { label: string; sublabel?: string }[];
  maxWidth: number;
}

export interface TextBlock extends Rect { lines: string[] }
export interface LinkLayout { from: number; to: number; points: Point[]; label?: TextBlock }
export interface ZoneLayout { rect: Rect; label: TextBlock; align: "start" | "end" }
export interface ProcessLayout { width: number; height: number; boxes: Rect[]; links: LinkLayout[]; zones: ZoneLayout[] }

export const BOX = { padX: 16, minW: 96, h1: 40, h2: 58 };
export const LINE_H = 16;
const MARGIN = 16;
const LABEL_GAP = 8;
const STROKE_HALF = 4;
const ZONE_HEAD = 44;

// Stages per side for a closed loop: [top, right, bottom, left]. Extra stages
// stack vertically so a long loop grows in height instead of overflowing.
const CLOSED_SIDES: Record<number, number[]> = {
  2: [0, 1, 0, 1], 3: [1, 1, 0, 1], 4: [1, 1, 1, 1], 5: [1, 2, 1, 1],
  6: [1, 2, 1, 2], 7: [1, 3, 1, 2], 8: [1, 3, 1, 3],
};

export function boxSize(stage: { label: string; sublabel?: string }, measure: Measure) {
  const text = Math.max(measure(stage.label, "label"), stage.sublabel ? measure(stage.sublabel, "sub") : 0);
  return { w: Math.max(BOX.minW, Math.ceil(text + 2 * BOX.padX)), h: stage.sublabel ? BOX.h2 : BOX.h1 };
}

function textBlock(parts: (string | undefined)[], measure: Measure): { lines: string[]; w: number; h: number } | undefined {
  const lines = parts.filter((p): p is string => !!p && p.trim().length > 0);
  if (!lines.length) return undefined;
  return { lines, w: Math.ceil(Math.max(...lines.map((l) => measure(l, "small")))), h: lines.length * LINE_H };
}

export const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

const segmentRect = (p: Point, q: Point, half: number): Rect => ({
  x: Math.min(p[0], q[0]) - half, y: Math.min(p[1], q[1]) - half,
  w: Math.abs(p[0] - q[0]) + 2 * half, h: Math.abs(p[1] - q[1]) + 2 * half,
});

const inside = (p: Point, r: Rect) => p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h;

// Where an axis-aligned segment from p (inside r) to q (outside r) crosses r's boundary.
function exitPoint(p: Point, q: Point, r: Rect): Point {
  if (p[0] === q[0]) return [p[0], q[1] > p[1] ? r.y + r.h : r.y];
  return [q[0] > p[0] ? r.x + r.w : r.x, p[1]];
}

function clipStart(points: Point[], r: Rect): Point[] {
  for (let i = 0; i + 1 < points.length; i++) {
    if (!inside(points[i + 1], r)) return [exitPoint(points[i], points[i + 1], r), ...points.slice(i + 1)];
  }
  return points;
}

function clipEnd(points: Point[], r: Rect): Point[] {
  return clipStart([...points].reverse(), r).reverse();
}

export function segments(points: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < points.length; i++) out.push([points[i], points[i + 1]]);
  return out;
}

// Candidate spots for a label beside each segment of its connector, longest
// segments first; `outward` is the preferred side for horizontal segments.
function labelCandidates(points: Point[], size: { w: number; h: number }, center: Point | undefined): Rect[] {
  const segs = segments(points)
    .map(([p, q]) => ({ p, q, len: Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) }))
    .sort((a, b) => b.len - a.len);
  const out: Rect[] = [];
  for (const { p, q } of segs) {
    for (const t of [0.5, 0.32, 0.68]) {
      const mx = p[0] + (q[0] - p[0]) * t;
      const my = p[1] + (q[1] - p[1]) * t;
      if (p[1] === q[1]) {
        const above: Rect = { x: mx - size.w / 2, y: my - LABEL_GAP - size.h, w: size.w, h: size.h };
        const below: Rect = { x: mx - size.w / 2, y: my + LABEL_GAP, w: size.w, h: size.h };
        const outwardFirst = center ? my <= center[1] : true;
        out.push(...(outwardFirst ? [above, below] : [below, above]));
      } else {
        const right: Rect = { x: mx + LABEL_GAP, y: my - size.h / 2, w: size.w, h: size.h };
        const left: Rect = { x: mx - LABEL_GAP - size.w, y: my - size.h / 2, w: size.w, h: size.h };
        const inwardFirst = center ? mx <= center[0] : true;
        out.push(...(inwardFirst ? [right, left] : [left, right]));
      }
    }
  }
  return out;
}

function placeLabels(links: LinkLayout[], sizes: ({ lines: string[]; w: number; h: number } | undefined)[], boxes: Rect[], center: Point | undefined): boolean {
  const placed: Rect[] = [];
  const allSegs = links.flatMap((l) => segments(l.points).map(([p, q]) => segmentRect(p, q, STROKE_HALF)));
  for (let i = 0; i < links.length; i++) {
    const size = sizes[i];
    if (!size) continue;
    const spot = labelCandidates(links[i].points, size, center).find(
      (c) => !boxes.some((b) => overlaps(c, b, 4)) && !placed.some((p) => overlaps(c, p, 4)) && !allSegs.some((s) => overlaps(c, s, 2)),
    );
    if (!spot) return false;
    placed.push(spot);
    links[i].label = { ...spot, lines: size.lines };
  }
  return true;
}

function normalize(layout: ProcessLayout, headHeight: number): ProcessLayout {
  const rects: Rect[] = [...layout.boxes, ...layout.links.flatMap((l) => (l.label ? [l.label] : []))];
  const pts = layout.links.flatMap((l) => l.points);
  const minX = Math.min(...rects.map((r) => r.x), ...pts.map((p) => p[0]));
  const minY = Math.min(...rects.map((r) => r.y), ...pts.map((p) => p[1]));
  const maxX = Math.max(...rects.map((r) => r.x + r.w), ...pts.map((p) => p[0]));
  const maxY = Math.max(...rects.map((r) => r.y + r.h), ...pts.map((p) => p[1]));
  const dx = MARGIN - minX;
  const dy = MARGIN + headHeight - minY;
  const move = (r: Rect) => ({ ...r, x: r.x + dx, y: r.y + dy });
  return {
    width: Math.ceil(maxX - minX + 2 * MARGIN),
    height: Math.ceil(maxY - minY + 2 * MARGIN + headHeight),
    boxes: layout.boxes.map(move),
    links: layout.links.map((l) => ({
      ...l,
      points: l.points.map((p) => [p[0] + dx, p[1] + dy] as Point),
      label: l.label ? { ...move(l.label), lines: l.label.lines } : undefined,
    })),
    zones: [],
  };
}

function layoutZones(layout: ProcessLayout, input: ProcessInput, measure: Measure): ZoneLayout[] {
  return input.zones.slice(0, 2).map((zone, i) => {
    const block = textBlock([zone.label, zone.sublabel], measure)!;
    const half = layout.width / 2;
    const rect: Rect = { x: i === 0 ? 0 : half, y: 0, w: half, h: layout.height };
    const x = i === 0 ? MARGIN : layout.width - MARGIN - block.w;
    return { rect, align: i === 0 ? "start" : "end", label: { x, y: MARGIN - 4, w: block.w, h: block.h, lines: block.lines } };
  });
}

// Which stage starts at the first slot: the rotation that puts zone 0 stages on
// the left half and zone 1 stages on the right half, preferring no rotation.
function chooseRotation(input: ProcessInput, slots: { side: number; j: number; k: number }[]): number {
  if (!input.zones.length) return 0;
  const n = input.stages.length;
  const horizontal = (slot: { side: number; j: number; k: number }) => {
    if (slot.side === 1) return 1;
    if (slot.side === 3) return -1;
    const f = (slot.j + 1) / (slot.k + 1);
    const pos = slot.side === 0 ? f - 0.5 : 0.5 - f;
    return Math.abs(pos) < 1e-9 ? 0 : Math.sign(pos);
  };
  let best = 0;
  let bestScore = -Infinity;
  for (let r = 0; r < n; r++) {
    let score = 0;
    slots.forEach((slot, s) => {
      const zone = input.stages[(s + r) % n].zone;
      if (zone === undefined) return;
      const h = horizontal(slot);
      score += zone === 0 ? -h : h;
    });
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

function layoutClosed(input: ProcessInput, measure: Measure): ProcessLayout {
  const n = input.stages.length;
  const sizes = input.stages.map((s) => boxSize(s, measure));
  const labels = Array.from({ length: n }, (_, i) => textBlock([input.links[i]?.label, input.links[i]?.sublabel], measure));
  const slots: { side: number; j: number; k: number }[] = [];
  CLOSED_SIDES[n].forEach((k, side) => { for (let j = 0; j < k; j++) slots.push({ side, j, k }); });
  const rotation = chooseRotation(input, slots);
  const stageAt = slots.map((_, s) => (s + rotation) % n);
  const bySide = [0, 1, 2, 3].map((side) => slots.flatMap((sl, s) => (sl.side === side ? [stageAt[s]] : [])));
  const headHeight = input.zones.length ? ZONE_HEAD : 0;

  const spacing = (dims: number[], gap: number) => {
    if (!dims.length) return 0;
    let s = gap + Math.max(dims[0], dims[dims.length - 1]) / 2;
    for (let j = 0; j + 1 < dims.length; j++) s = Math.max(s, gap + (dims[j] + dims[j + 1]) / 2);
    return s;
  };

  let gapH = 56;
  let gapV = 48;
  let fallback: ProcessLayout | undefined;
  for (let attempt = 0; attempt < 48; attempt++) {
    const widest = (side: number) => Math.max(0, ...bySide[side].map((i) => sizes[i].w));
    const W = Math.max(
      spacing(bySide[0].map((i) => sizes[i].w), gapH) * (bySide[0].length + 1),
      spacing(bySide[2].map((i) => sizes[i].w), gapH) * (bySide[2].length + 1),
      (widest(1) + widest(3)) / 2 + gapH,
      160,
    );
    const H = Math.max(
      spacing(bySide[1].map((i) => sizes[i].h), gapV) * (bySide[1].length + 1),
      spacing(bySide[3].map((i) => sizes[i].h), gapV) * (bySide[3].length + 1),
      120,
    );
    const P = 2 * W + 2 * H;
    const slotPoint = (slot: { side: number; j: number; k: number }): { p: Point; t: number } => {
      const f = (slot.j + 1) / (slot.k + 1);
      if (slot.side === 0) return { p: [W * f, 0], t: W * f };
      if (slot.side === 1) return { p: [W, H * f], t: W + H * f };
      if (slot.side === 2) return { p: [W - W * f, H], t: W + H + W * f };
      return { p: [0, H - H * f], t: 2 * W + H + H * f };
    };
    const corner = (t: number): Point => {
      const m = ((t % P) + P) % P;
      if (Math.abs(m) < 1e-9) return [0, 0];
      if (Math.abs(m - W) < 1e-9) return [W, 0];
      if (Math.abs(m - (W + H)) < 1e-9) return [W, H];
      return [0, H];
    };
    const at: { p: Point; t: number }[] = [];
    slots.forEach((slot, s) => { at[stageAt[s]] = slotPoint(slot); });
    const boxes = sizes.map((sz, i) => ({ x: at[i].p[0] - sz.w / 2, y: at[i].p[1] - sz.h / 2, w: sz.w, h: sz.h }));
    const links: LinkLayout[] = Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n;
      const t0 = at[i].t;
      let t1 = at[j].t;
      if (t1 <= t0) t1 += P;
      const pts: Point[] = [at[i].p];
      for (const c of [0, W, W + H, 2 * W + H, P, P + W, P + W + H, P + 2 * W + H]) {
        if (c > t0 + 1e-9 && c < t1 - 1e-9) pts.push(corner(c));
      }
      pts.push(at[j].p);
      return { from: i, to: j, points: clipEnd(clipStart(pts, boxes[i]), boxes[j]) };
    });
    const ok = placeLabels(links, labels, boxes, [W / 2, H / 2]);
    const layout = normalize({ width: 0, height: 0, boxes, links, zones: [] }, headHeight);
    layout.zones = layoutZones(layout, input, measure);
    if (ok && layout.width <= input.maxWidth && checkProcessLayout(layout, input, measure).length === 0) return layout;
    fallback = layout;
    if (layout.width + 32 <= input.maxWidth) gapH += 16;
    gapV += 16;
  }
  return fallback!;
}

function layoutOpen(input: ProcessInput, measure: Measure): ProcessLayout {
  const n = input.stages.length;
  const sizes = input.stages.map((s) => boxSize(s, measure));
  const labels = Array.from({ length: n - 1 }, (_, i) => textBlock([input.links[i]?.label, input.links[i]?.sublabel], measure));
  const limit = input.maxWidth - 2 * MARGIN;
  let gap = 64;
  let rowGap = 56;
  let fallback: ProcessLayout | undefined;
  for (let attempt = 0; attempt < 48; attempt++) {
    const centers: Point[] = [];
    const rowOf: number[] = [];
    let row = 0;
    let dir = 1;
    let y = sizes[0].h / 2;
    let rowHeight = sizes[0].h;
    centers[0] = [sizes[0].w / 2, y];
    rowOf[0] = 0;
    for (let i = 1; i < n; i++) {
      const prev = centers[i - 1];
      const nx = prev[0] + dir * (sizes[i - 1].w / 2 + gap + sizes[i].w / 2);
      const fits = dir > 0 ? nx + sizes[i].w / 2 <= limit : nx - sizes[i].w / 2 >= 0;
      if (fits) {
        centers[i] = [nx, y];
        rowHeight = Math.max(rowHeight, sizes[i].h);
      } else {
        row += 1;
        dir = -dir;
        y += rowHeight / 2 + rowGap + sizes[i].h / 2;
        rowHeight = sizes[i].h;
        const below = Math.min(Math.max(prev[0], sizes[i].w / 2), limit - sizes[i].w / 2);
        centers[i] = [below, y];
      }
      rowOf[i] = row;
    }
    const boxes = sizes.map((sz, i) => ({ x: centers[i][0] - sz.w / 2, y: centers[i][1] - sz.h / 2, w: sz.w, h: sz.h }));
    const links: LinkLayout[] = Array.from({ length: n - 1 }, (_, i) => {
      const a = centers[i];
      const b = centers[i + 1];
      const pts: Point[] = a[1] === b[1] || a[0] === b[0] ? [a, b] : [a, [a[0], (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2], b];
      return { from: i, to: i + 1, points: clipEnd(clipStart(pts, boxes[i]), boxes[i + 1]) };
    });
    const ok = placeLabels(links, labels, boxes, undefined);
    const layout = normalize({ width: 0, height: 0, boxes, links, zones: [] }, 0);
    if (ok && layout.width <= input.maxWidth && checkProcessLayout(layout, input, measure).length === 0) return layout;
    fallback = layout;
    gap += 16;
    rowGap += 16;
  }
  return fallback!;
}

export function layoutProcess(input: ProcessInput, measure: Measure): ProcessLayout {
  return input.closed ? layoutClosed(input, measure) : layoutOpen(input, measure);
}

const onEdge = (p: Point, r: Rect) => {
  const withinX = p[0] >= r.x - 0.5 && p[0] <= r.x + r.w + 0.5;
  const withinY = p[1] >= r.y - 0.5 && p[1] <= r.y + r.h + 0.5;
  const onVertical = (Math.abs(p[0] - r.x) < 0.5 || Math.abs(p[0] - r.x - r.w) < 0.5) && withinY;
  const onHorizontal = (Math.abs(p[1] - r.y) < 0.5 || Math.abs(p[1] - r.y - r.h) < 0.5) && withinX;
  return onVertical || onHorizontal;
};

// Every rule the renderer relies on; an empty list means the layout is clean.
export function checkProcessLayout(layout: ProcessLayout, input: ProcessInput, measure: Measure): string[] {
  const problems: string[] = [];
  const { boxes, links } = layout;
  if (layout.width > input.maxWidth) problems.push(`width ${layout.width} exceeds ${input.maxWidth}`);
  input.stages.forEach((stage, i) => {
    const need = boxSize(stage, measure);
    if (boxes[i].w + 0.5 < need.w || boxes[i].h + 0.5 < need.h) problems.push(`box ${i} is smaller than its text`);
    const b = boxes[i];
    if (b.x < 0 || b.y < 0 || b.x + b.w > layout.width || b.y + b.h > layout.height) problems.push(`box ${i} is outside the canvas`);
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j], 8)) problems.push(`boxes ${i} and ${j} overlap`);
  }
  const segRects = links.map((l) => segments(l.points).map(([p, q]) => segmentRect(p, q, STROKE_HALF)));
  links.forEach((link, li) => {
    segments(link.points).forEach(([p, q]) => {
      if (p[0] !== q[0] && p[1] !== q[1]) problems.push(`link ${li} has a diagonal segment`);
    });
    if (!onEdge(link.points[0], boxes[link.from])) problems.push(`link ${li} does not start on box ${link.from}'s edge`);
    if (!onEdge(link.points[link.points.length - 1], boxes[link.to])) problems.push(`link ${li} does not end on box ${link.to}'s edge`);
    segments(link.points).forEach(([p, q]) => {
      const thin = segmentRect(p, q, 0);
      boxes.forEach((b, bi) => {
        const core: Rect = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
        if (overlaps(thin, core)) problems.push(`link ${li} passes through box ${bi}`);
      });
    });
    const length = segments(link.points).reduce((sum, [p, q]) => sum + Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), 0);
    if (length < 20) problems.push(`link ${li} is too short to show an arrow`);
  });
  const labelRects = links.flatMap((l, li) => (l.label ? [{ li, r: l.label as Rect }] : []));
  labelRects.forEach(({ li, r }) => {
    boxes.forEach((b, bi) => { if (overlaps(r, b, 2)) problems.push(`label of link ${li} overlaps box ${bi}`); });
    segRects.forEach((rs, lj) => rs.forEach((s) => { if (overlaps(r, s)) problems.push(`label of link ${li} overlaps link ${lj}`); }));
    labelRects.forEach((o) => { if (o.li > li && overlaps(r, o.r, 2)) problems.push(`labels of links ${li} and ${o.li} overlap`); });
    if (r.x < 0 || r.y < 0 || r.x + r.w > layout.width || r.y + r.h > layout.height) problems.push(`label of link ${li} is outside the canvas`);
  });
  layout.zones.forEach((z, zi) => {
    boxes.forEach((b, bi) => { if (overlaps(z.label, b, 4)) problems.push(`zone ${zi} label overlaps box ${bi}`); });
    segRects.forEach((rs, lj) => rs.forEach((s) => { if (overlaps(z.label, s)) problems.push(`zone ${zi} label overlaps link ${lj}`); }));
    labelRects.forEach(({ li, r }) => { if (overlaps(z.label, r, 2)) problems.push(`zone ${zi} label overlaps label of link ${li}`); });
  });
  if (layout.zones.length === 2 && overlaps(layout.zones[0].label, layout.zones[1].label, 12)) problems.push("zone labels overlap");
  return problems;
}

// SVG path for an orthogonal polyline with rounded inner corners.
export function roundedPath(points: Point[], radius = 12): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const r = Math.min(radius, Math.hypot(cx - px, cy - py) / 2, Math.hypot(nx - cx, ny - cy) / 2);
    const ax = cx - Math.sign(cx - px) * r;
    const ay = cy - Math.sign(cy - py) * r;
    const bx = cx + Math.sign(nx - cx) * r;
    const by = cy + Math.sign(ny - cy) * r;
    d += ` L${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}
