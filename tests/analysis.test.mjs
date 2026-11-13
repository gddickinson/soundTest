// static/analysis.js must agree with web/analysis.py (tests/fixtures/analysis.json, scripts/make_analysis_fixture.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyse, fft, hanning } from '../static/analysis.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/analysis.json', import.meta.url)));
const close = (a, b, what, rtol = 1e-9, atol = 1e-9) =>
  assert.ok(Math.abs(a - b) <= atol + rtol * Math.abs(b), `${what}: js ${a} vs python ${b}`);
const closeAll = (a, b, what, rtol, atol) => {
  assert.equal(a.length, b.length, `${what} length`);
  a.forEach((v, i) => close(v, b[i], `${what}[${i}]`, rtol, atol));
};

for (const c of fx.cases) {
  test(`analysis matches Python: ${c.file} (${c.samples.length} ch, ${c.samples[0].length} frames)`, () => {
    const ch = c.samples.map(s => Float64Array.from(s, v => v / 32768));
    const o = c.options, r = analyse(ch, c.rate, { bins: o.bins, nfft: o.nfft, bands: o.bands, maxFrames: o.max_frames });
    const p = c.result;
    assert.equal(r.frames, p.frames); assert.equal(r.channels, p.channels); close(r.duration, p.duration, 'duration');
    for (const k of ['peak', 'rms', 'peak_db', 'rms_db']) close(r.levels[k], p.levels[k], `levels.${k}`);
    r.levels.channels.forEach((l, i) => close(l.rms, p.levels.channels[i].rms, `ch${i} rms`));
    assert.equal(r.waveform.bins, p.waveform.bins);
    for (const k of ['min', 'max', 'rms']) closeAll(r.waveform[k], p.waveform[k], `waveform.${k}`);
    const s = r.spectrum, q = p.spectrum;
    assert.equal(s.frames, q.frames);
    closeAll(s.edges_hz, q.edges_hz, 'edges');
    closeAll(s.db, q.db, 'spectrum dB', 1e-7, 1e-6);
    close(s.centroid_hz, q.centroid_hz, 'centroid', 1e-7);
    close(s.peak_hz, q.peak_hz, 'peak frequency'); close(s.peak_db, q.peak_db, 'peak dB', 1e-7, 1e-6);
  });
}

test('fft: impulse is flat, sine lands in its bin; hanning matches np.hanning endpoints', () => {
  const re = new Float64Array(8), im = new Float64Array(8); re[0] = 1;
  fft(re, im); re.forEach(v => close(v, 1, 'impulse'));
  const n = 64, r2 = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n)), i2 = new Float64Array(n);
  fft(r2, i2); close(r2[5], n / 2, 'bin 5'); close(Math.hypot(r2[6], i2[6]), 0, 'bin 6');
  const w = hanning(5); closeAll([...w], [0, 0.5, 1, 0.5, 0], 'hann');
});
