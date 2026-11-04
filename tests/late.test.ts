import { describe, expect, it } from "vitest";
import { drawBoogie, drawLozenge } from "../src/lib/late";

type Call = [string, ...number[]] | ["fillStyle", string];

/** A stand-in 2D context that records what would be drawn. */
function recorder() {
  const calls: Call[] = [];
  const ctx = {
    set fillStyle(v: string) {
      calls.push(["fillStyle", v]);
    },
    fillRect: (...a: number[]) => calls.push(["fillRect", ...a]),
    clearRect: (...a: number[]) => calls.push(["clearRect", ...a]),
    moveTo: (...a: number[]) => calls.push(["moveTo", ...a]),
    lineTo: (...a: number[]) => calls.push(["lineTo", ...a]),
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    clip() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const rects = (calls: Call[]) => calls.filter((c) => c[0] === "fillRect").map((c) => c.slice(1) as number[]);

describe.each([
  ["Boogie-Woogie", drawBoogie],
  ["Lozenge", drawLozenge],
])("%s", (_name, draw) => {
  it("draws the same thing for the same seed", () => {
    const a = recorder();
    const b = recorder();
    draw(a.ctx, 600, 400, 42);
    draw(b.ctx, 600, 400, 42);
    expect(a.calls).toEqual(b.calls);
  });

  it("draws something different for a different seed", () => {
    const a = recorder();
    const b = recorder();
    draw(a.ctx, 600, 400, 1);
    draw(b.ctx, 600, 400, 2);
    expect(a.calls).not.toEqual(b.calls);
  });

  it("depends only on aspect ratio, so downloads match the screen", () => {
    const small = recorder();
    const large = recorder();
    draw(small.ctx, 300, 200, 7);
    draw(large.ctx, 1200, 800, 7);
    const s = rects(small.calls);
    const l = rects(large.calls);
    expect(l.length).toBe(s.length);
    // Every shape scales by 4 (within rounding).
    s.forEach((r, i) => r.forEach((v, k) => expect(Math.abs(l[i][k] - v * 4)).toBeLessThanOrEqual(4)));
  });
});

describe("drawBoogie", () => {
  it("stays inside the canvas", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { ctx, calls } = recorder();
      drawBoogie(ctx, 640, 360, seed);
      for (const [x, y, w, h] of rects(calls)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(640);
        expect(y + h).toBeLessThanOrEqual(360);
      }
    }
  });
});

describe("drawLozenge", () => {
  it("draws a diamond centred in the canvas", () => {
    const { ctx, calls } = recorder();
    drawLozenge(ctx, 500, 300, 3);
    const points = calls.filter((c) => c[0] === "moveTo" || c[0] === "lineTo").map((c) => c.slice(1));
    const R = 150 * 0.9;
    expect(points).toEqual([
      [250, 150 - R],
      [250 + R, 150],
      [250, 150 + R],
      [250 - R, 150],
    ]);
  });
});
