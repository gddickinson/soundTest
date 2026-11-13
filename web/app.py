"""FastAPI app for soundTest: serves the existing front end (index.html, static/, audio/, classic/) and a Python API.

Run with `python run_web.py` (http://127.0.0.1:8243, local only). The same front end is the GitHub Pages site: there
index.html keeps `window.APP_STATIC = true` and static/static_api.js answers from the JSON in api/ (written by
scripts/export_api.py from STATIC_ENDPOINTS) or computes in the browser; this app serves index.html with it set false.

API: /api/info, /api/sounds, /api/sounds/{id}, /api/sound/{id}?format=wav|opus|m4a (range requests),
/api/analyse/{id} (levels, waveform peaks, spectrum; numpy), GET /api/synth (what can be generated) and
POST /api/synth (generate one of the 52 original sounds with the repo's synthesis code; returns a WAV).
"""
import mimetypes
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from . import analysis, catalogue, synth_api

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
for ext, (_suffix, mime) in (("wav", catalogue.FORMATS["wav"]), ("opus", catalogue.FORMATS["opus"]),
                             ("m4a", catalogue.FORMATS["m4a"])):
    mimetypes.add_type(mime, "." + ext)

app = FastAPI(title="soundTest")
for folder in ("static", "audio", "classic", "docs"):
    app.mount(f"/{folder}", StaticFiles(directory=ROOT / folder, html=folder == "classic"), name=folder)


@lru_cache(maxsize=1)
def _index() -> str:
    html = (ROOT / "index.html").read_text()
    marker = "window.APP_STATIC = true"
    if marker not in html:
        raise RuntimeError("index.html lost its APP_STATIC marker")
    return html.replace(marker, "window.APP_STATIC = false")


@app.get("/", include_in_schema=False)
def index():
    return HTMLResponse(_index())


@app.get("/index.html", include_in_schema=False)
def index_html():
    return HTMLResponse(_index())


@app.get("/{name}", include_in_schema=False)
def top_file(name: str):
    """The few top-level text files the front end reads (credits page)."""
    if name not in ("THIRD_PARTY.md", "LICENSE", "README.md"):
        raise HTTPException(404)
    return FileResponse(ROOT / name, media_type="text/plain; charset=utf-8")


def _sound(sound_id: str) -> dict:
    e = catalogue.by_id(sound_id)
    if not e:
        raise HTTPException(404, f"no sound {sound_id!r}")
    return e


@app.get("/api/info")
def info():
    """Counts for the home and about pages."""
    rows = catalogue.entries()
    return {"title": "soundTest", "server": True, "sounds": len(rows),
            "original": sum(r["origin"] == "original" for r in rows),
            "third_party": sum(r["origin"] != "original" for r in rows),
            "generated": len(synth_api.SPEC_BY_ID), "formats": list(catalogue.FORMATS),
            "max_synth_seconds": synth_api.MAX_SECONDS}


@app.get("/api/sounds")
def sounds():
    """The catalogue with facts read from every WAV (duration, rate, channels, peak/RMS) and the licence."""
    return {"sounds": catalogue.all_sounds()}


@app.get("/api/sounds/{sound_id}")
def sound_info(sound_id: str):
    return catalogue.describe(_sound(sound_id))


@app.get("/api/sound/{sound_id}")
def sound_file(sound_id: str, format: str = Query("wav", pattern="^(wav|opus|m4a)$")):
    """The audio file itself (FileResponse answers Range requests with 206)."""
    p = catalogue.path_for(_sound(sound_id), format)
    if not p.exists():
        raise HTTPException(404, f"no {format} copy of {sound_id}")
    return FileResponse(p, media_type=catalogue.FORMATS[format][1], filename=p.name, content_disposition_type="inline")


@lru_cache(maxsize=16)
def _analyse(path: str, mtime: int, bins: int, nfft: int, bands: int) -> dict:
    x, sr = analysis.read_wav(Path(path))
    return analysis.analyse(x, sr, bins=bins, nfft=nfft, bands=bands)


def _round(v, nd=5):
    if isinstance(v, float):
        return round(v, nd)
    if isinstance(v, list):
        return [_round(x, nd) for x in v]
    if isinstance(v, dict):
        return {k: _round(x, nd) for k, x in v.items()}
    return v


@app.get("/api/analyse/{sound_id}")
def analyse(sound_id: str, bins: int = Query(600, ge=16, le=4000), nfft: int = Query(2048, ge=256, le=16384),
            bands: int = Query(96, ge=8, le=512)):
    """Levels, waveform peaks (min/max/rms per bin) and the averaged log-frequency spectrum of the WAV (numpy)."""
    if nfft & (nfft - 1):
        raise HTTPException(422, "nfft must be a power of two")
    e = _sound(sound_id)
    p = catalogue.path_for(e)
    out = _analyse(str(p), p.stat().st_mtime_ns, bins, nfft, bands)
    return {"id": sound_id, "source": "wav", **_round(out)}


@app.get("/api/synth")
def synth_list():
    """The 52 original sounds the server can generate, with each recipe's adjustable parameters and bounds."""
    return {"max_seconds": synth_api.MAX_SECONDS, "min_seconds": synth_api.MIN_SECONDS, "max_seed": synth_api.MAX_SEED,
            "sounds": synth_api.describe()}


class SynthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    seed: int | None = None
    duration: float | None = None
    params: dict[str, float | int | str] = {}


@app.post("/api/synth")
async def synth(req: SynthRequest):
    """Render a sound with the repo's synthesis code; returns audio/wav (16-bit PCM)."""
    try:
        entry, seed = synth_api.plan(req.id, req.seed, req.duration, req.params)
    except synth_api.SynthError as e:
        raise HTTPException(422, str(e))
    data = await run_in_threadpool(synth_api.wav_bytes, entry, seed)
    return Response(data, media_type="audio/wav", headers={
        "Content-Disposition": f'inline; filename="{req.id}-{seed}.wav"', "X-Seed": str(seed),
        "X-Frames": str(entry[1]), "Access-Control-Expose-Headers": "X-Seed, X-Frames"})


# GET paths (without the /api prefix) written to api/<path>.json for the static site by scripts/export_api.py.
STATIC_ENDPOINTS = ["/info", "/sounds", "/synth"]
