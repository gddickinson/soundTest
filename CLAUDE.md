# soundTest

Static WebAudio mixer site served by legacy GitHub Pages from `master` root (no build, no workflow, relative URLs only).
Read the map first: @INTERFACE.md

- Tests: `node --test tests/` and `python -m pytest -q tests/` (Playwright; shared venv at
  /Users/george/claude_test/add_webpage/.venv).
- After adding/removing WAVs: `node scripts/make_catalog.mjs` and `python3 scripts/compress_audio.py`. Do not add audio without a licence (THIRD_PARTY.md).
- Keep every file under 500 lines; log work in SESSION_LOG.md.
