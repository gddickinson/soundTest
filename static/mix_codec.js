// A "mix" is the whole mixer state as plain data; this module validates it and turns it into a short, readable string
// for share links (#/mixer?mix=...) and back. Pure: no DOM, no WebAudio (tested in tests/mix_codec.test.mjs).
//
//   mix   = { master: 0..1, tracks: [track, ...] }
//   track = { id, vol: 0..1, pan: -1..1, mute, solo, mode: 'loop' | 'scatter', every: seconds, chance: 0..1 }
//
// String form, fields separated by '~' (all characters are URL-safe, so links need no escaping):
//   v1~m80~ocean-waves-40.70.0.L~chime-3.45.-30.S20x40.s
//   version ~ master % ~ per track: id . vol% . pan% . mode [. flags: m = muted, s = solo]
//   mode L = seamless loop; S<every>x<chance%> = scatter: every <every>/10 s, play with probability <chance>%.

export const MAX_TRACKS = 24;
export const SCATTER_DEFAULT = { every: 2, chance: 0.4 };   // the original page's chime loop: every 2 s, 40 %
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r100 = v => Math.round(v * 100) / 100;   // canonical precision = what the link keeps
const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);

// Fill defaults and clamp every field; drops tracks whose id is not known (when `known` is given) and duplicates.
export function normalise(mix, known = null) {
  const out = { master: r100(clamp(num(mix?.master, 0.8), 0, 1)), tracks: [] };
  const seen = new Set();
  for (const t of Array.isArray(mix?.tracks) ? mix.tracks : []) {
    const id = String(t?.id ?? '');
    if (!/^[a-z0-9-]{1,80}$/.test(id) || seen.has(id) || (known && !known(id))) continue;
    seen.add(id);
    out.tracks.push({
      id, vol: r100(clamp(num(t.vol, 0.6), 0, 1)), pan: r100(clamp(num(t.pan, 0), -1, 1)), mute: !!t.mute, solo: !!t.solo,
      mode: t.mode === 'scatter' ? 'scatter' : 'loop',
      every: Math.round(clamp(num(t.every, SCATTER_DEFAULT.every), 0.3, 120) * 10) / 10,
      chance: r100(clamp(num(t.chance, SCATTER_DEFAULT.chance), 0, 1)),
    });
    if (out.tracks.length >= MAX_TRACKS) break;
  }
  return out;
}

const pct = v => Math.round(v * 100);

export function encodeMix(mix) {
  const m = normalise(mix);
  const parts = ['v1', 'm' + pct(m.master)];
  for (const t of m.tracks) {
    const mode = t.mode === 'loop' ? 'L' : `S${Math.round(t.every * 10)}x${pct(t.chance)}`;
    const flags = (t.mute ? 'm' : '') + (t.solo ? 's' : '');
    parts.push([t.id, pct(t.vol), pct(t.pan), mode].concat(flags ? [flags] : []).join('.'));
  }
  return parts.join('~');
}

// Returns a normalised mix, or null if the text is not a mix string. Unknown sound ids are skipped (see normalise).
export function decodeMix(text, known = null) {
  let s = String(text ?? '').trim();
  try { s = decodeURIComponent(s); } catch { /* keep as is */ }
  const parts = s.split('~');
  if (parts[0] !== 'v1' || !/^m\d{1,3}$/.test(parts[1] || '')) return null;
  const tracks = [];
  for (const p of parts.slice(2)) {
    const [id, vol, pan, mode = 'L', flags = ''] = p.split('.');
    const sc = /^S(\d{1,4})x(\d{1,3})$/.exec(mode);
    tracks.push({ id, vol: num(vol, NaN) / 100, pan: num(pan, 0) / 100, mute: flags.includes('m'), solo: flags.includes('s'),
      mode: sc ? 'scatter' : 'loop', every: sc ? +sc[1] / 10 : undefined, chance: sc ? +sc[2] / 100 : undefined });
  }
  return normalise({ master: +parts[1].slice(1) / 100, tracks: tracks.filter(t => Number.isFinite(t.vol)) }, known);
}

// Mute and solo: a track is heard if it is not muted and either nothing is soloed or it is soloed itself.
export function audible(track, tracks) {
  if (track.mute) return false;
  return !tracks.some(t => t.solo) || track.solo;
}

export const sameMix = (a, b) => encodeMix(a) === encodeMix(b);
