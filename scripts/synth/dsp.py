"""DSP building blocks for the generated sounds (numpy only, deterministic given the Generator passed in).

Loops are made periodic *by construction*: noise is synthesised in the frequency domain over exactly n samples
(an inverse FFT is n-periodic), modulation uses a whole number of cycles over n, and events (wave swells, chime
strikes, bubbles) are rendered into a circular buffer so a tail that runs past the end continues at the start.
One-shots start and end at silence. Everything works on float64 arrays in -1..1.
"""
import numpy as np

TAU = 2 * np.pi


# --- noise and spectra -------------------------------------------------------------------------------------------
def fft_noise(n, sr, rng, shape):
    """n-periodic noise with magnitude spectrum shape(freqs) (freqs in Hz), unit RMS."""
    f = np.fft.rfftfreq(n, 1 / sr)
    spec = (rng.standard_normal(f.size) + 1j * rng.standard_normal(f.size)) * shape(np.maximum(f, 1e-3))
    spec[0] = 0
    x = np.fft.irfft(spec, n)
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-20)


def colour(slope):
    """Power-law magnitude: slope 0 white, -0.5 pink, -1 brown."""
    return lambda f: f ** slope


def band(lo, hi, order=2):
    """Smooth band-pass magnitude (Butterworth-like) between lo and hi Hz; lo=0 means low-pass."""
    def g(f):
        hp = 1.0 if lo <= 0 else 1 / np.sqrt(1 + (lo / f) ** (2 * order))
        lp = 1 / np.sqrt(1 + (f / hi) ** (2 * order))
        return hp * lp
    return g


def peak(fc, q):
    """Resonant peak (magnitude ~1 at fc, bandwidth fc/q)."""
    return lambda f: 1 / np.sqrt(1 + (q * (f / fc - fc / f)) ** 2)


def mul(*gs):
    return lambda f: np.prod([g(f) for g in gs], axis=0)


def fft_filter(x, sr, shape, circular=True):
    """Filter x by a zero-phase magnitude response (circular: keeps loops periodic)."""
    n = x.size if circular else int(2 ** np.ceil(np.log2(x.size * 2)))
    f = np.fft.rfftfreq(n, 1 / sr)
    y = np.fft.irfft(np.fft.rfft(x, n) * shape(np.maximum(f, 1e-3)), n)
    return y[:x.size]


# --- envelopes ---------------------------------------------------------------------------------------------------
def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def periodic_lfo(n, rng, cycles, depth=1.0):
    """Sum of sinusoids with whole numbers of cycles over n samples, scaled to 0..1 (n-periodic)."""
    t = np.arange(n) / n
    y = sum(rng.uniform(0.5, 1) * np.sin(TAU * c * t + rng.uniform(0, TAU)) for c in cycles)
    y = (y - y.min()) / (np.ptp(y) + 1e-20)
    return 1 - depth + depth * y


def swell(length, sr, rise, fall):
    """One wave/gust: smooth rise over `rise` s, then an exponential fall reaching 0 at the end."""
    t = np.arange(length) / sr
    up = smoothstep(t / rise)
    down = np.exp(-np.maximum(t - rise, 0) / (fall / 3))
    return up * down * (1 - smoothstep((t - (length / sr - 0.15 * fall)) / (0.15 * fall)))


def adsr(n, sr, a, d, s, r):
    t = np.arange(n) / sr
    dur = n / sr
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    return env * (1 - smoothstep((t - (dur - r)) / max(r, 1e-6)))


# --- rendering ---------------------------------------------------------------------------------------------------
def add_circular(out, sig, pos):
    """Add sig into out starting at pos, wrapping around the end (for loops)."""
    n = out.size
    pos %= n
    while sig.size:
        k = min(sig.size, n - pos)
        out[pos:pos + k] += sig[:k]
        sig, pos = sig[k:], 0


def add_at(out, sig, pos):
    """Add sig into out at pos, cutting what runs past the end (for one-shots)."""
    k = max(0, min(sig.size, out.size - pos))
    out[pos:pos + k] += sig[:k]


def partials(n, sr, freqs, amps, decays, attack=0.002, phases=None, glide=0.0):
    """Decaying sinusoids (bells, tubes, plucks). glide: relative pitch drift per second (negative = falls)."""
    t = np.arange(n) / sr
    y = np.zeros(n)
    for i, (f, a, d) in enumerate(zip(freqs, amps, decays)):
        if f >= sr / 2 * 0.95:
            continue
        ph = 0.0 if phases is None else phases[i]
        inst = f * (1 + glide * t)
        y += a * np.exp(-t / d) * np.sin(TAU * np.cumsum(inst) / sr + ph)
    return y * smoothstep(t / attack)


def karplus(f0, n, sr, rng, decay=0.996, bright=0.5, pluck_pos=0.2):
    """Plucked string (Karplus-Strong), vectorised one period at a time."""
    p = max(2, int(round(sr / f0)))
    exc = rng.uniform(-1, 1, p)
    exc = fft_filter(exc, sr, band(0, 800 + 9000 * bright), circular=True)
    exc -= np.roll(exc, int(p * pluck_pos))           # pluck position comb
    y = np.zeros(n + p + 1)
    y[1:p + 1] = exc
    s = p + 1
    while s < y.size:
        k = min(p, y.size - s)
        y[s:s + k] = decay * 0.5 * (y[s - p:s - p + k] + y[s - p - 1:s - p - 1 + k])
        s += k
    return y[1:n + 1] / (np.abs(exc).max() + 1e-20)


def saw_additive(f, n, sr, t_offset=0.0, vib=None, odd_only=False, tilt=1.0):
    """Band-limited saw/square from harmonics; vib: per-sample relative pitch deviation array."""
    t = np.arange(n) / sr
    inst = f * (1 + (0 if vib is None else vib))
    phase = TAU * np.cumsum(inst) / sr + t_offset
    y = np.zeros(n)
    k = 1
    while k * f * 1.02 < sr / 2 * 0.9:
        if not (odd_only and k % 2 == 0):
            y += np.sin(k * phase) / k ** tilt
        k += 1
    return y


def reverb_ir(sr, rng, length, decay, lowpass=6000):
    n = int(length * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-t / (decay / 6.9))
    ir = fft_filter(ir, sr, band(0, lowpass), circular=False)
    return ir / np.sqrt(np.sum(ir ** 2))


def convolve(x, ir, circular):
    if circular:
        return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, x.size), x.size)
    m = int(2 ** np.ceil(np.log2(x.size + ir.size)))
    return np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[:x.size]


def room(x, sr, rng, wet=0.25, length=1.2, decay=1.0, circular=False):
    """Mono in, stereo out: dry signal plus decorrelated reverb per channel."""
    out = []
    for _ in range(2):
        ir = reverb_ir(sr, rng, min(length, x.size / sr * 0.9), decay)
        out.append(x + wet * convolve(x, ir, circular))
    return np.stack(out)


# --- finishing ---------------------------------------------------------------------------------------------------
def oneshot_edges(x, sr, fade_in=0.002, fade_out=0.06):
    """Start and end exactly at silence."""
    n = x.shape[-1]
    t = np.arange(n) / sr
    g = smoothstep(t / fade_in) * (1 - smoothstep((t - (n / sr - fade_out)) / fade_out))
    g[0] = 0.0
    g[-1] = 0.0
    return x * g


def normalise(x, target_db, peak_db=-1.0):
    """Scale to target RMS (dBFS), but never above peak_db."""
    rms = np.sqrt(np.mean(x ** 2)) + 1e-20
    g = 10 ** (target_db / 20) / rms
    pk = np.abs(x).max() * g
    lim = 10 ** (peak_db / 20)
    if pk > lim:
        g *= lim / pk
    return x * g
