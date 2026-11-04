// Procedural neoplastic compositions + infinite scroll.

type Color = "white" | "red" | "blue" | "yellow" | "black";
type Rect = { x: number; y: number; w: number; h: number };

/** Small deterministic PRNG so each composition number always looks the same. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

// White dominates, as in the canon; primaries are accents.
const PALETTE: readonly Color[] = [
  "white", "white", "white", "white", "white", "white",
  "red", "red", "blue", "blue", "yellow", "yellow", "black",
];

// Ways to divide a 12-column row. Asymmetry is the point.
const ROW_PATTERNS: readonly number[][] = [
  [8, 4], [4, 8], [7, 5], [5, 7], [9, 3], [3, 9],
  [6, 3, 3], [3, 6, 3], [2, 7, 3], [5, 2, 5], [4, 5, 3],
  [3, 3, 6], [2, 2, 8], [6, 6], [12], [4, 4, 4], [3, 2, 4, 3],
];

const ROW_HEIGHTS = [220, 260, 300, 340, 380, 440];

const WORDS = [
  "Rhythm", "Balance", "Tension", "Plane", "Line", "Order",
  "Harmony", "Pure", "Axis", "Grid", "Primary", "Abstract",
];

let compNo = 0;
let rowNo = 0;

/** Recursively split a rectangle into planes, Mondrian-style. */
function subdivide(rng: Rng, r: Rect, depth: number, out: Rect[]) {
  const minSide = 14; // percent
  const canSplitV = r.w > minSide * 2;
  const canSplitH = r.h > minSide * 2;
  const stop = depth <= 0 || (!canSplitV && !canSplitH) || (depth < 3 && rng() < 0.28);

  if (stop) {
    out.push(r);
    return;
  }

  // Prefer cutting across the longer side so planes stay balanced.
  const vertical = canSplitV && (!canSplitH || (r.w >= r.h ? rng() < 0.7 : rng() < 0.3));
  const ratio = pick(rng, [0.25, 0.33, 0.38, 0.5, 0.62, 0.67, 0.75]);

  if (vertical) {
    const cut = Math.max(minSide, Math.min(r.w - minSide, r.w * ratio));
    subdivide(rng, { x: r.x, y: r.y, w: cut, h: r.h }, depth - 1, out);
    subdivide(rng, { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h }, depth - 1, out);
  } else {
    const cut = Math.max(minSide, Math.min(r.h - minSide, r.h * ratio));
    subdivide(rng, { x: r.x, y: r.y, w: r.w, h: cut }, depth - 1, out);
    subdivide(rng, { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut }, depth - 1, out);
  }
}

function colorPlanes(rng: Rng, rects: Rect[]): Color[] {
  const colors: Color[] = rects.map(() => pick(rng, PALETTE));
  // Guarantee at least one primary so no work is all white.
  if (!colors.some((c) => c === "red" || c === "blue" || c === "yellow")) {
    // Put the accent on the largest plane for a strong focal point.
    let best = 0;
    rects.forEach((r, i) => {
      if (r.w * r.h > rects[best].w * rects[best].h) best = i;
    });
    colors[best] = pick(rng, ["red", "blue", "yellow"] as const);
  }
  return colors;
}

function paintComposition(comp: HTMLElement, seed: number) {
  const rng = mulberry32(seed);
  const rects: Rect[] = [];
  subdivide(rng, { x: 0, y: 0, w: 100, h: 100 }, 2 + Math.floor(rng() * 3), rects);
  const colors = colorPlanes(rng, rects);

  const existing = comp.querySelectorAll<HTMLElement>(".plane");
  // Reuse nodes where possible so recoloring animates smoothly.
  if (existing.length === rects.length) {
    existing.forEach((el, i) => (el.style.backgroundColor = `var(--${colors[i]})`));
    return;
  }

  const frag = document.createDocumentFragment();
  rects.forEach((r, i) => {
    const p = document.createElement("div");
    p.className = "plane";
    // Inset each plane by half a line so the black canvas shows through as the grid.
    p.style.left = `calc(${r.x}% + ${r.x === 0 ? "0px" : "var(--line) / 2"})`;
    p.style.top = `calc(${r.y}% + ${r.y === 0 ? "0px" : "var(--line) / 2"})`;
    p.style.width = `calc(${r.w}% - ${(r.x === 0 ? 0 : 0.5) + (r.x + r.w >= 99.999 ? 0 : 0.5)} * var(--line))`;
    p.style.height = `calc(${r.h}% - ${(r.y === 0 ? 0 : 0.5) + (r.y + r.h >= 99.999 ? 0 : 0.5)} * var(--line))`;
    p.style.backgroundColor = `var(--${colors[i]})`;
    frag.appendChild(p);
  });
  comp.replaceChildren(frag);
}

function makeCompositionCell(rng: Rng, span: number): HTMLElement {
  const no = ++compNo;
  let seed = Math.floor(rng() * 2 ** 31);

  const cell = document.createElement("div");
  cell.className = `cell span-${span}`;

  const comp = document.createElement("div");
  comp.className = "comp";
  comp.tabIndex = 0;
  comp.setAttribute("role", "button");
  comp.setAttribute("aria-label", `Composition No. ${no}. Activate to recompose.`);
  paintComposition(comp, seed);

  const recompose = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    paintComposition(comp, seed);
  };
  comp.addEventListener("click", recompose);
  comp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      recompose();
    }
  });

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = `Composition No. ${String(no).padStart(3, "0")}`;

  cell.append(comp, caption);
  return cell;
}

function makeSolidCell(rng: Rng, span: number): HTMLElement {
  const cell = document.createElement("div");
  cell.className = `cell span-${span} c-${pick(rng, ["red", "blue", "yellow", "white"] as const)}`;
  return cell;
}

function makeTypeCell(rng: Rng, span: number): HTMLElement {
  const cell = document.createElement("div");
  const color = pick(rng, ["white", "white", "yellow", "blue", "red", "black"] as const);
  cell.className = `cell span-${span} type-cell c-${color}`;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = `Row ${String(rowNo).padStart(3, "0")}`;
  const big = document.createElement("span");
  big.className = "big";
  big.textContent = pick(rng, WORDS);
  cell.append(label, big);
  return cell;
}

function makeRow(rng: Rng): HTMLElement {
  rowNo++;
  const row = document.createElement("div");
  row.className = "row enter";
  row.style.setProperty("--h", `${pick(rng, ROW_HEIGHTS)}px`);

  const pattern = pick(rng, ROW_PATTERNS);
  let typeUsed = false;

  for (const span of pattern) {
    const roll = rng();
    let cell: HTMLElement;
    if (span <= 2 && roll < 0.6) {
      cell = makeSolidCell(rng, span);
    } else if (!typeUsed && span >= 3 && span <= 5 && roll < 0.18) {
      cell = makeTypeCell(rng, span);
      typeUsed = true;
    } else {
      cell = makeCompositionCell(rng, span);
    }
    row.appendChild(cell);
  }
  return row;
}

export function initFeed() {
  const feed = document.getElementById("feed")!;
  const sentinel = document.getElementById("sentinel")!;
  const count = document.getElementById("count")!;
  const rng = mulberry32(Date.now() & 0xffffffff);
  const BATCH = 6;

  const loadBatch = () => {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < BATCH; i++) frag.appendChild(makeRow(rng));
    feed.appendChild(frag);
    count.textContent = String(compNo);
  };

  loadBatch();

  // Load ahead of the viewport so the canvas never seems to end.
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        loadBatch();
        // Re-observing fires a fresh check, so very tall screens keep filling.
        io.unobserve(sentinel);
        io.observe(sentinel);
      }
    },
    { rootMargin: "0px 0px 1200px 0px" },
  );
  io.observe(sentinel);
}
