"""Find Wikidata coordinates for each named highest and lowest point.

Sea and ocean lowest points (lowest_is_sea_level) are not looked up; they are tagged sea_level.
A name is searched on Wikidata (label search, 8 candidates), candidates without a coordinate
are dropped, and the rest are ranked by whether the description mentions the country and
whether it looks like a physical feature. A point is accepted automatically only when one
candidate ranks clearly first; everything else is written as needs_review with candidates listed.

Input : data/clean/wikipedia-elevation-extremes-clean-*.csv
Output: data/coords/point-coordinates-<date>.csv  (one row per point)
        data/coords/candidates-cache.json         (so reruns do not repeat requests)
Run:  python lookup_coordinates.py
"""
import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLEAN = sorted((ROOT / "data" / "clean").glob("wikipedia-elevation-extremes-clean-*.csv"))[-1]
OUT_DIR = ROOT / "data" / "coords"
CACHE = OUT_DIR / "candidates-cache.json"
STAMP = "-".join(CLEAN.stem.rsplit("-", 3)[-3:])
API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "country-extremes/1.0 (matt.sims1@googlemail.com)"}
FEATURE = re.compile(r"mountain|peak|volcano|hill|summit|lake|river|depression|desert|salt|pan|plateau|massif|"
                     r"range|ridge|valley|island|crater|dune|cliff|point|cape|canal|bay|oasis|basin|sink|"
                     r"wadi|chott|sabkha|rock|lagoon|plain|swamp|marsh|pit|gorge|glacier|pass|mount", re.I)


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))


def clean_name(name):
    name = re.sub(r"\[[^\]]*\]", "", name)
    return name.strip()


def search_variants(name):
    """The name as written, then simpler forms: 'X on Y' -> X, bracket and slash splits."""
    name = clean_name(name)
    out = [name]
    for part in re.split(r"\s+/\s+|\s+or\s+|;\s*", name):
        out.append(part)
    out.append(re.sub(r"\s+on\s+.*$", "", name))
    out.append(re.sub(r"\s*\([^)]*\)", "", name))
    seen, res = set(), []
    for v in out:
        v = v.strip()
        if v and v not in seen:
            seen.add(v)
            res.append(v)
    return res


def candidates(name, cache):
    if name in cache:
        return cache[name]
    ids = []
    for v in search_variants(name):
        data = get({"action": "wbsearchentities", "search": v, "language": "en", "format": "json", "limit": 8})
        ids += [h["id"] for h in data.get("search", []) if h["id"] not in ids]
        if len(ids) >= 3:
            break
        time.sleep(0.2)
    found = []
    for i in range(0, len(ids), 50):
        data = get({"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": "labels|descriptions|claims",
                    "languages": "en", "format": "json"})
        for qid, ent in data.get("entities", {}).items():
            claims = ent.get("claims", {})
            if "P625" not in claims:
                continue
            v = claims["P625"][0]["mainsnak"].get("datavalue", {}).get("value")
            if not v:
                continue
            elev = None
            if "P2044" in claims:
                try:
                    elev = float(claims["P2044"][0]["mainsnak"]["datavalue"]["value"]["amount"])
                except Exception:
                    pass
            found.append({"qid": qid, "label": ent.get("labels", {}).get("en", {}).get("value", ""),
                          "description": ent.get("descriptions", {}).get("en", {}).get("value", ""),
                          "lat": v["latitude"], "lon": v["longitude"], "wd_elevation_m": elev})
    cache[name] = found
    return found


def rank(cands, country, name):
    c = re.sub(r"\([^)]*\)", "", country).strip().lower()
    nm = clean_name(name).lower()
    scored = []
    for k in cands:
        s = 0
        d = k["description"].lower()
        if c and c in d:
            s += 3
        if FEATURE.search(d):
            s += 2
        if k["label"].lower() == nm:
            s += 2
        if k["wd_elevation_m"] is not None:
            s += 1
        scored.append((s, k))
    scored.sort(key=lambda x: -x[0])
    return scored


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    with open(CLEAN, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if "aggregate_row" not in r["flags"]]
    out = []
    for n, r in enumerate(rows, 1):
        for kind in ("highest", "lowest"):
            name = r[f"{kind}_point"]
            base = {"name_wikipedia": r["name_wikipedia"], "kind": kind, "point_name": name,
                    "wikipedia_m": r[f"{kind}_m"], "qid": "", "lat": "", "lon": "", "wd_label": "",
                    "wd_description": "", "wd_elevation_m": "", "status": "", "candidates": ""}
            if kind == "lowest" and r["lowest_is_sea_level"] == "True":
                base["status"] = "sea_level"
            elif not name or name.lower() in ("", "unnamed"):
                base["status"] = "unnamed"
            else:
                try:
                    cands = candidates(name, cache)
                except Exception as e:
                    base["status"] = f"lookup_failed: {e}"
                    out.append(base)
                    continue
                ranked = rank(cands, r["name_wikipedia"], name)
                if not ranked:
                    base["status"] = "no_match"
                else:
                    top = ranked[0][1]
                    clear = len(ranked) == 1 or ranked[0][0] - ranked[1][0] >= 2
                    good = ranked[0][0] >= 3
                    base.update({"qid": top["qid"], "lat": top["lat"], "lon": top["lon"], "wd_label": top["label"],
                                 "wd_description": top["description"],
                                 "wd_elevation_m": "" if top["wd_elevation_m"] is None else top["wd_elevation_m"],
                                 "status": "matched" if (clear and good) else "needs_review"})
                    if base["status"] == "needs_review":
                        base["candidates"] = " | ".join(f"{k['qid']} {k['label']} ({k['description']}) "
                                                        f"{k['lat']:.4f},{k['lon']:.4f}" for _, k in ranked[:5])
            out.append(base)
        if n % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"{n}/{len(rows)} rows", flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    path = OUT_DIR / f"point-coordinates-{STAMP}.csv"
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    from collections import Counter
    print(Counter(o["status"].split(":")[0] for o in out))
    print("wrote", path)


if __name__ == "__main__":
    sys.exit(main())
