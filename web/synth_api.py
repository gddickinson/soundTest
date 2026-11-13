"""Server-side generation of the 52 original sounds with the repo's own synthesis code (scripts/synth_sounds.py,
scripts/synth/). A request names a sound id and may change its seed, its length and a fixed, bounded set of numeric or
choice parameters of that sound's recipe (PARAMS below). Nothing else is accepted: no code, no file names, no
arbitrary keyword arguments. One render runs at a time.
"""
import inspect
import io
import sys
import threading
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from synth.recipes_tonal import SCALES, TIMBRES  # noqa: E402
from synth.spec import HOW, SPEC  # noqa: E402
from synth_sounds import render, seed_for, to_pcm16  # noqa: E402

from .catalogue import entries  # noqa: E402

MAX_SECONDS = 20.0
MIN_SECONDS = 0.05
MAX_SEED = 2 ** 32 - 1
LOCK = threading.Lock()

F0 = ("float", 20.0, 2000.0)
_TIMBRE = ("choice", sorted(TIMBRES))
_STRIKE = {"timbre": _TIMBRE, "decay": ("float", 0.1, 6.0), "hardness": ("float", 0.1, 1.0), "beat": ("float", 0.0, 3.0),
           "wet": ("float", 0.0, 0.8)}
# recipe name -> {parameter: ("float", lo, hi) | ("int", lo, hi) | ("choice", [values])}
PARAMS = {
    "white_uniform": {}, "white_gauss": {}, "pink": {}, "water_drop": {}, "typhoon": {}, "thunder": {},
    "wacky_snare": {}, "synth_drop": {},
    "ocean": {"period": ("float", 2.0, 20.0), "rise": ("float", 0.3, 6.0), "fall": ("float", 0.5, 12.0),
              "calm": ("float", 0.0, 1.0), "cutoff": ("float", 200.0, 5000.0), "crash": ("float", 0.0, 2.0),
              "foam": ("float", 0.0, 2.0)},
    "seashore_synth": {"waves": ("int", 1, 4), "cutoff": ("float", 300.0, 6000.0), "crash": ("float", 0.0, 2.0)},
    "flowing_water": {"rate": ("float", 5.0, 200.0)},
    "wind": {"q": ("float", 2.0, 30.0), "whistle": ("float", 0.0, 2.0), "body": ("float", 0.0, 2.0), "air": ("float", 0.0, 1.0)},
    "single_strikes": _STRIKE,
    "chime_sequence": {"scale": ("choice", sorted(SCALES)), "root": ("int", 36, 96), "density": ("float", 0.05, 2.0),
                       **_STRIKE, "decay": ("float", 0.3, 10.0), "breeze": ("float", 0.0, 0.5)},
    "fm_bell": {"f0": F0, "ratio": ("float", 0.5, 8.0), "index": ("float", 0.0, 20.0), "decay": ("float", 0.1, 3.0)},
    "gong": {"f0": ("float", 30.0, 400.0), "count": ("int", 4, 64), "decay": ("float", 0.2, 4.0)},
    "pluck": {"f0": F0, "decay": ("float", 0.98, 0.9995), "bright": ("float", 0.0, 1.0), "wet": ("float", 0.0, 0.8)},
    **{k: {"f0": F0} for k in ("sitar", "buzzy_bass", "flute", "bowed_bass", "bari_sax", "astral_pad")},
}


class SynthError(ValueError):
    """A request that names an unknown sound or parameter, or a value out of range."""


def _spec_by_id() -> dict:
    files = {e[0]: e for e in SPEC}
    return {c["id"]: files[c["file"].removeprefix("audio/")] for c in entries() if c["file"].removeprefix("audio/") in files}


SPEC_BY_ID = _spec_by_id()


def _default(recipe, kw: dict, name: str):
    if name in kw:
        return kw[name]
    p = inspect.signature(recipe).parameters.get(name)
    return None if p is None or p.default is inspect.Parameter.empty else p.default


def describe() -> list[dict]:
    """GET /api/synth: every sound that can be generated, with its recipe, defaults and parameter bounds."""
    names = {e["id"]: e["name"] for e in entries()}
    out = []
    for sid, (file, frames, sr, ch, _db, loop, recipe, kw) in SPEC_BY_ID.items():
        params = []
        for name, rule in PARAMS[recipe.__name__].items():
            d = {"name": name, "kind": rule[0], "default": _default(recipe, kw, name)}
            d.update({"choices": rule[1]} if rule[0] == "choice" else {"min": rule[1], "max": rule[2]})
            params.append(d)
        out.append({"id": sid, "file": "audio/" + file, "name": names[sid], "recipe": recipe.__name__,
                    "how": HOW[recipe.__name__](kw), "loop": loop, "rate": sr, "channels": ch,
                    "duration": round(frames / sr, 4), "default_duration": round(min(frames / sr, MAX_SECONDS), 4),
                    "seed": seed_for(file), "params": params})
    return out


def _check(name: str, rule: tuple, value):
    kind = rule[0]
    if kind == "choice":
        if value not in rule[1]:
            raise SynthError(f"{name} must be one of {', '.join(rule[1])}")
        return value
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SynthError(f"{name} must be a number")
    if kind == "int" and int(value) != value:
        raise SynthError(f"{name} must be a whole number")
    if not rule[1] <= value <= rule[2]:
        raise SynthError(f"{name} must be between {rule[1]} and {rule[2]}")
    return int(value) if kind == "int" else float(value)


def plan(sound_id: str, seed=None, duration=None, params=None) -> tuple:
    """Validate a request; return the SPEC entry to render and the seed. Raises SynthError."""
    if sound_id not in SPEC_BY_ID:
        raise SynthError(f"no generated sound with id {sound_id!r}")
    file, frames, sr, ch, orig_db, loop, recipe, kw = SPEC_BY_ID[sound_id]
    if seed is None:
        seed = seed_for(file)
    elif isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= MAX_SEED:
        raise SynthError(f"seed must be a whole number from 0 to {MAX_SEED}")
    if duration is None:
        duration = min(frames / sr, MAX_SECONDS)
    duration = _check("duration", ("float", MIN_SECONDS, MAX_SECONDS), duration)
    rules, kw = PARAMS[recipe.__name__], dict(kw)
    for name, value in (params or {}).items():
        if name not in rules:
            raise SynthError(f"{recipe.__name__} has no adjustable parameter {name!r}" +
                             (f" (allowed: {', '.join(rules)})" if rules else ""))
        kw[name] = _check(name, rules[name], value)
    n = frames if abs(duration - frames / sr) < 0.5 / sr else int(round(duration * sr))
    return (file, n, sr, ch, orig_db, loop, recipe, kw), seed


def wav_bytes(entry: tuple, seed: int) -> bytes:
    """Render one planned sound to 16-bit PCM WAV bytes (one render at a time)."""
    with LOCK:
        pcm = to_pcm16(render(entry, seed))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(pcm.shape[1]); w.setsampwidth(2); w.setframerate(entry[2])
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
