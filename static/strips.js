// Channel strips: one per layer in the mix, with level meter, volume, pan, mute, solo, loop/scatter and scatter timing.
import { esc, list } from './core.js';
import { CAT, fmtDur } from './catalog.js';
import { engine } from './audio_engine.js';
import { hitsPerMinute } from './scatter.js';
import { loadState } from './loader.js';

const pct = v => `${Math.round(v * 100)}`;

function strip(l, i) {
  const t = l.t, s = l.s, sel = i === engine.selected, st = loadState(s.file);
  const loading = l.state === 'loading' && st && st.total ? Math.round(100 * st.loaded / st.total) : null;
  const status = l.state === 'error' ? '<span class="err small">could not load: press play to retry</span>'
    : l.state === 'loading' ? `<span class="small mute">loading ${loading ?? ''}${loading === null ? '' : ' %'}</span>`
    : l.state === 'idle' ? '<span class="small mute">loads when you press play</span>' : '';
  return `<article class="strip ${sel ? 'sel' : ''} ${t.mute ? 'muted' : ''} ${t.solo ? 'solo' : ''}" data-id="${t.id}" style="--c:${CAT[s.cat].hue}"
      aria-label="Layer ${i + 1}: ${esc(s.name)}">
    <header><button class="strip-sel" data-act="select" aria-label="Select layer ${i + 1}" aria-pressed="${sel}">${i + 1}</button>
      <span class="strip-name"><b>${esc(s.name)}</b><small>${esc([s.source, CAT[s.cat].label, fmtDur(s.dur)].filter(Boolean).join(' · '))}</small></span>
      <button class="icon alt" data-act="remove" aria-label="Remove ${esc(s.name)}" title="Remove">&times;</button></header>
    <div class="meter" aria-hidden="true"><i></i></div>${status}
    <div class="strip-grid">
      <label>Volume <b data-out="vol">${pct(t.vol)}</b><input type="range" data-k="vol" min="0" max="1" step="0.01" value="${t.vol}"></label>
      <label>Pan <b data-out="pan">${t.pan === 0 ? 'C' : (t.pan < 0 ? 'L' : 'R') + pct(Math.abs(t.pan))}</b><input type="range" data-k="pan" min="-1" max="1" step="0.05" value="${t.pan}"></label>
    </div>
    <div class="strip-btns">
      <button class="tog ${t.mute ? 'on' : ''}" data-act="mute" aria-pressed="${t.mute}" title="Mute (M)">Mute</button>
      <button class="tog solo ${t.solo ? 'on' : ''}" data-act="solo" aria-pressed="${t.solo}" title="Solo (S)">Solo</button>
      <span class="seg" role="group" aria-label="Playback mode">
        <button class="${t.mode === 'loop' ? 'on' : ''}" data-act="mode" data-v="loop" aria-pressed="${t.mode === 'loop'}">Loop</button>
        <button class="${t.mode === 'scatter' ? 'on' : ''}" data-act="mode" data-v="scatter" aria-pressed="${t.mode === 'scatter'}">Scatter</button></span>
    </div>
    ${t.mode === 'scatter' ? `<div class="strip-grid">
      <label>Every <b data-out="every">${t.every} s</b><input type="range" data-k="every" min="0.5" max="60" step="0.5" value="${t.every}"></label>
      <label>Chance <b data-out="chance">${pct(t.chance)} %</b><input type="range" data-k="chance" min="0.05" max="1" step="0.05" value="${t.chance}"></label>
      <p class="small mute rate">≈ ${hitsPerMinute(t.every, t.chance).toFixed(1)} plays a minute</p></div>` : ''}
  </article>`;
}

export function mountStrips(host) {
  function render() {
    const f = document.activeElement;
    const keep = host.contains(f) ? [f.closest('[data-id]')?.dataset.id, f.dataset.act || f.dataset.k, f.dataset.v] : null;
    host.innerHTML = engine.layers.length ? list(engine.layers, strip)
      : `<div class="empty panel"><p><b>No layers yet.</b> Add sounds from the library with <kbd>+</kbd>, or start from a
         <a href="#/presets">preset</a>.</p></div>`;
    if (keep) {
      const q = `[data-id="${keep[0]}"] ${keep[1] && ['vol', 'pan', 'every', 'chance'].includes(keep[1]) ? `[data-k="${keep[1]}"]` : `[data-act="${keep[1]}"]${keep[2] ? `[data-v="${keep[2]}"]` : ''}`}`;
      host.querySelector(q)?.focus({ preventScroll: true });
    }
  }
  host.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (!k) return;
    const id = e.target.closest('[data-id]').dataset.id, v = +e.target.value;
    engine.set(id, { [k]: v });
    const t = engine.layer(id).t, out = e.target.closest('label').querySelector('b');
    out.textContent = k === 'vol' ? pct(t.vol) : k === 'pan' ? (t.pan === 0 ? 'C' : (t.pan < 0 ? 'L' : 'R') + pct(Math.abs(t.pan)))
      : k === 'every' ? `${t.every} s` : `${pct(t.chance)} %`;
    const rate = e.target.closest('.strip').querySelector('.rate');
    if (rate) rate.textContent = `≈ ${hitsPerMinute(t.every, t.chance).toFixed(1)} plays a minute`;
  });
  host.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const el = b.closest('[data-id]'), id = el.dataset.id, l = engine.layer(id);
    engine.selected = engine.layers.indexOf(l);
    if (b.dataset.act === 'remove') engine.remove(id);
    else if (b.dataset.act === 'mute') engine.set(id, { mute: !l.t.mute });
    else if (b.dataset.act === 'solo') engine.set(id, { solo: !l.t.solo });
    else if (b.dataset.act === 'mode') engine.set(id, { mode: b.dataset.v });
    else render();
  });
  // meters: called from the page's animation loop
  function meters() {
    host.querySelectorAll('.strip').forEach(el => {
      const l = engine.layer(el.dataset.id), i = el.querySelector('.meter i');
      if (!l || !i) return;
      const v = engine.playing ? Math.min(1, engine.level(l) * 3.2) : 0;
      l.shown = Math.max(v, (l.shown || 0) * 0.9);
      i.style.width = `${(l.shown * 100).toFixed(1)}%`;
    });
  }
  render();
  return { render, meters };
}
