# soundTest

WebAudio mixer site served by legacy GitHub Pages from `master` root (no build, no workflow, relative URLs only), plus
an optional local FastAPI app (`run_web.py`, `web/`, port 8243) that serves the same files with `window.APP_STATIC = false`.
Read the map first: @INTERFACE.md

- Tests: `node --test tests/*.test.mjs` and `python -m pytest -q tests/` (Playwright; shared venv at
  /Users/george/claude_test/add_webpage/.venv).
- The 52 non-Korg sounds are generated: change `scripts/synth/`, run `python scripts/synth_sounds.py`.
- After adding/removing WAVs: `node scripts/make_catalog.mjs` and `python3 scripts/compress_audio.py`. Do not add audio without a licence (THIRD_PARTY.md).
- After changing sounds or GET endpoints: `python scripts/export_api.py` (static site's `api/*.json`); after changing
  `web/analysis.py` or `static/analysis.js`: `python scripts/make_analysis_fixture.py` and the node test.
- Keep every file under 500 lines; log work in SESSION_LOG.md.
