// Shareable links.
//   ?seed=123456                      → the same feed, row for row
//   ?work=boogie-98765-1.50           → one work (style, seed, aspect ratio) featured at the top

export type WorkKind = "classic" | "boogie" | "lozenge";
export type SharedWork = { kind: WorkKind; seed: number; aspect: number };

export const KIND_NAMES: Record<WorkKind, string> = {
  classic: "Composition",
  boogie: "Boogie-Woogie",
  lozenge: "Lozenge",
};

const MAX_SEED = 0xffffffff;
const MIN_ASPECT = 0.25;
const MAX_ASPECT = 4;

export function parseSeed(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n <= MAX_SEED ? n : null;
}

export function formatWork(w: SharedWork): string {
  return `${w.kind}-${w.seed}-${w.aspect.toFixed(2)}`;
}

export function parseWork(value: string | null | undefined): SharedWork | null {
  const m = value?.match(/^(classic|boogie|lozenge)-(\d{1,10})-(\d{1,2}(?:\.\d{1,4})?)$/);
  if (!m) return null;
  const seed = parseSeed(m[2]);
  const aspect = Number(m[3]);
  if (seed === null || !(aspect > 0)) return null;
  return {
    kind: m[1] as WorkKind,
    seed,
    aspect: Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect)),
  };
}

export function buildUrl(href: string, opts: { seed?: number; work?: SharedWork }): string {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  if (opts.seed !== undefined) url.searchParams.set("seed", String(opts.seed));
  if (opts.work) url.searchParams.set("work", formatWork(opts.work));
  return url.toString();
}
