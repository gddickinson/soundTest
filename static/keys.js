// Keyboard control (anywhere except while typing in a field). Press ? for the list.
import { esc, go } from './core.js';
import { engine } from './audio_engine.js';

export const SHORTCUTS = [
  ['Space', 'Play / pause'],
  ['1 – 9', 'Select layer 1–9'],
  ['← / →', 'Select previous / next layer'],
  ['↑ / ↓', 'Volume of the selected layer (master if there are no layers)'],
  ['M', 'Mute the selected layer'],
  ['S', 'Solo the selected layer'],
  ['L', 'Switch the selected layer between loop and scatter'],
  ['Delete', 'Remove the selected layer'],
  ['[ / ]', 'Master volume down / up'],
  ['/', 'Search the library (mixer page)'],
  ['V', 'Next visualiser style'],
  ['T', 'Start / cancel the sleep timer (mixer page)'],
  ['G', 'Go to the mixer'],
  ['?', 'Show this list'],
];

function help() {
  let d = document.getElementById('keys-help');
  if (!d) {
    d = document.createElement('dialog');
    d.id = 'keys-help'; d.className = 'panel';
    d.setAttribute('aria-label', 'Keyboard shortcuts');
    d.innerHTML = `<h2>Keyboard shortcuts</h2><table>${SHORTCUTS.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</table>
      <form method="dialog"><button>Close</button></form>`;
    document.body.appendChild(d);
  }
  if (!d.open) d.showModal();
}

const sel = () => engine.layers[engine.selected];
const select = i => {
  if (!engine.layers.length) return;
  engine.selected = (i + engine.layers.length) % engine.layers.length;
  window.dispatchEvent(new CustomEvent('layer-select'));
};

export function installKeys() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable], dialog')) return;
    if (e.key === ' ' && t.closest && t.closest('button, a, summary')) return;   // let Space press the focused control
    const l = sel(), k = e.key;
    let done = true;
    if (k === ' ') { if (engine.layers.length) engine.toggle(); }
    else if (/^[1-9]$/.test(k)) select(+k - 1);
    else if (k === 'ArrowLeft') select(engine.selected - 1);
    else if (k === 'ArrowRight') select(engine.selected + 1);
    else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const d = k === 'ArrowUp' ? 0.05 : -0.05;
      if (l) engine.set(l.t.id, { vol: l.t.vol + d }); else engine.setMaster(engine.masterVol + d);
      window.dispatchEvent(new CustomEvent('layer-select'));
    }
    else if (k === '[' || k === ']') engine.setMaster(engine.masterVol + (k === ']' ? 0.05 : -0.05));
    else if ((k === 'm' || k === 'M') && l) engine.set(l.t.id, { mute: !l.t.mute });
    else if ((k === 's' || k === 'S') && l) engine.set(l.t.id, { solo: !l.t.solo });
    else if ((k === 'l' || k === 'L') && l) engine.set(l.t.id, { mode: l.t.mode === 'loop' ? 'scatter' : 'loop' });
    else if ((k === 'Delete' || k === 'Backspace') && l) engine.remove(l.t.id);
    else if (k === '/') { const s = document.getElementById('lib-search'); if (s) s.focus(); else done = false; }
    else if (k === 'v' || k === 'V') window.dispatchEvent(new CustomEvent('vis-next'));
    else if (k === 't' || k === 'T') window.dispatchEvent(new CustomEvent('timer-toggle'));
    else if (k === 'g' || k === 'G') go('#/mixer');
    else if (k === '?') help();
    else done = false;
    if (done) e.preventDefault();
  });
}
