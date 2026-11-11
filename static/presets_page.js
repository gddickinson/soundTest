// #/presets: the built-in mixes (with their layers) and the mixes saved in this browser.
import { route, app, esc, list, go } from './core.js';
import { PRESETS } from './presets.js';
import { savedMixes, deleteMix } from './store.js';
import { sound, CAT } from './catalog.js';
import { mixHash } from './share.js';
import { load } from './mixes_panel.js';

const layers = mix => list(mix.tracks, t => {
  const s = sound(t.id);
  return `<li style="--c:${CAT[s.cat].hue}"><span class="dot-c"></span>${esc(s.name)} <small class="mute">${t.mode === 'loop' ? 'loop' : `scatter · every ${t.every} s · ${Math.round(t.chance * 100)} %`} · vol ${Math.round(t.vol * 100)}</small></li>`;
});

route('presets', () => {
  app().innerHTML = '<div id="pp"></div>';
  const root = app().querySelector('#pp');     // listeners go on this child: #app itself outlives the page
  const render = () => {
    const saved = savedMixes();
    root.innerHTML = `
      <p class="kicker">Mixes</p><h1 class="glow">Presets</h1>
      <p class="lead">Starting points built only from the sounds in this repository. Playing one crossfades from whatever is
        playing now; then change anything in the mixer.</p>
      <div class="grid wide">${list(PRESETS, p => `<article class="card preset-full">
        <b>${esc(p.name)}</b><span>${esc(p.blurb)}</span><ul class="layers">${layers(p.mix)}</ul>
        <button data-play="${p.key}">&#9654; Play</button> <a class="btn alt" href="${mixHash(p.mix)}">Open in mixer</a></article>`)}</div>
      <h2>Saved in this browser</h2>
      ${saved.length ? `<div class="grid wide">${list(saved, m => `<article class="card preset-full"><b>${esc(m.name)}</b>
        <small>saved ${esc(m.saved.slice(0, 10))}</small><ul class="layers">${layers(m.mix)}</ul>
        <button data-saved="${esc(m.name)}">&#9654; Play</button> <button class="alt" data-del="${esc(m.name)}">Delete</button></article>`)}</div>`
        : '<p class="mute">None yet. In the mixer, give your mix a name and press Save.</p>'}`;
  };
  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.play) { load(PRESETS.find(p => p.key === b.dataset.play).mix); go('#/mixer'); }
    else if (b.dataset.saved) { load(savedMixes().find(m => m.name === b.dataset.saved).mix); go('#/mixer'); }
    else if (b.dataset.del) { deleteMix(b.dataset.del); render(); }
  });
  render();
});
