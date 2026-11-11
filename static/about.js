// #/about: what soundTest is, how it works, how to run it locally, keyboard shortcuts, tests and history.
import { route, app, esc, list } from './core.js';
import { SHORTCUTS } from './keys.js';
import { totals } from './catalog.js';

route('about', () => {
  const T = totals();
  app().innerHTML = `
    <p class="kicker">About</p><h1 class="glow">soundTest</h1>
    <p class="lead">“Sleeping loops and more”: a browser sound mixer for relaxation, focus and sleep, built on the
      ${T.sounds} WAV samples (${Math.round(T.mb)} MB) in this repository, by G.D. Dickinson.</p>
    <div class="two">
      <div class="panel"><h3>How it works</h3><ul>
        <li>Everything runs in your browser with the Web Audio API; there is no server beyond static files.</li>
        <li>WAVs are downloaded only when a sound is used, with progress shown; each is decoded once and cached.</li>
        <li><b>Loop</b> layers fold the last 1.5 s of the sound over its start with an equal-power crossfade, then play
          with <code>AudioBufferSourceNode.loop</code>, so the loop point is sample-accurate and has no click.</li>
        <li><b>Scatter</b> layers decide every N seconds (±25 %) whether to play, with a chance you set; one-shots are scheduled
          ahead on the audio clock. With 2 s and 40 % this is the original page's chime loop.</li>
        <li>Mute, solo, volume and pan changes glide (no zipper noise); loading a preset crossfades over 2.5 s.</li>
        <li>The sleep timer fades a dedicated gain stage along a smooth curve over the last minutes, then pauses.</li>
        <li>A gentle limiter on the master keeps many layers from clipping.</li>
        <li>Mixes are saved in <code>localStorage</code> and encoded in the link: <code>#/mixer?mix=v1~m80~ocean-waves-40.70.0.L</code>.</li>
      </ul></div>
      <div class="panel"><h3>Keyboard</h3><table>${list(SHORTCUTS, ([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`)}</table></div>
    </div>
    <div class="two">
      <div class="panel"><h3>Run it locally</h3>
        <pre>git clone https://github.com/gddickinson/soundTest.git
cd soundTest
python3 -m http.server 8000
# open http://localhost:8000/</pre>
        <p class="small mute">Any static file server works. Opening index.html straight from disk does not: browsers block
          ES modules and audio fetches from <code>file://</code>.</p></div>
      <div class="panel"><h3>Tests</h3>
        <pre>node --test tests/          # mix links, timer fade, loops, catalog
python -m pytest -q tests/  # Playwright smoke test</pre>
        <h3>The original page</h3>
        <p>The first version (chimes, white noise, ocean, an analyser with nine bars) is kept at
          <a href="classic/">classic/</a>, with its bugs fixed.</p></div>
    </div>
    <p class="mute small">Sound credits and licences: <a href="#/credits">Credits</a>. Source:
      <a href="https://github.com/gddickinson/soundTest">github.com/gddickinson/soundTest</a>.</p>`;
});
