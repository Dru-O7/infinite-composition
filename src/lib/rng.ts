// Seeded randomness shared by every generator.

export type Rng = () => number;

/** Small, fast, deterministic PRNG. Same seed → same sequence. */
export function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [a, b], inclusive. */
export const int = (rng: Rng, a: number, b: number) => a + Math.floor(rng() * (b - a + 1));

export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

/** Mix two numbers into a well-spread 32-bit seed (used for "row N of feed S"). */
export function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The next seed after a recompose. */
export const nextSeed = (seed: number) => (Math.imul(seed, 1103515245) + 12345) >>> 0;
