// Scatter mode: instead of looping, a short sound is triggered at random. Every `every` seconds (with +-25 % jitter
// so layers drift apart) it plays with probability `chance`. With every = 2 s and chance = 40 % this is the original
// page's chime loop. Pure (tested in tests/scatter.test.mjs); the engine calls it from a look-ahead scheduler.

// Returns { hits: [times], next } for the window [from, until). `next` is the next decision time; rand() in [0, 1).
export function planHits(next, until, every, chance, rand) {
  const hits = [];
  let t = next;
  const step = Math.max(0.25, every);
  while (t < until) {
    if (rand() < chance) hits.push(t);
    t += step * (0.75 + 0.5 * rand());
  }
  return { hits, next: t };
}

// Average number of hits per minute, for the UI.
export const hitsPerMinute = (every, chance) => (60 / Math.max(0.25, every)) * chance;
