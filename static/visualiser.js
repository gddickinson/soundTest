// Live visualiser of the master output (AnalyserNode) on a canvas: 'spectrum' (log-frequency bars with peak caps),
// 'scope' (oscilloscope with afterglow) and 'orbit' (radial spectrum around the waveform).
export const MODES = [['spectrum', 'Spectrum'], ['scope', 'Waveform'], ['orbit', 'Orbit']];

export function makeVisualiser(canvas, getAnalyser) {
  const g = canvas.getContext('2d');
  let freq = null, wave = null, peaks = null, w = 0, h = 0;
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim() || '#7cf5ff';
  const A1 = col('--accent'), A2 = col('--accent2'), A3 = col('--accent3');

  function size() {
    const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (W !== canvas.width || H !== canvas.height) { canvas.width = W; canvas.height = H; }
    w = W; h = H;
  }

  // Log-spaced bands from 30 Hz to 16 kHz; returns n values 0..1.
  function bands(an, n) {
    const sr = an.context.sampleRate, bins = freq.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f0 = 30 * Math.pow(16000 / 30, i / n), f1 = 30 * Math.pow(16000 / 30, (i + 1) / n);
      const b0 = Math.floor(f0 / (sr / 2) * bins), b1 = Math.max(b0 + 1, Math.ceil(f1 / (sr / 2) * bins));
      let m = 0;
      for (let b = b0; b < b1 && b < bins; b++) m = Math.max(m, freq[b]);
      out[i] = m / 255;
    }
    return out;
  }

  function idle(t) {   // gentle placeholder when nothing is playing
    g.strokeStyle = A3; g.globalAlpha = 0.35; g.lineWidth = Math.max(1, h / 200);
    g.beginPath();
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + Math.sin(x / w * 12 + t / 900) * h * 0.02);
    g.stroke(); g.globalAlpha = 1;
  }

  function draw(mode, t, live) {
    size();
    g.fillStyle = mode === 'scope' ? 'rgba(3,4,10,.32)' : 'rgba(3,4,10,1)';
    g.fillRect(0, 0, w, h);
    const an = getAnalyser();
    if (!an || !live) return idle(t);
    if (!freq || freq.length !== an.frequencyBinCount) { freq = new Uint8Array(an.frequencyBinCount); wave = new Float32Array(an.fftSize); }
    an.getByteFrequencyData(freq); an.getFloatTimeDomainData(wave);
    if (mode === 'scope') scope(); else if (mode === 'orbit') orbit(an, t); else spectrum(an);
  }

  function spectrum(an) {
    const n = Math.max(24, Math.min(96, Math.floor(w / 14))), v = bands(an, n), bw = w / n;
    if (!peaks || peaks.length !== n) peaks = new Float32Array(n);
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, A3); grad.addColorStop(0.55, A1); grad.addColorStop(1, A2);
    g.shadowColor = A1; g.shadowBlur = 12;
    for (let i = 0; i < n; i++) {
      const y = v[i] * h * 0.92;
      peaks[i] = Math.max(peaks[i] - h * 0.004, y);
      g.fillStyle = grad; g.fillRect(i * bw + bw * 0.15, h - y, bw * 0.7, y);
      g.fillStyle = A2; g.fillRect(i * bw + bw * 0.15, h - peaks[i] - 3, bw * 0.7, 2);
    }
    g.shadowBlur = 0;
  }

  function scope() {
    g.lineWidth = Math.max(1.5, h / 160); g.strokeStyle = A1; g.shadowColor = A1; g.shadowBlur = 14;
    g.beginPath();
    const step = wave.length / w;
    for (let x = 0; x < w; x++) g.lineTo(x, h / 2 + wave[Math.floor(x * step)] * h * 0.45);
    g.stroke(); g.shadowBlur = 0;
  }

  function orbit(an, t) {
    const half = 64, v = bands(an, half), n = half * 2, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.28;
    let energy = 0;
    for (let i = 0; i < half; i++) energy += v[i] / half;
    g.save(); g.translate(cx, cy); g.rotate(t / 20000);
    const core = g.createRadialGradient(0, 0, 0, 0, 0, R);
    core.addColorStop(0, A2 + '33'); core.addColorStop(1, A2 + '00');
    g.globalAlpha = Math.min(1, 0.3 + energy * 2); g.fillStyle = core;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(1, R / 60);
    for (let i = 0; i < n; i++) {           // low frequencies at the top, mirrored left/right
      const b = i < half ? i : n - 1 - i, a = (i / n) * Math.PI * 2 - Math.PI / 2, len = v[b] * R * 0.9;
      g.strokeStyle = b % 2 ? A1 : A2; g.globalAlpha = 0.45 + v[b] * 0.55;
      g.beginPath(); g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); g.stroke();
    }
    g.globalAlpha = 1; g.strokeStyle = A3; g.shadowColor = A3; g.shadowBlur = 10;
    g.beginPath();
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2, s = wave[Math.floor(i / 257 * wave.length)];
      g.lineTo(Math.cos(a) * R * (0.8 + s * 0.6), Math.sin(a) * R * (0.8 + s * 0.6));
    }
    g.stroke(); g.restore(); g.shadowBlur = 0;
  }

  return { draw };
}
