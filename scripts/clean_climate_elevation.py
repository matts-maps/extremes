r"""Clean the Wikipedia average-elevation table and the hottest / coldest national records.

Inputs : data/raw/wikipedia-average-elevation-t0-raw-2026-10-29.csv   (List of countries by average elevation)
         data/raw/wikipedia-weather-records-t0-raw-2026-10-29.csv      (List of weather records: highest temperatures)
         data/raw/wikipedia-weather-records-t2-raw-2026-10-29.csv      (List of weather records: lowest temperatures)
         data/master/country-extremes-master-2026-10-29.csv            (names to match; read only)
         data/raw/wikipedia-avg-precipitation-t0-raw-2026-10-29.csv    (List of countries by average annual precipitation)
Output : data/clean/average-precipitation-clean-2026-10-29.csv
         data/clean/average-elevation-clean-2026-10-29.csv
         data/clean/temperature-records-clean-2026-10-29.csv
         data/clean/climate-elevation-match-report-2026-10-29.txt

Wikipedia lists several rows for some countries (Russia by continent, Spain with the Canaries, the United
States by state). One record per master country is kept: the highest hot value, the lowest cold value; the
other rows are named in the tags. Rows for places that are not master countries are reported, not added.

Run: .venv\Scripts\python.exe scripts\clean_climate_elevation.py
"""
import re
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
MASTER = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
CLEAN = ROOT / "data/clean"
STAMP = "2026-10-29"

# Wikipedia name (normalised, brackets removed) -> master country_wikipedia
ALIAS = {
    "westernsahara": "Sahrawi Republic",
    "svalbard": "Svalbard and Jan Mayen",
    "usvirginislands": "United States Virgin Islands",
    "congo": "Republic of the Congo",
    "drcongo": "Democratic Republic of the Congo",
    "bonaire": "Bonaire, Sint Eustatius and Saba",
}
# rows shared between two countries in a disputed area, assigned to the administering country
DISPUTED_ROWS = {
    "India/ Pakistan (disputed territory of Ladakh in Kashmir)": "India",  # Durbuk, Indian-administered Ladakh
    "Pakistan/ India (undemarcated Kashmir area in disputed territory of Kashmir)": "Pakistan",  # Astore, Pakistan-administered
}
CLEAN_PLACE = {"Gabal Katrina at elevation of 2,629 m": "Gabal Katrina"}  # Egypt's cold cell carries a long footnote


def norm(s):
    s = re.sub(r"\(.*?\)", "", s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())


def temp_c(s):
    m = re.match(r"\s*([\u2212-]?\d+(?:\.\d+)?)\s*\u00b0C", s)
    return float(m.group(1).replace("\u2212", "-")) if m else None


def main():
    master = pd.read_csv(MASTER, encoding="utf-8-sig")
    lookup = {norm(n): n for n in master["country_wikipedia"]}
    report = []

    def match(label):
        if label in DISPUTED_ROWS:
            return DISPUTED_ROWS[label]
        k = norm(label)
        return ALIAS.get(k) or lookup.get(k)

    # --- average elevation
    av = pd.read_csv(RAW / "wikipedia-average-elevation-t0-raw-2026-10-29.csv", encoding="utf-8-sig", dtype=str).iloc[1:]
    rows, unmatched = [], []
    for _, r in av.iterrows():
        name = match(r.iloc[0])
        m = pd.to_numeric(str(r.iloc[1]).replace(",", ""), errors="coerce")
        if name is None or pd.isna(m):
            unmatched.append((r.iloc[0], r.iloc[1]))
            continue
        rows.append({"country_wikipedia": name, "avg_elevation_m": float(m), "avg_elevation_label": r.iloc[0],
                     "avg_elevation_revision_id": r["revision_id"], "avg_elevation_source_url": "https://en.wikipedia.org/wiki/List_of_countries_by_average_elevation"})
    pd.DataFrame(rows).to_csv(CLEAN / f"average-elevation-clean-{STAMP}.csv", index=False, encoding="utf-8-sig")
    report.append(f"Average elevation: {len(rows)} rows matched, not matched to a master country: {unmatched}")
    report.append(f"  master countries with no average elevation: {sorted(set(master.country_wikipedia) - {x['country_wikipedia'] for x in rows})}")

    # --- average annual precipitation (a national average, not a wettest-place record)
    pr = pd.read_csv(RAW / "wikipedia-avg-precipitation-t0-raw-2026-10-29.csv", encoding="utf-8-sig", dtype=str, keep_default_na=False)
    prow, punm = [], []
    for _, r in pr.iterrows():
        name = match(r["Country"])
        mm = pd.to_numeric(r["mm/ / year"].replace(",", ""), errors="coerce")
        if name is None or pd.isna(mm):
            punm.append((r["Country"], r["mm/ / year"]))
            continue
        prow.append({"country_wikipedia": name, "avg_precip_mm_per_year": float(mm), "avg_precip_label": r["Country"],
                     "avg_precip_revision_id": r["revision_id"],
                     "avg_precip_source_url": "https://en.wikipedia.org/wiki/List_of_countries_by_average_annual_precipitation"})
    pd.DataFrame(prow).to_csv(CLEAN / f"average-precipitation-clean-{STAMP}.csv", index=False, encoding="utf-8-sig")
    report.append(f"Average precipitation: {len(prow)} rows matched, not matched: {punm}")
    report.append(f"  master countries with no average precipitation: {sorted(set(master.country_wikipedia) - {x['country_wikipedia'] for x in prow})}")

    # --- average temperatures (World Bank, CRU TS 4.07, 1991-2020): annual mean, average daily high, average daily low
    wb = pd.read_csv(RAW / "wb-cckp-temperature-1991-2020-raw-2026-10-29.csv", encoding="utf-8-sig")
    wb = wb.rename(columns={"tas_c": "avg_temp_c", "tasmax_c": "avg_high_c", "tasmin_c": "avg_low_c"})
    bad = wb[~((wb.avg_low_c <= wb.avg_temp_c) & (wb.avg_temp_c <= wb.avg_high_c))]
    wk = pd.read_csv(RAW / "wikipedia-avg-temperature-t0-raw-2026-10-29.csv", encoding="utf-8-sig", dtype=str, keep_default_na=False)
    wk = {match(r["Country / or region"]): temp_c(r["Temperature"]) for _, r in wk.iterrows()}
    iso_to_name = {r.iso3: r.country_wikipedia for r in master[master.in_iso_3166_1].itertuples() if r.iso3 == r.iso3}
    wb["country_wikipedia"] = wb["iso3"].map(iso_to_name)
    wb = wb.dropna(subset=["country_wikipedia"])
    diff = [(n, a, wk[n]) for n, a in zip(wb.country_wikipedia, wb.avg_temp_c) if wk.get(n) is not None and abs(a - wk[n]) > 0.3]
    wb["avg_temp_source_url"] = "https://cckpapi.worldbank.org/ (World Bank Climate Change Knowledge Portal, CRU TS 4.07, 1991-2020)"
    wb.drop(columns="iso3").to_csv(CLEAN / f"average-temperature-clean-{STAMP}.csv", index=False, encoding="utf-8-sig")
    report.append(f"Average temperature: {len(wb)} ISO rows; low <= mean <= high fails for {len(bad)}; differs from Wikipedia list by over 0.3 C for {len(diff)}: {diff[:10]}")

    # --- temperatures
    cand = {"hottest": [], "coldest": []}
    for side, t in (("hottest", "t0"), ("coldest", "t2")):
        w = pd.read_csv(RAW / f"wikipedia-weather-records-{t}-raw-2026-10-29.csv", encoding="utf-8-sig", dtype=str, keep_default_na=False)
        for _, r in w.iterrows():
            label = r["Country/Region"]
            if label == r["Temperature"]:  # continent header row
                continue
            name = match(label)
            c = temp_c(r["Temperature"])
            if name is None or c is None:
                report.append(f"  {side}: not added: {label!r} ({r['Temperature']}) - not a master country")
                continue
            place = r["Town/Location"].strip()
            for k, v in CLEAN_PLACE.items():
                if place.startswith(k):
                    place = v
            cand[side].append({"country_wikipedia": name, "label": label, "c": c, "place": place, "date": r["Date"].strip(),
                               "revision_id": r["revision_id"]})
    out = {}
    for side in cand:
        df = pd.DataFrame(cand[side])
        for name, g in df.groupby("country_wikipedia"):
            g = g.sort_values("c", ascending=(side == "coldest"))
            b = g.iloc[0]
            tags = []
            if " / " in b["place"] or " and " in b["place"] or " / " in b["date"]:
                tags.append("shared")
            if "(then" in b["label"]:
                tags.append("historic_boundary")
            if b["date"] in ("?", "N/A", ""):
                tags.append("date_unknown")
            if b["label"] in DISPUTED_ROWS:
                tags.append("disputed")
            if len(g) > 1:
                tags.append("other_rows:" + "|".join(f"{x.label} {x.c:g}" for x in g.iloc[1:].itertuples()))
            rec = out.setdefault(name, {"country_wikipedia": name})
            rec.update({f"{side}_c": b["c"], f"{side}_place": b["place"], f"{side}_date": b["date"],
                        f"{side}_wikipedia_label": b["label"], f"{side}_tags": ";".join(tags) or "clean",
                        "weather_revision_id": b["revision_id"]})
    res = pd.DataFrame(out.values())
    res["weather_source_url"] = "https://en.wikipedia.org/wiki/List_of_weather_records"
    res.to_csv(CLEAN / f"temperature-records-clean-{STAMP}.csv", index=False, encoding="utf-8-sig")
    allm = set(master.country_wikipedia)
    report.append(f"Temperatures: hottest {res.hottest_c.notna().sum()} countries, coldest {res.coldest_c.notna().sum()}")
    report.append(f"  master countries with no hottest: {sorted(allm - set(res.dropna(subset=['hottest_c']).country_wikipedia))}")
    report.append(f"  master countries with no coldest: {sorted(allm - set(res.dropna(subset=['coldest_c']).country_wikipedia))}")
    (CLEAN / f"climate-elevation-match-report-{STAMP}.txt").write_text("\n".join(report), encoding="utf-8")
    print("\n".join(report))


if __name__ == "__main__":
    main()
