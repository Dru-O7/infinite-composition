// Full-screen viewer (tap a work on touch screens, or the open button / O key) and the Saved panel.
// Both are native <dialog>s, so focus is trapped and Esc closes them.

import { nextSeed } from "../lib/rng";
import { savedId } from "../lib/saved";
import { KIND_NAMES, type SharedWork, type WorkKind } from "../lib/share";
import { WALLPAPERS, wallpaperLine, wallpaperSize, type WallpaperId } from "../lib/wallpaper";
import {
  exportSize,
  lineShare,
  paintCanvas,
  paintClassic,
  paintWork,
  reducedMotion,
  renderWork,
  workElement,
} from "./paint";
import { isSaved, onSavedChange, savedList, savedPersists, toggleSave } from "./saved";
import { ICONS, saveCanvas, toast } from "./ui";

export type ViewItem = { kind: WorkKind; seed: number; aspect: number };

/** Where the viewer's works come from: the feed, or the saved list. */
export type ViewSource<T extends ViewItem = ViewItem> = {
  /** The neighbouring work, or null at either end. */
  step(item: T, dir: 1 | -1): T | null;
  title(item: T): string;
  detail(item: T): string;
  /** Give the item a new seed (the feed also repaints its own cell). */
  recompose(item: T): void;
};

export const EXPORT_LONG_SIDE = 2400;
const SWIPE_PX = 40;
const TAP_PX = 10;

let linkFor: (w: SharedWork) => void = () => {};

let viewer: HTMLDialogElement;
let frame: HTMLElement;
let titleEl: HTMLElement;
let detailEl: HTMLElement;
let saveBtn: HTMLButtonElement;
let menu: HTMLElement;
let menuBtn: HTMLButtonElement;

let source: ViewSource<any> | null = null;
let item: ViewItem | null = null;
let el: HTMLElement | null = null;

const ro = new ResizeObserver(() => {
  if (item && el && item.kind !== "classic") paintCanvas(el as HTMLCanvasElement, item.kind, item.seed, false);
});

// ---------------------------------------------------------------- shared actions

/** Save or unsave a work, with feedback. Used by the feed and the viewer. */
export function toggleSaveWork(w: SharedWork, label: string) {
  const saved = toggleSave(w);
  if (!saved) toast(`Removed ${label} from saved`);
  else toast(savedPersists() ? `Saved ${label}` : `Saved ${label} for this visit (browser storage is off)`);
}

export function downloadWork(w: ViewItem, share: number, label: string) {
  const { w: W, h: H } = exportSize(w.aspect, EXPORT_LONG_SIDE);
  const name = `${KIND_NAMES[w.kind].toLowerCase()}-${w.seed}.png`;
  saveCanvas(renderWork(w.kind, w.seed, W, H, share * W), name, `Downloaded ${label}`);
}

function downloadWallpaper(w: ViewItem, id: WallpaperId) {
  const size = wallpaperSize(id, { width: screen.width, height: screen.height, dpr: devicePixelRatio });
  const name = `${KIND_NAMES[w.kind].toLowerCase()}-${w.seed}-${size.w}x${size.h}.png`;
  saveCanvas(renderWork(w.kind, w.seed, size.w, size.h, wallpaperLine(size)), name, `Wallpaper saved (${size.w}×${size.h})`);
}

// ---------------------------------------------------------------- viewer

function button(action: string, label: string, icon: string, cls = "v-btn") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.dataset.v = action;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = icon;
  return b;
}

function buildViewer() {
  viewer = document.createElement("dialog");
  viewer.className = "viewer";
  viewer.setAttribute("aria-label", "Work viewer");

  const top = document.createElement("div");
  top.className = "viewer-top";
  const heading = document.createElement("div");
  heading.className = "viewer-heading";
  titleEl = document.createElement("h2");
  detailEl = document.createElement("p");
  heading.append(titleEl, detailEl);
  top.append(heading, button("close", "Close (Esc)", ICONS.close));

  const stage = document.createElement("div");
  stage.className = "viewer-stage";
  frame = document.createElement("div");
  frame.className = "viewer-frame";
  stage.append(
    button("prev", "Previous work (←)", ICONS.prev, "v-btn v-nav prev"),
    frame,
    button("next", "Next work (→)", ICONS.next, "v-btn v-nav next"),
  );

  const bar = document.createElement("div");
  bar.className = "viewer-bar";
  saveBtn = button("save", "Save (S)", ICONS.save);
  saveBtn.classList.add("save");
  menuBtn = button("wallpaper", "Wallpaper (W)", ICONS.wallpaper);
  menuBtn.setAttribute("aria-haspopup", "true");
  menuBtn.setAttribute("aria-expanded", "false");
  bar.append(
    button("recompose", "Recompose (R)", ICONS.recompose),
    saveBtn,
    button("download", "Download PNG (D)", ICONS.download),
    menuBtn,
    button("link", "Copy link (L)", ICONS.link),
  );

  menu = document.createElement("div");
  menu.className = "wallpaper-menu";
  menu.hidden = true;
  const menuLabel = document.createElement("span");
  menuLabel.className = "label";
  menuLabel.textContent = "Download as wallpaper";
  menu.append(menuLabel);
  for (const wp of WALLPAPERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "wp-option";
    b.dataset.wp = wp.id;
    menu.append(b);
  }

  viewer.append(top, stage, bar, menu);
  document.body.append(viewer);

  viewer.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const wp = t.closest<HTMLElement>("[data-wp]");
    if (wp && item) {
      downloadWallpaper(item, wp.dataset.wp as WallpaperId);
      setMenu(false);
      return;
    }
    const action = t.closest<HTMLElement>("[data-v]")?.dataset.v;
    if (action) act(action);
  });

  viewer.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, string> = {
      ArrowLeft: "prev", ArrowRight: "next", r: "recompose", s: "save", d: "download", w: "wallpaper", l: "link",
    };
    if (!(key in map)) return;
    e.preventDefault();
    act(map[key]);
  });

  // Esc closes the wallpaper menu first, then the viewer.
  viewer.addEventListener("cancel", (e) => {
    if (!menu.hidden) {
      e.preventDefault();
      setMenu(false);
    }
  });
  viewer.addEventListener("close", () => {
    if (el) ro.unobserve(el);
    frame.replaceChildren();
    source = item = el = null;
  });

  // Swipe sideways to move between works; tap to recompose.
  let start: { x: number; y: number; id: number } | null = null;
  frame.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try {
      frame.setPointerCapture(e.pointerId); // keep the swipe even if the finger leaves the frame
    } catch {
      /* pointer already gone */
    }
  });
  frame.addEventListener("pointercancel", () => (start = null));
  frame.addEventListener("pointerup", (e) => {
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) act(dx < 0 ? "next" : "prev");
    else if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) act("recompose");
  });
}

function setMenu(open: boolean) {
  menu.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  if (!open) return;
  const s = wallpaperSize("screen", { width: screen.width, height: screen.height, dpr: devicePixelRatio });
  menu.querySelectorAll<HTMLElement>("[data-wp]").forEach((b) => {
    const id = b.dataset.wp as WallpaperId;
    const size = id === "screen" ? s : wallpaperSize(id, { width: 0, height: 0, dpr: 1 });
    b.textContent = `${WALLPAPERS.find((w) => w.id === id)!.label} · ${size.w}×${size.h}`;
  });
  menu.querySelector<HTMLElement>("[data-wp]")?.focus();
}

function refreshText() {
  if (!item || !source) return;
  titleEl.textContent = source.title(item);
  detailEl.textContent = source.detail(item);
  el?.setAttribute("aria-label", `${source.title(item)}. Tap to recompose, swipe for the next work.`);
  const saved = isSaved(item);
  saveBtn.setAttribute("aria-pressed", String(saved));
  saveBtn.title = saved ? "Remove from saved (S)" : "Save (S)";
  saveBtn.setAttribute("aria-label", saveBtn.title);
}

function show(next: ViewItem, dir: 0 | 1 | -1) {
  item = next;
  setMenu(false);
  frame.style.setProperty("--ar", String(next.aspect));
  if (el) ro.unobserve(el);
  el = workElement(next.kind);
  el.setAttribute("role", "img");
  frame.replaceChildren(el);
  if (next.kind === "classic") paintClassic(el, next.seed, false);
  else ro.observe(el); // paints once laid out
  refreshText();

  if (dir && !reducedMotion.matches) {
    frame.classList.remove("from-left", "from-right");
    void frame.offsetWidth;
    frame.classList.add(dir > 0 ? "from-right" : "from-left");
  }
}

function act(action: string) {
  if (!item || !source) return;
  const label = source.title(item);
  switch (action) {
    case "close":
      return viewer.close();
    case "prev":
    case "next": {
      const dir = action === "next" ? 1 : -1;
      const n = source.step(item, dir);
      if (n) show(n, dir);
      else toast(dir > 0 ? "That's the last work here" : "That's the first work here");
      return;
    }
    case "recompose":
      source.recompose(item);
      if (el) paintWork(el, item.kind, item.seed, true);
      return refreshText();
    case "save":
      return toggleSaveWork(item, label);
    case "download":
      return el && downloadWork(item, lineShare(el), label);
    case "wallpaper":
      return setMenu(Boolean(menu.hidden));
    case "link":
      return linkFor(item);
  }
}

export function openViewer<T extends ViewItem>(src: ViewSource<T>, start: T) {
  source = src;
  if (!viewer.open) viewer.showModal();
  show(start, 0);
}

// ---------------------------------------------------------------- saved panel

let panel: HTMLDialogElement;
let grid: HTMLElement;
let empty: HTMLElement;
let panelCount: HTMLElement;

const thumbIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target as HTMLElement;
      thumbIO.unobserve(t);
      const kind = t.dataset.kind as WorkKind;
      const aspect = Number(t.dataset.aspect);
      const long = Math.round(320 * Math.min(devicePixelRatio || 1, 2));
      const { w, h } = exportSize(aspect, long);
      const c = renderWork(kind, Number(t.dataset.seed), w, h, Math.max(2, Math.round(Math.min(w, h) * 0.025)));
      if (c) t.prepend(c);
    }
  },
  { rootMargin: "300px" },
);

function savedSource(items: ViewItem[]): ViewSource {
  return {
    step: (it, dir) => items[items.indexOf(it) + dir] ?? null,
    title: (it) => KIND_NAMES[it.kind],
    detail: (it) => `Saved ${items.indexOf(it) + 1} of ${items.length} · Seed ${it.seed}`,
    recompose: (it) => {
      it.seed = nextSeed(it.seed);
    },
  };
}

function renderSaved() {
  const list = savedList();
  panelCount.textContent = String(list.length);
  empty.hidden = list.length > 0;
  // A snapshot, so the viewer's order stays put while works are saved or removed.
  const items: ViewItem[] = list.map(({ kind, seed, aspect }) => ({ kind, seed, aspect }));
  const src = savedSource(items);
  grid.replaceChildren(
    ...items.map((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = it.aspect < 1 ? "saved-thumb portrait" : "saved-thumb";
      b.style.setProperty("--ar", String(it.aspect));
      b.dataset.kind = it.kind;
      b.dataset.seed = String(it.seed);
      b.dataset.aspect = String(it.aspect);
      b.dataset.id = savedId(it);
      b.setAttribute("aria-label", `${KIND_NAMES[it.kind]}, seed ${it.seed}. Open.`);
      const cap = document.createElement("span");
      cap.className = "caption";
      cap.textContent = KIND_NAMES[it.kind];
      b.append(cap);
      b.addEventListener("click", () => openViewer(src, it));
      thumbIO.observe(b);
      return b;
    }),
  );
}

function buildPanel() {
  panel = document.createElement("dialog");
  panel.className = "saved-panel";
  panel.setAttribute("aria-labelledby", "saved-title");
  panel.innerHTML = `
    <div class="saved-head">
      <h2 id="saved-title">Saved <span class="saved-n"></span></h2>
    </div>
    <p class="saved-empty">Nothing saved yet. Use the heart on any work, or press <kbd>S</kbd>, to keep it here. Saved works stay in this browser.</p>
    <div class="saved-grid"></div>`;
  panel.querySelector(".saved-head")!.append(button("close", "Close (Esc)", ICONS.close));
  grid = panel.querySelector(".saved-grid")!;
  empty = panel.querySelector(".saved-empty")!;
  panelCount = panel.querySelector(".saved-n")!;
  panel.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest('[data-v="close"]')) panel.close();
  });
  panel.addEventListener("close", () => grid.replaceChildren());
  document.body.append(panel);
}

export function openSaved() {
  renderSaved();
  if (!panel.open) panel.showModal();
}

// ---------------------------------------------------------------- init

export function initViewer(opts: { link: (w: SharedWork) => void }) {
  linkFor = opts.link;
  buildViewer();
  buildPanel();

  const badge = document.getElementById("saved-count");
  const openBtn = document.getElementById("open-saved");
  const update = () => {
    const n = savedList().length;
    if (badge) badge.textContent = String(n);
    openBtn?.setAttribute("aria-label", `Saved works: ${n}`);
    if (panel.open) renderSaved();
    if (viewer.open) refreshText();
  };
  onSavedChange(update);
  update();
  openBtn?.addEventListener("click", openSaved);
}
