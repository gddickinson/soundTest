// Sleep timer panel: length, fade length, start/cancel, countdown and the current fade level.
import { esc, list } from './core.js';
import { engine } from './audio_engine.js';
import { TIMER_CHOICES, fmtClock, fadeStart } from './sleep_fade.js';
import { prefs, setPref } from './store.js';

const FADES = [1, 2, 5, 10, 15, 20, 30];

export function mountTimer(host) {
  const p = prefs();
  host.innerHTML = `
    <h2 class="h-panel">Sleep timer</h2>
    <div class="row">
      <div><label for="tm-len">Stop after</label><select id="tm-len">${list(TIMER_CHOICES, m => `<option value="${m}" ${m === +p.timer ? 'selected' : ''}>${m} min</option>`)}</select></div>
      <div><label for="tm-fade">Fade out over the last</label><select id="tm-fade">${list(FADES, m => `<option value="${m}" ${m === +p.fade ? 'selected' : ''}>${m} min</option>`)}</select></div>
    </div>
    <button id="tm-go"></button>
    <div class="timer-read" aria-live="polite"><span class="mono big" id="tm-left"></span><span class="small mute" id="tm-note"></span>
      <div class="meter fade" aria-hidden="true"><i id="tm-level"></i></div></div>`;
  const len = host.querySelector('#tm-len'), fade = host.querySelector('#tm-fade'), btn = host.querySelector('#tm-go');
  const left = host.querySelector('#tm-left'), note = host.querySelector('#tm-note'), lvl = host.querySelector('#tm-level');
  len.addEventListener('change', () => setPref('timer', +len.value));
  fade.addEventListener('change', () => setPref('fade', +fade.value));
  const toggle = () => {
    if (engine.timer) engine.cancelTimer();
    else { engine.startTimer(+len.value, +fade.value); if (!engine.playing && engine.layers.length) engine.play(); }
  };
  btn.addEventListener('click', toggle);

  function update() {
    const t = engine.timer;
    btn.textContent = t ? 'Cancel timer' : 'Start timer';
    btn.className = t ? 'alt' : '';
    len.disabled = fade.disabled = !!t;
    if (!t) { left.textContent = ''; note.textContent = 'The music fades out gradually, then stops.'; lvl.style.width = '100%'; return; }
    const remain = engine.timerLeft(), fs = t.end - (t.total - fadeStart(t.total, t.fade));
    left.textContent = fmtClock(remain);
    const fading = engine.ctx.currentTime >= fs;
    note.textContent = fading ? ` fading · level ${Math.round(engine.timerGainNow() * 100)} %` : ` fade starts in ${fmtClock(fs - engine.ctx.currentTime)}`;
    lvl.style.width = `${(engine.timerGainNow() * 100).toFixed(1)}%`;
  }
  engine.addEventListener('timer', update);
  update();
  return { update, toggle };
}
