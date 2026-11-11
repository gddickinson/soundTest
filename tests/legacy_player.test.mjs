// Regression tests for the original player (script.js), run in node with a tiny fake DOM:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = new URL('../classic/script.js', import.meta.url);

// Fake <audio> element / Audio object: records what was played; `ended` is set by the test.
class FakeAudio {
  constructor(src = '') { this.src = src; this.duration = NaN; this.paused = true; this.ended = false; this.currentTime = 0; }
  load() {} play() { this.paused = false; this.ended = false; FakeAudio.played.push(this.src); return Promise.resolve(); }
  pause() { this.paused = true; }
}
FakeAudio.played = [];

function loadPlayer({ random } = {}) {
  FakeAudio.played = [];
  const els = {};
  for (let i = 0; i < 20; i++) els[i] = new FakeAudio(`audio/bells_chimes/${i}.wav`);
  els.whitenoise = new FakeAudio('audio/whitenoise/whitenoise.wav');
  els.oceansounds = new FakeAudio('audio/ocean_sounds/water-sounds-ocean-ocean-waves-40.wav');
  for (const id of ['startLoop', 'message']) els[id] = { style: {}, textContent: '' };
  const math = Object.create(Math);
  if (random) math.random = random;
  const ctx = {
    Audio: FakeAudio, Math: math, Date, console, setInterval: () => 1, clearInterval: () => {},
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    document: { getElementById: id => els[id] ?? null },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), ctx);
  return { ctx, els };
}

test('every one of the 20 chimes can be played (including 19.wav)', () => {
  const seen = new Set();
  for (let k = 0; k < 20; k++) {
    const { ctx } = loadPlayer({ random: () => (k + 0.5) / 20 });
    ctx.setSound('chimes');
    ctx.playSound();
    seen.add(FakeAudio.played.at(-1));
  }
  assert.ok(seen.has('audio/bells_chimes/19.wav'), 'chime 19 never selected');
  assert.equal(seen.size, 20);
});

test('Play Sample before choosing a sound does not throw', () => {
  const { ctx } = loadPlayer();
  assert.doesNotThrow(() => ctx.playSound());
  assert.doesNotThrow(() => ctx.playLoop());
  assert.equal(FakeAudio.played.length, 0);
});

test('channels are reused once their sound has ended, even if the duration was unknown', () => {
  const { ctx } = loadPlayer();
  ctx.setSound('whitenoise');
  for (let i = 0; i < 25; i++) {
    ctx.playSound();
    // the sound finishes before the next click
    for (const c of ctx.audiochannels) { c.channel.ended = true; c.channel.paused = true; }
  }
  assert.equal(FakeAudio.played.length, 25);
});

test('Start Analyser, Stop, Start Analyser again: no errors, one render loop, no console spam', () => {
  const { ctx } = loadPlayer();
  let sources = 0, frames = 0, logs = 0;
  class FakeCtx {
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 16, connect() {}, getByteFrequencyData() {} }; }
    createMediaElementSource() { if (++sources > 1) throw new Error('already connected'); return { connect() {} }; }
    get destination() { return {}; }
    resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
  }
  ctx.AudioContext = FakeCtx;
  const pending = new Map(); let next = 1;
  ctx.requestAnimationFrame = fn => { frames++; pending.set(next, fn); return next++; };
  ctx.cancelAnimationFrame = id => pending.delete(id);
  ctx.console = { log: () => logs++, warn() {}, error() {} };
  for (const k of ['P10', 'P20', 'P30', 'P40', 'P50', 'P60', 'P70', 'P80', 'P90']) ctx[k] = { style: {} };
  ctx.oceansounds = ctx.document.getElementById('oceansounds');
  const runFrames = n => { for (let i = 0; i < n; i++) { const fns = [...pending.values()]; pending.clear(); fns.forEach(f => f()); } };
  ctx.analyserFunc();
  frames = 0; runFrames(3);
  assert.equal(frames, 3, 'exactly one animation loop');
  assert.equal(logs, 0, 'no per-frame console output');
  assert.doesNotThrow(() => ctx.stopPlaying());
  assert.equal(pending.size, 0, 'Stop ends the render loop');
  assert.doesNotThrow(() => ctx.analyserFunc());
  assert.equal(sources, 1);
});
