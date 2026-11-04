// Classic neoplastic compositions: recursive subdivision, varied line weights, balanced colour.

import { HEX } from "./palette";
import { int, mulberry32, pick, type Rng } from "./rng";

export type Color = "white" | "red" | "blue" | "yellow" | "black";
/** Line weight on each side of a plane, as a multiple of the base line. 0 = canvas edge. */
export type Edges = { l: number; t: number; r: number; b: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Plane = Rect & { edges: Edges; color: Color };
export type Classic = { planes: Plane[] };

const PRIMARIES = ["red", "blue", "yellow"] as const;
/** Planes smaller than this share of the canvas never take a primary. */
export const SMALL_PLANE = 0.025;
/** Primaries may cover at most this share of the canvas (unless a single accent needs more). */
export const MAX_COLOR_AREA = 0.5;
const MIN_SIDE = 14; // percent
const EPS = 1e-6;

type Box = Rect & { edges: Edges };

function subdivide(rng: Rng, r: Box, depth: number, weight: () => number, out: Box[]) {
  const canSplitV = r.w > MIN_SIDE * 2;
  const canSplitH = r.h > MIN_SIDE * 2;
  const stop = depth <= 0 || (!canSplitV && !canSplitH) || (depth < 3 && rng() < 0.28);
  if (stop) {
    out.push(r);
    return;
  }

  // Prefer cutting across the longer side so planes stay balanced.
  const vertical = canSplitV && (!canSplitH || (r.w >= r.h ? rng() < 0.7 : rng() < 0.3));
  const ratio = pick(rng, [0.25, 0.33, 0.38, 0.5, 0.62, 0.67, 0.75]);
  const w = weight();

  if (vertical) {
    const cut = Math.max(MIN_SIDE, Math.min(r.w - MIN_SIDE, r.w * ratio));
    subdivide(rng, { x: r.x, y: r.y, w: cut, h: r.h, edges: { ...r.edges, r: w } }, depth - 1, weight, out);
    subdivide(rng, { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h, edges: { ...r.edges, l: w } }, depth - 1, weight, out);
  } else {
    const cut = Math.max(MIN_SIDE, Math.min(r.h - MIN_SIDE, r.h * ratio));
    subdivide(rng, { x: r.x, y: r.y, w: r.w, h: cut, edges: { ...r.edges, b: w } }, depth - 1, weight, out);
    subdivide(rng, { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut, edges: { ...r.edges, t: w } }, depth - 1, weight, out);
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

/** True when two rectangles share a stretch of edge (touching corners don't count). */
export function adjacent(a: Rect, b: Rect): boolean {
  const sideBySide = (near(a.x + a.w, b.x) || near(b.x + b.w, a.x)) && overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  const stacked = (near(a.y + a.h, b.y) || near(b.y + b.h, a.y)) && overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  return sideBySide || stacked;
}

export const isPrimary = (c: Color) => c === "red" || c === "blue" || c === "yellow";

/**
 * Balance rules:
 * - white dominates; primaries cover at most half the canvas
 * - tiny planes never carry a primary (they may be black)
 * - neighbouring planes never share a colour
 * - every work has at least one primary, on its largest plane if needed
 */
export function colorPlanes(rng: Rng, rects: Rect[]): Color[] {
  const n = rects.length;
  const colors: Color[] = Array(n).fill("white");
  const area = rects.map((r) => (r.w * r.h) / 10000);
  const neighbours = rects.map((a, i) => rects.flatMap((b, j) => (i !== j && adjacent(a, b) ? [j] : [])));
  const clashes = (i: number, c: Color) => neighbours[i].some((j) => colors[j] === c);
  const order = [...rects.keys()].sort((a, b) => area[b] - area[a]);

  let colored = 0;
  for (const i of order) {
    if (area[i] < SMALL_PLANE) {
      if (rng() < 0.2 && !clashes(i, "black")) colors[i] = "black";
      continue;
    }
    if (rng() < 0.42 && colored + area[i] <= MAX_COLOR_AREA) {
      const ok = PRIMARIES.filter((c) => !clashes(i, c));
      const fresh = ok.filter((c) => !colors.includes(c)); // vary the primaries
      const pool = fresh.length ? fresh : ok;
      if (pool.length) {
        colors[i] = pick(rng, pool);
        colored += area[i];
      }
    }
  }

  if (!colors.some(isPrimary)) {
    const i = order.find((k) => area[k] >= SMALL_PLANE) ?? order[0];
    colors[i] = pick(rng, PRIMARIES);
  }
  return colors;
}

/** Build a classic composition from a seed. Pure data; geometry in percent of the cell. */
export function composeClassic(seed: number): Classic {
  const rng = mulberry32(seed);
  // Some works keep one even line; most vary weights per line, as Mondrian did.
  const varied = rng() < 0.7;
  const weight = varied ? () => pick(rng, [0.5, 0.75, 1, 1, 1.35, 1.8]) : () => 1;
  const boxes: Box[] = [];
  subdivide(rng, { x: 0, y: 0, w: 100, h: 100, edges: { l: 0, t: 0, r: 0, b: 0 } }, int(rng, 2, 4), weight, boxes);
  const colors = colorPlanes(rng, boxes);
  return { planes: boxes.map((b, i) => ({ ...b, color: colors[i] })) };
}

/** CSS geometry for a plane: inset by half of each neighbouring line's weight. */
export function planeGeometry(p: Rect & { edges: Edges }) {
  const { l, t, r, b } = p.edges;
  return {
    left: `calc(${p.x}% + ${l / 2} * var(--line))`,
    top: `calc(${p.y}% + ${t / 2} * var(--line))`,
    width: `calc(${p.w}% - ${(l + r) / 2} * var(--line))`,
    height: `calc(${p.h}% - ${(t + b) / 2} * var(--line))`,
  };
}

/** Draw a composition to a canvas (used for PNG export). `line` is the base line width in px. */
export function drawClassic(ctx: CanvasRenderingContext2D, W: number, H: number, comp: Classic, line: number) {
  ctx.fillStyle = HEX.black;
  ctx.fillRect(0, 0, W, H);
  for (const p of comp.planes) {
    const { l, t, r, b } = p.edges;
    ctx.fillStyle = HEX[p.color];
    ctx.fillRect(
      (p.x / 100) * W + (l * line) / 2,
      (p.y / 100) * H + (t * line) / 2,
      (p.w / 100) * W - ((l + r) * line) / 2,
      (p.h / 100) * H - ((t + b) * line) / 2,
    );
  }
}
