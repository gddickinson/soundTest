"""The 52 generated sounds: reproducible from scripts/synth_sounds.py, seamless, unclipped, same lengths and ids.

Run: python -m pytest -q tests/test_synth.py   (needs numpy; regenerating everything takes ~40 s)
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import synth_sounds as S  # noqa: E402
from synth.spec import HOW, NAMES, SPEC  # noqa: E402

CATALOG = {m["file"]: m for m in (json.loads(line.strip().rstrip(","))
           for line in (ROOT / "static" / "catalog_data.js").read_text().splitlines() if line.strip().startswith("{"))}
KORG = [f for f in CATALOG if "Korg-DS-8" in f]


@pytest.fixture(scope="module")
def rendered():
    return {e[0]: S.to_pcm16(S.render(e)) for e in SPEC}


def test_spec_covers_every_non_korg_sound_once():
    files = ["audio/" + e[0] for e in SPEC]
    assert len(files) == len(set(files)) == 52
    assert sorted(files + KORG) == sorted(CATALOG)
    assert len(KORG) == 36


def test_deterministic(rendered):
    again = S.to_pcm16(S.render(SPEC[3]))                     # a long ocean loop, rendered a second time
    assert hashlib.sha256(again.tobytes()).hexdigest() == hashlib.sha256(rendered[SPEC[3][0]].tobytes()).hexdigest()


def test_committed_wavs_are_what_the_script_makes(rendered):
    for e in SPEC:
        disk, sr = S.read_pcm(ROOT / "audio" / e[0])
        new = rendered[e[0]]
        assert sr == e[2] and disk.shape == new.shape, e[0]
        assert int(np.abs(disk.astype(int) - new).max()) <= 1, e[0]   # allow 1 LSB for FFT rounding across platforms


def test_lengths_rates_channels_and_ids_unchanged():
    for file, frames, sr, ch, *_ in SPEC:
        c = CATALOG["audio/" + file]
        assert (c["sr"], c["ch"]) == (sr, ch), file
        assert abs(c["dur"] - frames / sr) < 0.006, file
        assert c["origin"] == "original"
    ids = {c["id"] for c in CATALOG.values()}
    for must in ["ocean-waves-40", "chime-14", "pinknoise", "whitenoisegaussian", "kawai-k5000w-thunder", "water-drop",
                 "alesis-sanctuary-qcard-wind", "ocean-waves-strong-tide", "korg-m1-drop", "casio-vz-10m-astral-c2"]:
        assert must in ids


def test_no_clipping_and_loudness_in_range(rendered):
    for e in SPEC:
        m = S.metrics(rendered[e[0]], e[2])
        assert m["clipped"] == 0 and m["peak_db"] <= -0.9, e[0]
        assert -31 <= m["rms_db"] <= -11.5, (e[0], m["rms_db"])


def test_every_file_loops_without_a_jump(rendered):
    for file, frames, sr, ch, db, loop, *_ in SPEC:
        pcm = rendered[file]
        if loop:   # the step from the last sample back to the first is no bigger than the file's ordinary steps
            assert S.metrics(pcm, sr)["seam_ratio"] <= 1.0, file
        else:      # one-shots start and end in silence
            assert np.all(pcm[0] == 0) and np.all(pcm[-1] == 0), file


def test_generated_json_current():
    info = json.loads((ROOT / "audio" / "generated.json").read_text())
    assert info == {e[0]: {"name": NAMES.get(e[0]), "how": HOW[e[6].__name__](e[7])} for e in SPEC}
