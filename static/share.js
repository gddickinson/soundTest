// Share links: the mix lives in the URL hash (#/mixer?mix=v1~...), so a link reproduces it exactly.
import { encodeMix } from './mix_codec.js';

export const mixHash = mix => (mix.tracks.length ? '#/mixer?mix=' + encodeMix(mix) : '#/mixer');
export const shareUrl = mix => location.href.split('#')[0] + mixHash(mix);

// Keep the address bar in step with the mixer without reloading the page (replaceState fires no hashchange).
export function syncHash(mix) {
  const h = mixHash(mix);
  if (location.hash !== h) history.replaceState(null, '', h);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
