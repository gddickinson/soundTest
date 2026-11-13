"""Write the static site's API answers: api/<path>.json for every GET in web.app.STATIC_ENDPOINTS.

GitHub Pages serves this repository's root as it is (no build step), so the JSON is committed. static/static_api.js
reads it when the page runs without the Python app. Re-run after changing sounds or the API:
    python scripts/export_api.py            (--check: exit 1 if the committed files are out of date)
"""
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from web.app import STATIC_ENDPOINTS, app  # noqa: E402

OUT = ROOT / "api"


def exported() -> dict:
    """{relative file name: JSON value} as the static site should see it (server: false)."""
    client = TestClient(app)
    out = {}
    for path in STATIC_ENDPOINTS:
        r = client.get("/api" + path)
        r.raise_for_status()
        v = r.json()
        if path == "/info":
            v["server"] = False
        out[path.strip("/") + ".json"] = v
    return out


def text(v) -> str:
    return json.dumps(v, indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    data = exported()
    if "--check" in sys.argv:
        stale = [n for n, v in data.items() if not (OUT / n).exists() or json.loads((OUT / n).read_text()) != v]
        print("stale: " + ", ".join(stale) if stale else "api/ is current")
        sys.exit(1 if stale else 0)
    OUT.mkdir(exist_ok=True)
    for name, v in data.items():
        (OUT / name).write_text(text(v))
        print("wrote api/" + name)
