// Compressed copies: the manifest matches the WAVs and files on disk, and the trimming maths finds the real audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { formatOrder, fileFor, trimPlan, trimChannels, libraryKB } from '../static/codec_trim.js';
import { SOUNDS } from '../static/catalog.js';
import { wavInfo } from '../scripts/make_catalog.mjs';

const root = new URL('../', import.meta.url);
const M = JSON.parse(readFileSync(new URL('audio/manifest.json', root), 'utf8'));

test('manifest: one entry per WAV, exact WAV lengths, compressed files present with the recorded sizes', () => {
  assert.equal(Object.keys(M.files).length, SOUNDS.length);
  for (const s of SOUNDS) {
    const e = M.files[s.file];
    assert.ok(e, s.file);
    const buf = readFileSync(new URL(s.file, root)), info = wavInfo(buf);
    assert.equal(e.sr, info.sr); assert.equal(e.ch, info.ch);
    assert.equal(e.frames, Math.round(info.dur * info.sr), s.file);
    for (const f of ['opus', 'm4a']) {
      const p = new URL(fileFor(s.file, f), root);
      assert.ok(existsSync(p), p.pathname);
      assert.ok(Math.abs(statSync(p).size / 1024 - e[f].kb) <= 1, `${s.file} ${f} size`);
      const c = e[f], need = e.frames * c.rate / e.sr;
      assert.ok(c.priming > 0 && c.priming < 4096, `${f} priming`);
      // the raw stream holds priming + the whole sound (+ up to one codec frame of padding)
      assert.ok(c.total >= need + c.priming - 2 && c.total <= need + c.priming + 2112, `${s.file} ${f} total ${c.total} vs ${need}`);
    }
  }
});

test('compressed library is much smaller than the WAVs', () => {
  assert.ok(libraryKB(M, 'opus') < libraryKB(M, 'wav') / 8);
  assert.ok(libraryKB(M, 'm4a') < libraryKB(M, 'wav') / 6);
});

test('format order: Opus, then AAC, then WAV; WAV only without a manifest', () => {
  assert.deepEqual(formatOrder(() => 'probably'), ['opus', 'm4a', 'wav']);
  assert.deepEqual(formatOrder(m => (m.includes('mp4') ? 'maybe' : '')), ['m4a', 'wav']);
  assert.deepEqual(formatOrder(() => ''), ['wav']);
  assert.deepEqual(formatOrder(() => 'probably', false), ['wav']);
  assert.equal(fileFor('audio/x/Gong.wav', 'opus'), 'audio/x/Gong.opus');
});

test('trim plan: raw, priming-stripped and exact decodes all start at the real audio', () => {
  const e = { frames: 441000, sr: 44100, opus: { rate: 48000, priming: 312, total: 480960 }, m4a: { rate: 44100, priming: 2112, total: 444416 } };
  // AAC at the source rate
  assert.deepEqual(trimPlan(444416, 44100, e, 'm4a'), { start: 2112, length: 441000, case: 'raw' });
  assert.deepEqual(trimPlan(442304, 44100, e, 'm4a'), { start: 0, length: 441000, case: 'priming stripped' });
  assert.deepEqual(trimPlan(441000, 44100, e, 'm4a'), { start: 0, length: 441000, case: 'exact' });
  // Opus decoded into a 48 kHz context, and resampled into 44.1 kHz
  assert.deepEqual(trimPlan(480960, 48000, e, 'opus'), { start: 312, length: 480000, case: 'raw' });
  assert.deepEqual(trimPlan(480001, 48000, e, 'opus').start, 0);
  assert.equal(trimPlan(441000, 44100, e, 'opus').start, 0);
  assert.equal(trimPlan(Math.round(480960 * 44100 / 48000), 44100, e, 'opus').start, Math.round(312 * 44100 / 48000));
  // WAV, and the 11025 Hz file into a 48 kHz context
  assert.deepEqual(trimPlan(480000, 48000, e, 'wav'), { start: 0, length: 480000, case: 'wav' });
  assert.equal(trimPlan(241010, 48000, { frames: 55359, sr: 11025 }, 'wav').length, 241019);
  // every real manifest entry is unambiguous: the three cases are far apart compared with resampling rounding
  for (const [k, f] of Object.entries(M.files)) for (const fmt of ['opus', 'm4a']) {
    const c = f[fmt], n = f.frames * c.rate / f.sr, gaps = [c.priming, c.total - n, c.total - c.priming - n];
    assert.ok(Math.min(gaps[0], gaps[1]) > 100, `${k} ${fmt} ambiguous ${gaps}`);
  }
});

test('trimChannels copies the window and zero-pads', () => {
  const [a, b] = trimChannels([Float32Array.of(0, 0, 1, 2, 3), Float32Array.of(0, 0, -1, -2, -3)], 2, 4);
  assert.deepEqual([...a], [1, 2, 3, 0]); assert.deepEqual([...b], [-1, -2, -3, 0]);
});
