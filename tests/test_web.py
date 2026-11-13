"""Local web app (web/app.py): front end served with APP_STATIC false, catalogue facts from the WAVs, streaming with
range requests, numpy analysis (and its JS twin via the fixture), bounded server-side synthesis, the static exports.

Run: python -m pytest -q tests/test_web.py   (CI=1 skips the slow whole-library checks)
"""
import io
import json
import math
import os
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from web import analysis, catalogue, synth_api  # noqa: E402
from web.app import STATIC_ENDPOINTS, app  # noqa: E402

client = TestClient(app)
CI = bool(os.environ.get("CI"))


def test_index_served_in_server_mode():
    r = client.get("/")
    assert r.status_code == 200 and "static/main.js" in r.text
    assert "window.APP_STATIC = false" in r.text and "APP_STATIC = true" not in r.text
    assert "window.APP_STATIC = true" in (ROOT / "index.html").read_text()      # the Pages site stays static


@pytest.mark.parametrize("path", ["/static/core.js", "/static/analysis.js", "/classic/", "/THIRD_PARTY.md",
                                  "/audio/manifest.json", "/audio/Korg-DS-8-Sci-Fi-Sound-Effects-Pack/Readme.txt"])
def test_front_end_files(path):
    assert client.get(path).status_code == 200


@pytest.mark.parametrize("path", ["/.git/config", "/web/app.py", "/scripts/synth_sounds.py", "/requirements-web.txt", "/run_web.py"])
def test_no_other_files_exposed(path):
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("path", STATIC_ENDPOINTS)
def test_endpoint(path):
    r = client.get("/api" + path)
    assert r.status_code == 200, r.text
    assert r.json()


def test_info_counts():
    i = client.get("/api/info").json()
    assert (i["sounds"], i["original"], i["third_party"], i["generated"], i["server"]) == (88, 52, 36, 52, True)


def test_sounds_facts_match_headers():
    sounds = client.get("/api/sounds").json()["sounds"]
    assert len(sounds) == 88 and len({s["id"] for s in sounds}) == 88
    for s in sounds[:: 1 if not CI else 11]:
        with wave.open(str(ROOT / s["file"])) as w:
            assert (s["rate"], s["channels"], s["frames"]) == (w.getframerate(), w.getnchannels(), w.getnframes())
        assert s["duration"] == pytest.approx(s["frames"] / s["rate"], abs=1e-4)
        assert -60 < s["rms_db"] < s["peak_db"] <= 0
        assert s["licence"] == ("MIT" if s["origin"] == "original" else "royalty-free")
        assert set(s["formats"]) == {"wav", "opus", "m4a"}


def test_levels_chunked_equal_whole_file():
    e = catalogue.by_id("chime-0")
    x, _ = analysis.read_wav(ROOT / e["file"])
    whole, chunked = analysis.levels(x), analysis.file_levels(ROOT / e["file"], chunk=1000)
    assert chunked["peak_db"] == pytest.approx(whole["peak_db"]) and chunked["rms_db"] == pytest.approx(whole["rms_db"])
    # the generator's own metrics agree (scripts/synth_sounds.py)
    from synth_sounds import metrics, read_pcm
    pcm, sr = read_pcm(ROOT / e["file"])
    m = metrics(pcm, sr)
    assert m["rms_db"] == pytest.approx(whole["rms_db"], abs=1e-6) and m["peak_db"] == pytest.approx(whole["peak_db"], abs=1e-6)


@pytest.mark.parametrize("fmt,mime", [("wav", "audio/wav"), ("opus", "audio/ogg"), ("m4a", "audio/mp4")])
def test_sound_stream_and_ranges(fmt, mime):
    p = catalogue.path_for(catalogue.by_id("chime-3"), fmt)
    full = client.get(f"/api/sound/chime-3?format={fmt}")
    assert full.status_code == 200 and full.headers["content-type"].startswith(mime) and full.content == p.read_bytes()
    assert full.headers.get("accept-ranges") == "bytes"
    part = client.get(f"/api/sound/chime-3?format={fmt}", headers={"Range": "bytes=100-299"})
    assert part.status_code == 206 and part.content == p.read_bytes()[100:300]
    assert part.headers["content-range"] == f"bytes 100-299/{p.stat().st_size}"
    assert client.get(f"/audio/bells_chimes/3{p.suffix}", headers={"Range": "bytes=0-9"}).status_code == 206


def test_sound_errors():
    assert client.get("/api/sound/nope").status_code == 404
    assert client.get("/api/sound/chime-3?format=mp3").status_code == 422
    assert client.get("/api/sound/..%2F..%2Fweb%2Fapp.py").status_code == 404


def test_analyse_endpoint_matches_module():
    r = client.get("/api/analyse/chime-3?bins=100&nfft=1024&bands=48")
    assert r.status_code == 200
    a = r.json()
    x, sr = analysis.read_wav(ROOT / "audio/bells_chimes/3.wav")
    ref = analysis.analyse(x, sr, bins=100, nfft=1024, bands=48)
    assert a["waveform"]["bins"] == 100 and len(a["spectrum"]["db"]) == 48
    np.testing.assert_allclose(a["spectrum"]["db"], ref["spectrum"]["db"], atol=1e-4)
    np.testing.assert_allclose(a["waveform"]["max"], ref["waveform"]["max"], atol=1e-5)
    assert a["levels"]["rms_db"] == pytest.approx(client.get("/api/sounds/chime-3").json()["rms_db"], abs=0.01)


@pytest.mark.parametrize("q", ["nfft=1000", "nfft=128", "bins=5", "bands=10000"])
def test_analyse_bounds(q):
    assert client.get(f"/api/analyse/chime-3?{q}").status_code == 422


def test_analysis_sine_reads_its_level_and_frequency():
    sr, f = 44100, 1000.0
    t = np.arange(sr) / sr
    x = (0.5 * np.sin(2 * np.pi * f * t))[:, None]
    a = analysis.analyse(x, sr, nfft=4096)
    assert a["levels"]["peak_db"] == pytest.approx(20 * math.log10(0.5), abs=0.01)
    assert a["levels"]["rms_db"] == pytest.approx(20 * math.log10(0.5 / math.sqrt(2)), abs=0.01)
    assert abs(a["spectrum"]["peak_hz"] - f) < sr / 4096
    assert a["spectrum"]["peak_db"] == pytest.approx(20 * math.log10(0.5), abs=1.5)   # Hann scalloping < 1.5 dB


def test_analysis_fixture_current():
    """tests/fixtures/analysis.json (used by the node test) is still what web/analysis.py computes."""
    import make_analysis_fixture as mk
    old = json.loads((ROOT / "tests/fixtures/analysis.json").read_text())["cases"]
    for a, b in zip(old, mk.cases()):
        assert a["samples"] == b["samples"]
        for k in ("min", "max", "rms"):
            np.testing.assert_allclose(a["result"]["waveform"][k], b["result"]["waveform"][k], rtol=1e-6, atol=1e-9)
        np.testing.assert_allclose(a["result"]["spectrum"]["db"], b["result"]["spectrum"]["db"], rtol=1e-6, atol=1e-9)
        if not CI:     # discrete choice (loudest bin) from float maths
            assert a["result"]["spectrum"]["peak_hz"] == b["result"]["spectrum"]["peak_hz"]


def _same(a, b, where=""):
    """Equal JSON, floats within 0.011 (values are rounded to 2 decimals; libm differs between macOS and Linux)."""
    if isinstance(a, float) or isinstance(b, float):
        assert a == pytest.approx(b, abs=0.011), where
    elif isinstance(a, dict):
        assert set(a) == set(b), where
        for k in a:
            _same(a[k], b[k], f"{where}.{k}")
    elif isinstance(a, list):
        assert len(a) == len(b), where
        for i, (x, y) in enumerate(zip(a, b)):
            _same(x, y, f"{where}[{i}]")
    else:
        assert a == b, where


def test_same_helper():
    _same({"a": [1.0, "x"]}, {"a": [1.005, "x"]})
    with pytest.raises(AssertionError):
        _same({"a": [1.0]}, {"a": [1.1]})


def test_static_exports_current():
    import export_api
    for name, v in export_api.exported().items():
        _same(json.loads((ROOT / "api" / name).read_text()), v, f"api/{name} (stale? run scripts/export_api.py)")
    assert json.loads((ROOT / "api/info.json").read_text())["server"] is False


def _wav(r):
    with wave.open(io.BytesIO(r.content)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()), w.getframerate()


def test_synth_default_reproduces_committed_wav():
    r = client.post("/api/synth", json={"id": "chime-0"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    pcm, sr = _wav(r)
    disk, dsr = analysis.read_wav(ROOT / "audio/bells_chimes/0.wav")
    assert sr == dsr and pcm.shape == disk.shape
    assert np.abs(pcm.astype(int) - np.round(disk * 32768).astype(int)).max() <= 1


def test_synth_parameters_change_the_sound():
    base = _wav(client.post("/api/synth", json={"id": "chime-0", "duration": 1.0}))[0]
    seeded = client.post("/api/synth", json={"id": "chime-0", "duration": 1.0, "seed": 7})
    assert seeded.headers["x-seed"] == "7"
    other = _wav(client.post("/api/synth", json={"id": "chime-0", "duration": 1.0, "params": {"timbre": "glass", "decay": 0.5}}))[0]
    assert base.shape == other.shape == (44100, 2) and not np.array_equal(base, other)
    noise = _wav(client.post("/api/synth", json={"id": "whitenoise", "duration": 0.5}))
    assert noise[0].shape == (22050, 1) and noise[1] == 44100


@pytest.mark.parametrize("body", [
    {"id": "glitch1"},                                     # third-party: not generated
    {"id": "nope"},
    {"id": "chime-0", "duration": 21},
    {"id": "chime-0", "duration": 0},
    {"id": "chime-0", "seed": -1},
    {"id": "chime-0", "seed": 2 ** 40},
    {"id": "chime-0", "params": {"decay": 99}},
    {"id": "chime-0", "params": {"timbre": "__import__('os')"}},
    {"id": "chime-0", "params": {"notes": 3}},             # not an adjustable parameter
    {"id": "whitenoise", "params": {"q": 3}},
    {"id": "chime-4", "params": {"root": 60.5}},
    {"id": "chime-0", "code": "print(1)"},                 # unknown field
])
def test_synth_rejects(body):
    r = client.post("/api/synth", json=body)
    assert r.status_code == 422, r.text


def test_synth_listing_covers_every_generated_sound():
    d = client.get("/api/synth").json()
    assert len(d["sounds"]) == 52 and d["max_seconds"] == synth_api.MAX_SECONDS
    assert {s["recipe"] for s in d["sounds"]} <= set(synth_api.PARAMS)
    for s in d["sounds"]:
        for p in s["params"]:
            if p["kind"] != "choice":
                assert p["min"] <= p["default"] <= p["max"], (s["id"], p)
            else:
                assert p["default"] in p["choices"]


@pytest.mark.skipif(CI, reason="slow: renders at the parameter bounds")
@pytest.mark.parametrize("sid,params", [
    ("chime-4", {"density": 2.0, "decay": 10.0, "beat": 3.0}),
    ("gong", {"count": 64, "decay": 4.0, "f0": 30.0}),
    ("ocean", {"period": 2.0, "rise": 0.3, "fall": 0.5}),
])
def test_synth_extremes_render(sid, params):
    import time
    sid = next(s["id"] for s in client.get("/api/synth").json()["sounds"] if s["id"].startswith(sid))
    t = time.time()
    r = client.post("/api/synth", json={"id": sid, "duration": 20.0, "params": params})
    assert r.status_code == 200 and time.time() - t < 30
    pcm, _ = _wav(r)
    assert np.abs(pcm).max() < 32767


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
def test_js_analysis_agrees_with_python():
    r = subprocess.run(["node", "--test", str(ROOT / "tests/analysis.test.mjs")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
