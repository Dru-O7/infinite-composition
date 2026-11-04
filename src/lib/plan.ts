// Pure row planning: what goes in each row of the feed. The DOM layer turns plans into elements.

import { mulberry32, pick } from "./rng";
import type { WorkKind } from "./share";

export type CellPlan =
  | { kind: WorkKind; span: number; seed: number }
  | { kind: "solid"; span: number; color: "red" | "blue" | "yellow" | "white" }
  | { kind: "type"; span: number; color: "white" | "yellow" | "blue" | "red"; word: string };

export type RowPlan = { height: number; cells: CellPlan[] };

// Ways to divide a 12-column row. Asymmetry is the point.
export const ROW_PATTERNS: readonly number[][] = [
  [8, 4], [4, 8], [7, 5], [5, 7], [9, 3], [3, 9],
  [6, 3, 3], [3, 6, 3], [2, 7, 3], [5, 2, 5], [4, 5, 3],
  [3, 3, 6], [2, 2, 8], [6, 6], [12], [4, 4, 4], [3, 2, 4, 3],
];

export const ROW_HEIGHTS = [220, 260, 300, 340, 380, 440];

export const WORDS = [
  "Rhythm", "Balance", "Tension", "Plane", "Line", "Order",
  "Harmony", "Pure", "Axis", "Grid", "Primary", "Abstract",
];

/** Chance that an eligible cell holds a late-style work. Raise for more Boogie-Woogie & Lozenge. */
export const LATE_STYLE_CHANCE = 0.14;

export const isWork = (c: CellPlan): c is Extract<CellPlan, { seed: number }> =>
  c.kind === "classic" || c.kind === "boogie" || c.kind === "lozenge";

export function planRow(seed: number): RowPlan {
  const rng = mulberry32(seed);
  const height = pick(rng, ROW_HEIGHTS);
  const pattern = pick(rng, ROW_PATTERNS);
  const newSeed = () => Math.floor(rng() * 2 ** 31);

  let typeUsed = false;
  let lateUsed = false; // at most one late-style work per row keeps them special
  const cells: CellPlan[] = [];

  for (const span of pattern) {
    const roll = rng();
    if (span <= 2 && roll < 0.6) {
      cells.push({ kind: "solid", span, color: pick(rng, ["red", "blue", "yellow", "white"] as const) });
    } else if (!typeUsed && span >= 3 && span <= 5 && roll < 0.18) {
      typeUsed = true;
      cells.push({
        kind: "type",
        span,
        // Never black: a black word cell merges with the grid lines and reads as a hole.
        color: pick(rng, ["white", "white", "yellow", "blue", "red"] as const),
        word: pick(rng, WORDS),
      });
    } else if (!lateUsed && span >= 3 && roll > 1 - LATE_STYLE_CHANCE) {
      lateUsed = true;
      // Lozenges want a roughly square cell; Boogie-Woogie fills any shape.
      const kind = span >= 4 && span <= 6 && rng() < 0.4 ? "lozenge" : "boogie";
      cells.push({ kind, span, seed: newSeed() });
    } else {
      cells.push({ kind: "classic", span, seed: newSeed() });
    }
  }
  return { height, cells };
}
