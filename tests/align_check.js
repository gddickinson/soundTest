// Used by tests/test_smoke.py (page.evaluate): decode a WAV and its Opus/AAC copies with the site's own loader in an
// OfflineAudioContext at `rate`, and measure the lag/correlation of the copies against the WAV at the start and end.
async ([files, rate]) => {
  const L = await import('./static/loader.js');
  const ctx = new OfflineAudioContext(1, 1, rate);
  const W = 2048, out = [];
  const align = (a, b, at) => {        // best lag of b against a around `at`, and its normalised correlation
    let best = [0, -2];
    for (let lag = -24; lag <= 24; lag++) {
      let ab = 0, aa = 0, bb = 0;
      for (let i = at; i < at + W; i++) { const x = a[i], y = b[i + lag] ?? 0; ab += x * y; aa += x * x; bb += y * y; }
      const c = ab / Math.sqrt(aa * bb + 1e-20);
      if (c > best[1]) best = [lag, c];
    }
    return best;
  };
  for (const f of files) {
    const ref = (await L.decodeAs(ctx, f, 'wav')).buffer.getChannelData(0);
    for (const fmt of ['opus', 'm4a']) {
      let r;
      try { r = await L.decodeAs(ctx, f, fmt); } catch (e) { out.push({ f, fmt, error: String(e) }); continue; }
      const d = r.buffer.getChannelData(0), n = ref.length;
      out.push({ f, fmt, case: r.plan.case, lenRef: n, len: d.length, start: align(ref, d, 256), end: align(ref, d, n - W - 64) });
    }
  }
  return out;
}
