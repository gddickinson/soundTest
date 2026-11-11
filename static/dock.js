// The player bar fixed at the bottom of every page: play/pause, what is playing or loading, sleep timer, master volume.
import { esc } from './core.js';
import { engine } from './audio_engine.js';
import { pendingTotals, loader } from './loader.js';
import { fmtClock } from './sleep_fade.js';

export function mountDock(el) {
  el.innerHTML = `
    <button id="dock-play" class="dock-play" aria-label="Play">&#9654;</button>
    <div class="dock-info"><b id="dock-title">Nothing playing</b><span id="dock-sub" class="mute small"></span>
      <div class="dock-prog" hidden><i id="dock-bar"></i></div></div>
    <a class="dock-timer small" id="dock-timer" href="#/mixer?keep=1" hidden></a>
    <label class="dock-vol" for="dock-master"><span>Master</span>
      <input id="dock-master" type="range" min="0" max="1" step="0.01" value="${engine.masterVol}"></label>`;
  const play = el.querySelector('#dock-play'), title = el.querySelector('#dock-title'), sub = el.querySelector('#dock-sub');
  const prog = el.querySelector('.dock-prog'), bar = el.querySelector('#dock-bar'), timer = el.querySelector('#dock-timer');
  const vol = el.querySelector('#dock-master');
  play.addEventListener('click', () => engine.toggle());
  vol.addEventListener('input', () => engine.setMaster(+vol.value));

  function update() {
    const n = engine.layers.length, on = engine.playing;
    play.innerHTML = on ? '&#10074;&#10074;' : '&#9654;';
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    play.classList.toggle('on', on);
    play.disabled = n === 0;
    title.textContent = n ? (on ? 'Playing' : 'Paused') + ` · ${n} layer${n === 1 ? '' : 's'}` : 'Nothing playing';
    sub.innerHTML = n ? esc(engine.layers.slice(0, 4).map(l => l.s.name).join(', ') + (n > 4 ? ', …' : '')) : '<a href="#/mixer">Open the mixer</a>';
    if (document.activeElement !== vol) vol.value = engine.masterVol;
    const p = pendingTotals();
    prog.hidden = !p.count;
    if (p.count) {
      bar.style.width = `${p.total ? (100 * p.loaded / p.total).toFixed(1) : 5}%`;
      sub.textContent = `Loading ${p.count} sound${p.count === 1 ? '' : 's'} · ${(p.loaded / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} MB`;
    }
    timer.hidden = !engine.timer;
    if (engine.timer) timer.textContent = `Sleep ${fmtClock(engine.timerLeft())}`;
  }
  for (const ev of ['change', 'state', 'timer']) engine.addEventListener(ev, update);
  let raf = 0;
  loader.addEventListener('progress', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); });
  setInterval(() => { if (engine.timer) update(); }, 1000);
  update();
}
