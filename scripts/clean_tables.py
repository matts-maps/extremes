"""Clean the raw Wikipedia elevation-extremes table and add status tags.

Reads the newest data/raw/wikipedia-elevation-extremes-raw-*.csv, writes
data/clean/elevation-extremes-clean-<date>.csv. Standard library only.

Run:  python clean_tables.py
"""
import csv
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = sorted((ROOT / "data" / "raw").glob("wikipedia-elevation-extremes-raw-*.csv"))[-1]
OUT = ROOT / "data" / "clean" / RAW.name.replace("-raw-", "-clean-")

# Rows that are not a single country or territory.
AGGREGATE = {"Earth"}
# Tolerance when comparing Wikipedia's span with maximum minus minimum.
SPAN_TOLERANCE_M = 1.0
# Mismatches up to this size are tagged minor (rounding or survey changes).
SPAN_MINOR_M = 10.0


def metres(text):
    """'-85.5 m / -281 ft' -> -85.5; 'sea level' -> 0.0; blank -> None."""
    t = text.replace("−", "-").strip()
    if not t:
        return None
    if t.lower() == "sea level":
        return 0.0
    m = re.match(r"^(-?[\d,]+(?:\.\d+)?)\s*m\b", t)
    return float(m.group(1).replace(",", "")) if m else None


def main():
    with open(RAW, encoding="utf-8-sig", newline="") as f:
        raw = list(csv.DictReader(f))

    lowest_counts = Counter(
        r["Lowest point"] for r in raw if r["Minimum elevation"].strip().lower() != "sea level"
    )
    rows = []
    for r in raw:
        name = r["Country or region"]
        hi_txt, lo_txt = r["Highest point"], r["Lowest point"]
        hi_m, lo_m, span = (
            metres(r["Maximum elevation"]),
            metres(r["Minimum elevation"]),
            metres(r["Elevation span"]),
        )
        lo_sea = r["Minimum elevation"].strip().lower() == "sea level"
        notes = " ".join(r[k] for k in r if k.endswith("__notes"))
        calc = round(hi_m - lo_m, 1) if hi_m is not None and lo_m is not None else None

        flags = []
        if name in AGGREGATE:
            flags.append("aggregate_row")
        if hi_m is None or lo_m is None:
            flags.append("missing_value")
        if span is None:
            flags.append("span_missing")
        elif calc is not None and abs(span - calc) > SPAN_TOLERANCE_M:
            flags.append("span_mismatch_minor" if abs(span - calc) <= SPAN_MINOR_M else "span_mismatch")
        if re.search(r"\bunnamed\b", hi_txt + " " + lo_txt, re.I):
            flags.append("unnamed_point")
        if re.search(r"de jure|de facto|\bor\b|\bif\b|official", hi_txt):
            flags.append("highest_alternatives")
        if " / " in hi_txt and "highest_alternatives" not in flags and "(" not in hi_txt:
            flags.append("highest_alternatives")
        if lo_sea and " / " in lo_txt:
            flags.append("lowest_several_coasts")
        if not lo_sea and lowest_counts[lo_txt] > 1:
            flags.append("lowest_shared")
        if "citation needed" in notes.lower():
            flags.append("citation_needed")

        rows.append(
            {
                "name_wikipedia": name,
                "highest_point": hi_txt,
                "highest_m": hi_m,
                "lowest_point": lo_txt,
                "lowest_m": lo_m,
                "lowest_is_sea_level": lo_sea,
                "span_wikipedia_m": span,
                "span_calculated_m": calc,
                "flags": ";".join(flags),
                "has_footnotes": bool(notes.strip()),
                "source_url": r["source_url"],
                "revision_id": r["revision_id"],
                "fetched": r["fetched"],
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    print(f"{len(rows)} rows -> {OUT}")
    tally = Counter(fl for r in rows for fl in r["flags"].split(";") if fl)
    for fl, n in tally.most_common():
        print(f"  {fl}: {n}")
    for r in rows:
        if "span_mismatch;" in r["flags"] + ";" or "missing" in r["flags"]:
            print(f"  check {r['name_wikipedia']}: wiki span {r['span_wikipedia_m']} vs calculated {r['span_calculated_m']}")


if __name__ == "__main__":
    sys.exit(main())
