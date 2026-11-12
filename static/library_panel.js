// The sound library on the mixer page: search, category chips, preview and add buttons, per-file load progress.
import { esc, list } from './core.js';
import { CATEGORIES, CAT, SOUNDS, search, fmtDur } from './catalog.js';
import { engine } from './audio_engine.js';
import { loadState } from './loader.js';

export function mountLibrary(host, { cat = '', q = '' } = {}) {
  host.innerHTML = `
    <h2 class="h-panel">Library</h2>
    <label for="lib-search">Search ${SOUNDS.length} sounds <span class="mute">(press /)</span></label>
    <input id="lib-search" type="search" placeholder="ocean, chime, korg, wind…" value="${esc(q)}" autocomplete="off">
    <div class="chips" role="group" aria-label="Categories">
      <button class="chip ${cat ? '' : 'on'}" data-cat="" aria-pressed="${!cat}">All <small>${SOUNDS.length}</small></button>
      ${list(CATEGORIES, c => `<button class="chip ${c.key === cat ? 'on' : ''}" data-cat="${c.key}" aria-pressed="${c.key === cat}"
        style="--c:${c.hue}">${esc(c.label)} <small>${SOUNDS.filter(s => s.cat === c.key).length}</small></button>`)}
    </div>
    <p class="mute small" id="lib-count" aria-live="polite"></p>
    <ul class="lib" id="lib-list"></ul>`;
  const input = host.querySelector('#lib-search'), ul = host.querySelector('#lib-list'), count = host.querySelector('#lib-count');
  let curCat = cat;

  function row(s) {
    const inMix = engine.has(s.id), st = loadState(s.file), prev = engine.previewing === s.id;
    const pct = st && !st.done && !st.error && st.total ? Math.round(100 * st.loaded / st.total) : null;
    return `<li class="lib-row ${inMix ? 'in' : ''}" data-id="${s.id}" style="--c:${CAT[s.cat].hue}">
      <button class="icon alt" data-act="preview" aria-label="${prev ? 'Stop preview of' : 'Preview'} ${esc(s.name)}" title="Preview">${prev ? '&#9632;' : '&#9654;'}</button>
      <span class="lib-name"><b>${esc(s.name)}</b><small>${esc([s.source, CAT[s.cat].label].filter(Boolean).join(' · '))}</small></span>
      <span class="lib-meta mono small">${fmtDur(s.dur)}<br>${pct === null ? (s.ch === 1 ? 'mono' : 'stereo') : pct + ' %'}</span>
      <button class="icon" data-act="add" ${inMix ? 'disabled' : ''} aria-label="${inMix ? esc(s.name) + ' is in the mix' : 'Add ' + esc(s.name) + ' to the mix'}"
        title="${inMix ? 'In the mix' : 'Add to the mix'}">${inMix ? '&#10003;' : '+'}</button>
      ${pct === null ? '' : `<i class="lib-prog" style="width:${pct}%"></i>`}</li>`;
  }
  function render() {
    const f = document.activeElement, keep = ul.contains(f) && f.dataset.act ? [f.closest('[data-id]').dataset.id, f.dataset.act] : null;
    const found = search(input.value, curCat);
    count.textContent = `${found.length} sound${found.length === 1 ? '' : 's'}${input.value ? ` matching “${input.value}”` : ''}`;
    ul.innerHTML = found.length ? list(found, row) : '<li class="mute small">Nothing matches. Try another word or category.</li>';
    if (keep) ul.querySelector(`[data-id="${keep[0]}"] [data-act="${keep[1]}"]`)?.focus({ preventScroll: true });
  }
  input.addEventListener('input', render);
  host.querySelector('.chips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    curCat = b.dataset.cat;
    host.querySelectorAll('.chip').forEach(c => { c.classList.toggle('on', c === b); c.setAttribute('aria-pressed', c === b); });
    render();
  });
  ul.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (b.dataset.act === 'add') { engine.add(id); if (!engine.playing) engine.play(); }
    else if (engine.previewing === id) engine.stopPreview();
    else engine.previewSound(id).catch(err => console.warn(err));
  });
  render();
  return { render, focus: () => input.focus() };
}
