r"""Build the map data for the guess game from Natural Earth admin-0 polygons.

Inputs : data/admin/world_admin_0_polygons.json  (Natural Earth, Matt's copy)
         data/master/country-extremes-master-2026-10-29.csv
         fieldmaps boundary shapefile (only to say which Natural Earth parts belong to which master row)
Output : data/game/map-data-2026-10-29.json
  world : every Natural Earth part, coarse, for the faint neighbours   [[minx,miny,maxx,maxy], rings...]
  rows  : per master row (ISO rows only): view box, the parts to outline (finer), and whether far-flung parts were left out
Coordinates are integers in millidegrees.

Run: .venv\Scripts\python.exe scripts\build_map_data.py
"""
import json
from pathlib import Path

import pandas as pd
import pyogrio
import shapely
from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
NE = ROOT / "data/admin/world_admin_0_polygons.json"
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
SHP = Path("E:/world-data/admin/fieldmaps/wrl_admn_ad0_py_s0_fieldmaps_pp.shp")
OUT = ROOT / "data/game/map-data-2026-10-29.json"
WORLD_TOL = 0.05


def rings(poly, tol):
    p = poly.simplify(tol, preserve_topology=True)
    if p.is_empty:
        p = poly
    polys = [p] if p.geom_type == "Polygon" else list(p.geoms)
    out = []
    for q in polys:
        for ring in [q.exterior, *q.interiors]:
            out.append([int(round(v * 1000)) for xy in ring.coords for v in xy])
    return out


def main():
    gj = json.loads(NE.read_text(encoding="utf-8"))
    parts = []  # (ne_name, polygon)
    for f in gj["features"]:
        g = shape(f["geometry"])
        # some polygons in this file have a second ring that lies outside the first (a separate island coded as a hole);
        # make_valid turns those into separate polygons, so every part is one polygon
        for q in ([g] if g.geom_type == "Polygon" else g.geoms):
            if q.is_empty:
                continue
            v = q if q.is_valid else shapely.make_valid(q)
            for u in shapely.get_parts(v):
                if u.geom_type == "Polygon" and not u.is_empty:
                    parts.append((f["properties"]["NAME"], u))
    print("Natural Earth parts:", len(parts))

    m = pd.read_csv(MASTER, keep_default_na=False)
    m = m[m["in_iso_3166_1"].astype(str) == "True"]
    # fieldmaps shapes, to assign parts to rows
    _, _, geoms, _ = pyogrio.raw.read(str(SHP), columns=[], sql=f"SELECT COALESCE(ST_Simplify(geometry,0.03), ST_Simplify(geometry,0.0015), geometry) AS geometry FROM {SHP.stem}", sql_dialect="SQLITE")
    arr = shapely.from_wkb(geoms)
    row_geom = {}
    for _, r in m.iterrows():
        idx = [int(x) for x in str(r["map_record_indices"]).split(";") if x != ""]
        gs = [shapely.make_valid(arr[i]) for i in idx if arr[i] is not None and not arr[i].is_empty]
        if gs:
            row_geom[int(r["master_id"])] = shapely.unary_union(gs)
    ids = list(row_geom)
    tree = STRtree([row_geom[i] for i in ids])
    assigned = {i: [] for i in ids}
    owner = {}
    for pi, (_, q) in enumerate(parts):
        pt = q.representative_point()
        best = None
        for ci in tree.query(pt.buffer(0.15)):
            rid = ids[ci]
            d = row_geom[rid].distance(pt)
            if d <= 0.15:
                score = (d > 0, row_geom[rid].area)  # inside beats near; then the smaller shape
                if best is None or score < best[0]:
                    best = (score, rid)
        if best:
            assigned[best[1]].append(pi); owner[pi] = best[1]

    world = []
    for pi, (_, q) in enumerate(parts):
        minx, miny, maxx, maxy = q.bounds
        world.append([pi, [int(minx * 1000), int(miny * 1000), int(maxx * 1000), int(maxy * 1000)], rings(q, WORLD_TOL)])

    rows, missing, trimmed = {}, [], 0
    for rid in ids:
        pis = assigned[rid]
        if not pis:
            missing.append(rid); continue
        main = max(pis, key=lambda i: parts[i][1].area)
        mb = parts[main][1].bounds
        mext = max(mb[2] - mb[0], mb[3] - mb[1], 0.02)
        mc = parts[main][1].centroid
        keep = [i for i in pis if parts[i][1].centroid.distance(mc) <= max(2.5 * mext, 1.0)]
        if len(keep) < len(pis):
            trimmed += 1
        b = shapely.unary_union([parts[i][1] for i in keep]).bounds
        w, h = b[2] - b[0], b[3] - b[1]
        pad = max(w, h, 0.02) * 0.12
        view = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
        ext = max(w, h, 0.02)
        shapes = [[i, rings(parts[i][1], max(0.0003, ext / 350))] for i in keep]
        rows[str(rid)] = {"view": [int(round(v * 1000)) for v in view], "parts": shapes, "trimmed": len(keep) < len(pis)}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"world": world, "rows": rows}, separators=(",", ":")), encoding="utf-8")
    print(f"rows with a map: {len(rows)} of {len(ids)}; no Natural Earth part: {[m[m.master_id == i].country_wikipedia.iat[0] for i in missing]}; rows with far-flung parts left out: {trimmed}")
    print(f"{OUT.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
