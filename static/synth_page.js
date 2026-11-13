// #/synth (?id=): generate one of the 52 original sounds on the Python server with the repo's own synthesis code
// (scripts/synth/, via POST /api/synth), changing its seed, length and its recipe's bounded parameters; then play,
// download and analyse the result (static/analysis.js). On the static site the recipes are listed but generating needs
// the local app.
import { route, app, api, esc, list, isStatic, $, onLeave } from './core.js';
import { analyse } from './analysis.js';
import { decodeBytes } from './decode.js';
import { drawWave, drawSpectrum } from './waveplot.js';

const step = p => (p.kind === 'int' ? 1 : p.max - p.min <= 1.01 ? 0.0005 : p.max - p.min <= 20 ? 0.05 : 1);
const field = (p, v) => p.kind === 'choice'
  ? `<div><label for="p-${p.name}">${esc(p.name)}</label><select id="p-${p.name}" data-p="${p.name}">${list(p.choices, c =>
      `<option ${c === v ? 'selected' : ''}>${esc(c)}</option>`)}</select></div>`
  : `<div><label for="p-${p.name}">${esc(p.name)} <span class="mute">(${p.min}–${p.max})</span></label>
     <input id="p-${p.name}" data-p="${p.name}" type="number" min="${p.min}" max="${p.max}" step="${step(p)}" value="${v}"></div>`;

route('synth', async (args, query) => {
  const data = await api('/synth');
  const sounds = data.sounds, off = isStatic();
  let cur = sounds.find(s => s.id === query.id) || sounds[0], url = null;
  app().innerHTML = `<div id="sy">
    <p class="kicker">Python synthesis</p><h1 class="glow">Synth</h1>
    <p class="lead">The ${sounds.length} original sounds are made by numpy code in this repository (<span class="mono">scripts/synth/</span>).
      Here the server runs that code again: change the seed for a new variation, the length, or the recipe's own settings,
      then listen, download the WAV and see its waveform and spectrum.</p>
    ${off ? `<div class="callout a static-note" id="needs">Generating needs the local Python app: <span class="mono">python run_web.py</span>
      (or Project Hub). On this static site you can browse the recipes and their settings.</div>` : ''}
    <div class="side">
      <div class="panel">
        <label for="sid">Sound</label><select id="sid">${list(sounds, s => `<option value="${esc(s.id)}">${esc(s.name || s.id)}</option>`)}</select>
        <div id="pf"></div>
        <button id="go" ${off ? 'disabled title="Needs the local Python app"' : ''}>Generate</button>
        <button class="alt" id="reset">Reset</button>
        <p class="small" id="msg" role="status"></p>
      </div>
      <div>
        <div class="panel" id="about"></div>
        <div id="out" hidden>
          <audio controls id="au" aria-label="Generated sound"></audio> <a class="btn alt" id="dl" download>Download WAV</a>
          <div class="tiles" id="facts"></div>
          <h3>Waveform</h3><div class="stage plot"><canvas id="cw" role="img" aria-label="Waveform of the generated sound"></canvas></div>
          <h3>Spectrum</h3><div class="stage plot"><canvas id="cs" role="img" aria-label="Spectrum of the generated sound"></canvas></div>
          <p class="small mute">Analysed in your browser by static/analysis.js (the same maths as the server's /api/analyse); the waveform is scaled to its loudest sample.</p>
        </div>
      </div>
    </div></div>`;
  const msg = $('#msg');
  const form = () => {
    $('#sid').value = cur.id;
    $('#pf').innerHTML = `<div class="row">
      <div><label for="seed">Seed <span class="mute">(0–${data.max_seed})</span></label><input id="seed" type="number" min="0" max="${data.max_seed}" step="1" value="${cur.seed}"></div>
      <div><label for="dur">Length, s <span class="mute">(${data.min_seconds}–${data.max_seconds})</span></label><input id="dur" type="number" min="${data.min_seconds}" max="${data.max_seconds}" step="0.05" value="${cur.default_duration}"></div></div>
      <div class="row">${list(cur.params, p => field(p, p.default))}</div>
      ${cur.params.length ? '' : '<p class="small mute">This recipe has no adjustable settings; change the seed or length.</p>'}`;
    $('#about').innerHTML = `<b>${esc(cur.name || cur.id)}</b> <span class="mono small mute">${esc(cur.file)}</span>
      <p class="small">Recipe <span class="mono">${esc(cur.recipe)}</span>: ${esc(cur.how)}. ${cur.loop ? 'A seamless loop' : 'A one-shot'};
      ${cur.channels === 2 ? 'stereo' : 'mono'}, ${cur.rate} Hz; the committed file is ${cur.duration} s
      ${cur.duration > data.max_seconds ? `(generated here up to ${data.max_seconds} s)` : ''}. With the default seed, length and settings
      the result is the committed WAV.</p>`;
  };
  const request = () => {
    const params = {};
    for (const p of cur.params) {
      const el = $(`[data-p="${p.name}"]`), v = p.kind === 'choice' ? el.value : Number(el.value);
      if (v !== p.default) params[p.name] = v;
    }
    return { id: cur.id, seed: Number($('#seed').value), duration: Number($('#dur').value), params };
  };
  const invalid = () => [...document.querySelectorAll('#pf input[type=number]')].map(el => {
    const v = Number(el.value), name = el.labels[0]?.firstChild.textContent.trim() || el.id;
    if (el.value === '' || !(v >= Number(el.min) && v <= Number(el.max))) return `${name} must be between ${el.min} and ${el.max}`;
    if ((el.step === '1') && !Number.isInteger(v)) return `${name} must be a whole number`;
    return null;
  }).find(Boolean);
  const generate = async () => {
    const bad = invalid();
    if (bad) { msg.className = 'small err'; msg.textContent = bad; return; }
    const b = $('#go'); b.disabled = true; msg.className = 'small'; msg.textContent = 'Generating on the server…';
    try {
      const t0 = performance.now();
      const r = await fetch('api/synth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request()) });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(typeof e.detail === 'string' ? e.detail : (e.detail || []).map(d => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join('; ') || r.statusText);
      }
      const bytes = await r.arrayBuffer();
      if (!document.getElementById('sy')) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
      $('#au').src = url; $('#dl').href = url; $('#dl').download = `${cur.id}-${r.headers.get('X-Seed')}.wav`;
      const { channels, rate } = await decodeBytes(bytes.slice(0), cur.channels, cur.rate);
      const a = analyse(channels, rate, { bins: 500 });
      $('#out').hidden = false;
      $('#facts').innerHTML = `<div class="tile"><b>${a.duration.toFixed(2)} s</b><span>${a.frames.toLocaleString()} frames</span></div>
        <div class="tile"><b>${a.levels.peak_db.toFixed(1)}</b><span>peak dBFS</span></div>
        <div class="tile"><b>${a.levels.rms_db.toFixed(1)}</b><span>RMS dBFS</span></div>
        <div class="tile"><b>${Math.round(a.spectrum.centroid_hz)}</b><span>centroid (Hz)</span></div>`;
      drawWave($('#cw'), a.waveform); drawSpectrum($('#cs'), a.spectrum);
      msg.className = 'small ok'; msg.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s (seed ${r.headers.get('X-Seed')}).`;
    } catch (e) {
      msg.className = 'small err'; msg.textContent = e.message;
    } finally { b.disabled = off; }
  };
  $('#sid').addEventListener('change', e => { cur = sounds.find(s => s.id === e.target.value); form(); history.replaceState(null, '', `#/synth?id=${encodeURIComponent(cur.id)}`); });
  $('#reset').addEventListener('click', form);
  $('#go').addEventListener('click', generate);
  onLeave(() => { if (url) URL.revokeObjectURL(url); });
  form();
});
