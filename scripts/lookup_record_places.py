"""Find coordinates for the places named in the national temperature records (record highs and lows).

Each record place is searched on Wikidata (label search), candidates without a coordinate are dropped, and the rest
are ranked by whether the description mentions the country, whether the label matches and whether it looks like a
settlement or station. A candidate is only accepted when it falls inside the country outline (or within 0.6 degrees of
it, for islands and coasts the simplified outline cuts off); everything else is left without a pin.
A record that names several places ("Braemar / Altnaharra") gets a pin for each place found.

Input : data/game/climate-pool-2026-10-29.json (hottest and coldest records), data/game/map-data-2026-10-29.json (outlines)
Output: data/coords/record-place-coordinates-2026-10-29.csv  (one row per record place)
        data/coords/record-place-cache.json                   (so reruns do not repeat requests)
Run:  python lookup_record_places.py
"""
import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POOL = ROOT / "data/game/climate-pool-2026-10-29.json"
MAPS = ROOT / "data/game/map-data-2026-10-29.json"
OUT_DIR = ROOT / "data/coords"
CACHE = OUT_DIR / "record-place-cache.json"
OUT = OUT_DIR / "record-place-coordinates-2026-10-29.csv"
API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "country-extremes/1.0 (matt.sims1@googlemail.com)"}
PLACE = re.compile(r"city|town|village|settlement|municipality|commune|locality|populated|capital|station|airport|"
                   r"hamlet|district|oasis|port|island|mountain|mine|base|observatory|research|camp|area|region", re.I)
BAD = re.compile(r"disambiguation|family name|given name|film|album|song|species|genus|novel|surname|reef|shoal", re.I)
NEAR_DEG = 0.6


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def split_places(text):
    text = re.sub(r"\[[^\]]*\]", "", text or "").strip()
    return [p.strip() for p in re.split(r"\s+/\s+|;\s*", text) if p.strip()]


def variants(place):
    out = [place, place.split(",")[0], re.sub(r"\s+on\s+.*$", "", place), re.sub(r"\s*\([^)]*\)", "", place)]
    seen, res = set(), []
    for v in out:
        v = v.strip()
        if v and v not in seen:
            seen.add(v)
            res.append(v)
    return res


def candidates(place, cache):
    if place in cache:
        return cache[place]
    ids = []
    for v in variants(place):
        data = get({"action": "wbsearchentities", "search": v, "language": "en", "format": "json", "limit": 10})
        ids += [h["id"] for h in data.get("search", []) if h["id"] not in ids]
        time.sleep(0.15)
        if len(ids) >= 6:
            break
    found = []
    for i in range(0, len(ids), 50):
        data = get({"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": "labels|descriptions|claims",
                    "languages": "en", "format": "json"})
        for qid, ent in data.get("entities", {}).items():
            claims = ent.get("claims", {})
            if "P625" not in claims:
                continue
            v = claims["P625"][0]["mainsnak"].get("datavalue", {}).get("value")
            if v:
                found.append({"qid": qid, "label": ent.get("labels", {}).get("en", {}).get("value", ""),
                              "description": ent.get("descriptions", {}).get("en", {}).get("value", ""),
                              "lat": v["latitude"], "lon": v["longitude"]})
    cache[place] = found
    return found


def rings_for(maps, rid):
    row = maps["rows"].get(str(rid))
    if not row:
        return []
    return [[(r[i] / 1000, r[i + 1] / 1000) for i in range(0, len(r), 2)] for p in row["parts"] for r in p[1]]


def inside(lon, lat, rings):
    n = 0
    for ring in rings:
        c = False
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                c = not c
            j = i
        n += c
    return n % 2 == 1


def near(lon, lat, rings):
    best = 9e9
    for ring in rings:
        for x, y in ring:
            best = min(best, math.hypot((x - lon) * math.cos(math.radians(lat)), y - lat))
    return best


def country_named(country, k):
    c = re.sub(r"\([^)]*\)", "", country).strip().lower()
    return bool(c) and c in k["description"].lower()


def choose(cands, country, place, rings):
    c = re.sub(r"\([^)]*\)", "", country).strip().lower()
    first = place.split(",")[0].strip().lower()
    admin = [w.strip().lower() for w in place.split(",")[1:] if w.strip()]
    scored = []
    for k in cands:
        d = k["description"].lower()
        if BAD.search(d):
            continue
        if inside(k["lon"], k["lat"], rings):
            where = "inside"
        elif near(k["lon"], k["lat"], rings) <= NEAR_DEG:
            where = "near"
        else:
            continue
        s = (3 if c and c in d else 0) + (2 if k["label"].lower() == first else 0) + (1 if PLACE.search(d) else 0) \
            + (1 if any(a and a in d for a in admin) else 0) + (1 if where == "inside" else 0)
        scored.append((s, where, k))
    scored.sort(key=lambda x: -x[0])
    return scored


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pool = json.loads(POOL.read_text(encoding="utf-8"))
    maps = json.loads(MAPS.read_text(encoding="utf-8"))
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    rows, todo = [], [(s, r) for s in ("hottest", "coldest") for r in pool[s]]
    for n, (side, r) in enumerate(todo, 1):
        rings = rings_for(maps, r["id"])
        for place in split_places(r["point"]):
            base = {"id": r["id"], "country": r["name"], "side": side, "place": place, "qid": "", "lat": "", "lon": "",
                    "wd_label": "", "wd_description": "", "where": "", "score": "", "status": ""}
            if not rings:
                base["status"] = "no_outline"
            else:
                try:
                    ranked = choose(candidates(place, cache), r["name"], place, rings)
                except Exception as e:
                    base["status"] = f"lookup_failed: {e}"
                    rows.append(base)
                    continue
                if not ranked:
                    base["status"] = "no_match"
                else:
                    s, where, k = ranked[0]
                    base.update({"qid": k["qid"], "lat": round(k["lat"], 4), "lon": round(k["lon"], 4), "wd_label": k["label"],
                                 "wd_description": k["description"], "where": where, "score": s,
                                 "status": "matched" if ((where == "inside" and s >= 3) or (where == "near" and country_named(r["name"], k))) else "weak"})
            rows.append(base)
        if n % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"{n}/{len(todo)} records", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    from collections import Counter
    print(Counter(r["status"].split(":")[0] for r in rows))
    print("wrote", OUT)


if __name__ == "__main__":
    sys.exit(main())
