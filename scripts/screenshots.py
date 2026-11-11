"""README screenshots: serve the repo, start the "Night tide" preset, and save PNGs of the main pages to docs/img/.

Run:  /Users/george/claude_test/add_webpage/.venv/bin/python scripts/screenshots.py [--phone]
Needs pytest's sibling: playwright (uses the installed Chrome, else Playwright's Chromium).
"""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))
from test_smoke import ENGINE, free_port  # noqa: E402  (reuse the test server helpers)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phone", action="store_true", help="also save 390 px wide shots")
    a = ap.parse_args()
    import subprocess
    port = free_port()
    serve = ("import socketserver, sys; socketserver.TCPServer.request_queue_size = 128; "
             "sys.argv = ['http.server', sys.argv[1], '--bind', '127.0.0.1']; import runpy; "
             "runpy.run_module('http.server', run_name='__main__')")
    proc = subprocess.Popen([sys.executable, "-c", serve, str(port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}/"
    out = ROOT / "docs" / "img"
    out.mkdir(parents=True, exist_ok=True)
    try:
        with sync_playwright() as p:
            try:
                b = p.chromium.launch(channel="chrome", args=["--autoplay-policy=no-user-gesture-required"])
            except Exception:
                b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            page = b.new_page(viewport={"width": 1280, "height": 860})
            page.wait_for_timeout(500)
            page.goto(base + "#/")
            page.click("[data-preset=wind-chimes]")
            page.wait_for_function(f"async () => {ENGINE}.layers.length === 5 && {ENGINE}.layers.every(l => l.state === 'ready')", timeout=30000)
            page.wait_for_timeout(2500)
            page.screenshot(path=str(out / "mixer.png"))
            for route, name, wait in [("", "home", 1500), ("visualiser", "visualiser", 1500), ("presets", "presets", 600)]:
                page.goto(base + "#/" + route)
                page.wait_for_timeout(wait)
                page.screenshot(path=str(out / f"{name}.png"))
            page.goto(base + "#/visualiser")
            page.click("[data-vis=orbit]")
            page.wait_for_timeout(1500)
            page.screenshot(path=str(out / "orbit.png"))
            if a.phone:
                page.set_viewport_size({"width": 390, "height": 844})
                for route, name in [("mixer", "phone_mixer"), ("", "phone_home")]:
                    page.goto(base + "#/" + route)
                    page.wait_for_timeout(1200)
                    page.screenshot(path=str(out / f"{name}.png"))
            b.close()
    finally:
        proc.terminate()
    print("saved to", out)


if __name__ == "__main__":
    main()
