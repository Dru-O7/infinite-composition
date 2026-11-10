import { describe, expect, it } from "vitest";
import { MAX_SAVED, parseSaved, savedId, serializeSaved, toggleSaved, type SavedWork } from "../src/lib/saved";
import { MAX_SIDE, wallpaperLine, wallpaperSize } from "../src/lib/wallpaper";

describe("saved works", () => {
  const a = { kind: "classic", seed: 42, aspect: 1.5 } as const;
  const b = { kind: "boogie", seed: 7, aspect: 0.75 } as const;

  it("adds newest first, and toggling again removes", () => {
    let r = toggleSaved([], a, 1);
    expect(r.saved).toBe(true);
    r = toggleSaved(r.list, b, 2);
    expect(r.list.map(savedId)).toEqual(["boogie-7", "classic-42"]);
    r = toggleSaved(r.list, { ...a, aspect: 0.5 }, 3); // same work even if its cell changed shape
    expect(r.saved).toBe(false);
    expect(r.list.map(savedId)).toEqual(["boogie-7"]);
  });

  it("round-trips through storage", () => {
    const list = toggleSaved(toggleSaved([], a, 1).list, b, 2).list;
    expect(parseSaved(serializeSaved(list))).toEqual(list);
  });

  it("survives corrupt or hostile storage", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("not json")).toEqual([]);
    expect(parseSaved('{"kind":"classic"}')).toEqual([]);
    const raw = JSON.stringify([
      { kind: "classic", seed: 1, aspect: 1, at: 5 },
      { kind: "classic", seed: 1, aspect: 2, at: 6 }, // duplicate
      { kind: "<script>", seed: 2, aspect: 1 },
      { kind: "lozenge", seed: -3, aspect: 1 },
      { kind: "lozenge", seed: 3, aspect: "1" },
      null,
      { kind: "boogie", seed: 4, aspect: 99 }, // aspect clamped, like share links
    ]);
    expect(parseSaved(raw)).toEqual([
      { kind: "classic", seed: 1, aspect: 1, at: 5 },
      { kind: "boogie", seed: 4, aspect: 4, at: 0 },
    ]);
  });

  it("caps the list", () => {
    let list: SavedWork[] = [];
    for (let i = 0; i < MAX_SAVED + 5; i++) list = toggleSaved(list, { kind: "classic", seed: i, aspect: 1 }, i).list;
    expect(list.length).toBe(MAX_SAVED);
    expect(list[0].seed).toBe(MAX_SAVED + 4);
  });
});

describe("wallpaper sizes", () => {
  it("uses the device's real pixels for 'This screen'", () => {
    expect(wallpaperSize("screen", { width: 390, height: 844, dpr: 3 })).toEqual({ w: 1170, h: 2532 });
  });

  it("stays within canvas limits on huge screens", () => {
    const s = wallpaperSize("screen", { width: 3840, height: 2160, dpr: 2 });
    expect(Math.max(s.w, s.h)).toBeLessThanOrEqual(MAX_SIDE);
    expect(s.w / s.h).toBeCloseTo(3840 / 2160, 2);
  });

  it("falls back when the screen size is unknown", () => {
    expect(wallpaperSize("screen", { width: 0, height: 0, dpr: 1 })).toEqual(wallpaperSize("phone", { width: 0, height: 0, dpr: 1 }));
  });

  it("scales the line with the image", () => {
    expect(wallpaperLine({ w: 2560, h: 1440 })).toBeGreaterThan(wallpaperLine({ w: 640, h: 360 }));
  });
});
