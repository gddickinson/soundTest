"""Start the soundTest web app: the mixer site plus its Python API (catalogue, analysis, synthesis).

    python run_web.py [--port 8243]      then open http://127.0.0.1:8243/
"""
import argparse
import sys
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=8243)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    uvicorn.run("web.app:app", host=a.host, port=a.port)
