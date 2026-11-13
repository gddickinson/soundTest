// #/sounds: the catalogue with facts read from every WAV (duration, rate, channels, peak/RMS, licence; /api/sounds).
// #/sounds/<id>: one sound analysed — waveform peaks and spectrum by the Python server (numpy, from the WAV) or, on the
// static site, by static/analysis.js in the browser (the same maths; tests/analysis.test.mjs).
import { route, app, api, esc, list, isStatic, $, onLeave } from './core.js';
import { CAT, CATEGORIES, fmtDur, fmtSize } from './catalog.js';
import { formats } from './loader.js';
import { drawWave, drawSpectrum } from './waveplot.js';

const dbf = v => `${v.toFixed(1)} dBFS`;
const EXT = { wav: '.wav', opus: '.opus', m4a: '.m4a' };

async function audioSrc(s) {
  const fmt = (await formats()).find(f => s.formats[f]) || 'wav';
  return isStatic() ? s.file.replace(/\.wav$/, EXT[fmt]) : `api/sound/${encodeURIComponent(s.id)}?format=${fmt}`;
}

function table(root, sounds, q, cat) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = sounds.filter(s => (!cat || s.category === cat) &&
    words.every(w => `${s.name} ${s.file} ${s.how || ''} ${s.licence}`.toLowerCase().includes(w)));
  root.innerHTML = `<p class="small mute">${rows.length} of ${sounds.length} sounds</p>
    <div class="scroll"><table class="sounds"><thead><tr><th>Sound</th><th>Category</th><th>Length</th><th>Rate</th><th>Ch</th>
    <th>Peak</th><th>RMS</th><th>Licence</th></tr></thead><tbody>${list(rows, s => `<tr class="click" data-id="${esc(s.id)}">
      <td><a href="#/sounds/${encodeURIComponent(s.id)}">${esc(s.name)}</a>${s.how ? `<small class="mute"> · ${esc(s.how)}</small>` : ''}</td>
      <td><span class="dot-c" style="--c:${CAT[s.category].hue}"></span>${esc(CAT[s.category].label)}</td>
      <td>${fmtDur(s.duration)}</td><td>${(s.rate / 1000).toFixed(s.rate % 1000 ? 2 : 0)} kHz</td><td>${s.channels}</td>
      <td>${s.peak_db.toFixed(1)}</td><td>${s.rms_db.toFixed(1)}</td><td>${esc(s.licence)}</td></tr>`)}</tbody></table></div>`;
}

route('sounds', async (args, query) => {
  if (args[0]) return detail(args[0], query);
  const { sounds } = await api('/sounds');
  const counts = Object.fromEntries(CATEGORIES.map(c => [c.key, sounds.filter(s => s.category === c.key).length]));
  app().innerHTML = `<div id="sp">
    <p class="kicker">Library</p><h1 class="glow">Sounds</h1>
    <p class="lead">All ${sounds.length} sounds with facts read from the WAV files: length, sample rate, channels, peak and RMS
      level (dBFS), and licence. Choose one to see its waveform and spectrum.</p>
    <div class="row"><div><label for="sq">Search</label><input id="sq" type="search" value="${esc(query.q || '')}" placeholder="name, file, synthesis"></div>
      <div><label for="sc">Category</label><select id="sc"><option value="">All categories</option>${list(CATEGORIES, c =>
        `<option value="${c.key}" ${query.cat === c.key ? 'selected' : ''}>${esc(c.label)} (${counts[c.key]})</option>`)}</select></div></div>
    <div id="st"></div>
    <p class="small mute">${isStatic() ? 'Facts exported from the Python API (api/sounds.json).' : 'Facts computed by the Python server from each WAV.'}
      Peak and RMS are over all channels; 0 dBFS is full scale.</p></div>`;
  const root = $('#sp'), st = $('#st'), qi = $('#sq'), ci = $('#sc');
  const redraw = () => table(st, sounds, qi.value, ci.value);
  qi.addEventListener('input', redraw); ci.addEventListener('change', redraw);
  root.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) location.hash = `#/sounds/${encodeURIComponent(tr.dataset.id)}`;
  });
  redraw();
});

async function detail(id, query) {
  const s = await api(`/sounds/${encodeURIComponent(id)}`);
  app().innerHTML = `<div id="sd">
    <p class="kicker"><a href="#/sounds">Sounds</a> / ${esc(CAT[s.category].label)}</p><h1 class="glow">${esc(s.name)}</h1>
    <p class="lead">${esc(s.how ? `Synthesised: ${s.how}.` : s.source)} <span class="mono small">${esc(s.file)}</span></p>
    <audio controls preload="none" id="sa" aria-label="Play ${esc(s.name)}"></audio>
    <div class="tiles">
      <div class="tile"><b>${fmtDur(s.duration)}</b><span>${s.frames.toLocaleString()} frames</span></div>
      <div class="tile"><b>${(s.rate / 1000).toFixed(s.rate % 1000 ? 2 : 1)}k</b><span>sample rate (Hz) · ${s.bits}-bit</span></div>
      <div class="tile"><b>${s.channels === 2 ? 'stereo' : 'mono'}</b><span>${s.channels} channel${s.channels > 1 ? 's' : ''}</span></div>
      <div class="tile"><b>${s.peak_db.toFixed(1)}</b><span>peak dBFS</span></div>
      <div class="tile"><b>${s.rms_db.toFixed(1)}</b><span>RMS dBFS</span></div>
      <div class="tile"><b id="cent">…</b><span>spectral centroid (Hz)</span></div>
    </div>
    <h2>Waveform</h2><div class="stage plot"><canvas id="cw" aria-label="Waveform of ${esc(s.name)}" role="img"></canvas></div>
    <p class="small mute">Per column: the minimum to maximum sample (darker) and the RMS level (bright) of the mono mix, scaled so the loudest sample fills the height.</p>
    <h2>Spectrum</h2><div class="stage plot"><canvas id="cs" aria-label="Spectrum of ${esc(s.name)}" role="img"></canvas></div>
    <p class="small mute" id="snote">Analysing…</p>
    <h3>Licence</h3><p>${esc(s.licence_text)}</p>
    <h3>Files</h3><p class="small">${list(Object.entries(s.formats), ([f, b]) => `<span class="tag">${f} · ${fmtSize(Math.round(b / 1024))}</span>`)}</p>
    <p><a class="btn alt" href="#/mixer?q=${encodeURIComponent(s.name)}">Find in the mixer</a>
      ${s.origin === 'original' ? `<a class="btn alt" href="#/synth?id=${encodeURIComponent(s.id)}">Open in the synth</a>` : ''}</p></div>`;
  $('#sa').src = await audioSrc(s);
  const a = await api(`/analyse/${encodeURIComponent(id)}?bins=600`);
  if (!document.getElementById('cw')) return;            // left the page meanwhile
  const draw = () => { drawWave($('#cw'), a.waveform); drawSpectrum($('#cs'), a.spectrum); };
  draw();
  $('#cent').textContent = Math.round(a.spectrum.centroid_hz).toLocaleString();
  $('#snote').textContent = `Averaged over ${a.spectrum.frames} Hann-windowed ${a.spectrum.nfft}-point FFT frames, in ${a.spectrum.db.length} log-spaced bands; ` +
    `loudest bin ${Math.round(a.spectrum.peak_hz)} Hz. ` + (a.source === 'wav' && !isStatic() ? 'Computed by the Python server (numpy) from the WAV.'
      : `Computed in your browser (static/analysis.js) from the decoded ${a.source === 'wav' ? 'WAV' : `${a.source} copy (lossy, so levels differ slightly from the WAV)`}.`);
  const ro = new ResizeObserver(() => document.getElementById('cw') && draw());
  ro.observe($('#cw'));
  onLeave(() => ro.disconnect());
}
