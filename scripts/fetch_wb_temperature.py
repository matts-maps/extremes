r"""Fetch national annual mean, average daily high and average daily low temperature, 1991-2020.

Source : World Bank Climate Change Knowledge Portal API, CRU TS 4.07 gridded climatology (tas, tasmax, tasmin),
         averaged over each country's area by the World Bank. Standard library only.
Input  : data/master/country-extremes-master-2026-10-29.csv (iso3 column)
Output : data/raw/wb-cckp-temperature-1991-2020-raw-2026-10-29.csv  (iso3, tas_c, tasmax_c, tasmin_c)

Countries the portal has no figure for (for example Antarctica, Kosovo) are left out and listed.
Run: .venv\Scripts\python.exe scripts\fetch_wb_temperature.py
"""
import csv
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
OUT = ROOT / "data/raw/wb-cckp-temperature-1991-2020-raw-2026-10-29.csv"
URL = "https://cckpapi.worldbank.org/cckp/v1/cru-x0.5_climatology_{v}_climatology_annual_1991-2020_mean_historical_cru_ts4.07_mean/{g}?_format=json"
VARS = ("tas", "tasmax", "tasmin")


def fetch(var, codes):
    req = urllib.request.Request(URL.format(v=var, g=",".join(codes)), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    assert data["metadata"]["status"] == "success", data["metadata"]
    return {k: list(v.values())[0] for k, v in data["data"].items()}


def main():
    with open(MASTER, encoding="utf-8-sig") as f:
        codes = sorted({r["iso3"] for r in csv.DictReader(f) if r["iso3"]})
    got = {v: {} for v in VARS}
    for v in VARS:
        for i in range(0, len(codes), 40):
            got[v].update(fetch(v, codes[i:i + 40]))
    rows = [(c, *(got[v].get(c, "") for v in VARS)) for c in codes if c in got["tas"]]
    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["iso3", "tas_c", "tasmax_c", "tasmin_c"])
        w.writerows(rows)
    print(f"{len(rows)} of {len(codes)} codes -> {OUT}")
    print("no figure:", [c for c in codes if c not in got["tas"]])


if __name__ == "__main__":
    main()
