"""Make compressed copies of every WAV in audio/ and the manifest the player uses to trim them back to the exact WAV.

For each audio/**/X.wav this writes, next to it:
  X.opus  Ogg/Opus, 96 kb/s stereo or 64 kb/s mono (same channel count as the WAV)
  X.m4a   AAC in MP4, 128 kb/s stereo or 96 kb/s mono (Apple AudioToolbox encoder when ffmpeg has it, else ffmpeg's aac)
and audio/manifest.json with, per WAV: its exact length (frames, sample rate) and, per format, the codec sample rate,
the encoder priming (silent samples the encoder adds at the start) and the raw decoded length including priming and
end padding. Browsers differ in whether they strip priming/padding when decoding; static/codec_trim.js uses these
numbers to find where the real audio starts and cuts it to the WAV's length, so loops stay seamless.

The WAVs stay the masters (and the fallback). Re-run after adding or changing a WAV:
  python3 scripts/compress_audio.py [--force] [--ffmpeg /opt/homebrew/bin/ffmpeg]
Needs only the Python standard library and ffmpeg/ffprobe (with libopus).
"""
import argparse
import json
import shutil
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
MANIFEST = AUDIO / "manifest.json"


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def decoded_frames(ffmpeg, path, ignore_editlist=False):
    """Number of sample frames ffmpeg decodes (mono mixdown so bytes/2 = frames)."""
    pre = ["-ignore_editlist", "1"] if ignore_editlist else []
    raw = run(ffmpeg, "-v", "error", *pre, "-i", str(path), "-ac", "1", "-f", "s16le", "-")
    return len(raw) // 2


def probe(ffprobe, path, *entries):
    out = run(ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=" + ",".join(entries),
              "-of", "json", str(path))
    return json.loads(out)["streams"][0]


def packet_durations(ffprobe, path):
    out = run(ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries", "packet=duration", "-of", "json", str(path))
    return [int(p["duration"]) for p in json.loads(out)["packets"]]


def encode(ffmpeg, src, ch, force):
    opus, m4a = src.with_suffix(".opus"), src.with_suffix(".m4a")
    aac = "aac_at" if b"aac_at" in run(ffmpeg, "-hide_banner", "-encoders") else "aac"
    if force or not opus.exists() or opus.stat().st_mtime < src.stat().st_mtime:
        run(ffmpeg, "-v", "error", "-y", "-i", str(src), "-map_metadata", "-1", "-c:a", "libopus",
            "-b:a", "96k" if ch > 1 else "64k", "-vbr", "on", "-application", "audio", str(opus))
    if force or not m4a.exists() or m4a.stat().st_mtime < src.stat().st_mtime:
        run(ffmpeg, "-v", "error", "-y", "-i", str(src), "-map_metadata", "-1", "-c:a", aac,
            "-b:a", "128k" if ch > 1 else "96k", "-movflags", "+faststart", str(m4a))
    return opus, m4a


def describe(ffmpeg, ffprobe, opus, m4a):
    s = probe(ffprobe, opus, "sample_rate", "initial_padding")
    pk = packet_durations(ffprobe, opus)
    # raw length = whole packets (the last one is reported already cut to the Ogg granule position)
    o = {"rate": int(s["sample_rate"]), "priming": int(s.get("initial_padding") or 0),
         "total": len(pk) * max(pk), "kb": round(opus.stat().st_size / 1024)}
    s = probe(ffprobe, m4a, "sample_rate")
    raw = decoded_frames(ffmpeg, m4a, ignore_editlist=True)       # every AAC frame, priming included
    front_trimmed = decoded_frames(ffmpeg, m4a)                    # the edit list skips the priming
    a = {"rate": int(s["sample_rate"]), "priming": raw - front_trimmed, "total": raw, "kb": round(m4a.stat().st_size / 1024)}
    return o, a


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true", help="re-encode even if the copies are newer than the WAV")
    ap.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg")
    a = ap.parse_args()
    ffprobe = str(Path(a.ffmpeg).with_name("ffprobe"))
    files = {}
    wavs = sorted(p for p in AUDIO.rglob("*") if p.suffix.lower() == ".wav")
    for i, src in enumerate(wavs, 1):
        with wave.open(str(src)) as w:
            frames, sr, ch = w.getnframes(), w.getframerate(), w.getnchannels()
        opus, m4a = encode(a.ffmpeg, src, ch, a.force)
        o, m = describe(a.ffmpeg, ffprobe, opus, m4a)
        rel = src.relative_to(ROOT).as_posix()
        files[rel] = {"frames": frames, "sr": sr, "ch": ch, "wav_kb": round(src.stat().st_size / 1024),
                      "opus": o, "m4a": m}
        print(f"{i:3}/{len(wavs)} {rel}: opus {o['kb']} kB (priming {o['priming']}), m4a {m['kb']} kB (priming {m['priming']})")
    MANIFEST.write_text(json.dumps({"version": 1, "files": files}, indent=1, sort_keys=True) + "\n")
    tot = {k: sum(f[k]["kb"] if k != "wav_kb" else f[k] for f in files.values()) for k in ("wav_kb", "opus", "m4a")}
    print(f"wrote {MANIFEST.relative_to(ROOT)}: WAV {tot['wav_kb'] / 1024:.1f} MB, Opus {tot['opus'] / 1024:.1f} MB, "
          f"AAC {tot['m4a'] / 1024:.1f} MB")


if __name__ == "__main__":
    main()
