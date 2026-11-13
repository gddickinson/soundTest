# Session log

## 2026-11-11 — web interface redo (branch `web-interface`, not pushed)
- Looked at the live page and code. Confirmed bugs in the original page with Playwright and fixed each with a
  regression test that failed first (separate commits):
  1. chime 19 never played (`getRndInteger(0,19)` excludes the max);
  2. Play Sample / Play Loop before choosing a sound threw; channels never freed when a WAV's duration was unknown
     (NaN) so playback stopped after 10 clicks; duplicate `id="message"`;
  3. analyser: Stop threw `audioCtx is not defined` (locals + `source,close()` typo), restart threw
     (MediaElementSource connected twice), two render loops, console.log every frame;
  4. all 22 `<audio preload="auto">` (~47 MB) downloaded on every visit; `<audio>` tags outside `<body>`.
- Moved the original page to `classic/` (paths `../audio/`, link back to the new site).
- New site in the shared dark neon kit (`static/core.js`, `static/style.css` copied unchanged): WebAudio mixer with
  seamless crossfaded loops, scatter mode, mute/solo/pan, master + limiter, preset crossfades, sleep timer with a
  smooth fade, saved mixes (localStorage) and share links in the hash, spectrum/waveform/orbit visualiser, lazy
  streaming WAV loading with progress, keyboard control, player dock, credits page from THIRD_PARTY.md.
- Sound list generated from the WAV headers by `scripts/make_catalog.mjs` (88 files, 6 categories); test checks it is current.
- Tests: node 19 pass; Playwright smoke 9 pass (smoke server uses a longer listen queue: the default 5 dropped
  module requests on macOS and made first loads stall).
- No audio added or converted. Suggestion for George: compressed copies (Opus/AAC) would cut downloads ~10x.

## 2026-11-11 — compressed copies (George approved)
- `scripts/compress_audio.py` (ffmpeg): Opus 96/64 kb/s and AAC (AudioToolbox) 128/96 kb/s next to each WAV, plus
  `audio/manifest.json` (WAV frames/rate; per format codec rate, priming (Opus pre-skip 312, AAC 2112), raw length).
- Player loads Opus > AAC > WAV (canPlayType, falling back on decode errors) and trims the decoded buffer to the WAV's
  exact start/length (`static/codec_trim.js`), then builds the seamless loop as before.
- Full library download: WAV 127.9 MB -> Opus 10.8 MB (AAC 15.0 MB). Repo grows by ~26 MB.
- Chrome decodes both formats already trimmed ("exact" case); lengths equal and lag 0 at first/last samples at 44.1
  and 48 kHz. The raw-priming case was checked offline (ffmpeg -ignore_editlist + manifest priming: lag 0). Playwright
  WebKit is not installed here, so the WebKit test skips.
- Tests: node 24 pass; Playwright 11 pass, 1 skipped (WebKit).

## 2026-11-12 — original sounds replace the 52 unlicensed WAVs (George asked)
- `scripts/synth_sounds.py` + `scripts/synth/` (numpy, seeded per file): same file names, frames, rates, channels;
  RMS matched to the old files (clamped -30..-12 dBFS), peaks <= -1 dBFS; loops periodic by construction, one-shots
  start/end at 0. Checked numerically: spectral centroid close to the old files for most, pitch of the C-note
  instruments (HPS), no clipping, seam step <= normal step. Display names/sources updated via `audio/generated.json`.
- Regenerated Opus/AAC + manifest (Opus library 11.5 MB). THIRD_PARTY.md and credits: 52 original (MIT), 36 Korg.
- Old recordings remain in git history; removing them needs a history rewrite + force-push (George's decision).

## 2026-11-12: git history rewrite (approved by George)
- Purged from all history with git-filter-repo and force-pushed: the 52 replaced recordings (old WAV blobs plus the Opus/AAC copies made from them, 156 blobs; the current files and the Korg DS-8 pack are untouched).
  The current tree is unchanged (identical HEAD tree before/after); commit hashes changed, so old clones must be
  re-cloned or reset to origin. A pre-rewrite mirror backup was kept outside the repo.

## 2026-11-13: local Python backend (FastAPI) for Project Hub
- `run_web.py` (127.0.0.1:8243; 8161 from the brief is gps-tracker's port in the hub) + `web/`: serves the existing
  front end unchanged on disk (index.html is served with `window.APP_STATIC = false`) and `/api`: info, sounds
  (facts read from each WAV: duration, rate, channels, bits, peak/RMS dBFS, licence, sizes), `/api/sound/{id}`
  (WAV/Opus/AAC with correct types and 206 range requests), `/api/analyse/{id}` (numpy levels, waveform peaks,
  averaged spectrum in log bands), `GET/POST /api/synth` (renders the 52 original sounds with `scripts/synth/`;
  bounded per-recipe settings, 0.05–20 s, seed; extra fields/unknown settings are 422; default = the committed WAV).
- Static site keeps working on Pages: `api/*.json` exported by `scripts/export_api.py`, `static/static_api.js`;
  analysis runs in the browser (`static/analysis.js`), synthesis says it needs the local app.
- New pages `#/sounds`, `#/sounds/<id>`, `#/synth`. `scripts/synth_sounds.render` takes an optional `seed`.
- Python/JS agreement: `tests/fixtures/analysis.json` (3 real excerpts: stereo, shorter than nfft, 11025 Hz) and
  `tests/analysis.test.mjs`: agree within 1e-9 (spectrum dB 1e-7).
- Fix: the documented `node --test tests/` fails on Node 22 (no tests run); now `node --test tests/*.test.mjs`.
- `scripts/screenshots.py` rewritten: `--static` / `--base` smoke test of every route at 1280 and 390 px.
