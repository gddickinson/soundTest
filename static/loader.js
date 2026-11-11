// Lazy WAV loading with progress. Only sounds that are actually used are downloaded (once); bytes are streamed so
// the UI can show how far each file has got, then decoded into an AudioBuffer (cached per file).
export const loader = new EventTarget();          // 'progress' events; read state with loadState() / pendingTotals()
const jobs = new Map();                          // url -> { loaded, total, done, error, promise }

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

// Promise of the decoded AudioBuffer. `sizeHint` (bytes) is used for progress until the server sends a length.
export function loadBuffer(ctx, url, sizeHint = 0) {
  let job = jobs.get(url);
  if (job && !job.error) return job.promise;
  job = { loaded: 0, total: sizeHint, done: false, error: null };
  jobs.set(url, job);
  const ping = () => loader.dispatchEvent(new CustomEvent('progress', { detail: { url } }));
  job.promise = fetchBytes(url, job)
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => { job.done = true; ping(); return buf; },
      e => { job.error = e; ping(); throw e; });
  ping();
  return job.promise;
}

export const loadState = url => jobs.get(url) || null;

// Totals over files still downloading/decoding: { count, loaded, total } (bytes).
export function pendingTotals() {
  let count = 0, loaded = 0, total = 0;
  for (const j of jobs.values()) if (!j.done && !j.error) { count++; loaded += j.loaded; total += Math.max(j.total, j.loaded); }
  return { count, loaded, total };
}
