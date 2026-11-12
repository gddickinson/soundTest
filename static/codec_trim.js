// Choosing a compressed format and cutting decoded audio back to the exact WAV. Pure (tests/codec_trim.test.mjs).
//
// Each WAV has an Opus and an AAC copy (scripts/compress_audio.py). Encoders add "priming" silence at the start and
// padding at the end; some browsers strip them when decoding, some do not. audio/manifest.json records, per file, the
// WAV's length and, per format, the codec rate, the priming and the raw length with priming and padding. From the
// length the browser actually decoded we can tell which case we are in and where the real audio starts.

export const FORMATS = {
  opus: { ext: '.opus', mime: 'audio/ogg; codecs="opus"' },
  m4a: { ext: '.m4a', mime: 'audio/mp4; codecs="mp4a.40.2"' },
  wav: { ext: '.wav', mime: 'audio/wav' },
};

// Formats to try, best first. canPlay(mime) is HTMLMediaElement.canPlayType ('' | 'maybe' | 'probably').
export function formatOrder(canPlay, hasManifest = true) {
  const out = [];
  if (hasManifest) for (const f of ['opus', 'm4a']) { try { if (canPlay(FORMATS[f].mime)) out.push(f); } catch { /* no */ } }
  out.push('wav');
  return out;
}

export const fileFor = (wavPath, fmt) => wavPath.replace(/\.wav$/i, FORMATS[fmt].ext);

// { start, length } in output samples (the AudioContext rate `outRate`) for a buffer of `decoded` samples.
// Cases (lengths scaled to outRate): nothing stripped -> raw total, audio starts after the priming;
// priming stripped (edit list / pre-skip) -> total - priming, starts at 0; both stripped -> WAV length, starts at 0.
export function trimPlan(decoded, outRate, entry, fmt) {
  const length = Math.round(entry.frames * outRate / entry.sr);
  const c = fmt === 'wav' ? null : entry?.[fmt];
  if (!c) return { start: 0, length, case: 'wav' };
  const k = outRate / c.rate, P = c.priming * k, T = c.total * k;
  const cands = [[T, P, 'raw'], [T - P, 0, 'priming stripped'], [length, 0, 'exact']];
  let best = cands[0];
  for (const x of cands) if (Math.abs(decoded - x[0]) < Math.abs(decoded - best[0])) best = x;
  return { start: Math.round(best[1]), length, case: best[2] };
}

// Copy [start, start + length) of each channel, zero-padding past the end of the decoded data.
export function trimChannels(channels, start, length) {
  return channels.map(src => {
    const out = new Float32Array(length);
    out.set(src.subarray(Math.min(start, src.length), Math.min(start + length, src.length)));
    return out;
  });
}

// Total bytes to download every sound once in a given format (for the README/report numbers).
export const libraryKB = (manifest, fmt) => Object.values(manifest.files).reduce((a, f) => a + (fmt === 'wav' ? f.wav_kb : f[fmt].kb), 0);
