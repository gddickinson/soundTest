// Subtle animated background: a few soft orbs drifting slowly, brightening with the master level. Off under
// prefers-reduced-motion and when the tab is hidden.
import { engine } from './audio_engine.js';

export function startBackground(canvas) {
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = canvas.getContext('2d');
  const orbs = [[0.2, 0.3, '#7cf5ff'], [0.75, 0.25, '#c08cff'], [0.55, 0.8, '#6c8cff']];
  let level = 0, data = null;
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const w = Math.round(innerWidth / 4), h = Math.round(innerHeight / 4);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    let l = 0;
    if (engine.analyser && engine.playing) {
      data ||= new Float32Array(1024);
      engine.analyser.getFloatTimeDomainData(data);
      for (let i = 0; i < data.length; i += 4) l += data[i] * data[i];
      l = Math.sqrt(l / (data.length / 4));
    }
    level += (Math.min(1, l * 4) - level) * 0.05;
    g.clearRect(0, 0, w, h);
    orbs.forEach(([x, y, c], i) => {
      const px = (x + Math.sin(t / 9000 + i * 2) * 0.08) * w, py = (y + Math.cos(t / 11000 + i) * 0.08) * h;
      const r = Math.max(w, h) * (0.28 + level * 0.12);
      const grd = g.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, c + '55'); grd.addColorStop(1, c + '00');
      g.fillStyle = grd; g.globalAlpha = 0.35 + level * 0.65;
      g.fillRect(0, 0, w, h);
    });
    g.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}
