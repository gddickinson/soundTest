// #/ home: hero with a live visualiser, real counts from the catalog, presets and the sound categories.
import { route, app, esc, list, animate } from './core.js';
import { CATEGORIES, SOUNDS, totals, fmtDur } from './catalog.js';
import { PRESETS } from './presets.js';
import { engine } from './audio_engine.js';
import { makeVisualiser } from './visualiser.js';
import { load } from './mixes_panel.js';

route('home', () => {
  const T = totals();
  app().innerHTML = `
    <section class="hero home-hero">
      <div>
        <p class="kicker">Sleeping loops and more</p>
        <h1 class="glow">soundTest</h1>
        <p class="lead">A sound mixer in your browser. Layer ocean waves, noise, bells, wind, old synth instruments and
          sci-fi glitches; loop them seamlessly or scatter them at random, balance them like a mixing desk, then let the
          sleep timer fade everything out.</p>
        <a class="btn" href="#/mixer">Open the mixer</a> <a class="btn alt" href="#/presets">Start from a preset</a>
      </div>
      <div class="stage hero-vis"><canvas id="hero-vis" role="img" aria-label="Live visualiser (orbit) of whatever is playing"></canvas></div>
    </section>
    <div class="tiles">
      <div class="tile"><b>${T.sounds}</b><span>sounds (WAV)</span></div>
      <div class="tile"><b>${T.categories}</b><span>categories</span></div>
      <div class="tile"><b>${Math.round(T.minutes)}</b><span>minutes of audio</span></div>
      <div class="tile"><b>${PRESETS.length}</b><span>preset mixes</span></div>
    </div>
    <h2>Presets</h2>
    <p class="mute">One click: the mix crossfades in and starts playing.</p>
    <div class="grid">${list(PRESETS, p => `<button class="card click preset-card" data-preset="${p.key}">
      <b>${esc(p.name)}</b><span>${esc(p.blurb)}</span><small>${p.mix.tracks.length} layers</small></button>`)}</div>
    <h2>The library</h2>
    <div class="grid">${list(CATEGORIES, c => {
      const ss = SOUNDS.filter(s => s.cat === c.key);
      return `<a class="card cat-card" href="#/mixer?cat=${c.key}" style="--c:${c.hue}"><b>${esc(c.label)}</b>
        <small>${ss.length} sounds · ${fmtDur(ss.reduce((a, s) => a + s.dur, 0))} in total</small>
        <span>${esc(ss.slice(0, 5).map(s => s.name).join(', '))}${ss.length > 5 ? ', …' : ''}</span></a>`;
    })}</div>
    <h2>What it does</h2>
    <div class="grid wide">
      <a class="card" href="#/mixer"><b>Mixer</b><span>Per-layer volume, pan, mute and solo; master volume; level meters; up to 24 layers.</span></a>
      <a class="card" href="#/mixer"><b>Seamless loops</b><span>Each loop's end is crossfaded into its start and played with sample-accurate WebAudio loop points: no click at the seam.</span></a>
      <a class="card" href="#/mixer"><b>Scatter</b><span>Short sounds play at random moments (every N seconds with a chance), like the original page's chime loop.</span></a>
      <a class="card" href="#/mixer"><b>Sleep timer</b><span>Stops after 5 minutes to 2 hours, fading out gradually over the last minutes.</span></a>
      <a class="card" href="#/presets"><b>Save and share</b><span>Mixes are saved in your browser, and every mix has a link that rebuilds it exactly.</span></a>
      <a class="card" href="#/visualiser"><b>Visualiser</b><span>Live spectrum, waveform and orbit views of the master output.</span></a>
    </div>`;
  app().querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    load(PRESETS.find(p => p.key === b.dataset.preset).mix);
    location.hash = '#/mixer';
  }));
  const vis = makeVisualiser(app().querySelector('#hero-vis'), () => engine.analyser);
  animate(t => vis.draw('orbit', t, engine.playing || !!engine.previewing));
});
