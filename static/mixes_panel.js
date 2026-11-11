// Presets, saved mixes (localStorage), share link and "resume last mix".
import { esc, list } from './core.js';
import { engine } from './audio_engine.js';
import { PRESETS } from './presets.js';
import { savedMixes, saveMix, deleteMix, lastMix } from './store.js';
import { shareUrl, copyText } from './share.js';
import { sound } from './catalog.js';

const names = mix => mix.tracks.map(t => sound(t.id)?.name).filter(Boolean).join(', ');

export function load(mix) {
  engine.applyMix(mix);
  if (!engine.playing) engine.play();
}

export function mountMixes(host) {
  function render() {
    const typed = host.querySelector('#save-name'), name = typed?.value || '', had = typed && document.activeElement === typed;
    const saved = savedMixes(), last = lastMix();
    host.innerHTML = `
      <h2 class="h-panel">Mixes</h2>
      <h3>Presets</h3>
      <div class="preset-list">${list(PRESETS, p => `<button class="preset" data-preset="${p.key}" title="${esc(p.blurb)}">${esc(p.name)}</button>`)}</div>
      <h3>Share this mix</h3>
      <div class="share-row"><label class="sr" for="share-url">Link to this mix</label>
        <input id="share-url" readonly value="${esc(shareUrl(engine.mix))}"><button id="share-copy" class="alt">Copy</button></div>
      <p class="small mute" id="share-msg" aria-live="polite"></p>
      <h3>Save</h3>
      <form class="share-row" id="save-form"><label class="sr" for="save-name">Name for this mix</label>
        <input id="save-name" placeholder="Name this mix" maxlength="60"><button ${engine.layers.length ? '' : 'disabled'}>Save</button></form>
      ${saved.length ? `<ul class="saved">${list(saved, m => `<li><button class="link" data-load="${esc(m.name)}">${esc(m.name)}</button>
        <small class="mute">${m.mix.tracks.length} layers · ${esc(m.saved.slice(0, 10))}</small>
        <button class="icon alt" data-del="${esc(m.name)}" aria-label="Delete ${esc(m.name)}">&times;</button></li>`)}</ul>`
        : '<p class="small mute">Saved mixes stay in this browser.</p>'}
      ${last && !engine.layers.length ? `<p><button class="alt" id="resume">Resume last mix</button><br><small class="mute">${esc(names(last))}</small></p>` : ''}`;
    const input = host.querySelector('#save-name');
    input.value = name;
    if (had) input.focus({ preventScroll: true });
  }
  host.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.preset) load(PRESETS.find(p => p.key === b.dataset.preset).mix);
    else if (b.dataset.load) load(savedMixes().find(m => m.name === b.dataset.load).mix);
    else if (b.dataset.del) { deleteMix(b.dataset.del); render(); }
    else if (b.id === 'resume') load(lastMix());
    else if (b.id === 'share-copy') {
      const input = host.querySelector('#share-url');
      const ok = await copyText(input.value);
      if (!ok) input.select();
      host.querySelector('#share-msg').textContent = ok ? 'Link copied.' : 'Select the link and copy it (Ctrl/Cmd+C).';
    }
  });
  host.addEventListener('submit', e => {
    e.preventDefault();
    const name = saveMix(host.querySelector('#save-name').value, engine.mix);
    host.querySelector('#save-name').value = '';
    render();
    host.querySelector('#share-msg').textContent = name ? `Saved “${name}”.` : 'Could not save (browser storage is blocked).';
  });
  render();
  return { render, refreshLink: () => { const i = host.querySelector('#share-url'); if (i) i.value = shareUrl(engine.mix); } };
}
