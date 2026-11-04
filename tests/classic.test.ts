import { describe, expect, it } from "vitest";
import {
  adjacent,
  colorPlanes,
  composeClassic,
  isPrimary,
  MAX_COLOR_AREA,
  SMALL_PLANE,
  type Plane,
} from "../src/lib/classic";
import { mulberry32 } from "../src/lib/rng";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const area = (p: Plane) => (p.w * p.h) / 10000;

describe("composeClassic", () => {
  it("is deterministic for a seed", () => {
    for (const s of SEEDS.slice(0, 20)) expect(composeClassic(s)).toEqual(composeClassic(s));
  });

  it("tiles the whole canvas with no gaps or overlaps", () => {
    for (const s of SEEDS) {
      const { planes } = composeClassic(s);
      const total = planes.reduce((sum, p) => sum + p.w * p.h, 0);
      expect(total).toBeCloseTo(10000, 6);
      for (let i = 0; i < planes.length; i++) {
        for (let j = i + 1; j < planes.length; j++) {
          const a = planes[i];
          const b = planes[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ox > 1e-6 && oy > 1e-6, `seed ${s}: planes ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
  });

  it("puts no line on the canvas edge and a line on every inner edge", () => {
    for (const s of SEEDS) {
      for (const p of composeClassic(s).planes) {
        const onEdge = { l: p.x < 1e-6, t: p.y < 1e-6, r: p.x + p.w > 100 - 1e-6, b: p.y + p.h > 100 - 1e-6 };
        for (const side of ["l", "t", "r", "b"] as const) {
          if (onEdge[side]) expect(p.edges[side]).toBe(0);
          else expect(p.edges[side]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("varies line weights in some works", () => {
    const varied = SEEDS.filter((s) => {
      const weights = new Set(composeClassic(s).planes.flatMap((p) => Object.values(p.edges)).filter((w) => w > 0));
      return weights.size > 1;
    });
    expect(varied.length).toBeGreaterThan(SEEDS.length * 0.3);
  });
});

describe("balance rules", () => {
  it("never gives neighbouring planes the same colour (except white)", () => {
    for (const s of SEEDS) {
      const { planes } = composeClassic(s);
      for (let i = 0; i < planes.length; i++) {
        for (let j = i + 1; j < planes.length; j++) {
          if (planes[i].color !== "white" && adjacent(planes[i], planes[j])) {
            expect(planes[j].color, `seed ${s}`).not.toBe(planes[i].color);
          }
        }
      }
    }
  });

  it("keeps primaries off tiny planes", () => {
    for (const s of SEEDS) {
      for (const p of composeClassic(s).planes) {
        if (area(p) < SMALL_PLANE) expect(isPrimary(p.color)).toBe(false);
      }
    }
  });

  it("always has at least one primary", () => {
    for (const s of SEEDS) expect(composeClassic(s).planes.some((p) => isPrimary(p.color))).toBe(true);
  });

  it("limits colour to half the canvas unless one accent plane needs more", () => {
    for (const s of SEEDS) {
      const colored = composeClassic(s).planes.filter((p) => isPrimary(p.color));
      const share = colored.reduce((sum, p) => sum + area(p), 0);
      expect(share <= MAX_COLOR_AREA + 1e-9 || colored.length === 1, `seed ${s}`).toBe(true);
    }
  });

  it("colours a single plane with a primary", () => {
    const colors = colorPlanes(mulberry32(1), [{ x: 0, y: 0, w: 100, h: 100 }]);
    expect(isPrimary(colors[0])).toBe(true);
  });
});

describe("adjacent", () => {
  it("counts shared edges but not shared corners", () => {
    const a = { x: 0, y: 0, w: 50, h: 50 };
    expect(adjacent(a, { x: 50, y: 0, w: 50, h: 50 })).toBe(true);
    expect(adjacent(a, { x: 0, y: 50, w: 50, h: 50 })).toBe(true);
    expect(adjacent(a, { x: 50, y: 50, w: 50, h: 50 })).toBe(false);
  });
});
