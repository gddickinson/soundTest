// Canvas drawings for the Sounds and Synth pages: waveform peaks (min/max band + rms) and the band spectrum (dB on a
// log-frequency axis). Input is the shape returned by /api/analyse and static/analysis.js.
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#7cf5ff';

function setup(canvas, h) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 600;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

// Scaled so the loudest sample reaches the edge (returns the gain used, for the caption).
export function drawWave(canvas, wf, h = 160) {
  const { g, w } = setup(canvas, h), n = wf.bins, bw = w / n;
  const top = Math.max(1e-6, ...wf.max.map(Math.abs), ...wf.min.map(Math.abs)), mid = h / 2, k = (mid - 4) / top;
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  g.fillStyle = css('--accent3');
  for (let i = 0; i < n; i++) {
    const y0 = mid - wf.max[i] * k, y1 = mid - wf.min[i] * k;
    g.fillRect(i * bw, y0, Math.max(1, bw - 0.3), Math.max(1, y1 - y0));
  }
  g.fillStyle = css('--accent');
  for (let i = 0; i < n; i++) { const r = wf.rms[i] * k; g.fillRect(i * bw, mid - r, Math.max(1, bw - 0.3), Math.max(1, 2 * r)); }
  return 1 / top;
}

const fmtHz = f => (f >= 1000 ? `${+(f / 1000).toFixed(1)}k` : `${Math.round(f)}`);

export function drawSpectrum(canvas, sp, h = 200, floorDb = -110) {
  const { g, w } = setup(canvas, h), pad = 18, n = sp.db.length, top = Math.max(...sp.db, floorDb + 10);
  const lo = Math.log(sp.edges_hz[0]), hi = Math.log(sp.edges_hz[n]);
  const x = f => ((Math.log(f) - lo) / (hi - lo)) * w, y = d => (h - pad) * (1 - (Math.max(d, floorDb) - floorDb) / (top - floorDb));
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, css('--accent3')); grad.addColorStop(0.5, css('--accent')); grad.addColorStop(1, css('--accent2'));
  g.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const x0 = x(sp.edges_hz[i]), x1 = x(sp.edges_hz[i + 1]), yy = y(sp.db[i]);
    g.fillRect(x0, yy, Math.max(1, x1 - x0 - 1), h - pad - yy);
  }
  g.fillStyle = 'rgba(200,215,240,.7)'; g.font = '11px ui-monospace, monospace'; g.textBaseline = 'bottom';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    if (f > sp.edges_hz[n]) break;
    g.fillText(fmtHz(f), Math.min(w - 26, x(f) + 2), h);
    g.fillRect(x(f), h - pad, 1, 4);
  }
  g.textBaseline = 'top'; g.fillText(`${top.toFixed(0)} dB`, 4, 2);
}
