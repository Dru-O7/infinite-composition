// Canvas generators for Mondrian's late styles.
// The result depends only on the seed and the canvas's aspect ratio, so a work looks the same
// on screen, in a shared link and in a high-resolution download.

import { HEX } from "./palette";
import { int, mulberry32, pick } from "./rng";

/** Cells along the shorter side of a Boogie-Woogie grid. */
const BOOGIE_UNITS = 28;

/**
 * Boogie-Woogie (after Broadway Boogie Woogie, 1942–43): yellow streets on white,
 * broken into small red/blue/grey squares, with larger blocks resting between them.
 */
export function drawBoogie(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const rng = mulberry32(seed);
  const unit = Math.min(W, H) / BOOGIE_UNITS;
  const NX = Math.max(8, Math.round(W / unit));
  const NY = Math.max(8, Math.round(H / unit));
  const px = (k: number) => Math.round((k * W) / NX);
  const py = (k: number) => Math.round((k * H) / NY);
  const cell = (cx: number, cy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px(cx), py(cy), px(cx + w) - px(cx), py(cy + h) - py(cy));
  };

  ctx.fillStyle = HEX.white;
  ctx.fillRect(0, 0, W, H);

  const streets = (N: number) => {
    const out: number[] = [];
    let p = int(rng, 1, 3);
    while (p < N - 1) {
      out.push(p);
      p += int(rng, 2, 7);
    }
    return out;
  };
  const xs = streets(NX);
  const ys = streets(NY);

  // Most streets run the full length; one in five runs between two cross streets.
  const span = (cross: number[], N: number): [number, number] => {
    if (rng() > 0.2 || cross.length < 3) return [0, N];
    const a = int(rng, 0, cross.length - 2);
    const b = int(rng, a + 1, cross.length - 1);
    return [rng() < 0.5 ? 0 : cross[a], rng() < 0.5 ? N : cross[b] + 1];
  };
  const vLines = xs.map((x) => ({ x, s: span(ys, NY) }));
  const hLines = ys.map((y) => ({ y, s: span(xs, NX) }));

  vLines.forEach((l) => cell(l.x, l.s[0], 1, l.s[1] - l.s[0], HEX.yellow));
  hLines.forEach((l) => cell(l.s[0], l.y, l.s[1] - l.s[0], 1, HEX.yellow));

  // Small squares along each street, never two of the same colour in a row.
  const noteColor = (prev: string | null) => {
    let c: string;
    do {
      const r = rng();
      c = r < 0.4 ? HEX.red : r < 0.72 ? HEX.blue : HEX.grey;
    } while (c === prev);
    return c;
  };
  const walk = (fixed: number, s: [number, number], vertical: boolean) => {
    let prev: string | null = null;
    for (let k = s[0]; k < s[1]; k++) {
      if (rng() < 0.3) {
        prev = noteColor(prev);
        if (vertical) cell(fixed, k, 1, 1, prev);
        else cell(k, fixed, 1, 1, prev);
        k += int(rng, 0, 1);
      } else prev = null;
    }
  };
  vLines.forEach((l) => walk(l.x, l.s, true));
  hLines.forEach((l) => walk(l.y, l.s, false));

  // Larger blocks resting against a street.
  const gapsOf = (lines: number[], N: number) => {
    const g: [number, number][] = [];
    const all = [-1, ...lines, N];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i] + 1;
      const b = all[i + 1];
      if (b - a >= 2) g.push([a, b]);
    }
    return g;
  };
  const gx = gapsOf(xs, NX);
  const gy = gapsOf(ys, NY);
  if (!gx.length || !gy.length) return;

  const blocks = Math.round(int(rng, 6, 10) * Math.sqrt((NX * NY) / (BOOGIE_UNITS * BOOGIE_UNITS)));
  for (let i = 0; i < blocks; i++) {
    const [x0, x1] = pick(rng, gx);
    const [y0, y1] = pick(rng, gy);
    const w = int(rng, 2, Math.min(7, x1 - x0));
    const h = int(rng, 2, Math.min(7, y1 - y0));
    const bx = rng() < 0.5 ? x0 : x1 - w;
    const by = rng() < 0.5 ? y0 : y1 - h;
    const outer = pick(rng, [HEX.red, HEX.blue, HEX.yellow, HEX.red, HEX.blue]);
    cell(bx, by, w, h, outer);
    if (w >= 3 && h >= 3 && rng() < 0.55) {
      const iw = Math.floor(w / 2);
      const ih = Math.floor(h / 2);
      const inner = pick(rng, [HEX.red, HEX.blue, HEX.yellow, HEX.grey, HEX.white].filter((c) => c !== outer));
      cell(bx + Math.floor((w - iw) / 2), by + Math.floor((h - ih) / 2), iw, ih, inner);
    }
  }
}

/**
 * Lozenge (after the diamond paintings, 1918–44): a square canvas hung on its corner.
 * Lines stay horizontal and vertical, so the diagonal edges crop them.
 * Outside the diamond is left transparent.
 */
export function drawLozenge(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const rng = mulberry32(seed);
  ctx.clearRect(0, 0, W, H);

  const R = (Math.min(W, H) / 2) * 0.9;
  const cx = W / 2;
  const cy = H / 2;
  const L = cx - R;
  const T = cy - R;
  const S = R * 2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, T);
  ctx.lineTo(L + S, cy);
  ctx.lineTo(cx, T + S);
  ctx.lineTo(L, cy);
  ctx.closePath();
  ctx.fillStyle = HEX.white;
  ctx.fill();
  ctx.clip();

  const positions = (n: number) => {
    const out: number[] = [];
    let tries = 0;
    while (out.length < n && tries++ < 60) {
      const p = 0.12 + rng() * 0.76;
      if (out.every((q) => Math.abs(q - p) > 0.11)) out.push(p);
    }
    return out.sort((a, b) => a - b);
  };
  const minimal = rng() < 0.25; // like Lozenge with Two Lines
  const xs = positions(minimal ? 1 : int(rng, 1, 4));
  const ys = positions(minimal ? 1 : int(rng, 1, 4));
  const weight = () => S * (0.014 + rng() * 0.022);
  const vw = xs.map(weight);
  const hw = ys.map(weight);

  if (!minimal) {
    // Prefer cells the diamond crops, so colour seems to carry on past the frame.
    const bx = [0, ...xs, 1];
    const by = [0, ...ys, 1];
    const cells: { i: number; j: number }[] = [];
    for (let i = 0; i < bx.length - 1; i++) {
      for (let j = 0; j < by.length - 1; j++) {
        const mx = (bx[i] + bx[i + 1]) / 2 - 0.5;
        const my = (by[j] + by[j + 1]) / 2 - 0.5;
        const d = Math.abs(mx) + Math.abs(my);
        if (d < 0.62) {
          const copies = d > 0.3 ? 3 : 1;
          for (let k = 0; k < copies; k++) cells.push({ i, j });
        }
      }
    }
    const palette = [HEX.red, HEX.blue, HEX.yellow];
    const start = int(rng, 0, 2);
    const used = new Set<string>();
    const count = int(rng, 1, 3);
    for (let k = 0; k < count; k++) {
      const pool = cells.filter((c) => !used.has(`${c.i},${c.j}`));
      if (!pool.length) break;
      const c = pick(rng, pool);
      used.add(`${c.i},${c.j}`);
      ctx.fillStyle = palette[(start + k) % 3];
      ctx.fillRect(L + bx[c.i] * S, T + by[c.j] * S, (bx[c.i + 1] - bx[c.i]) * S, (by[c.j + 1] - by[c.j]) * S);
    }
  }

  ctx.fillStyle = HEX.black;
  xs.forEach((x, k) => ctx.fillRect(L + x * S - vw[k] / 2, T, vw[k], S));
  ys.forEach((y, k) => ctx.fillRect(L, T + y * S - hw[k] / 2, S, hw[k]));
  ctx.restore();
}
