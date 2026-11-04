// The feed: turns row plans into DOM, keeps memory flat while scrolling, and wires up interaction.

import { composeClassic, drawClassic, planeGeometry, type Plane } from "../lib/classic";
import { drawBoogie, drawLozenge } from "../lib/late";
import { HEX } from "../lib/palette";
import { isWork, planRow, type RowPlan } from "../lib/plan";
import { hash, nextSeed } from "../lib/rng";
import { buildUrl, KIND_NAMES, parseSeed, parseWork, type SharedWork, type WorkKind } from "../lib/share";

type Work = {
  no: number; // 0 = the shared work at the top
  kind: WorkKind;
  seed: number;
  el: HTMLElement; // the focusable artwork (div for classic, canvas for late styles)
  cell: HTMLElement;
};

type RowRecord = {
  index: number;
  plan: RowPlan;
  startNo: number;
  el: HTMLElement;
  freed: boolean;
};

const BATCH = 6;
/** Rows further than this from the viewport are emptied and rebuilt on return. */
const KEEP_MARGIN = "4000px";
const EXPORT_LONG_SIDE = 2400;
const ANIM_MS = 650;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const works = new WeakMap<Element, Work>();
const planeOf = new WeakMap<HTMLElement, Plane>();
const rowOf = new WeakMap<Element, RowRecord>();
/** Recomposed works keep their new seed even after their row is freed and rebuilt. */
const overrides = new Map<number, number>();

let masterSeed = 0;
let rowCount = 0;
let nextNo = 1;

// ---------------------------------------------------------------- painting

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

function paintClassic(el: HTMLElement, seed: number, animate: boolean) {
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

function paintCanvas(work: Work, animate: boolean) {
  const canvas = work.el as HTMLCanvasElement;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return; // not laid out yet; the ResizeObserver will call again

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
  if (ctx) drawLate(work.kind, ctx, W, H, work.seed);
}

const canvasRO = new ResizeObserver((entries) => {
  for (const e of entries) {
    const w = works.get(e.target);
    if (w) paintCanvas(w, false);
  }
});

// ---------------------------------------------------------------- cells

const ICONS = {
  recompose:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5V5h-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>',
  download:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>',
  link:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>',
};

function workLabel(w: { no: number; kind: WorkKind }) {
  return w.no === 0 ? `Shared ${KIND_NAMES[w.kind]}` : `${KIND_NAMES[w.kind]} No. ${String(w.no).padStart(3, "0")}`;
}

function makeWorkCell(kind: WorkKind, span: number, no: number, seed: number): HTMLElement {
  const cell = document.createElement("div");
  cell.className = `cell span-${span}${kind === "boogie" ? " c-white" : ""}`;

  const el = document.createElement(kind === "classic" ? "div" : "canvas");
  el.className = kind === "classic" ? "comp" : "comp work-canvas";
  el.tabIndex = 0;
  el.dataset.work = kind;
  el.setAttribute("role", "button");

  const work: Work = { no, kind, seed: overrides.get(no) ?? seed, el, cell };
  works.set(el, work);
  el.setAttribute("aria-label", `${workLabel(work)}. Enter to recompose, D to download, L to copy a link.`);

  if (kind === "classic") paintClassic(el, work.seed, false);
  else canvasRO.observe(el);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = workLabel(work);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [action, label] of [
    ["recompose", "Recompose (R)"],
    ["download", "Download PNG (D)"],
    ["link", "Copy link (L)"],
  ] as const) {
    const b = document.createElement("button");
    b.type = "button";
    b.tabIndex = -1; // keyboard users have the R / D / L shortcuts on the focused work
    b.dataset.action = action;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = ICONS[action];
    actions.appendChild(b);
  }

  cell.append(el, caption, actions);
  return cell;
}

function makeSolidCell(span: number, color: string) {
  const cell = document.createElement("div");
  cell.className = `cell span-${span} c-${color}`;
  return cell;
}

function makeTypeCell(span: number, color: string, word: string, rowIndex: number) {
  const cell = document.createElement("div");
  cell.className = `cell span-${span} type-cell c-${color}`;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = `Row ${String(rowIndex).padStart(3, "0")}`;
  const big = document.createElement("span");
  big.className = "big";
  big.textContent = word;
  cell.append(label, big);
  return cell;
}

// ---------------------------------------------------------------- rows

function buildRow(rec: RowRecord) {
  let no = rec.startNo;
  const cells = rec.plan.cells.map((c) => {
    if (c.kind === "solid") return makeSolidCell(c.span, c.color);
    if (c.kind === "type") return makeTypeCell(c.span, c.color, c.word, rec.index);
    return makeWorkCell(c.kind, c.span, no++, c.seed);
  });
  rec.el.replaceChildren(...cells);
}

function freeRow(rec: RowRecord) {
  rec.el.style.height = `${rec.el.offsetHeight}px`;
  rec.el.querySelectorAll("canvas[data-work]").forEach((c) => canvasRO.unobserve(c));
  rec.el.replaceChildren();
  rec.el.classList.add("freed");
  rec.freed = true;
}

function restoreRow(rec: RowRecord) {
  buildRow(rec);
  rec.el.style.height = "";
  rec.el.classList.remove("freed");
  rec.freed = false;
}

const rowIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const rec = rowOf.get(e.target);
      if (!rec) continue;
      if (!e.isIntersecting && !rec.freed) freeRow(rec);
      else if (e.isIntersecting && rec.freed) restoreRow(rec);
    }
  },
  { rootMargin: `${KEEP_MARGIN} 0px` },
);

function appendRow(feed: HTMLElement) {
  const index = ++rowCount;
  // Each row has its own seed derived from the feed seed, so any row can be rebuilt exactly.
  const plan = planRow(hash(masterSeed, index));
  const el = document.createElement("div");
  el.className = "row enter";
  el.style.setProperty("--h", `${plan.height}px`);
  el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });

  const rec: RowRecord = { index, plan, startNo: nextNo, el, freed: false };
  nextNo += plan.cells.filter(isWork).length;
  rowOf.set(el, rec);
  buildRow(rec);
  feed.appendChild(el);
  rowIO.observe(el);
}

// ---------------------------------------------------------------- actions

let toastTimer = 0;
function toast(message: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function recompose(work: Work) {
  work.seed = nextSeed(work.seed);
  if (work.no > 0) overrides.set(work.no, work.seed);
  if (work.kind === "classic") paintClassic(work.el, work.seed, true);
  else paintCanvas(work, true);
}

function aspectOf(work: Work) {
  const r = work.cell.getBoundingClientRect();
  return r.width && r.height ? r.width / r.height : 1;
}

function download(work: Work) {
  const aspect = aspectOf(work);
  const W = aspect >= 1 ? EXPORT_LONG_SIDE : Math.round(EXPORT_LONG_SIDE * aspect);
  const H = aspect >= 1 ? Math.round(EXPORT_LONG_SIDE / aspect) : EXPORT_LONG_SIDE;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (work.kind === "classic") {
    const lineCss = parseFloat(getComputedStyle(work.el).getPropertyValue("--line")) || 10;
    drawClassic(ctx, W, H, composeClassic(work.seed), lineCss * (W / work.cell.clientWidth));
  } else {
    drawLate(work.kind, ctx, W, H, work.seed);
    ctx.globalCompositeOperation = "destination-over"; // lozenge corners: black like the wall
    ctx.fillStyle = HEX.black;
    ctx.fillRect(0, 0, W, H);
  }

  canvas.toBlob((blob) => {
    if (!blob) return toast("Couldn't create the image. Try again.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${KIND_NAMES[work.kind].toLowerCase()}-${work.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Downloaded ${workLabel(work)}`);
  }, "image/png");
}

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) return toast("Copy failed. Your browser blocked clipboard access.");
  }
  toast(done);
}

function copyLink(work: Work) {
  const shared: SharedWork = { kind: work.kind, seed: work.seed, aspect: aspectOf(work) };
  copyText(buildUrl(location.href, { seed: masterSeed, work: shared }), `Link to ${workLabel(work)} copied`);
}

// ---------------------------------------------------------------- keyboard

function focusWork(el: HTMLElement | undefined) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
}

function move(from: HTMLElement, dir: "left" | "right" | "up" | "down") {
  const all = Array.from(document.querySelectorAll<HTMLElement>("[data-work]"));
  if (dir === "left" || dir === "right") {
    return focusWork(all[all.indexOf(from) + (dir === "right" ? 1 : -1)]);
  }
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".row")).filter((r) => r.querySelector("[data-work]"));
  const target = rows[rows.indexOf(from.closest(".row") as HTMLElement) + (dir === "down" ? 1 : -1)];
  if (!target) return;
  const fromBox = from.getBoundingClientRect();
  const x = fromBox.left + fromBox.width / 2;
  let best: HTMLElement | undefined;
  let bestD = Infinity;
  target.querySelectorAll<HTMLElement>("[data-work]").forEach((el) => {
    const b = el.getBoundingClientRect();
    const d = Math.abs(b.left + b.width / 2 - x);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  });
  focusWork(best);
}

/** The work under the mouse, so shortcuts work without clicking or tabbing first. */
let hovered: HTMLElement | null = null;

function firstVisibleWork() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-work]")).find((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 80 && r.top < window.innerHeight;
  });
}

const ARROWS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};

function onKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement;
  if (target.closest?.("input, textarea, select, [contenteditable]")) return;

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const isArrow = key in ARROWS;
  if (!isArrow && !["Enter", " ", "r", "d", "l", "Escape"].includes(key)) return;

  let el = target.closest?.<HTMLElement>("[data-work]") ?? null;
  if (!el) {
    // Nothing selected: Enter/Space/Esc keep their normal meaning (buttons, page scroll).
    if (key === "Enter" || key === " " || key === "Escape") return;
    const fromHover = hovered && document.contains(hovered) ? hovered : null;
    el = fromHover ?? firstVisibleWork() ?? null;
    if (!el) return;
    if (isArrow) {
      // First arrow press selects a work; the next ones move between works.
      focusWork(el);
      e.preventDefault();
      return;
    }
    if (!fromHover) focusWork(el); // show which work the shortcut acted on
  }

  const work = works.get(el);
  if (!work) return;
  if (isArrow) move(el, ARROWS[key]);
  else if (key === "Enter" || key === " " || key === "r") recompose(work);
  else if (key === "d") download(work);
  else if (key === "l") copyLink(work);
  else if (key === "Escape") el.blur();
  else return;
  e.preventDefault();
}

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-action]");
  const cell = target.closest<HTMLElement>(".cell");
  const el = cell?.querySelector<HTMLElement>("[data-work]");
  const work = el && works.get(el);
  if (!work) return;
  const action = button?.dataset.action ?? (target.closest("[data-work]") ? "recompose" : null);
  if (action === "recompose") recompose(work);
  else if (action === "download") download(work);
  else if (action === "link") copyLink(work);
}

// ---------------------------------------------------------------- shared work

function renderFeatured(shared: SharedWork, before: Element) {
  const row = document.createElement("section");
  row.className = "row featured";
  row.setAttribute("aria-label", "Shared work");

  const stage = makeWorkCell(shared.kind, 8, 0, shared.seed);
  stage.classList.add("stage");
  stage.style.setProperty("--ar", String(shared.aspect));

  const info = document.createElement("div");
  info.className = "cell span-4 c-white featured-info";
  const feedUrl = buildUrl(location.href, { seed: masterSeed });
  info.innerHTML = `
    <span class="label">Shared with you</span>
    <h2></h2>
    <p class="seed-line">Seed <span></span></p>
    <p class="hint">Scroll down for the feed this work came from.</p>
    <a class="text-button" href="${feedUrl}">Hide shared work</a>`;
  info.querySelector("h2")!.textContent = KIND_NAMES[shared.kind];
  info.querySelector(".seed-line span")!.textContent = String(shared.seed);

  row.append(stage, info);
  before.after(row);
}

// ---------------------------------------------------------------- init

export function initFeed() {
  const feed = document.getElementById("feed")!;
  const sentinel = document.getElementById("sentinel")!;
  const count = document.getElementById("count")!;
  const params = new URLSearchParams(location.search);

  masterSeed = parseSeed(params.get("seed")) ?? Math.floor(Math.random() * 900000) + 100000;
  document.getElementById("seed")!.textContent = String(masterSeed);
  document.getElementById("copy-feed")?.addEventListener("click", () =>
    copyText(buildUrl(location.href, { seed: masterSeed }), "Feed link copied"),
  );

  const shared = parseWork(params.get("work"));
  if (shared) renderFeatured(shared, document.querySelector(".masthead")!);

  document.addEventListener("keydown", onKeydown);
  document.addEventListener("pointerover", (e) => {
    const cell = (e.target as HTMLElement).closest?.(".cell");
    hovered = cell?.querySelector<HTMLElement>("[data-work]") ?? null;
  });
  document.addEventListener("click", onClick);

  const loadBatch = () => {
    for (let i = 0; i < BATCH; i++) appendRow(feed);
    count.textContent = String(nextNo - 1);
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
