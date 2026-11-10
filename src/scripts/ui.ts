// Small shared UI helpers: toast, clipboard, file saving, icons.

let toastTimer = 0;
export function toast(message: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

export async function copyText(text: string, done: string) {
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

/** Save a canvas as a PNG download. */
export function saveCanvas(canvas: HTMLCanvasElement | null, filename: string, done: string) {
  if (!canvas) return toast("Couldn't create the image. Try again.");
  canvas.toBlob((blob) => {
    if (!blob) return toast("Couldn't create the image. Try again.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(done);
  }, "image/png");
}

const svg = (d: string, extra = "") =>
  `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"${extra}/></svg>`;

export const ICONS = {
  recompose: svg("M13 8a5 5 0 1 1-1.5-3.55M13 2.5V5h-2.5"),
  download: svg("M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13.5h10"),
  link: svg("M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"),
  // The heart is filled through CSS when its button is pressed.
  save: svg("M8 13.5 2.6 8.1a3.1 3.1 0 0 1 4.4-4.4L8 4.7l1-1a3.1 3.1 0 0 1 4.4 4.4Z", ' class="heart" stroke-linejoin="miter"'),
  open: svg("M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"),
  wallpaper: svg("M2 3h12v8H2zM6 14h4M8 11v3"),
  close: svg("M3.5 3.5l9 9M12.5 3.5l-9 9"),
  prev: svg("M10 3 5 8l5 5"),
  next: svg("M6 3l5 5-5 5"),
};
