r"""Build the dashboard data file from the master file and the fieldmaps boundaries.

Input : data/master/country-extremes-master-2026-10-29.csv, fieldmaps boundary shapefile
Output: data/dashboard/dashboard-data-2026-10-29.json  (one record per master row + one merged feature per row)

Each master row is one country as listed on Wikipedia. Its map shape is the union of the fieldmaps records linked to it.

Run: .venv\Scripts\python.exe scripts\prepare_dashboard_data.py
"""
import json
from pathlib import Path

import pandas as pd
import pyogrio
import shapely
from shapely.geometry import mapping

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
SHP = Path("E:/world-data/admin/fieldmaps/wrl_admn_ad0_py_s0_fieldmaps_pp.shp")
OUT = ROOT / "data/dashboard/dashboard-data-2026-10-29.json"
TOLERANCE = 0.03  # degrees, about 3 km: enough for a world map

PRIORITY = ["unnamed", "disputed", "span mismatch", "shared", "clean"]


def num(v):
    return None if pd.isna(v) or v == "" else float(v)


def txt(v):
    return None if pd.isna(v) or v == "" else str(v)


def side(row, s):
    tags = [t for t in str(row[f"{s}_tags"]).split(";") if t and t != "nan"]
    name = txt(row[f"{s}_point"])
    return {"m": num(row[f"{s}_m"]), "name": name, "lat": num(row[f"{s}_lat"]), "lon": num(row[f"{s}_lon"]),
            "source": "wikipedia", "tags": tags, "status": next((t for t in PRIORITY if t in tags), None),
            "holder": None, "why_blank": None}


def main():
    df = pd.read_csv(MASTER)
    df = df[df["in_iso_3166_1"]]  # the 249 officially assigned ISO 3166-1 codes
    records, links = [], {}
    for _, r in df.iterrows():
        mid = int(r["master_id"])
        idx = [int(x) for x in str(r["map_record_indices"]).split(";")] if pd.notna(r["map_record_indices"]) else []
        links[mid] = idx
        records.append({
            "id": mid, "name": r["country_wikipedia"], "named": True, "iso3": txt(r["iso3"]),
            "type": txt(r["record_type"]) or "Not on the map layer", "region": r["region"],
            "scope": f"{len(idx)} map pieces" if len(idx) > 1 else None, "on_map": bool(idx),
            "highest": side(r, "highest"), "lowest": side(r, "lowest"),
            "flags": txt(r["flags"]), "source_url": txt(r["source_url"]), "fetched": txt(r["fetched"]),
        })
    for rec in records:
        h, l = rec["highest"]["m"], rec["lowest"]["m"]
        rec["span_m"] = round(h - l, 1) if h is not None and l is not None else None

    # Simplify inside GDAL: the file is 1.4 GB, and doing it in Python never finished.
    _, _, geoms, _ = pyogrio.raw.read(
        str(SHP), columns=[], sql=f"SELECT COALESCE(ST_Simplify(geometry,{TOLERANCE}), ST_Simplify(geometry,{TOLERANCE}/20), geometry) AS geometry FROM {SHP.stem}",
        sql_dialect="SQLITE")
    arr = shapely.from_wkb(geoms)
    feats = []
    for mid, idx in links.items():
        parts = [shapely.make_valid(arr[i]) for i in idx if arr[i] is not None and not arr[i].is_empty]
        if not parts:
            continue
        geom = shapely.unary_union(parts)
        feats.append({"type": "Feature", "properties": {"id": mid}, "geometry": mapping(geom)})
    gj = {"type": "FeatureCollection", "features": feats}

    OUT.parent.mkdir(parents=True, exist_ok=True)

    def rnd(o):
        if isinstance(o, float):
            return round(o, 3)
        if isinstance(o, (list, tuple)):
            return [rnd(x) for x in o]
        if isinstance(o, dict):
            return {k: rnd(v) for k, v in o.items()}
        return o

    gj = rnd(gj)
    OUT.write_text(json.dumps({"records": records, "geojson": gj}, separators=(",", ":")), encoding="utf-8")
    print(f"records {len(records)}, features {len(feats)}, {OUT.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
