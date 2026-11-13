"""Sound analysis in numpy: levels, waveform peaks and an averaged log-frequency spectrum.

The same maths runs in the browser (static/analysis.js); tests/fixtures/analysis.json (scripts/make_analysis_fixture.py)
holds this module's output on a real excerpt, and the node test tests/analysis.test.mjs checks the JS against it.
Definitions (keep both sides identical):
- samples are int16 / 32768; mono = mean of the channels;
- levels: per channel peak = max |x|, rms = sqrt(mean x^2); dBFS = 20 log10(max(v, 1e-10));
- waveform: `bins` bins, bin b = samples [floor(b n / bins), floor((b + 1) n / bins)) of mono: min, max, rms;
- spectrum: Hann window (symmetric, np.hanning), frames of `nfft` at hop nfft/2, or `max_frames` frames evenly spread
  (start_i = floor(i (n - nfft) / (max_frames - 1))) when there would be more; mean |X|^2 scaled so a full-scale sine
  reads 0 dB; `bands` log-spaced bands from FMIN to Nyquist (mean power of the bins inside, else the power linearly
  interpolated at the band's geometric centre); centroid = magnitude-weighted mean frequency; peak = loudest bin > 0.
"""
import math
import wave
from pathlib import Path

import numpy as np

FMIN = 20.0
FLOOR = 1e-10


def db(v: float) -> float:
    return 20 * math.log10(max(float(v), FLOOR))


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    """(float64 array (frames, channels) in [-1, 1), sample rate) of a 16-bit PCM WAV."""
    with wave.open(str(path)) as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path.name}: {8 * sw}-bit WAV, only 16-bit PCM is supported")
    return np.frombuffer(raw, "<i2").reshape(-1, ch).astype(np.float64) / 32768, sr


def mono(x: np.ndarray) -> np.ndarray:
    return x[:, 0].copy() if x.shape[1] == 1 else x.sum(axis=1) / x.shape[1]


def levels(x: np.ndarray) -> dict:
    """Peak and RMS (linear and dBFS) per channel and overall."""
    peak = np.abs(x).max(axis=0) if len(x) else np.zeros(x.shape[1])
    rms = np.sqrt((x ** 2).mean(axis=0)) if len(x) else np.zeros(x.shape[1])
    total_rms = math.sqrt(float((rms ** 2).mean()))
    return {"peak": float(peak.max()), "rms": total_rms, "peak_db": db(peak.max()), "rms_db": db(total_rms),
            "channels": [{"peak": float(p), "rms": float(r), "peak_db": db(p), "rms_db": db(r)} for p, r in zip(peak, rms)]}


def waveform(m: np.ndarray, bins: int) -> dict:
    """Per-bin min, max and rms of a mono signal (bins is capped at the sample count)."""
    n = len(m)
    bins = max(1, min(bins, n))
    edges = (np.arange(bins + 1, dtype=np.int64) * n) // bins
    lo, hi, rms = [], [], []
    for a, b in zip(edges[:-1], edges[1:]):
        seg = m[a:b]
        lo.append(float(seg.min())); hi.append(float(seg.max())); rms.append(math.sqrt(float((seg ** 2).mean())))
    return {"bins": bins, "min": lo, "max": hi, "rms": rms}


def frame_starts(n: int, nfft: int, max_frames: int) -> list[int]:
    if n <= nfft:
        return [0]
    hop = nfft // 2
    count = (n - nfft) // hop + 1
    if count <= max_frames:
        return [i * hop for i in range(count)]
    return [(i * (n - nfft)) // (max_frames - 1) for i in range(max_frames)]


def band_edges(sr: int, bands: int) -> np.ndarray:
    nyq = sr / 2
    return np.array([FMIN * (nyq / FMIN) ** (k / bands) for k in range(bands + 1)])


def spectrum(m: np.ndarray, sr: int, nfft: int = 2048, bands: int = 96, max_frames: int = 64) -> dict:
    """Averaged power spectrum in dB, reduced to log-spaced bands, plus centroid and peak frequency."""
    if len(m) < nfft:
        m = np.concatenate([m, np.zeros(nfft - len(m))])
    win = np.hanning(nfft)
    starts = frame_starts(len(m), nfft, max_frames)
    power = np.zeros(nfft // 2 + 1)
    for s in starts:
        power += np.abs(np.fft.rfft(m[s:s + nfft] * win)) ** 2
    power *= (2 / win.sum()) ** 2 / len(starts)
    freqs = np.arange(nfft // 2 + 1) * sr / nfft
    edges = band_edges(sr, bands)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        inside = (freqs >= lo) & (freqs < hi)
        p = power[inside].mean() if inside.any() else float(np.interp(math.sqrt(lo * hi), freqs, power))
        out.append(10 * math.log10(max(float(p), FLOOR ** 2)))
    mag = np.sqrt(power)
    centroid = float((mag * freqs).sum() / mag.sum()) if mag.sum() > 0 else 0.0
    k = int(np.argmax(power[1:])) + 1
    return {"nfft": nfft, "frames": len(starts), "edges_hz": [float(e) for e in edges], "db": out,
            "centroid_hz": centroid, "peak_hz": float(freqs[k]), "peak_db": 10 * math.log10(max(float(power[k]), FLOOR ** 2))}


def analyse(x: np.ndarray, sr: int, bins: int = 600, nfft: int = 2048, bands: int = 96, max_frames: int = 64) -> dict:
    """Everything the Analyse page shows, for a (frames, channels) float array."""
    m = mono(x)
    return {"frames": len(x), "rate": sr, "channels": x.shape[1], "duration": len(x) / sr, "levels": levels(x),
            "waveform": waveform(m, bins), "spectrum": spectrum(m, sr, nfft, bands, max_frames)}


def file_levels(path: Path, chunk: int = 1 << 20) -> dict:
    """Header facts and peak/RMS of a 16-bit WAV, read in chunks (modest memory for long files)."""
    with wave.open(str(path)) as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        peak, sq = np.zeros(ch), np.zeros(ch)
        if sw == 2:
            for _ in range(0, n, chunk):
                x = np.frombuffer(w.readframes(chunk), "<i2").reshape(-1, ch).astype(np.float64) / 32768
                peak = np.maximum(peak, np.abs(x).max(axis=0)); sq += (x ** 2).sum(axis=0)
    rms = math.sqrt(float(sq.sum()) / max(1, n * ch))
    return {"frames": n, "rate": sr, "channels": ch, "bits": 8 * sw, "duration": n / sr,
            "peak_db": db(peak.max()), "rms_db": db(rms)}
