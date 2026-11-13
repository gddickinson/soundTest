"""Smoke test and README screenshots (Playwright + Chrome).

  python scripts/screenshots.py --static [route ...]            serve the repo as GitHub Pages does (static site)
  python scripts/screenshots.py --base http://127.0.0.1:8243 [route ...]   the running local app (run_web.py)
Every route (hash path without '#/'; '' is home) must render with no console errors and no horizontal scroll at 390 px;
analysis pages must draw their canvases. --shots saves docs/img/<route>.png; --readme also plays the "Wind chimes"
preset and saves mixer/home/visualiser/presets/orbit shots (+ phone shots with --phone), as before.
"""
import argparse
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ENGINE = "(await import('./static/audio_engine.js')).engine"
OUT = ROOT / "docs" / "img"
DEFAULT_ROUTES = ["", "mixer", "visualiser", "presets", "sounds", "sounds/chime-3", "synth", "credits", "about"]


def serve_static() -> str:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    http.server.ThreadingHTTPServer.request_queue_size = 128     # many ES modules load at once
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}/"


def readme_shots(page, base, phone):
    page.goto(base + "#/")
    page.click("[data-preset=wind-chimes]")
    page.wait_for_function(f"async () => {ENGINE}.layers.length === 5 && {ENGINE}.layers.every(l => l.state === 'ready')", timeout=30000)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(OUT / "mixer.png"))
    for route, name, wait in [("", "home", 1500), ("visualiser", "visualiser", 1500), ("presets", "presets", 600)]:
        page.goto(base + "#/" + route)
        page.wait_for_timeout(wait)
        page.screenshot(path=str(OUT / f"{name}.png"))
    page.goto(base + "#/visualiser")
    page.click("[data-vis=orbit]")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "orbit.png"))
    if phone:
        page.set_viewport_size({"width": 390, "height": 844})
        for route, name in [("mixer", "phone_mixer"), ("", "phone_home")]:
            page.goto(base + "#/" + route)
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f"{name}.png"))


def check(page, base, route, wait, errors):
    """Open one route; return a list of problems."""
    errors.clear()
    page.goto(base + "#/" + route)
    page.wait_for_function("!document.querySelector('#app').innerText.startsWith('Loading')", timeout=20000)
    if route.startswith("sounds/"):
        page.wait_for_function("document.querySelector('#snote') && !document.querySelector('#snote').innerText.startsWith('Analysing')",
                               timeout=30000)
    page.wait_for_timeout(wait)
    bad = list(errors)
    if "Something went wrong" in page.inner_text("#app"):
        bad.append(page.inner_text("#app")[:200])
    if route.startswith("sounds/") and not page.evaluate("document.querySelector('#cw').width > 0"):
        bad.append("waveform not drawn")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("routes", nargs="*")
    ap.add_argument("--base")
    ap.add_argument("--static", action="store_true")
    ap.add_argument("--shots", action="store_true", help="save docs/img/<route>.png")
    ap.add_argument("--readme", action="store_true", help="also save the README's preset/visualiser shots")
    ap.add_argument("--phone", action="store_true", help="with --shots/--readme: also 390 px shots")
    ap.add_argument("--wait", type=int, default=800)
    a = ap.parse_args()
    base = serve_static() if a.static else (a.base or "http://127.0.0.1:8243").rstrip("/") + "/"
    routes = a.routes or DEFAULT_ROUTES
    OUT.mkdir(parents=True, exist_ok=True)
    bad = 0
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
        except Exception:
            browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for width in (1280, 390):
            page.set_viewport_size({"width": width, "height": 900 if width > 400 else 844})
            for r in routes:
                problems = check(page, base, r, a.wait, errors)
                if width < 400:
                    over = page.evaluate("document.documentElement.scrollWidth - innerWidth")
                    if over > 1:
                        problems.append(f"overflows by {over}px at 390 px")
                bad += bool(problems)
                print(f"{'FAIL' if problems else 'ok  '} {width}px #/{r} {' | '.join(problems)[:300]}")
                if a.shots and (width > 400 or a.phone):
                    name = (r or "home").replace("/", "_") + ("" if width > 400 else "_phone")
                    page.screenshot(path=str(OUT / f"{name}.png"))
        if a.readme:
            page.set_viewport_size({"width": 1280, "height": 860})
            readme_shots(page, base, a.phone)
        browser.close()
    print(f"{'static site' if a.static else base}: {'all ok' if not bad else f'{bad} FAILED'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
