// Regenerate static/catalog_data.js from the WAV files under audio/ (reads each RIFF header: channels, rate, length).
// Usage: node scripts/make_catalog.mjs          (writes the file)
//        node scripts/make_catalog.mjs --check  (exit 1 if the committed file is out of date; used by the tests)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'catalog_data.js');

// Files at the top of audio/ are sorted into categories by hand (from their names); folders map directly.
const FOLDER_CAT = { bells_chimes: 'bells', ocean_sounds: 'water', whitenoise: 'noise', 'Korg-DS-8-Sci-Fi-Sound-Effects-Pack': 'scifi' };
const LOOSE = {
  'Water-Drop': ['water', 'Water drop', ''],
  'Kawai-K5000W-Thunder': ['weather', 'Thunder', 'Kawai K5000W'],
  'Ensoniq-ESQ-1-Wind': ['weather', 'Wind', 'Ensoniq ESQ-1'],
  'Alesis-Sanctuary-QCard-Wind': ['weather', 'Wind', 'Alesis Sanctuary QCard'],
  'Casio-MT-600-Typhoon-Sound': ['weather', 'Typhoon', 'Casio MT-600'],
  'Alesis-Fusion-Acoustic-Bass-C2': ['instruments', 'Acoustic bass C2', 'Alesis Fusion'],
  'Casio-VZ-10M-Buzzy-Deep-Bass-C1': ['instruments', 'Buzzy deep bass C1', 'Casio VZ-10M'],
  'Roland-U-220-Unconvincing-Guitar-C4': ['instruments', 'Unconvincing guitar C4', 'Roland U-220'],
  'E-Mu-Proteus-2-Flute-C5': ['instruments', 'Flute C5', 'E-mu Proteus 2'],
  'Alesis-Fusion-Sitar-C4': ['instruments', 'Sitar C4', 'Alesis Fusion'],
  'Bowed-Bass-C2': ['instruments', 'Bowed bass C2', ''],
  'Alesis-S4-Plus-Bari-Sax-C2': ['instruments', 'Baritone sax C2', 'Alesis S4 Plus'],
  'Casio-VZ-10M-Astral-C2': ['instruments', 'Astral C2', 'Casio VZ-10M'],
  'E-Mu-Proteus-FX-Wacky-Snare': ['instruments', 'Wacky snare', 'E-mu Proteus FX'],
  'Korg-M1-Drop': ['instruments', 'Drop', 'Korg M1'],
};
const NAMED = {   // display names inside folders, where the file name alone reads badly
  whitenoise: ['White noise', ''], whitenoisegaussian: ['White noise (Gaussian)', ''], pinknoise: ['Pink noise', ''],
  oceano: ['Oceano', ''], 'Digital-Seashore': ['Digital seashore', ''], 'Flowing-Water': ['Flowing water', ''],
  'Kawai-K11-Seashore': ['Seashore', 'Kawai K11'], 'Korg-N1R-Seashore': ['Seashore', 'Korg N1R'],
  'Roland-SC-88-Seashore': ['Seashore', 'Roland SC-88'],
  'water-oceans-and-seas-ocean-waves-strong-tide': ['Ocean waves, strong tide', ''],
  'water-sounds-ocean-ocean-waves-40': ['Ocean waves 40', ''], 'water-sounds-ocean-ocean-waves-62': ['Ocean waves 62', ''],
  'water-sounds-ocean-ocean-waves-66': ['Ocean waves 66', ''],
  'Casio-MT-600-Synth-Bells-C3': ['Synth bells C3', 'Casio MT-600'], 'Ensoniq-ESQ-1-Wave-Bell-C4': ['Wave bell C4', 'Ensoniq ESQ-1'],
  Gong: ['Gong', ''], 'bellschimes-plastic-mallet-dinging-steel-tube': ['Plastic mallet on steel tube', ''],
};

export function wavInfo(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let p = 12, fmt = null, dataBytes = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') { dataBytes = Math.min(size, buf.length - p - 8); break; }
    p += 8 + size + (size & 1);
  }
  if (!fmt) throw new Error('no fmt chunk');
  return { ...fmt, dur: dataBytes / (fmt.ch * fmt.bits / 8) / fmt.sr };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
}

// Sounds made by scripts/synth_sounds.py: { "<path under audio/>": { name, how } } (name overrides the display name).
const GENERATED = JSON.parse(readFileSync(join(ROOT, 'audio', 'generated.json'), 'utf8'));

export function buildCatalog() {
  const files = walk(join(ROOT, 'audio')).filter(f => f.toLowerCase().endsWith('.wav')).map(f => relative(ROOT, f).split('\\').join('/'));
  const out = [];
  for (const file of files) {
    const stem = basename(file, '.wav'), folder = file.split('/').length > 2 ? file.split('/')[1] : '';
    let cat, name, source;
    if (!folder) [cat, name, source] = LOOSE[stem] || ['instruments', stem.replace(/[-_]/g, ' '), ''];
    else {
      cat = FOLDER_CAT[folder] || 'instruments';
      if (/^\d+$/.test(stem)) [name, source] = [`Chime ${stem}`, ''];
      else if (/^glitch\d+$/.test(stem)) [name, source] = [`Glitch ${stem.slice(6)}`, 'Korg DS-8'];
      else [name, source] = NAMED[stem] || [stem.replace(/[-_]/g, ' '), ''];
    }
    const id = (/^\d+$/.test(stem) ? `chime-${stem}` : stem.toLowerCase().replace(/^water-sounds-ocean-|^water-oceans-and-seas-/, '')
      .replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '');
    const info = wavInfo(readFileSync(join(ROOT, file)));
    const gen = GENERATED[file.replace(/^audio\//, '')];
    if (gen) { name = gen.name || name; source = 'soundTest synth'; }
    out.push({ id, file, name, source, cat, origin: gen ? 'original' : 'third-party', how: gen ? gen.how : '', dur: +info.dur.toFixed(2), ch: info.ch, sr: info.sr, kb: Math.round(statSync(join(ROOT, file)).size / 1024) });
  }
  const num = s => s.replace(/\d+/g, d => d.padStart(4, '0'));
  out.sort((a, b) => a.cat.localeCompare(b.cat) || num(a.name).localeCompare(num(b.name)) || a.id.localeCompare(b.id));
  const ids = new Set(out.map(s => s.id));
  if (ids.size !== out.length) throw new Error('duplicate sound ids');
  return out;
}

export function render(list) {
  return '// GENERATED by scripts/make_catalog.mjs from the WAV headers under audio/ — do not edit by hand.\n' +
    '// id, file, name, source, cat, origin (original = generated by scripts/synth_sounds.py, else third-party), how (synthesis),\n' +
    '// dur (s), ch, sr, kb\n' +
    'export const SOUNDS = [\n' + list.map(s => '  ' + JSON.stringify(s) + ',').join('\n') + '\n];\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render(buildCatalog());
  if (process.argv.includes('--check')) {
    const cur = readFileSync(OUT, 'utf8');
    if (cur !== text) { console.error('static/catalog_data.js is out of date: run node scripts/make_catalog.mjs'); process.exit(1); }
    console.log('catalog current');
  } else { writeFileSync(OUT, text); console.log(`wrote ${OUT}`); }
}
