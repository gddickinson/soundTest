"""Generate soundTest's 52 original sounds (everything except the Korg DS-8 pack) into audio/.

Deterministic: every sound has its own seeded numpy Generator (seed = BASE_SEED + crc32 of its file name), so a run
reproduces the committed WAVs. Each file keeps the name, length (frames), sample rate and channel count of the
third-party recording it replaces, so sound ids, presets and share links are unchanged.

  python scripts/synth_sounds.py                 # write all 52 WAVs (16-bit PCM) and audio/generated.json
  python scripts/synth_sounds.py --only chime    # just files whose path contains "chime"
  python scripts/synth_sounds.py --check         # regenerate in memory, compare with the WAVs on disk, print metrics
Then: node scripts/make_catalog.mjs && python3 scripts/compress_audio.py
Needs numpy. The generated audio is original work, released under the repository's MIT licence (see THIRD_PARTY.md).
"""
import argparse
import sys
import wave
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from synth.dsp import normalise, oneshot_edges  # noqa: E402
import json  # noqa: E402

from synth.spec import HOW, NAMES, SPEC, target_db  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BASE_SEED = 20261111


def seed_for(file):
    """The fixed seed of one sound (BASE_SEED + crc32 of its file name)."""
    return BASE_SEED + zlib.crc32(file.encode())


def render(entry, seed=None):
    """float array (channels, frames) for one SPEC entry, normalised, edges finished. `seed` overrides seed_for(file)."""
    file, frames, sr, ch, orig_db, loop, recipe, kw = entry
    rng = np.random.default_rng(seed_for(file) if seed is None else seed)
    kw = dict(kw)
    soft = kw.pop('soft', False)
    x = np.asarray(recipe(frames, sr, ch, rng, **kw), dtype=np.float64)[:ch, :frames]
    if x.shape != (ch, frames):
        raise ValueError(f"{file}: recipe returned {x.shape}, need {(ch, frames)}")
    x -= x.mean(axis=1, keepdims=True) if loop else 0          # no DC offset in loops
    if not loop:
        x = oneshot_edges(x, sr)
    if soft:      # noise beds: tame rare peaks with a gentle saturator so they reach their loudness below -1 dBFS
        x = x / np.sqrt(np.mean(x ** 2)) * 10 ** (target_db(orig_db) / 20)
        x = 0.85 * np.tanh(x / 0.85)
    return normalise(x, target_db(orig_db))


def to_pcm16(x):
    return np.clip(np.round(x * 32767), -32767, 32767).astype('<i2').T.copy()


def write_wav(path, pcm, sr):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(pcm.shape[1]); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def read_pcm(path):
    with wave.open(str(path)) as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path}: {8 * sw}-bit, expected 16-bit")
    return np.frombuffer(raw, '<i2').reshape(n, ch), sr


def metrics(pcm, sr):
    """RMS/peak (dBFS), spectral centroid (Hz), and the loop-seam jump relative to the file's own sample steps."""
    x = pcm.astype(np.float64) / 32768
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    pk = 20 * np.log10(np.abs(x).max() + 1e-12)
    mono = x.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono[: min(mono.size, 1 << 20)]))
    f = np.fft.rfftfreq(min(mono.size, 1 << 20), 1 / sr)
    centroid = float((spec * f).sum() / (spec.sum() + 1e-20))
    steps = np.abs(np.diff(x, axis=0))
    seam = np.abs(x[0] - x[-1])
    typical = np.percentile(steps, 99.9, axis=0)
    return {'rms_db': rms, 'peak_db': pk, 'centroid_hz': centroid, 'seam': seam.max(),
            'seam_ratio': float((seam / (typical + 2 / 32768)).max()), 'clipped': int((np.abs(pcm) >= 32767).sum())}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument('--only', default='')
    ap.add_argument('--check', action='store_true', help='compare with the WAVs on disk instead of writing')
    a = ap.parse_args()
    bad = 0
    for entry in SPEC:
        file, frames, sr = entry[0], entry[1], entry[2]
        if a.only not in file:
            continue
        pcm = to_pcm16(render(entry))
        path = ROOT / 'audio' / file
        if a.check:
            disk, dsr = read_pcm(path)
            diff = int(np.abs(disk.astype(int) - pcm).max()) if disk.shape == pcm.shape and dsr == sr else None
            ok = diff is not None and diff <= 1
            bad += not ok
            status = 'ok  ' if ok else 'DIFF'
        else:
            write_wav(path, pcm, sr)
            status = 'wrote'
        m = metrics(pcm, sr)
        print(f"{status} {file}: {frames / sr:6.2f} s, RMS {m['rms_db']:6.1f} dBFS, peak {m['peak_db']:5.1f}, "
              f"centroid {m['centroid_hz']:6.0f} Hz, seam/step {m['seam_ratio']:.2f}")
    if not a.check and not a.only:
        info = {e[0]: {'name': NAMES.get(e[0]), 'how': HOW[e[6].__name__](e[7])} for e in SPEC}
        (ROOT / 'audio' / 'generated.json').write_text(json.dumps(info, indent=1, sort_keys=True) + '\n')
        print('wrote audio/generated.json')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
