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
LEGACY = "index.html"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def base():
    port = free_port()
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=ROOT,
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
def browser():
    with sync_playwright() as p:
        args = ["--autoplay-policy=no-user-gesture-required"]
        try:
            b = p.chromium.launch(channel="chrome", args=args)
        except Exception:
            b = p.chromium.launch(args=args)
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
