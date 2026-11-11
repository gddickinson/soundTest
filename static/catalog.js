// The sound library: categories, lookup and search over SOUNDS (catalog_data.js, generated from the WAV headers).
import { SOUNDS } from './catalog_data.js';
export { SOUNDS };

export const CATEGORIES = [
  { key: 'water', label: 'Ocean & water', hue: '#59e6ff' },
  { key: 'noise', label: 'Noise', hue: '#c9d4ff' },
  { key: 'bells', label: 'Bells & chimes', hue: '#ffd36e' },
  { key: 'weather', label: 'Wind & weather', hue: '#8ef0c0' },
  { key: 'instruments', label: 'Instruments', hue: '#ff9bd2' },
  { key: 'scifi', label: 'Sci-fi glitches', hue: '#b48cff' },
];
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

const BY_ID = new Map(SOUNDS.map(s => [s.id, s]));
export const sound = id => BY_ID.get(id);

// Long recordings (beds) loop by default; short hits are scattered at random, like the original chime loop.
export const LOOP_MIN_SECONDS = 5;
export const defaultMode = s => (s.dur >= LOOP_MIN_SECONDS ? 'loop' : 'scatter');

export function search(query = '', cat = '') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SOUNDS.filter(s => (!cat || s.cat === cat) &&
    words.every(w => `${s.name} ${s.source} ${CAT[s.cat].label} ${s.file}`.toLowerCase().includes(w)));
}

export const totals = () => ({
  sounds: SOUNDS.length, categories: CATEGORIES.length,
  minutes: SOUNDS.reduce((a, s) => a + s.dur, 0) / 60, mb: SOUNDS.reduce((a, s) => a + s.kb, 0) / 1024,
});

export function fmtDur(sec) {
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
export const fmtSize = kb => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} kB`);
