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
