// Wallpaper export sizes. A work is redrawn from its seed at the target size, so it stays sharp.

export type WallpaperId = "screen" | "phone" | "desktop" | "square";
export type Size = { w: number; h: number };
export type ScreenInfo = { width: number; height: number; dpr: number };

export const WALLPAPERS: readonly { id: WallpaperId; label: string }[] = [
  { id: "screen", label: "This screen" },
  { id: "phone", label: "Phone" },
  { id: "desktop", label: "Desktop" },
  { id: "square", label: "Square" },
];

const FIXED: Record<Exclude<WallpaperId, "screen">, Size> = {
  phone: { w: 1170, h: 2532 },
  desktop: { w: 2560, h: 1440 },
  square: { w: 2048, h: 2048 },
};

/** Canvas limits differ by browser; staying under this keeps exports working everywhere. */
export const MAX_SIDE = 4096;

export function wallpaperSize(id: WallpaperId, screen: ScreenInfo): Size {
  if (id !== "screen") return FIXED[id];
  const { width, height } = screen;
  if (!(width > 0 && height > 0)) return FIXED.phone;
  const dpr = Math.min(3, Math.max(1, screen.dpr || 1));
  const scale = Math.min(dpr, MAX_SIDE / Math.max(width, height));
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

/** Base line width for a classic work at this size, a similar weight to the feed. */
export const wallpaperLine = ({ w, h }: Size) => Math.max(4, Math.round(Math.min(w, h) * 0.018));
