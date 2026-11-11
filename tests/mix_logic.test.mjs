// Pure logic of the mixer: share-link format, mute/solo, sleep-timer fade, seamless loops, scatter. node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMix, decodeMix, normalise, audible, MAX_TRACKS, sameMix } from '../static/mix_codec.js';
import { sleepGain, sleepCurve, fadeStart, fmtClock } from '../static/sleep_fade.js';
import { makeSeamless, fadeSamples } from '../static/loop_xfade.js';
import { planHits, hitsPerMinute } from '../static/scatter.js';
import { PRESETS } from '../static/presets.js';
import { sound } from '../static/catalog.js';

const known = id => !!sound(id);
const mix = { master: 0.8, tracks: [
  { id: 'ocean-waves-40', vol: 0.7, pan: 0, mode: 'loop' },
  { id: 'chime-3', vol: 0.45, pan: -0.3, mode: 'scatter', every: 2, chance: 0.4, solo: true },
  { id: 'pinknoise', vol: 0.2, pan: 0.25, mute: true, mode: 'loop' },
] };

test('mix string format is stable and readable', () => {
  assert.equal(encodeMix(mix), 'v1~m80~ocean-waves-40.70.0.L~chime-3.45.-30.S20x40.s~pinknoise.20.25.L.m');
});

test('encode -> decode round-trips', () => {
  const back = decodeMix(encodeMix(mix), known);
  assert.deepEqual(back, normalise(mix));
  assert.ok(sameMix(back, mix));
  assert.deepEqual(decodeMix(encodeURIComponent(encodeMix(mix))), normalise(mix), 'URL-encoded links decode too');
});

test('decode rejects garbage and repairs bad values', () => {
  for (const bad of ['', 'hello', 'v2~m80', 'v1~x', 'v1~m']) assert.equal(decodeMix(bad), null, bad);
  const d = decodeMix('v1~m250~ocean-waves-40.500.-900.L~no-such-sound.50.0.L~chime-3.x.0.L~ocean-waves-40.10.0.L~BAD_ID.5.0.L', known);
  assert.equal(d.master, 1);
  assert.deepEqual(d.tracks.map(t => [t.id, t.vol, t.pan]), [['ocean-waves-40', 1, -1]]);
  const s = decodeMix('v1~m50~chime-3.50.0.S0x150', known).tracks[0];
  assert.equal(s.mode, 'scatter'); assert.equal(s.every, 0.3); assert.equal(s.chance, 1);
});

test('normalise is canonical: odd values survive a round trip', () => {
  const odd = { master: 0.333, tracks: [{ id: 'chime-3', vol: 0.123, pan: -0.456, mode: 'scatter', every: 2.53, chance: 0.377 }] };
  assert.deepEqual(decodeMix(encodeMix(odd)), normalise(odd));
});

test('at most MAX_TRACKS tracks', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'glitch' + (i % 36 + 1) }));
  assert.equal(normalise({ tracks: many }).tracks.length, MAX_TRACKS);
});

test('mute and solo', () => {
  const t = normalise(mix).tracks;
  assert.deepEqual(t.map(x => audible(x, t)), [false, true, false]);
  const none = t.map(x => ({ ...x, solo: false }));
  assert.deepEqual(none.map(x => audible(x, none)), [true, true, false]);
});

test('every preset uses real sounds and survives a share link', () => {
  assert.ok(PRESETS.length >= 4);
  for (const p of PRESETS) {
    for (const t of p.mix.tracks) assert.ok(known(t.id), `${p.name}: unknown ${t.id}`);
    assert.deepEqual(decodeMix(encodeMix(p.mix), known), normalise(p.mix));
  }
});

test('sleep fade: flat, then a smooth monotone fall to silence', () => {
  const total = 600, fade = 120;
  assert.equal(sleepGain(0, total, fade), 1);
  assert.equal(sleepGain(480, total, fade), 1);
  assert.equal(sleepGain(600, total, fade), 0);
  assert.equal(sleepGain(9999, total, fade), 0);
  assert.ok(Math.abs(sleepGain(540, total, fade) - 0.25) < 1e-12, 'half way through the fade = 1/4 (squared smooth step)');
  let prev = 1;
  for (let t = 480; t <= 600; t += 0.5) {
    const g = sleepGain(t, total, fade);
    assert.ok(g <= prev + 1e-12 && g >= 0 && g <= 1); prev = g;
  }
  assert.ok(1 - sleepGain(481, total, fade) < 0.002, 'no step at the start of the fade');
  assert.ok(sleepGain(599, total, fade) < 0.002, 'no step at the end');
});

test('sleep fade longer than the timer, curve and clock', () => {
  assert.equal(fadeStart(60, 300), 0);
  assert.ok(sleepGain(0, 60, 300) > 0.999);
  assert.ok(sleepGain(30, 60, 300) < 0.3);
  const c = sleepCurve(480, 600, 120, 5);
  assert.equal(c.length, 5);
  assert.ok(Math.abs(c[0] - 1) < 1e-6 && c[4] === 0 && Math.abs(c[2] - 0.25) < 1e-6);
  assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(59.2), '1:00'); assert.equal(fmtClock(3725), '1:02:05');
});

test('seamless loop: shorter by the fade, and continuous across the seam', () => {
  const sr = 1000, n = 5000;
  const ramp = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 37) + i / n);  // drifting signal
  const [out] = makeSeamless([ramp], sr, 1);
  assert.equal(fadeSamples(n, sr, 1), 1000);
  assert.equal(out.length, 4000);
  // the sample after the loop end (out[0]) continues the original from where out ends (original index 4000)
  assert.ok(Math.abs(out[0] - ramp[4000]) < 0.01);
  // and the end of the crossfade joins the untouched middle
  assert.ok(Math.abs(out[999] - ramp[999]) < 0.01);
  for (let i = 1000; i < 4000; i++) assert.equal(out[i], ramp[i]);
  // equal power: two equal constant signals keep their level (sin + cos >= 1)
  const [flat] = makeSeamless([new Float32Array(3000).fill(0.5)], sr, 1);
  assert.ok(Math.min(...flat) >= 0.5 - 1e-6);
});

test('seamless loop: fade capped at a third of short sounds; stereo kept', () => {
  const ch = [new Float32Array(300).fill(1), new Float32Array(300).fill(-1)];
  const out = makeSeamless(ch, 1000, 5);
  assert.equal(out.length, 2); assert.equal(out[0].length, 200); assert.ok(out[1][150] === -1);
  assert.equal(makeSeamless([new Float32Array(2)], 1000, 1)[0].length, 2);
});

test('scatter: probability, spacing and the original chime pattern', () => {
  let a = 7; const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const { hits, next } = planHits(0, 3600, 2, 0.4, rand);
  assert.ok(next >= 3600);
  const rate = hits.length / 60;
  assert.ok(Math.abs(rate - hitsPerMinute(2, 0.4)) < 1.5, `rate ${rate}`);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i] - hits[i - 1] >= 1.5 - 1e-9);
  assert.deepEqual(planHits(10, 10, 2, 1, rand).hits, []);
  assert.equal(planHits(0, 20, 2, 0, rand).hits.length, 0);
});
