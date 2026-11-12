// Lazy sound loading with progress. Only sounds that are used are downloaded (once). The best format the browser
// can decode is fetched (Opus, then AAC, then the original WAV; see codec_trim.js), streamed so the UI can show
// progress, decoded, and cut back to the WAV's exact length and start so loops stay seamless.
import { formatOrder, fileFor, trimPlan, trimChannels } from './codec_trim.js';

export const loader = new EventTarget();          // 'progress' events; read state with loadState() / pendingTotals()
const jobs = new Map();                          // wav path -> { loaded, total, done, error, format, promise }
let manifestP = null;

export function manifest() {
  manifestP ||= fetch('audio/manifest.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
  return manifestP;
}

export async function formats() {
  const m = await manifest(), a = document.createElement('audio');
  return formatOrder(mime => a.canPlayType(mime), !!m);
}

async function fetchBytes(url, job) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} loading ${url}`);
  job.total = +r.headers.get('content-length') || job.total || 0;
  if (!r.body || !r.body.getReader) { const ab = await r.arrayBuffer(); job.loaded = ab.byteLength; return ab; }
  const reader = r.body.getReader(), chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); job.loaded += value.byteLength;
    loader.dispatchEvent(new CustomEvent('progress', { detail: { url } }));
  }
  const out = new Uint8Array(job.loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out.buffer;
}

// Fetch + decode + trim one sound in one format. Returns { buffer, plan }.
export async function decodeAs(ctx, wavPath, fmt, job = { loaded: 0, total: 0 }) {
  const m = await manifest(), entry = m?.files[wavPath];
  const decoded = await ctx.decodeAudioData(await fetchBytes(fileFor(wavPath, fmt), job));
  if (!entry) return { buffer: decoded, plan: null };
  const plan = trimPlan(decoded.length, decoded.sampleRate, entry, fmt);
  const chans = trimChannels([...Array(decoded.numberOfChannels)].map((_, i) => decoded.getChannelData(i)), plan.start, plan.length);
  const buffer = ctx.createBuffer(chans.length, plan.length, decoded.sampleRate);
  chans.forEach((d, i) => buffer.copyToChannel(d, i));
  return { buffer, plan };
}

// Promise of the AudioBuffer for a catalog sound ({ file, kb }), trying each format in turn.
export function loadSound(ctx, s) {
  let job = jobs.get(s.file);
  if (job && !job.error) return job.promise;
  job = { loaded: 0, total: s.kb * 1024, done: false, error: null, format: null };
  jobs.set(s.file, job);
  const ping = () => loader.dispatchEvent(new CustomEvent('progress', { detail: { url: s.file } }));
  job.promise = (async () => {
    const m = await manifest(), order = await formats();
    let err = null;
    for (const fmt of order) {
      try {
        job.loaded = 0; job.total = fmt === 'wav' ? s.kb * 1024 : (m.files[s.file]?.[fmt]?.kb ?? s.kb) * 1024;
        job.format = fmt; ping();
        const { buffer } = await decodeAs(ctx, s.file, fmt, job);
        return buffer;
      } catch (e) { err = e; console.warn(`${s.file}: ${fmt} failed, trying the next format`, e); }
    }
    throw err;
  })().then(buf => { job.done = true; ping(); return buf; }, e => { job.error = e; ping(); throw e; });
  ping();
  return job.promise;
}

export const loadState = file => jobs.get(file) || null;

// Totals over files still downloading/decoding: { count, loaded, total } (bytes).
export function pendingTotals() {
  let count = 0, loaded = 0, total = 0;
  for (const j of jobs.values()) if (!j.done && !j.error) { count++; loaded += j.loaded; total += Math.max(j.total, j.loaded); }
  return { count, loaded, total };
}
