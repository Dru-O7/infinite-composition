// The feed: turns row plans into DOM, keeps memory flat while scrolling, and wires up interaction.

import { isWork, mobileSpans, planRow, type RowPlan } from "../lib/plan";
import { hash, nextSeed } from "../lib/rng";
import { buildUrl, KIND_NAMES, parseSeed, parseWork, type SharedWork, type WorkKind } from "../lib/share";
import { lineShare, paintCanvas, paintWork, reducedMotion, workElement } from "./paint";
import { isSaved, onSavedChange } from "./saved";
import { copyText, ICONS } from "./ui";
import { downloadWork, initViewer, openViewer, toggleSaveWork, type ViewItem, type ViewSource } from "./viewer";

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

const works = new WeakMap<Element, Work>();
const rowOf = new WeakMap<Element, RowRecord>();
/** Recomposed works keep their new seed even after their row is freed and rebuilt. */
const overrides = new Map<number, number>();

let masterSeed = 0;
let rowCount = 0;
let nextNo = 1;
let feedEl: HTMLElement;
let countEl: HTMLElement;

const canvasRO = new ResizeObserver((entries) => {
  for (const e of entries) {
    const w = works.get(e.target);
    if (w) paintCanvas(w.el as HTMLCanvasElement, w.kind, w.seed, false);
  }
});

// ---------------------------------------------------------------- cells

function workLabel(w: { no: number; kind: WorkKind }) {
  return w.no === 0 ? `Shared ${KIND_NAMES[w.kind]}` : `${KIND_NAMES[w.kind]} No. ${String(w.no).padStart(3, "0")}`;
}

function makeWorkCell(kind: WorkKind, span: number, no: number, seed: number): HTMLElement {
  const cell = document.createElement("div");
  cell.className = `cell span-${span}${kind === "boogie" ? " c-white" : ""}`;

  const el = workElement(kind);
  el.tabIndex = 0;
  el.dataset.work = kind;
  el.dataset.no = String(no);
  el.setAttribute("role", "button");

  const work: Work = { no, kind, seed: overrides.get(no) ?? seed, el, cell };
  works.set(el, work);
  el.setAttribute("aria-label", `${workLabel(work)}. Enter to recompose, O to open, S to save, D to download, L to copy a link.`);

  if (kind === "classic") paintWork(el, kind, work.seed, false);
  else canvasRO.observe(el);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = workLabel(work);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [action, label] of [
    ["open", "Open (O)"],
    ["recompose", "Recompose (R)"],
    ["save", "Save (S)"],
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
    if (action === "save") b.classList.add("save");
    actions.appendChild(b);
  }
  syncSaveButton(work, actions);

  cell.append(el, caption, actions);
  return cell;
}

/** Reflect whether the work is saved on its heart button. */
function syncSaveButton(work: Work, scope: ParentNode = work.cell) {
  const b = scope.querySelector<HTMLElement>('[data-action="save"]');
  if (!b) return;
  const saved = isSaved(work);
  b.setAttribute("aria-pressed", String(saved));
  b.title = saved ? "Remove from saved (S)" : "Save (S)";
  b.setAttribute("aria-label", b.title);
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
  const ms = mobileSpans(rec.plan.cells.map((c) => c.span));
  cells.forEach((cell, i) => cell.style.setProperty("--ms", String(ms[i])));
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

function loadBatch() {
  for (let i = 0; i < BATCH; i++) appendRow(feedEl);
  countEl.textContent = String(nextNo - 1);
}

// ---------------------------------------------------------------- actions

function recompose(work: Work) {
  work.seed = nextSeed(work.seed);
  if (work.no > 0) overrides.set(work.no, work.seed);
  paintWork(work.el, work.kind, work.seed, true);
  syncSaveButton(work);
}

function aspectOf(work: Work) {
  const r = work.cell.getBoundingClientRect();
  return r.width && r.height ? r.width / r.height : 1;
}

const sharedOf = (work: Work): SharedWork => ({ kind: work.kind, seed: work.seed, aspect: aspectOf(work) });

function copyLink(w: SharedWork, label = KIND_NAMES[w.kind]) {
  copyText(buildUrl(location.href, { seed: masterSeed, work: w }), `Link to ${label} copied`);
}

// ---------------------------------------------------------------- viewer

type FeedItem = ViewItem & { work: Work };

/** Every work in page order: the shared one first, then the feed. */
const allWorkEls = () => Array.from(document.querySelectorAll<HTMLElement>(".canvas [data-work]"));

const feedItem = (work: Work): FeedItem => ({ ...sharedOf(work), work });

const feedSource: ViewSource<FeedItem> = {
  step(item, dir) {
    let all = allWorkEls();
    let i = all.indexOf(item.work.el);
    // The cell may have been rebuilt since the viewer opened; find it again by number.
    if (i < 0) i = all.findIndex((e) => e.dataset.no === String(item.work.no));
    if (i < 0) return null;
    if (dir > 0 && i + 1 >= all.length) {
      loadBatch();
      all = allWorkEls();
    }
    const target = all[i + dir];
    const work = target && works.get(target);
    if (!work) return null;
    // Keep the feed in step behind the viewer, so closing it lands on this work.
    target.scrollIntoView({ block: "center" });
    return feedItem(work);
  },
  title: (item) => workLabel(item.work),
  detail: (item) => `Seed ${item.seed}`,
  recompose(item) {
    recompose(item.work);
    item.seed = item.work.seed;
  },
};

const openWork = (work: Work) => openViewer(feedSource, feedItem(work));
const saveWork = (work: Work) => toggleSaveWork(sharedOf(work), workLabel(work));
const download = (work: Work) => downloadWork(sharedOf(work), lineShare(work.el), workLabel(work));

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
  if (target.closest?.("input, textarea, select, [contenteditable], dialog")) return;
  if (document.querySelector("dialog[open]")) return;

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const isArrow = key in ARROWS;
  if (!isArrow && !["Enter", " ", "r", "d", "l", "o", "s", "Escape"].includes(key)) return;

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
  else if (key === "o") openWork(work);
  else if (key === "s") saveWork(work);
  else if (key === "d") download(work);
  else if (key === "l") copyLink(sharedOf(work), workLabel(work));
  else if (key === "Escape") el.blur();
  else return;
  e.preventDefault();
}

/** Touch and pen taps open the viewer; mouse clicks recompose in place. */
let lastPointer = "mouse";

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-action]");
  const cell = target.closest<HTMLElement>(".cell");
  const el = cell?.querySelector<HTMLElement>("[data-work]");
  const work = el && works.get(el);
  if (!work) return;
  const tapAction = lastPointer === "mouse" ? "recompose" : "open";
  const action = button?.dataset.action ?? (target.closest("[data-work]") ? tapAction : null);
  if (action === "recompose") recompose(work);
  else if (action === "open") openWork(work);
  else if (action === "save") saveWork(work);
  else if (action === "download") download(work);
  else if (action === "link") copyLink(sharedOf(work), workLabel(work));
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
  feedEl = document.getElementById("feed")!;
  countEl = document.getElementById("count")!;
  const sentinel = document.getElementById("sentinel")!;
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
  document.addEventListener("pointerdown", (e) => (lastPointer = e.pointerType || "mouse"), true);
  document.addEventListener("click", onClick);

  initViewer({ link: (w) => copyLink(w) });
  onSavedChange(() =>
    document.querySelectorAll<HTMLElement>(".canvas [data-work]").forEach((el) => {
      const w = works.get(el);
      if (w) syncSaveButton(w);
    }),
  );

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
