// #/credits: where the sounds come from and under which terms (THIRD_PARTY.md and the Korg pack's Readme.txt are
// fetched and shown as they are), plus the full file list.
import { route, app, esc, list } from './core.js';
import { manifest } from './loader.js';
import { fileFor, libraryKB } from './codec_trim.js';
import { CATEGORIES, SOUNDS, fmtDur, fmtSize } from './catalog.js';

async function text(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; }
}

route('credits', async () => {
  const [third, korg, man] = await Promise.all([text('THIRD_PARTY.md'), text('audio/Korg-DS-8-Sci-Fi-Sound-Effects-Pack/Readme.txt'), manifest()]);
  const mb = f => (man ? (libraryKB(man, f) / 1024).toFixed(1) : '?');
  const comp = (s, f) => (man?.files[s.file] ? `<a href="${esc(fileFor(s.file, f))}">${fmtSize(man.files[s.file][f].kb)}</a>` : '');
  app().innerHTML = `
    <p class="kicker">Credits and licences</p><h1 class="glow">Sound credits</h1>
    <p class="lead">The code of soundTest is under the MIT licence (<a href="https://github.com/gddickinson/soundTest/blob/master/LICENSE">LICENSE</a>). The sound samples in
      <code>audio/</code> come from third-party sample collections and are <b>not</b> covered by the MIT licence.</p>
    <div class="two">
      <div class="panel"><h3>THIRD_PARTY.md</h3><pre>${esc(third ?? 'See THIRD_PARTY.md in the repository.')}</pre></div>
      <div class="panel"><h3>audio/Korg-DS-8-Sci-Fi-Sound-Effects-Pack/Readme.txt</h3><pre>${esc(korg ?? 'See the Readme.txt in the repository.')}</pre></div>
    </div>
    <p class="mute small">Only the Korg DS-8 pack ships with its own licence text. The other files carry no separate notice in
      the repository; their names (instrument and patch, e.g. “Kawai-K5000W-Thunder”) are kept below so their origin can be traced.
      No new sound was added for the web page. The <code>.opus</code> and <code>.m4a</code> files next to each WAV are compressed
      copies made from it by <code>scripts/compress_audio.py</code>; they are the same recordings under the same terms.</p>
    <p class="mute small">Downloading the whole library: WAV ${mb('wav')} MB, Opus ${mb('opus')} MB, AAC ${mb('m4a')} MB. The player
      fetches Opus where the browser supports it, else AAC, else the WAV, and trims the decoded audio back to the WAV's exact length.</p>
    <h2>All ${SOUNDS.length} files</h2>
    ${list(CATEGORIES, c => {
      const ss = SOUNDS.filter(s => s.cat === c.key);
      return `<h3>${esc(c.label)} (${ss.length})</h3><div class="scroll"><table class="files"><thead><tr><th>Name</th><th>File</th>
        <th>Length</th><th>Format</th><th>WAV</th><th>Opus</th><th>AAC</th></tr></thead><tbody>${list(ss, s => `<tr><td>${esc(s.name)}</td>
        <td><a href="${esc(s.file)}" class="mono small">${esc(s.file.replace(/^audio\//, ''))}</a></td><td>${fmtDur(s.dur)}</td>
        <td class="small">${s.ch === 1 ? 'mono' : 'stereo'}, ${s.sr / 1000} kHz</td><td>${fmtSize(s.kb)}</td><td>${comp(s, 'opus')}</td><td>${comp(s, 'm4a')}</td></tr>`)}</tbody></table></div>`;
    })}`;
});
