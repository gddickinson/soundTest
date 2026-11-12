"""Recipes for bells, chimes and instruments. Each returns a (channels, n) float array."""
import numpy as np

from .dsp import (TAU, add_at, add_circular, band, colour, convolve, fft_filter, fft_noise, karplus, mul, partials,
                  peak, periodic_lfo, room, smoothstep)

# Partial ratios (to the strike note) and relative amplitude/decay, per struck-metal timbre.
TIMBRES = {
    'tube': ([1, 2.756, 5.404, 8.933], [1, 0.5, 0.25, 0.12], [1, 0.45, 0.22, 0.1]),           # free-free bar
    'bell': ([0.5, 1, 1.183, 1.506, 2, 2.514, 3.011, 4.166], [0.45, 1, 0.6, 0.4, 0.5, 0.25, 0.2, 0.1],
             [1.6, 1, 0.8, 0.6, 0.55, 0.35, 0.3, 0.2]),                                         # church-bell series
    'bowl': ([1, 2.71, 5.12, 8.3], [1, 0.45, 0.2, 0.08], [1, 0.6, 0.35, 0.2]),                 # singing bowl
    'glass': ([1, 2.92, 5.81], [1, 0.35, 0.12], [1, 0.4, 0.2]),                                # small bright chime
}
SCALES = {
    'major_penta': [0, 2, 4, 7, 9], 'minor_penta': [0, 3, 5, 7, 10], 'hirajoshi': [0, 2, 3, 7, 8],
    'whole_tone': [0, 2, 4, 6, 8, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11], 'sus': [0, 2, 5, 7, 10],
}
note = lambda midi: 440.0 * 2 ** ((midi - 69) / 12)


def strike(sr, rng, f0, timbre, decay, hardness=0.6, beat=0.0):
    """One struck tube/bell/bowl: decaying inharmonic partials (pairs `beat` Hz apart shimmer), mallet click."""
    ratios, amps, decs = TIMBRES[timbre]
    m = int(min(decay * 5, 30) * sr)
    fr, am, de, ph = [], [], [], []
    for r, a, d in zip(ratios, amps, decs):
        a *= hardness ** max(0, np.log2(r))           # softer mallet = weaker upper partials
        for s in ((-1, 1) if beat else (0,)):
            fr.append(f0 * r + s * beat * r ** 0.5); am.append(a / (2 if beat else 1)); de.append(decay * d)
            ph.append(rng.uniform(0, TAU))
    y = partials(m, sr, fr, am, de, attack=0.0015, phases=ph)
    k = int(0.003 * sr)
    y[:k] += 0.2 * hardness * rng.standard_normal(k) * np.exp(-np.arange(k) / (0.0008 * sr))
    return y


def chime_sequence(n, sr, ch, rng, scale='major_penta', root=72, octaves=2, density=0.8, timbre='tube', decay=3.0,
                   hardness=0.6, beat=0.0, wet=0.3, breeze=0.0, clusters=True):
    """Wind chimes: strikes come in gusts (clusters) and pick notes from a scale; rendered circularly (loops)."""
    total = n / sr
    y = np.zeros(n)
    count = max(1, int(density * total))
    if clusters:
        centres = rng.uniform(0, total, max(1, count // 4))
        times = (rng.choice(centres, count) + rng.normal(0, 0.6, count)) % total
    else:
        times = rng.uniform(0, total, count)
    degrees = [d + 12 * o for o in range(octaves) for d in SCALES[scale]]
    for t in times:
        f0 = note(root + rng.choice(degrees))
        add_circular(y, rng.uniform(0.3, 1.0) * strike(sr, rng, f0, timbre, decay * rng.uniform(0.8, 1.2), hardness, beat),
                     int(t * sr))
    st = room(y, sr, rng, wet=wet, length=2.0, decay=2.2, circular=True)
    if breeze:
        g = periodic_lfo(n, rng, [1, 2, 3], 0.7)
        st = st + breeze * np.stack([fft_noise(n, sr, rng, mul(colour(-0.7), band(80, 3000, 2))) * g for _ in range(2)])
    return st if ch == 2 else st[:1]


def single_strikes(n, sr, ch, rng, notes, times, timbre='tube', decay=1.0, hardness=0.6, beat=0.0, wet=0.2):
    """One or a few strikes in a clip that ends in silence (a one-shot)."""
    y = np.zeros(n)
    for m, t in zip(notes, times):
        add_at(y, strike(sr, rng, note(m), timbre, decay, hardness, beat), int(t * sr))
    return room(y, sr, rng, wet=wet, length=1.0, decay=1.0)[:ch]


def fm_bell(n, sr, ch, rng, f0=note(48), ratio=3.5, index=8.0, decay=0.7):
    """Classic FM bell: carrier at f0, modulator at an inharmonic ratio, brightness (index) dying away."""
    t = np.arange(n) / sr
    i = index * np.exp(-t / (decay * 0.5))
    y = np.sin(TAU * f0 * t + i * np.sin(TAU * f0 * ratio * t)) * np.exp(-t / decay) * smoothstep(t / 0.002)
    return room(y, sr, rng, wet=0.25, length=1.0, decay=1.2)[:ch]


def gong(n, sr, ch, rng, f0=110.0, count=48, decay=1.6):
    """Gong: dozens of inharmonic partials; the upper ones bloom after the strike, pitch sags a little."""
    t = np.arange(n) / sr
    y = np.zeros(n)
    for k in range(count):
        f = f0 * np.exp(rng.uniform(0, np.log(28)))
        bloom = 1 - np.exp(-t / (0.02 + 0.25 * (f / (28 * f0))))
        inst = f * (1 - 0.004 * (1 - np.exp(-t / 0.8)))
        y += rng.uniform(0.2, 1) * (f0 / f) ** 0.35 * bloom * np.exp(-t / (decay * rng.uniform(0.5, 1.2))) * \
            np.sin(TAU * np.cumsum(inst) / sr + rng.uniform(0, TAU))
    y += 0.3 * fft_filter(rng.standard_normal(n), sr, band(60, 400), False) * np.exp(-t / 0.08)
    return room(y, sr, rng, wet=0.3, length=1.5, decay=1.6)[:ch]


# --- instruments ---------------------------------------------------------------------------------------------------
def harmonic_tone(f0, n, sr, rng, amp, dec=None, vib=(0, 0), attack=0.01, release=0.2, sustain_to=None):
    """Additive tone: harmonic k has level amp(k, k*f0) and, if dec is given, decays with time constant dec(k)."""
    t = np.arange(n) / sr
    v = vib[1] * np.sin(TAU * vib[0] * t + rng.uniform(0, TAU)) * smoothstep(t / 0.4)
    phase = TAU * np.cumsum(f0 * (1 + v)) / sr
    y = np.zeros(n)
    k = 1
    while k * f0 < sr * 0.45:
        e = 1.0 if dec is None else np.exp(-t / dec(k))
        y += amp(k, k * f0) * e * np.sin(k * phase + rng.uniform(0, TAU))
        k += 1
    end = n / sr if sustain_to is None else sustain_to
    return y * smoothstep(t / attack) * (1 - smoothstep((t - (end - release)) / release))


def pluck(n, sr, ch, rng, f0, decay=0.997, bright=0.5, body=None, wet=0.15, tone=None):
    y = karplus(f0, n, sr, rng, decay, bright)
    if tone:
        y = fft_filter(y, sr, band(0, tone, 2), False)
    if body:
        y = fft_filter(y, sr, lambda f: 0.6 + sum(1.2 * peak(b, 4)(f) for b in body), False)
    return room(y, sr, rng, wet=wet, length=0.8, decay=0.8)[:ch]


def sitar(n, sr, ch, rng, f0=note(60)):
    """Plucked string with a buzzing bridge (waveshaped, bright) and sympathetic strings ringing on."""
    y = fft_filter(karplus(f0, n, sr, rng, 0.9975, 0.8), sr, band(0, 5000, 1), False)
    buzz = fft_filter(np.tanh(5 * y) - np.tanh(5 * np.roll(y, 1)), sr, band(1500, 9000, 1), False)
    t = np.arange(n) / sr
    symp = sum(partials(n, sr, [note(m) * h for h in (1, 2, 3)], [0.05, 0.03, 0.02], [1.5, 1.0, 0.7], attack=0.05)
               for m in (60, 67, 72, 76))
    out = y + 0.2 * buzz * np.exp(-t / 0.9) + symp
    return room(out, sr, rng, wet=0.2, length=1.0, decay=1.0)[:ch]


def buzzy_bass(n, sr, ch, rng, f0=note(24)):
    amp = lambda k, f: (1 / k ** 0.8) * (1 if k % 2 else 0.7) / (1 + (f / 1500) ** 2)
    y = np.tanh(1.8 * harmonic_tone(f0, n, sr, rng, amp, dec=lambda k: 1.2 / (1 + 0.12 * k), attack=0.005, release=0.15))
    return room(y, sr, rng, wet=0.1, length=0.5, decay=0.5)[:ch]


def flute(n, sr, ch, rng, f0=note(72)):
    amp = lambda k, f: [1, 0.35, 0.12, 0.05, 0.02][k - 1] if k <= 5 else 0
    y = harmonic_tone(f0, n, sr, rng, amp, vib=(5.0, 0.004), attack=0.08, release=0.25)
    t = np.arange(n) / sr
    breath = fft_filter(rng.standard_normal(n), sr, lambda f: peak(f0, 3)(f) + 0.5 * peak(2 * f0, 4)(f), False)
    breath *= (0.06 + 0.25 * np.exp(-t / 0.08)) * (1 - smoothstep((t - (n / sr - 0.25)) / 0.25))
    return room(y + breath * 0.3, sr, rng, wet=0.3, length=1.2, decay=1.2)[:ch]


def bowed_bass(n, sr, ch, rng, f0=note(36)):
    formant = lambda f: (0.1 + peak(220, 2)(f) + 0.5 * peak(600, 3)(f)) / (1 + (f / 900) ** 2)
    y = harmonic_tone(f0, n, sr, rng, lambda k, f: formant(f) / k ** 1.2, vib=(5.5, 0.005), attack=0.25, release=0.35)
    t = np.arange(n) / sr
    bow = fft_filter(rng.standard_normal(n), sr, band(150, 1200), False) * 0.012 * (1 - smoothstep((t - (n / sr - 0.35)) / 0.35))
    return room(y + bow, sr, rng, wet=0.25, length=1.2, decay=1.4)[:ch]


def bari_sax(n, sr, ch, rng, f0=note(36)):
    formant = lambda f: (0.05 + peak(520, 2.5)(f) + 0.6 * peak(1450, 3)(f) + 0.2 * peak(2600, 4)(f)) / (1 + (f / 3500) ** 2)
    y = harmonic_tone(f0, n, sr, rng, lambda k, f: formant(f) / k ** 0.8, vib=(4.8, 0.006), attack=0.04, release=0.2)
    t = np.arange(n) / sr
    breath = fft_filter(rng.standard_normal(n), sr, band(800, 5000), False) * 0.05 * (1 - smoothstep((t - (n / sr - 0.2)) / 0.2))
    return room(np.tanh(0.8 * y / (np.abs(y).max() + 1e-9) * 2) + breath, sr, rng, wet=0.2, length=0.9, decay=0.9)[:ch]


def astral_pad(n, sr, ch, rng, f0=note(36)):
    """Pad: detuned voices on C, G, C an octave up, spread left/right, slow attack and a slowly opening tone."""
    t = np.arange(n) / sr
    open_ = 0.3 + 0.7 * smoothstep(t / (n / sr * 0.6))
    out = np.zeros((2, n))
    for i, (mult, det) in enumerate([(1, -0.007), (1, 0.006), (1.5, -0.004), (1.5, 0.005), (2, 0.0), (3, 0.003)]):
        amp = lambda k, f: (1 / k) * np.exp(-f / 2500)
        v = harmonic_tone(f0 * mult * (1 + det), n, sr, rng, amp, vib=(0.3 + 0.1 * i, 0.002), attack=0.9, release=1.6)
        out[i % 2] += v * open_ / (1 + 0.3 * i)
    shimmer = fft_noise(n, sr, rng, peak(note(84), 30)) * 0.02 * smoothstep(t / 2)
    out += shimmer
    return np.stack([c + 0.4 * convolve(c, _ir(sr, rng), False) for c in out])[:ch]


def _ir(sr, rng):
    from .dsp import reverb_ir
    return reverb_ir(sr, rng, 2.5, 3.0, 5000)


def wacky_snare(n, sr, ch, rng):
    t = np.arange(n) / sr
    rattle = fft_filter(rng.standard_normal(n), sr, band(1200, 9000), False) * np.exp(-t / 0.07)
    body = np.sin(TAU * np.cumsum(190 - 70 * (1 - np.exp(-t / 0.05))) / sr) * np.exp(-t / 0.06)
    boing = np.sin(TAU * np.cumsum(620 * (1 - 0.45 * t / t[-1]) * (1 + 0.08 * np.sin(TAU * 28 * t))) / sr) * np.exp(-t / 0.12) * 0.5
    y = (0.8 * rattle + body + boing) * smoothstep(t / 0.001)
    return room(y, sr, rng, wet=0.15, length=0.3, decay=0.3)[:ch]


def synth_drop(n, sr, ch, rng):
    """A falling 'bloop' with a ping-pong echo."""
    m = int(0.35 * sr)
    t = np.arange(m) / sr
    f = 180 + 760 * np.exp(-t / 0.06)
    b = (np.sin(TAU * np.cumsum(f) / sr) + 0.3 * np.sin(2 * TAU * np.cumsum(f) / sr)) * np.exp(-t / 0.09) * smoothstep(t / 0.002)
    out = np.zeros((2, n))
    d = int(0.32 * sr)
    for k in range(10):
        add_at(out[k % 2], b * 0.55 ** k, int(0.01 * sr) + k * d)
    return np.stack([fft_filter(c, sr, band(0, 6000), False) for c in out])[:ch]
