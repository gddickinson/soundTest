"""Recipes for noise, water, ocean, wind and weather. Each returns a (channels, n) float array.
Loop recipes are n-periodic by construction (see dsp.py); one-shot recipes decay to silence."""
import numpy as np

from .dsp import (add_at, add_circular, band, colour, fft_filter, fft_noise, mul, partials, peak, periodic_lfo,
                  room, smoothstep, swell)


def _chan(ch, make):
    return np.stack([make(c) for c in range(ch)])


# --- noise ---------------------------------------------------------------------------------------------------------
def white_uniform(n, sr, ch, rng):
    return _chan(ch, lambda c: rng.uniform(-1, 1, n))


def white_gauss(n, sr, ch, rng):
    return _chan(ch, lambda c: np.clip(rng.standard_normal(n), -4, 4))


def pink(n, sr, ch, rng):
    return _chan(ch, lambda c: fft_noise(n, sr, rng, mul(colour(-0.5), band(15, 20000, 1))))


# --- ocean ---------------------------------------------------------------------------------------------------------
def _wave_envelope(n, sr, rng, period, spread, rise, fall, calm):
    """Circular sum of wave swells: one every `period` +- spread seconds, random heights."""
    env = np.zeros(n)
    total = n / sr
    count = max(1, int(round(total / period)))
    times = (np.arange(count) * total / count + rng.uniform(-spread, spread, count)) % total
    for t in times:
        r, f = rise * rng.uniform(0.7, 1.3), fall * rng.uniform(0.7, 1.4)
        add_circular(env, rng.uniform(0.55, 1.0) * swell(int((r + f) * sr), sr, r, f), int(t * sr))
    return calm + env


def ocean(n, sr, ch, rng, period=9.0, rise=2.2, fall=6.0, calm=0.18, cutoff=900, crash=0.8, foam=0.5):
    """Waves: a low roar always there, swelling; at each wave's peak a bright crash, then foam hiss draining away."""
    env = _wave_envelope(n, sr, rng, period, period * 0.25, rise, fall, calm)
    lag = int(0.35 * sr)                                  # the foam trails the crash
    foam_env = np.roll(env, lag) ** 1.5
    out = []
    for c in range(ch):
        roar = fft_noise(n, sr, rng, mul(colour(-0.8), band(25, cutoff, 2)))
        surf = fft_noise(n, sr, rng, mul(colour(-0.6), band(250, min(4500, sr * 0.45), 2)))
        hiss = fft_noise(n, sr, rng, mul(colour(-0.4), band(1800, min(8000, sr * 0.45), 2)))
        e = np.roll(env, int(c * 0.03 * sr))
        out.append(roar * e + crash * 0.7 * surf * e ** 2 + foam * hiss * np.roll(foam_env, int(c * 0.05 * sr)) * 0.2)
    return np.stack(out)


def seashore_synth(n, sr, ch, rng, waves=1, cutoff=1800, res=None, crash=0.6):
    """Synth-style seashore: a filtered-noise swell (one or more per loop), optionally with a resonant band."""
    t = np.arange(n) / n
    env = np.zeros(n)
    for k in range(waves):
        ph = (t - k / waves - rng.uniform(0, 0.1)) % 1
        env += rng.uniform(0.7, 1) * smoothstep(ph / 0.35) * (1 - smoothstep((ph - 0.35) / 0.6))
    env = 0.12 + env
    out = []
    for c in range(ch):
        g = mul(colour(-0.5), band(60, cutoff, 2))
        if res:
            g = (lambda g0, r: (lambda f: g0(f) * (0.5 + 2.5 * peak(r, 6)(f))))(g, res)
        body = fft_noise(n, sr, rng, g)
        top = fft_noise(n, sr, rng, mul(colour(-0.5), band(1200, min(6000, sr * 0.45), 2)))
        e = np.roll(env, int(c * 0.04 * sr))
        out.append(body * e + 0.4 * crash * top * e ** 2)
    return np.stack(out)


# --- water ---------------------------------------------------------------------------------------------------------
def bubble(sr, rng, f0, dur, rise=1.0, amp=1.0):
    """A bubble: a sine whose pitch rises as it decays (Minnaert resonance)."""
    m = int(dur * sr)
    t = np.arange(m) / sr
    f = f0 * (1 + rise * t / dur)
    y = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t / (dur / 4)) * smoothstep(t / 0.0015)
    return amp * y


def flowing_water(n, sr, ch, rng, rate=70):
    out = []
    for c in range(ch):
        y = 0.2 * fft_noise(n, sr, rng, mul(colour(-0.6), band(250, 3000, 2))) * periodic_lfo(n, rng, [3, 7, 11], 0.5)
        for _ in range(int(rate * n / sr)):
            f0 = np.exp(rng.uniform(np.log(300), np.log(1600)))
            add_circular(y, bubble(sr, rng, f0, rng.uniform(0.012, 0.05), rng.uniform(0.3, 1.2), rng.uniform(0.1, 0.6)),
                         int(rng.uniform(0, n)))
        out.append(y)
    return np.stack(out)


def water_drop(n, sr, ch, rng):
    y = np.zeros(n)
    add_at(y, bubble(sr, rng, 1150, 0.11, 0.9, 1.0), int(0.01 * sr))
    add_at(y, bubble(sr, rng, 1650, 0.06, 0.7, 0.25), int(0.19 * sr))      # a smaller second drip
    add_at(y, 0.15 * fft_filter(rng.standard_normal(int(0.004 * sr)), sr, band(2000, 9000), False), int(0.01 * sr))
    return room(y, sr, rng, wet=0.35, length=0.7, decay=0.6)[:ch]


# --- wind and weather ----------------------------------------------------------------------------------------------
def wind(n, sr, ch, rng, centres=(320, 520, 760, 1100), q=9, gusts=(1, 2, 3, 5), whistle=1.0, body=0.6, air=0.25):
    """Gusty wind: resonant noise bands (the whistle/howl) whose levels drift with slow periodic gusts, over a
    broadband rumble that follows the overall gust level."""
    gust = periodic_lfo(n, rng, gusts, 0.8) ** 1.6
    out = []
    for c in range(ch):
        y = body * fft_noise(n, sr, rng, mul(colour(-0.9), band(30, 900, 2))) * gust
        for fc in centres:
            fc *= rng.uniform(0.95, 1.05)
            g = periodic_lfo(n, rng, [k + rng.integers(0, 3) for k in gusts], 0.9) ** 2
            y += whistle * fft_noise(n, sr, rng, mul(peak(fc, q), band(0, 2.5 * fc, 2))) * g * gust / len(centres) * 2
        y += air * fft_noise(n, sr, rng, mul(colour(-0.5), band(1500, min(6000, sr * 0.45), 2))) * gust ** 2
        out.append(y)
    return np.stack(out)


def typhoon(n, sr, ch, rng):
    """Storm: hard broadband wind with fast gusts, a howl, and dense rain patter."""
    base = wind(n, sr, ch, rng, centres=(280, 430, 610), q=5, gusts=(2, 3, 5, 7), whistle=0.8, body=1.0, air=0.25)
    for c in range(ch):
        rain = np.zeros(n)
        for _ in range(int(900 * n / sr)):
            add_circular(rain, rng.uniform(0.05, 0.4) * rng.standard_normal(int(0.002 * sr)) *
                         np.exp(-np.arange(int(0.002 * sr)) / (0.0006 * sr)), int(rng.uniform(0, n)))
        base[c] += 0.25 * fft_filter(rain, sr, band(1000, 6000, 2))
    return base


def thunder(n, sr, ch, rng):
    """A crack, then a rolling low rumble made of several decaying rolls, fading to silence."""
    t = np.arange(n) / sr
    out = []
    for c in range(ch):
        crack = fft_filter(rng.standard_normal(n), sr, band(800, 8000, 2), False) * np.exp(-t / 0.05) * smoothstep(t / 0.004)
        rumble_src = fft_noise(n, sr, rng, mul(colour(-1.0), band(18, 220, 2)))
        rolls = np.zeros(n)
        for k in range(6):
            t0 = rng.uniform(0.02, 1.6) * (1 + 0.3 * k / 6)
            rolls += rng.uniform(0.4, 1) * smoothstep((t - t0) / 0.12) * np.exp(-np.maximum(t - t0, 0) / rng.uniform(0.4, 1.1))
        mid = fft_noise(n, sr, rng, band(150, 900, 2)) * np.exp(-t / 0.6)
        out.append(0.5 * crack + 1.4 * rumble_src * rolls + 0.25 * mid)
    return np.stack(out)
