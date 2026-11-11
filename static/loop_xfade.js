// Seamless loops. Pure (tested in tests/loop_xfade.test.mjs).
//
// Most of these recordings were not cut to loop, so looping them as they are clicks at the seam. makeSeamless()
// folds the last `fade` seconds of the sound over its first `fade` seconds with an equal-power crossfade and drops
// the tail. The result is `fade` shorter and loops with no jump: its last sample is followed by what originally
// came right after it (the start of the old tail), which then fades into the beginning. The audio engine plays it
// with AudioBufferSourceNode.loop = true over the whole buffer, so the loop itself is sample-accurate.

export function fadeSamples(length, sampleRate, fadeSec) {
  return Math.max(0, Math.min(Math.round(fadeSec * sampleRate), Math.floor(length / 3)));
}

// channels: array of Float32Array (one per channel, equal length). Returns new arrays of length N - F.
export function makeSeamless(channels, sampleRate, fadeSec = 1.5) {
  const n = channels[0]?.length ?? 0;
  const f = fadeSamples(n, sampleRate, fadeSec);
  if (f === 0) return channels.map(c => Float32Array.from(c));
  return channels.map(src => {
    const out = new Float32Array(n - f);
    out.set(src.subarray(0, n - f));
    for (let i = 0; i < f; i++) {
      const t = (i + 0.5) / f;                       // 0 -> 1 across the fade
      const gin = Math.sin(t * Math.PI / 2), gout = Math.cos(t * Math.PI / 2);
      out[i] = src[i] * gin + src[n - f + i] * gout;
    }
    return out;
  });
}
