"""The 52 generated sounds. Lengths (frames), sample rates and channel counts are those of the WAVs they replace, so
durations, ids, mixes and share links are unchanged. `db` is the RMS target in dBFS: the replaced file's own RMS,
clamped to the library's usual range (-30..-12 dBFS); the peak is always kept at or below -1 dBFS.
`loop` sounds are seamless by construction; the others are one-shots that start and end in silence."""
from . import recipes_nature as N
from . import recipes_tonal as T
from .recipes_tonal import note

# file (under audio/), frames, rate, channels, original RMS dBFS, loop, recipe, settings
SPEC = [
    # noise
    ('whitenoise/whitenoise.wav', 441001, 44100, 1, -10.8, True, N.white_uniform, {}),
    ('whitenoise/whitenoisegaussian.wav', 441001, 44100, 1, -10.8, True, N.white_gauss, {}),
    ('whitenoise/pinknoise.wav', 441001, 44100, 1, -15.3, True, N.pink, {}),
    # ocean and water
    ('ocean_sounds/water-sounds-ocean-ocean-waves-40.wav', 6375936, 44100, 1, -19.3, True, N.ocean,
     dict(soft=True, period=10, rise=2.5, fall=6.5, calm=0.2, cutoff=900, crash=0.8, foam=0.5)),
    ('ocean_sounds/water-sounds-ocean-ocean-waves-62.wav', 5693952, 44100, 1, -29.1, True, N.ocean,
     dict(soft=True, period=12, rise=3.0, fall=8.0, calm=0.3, cutoff=500, crash=0.3, foam=0.25)),
    ('ocean_sounds/water-sounds-ocean-ocean-waves-66.wav', 1142272, 44100, 1, -18.7, True, N.ocean,
     dict(soft=True, period=8.5, rise=2.0, fall=5.5)),
    ('ocean_sounds/water-oceans-and-seas-ocean-waves-strong-tide.wav', 5276828, 44100, 1, -17.7, True, N.ocean,
     dict(soft=True, period=7, rise=1.6, fall=4.5, calm=0.25, cutoff=1300, crash=1.2, foam=0.8)),
    ('ocean_sounds/oceano.wav', 55359, 11025, 1, -19.8, True, N.seashore_synth, dict(waves=1, cutoff=1600, crash=0.5)),
    ('ocean_sounds/Kawai-K11-Seashore.wav', 163676, 44100, 2, -20.0, True, N.seashore_synth, dict(waves=1, cutoff=2500, crash=0.6)),
    ('ocean_sounds/Korg-N1R-Seashore.wav', 268728, 44100, 2, -22.2, True, N.seashore_synth,
     dict(waves=1, cutoff=1500, res=900, crash=0.4)),
    ('ocean_sounds/Roland-SC-88-Seashore.wav', 231299, 44100, 2, -18.2, True, N.seashore_synth, dict(waves=1, cutoff=3000, crash=0.8)),
    ('ocean_sounds/Digital-Seashore.wav', 666873, 44100, 1, -26.5, True, N.seashore_synth,
     dict(waves=2, cutoff=2000, res=1200, crash=0.5)),
    ('ocean_sounds/Flowing-Water.wav', 121985, 44100, 2, -15.4, True, N.flowing_water, {}),
    ('Water-Drop.wav', 43846, 44100, 2, -29.0, False, N.water_drop, {}),
    # wind and weather
    ('Ensoniq-ESQ-1-Wind.wav', 940225, 44100, 2, -18.4, True, N.wind,
     dict(soft=True, centres=(280, 420, 630, 900), q=12, gusts=(1, 2, 3, 4), whistle=1.2)),
    ('Alesis-Sanctuary-QCard-Wind.wav', 502727, 44100, 2, -18.2, True, N.wind,
     dict(soft=True, centres=(210, 330, 470), q=6, gusts=(1, 2, 3), whistle=0.7, body=0.9, air=0.03)),
    ('Casio-MT-600-Typhoon-Sound.wav', 168017, 44100, 2, -15.1, True, N.typhoon, dict(soft=True)),
    ('Kawai-K5000W-Thunder.wav', 148348, 44100, 2, -16.6, False, N.thunder, {}),
    # single chime strikes (one-shots)
    ('bells_chimes/0.wav', 88221, 44100, 2, -18.1, False, T.single_strikes, dict(notes=[81], times=[0.01], decay=0.7)),
    ('bells_chimes/1.wav', 362351, 44100, 2, -30.6, False, T.single_strikes,
     dict(notes=[74, 78, 81, 86, 83], times=[0.01, 0.6, 1.3, 2.1, 3.0], decay=1.6)),
    ('bells_chimes/2.wav', 163055, 44100, 2, -11.5, False, T.single_strikes,
     dict(notes=[79, 86], times=[0.01, 0.35], timbre='glass', decay=0.9, hardness=0.8)),
    ('bells_chimes/3.wav', 116975, 44100, 2, -15.9, False, T.single_strikes, dict(notes=[67], times=[0.01], decay=0.8)),
    # wind-chime sequences (loops)
    ('bells_chimes/4.wav', 1313903, 44100, 2, -28.9, True, T.chime_sequence,
     dict(scale='major_penta', root=72, density=0.6, decay=3.5, hardness=0.5)),
    ('bells_chimes/5.wav', 1130226, 44100, 1, -42.3, True, T.chime_sequence,
     dict(scale='sus', root=60, density=0.25, timbre='bowl', decay=6, beat=1.2)),
    ('bells_chimes/6.wav', 685950, 44100, 1, -22.8, True, T.chime_sequence,
     dict(scale='major_penta', root=84, density=1.2, timbre='glass', decay=1.5, hardness=0.8)),
    ('bells_chimes/7.wav', 479896, 44100, 1, -30.1, True, T.chime_sequence, dict(scale='minor_penta', root=69, density=0.9, decay=3)),
    ('bells_chimes/8.wav', 494010, 44100, 1, -30.8, True, T.chime_sequence,
     dict(scale='lydian', root=60, density=0.4, timbre='bell', decay=4)),
    ('bells_chimes/9.wav', 858167, 44100, 1, -24.7, True, T.chime_sequence, dict(scale='hirajoshi', root=74, density=0.7, decay=3.5)),
    ('bells_chimes/10.wav', 666208, 44100, 1, -30.8, True, T.chime_sequence,
     dict(scale='major_penta', root=55, density=0.4, decay=6, hardness=0.4)),
    ('bells_chimes/11.wav', 505302, 44100, 1, -23.8, True, T.chime_sequence,
     dict(scale='whole_tone', root=86, density=1.5, timbre='glass', decay=1.2)),
    ('bells_chimes/12.wav', 971084, 44100, 1, -24.6, True, T.chime_sequence,
     dict(scale='sus', root=67, density=0.6, decay=4, breeze=0.15)),
    ('bells_chimes/13.wav', 1355001, 44100, 1, -24.1, True, T.chime_sequence,
     dict(scale='minor_penta', root=57, density=0.2, timbre='bowl', decay=8, beat=0.8)),
    ('bells_chimes/14.wav', 2088960, 44100, 1, -20.3, True, T.chime_sequence,
     dict(scale='major_penta', root=64, density=0.5, decay=5)),
    ('bells_chimes/15.wav', 777243, 44100, 1, -31.1, True, T.chime_sequence,
     dict(scale='hirajoshi', root=67, density=0.3, timbre='bell', decay=5)),
    ('bells_chimes/16.wav', 1334299, 44100, 1, -26.8, True, T.chime_sequence,
     dict(scale='lydian', root=76, density=0.9, decay=2.5, breeze=0.1)),
    ('bells_chimes/17.wav', 1115551, 44100, 1, -33.9, True, T.chime_sequence,
     dict(scale='minor_penta', root=60, density=0.35, decay=6, hardness=0.45)),
    ('bells_chimes/18.wav', 846875, 44100, 1, -29.5, True, T.chime_sequence,
     dict(scale='major_penta', root=79, density=1.0, timbre='glass', decay=2)),
    ('bells_chimes/19.wav', 963725, 44100, 1, -21.8, True, T.chime_sequence,
     dict(scale='sus', root=62, density=0.35, timbre='bell', decay=4.5)),
    # bells (one-shots)
    ('bells_chimes/Casio-MT-600-Synth-Bells-C3.wav', 96355, 44100, 2, -19.8, False, T.fm_bell, dict(f0=note(48), decay=0.6)),
    ('bells_chimes/Ensoniq-ESQ-1-Wave-Bell-C4.wav', 121525, 44100, 2, -18.3, False, T.single_strikes,
     dict(notes=[60], times=[0.01], timbre='bell', decay=0.9)),
    ('bells_chimes/Gong.wav', 187423, 44100, 2, -17.1, False, T.gong, dict(f0=70, decay=1.1)),
    ('bells_chimes/bellschimes-plastic-mallet-dinging-steel-tube.wav', 121583, 44100, 2, -29.6, False, T.single_strikes,
     dict(notes=[84], times=[0.01], decay=0.8, hardness=0.3)),
    # instruments (one-shots)
    ('Alesis-Fusion-Acoustic-Bass-C2.wav', 127782, 44100, 2, -17.0, False, T.pluck,
     dict(f0=note(36), decay=0.998, bright=0.3, body=(98, 196), tone=700)),
    ('Casio-VZ-10M-Buzzy-Deep-Bass-C1.wav', 96522, 44100, 2, -9.3, False, T.buzzy_bass, {}),
    ('Roland-U-220-Unconvincing-Guitar-C4.wav', 173020, 44100, 2, -15.1, False, T.pluck,
     dict(f0=note(60), decay=0.996, bright=0.7, body=(110, 220, 480), tone=4000)),
    ('E-Mu-Proteus-2-Flute-C5.wav', 100911, 44100, 2, -5.8, False, T.flute, {}),
    ('Alesis-Fusion-Sitar-C4.wav', 106915, 44100, 2, -21.7, False, T.sitar, {}),
    ('Bowed-Bass-C2.wav', 148144, 44100, 2, -15.0, False, T.bowed_bass, {}),
    ('Alesis-S4-Plus-Bari-Sax-C2.wav', 81856, 44100, 2, -20.2, False, T.bari_sax, {}),
    ('Casio-VZ-10M-Astral-C2.wav', 284438, 44100, 2, -12.0, False, T.astral_pad, {}),
    ('E-Mu-Proteus-FX-Wacky-Snare.wav', 18131, 44100, 2, -19.5, False, T.wacky_snare, {}),
    ('Korg-M1-Drop.wav', 178370, 44100, 2, -27.9, False, T.synth_drop, {}),
]

RMS_RANGE = (-30.0, -12.0)
target_db = lambda orig: min(RMS_RANGE[1], max(RMS_RANGE[0], orig))

# Display names where the old name described the replaced recording (shown in the library; ids stay the same).
NAMES = {
    'ocean_sounds/Kawai-K11-Seashore.wav': 'Seashore (bright swell)',
    'ocean_sounds/Korg-N1R-Seashore.wav': 'Seashore (resonant)',
    'ocean_sounds/Roland-SC-88-Seashore.wav': 'Seashore (crashing)',
    'Ensoniq-ESQ-1-Wind.wav': 'Howling wind', 'Alesis-Sanctuary-QCard-Wind.wav': 'Low wind',
    'Roland-U-220-Unconvincing-Guitar-C4.wav': 'Guitar C4', 'Casio-VZ-10M-Astral-C2.wav': 'Astral pad C2',
    'Korg-M1-Drop.wav': 'Synth drop', 'Kawai-K5000W-Thunder.wav': 'Thunder', 'Casio-MT-600-Typhoon-Sound.wav': 'Typhoon',
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
_n = lambda m: f'{NOTE_NAMES[m % 12]}{m // 12 - 1}'
HOW = {
    'white_uniform': lambda k: 'uniform random samples', 'white_gauss': lambda k: 'Gaussian random samples',
    'pink': lambda k: 'noise shaped to 1/f in the frequency domain',
    'ocean': lambda k: f"filtered noise swelling in waves every ~{k['period']} s, with crash and foam layers",
    'seashore_synth': lambda k: 'filtered-noise swell' + (' with a resonant band' if k.get('res') else ''),
    'flowing_water': lambda k: 'hundreds of synthesised bubbles over filtered noise',
    'water_drop': lambda k: 'two synthesised bubbles (rising sine) in a small room',
    'wind': lambda k: 'resonant noise bands with slow periodic gusts',
    'typhoon': lambda k: 'gusting noise bands plus synthesised rain patter',
    'thunder': lambda k: 'noise crack and low rolling rumble',
    'single_strikes': lambda k: f"{k.get('timbre', 'tube')} model struck at {', '.join(_n(m) for m in k['notes'])}",
    'chime_sequence': lambda k: f"wind chimes: {k.get('timbre', 'tube')} model, {k['scale'].replace('_penta', '_pentatonic').replace('_', ' ')} on {_n(k['root'])}",
    'fm_bell': lambda k: 'FM synthesis', 'gong': lambda k: '48 inharmonic partials with bloom',
    'pluck': lambda k: 'plucked-string model (Karplus-Strong)', 'sitar': lambda k: 'plucked string with buzzing bridge',
    'buzzy_bass': lambda k: 'additive saw, saturated', 'flute': lambda k: 'additive tone with breath noise and vibrato',
    'bowed_bass': lambda k: 'additive tone with body formants and bow noise',
    'bari_sax': lambda k: 'additive tone with reed formants and breath',
    'astral_pad': lambda k: 'six detuned additive voices', 'wacky_snare': lambda k: 'noise rattle, falling tone and boing',
    'synth_drop': lambda k: 'falling sine bloop with ping-pong echo',
}
