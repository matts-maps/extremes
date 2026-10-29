r"""Build the climate game question pool from the master file.

Input : data/master/country-extremes-master-2026-10-29.csv
Output: data/game/climate-pool-2026-10-29.json

Six measures: hottest (national record high, deg C), coldest (national record low), avghigh, avglow and avgmean (national
average daily high, daily low and annual mean, 1991-2020, World Bank / CRU TS 4.07) and wettest (average annual
precipitation, mm; a national average, not a record). `detail` holds every temperature figure per country for the answer table. Pool rules: ISO 3166-1 rows on the map.
Temperature rows are kept when their tags are clean, or only note a former border, an unknown date or other
rows for the same country; rows tagged shared or disputed are left out (the figure is ambiguous).
The scale ends use every ISO row with a figure.

Run: .venv\Scripts\python.exe scripts\prepare_climate_game_data.py
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
EXCEPTIONS = {"Kosovo": {"region": "Europe", "record_type": "Partially recognised state"}}
OUT = ROOT / "data/game/climate-pool-2026-10-29.json"
OK_TAGS = {"clean", "historic_boundary", "date_unknown"}


def tags_ok(t):
    parts = [p for p in str(t).split(";") if p and not p.startswith("other_rows")]
    return all(p in OK_TAGS for p in parts)


def entry(r, v, point, date=""):
    return {"id": int(r["master_id"]), "name": r["country_wikipedia"], "type": r["record_type"], "region": r["region"],
            "v": round(float(v), 1), "point": point, "date": date, "status": "clean", "lat": None, "lon": None}


def main():
    df = pd.read_csv(SRC, keep_default_na=False)
    iso = set(pd.read_csv(ROOT / "data/iso/iso3166-1-2026-10-29.csv", keep_default_na=False)["alpha3"])
    # the ISO 3166-1 list, plus the exceptions Matt approved (29 October 2026): Kosovo, which is not on the list
    is_iso = df["in_iso_3166_1"].astype(str) == "True"
    is_exc = df["country_wikipedia"].isin(EXCEPTIONS)
    df = df[is_iso | is_exc].copy()
    for name, fix in EXCEPTIONS.items():
        for col, val in fix.items():
            df.loc[df["country_wikipedia"] == name, col] = val
    assert set(df[df["iso3"] != ""]["iso3"]) <= iso and len(df) == len(iso) + len(EXCEPTIONS), "pool rows must be the ISO 3166-1 list plus the approved exceptions"
    named = df[df["region"] != "Not on map"]
    pool = {"hottest": [], "coldest": [], "avghigh": [], "avglow": [], "avgmean": [], "wettest": []}
    detail = {}
    num = lambda x: None if x == "" else round(float(x), 1)
    for _, r in named.iterrows():
        for side in ("hottest", "coldest"):
            if r[f"{side}_c"] != "" and tags_ok(r[f"{side}_tags"]):
                pool[side].append(entry(r, r[f"{side}_c"], r[f"{side}_place"], r[f"{side}_date"]))
        for kind, col, label in (("avghigh", "avg_high_c", "Average daily high over the whole country"), ("avglow", "avg_low_c", "Average daily low over the whole country"),
                                 ("avgmean", "avg_temp_c", "Average temperature over the whole country")):
            if r[col] != "":
                pool[kind].append(entry(r, r[col], label))
        detail[int(r["master_id"])] = {"rh": num(r["hottest_c"]), "rhp": r["hottest_place"], "rhd": r["hottest_date"], "rl": num(r["coldest_c"]),
                                       "rlp": r["coldest_place"], "rld": r["coldest_date"], "ah": num(r["avg_high_c"]), "am": num(r["avg_temp_c"]),
                                       "al": num(r["avg_low_c"])}
        if r["avg_precip_mm_per_year"] != "":
            pool["wettest"].append(entry(r, r["avg_precip_mm_per_year"], "Average over the whole country"))
    ext = {}
    for side, col in (("hottest", "hottest_c"), ("coldest", "coldest_c"), ("avghigh", "avg_high_c"), ("avglow", "avg_low_c"),
                      ("avgmean", "avg_temp_c"), ("wettest", "avg_precip_mm_per_year")):
        have = df[df[col] != ""].copy()
        have[col] = have[col].astype(float)
        hi, lo = have.loc[have[col].idxmax()], have.loc[have[col].idxmin()]
        place = (lambda x: x[f"{side}_place"]) if side in ("hottest", "coldest") else (lambda x: "national average")
        ext[side] = {"max": {"v": round(float(hi[col]), 1), "name": hi["country_wikipedia"], "point": place(hi)},
                     "min": {"v": round(float(lo[col]), 1), "name": lo["country_wikipedia"], "point": place(lo)}}
    gl = json.loads((ROOT / "data/game/global-averages-2026-10-29.json").read_text(encoding="utf-8"))["values"]
    glob = {k: {"v": gl[k]["v"], "label": gl[k]["label"]} for k in ['hottest', 'coldest', 'avghigh', 'avglow', 'avgmean', 'wettest']}
    out = {**pool, "ext": ext, "detail": detail, "global": glob,
           "source": "Wikipedia, List of weather records (revision 1382542755) for hottest and coldest; List of countries by average annual precipitation (revision 1380108857) for wettest; fetched 29 October 2026; average temperatures: World Bank Climate Change Knowledge Portal, CRU TS 4.07, 1991 to 2020; countries and territories of the ISO 3166-1 list."}
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print({k: len(v) for k, v in pool.items()}, json.dumps(ext, ensure_ascii=False))


if __name__ == "__main__":
    main()
