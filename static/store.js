// Saved mixes and small preferences in localStorage. Every access is wrapped: private windows and blocked storage
// just mean nothing is remembered.
import { normalise } from './mix_codec.js';
import { sound } from './catalog.js';

const KEY = 'soundtest.mixes.v1', LAST = 'soundtest.last.v1', PREFS = 'soundtest.prefs.v1';
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const known = id => !!sound(id);

// [{ name, saved (ISO date), mix }], newest first
export function savedMixes() {
  const list = read(KEY, []);
  return Array.isArray(list) ? list.filter(x => x && typeof x.name === 'string').map(x => ({ ...x, mix: normalise(x.mix, known) })) : [];
}

export function saveMix(name, mix) {
  const clean = String(name).trim().slice(0, 60) || 'My mix';
  const list = savedMixes().filter(x => x.name !== clean);
  list.unshift({ name: clean, saved: new Date().toISOString(), mix: normalise(mix, known) });
  return write(KEY, list.slice(0, 50)) ? clean : null;
}

export function deleteMix(name) { write(KEY, savedMixes().filter(x => x.name !== name)); }

export const lastMix = () => { const m = read(LAST, null); return m ? normalise(m, known) : null; };
export const rememberMix = mix => write(LAST, normalise(mix, known));

export const prefs = () => ({ vis: 'spectrum', timer: 30, fade: 10, ...read(PREFS, {}) });
export const setPref = (k, v) => write(PREFS, { ...prefs(), [k]: v });
