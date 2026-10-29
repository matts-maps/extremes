r"""Add the map outline for the approved exception rows (Kosovo) to the game map data.

Kosovo is not on the ISO 3166-1 list or in the fieldmaps layer, so build_map_data.py gives it no row. Its Natural Earth
polygon is already in the `world` list; this gives it a row of its own so it can be outlined and filled like any country.
Idempotent. Run after build_map_data.py.

Input/Output: data/game/map-data-2026-10-29.json (edited in place); reads data/admin/world_admin_0_polygons.json and the master.
Run: .venv\\Scripts\\python.exe scripts\\add_exception_maps.py
"""
import json
from pathlib import Path

import pandas as pd

from build_map_data import natural_earth_parts, rings

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/game/map-data-2026-10-29.json"
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
EXCEPTIONS = {"Kosovo": "Kosovo"}  # master name -> Natural Earth NAME


def main():
    data = json.loads(OUT.read_text(encoding="utf-8"))
    m = pd.read_csv(MASTER, keep_default_na=False)
    parts = natural_earth_parts()
    for master_name, ne_name in EXCEPTIONS.items():
        mid = str(int(m[m["country_wikipedia"] == master_name]["master_id"].iloc[0]))
        ids = [i for i, (n, _) in enumerate(parts) if n == ne_name]
        assert ids, ne_name
        minx = min(parts[i][1].bounds[0] for i in ids); miny = min(parts[i][1].bounds[1] for i in ids)
        maxx = max(parts[i][1].bounds[2] for i in ids); maxy = max(parts[i][1].bounds[3] for i in ids)
        pad = max(maxx - minx, maxy - miny) * 0.05
        data["rows"][mid] = {"view": [int(round(v * 1000)) for v in (minx - pad, miny - pad, maxx + pad, maxy + pad)],
                             "parts": [[i, rings(parts[i][1], 0.002)] for i in ids], "trimmed": False}
        print(master_name, "row", mid, "parts", ids)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
