export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Matches Tianguan13 SPT_PROB_RATE(prob_per_second, seconds_per_tick):
 * 1 - (1 - p)^dt
 */
export function sptProbRate(percentPerSec: number, dt: number): number {
  const p = Math.min(1, Math.max(0, percentPerSec / 100));
  return 1 - Math.pow(1 - p, dt);
}
