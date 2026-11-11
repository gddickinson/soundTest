// #/visualiser: the visualiser full size, with style buttons and full-screen.
import { route, app, animate, onLeave } from './core.js';
import { engine } from './audio_engine.js';
import { makeVisualiser, MODES } from './visualiser.js';
import { prefs, setPref } from './store.js';
import { PRESETS } from './presets.js';
import { load } from './mixes_panel.js';

route('visualiser', () => {
  let mode = prefs().vis;
  app().innerHTML = `
    <p class="kicker">Live output</p><h1 class="glow">Visualiser</h1>
    <p class="lead">What you hear, drawn from the master output's AnalyserNode (4096-point FFT, 30 Hz – 16 kHz on a log scale).</p>
    <div class="row vis-ctl"><div class="seg" role="group" aria-label="Visualiser style">${MODES.map(([k, v]) =>
      `<button data-vis="${k}" aria-pressed="${k === mode}" class="${k === mode ? 'on' : ''}">${v}</button>`).join('')}</div>
      <button class="alt" id="vis-full">Full screen</button></div>
    <div class="stage vis-big" id="vis-wrap"><canvas id="vis" role="img" aria-label="Live visualiser of the mix"></canvas></div>
    <p class="mute small" id="vis-hint"></p>`;
  const vis = makeVisualiser(app().querySelector('#vis'), () => engine.analyser);
  const btns = [...app().querySelectorAll('[data-vis]')];
  const setVis = k => { mode = k; setPref('vis', k); btns.forEach(b => { b.classList.toggle('on', b.dataset.vis === k); b.setAttribute('aria-pressed', b.dataset.vis === k); }); };
  btns.forEach(b => b.addEventListener('click', () => setVis(b.dataset.vis)));
  app().querySelector('#vis-full').addEventListener('click', () => {
    const w = app().querySelector('#vis-wrap');
    (document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.())?.catch?.(() => {});
  });
  const hint = app().querySelector('#vis-hint');
  const setHint = () => {
    hint.innerHTML = engine.layers.length ? (engine.playing ? 'Press <kbd>V</kbd> to change style, <kbd>Space</kbd> to pause.' : 'Press <kbd>Space</kbd> or the play button below to start.')
      : `Nothing to show yet: <button class="link" id="vis-demo">play the “${PRESETS[0].name}” preset</button> or build a mix in the <a href="#/mixer">mixer</a>.`;
    hint.querySelector('#vis-demo')?.addEventListener('click', () => load(PRESETS[0].mix));
  };
  const onVis = () => setVis(MODES[(MODES.findIndex(m => m[0] === mode) + 1) % MODES.length][0]);
  engine.addEventListener('state', setHint); window.addEventListener('vis-next', onVis);
  setHint();
  const stop = animate(t => vis.draw(mode, t, engine.playing || !!engine.previewing));
  onLeave(() => { stop(); engine.removeEventListener('state', setHint); window.removeEventListener('vis-next', onVis); });
});
