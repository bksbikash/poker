import type { Card } from './types';

/**
 * Pluggable random source. Defaults to `Math.random` but accepts any
 * `() => number` in `[0, 1)`, which makes shuffles deterministic in tests and
 * allows swapping in a CSPRNG for real-money play later.
 */
export type RandomSource = () => number;

/**
 * In-place Fisher–Yates (Knuth) shuffle. This is the unbiased shuffle: every
 * one of the n! permutations is equally likely given a uniform RNG.
 *
 * Operates on a copy so the input array is never mutated, keeping callers pure.
 */
export function shuffle<T>(items: readonly T[], rng: RandomSource = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    // j is a uniformly random index in [0, i].
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

/** Convenience wrapper that documents intent at the deck call-site. */
export function shuffleDeck(deck: readonly Card[], rng: RandomSource = Math.random): Card[] {
  return shuffle(deck, rng);
}

/**
 * Create a seeded, deterministic RNG (mulberry32). Useful for reproducible
 * tests and replays. Not cryptographically secure — do not use for real money.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
