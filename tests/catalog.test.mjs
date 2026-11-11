// The generated sound list matches the WAV files in audio/ (every file listed once, header data current).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, render } from '../scripts/make_catalog.mjs';
import { readFileSync } from 'node:fs';
import { SOUNDS, CATEGORIES, search, defaultMode } from '../static/catalog.js';

test('static/catalog_data.js is current (run node scripts/make_catalog.mjs if not)', () => {
  const text = readFileSync(new URL('../static/catalog_data.js', import.meta.url), 'utf8');
  assert.equal(text, render(buildCatalog()));
});

test('88 sounds in 6 categories, each category used', () => {
  assert.equal(SOUNDS.length, 88);
  for (const c of CATEGORIES) assert.ok(SOUNDS.some(s => s.cat === c.key), c.key);
  assert.ok(SOUNDS.every(s => CATEGORIES.some(c => c.key === s.cat)));
});

test('search and default modes', () => {
  assert.equal(search('', 'bells').length, 24);
  assert.deepEqual(search('pink').map(s => s.id), ['pinknoise']);
  assert.ok(search('seashore').length >= 4);
  assert.equal(search('korg ds-8').length, 36);
  assert.equal(defaultMode(SOUNDS.find(s => s.id === 'ocean-waves-40')), 'loop');
  assert.equal(defaultMode(SOUNDS.find(s => s.id === 'water-drop')), 'scatter');
});
