r"""Build the master file: one row per country as listed in the Wikipedia table, with its extremes.

Inputs : data/clean/wikipedia-elevation-extremes-clean-2026-10-29.csv   (253 Wikipedia rows)
         data/joined/elevation-extremes-by-record-2026-10-29.csv        (row -> fieldmaps record link, region, type)
         data/coords/point-coordinates-2026-10-29.csv                   (Wikidata coordinates, used for markers only)
         data/clean/manual-additions-2026-10-29.csv                     (rows added by hand from other Wikipedia pages)
Also   : data/clean/average-elevation-clean-*.csv and temperature-records-clean-*.csv (from clean_climate_elevation.py)
Output : data/master/country-extremes-master-2026-10-29.csv

No elevation model is used. Every figure is the Wikipedia value. Coordinates are kept only where the Wikidata
match for the named point was unambiguous.

Run: .venv\Scripts\python.exe scripts\build_master.py
"""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "data/clean/wikipedia-elevation-extremes-clean-2026-10-29.csv"
JOIN = ROOT / "data/joined/elevation-extremes-by-record-2026-10-29.csv"
COORDS = ROOT / "data/coords/point-coordinates-2026-10-29.csv"
ISO = ROOT / "data/iso/iso3166-1-2026-10-29.csv"
EXTRA = ROOT / "data/clean/manual-additions-2026-10-29.csv"
AVG_ELEV = ROOT / "data/clean/average-elevation-clean-2026-10-29.csv"
PRECIP = ROOT / "data/clean/average-precipitation-clean-2026-10-29.csv"
AVG_TEMP = ROOT / "data/clean/average-temperature-clean-2026-10-29.csv"
TEMPS = ROOT / "data/clean/temperature-records-clean-2026-10-29.csv"
OUT = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
DISPUTED_TYPES = ("Sovereignty unsettled", "Occupied Palestinian Territory", "Joint sovereignty")


def tags(flags, side, disputed_type):
    f = flags.split(";") if flags else []
    t = []
    if side == "highest" and "unnamed_point" in f:
        t.append("unnamed")
    if disputed_type or (side == "highest" and "highest_alternatives" in f):
        t.append("disputed")
    if "span_mismatch" in f:
        t.append("span mismatch")
    if side == "lowest" and ("lowest_shared" in f or "lowest_several_coasts" in f):
        t.append("shared")
    return t or ["clean"]


def main():
    wiki = pd.read_csv(WIKI)
    wiki = wiki[wiki["name_wikipedia"] != "Earth"]  # aggregate row, not a country
    join = pd.read_csv(JOIN)
    coords = pd.read_csv(COORDS)
    rows = []
    for i, w in wiki.reset_index(drop=True).iterrows():
        recs = join[join["name_wikipedia"] == w["name_wikipedia"]].sort_values("record_index")
        flags = "" if pd.isna(w["flags"]) else str(w["flags"])
        disputed = bool(len(recs)) and recs["status_nm"].isin(DISPUTED_TYPES).any()
        row = {
            "master_id": i,
            "country_wikipedia": w["name_wikipedia"],
            "region": recs["region1_nm"].mode().iat[0] if len(recs) else "Not on map",
            "record_type": recs["status_nm"].mode().iat[0] if len(recs) else "",
            "iso3": recs["iso_3"].dropna().mode().iat[0] if recs["iso_3"].notna().any() else "",
            "map_record_indices": ";".join(str(int(x)) for x in recs["record_index"]),
            "map_pieces": len(recs),
        }
        for side in ("highest", "lowest"):
            m = w[f"{side}_m"]
            row[f"{side}_point"] = w[f"{side}_point"] if pd.notna(w[f"{side}_point"]) else ""
            row[f"{side}_m"] = "" if pd.isna(m) else float(m) + 0.0
            c = coords[(coords["name_wikipedia"] == w["name_wikipedia"]) & (coords["kind"] == side)]
            c = c.iloc[0] if len(c) else None
            ok = c is not None and c["status"] == "matched"
            row[f"{side}_lat"] = c["lat"] if ok else ""
            row[f"{side}_lon"] = c["lon"] if ok else ""
            row[f"{side}_coord_status"] = c["status"] if c is not None else ""
            row[f"{side}_wikidata_qid"] = c["qid"] if ok else ""
            row[f"{side}_tags"] = ";".join(tags(flags, side, disputed))
        row["lowest_is_sea_level"] = bool(w["lowest_is_sea_level"])
        row["span_wikipedia_m"] = w["span_wikipedia_m"]
        row["span_calculated_m"] = w["span_calculated_m"]
        row["flags"] = flags
        row["source_url"] = w["source_url"]
        row["revision_id"] = int(w["revision_id"])
        row["fetched"] = w["fetched"]
        rows.append(row)
    # rows added by hand from another Wikipedia page (flagged "added" in the source column)
    for _, x in pd.read_csv(EXTRA, keep_default_na=False).iterrows():
        idx = [int(v) for v in str(x["map_record_indices"]).split(";")]
        recs = join[join["record_index"].isin(idx)]
        c = coords[(coords["name_wikipedia"] == (x["coords_from"] or "__none__")) & (coords["kind"] == "highest")]
        ok = len(c) and c.iloc[0]["status"] == "matched"
        row = {"master_id": len(rows), "country_wikipedia": x["country_wikipedia"], "region": recs["region1_nm"].mode().iat[0],
               "record_type": recs["status_nm"].mode().iat[0], "iso3": x["iso3"], "map_record_indices": ";".join(map(str, idx)),
               "map_pieces": len(idx), "highest_point": x["highest_point"], "highest_m": float(x["highest_m"]),
               "highest_lat": c.iloc[0]["lat"] if ok else "", "highest_lon": c.iloc[0]["lon"] if ok else "",
               "highest_coord_status": "matched" if ok else "", "highest_wikidata_qid": c.iloc[0]["qid"] if ok else "",
               "highest_tags": "clean" if x["highest_point"] else "unnamed", "lowest_point": x["lowest_point"],
               "lowest_m": float(x["lowest_m"]) if x["lowest_m"] != "" else "", "lowest_lat": "", "lowest_lon": "",
               "lowest_coord_status": "", "lowest_wikidata_qid": "", "lowest_tags": "clean" if x["lowest_m"] != "" else "",
               "lowest_is_sea_level": x["lowest_m"] == "0", "span_wikipedia_m": "", "span_calculated_m": "", "flags": "added_from_other_page",
               "source_url": x["source_url"], "revision_id": "", "fetched": "2026-10-29"}
        rows.append(row)
    out = pd.DataFrame(rows)
    # ISO 3166-1 flag: one row per officially assigned code (the row named like the ISO entry, else the one with most map pieces)
    iso = pd.read_csv(ISO, keep_default_na=False)
    out["iso_alpha2"] = ""
    out["iso_name"] = ""
    out["in_iso_3166_1"] = False
    for _, c in iso.iterrows():
        cand = out[out["iso3"] == c["alpha3"]]
        if cand.empty:
            continue
        exact = cand[cand["country_wikipedia"] == c["name"]]
        pick = (exact if len(exact) else cand.sort_values("map_pieces", ascending=False)).index[0]
        out.loc[pick, ["iso_alpha2", "iso_name", "in_iso_3166_1"]] = [c["alpha2"], c["name"], True]
    # average elevation and hottest / coldest records (Wikipedia; run clean_climate_elevation.py first). Blank where Wikipedia has no row.
    for path in (AVG_ELEV, PRECIP, AVG_TEMP, TEMPS):
        out = out.merge(pd.read_csv(path, encoding="utf-8-sig"), on="country_wikipedia", how="left")
    print("average elevation:", out.avg_elevation_m.notna().sum(), "| hottest:", out.hottest_c.notna().sum(), "| coldest:", out.coldest_c.notna().sum())
    print("in ISO 3166-1:", int(out["in_iso_3166_1"].sum()), "of", len(iso), "| not in ISO:", out[~out["in_iso_3166_1"]].country_wikipedia.tolist())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False, encoding="utf-8-sig")
    print(f"{len(out)} rows -> {OUT}")
    print("on map:", (out.map_pieces > 0).sum(), "| not on map:", out[out.map_pieces == 0].country_wikipedia.tolist())
    print("highest blank:", (out.highest_m == "").sum(), "| lowest blank:", (out.lowest_m == "").sum(), out[out.lowest_m == ""].country_wikipedia.tolist())
    print("coords highest:", (out.highest_lat != "").sum(), "lowest:", (out.lowest_lat != "").sum())


if __name__ == "__main__":
    main()
