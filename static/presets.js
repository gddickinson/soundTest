// Built-in mixes. Every layer is one of the repo's own WAVs (ids from catalog_data.js); checked by the node tests.
const L = (id, vol, pan = 0, extra = {}) => ({ id, vol, pan, mode: 'loop', ...extra });
const S = (id, vol, pan, every, chance) => ({ id, vol, pan, mode: 'scatter', every, chance });

export const PRESETS = [
  { key: 'night-tide', name: 'Night tide', blurb: 'The longest ocean-wave loop (2 min 25 s) over soft pink noise, with a slow chime now and then.',
    mix: { master: 0.8, tracks: [L('ocean-waves-40', 0.75), L('pinknoise', 0.1), S('chime-14', 0.35, -0.4, 14, 0.35),
      S('chime-17', 0.3, 0.45, 18, 0.3)] } },
  { key: 'wind-chimes', name: 'Wind chimes', blurb: 'A wind bed with short chimes scattered left and right, and a rare gong.',
    mix: { master: 0.8, tracks: [L('alesis-sanctuary-qcard-wind', 0.55), S('chime-0', 0.4, -0.6, 2, 0.4),
      S('chime-2', 0.35, 0.5, 2.5, 0.35), S('chime-3', 0.35, 0.1, 3, 0.3), S('gong', 0.25, 0, 30, 0.25)] } },
  { key: 'storm-coast', name: 'Storm coast', blurb: 'Strong tide, howling wind and distant thunder.',
    mix: { master: 0.8, tracks: [L('ocean-waves-strong-tide', 0.8), L('ensoniq-esq-1-wind', 0.35, 0.3),
      S('kawai-k5000w-thunder', 0.5, -0.3, 20, 0.4)] } },
  { key: 'deep-focus', name: 'Deep focus', blurb: 'Pink and Gaussian white noise with a quiet wave underneath.',
    mix: { master: 0.7, tracks: [L('pinknoise', 0.5), L('whitenoisegaussian', 0.08), L('ocean-waves-62', 0.3)] } },
  { key: 'rock-pool', name: 'Rock pool', blurb: 'Digital seashore, flowing water, water drops and a synth drop.',
    mix: { master: 0.8, tracks: [L('digital-seashore', 0.6), L('flowing-water', 0.35, -0.2),
      S('water-drop', 0.35, 0.4, 1.5, 0.45), S('korg-m1-drop', 0.15, -0.5, 6, 0.3)] } },
  { key: 'space-drift', name: 'Space drift', blurb: 'Two long Korg DS-8 glitches looped quietly, with an astral pad drifting by.',
    mix: { master: 0.7, tracks: [L('glitch24', 0.35), L('glitch12', 0.25, -0.5), S('casio-vz-10m-astral-c2', 0.35, 0.5, 9, 0.5),
      S('glitch30', 0.2, -0.2, 7, 0.3)] } },
];
export const preset = key => PRESETS.find(p => p.key === key);
