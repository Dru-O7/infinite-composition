import { describe, expect, it } from "vitest";
import { isWork, planRow } from "../src/lib/plan";
import { hash, mulberry32, nextSeed } from "../src/lib/rng";
import { buildUrl, formatWork, parseSeed, parseWork } from "../src/lib/share";

const rows = Array.from({ length: 500 }, (_, i) => planRow(hash(123456, i + 1)));

describe("planRow", () => {
  it("fills exactly 12 columns", () => {
    for (const r of rows) expect(r.cells.reduce((s, c) => s + c.span, 0)).toBe(12);
  });

  it("is deterministic, so freed rows rebuild identically", () => {
    expect(planRow(99)).toEqual(planRow(99));
  });

  it("has at most one late-style work and one word per row", () => {
    for (const r of rows) {
      expect(r.cells.filter((c) => c.kind === "boogie" || c.kind === "lozenge").length).toBeLessThanOrEqual(1);
      expect(r.cells.filter((c) => c.kind === "type").length).toBeLessThanOrEqual(1);
    }
  });

  it("only puts lozenges in squarish cells", () => {
    for (const r of rows) {
      for (const c of r.cells) if (c.kind === "lozenge") expect(c.span >= 4 && c.span <= 6).toBe(true);
    }
  });

  it("includes every kind of cell over a long scroll", () => {
    const kinds = new Set(rows.flatMap((r) => r.cells.map((c) => c.kind)));
    expect([...kinds].sort()).toEqual(["boogie", "classic", "lozenge", "solid", "type"]);
    expect(rows.flatMap((r) => r.cells).some(isWork)).toBe(true);
  });
});

describe("rng", () => {
  it("stays in [0, 1)", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });

  it("gives distinct seeds per row and per recompose", () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, i) => hash(1, i)));
    expect(seeds.size).toBe(1000);
    expect(nextSeed(10)).not.toBe(10);
    expect(Number.isInteger(nextSeed(0xffffffff))).toBe(true);
  });
});

describe("share links", () => {
  it("round-trips a work", () => {
    const w = { kind: "boogie" as const, seed: 98765, aspect: 1.5 };
    expect(formatWork(w)).toBe("boogie-98765-1.50");
    expect(parseWork(formatWork(w))).toEqual(w);
  });

  it("rejects malformed values", () => {
    for (const bad of [null, "", "cubism-1-1", "boogie-x-1", "boogie-1", "lozenge-1-0", "classic-99999999999-1"]) {
      expect(parseWork(bad)).toBeNull();
    }
    expect(parseSeed("abc")).toBeNull();
    expect(parseSeed("-4")).toBeNull();
    expect(parseSeed("4294967296")).toBeNull();
    expect(parseSeed("42")).toBe(42);
  });

  it("clamps extreme aspect ratios", () => {
    expect(parseWork("classic-1-9.00")?.aspect).toBe(4);
    expect(parseWork("classic-1-0.10")?.aspect).toBe(0.25);
  });

  it("builds clean URLs", () => {
    const href = "https://example.com/?seed=1&work=x#top";
    expect(buildUrl(href, { seed: 7 })).toBe("https://example.com/?seed=7");
    expect(buildUrl(href, { seed: 7, work: { kind: "lozenge", seed: 3, aspect: 1 } })).toBe(
      "https://example.com/?seed=7&work=lozenge-3-1.00",
    );
  });
});
