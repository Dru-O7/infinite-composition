// Saved works ("favourites"): a list of seeds kept in the viewer's browser.
// Every work is rebuilt from kind + seed + aspect, so that is all we need to store.

import { parseWork, type SharedWork } from "./share";

export type SavedWork = SharedWork & { at: number };

export const SAVED_KEY = "neoplastic:saved";
export const MAX_SAVED = 500;

/** Two works are the same saved work when style and seed match (aspect is only a hint). */
export const savedId = (w: Pick<SharedWork, "kind" | "seed">) => `${w.kind}-${w.seed}`;

/** Read a stored list, dropping anything malformed or duplicated. Never throws. */
export function parseSaved(raw: string | null | undefined): SavedWork[] {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: SavedWork[] = [];
  const seen = new Set<string>();
  for (const d of data) {
    if (!d || typeof d !== "object") continue;
    const { kind, seed, aspect, at } = d as Record<string, unknown>;
    if (typeof seed !== "number" || typeof aspect !== "number") continue;
    // Reuse the share-link parser so stored and linked works follow the same rules.
    const w = parseWork(`${kind}-${seed}-${aspect.toFixed(2)}`);
    if (!w || seen.has(savedId(w))) continue;
    seen.add(savedId(w));
    out.push({ ...w, at: typeof at === "number" ? at : 0 });
    if (out.length >= MAX_SAVED) break;
  }
  return out;
}

export function serializeSaved(list: readonly SavedWork[]): string {
  return JSON.stringify(
    list.map(({ kind, seed, aspect, at }) => ({ kind, seed, aspect: Math.round(aspect * 100) / 100, at })),
  );
}

/** Add the work (newest first) or remove it if it is already saved. */
export function toggleSaved(
  list: readonly SavedWork[],
  work: SharedWork,
  now: number,
): { list: SavedWork[]; saved: boolean } {
  const id = savedId(work);
  if (list.some((s) => savedId(s) === id)) {
    return { list: list.filter((s) => savedId(s) !== id), saved: false };
  }
  const entry: SavedWork = { kind: work.kind, seed: work.seed, aspect: work.aspect, at: now };
  return { list: [entry, ...list].slice(0, MAX_SAVED), saved: true };
}
