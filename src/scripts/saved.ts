// The saved-works store: the pure list logic from lib/saved, kept in localStorage.
// If storage is blocked (private mode, disabled site data), saving still works for this visit.

import { parseSaved, SAVED_KEY, savedId, serializeSaved, toggleSaved, type SavedWork } from "../lib/saved";
import type { SharedWork } from "../lib/share";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(): SavedWork[] {
  try {
    return parseSaved(storage()?.getItem(SAVED_KEY));
  } catch {
    return [];
  }
}

let list = read();
let persisted = true;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export const savedList = (): readonly SavedWork[] => list;
export const isSaved = (w: Pick<SharedWork, "kind" | "seed">) => list.some((s) => savedId(s) === savedId(w));
export const onSavedChange = (f: () => void) => listeners.add(f);
/** False when the browser refused to store the list; it then lasts only for this visit. */
export const savedPersists = () => persisted;

export function toggleSave(work: SharedWork): boolean {
  const r = toggleSaved(list, work, Date.now());
  list = r.list;
  try {
    storage()!.setItem(SAVED_KEY, serializeSaved(list));
    persisted = true;
  } catch {
    persisted = false;
  }
  notify();
  return r.saved;
}

// Keep several open tabs in step.
window.addEventListener("storage", (e) => {
  if (e.key !== SAVED_KEY) return;
  list = read();
  notify();
});
