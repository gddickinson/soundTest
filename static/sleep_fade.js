// Sleep timer maths. Pure (tested in tests/sleep_fade.test.mjs). The audio engine turns sleepCurve() into a
// GainNode automation, so the fade is sample-accurate and keeps going when the page is in the background.
//
// The level stays at 1 until `fade` seconds before the end, then falls to 0 along a squared cosine: the perceived
// loudness drops gently at first and the last few seconds are near silence, with no audible step at either end.

export function sleepGain(elapsed, total, fade) {
  const f = Math.max(0, Math.min(fade, total));
  if (elapsed >= total) return 0;
  if (elapsed <= total - f || f === 0) return 1;
  const x = (total - elapsed) / f;                 // 1 at the start of the fade, 0 at the end
  const c = 0.5 - 0.5 * Math.cos(Math.PI * x);    // smooth step 0..1
  return c * c;
}

// Values for AudioParam.setValueCurveAtTime covering [from, total] (seconds since the timer started), n points.
export function sleepCurve(from, total, fade, n = 256) {
  const out = new Float32Array(Math.max(2, n));
  for (let i = 0; i < out.length; i++) out[i] = sleepGain(from + (total - from) * i / (out.length - 1), total, fade);
  return out;
}

// When the fade begins (seconds after the timer started).
export const fadeStart = (total, fade) => Math.max(0, total - Math.max(0, Math.min(fade, total)));

export function fmtClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const TIMER_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120];   // minutes
