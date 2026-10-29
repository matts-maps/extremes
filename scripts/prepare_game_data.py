r"""Build the game question pool from the master file.

Input : data/master/country-extremes-master-2026-10-29.csv
Output: data/game/game-pool-2026-10-29.json

Pool rules: rows with a clean figure and a named point. Lowest points at 0 m (sea level) are left out: ties cannot make a question.

Run: .venv\Scripts\python.exe scripts\prepare_game_data.py
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/master/country-extremes-master-2026-10-29.csv"
OUT = ROOT / "data/game/game-pool-2026-10-29.json"


def entry(r, side):
    return {"id": int(r["master_id"]), "name": r["country_wikipedia"], "type": r["record_type"], "region": r["region"],
            "m": float(r[f"{side}_m"]), "point": r[f"{side}_point"], "status": "clean",
            "lat": float(r[f"{side}_lat"]) if r[f"{side}_lat"] != "" else None,
            "lon": float(r[f"{side}_lon"]) if r[f"{side}_lon"] != "" else None}


def main():
    df = pd.read_csv(SRC, keep_default_na=False)
    df = df[df["in_iso_3166_1"].astype(str) == "True"]  # the 249 ISO 3166-1 codes
    named = df[df["region"] != "Not on map"]
    highest = [entry(r, "highest") for _, r in named.iterrows()
               if r["highest_tags"] == "clean" and r["highest_point"]]
    lowest = [entry(r, "lowest") for _, r in named.iterrows()
              if r["lowest_tags"] == "clean" and r["lowest_point"] and float(r["lowest_m"]) != 0]
    # scale ends use every row with a figure, not only the pool
    top = df.loc[pd.to_numeric(df["highest_m"], errors="coerce").idxmax()]
    bottom = df.loc[pd.to_numeric(df["lowest_m"], errors="coerce").idxmin()]
    top = {"name": top["country_wikipedia"], "highest": {"m": float(top["highest_m"]), "name": top["highest_point"]}}
    bottom = {"name": bottom["country_wikipedia"], "lowest": {"m": float(bottom["lowest_m"]), "name": bottom["lowest_point"]}}
    # display label for the scale ends where the point sits on a shared border
    shared = {"Mount Everest": "Nepal and China", "Dead Sea": "Israel, Jordan and Palestine"}
    top_name = shared.get(top["highest"]["name"], top["name"])
    bottom_name = shared.get(bottom["lowest"]["name"], bottom["name"])
    out = {"highest": highest, "lowest": lowest,
           "extremes": {"highest": {"m": top["highest"]["m"], "name": top_name, "point": top["highest"]["name"]},
                        "lowest": {"m": bottom["lowest"]["m"], "name": bottom_name, "point": bottom["lowest"]["name"]}},
           "source": "Wikipedia, List of elevation extremes by country (revision 1381548721, fetched 29 October 2026), for the countries and territories of the ISO 3166-1 list (Wikipedia, revision 1376647436)."}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"highest pool {len(highest)}, lowest pool {len(lowest)}, extremes {out['extremes']}")


if __name__ == "__main__":
    main()
