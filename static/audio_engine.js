// The WebAudio mixer (one shared instance, `engine`, lives across page changes so the sound keeps playing).
//
// Graph:  layer: AudioBufferSourceNode -> vol (Gain) -> gate (Gain: mute/solo/fades) -> pan (StereoPanner) -+-> meter
//         all layers + preview -> master (Gain) -> sleep (Gain: sleep-timer fade) -> limiter (Compressor)
//         -> analyser (visualiser) -> speakers
// Loop layers play a crossfaded copy of their WAV (loop_xfade.js) with loop = true, so the loop is sample-accurate
// and seamless. Scatter layers fire one-shots from a look-ahead scheduler (scatter.js) on the AudioContext clock.
import { sound, defaultMode } from './catalog.js';
import { normalise, audible, SCATTER_DEFAULT, MAX_TRACKS } from './mix_codec.js';
import { makeSeamless } from './loop_xfade.js';
import { planHits } from './scatter.js';
import { sleepCurve, fadeStart } from './sleep_fade.js';
import { loadBuffer } from './loader.js';

const SEAM = 1.5;          // s of crossfade folded into each loop
// LOOKAHEAD: scatter hits are scheduled this far ahead on the audio clock, so background tabs (timers throttled to
// ~1 s) still play them on time.
const FADE_IN = 1.2, FADE_OUT = 0.8, MIX_XFADE = 2.5, LOOKAHEAD = 2.5;
const taper = v => v * v;  // slider position -> gain (roughly even loudness steps)

class Layer {
  constructor(t) { this.t = t; this.s = sound(t.id); this.state = 'idle'; this.buf = null; this.loopBuf = null; this.src = null; this.shots = new Set(); this.next = 0; }
}

class Engine extends EventTarget {
  constructor() {
    super();
    this.ctx = null; this.layers = []; this.masterVol = 0.8; this.playing = false; this.timer = null; this.selected = 0;
  }

  // --- context and graph (created on the first click: browsers only allow audio after a user gesture) ---
  ensure() {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.sleep = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6; this.limiter.ratio.value = 6; this.limiter.attack.value = 0.01;
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 4096; this.analyser.smoothingTimeConstant = 0.78;
    this.preview = ctx.createGain(); this.preview.gain.value = 0.8;
    this.master.connect(this.sleep).connect(this.limiter).connect(this.analyser).connect(ctx.destination);
    this.preview.connect(this.limiter);
    this.layers.forEach(l => this.#nodes(l));
    this.tick = setInterval(() => this.#schedule(), 200);
    return ctx;
  }

  #nodes(l) {
    const c = this.ctx;
    l.vol = c.createGain(); l.gate = c.createGain(); l.pan = c.createStereoPanner(); l.meter = c.createAnalyser();
    l.meter.fftSize = 512; l.gate.gain.value = 0;
    l.vol.gain.value = taper(l.t.vol); l.pan.pan.value = l.t.pan;
    l.vol.connect(l.gate).connect(l.pan).connect(this.master); l.pan.connect(l.meter);
  }

  #emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // --- loading ---
  async #load(l) {
    if (l.state === 'ready' || l.state === 'loading') return;
    l.state = 'loading'; this.#emit('change');
    try {
      const buf = await loadBuffer(this.ctx, l.s.file, l.s.kb * 1024);
      l.buf = buf;
      const seamless = makeSeamless([...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i)), buf.sampleRate, SEAM);
      l.loopBuf = this.ctx.createBuffer(seamless.length, seamless[0].length, buf.sampleRate);
      seamless.forEach((d, i) => l.loopBuf.copyToChannel(d, i));
      l.state = 'ready';
    } catch (e) {
      console.warn(e); l.state = 'error';
    }
    if (this.layers.includes(l)) { this.#start(l); this.#emit('change'); }
  }

  // --- layer playback ---
  #start(l, fade = l.fadeIn || FADE_IN) {
    if (!this.playing || l.state !== 'ready' || l.src || l.removed) return;
    const now = this.ctx.currentTime;
    if (l.t.mode === 'loop') {
      const src = l.src = this.ctx.createBufferSource();
      src.buffer = l.loopBuf; src.loop = true; src.loopStart = 0; src.loopEnd = l.loopBuf.duration;
      src.connect(l.vol); src.start(now + 0.02);
    } else {
      l.src = 'scatter'; l.next = now + 0.1 + Math.random() * Math.min(l.t.every, 3);
    }
    this.#gate(l, fade, true);
  }

  #stopSources(l, at = 0) {
    if (l.src && l.src !== 'scatter') { try { l.src.stop(at); } catch { /* already stopped */ } }
    l.src = null;
    for (const s of l.shots) { try { s.stop(at); } catch { /* ended */ } }
    l.shots.clear();
  }

  // Ramp the layer's gate to 1 or 0 (mute/solo). `fromZero` restarts a fade-in.
  #gate(l, secs = 0.25, fromZero = false) {
    if (!l.gate) return;
    const g = l.gate.gain, now = this.ctx.currentTime, target = audible(l.t, this.layers.map(x => x.t)) ? 1 : 0;
    g.cancelScheduledValues(0);
    g.setValueAtTime(fromZero ? 0 : g.value, now);
    g.linearRampToValueAtTime(target, now + secs);
  }

  #schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.timer && now >= this.timer.end) this.#timerDone();
    if (!this.playing) return;
    for (const l of this.layers) {
      if (l.t.mode !== 'scatter' || l.src !== 'scatter') continue;
      const { hits, next } = planHits(Math.max(l.next, now), now + LOOKAHEAD, l.t.every, l.t.chance, Math.random);
      l.next = next;
      for (const at of hits) {
        const s = c.createBufferSource();
        s.buffer = l.buf; s.connect(l.vol); s.start(at);
        l.shots.add(s); s.onended = () => l.shots.delete(s);
        l.lastHit = at;
      }
    }
  }

  // --- public API: transport ---
  async play() {
    const c = this.ensure();
    await c.resume();
    this.playing = true;
    this.#ramp(this.master.gain, taper(this.masterVol), 0.6);
    for (const l of this.layers) { if (l.state === 'ready') this.#start(l); else this.#load(l); }
    this.#emit('state'); this.#emit('change');
  }

  pause() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    for (const l of this.layers) this.#stopSources(l, this.ctx.currentTime + 0.5);
    this.#ramp(this.master.gain, 0, 0.4);
    this.#emit('state'); this.#emit('change');
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  #ramp(param, value, secs) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(0); param.setValueAtTime(param.value, now); param.linearRampToValueAtTime(value, now + secs);
  }

  setMaster(v) {
    this.masterVol = Math.min(1, Math.max(0, v));
    if (this.ctx && this.playing) this.#ramp(this.master.gain, taper(this.masterVol), 0.08);
    this.#emit('change', { quiet: true });
  }

  // --- public API: layers ---
  get mix() { return { master: this.masterVol, tracks: this.layers.map(l => ({ ...l.t })) }; }
  has(id) { return this.layers.some(l => l.t.id === id); }
  layer(id) { return this.layers.find(l => l.t.id === id); }

  add(id, opts = {}) {
    const s = sound(id);
    if (!s || this.has(id) || this.layers.length >= MAX_TRACKS) return null;
    const t = normalise({ tracks: [{ id, vol: 0.6, pan: 0, mode: defaultMode(s), ...SCATTER_DEFAULT, ...opts }] }).tracks[0];
    const l = new Layer(t);
    this.layers.push(l);
    if (this.ctx) this.#nodes(l);
    this.selected = this.layers.length - 1;
    if (this.playing) this.#load(l);
    this.#emit('change');
    return l;
  }

  remove(id, secs = FADE_OUT) {
    const l = this.layer(id);
    if (!l) return;
    l.removed = true;
    this.layers = this.layers.filter(x => x !== l);
    if (this.ctx && l.gate) {
      const now = this.ctx.currentTime;
      this.#ramp(l.gate.gain, 0, secs);
      this.#stopSources(l, now + secs + 0.05);
      setTimeout(() => { try { l.pan.disconnect(); } catch { /* gone */ } }, (secs + 0.3) * 1000);
    }
    this.layers.forEach(x => this.#gate(x));   // a removed solo un-silences the others
    this.selected = Math.min(this.selected, this.layers.length - 1);
    this.#emit('change');
  }

  // Change one layer's settings: { vol, pan, mute, solo, mode, every, chance }, gliding over `secs`.
  set(id, patch, secs = 0.06) {
    const l = this.layer(id);
    if (!l) return;
    const before = l.t;
    l.t = normalise({ tracks: [{ ...l.t, ...patch }] }).tracks[0];
    if (this.ctx && l.vol) {
      if ('vol' in patch) this.#ramp(l.vol.gain, taper(l.t.vol), secs);
      if ('pan' in patch) this.#ramp(l.pan.pan, l.t.pan, secs);
      if ('mute' in patch || 'solo' in patch) this.layers.forEach(x => this.#gate(x, Math.max(0.25, secs)));
      if (before.mode !== l.t.mode) { this.#stopSources(l, this.ctx.currentTime + 0.05); this.#start(l, 0.4); }
    }
    this.#emit('change', { quiet: !('mute' in patch || 'solo' in patch || 'mode' in patch) });
  }

  // Replace the whole mix, crossfading: shared layers glide to their new settings, others fade out / in.
  applyMix(mix, secs = MIX_XFADE) {
    const m = normalise(mix, id => !!sound(id));
    const keep = new Set(m.tracks.map(t => t.id));
    for (const l of [...this.layers]) if (!keep.has(l.t.id)) this.remove(l.t.id, secs);
    for (const t of m.tracks) {
      const l = this.layer(t.id);
      if (l) { this.set(t.id, t, secs); continue; }
      const n = this.add(t.id, t);
      if (n) n.fadeIn = secs;
    }
    this.layers.sort((a, b) => m.tracks.findIndex(t => t.id === a.t.id) - m.tracks.findIndex(t => t.id === b.t.id));
    this.layers.forEach(x => this.#gate(x, secs));
    this.setMaster(m.master);
    this.#emit('change');
  }

  clear() { for (const l of [...this.layers]) this.remove(l.t.id); this.pause(); }

  // --- preview: hear a sound once without adding it ---
  async previewSound(id) {
    const s = sound(id), c = this.ensure();
    if (!s) return;
    await c.resume();
    const buf = await loadBuffer(c, s.file, s.kb * 1024);
    this.stopPreview();
    const src = this.previewSrc = c.createBufferSource();
    src.buffer = buf; src.connect(this.preview); src.start();
    src.onended = () => { if (this.previewSrc === src) { this.previewSrc = null; this.#emit('preview'); } };
    this.previewId = id; this.#emit('preview');
  }
  stopPreview() { if (this.previewSrc) { try { this.previewSrc.stop(); } catch { /* ended */ } this.previewSrc = null; this.#emit('preview'); } }
  get previewing() { return this.previewSrc ? this.previewId : null; }

  // --- sleep timer: gradual fade on its own gain node, then pause (sample-accurate, on the audio clock) ---
  startTimer(minutes, fadeMinutes) {
    const c = this.ensure(), now = c.currentTime;
    const total = minutes * 60, fade = Math.min(fadeMinutes * 60, total), fs = fadeStart(total, fade);
    const g = this.sleep.gain;
    g.cancelScheduledValues(0); g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + 0.2);
    g.setValueCurveAtTime(sleepCurve(fs, total, fade), now + Math.max(fs, 0.25), total - Math.max(fs, 0.25));
    this.timer = { start: now, end: now + total, total, fade };
    this.#emit('timer');
  }

  cancelTimer() {
    if (!this.timer) return;
    this.timer = null;
    if (this.ctx) this.#ramp(this.sleep.gain, 1, 1.5);
    this.#emit('timer');
  }

  timerLeft() { return this.timer && this.ctx ? Math.max(0, this.timer.end - this.ctx.currentTime) : 0; }
  timerGainNow() { return this.sleep ? this.sleep.gain.value : 1; }

  #timerDone() {
    this.timer = null;
    this.pause();
    setTimeout(() => { if (this.ctx) this.#ramp(this.sleep.gain, 1, 0.1); }, 600);
    this.#emit('timer', { done: true });
  }

  // --- levels for meters (RMS of the last few ms, 0..1) ---
  level(l) {
    if (!l?.meter) return 0;
    const a = l.meterData ||= new Float32Array(l.meter.fftSize);
    l.meter.getFloatTimeDomainData(a);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / a.length);
  }
}

export const engine = new Engine();
