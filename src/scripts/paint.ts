// Painting works into the DOM (feed cells, the viewer) and into offscreen canvases (exports, thumbnails).

import { composeClassic, drawClassic, planeGeometry, type Plane } from "../lib/classic";
import { drawBoogie, drawLozenge } from "../lib/late";
import { HEX } from "../lib/palette";
import type { WorkKind } from "../lib/share";

export const ANIM_MS = 650;
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const planeOf = new WeakMap<HTMLElement, Plane>();

function setGeometry(el: HTMLElement, g: ReturnType<typeof planeGeometry>) {
  el.style.left = g.left;
  el.style.top = g.top;
  el.style.width = g.width;
  el.style.height = g.height;
}

/** A zero-size box at a plane's centre, for planes that grow in or shrink away. */
function collapsed(p: Plane) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return { left: `calc(${cx}% + 0px)`, top: `calc(${cy}% + 0px)`, width: "0px", height: "0px" };
}

export function paintClassic(el: HTMLElement, seed: number, animate: boolean) {
  const { planes } = composeClassic(seed);
  const old = Array.from(el.querySelectorAll<HTMLElement>(":scope > .plane:not(.leaving)"));

  if (!animate || !old.length || reducedMotion.matches) {
    el.replaceChildren(
      ...planes.map((p) => {
        const d = document.createElement("div");
        d.className = "plane";
        setGeometry(d, planeGeometry(p));
        d.style.backgroundColor = `var(--${p.color})`;
        planeOf.set(d, p);
        return d;
      }),
    );
    return;
  }

  // Match each new plane to the nearest old one so lines slide rather than jump.
  const centre = (p: Plane) => [p.x + p.w / 2, p.y + p.h / 2];
  const free = new Set(old);
  const pairs: [HTMLElement, Plane][] = [];
  const bySize = [...planes].sort((a, b) => b.w * b.h - a.w * a.h);

  for (const p of bySize) {
    const [px, py] = centre(p);
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const o of free) {
      const [ox, oy] = centre(planeOf.get(o)!);
      const d = Math.hypot(px - ox, py - oy);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      free.delete(best);
      pairs.push([best, p]);
    } else {
      // A new plane grows out of whichever old plane covered its centre.
      const d = document.createElement("div");
      d.className = "plane";
      const parent = old.find((o) => {
        const q = planeOf.get(o)!;
        return px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h;
      });
      const from = parent ? planeOf.get(parent)! : p;
      setGeometry(d, parent ? planeGeometry(from) : collapsed(p));
      d.style.backgroundColor = `var(--${from.color})`;
      el.appendChild(d);
      pairs.push([d, p]);
    }
  }

  void el.offsetWidth; // commit start positions before transitioning

  for (const [d, p] of pairs) {
    setGeometry(d, planeGeometry(p));
    d.style.backgroundColor = `var(--${p.color})`;
    planeOf.set(d, p);
  }
  for (const o of free) {
    o.classList.add("leaving");
    setGeometry(o, collapsed(planeOf.get(o)!));
    setTimeout(() => o.remove(), ANIM_MS);
  }
}

function drawLate(kind: WorkKind, ctx: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  if (kind === "boogie") drawBoogie(ctx, W, H, seed);
  else drawLozenge(ctx, W, H, seed);
}

/** Paint a late-style work into an on-screen canvas at its displayed size. */
export function paintCanvas(canvas: HTMLCanvasElement, kind: WorkKind, seed: number, animate: boolean) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return; // not laid out yet; a ResizeObserver will call again

  if (animate && canvas.width && !reducedMotion.matches) {
    // Keep a snapshot of the old work underneath and wipe the new one in over it.
    const under = document.createElement("canvas");
    under.className = "work-canvas under";
    under.width = canvas.width;
    under.height = canvas.height;
    under.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.before(under);
    canvas.classList.remove("wipe");
    void canvas.offsetWidth;
    canvas.classList.add("wipe");
    setTimeout(() => under.remove(), ANIM_MS);
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) drawLate(kind, ctx, W, H, seed);
}

/** Paint a work of either family into its element (a div for classic, a canvas otherwise). */
export function paintWork(el: HTMLElement, kind: WorkKind, seed: number, animate: boolean) {
  if (kind === "classic") paintClassic(el, seed, animate);
  else paintCanvas(el as HTMLCanvasElement, kind, seed, animate);
}

/** A fresh, empty element for a work of this kind. */
export function workElement(kind: WorkKind): HTMLElement {
  const el = document.createElement(kind === "classic" ? "div" : "canvas");
  el.className = kind === "classic" ? "comp" : "comp work-canvas";
  return el;
}

/** Draw a work into a new offscreen canvas. `line` is the classic base line width in px. */
export function renderWork(kind: WorkKind, seed: number, W: number, H: number, line: number) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (kind === "classic") {
    drawClassic(ctx, W, H, composeClassic(seed), line);
  } else {
    drawLate(kind, ctx, W, H, seed);
    ctx.globalCompositeOperation = "destination-over"; // lozenge corners: black like the wall
    ctx.fillStyle = HEX.black;
    ctx.fillRect(0, 0, W, H);
  }
  return canvas;
}

/** Size of an export with the given aspect ratio and long side. */
export function exportSize(aspect: number, longSide: number) {
  return aspect >= 1
    ? { w: longSide, h: Math.round(longSide / aspect) }
    : { w: Math.round(longSide * aspect), h: longSide };
}

/** The element's base line width (the --line token) as a share of its width. */
export function lineShare(el: HTMLElement) {
  const line = parseFloat(getComputedStyle(el).getPropertyValue("--line")) || 10;
  return el.clientWidth ? line / el.clientWidth : 0.02;
}
