// Entry point: lazy page registry, the persistent player dock, keyboard shortcuts, background, remembered last mix.
import { start, route, lazy, app, $, isStatic } from './core.js';
import { engine } from './audio_engine.js';
import { rememberMix } from './store.js';
import { mountDock } from './dock.js';
import { installKeys } from './keys.js';
import { startBackground } from './bg.js';

const PAGES = { 'home.js': ['home'], 'mixer.js': ['mixer'], 'visual_page.js': ['visualiser'], 'presets_page.js': ['presets'],
  'sounds_page.js': ['sounds'], 'synth_page.js': ['synth'], 'credits.js': ['credits'], 'about.js': ['about'] };
lazy(Object.fromEntries(Object.entries(PAGES).flatMap(([file, names]) => names.map(n => [n, () => import('./' + file)]))));
route('notfound', () => { app().innerHTML = '<h1>Not found</h1><p><a href="#/">Back to the start</a></p>'; });

$('#mode').textContent = isStatic() ? 'everything runs in your browser (WebAudio)'
  : 'local app: mixer in your browser, catalogue, analysis and synthesis by the Python server';
let saveTimer = 0;
engine.addEventListener('change', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (engine.layers.length) rememberMix(engine.mix); }, 500);
});
mountDock($('#dock'));
installKeys();
startBackground($('#bg'));
start();
