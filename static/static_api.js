// Static site (GitHub Pages, window.APP_STATIC): answers api(path) without the Python app. Catalogue and synth
// listings come from api/*.json (written by scripts/export_api.py from the real API); /analyse/<id> runs
// static/analysis.js on the decoded sound in the browser; generating sounds needs the Python app.
import { analyse } from './analysis.js';
import { decodeForAnalysis } from './decode.js';

const json = name => fetch(`api/${name}.json`).then(r => {
  if (!r.ok) throw new Error(`${r.status} loading api/${name}.json`);
  return r.json();
});

export class NeedsServer extends Error {}

export async function staticApi(path, body) {
  const [route, qs] = path.split('?');
  const q = new URLSearchParams(qs || ''), parts = route.split('/').filter(Boolean);
  if (body) throw new NeedsServer('Generating sounds needs the local Python app (python run_web.py).');
  if (parts[0] === 'info' || (parts[0] === 'synth' && parts.length === 1)) return json(parts[0]);
  if (parts[0] === 'sounds') {
    const all = await json('sounds');
    if (parts.length === 1) return all;
    const s = all.sounds.find(x => x.id === parts[1]);
    if (!s) throw new Error(`404 no sound ${parts[1]}`);
    return s;
  }
  if (parts[0] === 'analyse' && parts[1]) {
    const s = (await json('sounds')).sounds.find(x => x.id === parts[1]);
    if (!s) throw new Error(`404 no sound ${parts[1]}`);
    const { channels, rate, format } = await decodeForAnalysis(s);
    const num = (k, d) => +(q.get(k) || d);
    return { id: s.id, source: format, ...analyse(channels, rate, { bins: num('bins', 600), nfft: num('nfft', 2048), bands: num('bands', 96) }) };
  }
  throw new Error(`404 ${path} is not available on the static site`);
}
