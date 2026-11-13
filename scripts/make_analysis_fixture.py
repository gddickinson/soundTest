"""Write tests/fixtures/analysis.json: excerpts of real repo WAVs (int16) and web/analysis.py's results on them.

The node test tests/analysis.test.mjs runs static/analysis.js on the same samples and must agree; tests/test_web.py
checks the fixture is still what web/analysis.py computes.   python scripts/make_analysis_fixture.py [--check]
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from web.analysis import analyse  # noqa: E402

OUT = ROOT / "tests" / "fixtures" / "analysis.json"
# file, first frame, frames, analysis options (bins, nfft, bands, max_frames)
CASES = [
    ("audio/bells_chimes/3.wav", 2000, 6000, dict(bins=50, nfft=1024, bands=40, max_frames=4)),   # stereo, spread frames
    ("audio/whitenoise/pinknoise.wav", 0, 300, dict(bins=500, nfft=512, bands=24, max_frames=64)),  # shorter than nfft
    ("audio/ocean_sounds/oceano.wav", 1000, 5000, dict(bins=64, nfft=256, bands=32, max_frames=64)),  # 11025 Hz
]


def cases():
    import wave
    out = []
    for file, start, count, opt in CASES:
        with wave.open(str(ROOT / file)) as w:
            sr, ch = w.getframerate(), w.getnchannels()
            w.setpos(start)
            pcm = np.frombuffer(w.readframes(count), "<i2").reshape(-1, ch)
        res = analyse(pcm.astype(np.float64) / 32768, sr, **opt)
        out.append({"file": file, "start": start, "rate": sr, "options": opt,
                    "samples": [pcm[:, c].tolist() for c in range(ch)], "result": res})
    return out


if __name__ == "__main__":
    data = {"_doc": __doc__.splitlines()[0], "cases": cases()}
    if "--check" in sys.argv:
        from numpy.testing import assert_allclose
        old = json.loads(OUT.read_text())
        for a, b in zip(old["cases"], data["cases"]):
            assert_allclose(a["result"]["spectrum"]["db"], b["result"]["spectrum"]["db"], rtol=1e-6, atol=1e-9)
        print("fixture current")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
        print("wrote", OUT, OUT.stat().st_size, "bytes")
