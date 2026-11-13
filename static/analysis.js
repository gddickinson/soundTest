// Sound analysis in the browser: the same definitions as web/analysis.py (levels, waveform peaks, averaged
// log-frequency spectrum), checked against the Python output by tests/analysis.test.mjs. Pure: no DOM, no WebAudio.
export const FMIN = 20;
const FLOOR = 1e-10;
export const db = v => 20 * Math.log10(Math.max(v, FLOOR));

// channels: array of Float32Array/Float64Array/arrays (one per channel). Mono = mean of the channels.
export function mono(channels) {
  if (channels.length === 1) return Float64Array.from(channels[0]);
  const n = channels[0].length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (const c of channels) s += c[i]; out[i] = s / channels.length; }
  return out;
}

export function levels(channels) {
  const per = channels.map(c => {
    let pk = 0, sq = 0;
    for (let i = 0; i < c.length; i++) { const v = c[i]; const a = Math.abs(v); if (a > pk) pk = a; sq += v * v; }
    const rms = c.length ? Math.sqrt(sq / c.length) : 0;
    return { peak: pk, rms, peak_db: db(pk), rms_db: db(rms) };
  });
  const peak = Math.max(...per.map(p => p.peak));
  const rms = Math.sqrt(per.reduce((a, p) => a + p.rms * p.rms, 0) / per.length);
  return { peak, rms, peak_db: db(peak), rms_db: db(rms), channels: per };
}

export function waveform(m, bins) {
  const n = m.length;
  bins = Math.max(1, Math.min(bins, n));
  const lo = [], hi = [], rms = [];
  for (let b = 0; b < bins; b++) {
    const a = Math.floor((b * n) / bins), e = Math.floor(((b + 1) * n) / bins);
    let mn = Infinity, mx = -Infinity, sq = 0;
    for (let i = a; i < e; i++) { const v = m[i]; if (v < mn) mn = v; if (v > mx) mx = v; sq += v * v; }
    lo.push(mn); hi.push(mx); rms.push(Math.sqrt(sq / (e - a)));
  }
  return { bins, min: lo, max: hi, rms };
}

export function frameStarts(n, nfft, maxFrames) {
  if (n <= nfft) return [0];
  const hop = nfft / 2, count = Math.floor((n - nfft) / hop) + 1;
  if (count <= maxFrames) return Array.from({ length: count }, (_, i) => i * hop);
  return Array.from({ length: maxFrames }, (_, i) => Math.floor((i * (n - nfft)) / (maxFrames - 1)));
}

export function bandEdges(sr, bands) {
  const nyq = sr / 2;
  return Array.from({ length: bands + 1 }, (_, k) => FMIN * (nyq / FMIN) ** (k / bands));
}

// In-place iterative radix-2 FFT of (re, im), length a power of two.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const j = i + len / 2, xr = re[j] * wr - im[j] * wi, xi = re[j] * wi + im[j] * wr;
        re[j] = re[i] - xr; im[j] = im[i] - xi; re[i] += xr; im[i] += xi;
      }
    }
  }
}

// np.hanning: symmetric Hann window.
export const hanning = n => Float64Array.from({ length: n }, (_, k) => (n === 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1))));

function interp(x, xs, ys) {        // np.interp on evenly spaced xs
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  const step = xs[1] - xs[0], i = Math.min(xs.length - 2, Math.floor((x - xs[0]) / step));
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

export function spectrum(m, sr, { nfft = 2048, bands = 96, maxFrames = 64 } = {}) {
  if (nfft & (nfft - 1)) throw new Error('nfft must be a power of two');
  if (m.length < nfft) { const z = new Float64Array(nfft); z.set(m); m = z; }
  const win = hanning(nfft), wsum = win.reduce((a, v) => a + v, 0);
  const starts = frameStarts(m.length, nfft, maxFrames), half = nfft / 2 + 1;
  const power = new Float64Array(half), re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (const s of starts) {
    for (let i = 0; i < nfft; i++) { re[i] = m[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < half; k++) power[k] += re[k] * re[k] + im[k] * im[k];
  }
  const scale = (2 / wsum) ** 2 / starts.length;
  for (let k = 0; k < half; k++) power[k] *= scale;
  const freqs = Array.from({ length: half }, (_, k) => (k * sr) / nfft);
  const edges = bandEdges(sr, bands), out = [];
  for (let b = 0; b < bands; b++) {
    const lo = edges[b], hi = edges[b + 1];
    let s = 0, c = 0;
    for (let k = 0; k < half; k++) if (freqs[k] >= lo && freqs[k] < hi) { s += power[k]; c++; }
    const p = c ? s / c : interp(Math.sqrt(lo * hi), freqs, power);
    out.push(10 * Math.log10(Math.max(p, FLOOR * FLOOR)));
  }
  let ms = 0, mf = 0, best = 1;
  for (let k = 0; k < half; k++) { const a = Math.sqrt(power[k]); ms += a; mf += a * freqs[k]; }
  for (let k = 2; k < half; k++) if (power[k] > power[best]) best = k;
  return { nfft, frames: starts.length, edges_hz: edges, db: out, centroid_hz: ms > 0 ? mf / ms : 0,
    peak_hz: freqs[best], peak_db: 10 * Math.log10(Math.max(power[best], FLOOR * FLOOR)) };
}

export function analyse(channels, sr, { bins = 600, nfft = 2048, bands = 96, maxFrames = 64 } = {}) {
  const m = mono(channels), n = channels[0].length;
  return { frames: n, rate: sr, channels: channels.length, duration: n / sr, levels: levels(channels),
    waveform: waveform(m, bins), spectrum: spectrum(m, sr, { nfft, bands, maxFrames }) };
}
