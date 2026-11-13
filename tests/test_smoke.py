"""Playwright smoke test against a local `python -m http.server` (no console errors, no overflow at 390 px).

Run:  /Users/george/claude_test/add_webpage/.venv/bin/python -m pytest -q tests/test_smoke.py
(any Python with pytest + playwright works; it uses the installed Chrome, or Playwright's Chromium).
"""
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
LEGACY = "classic/index.html"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base():
    port = free_port()
    # `python -m http.server`, with a longer listen queue: its default of 5 makes macOS drop some of the ~20 parallel
    # ES-module requests of a first page load, which then stall for seconds (SYN retries) and make the test flaky.
    serve = ("import socketserver, sys; socketserver.TCPServer.request_queue_size = 128; "
             "sys.argv = ['http.server', sys.argv[1], '--bind', '127.0.0.1']; import runpy; "
             "runpy.run_module('http.server', run_name='__main__')")
    proc = subprocess.Popen([sys.executable, "-c", serve, str(port)], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(("127.0.0.1", port), 0.2).close()
            break
        except OSError:
            time.sleep(0.1)
    yield f"http://127.0.0.1:{port}/"
    proc.terminate()
    proc.wait()


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def browser(pw):
    args = ["--autoplay-policy=no-user-gesture-required"]
    try:
        b = pw.chromium.launch(channel="chrome", args=args)
    except Exception:
        b = pw.chromium.launch(args=args)
    yield b
    b.close()


@pytest.fixture
def page(browser):
    pg = browser.new_page(viewport={"width": 1280, "height": 900})
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    # 404s are recorded by URL (below) so the browser's automatic /favicon.ico request can be ignored
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text
          else None)
    pg.on("response", lambda r: pg.errors.append(f"{r.status} {r.url}") if r.status >= 400 and not r.url.endswith(
        "/favicon.ico") else None)
    yield pg
    pg.close()


def test_legacy_player_buttons(page, base):
    page.goto(base + LEGACY)
    page.click("#startSample")                       # before choosing a sound
    page.click("text=Ocean Sounds")
    page.click("#startAnalyser")
    page.wait_for_timeout(500)
    page.click("#stop")
    page.click("#startAnalyser")
    page.wait_for_timeout(300)
    page.click("#stop")
    page.click("text=Chimes")
    page.click("#startSample")
    page.click("#startLoop")
    page.click("#stop")
    assert page.errors == []


def test_legacy_player_does_not_download_every_wav_on_load(page, base):
    wavs = []
    page.on("request", lambda r: wavs.append(r.url) if r.url.endswith(".wav") else None)
    page.goto(base + LEGACY)
    page.wait_for_timeout(1500)
    assert wavs == []


# ---- the new mixer site ------------------------------------------------------------------------------------------
ROUTES = ["", "mixer", "visualiser", "presets", "sounds", "sounds/chime-3", "sounds/ocean-waves-40", "synth", "credits", "about"]
ENGINE = "(await import('./static/audio_engine.js')).engine"


def goto(page, url, ready="#app > *:not(.mute)"):
    """Open a route and wait until the page has rendered (the router shows 'Loading...' first)."""
    page.goto(url)
    try:
        page.wait_for_selector(ready, timeout=15000)
    except Exception:
        raise AssertionError(f"{url} did not render: {page.inner_text('body')[:300]!r} errors={page.errors}")
    page.wait_for_function("!document.querySelector('#app').innerText.startsWith('Loading')")


def wait_ready(page, n=None, timeout=20000):
    """Wait until every layer is decoded (and there are n of them)."""
    page.wait_for_function(f"""async () => {{ const e = {ENGINE};
        return e.layers.length > 0 && {'true' if n is None else f'e.layers.length === {n}'} && e.layers.every(l => l.state === 'ready'); }}""",
                           timeout=timeout)


def output_rms(page):
    return page.evaluate(f"""async () => {{ const e = {ENGINE}; const a = new Float32Array(e.analyser.fftSize);
        e.analyser.getFloatTimeDomainData(a); return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length); }}""")


def test_every_route_renders_without_errors(page, base):
    for r in ROUTES:
        goto(page, base + "#/" + r)
        page.wait_for_timeout(300)
        assert "Something went wrong" not in page.inner_text("#app"), r
    assert page.errors == []


def test_no_horizontal_overflow_at_390px(page, base):
    page.set_viewport_size({"width": 390, "height": 800})
    for r in ROUTES + ["mixer?mix=v1~m80~ocean-waves-40.70.0.L~chime-3.45.-30.S20x40.s~pinknoise.20.25.L.m"]:
        goto(page, base + "#/" + r)
        page.wait_for_timeout(300)
        over = page.evaluate("document.documentElement.scrollWidth - innerWidth")
        assert over <= 0, f"#/{r} overflows by {over}px"
    assert page.errors == []


def test_preset_plays_with_seamless_loops(page, base):
    goto(page, base + "#/")
    page.click("[data-preset=night-tide]")
    page.wait_for_url("**#/mixer**")
    wait_ready(page, 4)
    page.wait_for_timeout(1500)
    assert output_rms(page) > 0.001                       # sound is coming out
    assert page.locator(".strip").count() == 4
    info = page.evaluate(f"""async () => {{ const e = {ENGINE}; const l = e.layer('ocean-waves-40');
        return [l.buf.length, l.loopBuf.length, l.buf.sampleRate, l.src.loop]; }}""")
    assert info[1] == info[0] - round(1.5 * info[2]) and info[3] is True
    assert "mix=v1~m80~ocean-waves-40" in page.url        # address bar = share link
    assert page.errors == []


def test_share_link_rebuilds_the_mix(browser, page, base):
    link = base + "#/mixer?mix=v1~m70~pinknoise.50.0.L~water-drop.40.-30.S15x45~chime-3.30.20.L.m"
    goto(page, link)
    assert "Shared mix loaded: 3 layers" in page.inner_text("#app")
    names = page.locator(".strip-name b").all_inner_texts()
    assert names == ["Pink noise", "Water drop", "Chime 3"]
    assert page.get_attribute("[data-id=chime-3] [data-act=mute]", "aria-pressed") == "true"
    page.click("#mx-play")
    wait_ready(page, 3)
    assert page.evaluate(f"async () => {ENGINE}.playing")
    assert page.input_value("#share-url").endswith("#/mixer?mix=v1~m70~pinknoise.50.0.L~water-drop.40.-30.S15x45~chime-3.30.20.L.m")
    assert page.errors == []


def test_keyboard_solo_mute_and_volume(page, base):
    goto(page, base + "#/mixer?mix=v1~m80~pinknoise.50.0.L~whitenoise.50.0.L")
    page.keyboard.press("Space")
    wait_ready(page, 2)
    page.keyboard.press("2")
    page.keyboard.press("s")
    assert page.get_attribute("[data-id=whitenoise] [data-act=solo]", "aria-pressed") == "true"
    # solo silences the other layer (the gates glide over 0.25 s of audio-clock time)
    page.wait_for_function(f"async () => {{ const g = {ENGINE}.layers.map(l => l.gate.gain.value); return g[0] < 0.01 && g[1] > 0.99; }}",
                           timeout=5000)
    page.keyboard.press("s")
    page.keyboard.press("1")
    page.keyboard.press("m")
    page.keyboard.press("ArrowDown")
    t = page.evaluate(f"async () => {ENGINE}.layers.map(l => [l.t.mute, l.t.vol])")
    assert t == [[True, 0.45], [False, 0.5]]
    page.keyboard.press("Space")
    assert not page.evaluate(f"async () => {ENGINE}.playing")
    assert page.errors == []


def test_sleep_timer_fades_then_stops(page, base):
    goto(page, base + "#/mixer?mix=v1~m80~pinknoise.60.0.L")
    page.click("#mx-play")
    wait_ready(page, 1)
    page.evaluate(f"async () => {ENGINE}.startTimer(4 / 60, 3 / 60)")   # 4 s, fading over the last 3 s
    gains = []
    for _ in range(8):
        page.wait_for_timeout(500)
        gains.append(page.evaluate(f"async () => {ENGINE}.timerGainNow()"))
    assert gains[0] > 0.9 and gains[-1] < 0.05
    assert all(b <= a + 1e-6 for a, b in zip(gains[1:], gains[2:]))
    page.wait_for_timeout(800)
    assert not page.evaluate(f"async () => {ENGINE}.playing")
    assert page.errors == []


def test_library_search_add_and_save(page, base):
    goto(page, base + "#/mixer")
    page.fill("#lib-search", "gaussian")
    assert page.locator(".lib-row").count() == 1
    page.click("[data-id=whitenoisegaussian] [data-act=add]")
    wait_ready(page, 1)
    page.fill("#save-name", "Test mix")
    page.click("#save-form button")
    goto(page, base + "#/presets")
    assert "Test mix" in page.inner_text("#app")
    page.click("[data-del='Test mix']")
    assert "Test mix" not in page.inner_text("#app")
    assert page.errors == []


# ---- compressed copies decode to the WAV's exact length and alignment ---------------------------------------------
ALIGN_FILES = ["audio/whitenoise/pinknoise.wav", "audio/ocean_sounds/water-sounds-ocean-ocean-waves-66.wav",
               "audio/Korg-DS-8-Sci-Fi-Sound-Effects-Pack/glitch24.wav", "audio/ocean_sounds/oceano.wav"]


def check_alignment(page, base):
    page.goto(base)
    js = (ROOT / "tests" / "align_check.js").read_text().split("\n", 2)[2]
    rows = [r for rate in (44100, 48000) for r in page.evaluate(js, [ALIGN_FILES, rate])]
    decoded = [r for r in rows if "error" not in r]
    assert decoded, rows
    for r in decoded:
        assert r["len"] == r["lenRef"], r                        # exact WAV length after trimming
        assert r["start"][0] == 0 and r["end"][0] == 0, r        # no offset at the first or last samples
        assert r["start"][1] > 0.85 and r["end"][1] > 0.85, r    # and the same waveform (lossy, so not bit-exact)
    return rows


def test_compressed_copies_align_with_wavs_chrome(page, base):
    rows = check_alignment(page, base)
    assert {r["fmt"] for r in rows if "error" not in r} == {"opus", "m4a"}   # Chrome decodes both
    assert page.errors == []


def test_compressed_copies_align_with_wavs_webkit(pw, base):
    try:
        b = pw.webkit.launch()
    except Exception as e:
        pytest.skip(f"Playwright WebKit not installed: {str(e).splitlines()[0][:80]}")
    try:
        check_alignment(b.new_page(), base)       # formats WebKit cannot decode come back as errors and are skipped
    finally:
        b.close()


def test_player_uses_opus_in_chrome(page, base):
    goto(page, base + "#/mixer?mix=v1~m80~pinknoise.50.0.L")
    page.click("#mx-play")
    wait_ready(page, 1)
    fmt = page.evaluate("async () => (await import('./static/loader.js')).loadState('audio/whitenoise/pinknoise.wav').format")
    assert fmt == "opus"
    assert page.errors == []
