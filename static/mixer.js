// #/mixer: visualiser + transport, the library, channel strips, sleep timer and mixes. `?mix=v1~...` loads a shared
// mix (it starts when you press play: browsers need a click before sound), `?cat=` opens a library category.
import { route, app, esc, animate, onLeave } from './core.js';
import { engine } from './audio_engine.js';
import { decodeMix, sameMix } from './mix_codec.js';
import { sound, CAT } from './catalog.js';
import { makeVisualiser, MODES } from './visualiser.js';
import { mountLibrary } from './library_panel.js';
import { mountStrips } from './strips.js';
import { mountTimer } from './timer_panel.js';
import { mountMixes } from './mixes_panel.js';
import { syncHash } from './share.js';
import { prefs, setPref } from './store.js';
import { loader } from './loader.js';

route('mixer', (args, query) => {
  let note = '';
  if (query.mix) {
    const m = decodeMix(query.mix, id => !!sound(id));
    if (!m) note = '<p class="callout">That link does not contain a valid mix.</p>';
    else if (!sameMix(m, engine.mix)) {
      engine.applyMix(m);
      note = engine.playing ? '' : `<p class="callout a" id="link-note">Shared mix loaded: ${m.tracks.length} layer${m.tracks.length === 1 ? '' : 's'}.
        Press <b>Play</b> to hear it.</p>`;
    }
  }
  let mode = prefs().vis;
  app().innerHTML = `
    <section class="mix-head">
      <div><p class="kicker">WebAudio mixer</p><h1 class="glow">Mixer</h1></div>
      <div class="transport">
        <button id="mx-play" class="big-play"></button>
        <button id="mx-stop" class="alt">Stop</button>
        <button id="mx-clear" class="alt">Clear</button>
        <button class="alt" id="mx-keys" title="Keyboard shortcuts (?)">Keys</button>
      </div>
    </section>
    ${note}
    <div class="stage vis-stage"><canvas id="vis" aria-label="Live spectrum of the mix" role="img"></canvas>
      <div class="vis-modes seg" role="group" aria-label="Visualiser style">${MODES.map(([k, v]) => `<button data-vis="${k}" aria-pressed="${k === mode}" class="${k === mode ? 'on' : ''}">${v}</button>`).join('')}</div></div>
    <div class="mixer-grid">
      <aside class="panel lib-panel" id="lib"></aside>
      <section class="mix-col">
        <div class="strips" id="strips" aria-live="off"></div>
        <div class="two">
          <div class="panel" id="timer"></div>
          <div class="panel" id="mixes"></div>
        </div>
      </section>
    </div>`;
  const lib = mountLibrary(app().querySelector('#lib'), { cat: CAT[query.cat] ? query.cat : '', q: query.q || '' });
  const strips = mountStrips(app().querySelector('#strips'));
  const timer = mountTimer(app().querySelector('#timer'));
  const mixes = mountMixes(app().querySelector('#mixes'));
  const vis = makeVisualiser(app().querySelector('#vis'), () => engine.analyser);
  const play = app().querySelector('#mx-play');

  function transport() {
    play.innerHTML = engine.playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
    play.disabled = !engine.layers.length;
    if (engine.playing) app().querySelector('#link-note')?.remove();
  }
  play.addEventListener('click', () => engine.toggle());
  app().querySelector('#mx-stop').addEventListener('click', () => { engine.pause(); engine.cancelTimer(); });
  app().querySelector('#mx-clear').addEventListener('click', () => engine.clear());
  app().querySelector('#mx-keys').addEventListener('click', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })));
  const visBtns = [...app().querySelectorAll('[data-vis]')];
  const setVis = k => { mode = k; setPref('vis', k); visBtns.forEach(b => { b.classList.toggle('on', b.dataset.vis === k); b.setAttribute('aria-pressed', b.dataset.vis === k); }); };
  visBtns.forEach(b => b.addEventListener('click', () => setVis(b.dataset.vis)));

  const onChange = e => {
    syncHash(engine.mix);
    mixes.refreshLink();
    if (e?.detail?.quiet) return;
    strips.render(); lib.render(); mixes.render(); transport();
  };
  const onState = () => { transport(); strips.render(); };
  const onSelect = () => strips.render();
  const onVis = () => setVis(MODES[(MODES.findIndex(m => m[0] === mode) + 1) % MODES.length][0]);
  const onTimer = () => timer.toggle();
  let pending = 0;
  const onProgress = () => { if (!pending) pending = setTimeout(() => { pending = 0; strips.render(); lib.render(); }, 250); };
  engine.addEventListener('change', onChange);
  engine.addEventListener('state', onState);
  engine.addEventListener('preview', lib.render);
  loader.addEventListener('progress', onProgress);
  window.addEventListener('layer-select', onSelect);
  window.addEventListener('vis-next', onVis);
  window.addEventListener('timer-toggle', onTimer);
  transport();
  if (engine.layers.length) syncHash(engine.mix);

  let last = 0;
  const stopAnim = animate(t => {
    vis.draw(mode, t, engine.playing || !!engine.previewing);
    strips.meters();
    if (engine.timer && t - last > 500) { last = t; timer.update(); }
  });
  onLeave(() => {
    stopAnim(); clearTimeout(pending);
    engine.removeEventListener('change', onChange);
    engine.removeEventListener('state', onState);
    engine.removeEventListener('preview', lib.render);
    loader.removeEventListener('progress', onProgress);
    window.removeEventListener('layer-select', onSelect);
    window.removeEventListener('vis-next', onVis);
    window.removeEventListener('timer-toggle', onTimer);
  });
});
