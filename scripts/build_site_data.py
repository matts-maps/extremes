"""Copy the dated pipeline JSON into the Astro site under stable names.

Replaces the five build_*game.py scripts and build_dashboard.py, which inlined the same JSON into single HTML files.
Usage: python scripts/build_site_data.py [SOURCE_ROOT]
SOURCE_ROOT is the folder holding data/game and data/dashboard; it defaults to this repo (the working copy).

Run after prepare_dashboard_data.py, prepare_game_data.py, prepare_climate_game_data.py and build_map_data.py.

Input : data/game/*.json, data/dashboard/*.json (latest dated file of each kind)
Output: site/src/data/{game-pool,climate-pool,map-data,dashboard-data}.json

Then: cd site && npm run build   (output in site/dist)
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT
OUT = ROOT / "site/src/data"
OUT.mkdir(parents=True, exist_ok=True)

KINDS = [
    ("data/game", "game-pool-*.json", "game-pool.json"),
    ("data/game", "climate-pool-*.json", "climate-pool.json"),
    ("data/game", "map-data-*.json", "map-data.json"),
    ("data/dashboard", "dashboard-data-*.json", "dashboard-data.json"),
]
for folder, pattern, name in KINDS:
    files = sorted((SRC / folder).glob(pattern))
    if not files:
        raise SystemExit(f"No file matching {folder}/{pattern}")
    shutil.copy(files[-1], OUT / name)  # dates sort as text, so the last is the newest
    print(f"{files[-1].name} -> site/src/data/{name}")
