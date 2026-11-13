"""soundTest local web app (FastAPI).

- app.py        routes: front end (index.html, static/, audio/, classic/, docs/) and /api; STATIC_ENDPOINTS
- catalogue.py  sound ids/names (static/catalog_data.js) + facts read from each WAV, licences, formats
- analysis.py   numpy levels, waveform peaks and spectrum (mirrored by static/analysis.js)
- synth_api.py  bounded server-side generation of the 52 original sounds with scripts/synth/
"""
