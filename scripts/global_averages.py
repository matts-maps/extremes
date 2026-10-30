r"""Global averages for the reference line in the game graphics.

Inputs : data/master/country-extremes-master-2026-10-29.csv
         data/raw/wikipedia-area-t0-raw-2026-10-29.csv  (Wikipedia, List of countries and dependencies by area: land area, km2)
Output : data/game/global-averages-2026-10-29.json

Rows used: the ISO 3166-1 list plus Kosovo, as in the games. Method per measure:
- average elevation: 840 m, the "World" row of Wikipedia's List of countries by average elevation (not recomputed).
- average daily high, daily low, annual mean temperature and average rainfall: mean of the country figures weighted by land area,
  so a large country counts for more than a small island. A land average, not a sea-and-land one. Countries with no area match
  are left out of the weighting and listed when the script runs.
- highest point, lowest point, record high and record low: plain mean over the countries that have a figure ("average of all
  countries"); weighting a record by area has no meaning.

Run: .venv\Scripts\python.exe scripts\global_averages.py
"""
import json
import re
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
AREA = ROOT / "data/raw/wikipedia-area-t0-raw-2026-10-29.csv"
OUT = ROOT / "data/game/global-averages-2026-10-29.json"
EXCEPTIONS = ["Kosovo"]
WORLD_AVG_ELEVATION_M = 840.0
# master name -> Wikipedia area-list name, where the plain match fails
ALIAS = {"Sahrawi Republic": "Western Sahara", "Federated States of Micronesia": "Micronesia", "Gambia": "The Gambia",
         "Svalbard and Jan Mayen": "Svalbard", "United States Virgin Islands": "U.S. Virgin Islands",
         "United States Minor Outlying Islands": "U.S. Minor Outlying Islands", "Bonaire, Sint Eustatius and Saba": "Bonaire"}


def norm(s):
    s = re.sub(r"\(.*?\)|\[.*?\]", "", str(s))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def land_areas():
    a = pd.read_csv(AREA, encoding="utf-8-sig", dtype=str, keep_default_na=False)
    out = {}
    for _, r in a.iterrows():
        land = re.match(r"\s*([\d,]+)", r["Land / in km (mi)"]) or re.match(r"\s*([\d,]+)", r["Total / in km (mi)"])  # total where no land figure is given (South Sudan)
        if land:
            out.setdefault(norm(r["Country / dependency"]), float(land.group(1).replace(",", "")))
    return out


def main():
    m = pd.read_csv(MASTER, keep_default_na=False)
    m = m[(m["in_iso_3166_1"].astype(str) == "True") | m["country_wikipedia"].isin(EXCEPTIONS)].copy()
    areas = land_areas()
    m["area"] = [areas.get(norm(ALIAS.get(n, n))) for n in m["country_wikipedia"]]
    out = {"values": {}}

    def plain(col, key, label):
        v = pd.to_numeric(m[col], errors="coerce").dropna()
        out["values"][key] = {"v": round(float(v.mean()), 1), "label": label, "n": int(len(v)), "method": "mean of the countries"}

    def weighted(col, key, label):
        d = m.assign(v=pd.to_numeric(m[col], errors="coerce")).dropna(subset=["v", "area"])
        miss = m.assign(v=pd.to_numeric(m[col], errors="coerce"))
        miss = miss[miss["v"].notna() & miss["area"].isna()]["country_wikipedia"].tolist()
        out["values"][key] = {"v": round(float((d["v"] * d["area"]).sum() / d["area"].sum()), 1), "label": label, "n": int(len(d)),
                              "method": "mean weighted by land area", "no_area": miss}

    plain("highest_m", "highest", "Global average")
    plain("lowest_m", "lowest", "Global average")
    out["values"]["average"] = {"v": WORLD_AVG_ELEVATION_M, "label": "Global average", "n": 0, "method": "Wikipedia, World row"}
    plain("hottest_c", "hottest", "Global average")
    plain("coldest_c", "coldest", "Global average")
    weighted("avg_high_c", "avghigh", "Global average")
    weighted("avg_low_c", "avglow", "Global average")
    weighted("avg_temp_c", "avgmean", "Global average")
    weighted("avg_precip_mm_per_year", "wettest", "Global average")
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    for k, v in out["values"].items():
        print(f"{k:8s} {v['v']:>8}  n={v['n']:3d}  {v['method']}  no area: {v.get('no_area', '')}")
    print("rows with no area match:", m[m["area"].isna()]["country_wikipedia"].tolist())
    big = m.sort_values("area", ascending=False)[["country_wikipedia", "area"]].head(5)
    print(big.to_string(index=False), "| total land (million km2):", round(m["area"].sum() / 1e6, 1))


if __name__ == "__main__":
    main()
