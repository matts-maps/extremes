"""Join the cleaned Wikipedia elevation table to the 329 fieldmaps records.

Exact normalised name matches take only the records with that name. A reviewed
alias (ALIASES, to a three-letter iso_3 code) takes every record under the code
that no exact match claimed. Nothing is fuzzy matched. Values are tagged by
piece_scope, because Wikipedia gives one row per country and
several countries are more than one record (Spain, India, Portugal...). Which
piece actually holds each extreme is a phase 2 question.

Inputs : data/clean/wikipedia-elevation-extremes-clean-*.csv
         ../2026-country-lengths/output/records-inventory-2026-10-29.csv
Outputs: data/joined/elevation-extremes-by-record-<date>.csv
         data/joined/join-report-<date>.txt
Run:  python join_to_fieldmaps.py
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLEAN = sorted((ROOT / "data" / "clean").glob("wikipedia-elevation-extremes-clean-*.csv"))[-1]
INVENTORY = ROOT.parent / "2026-country-lengths" / "output" / "records-inventory-2026-10-29.csv"
STAMP = CLEAN.stem.rsplit("-", 3)[-3:]
STAMP = "-".join(STAMP)
OUT_DIR = ROOT / "data" / "joined"

# Wikipedia name (as written) -> iso_3. Reviewed by hand against the first join report.
# Left out on purpose: Bir Tawil, Kosovo, Spratly Islands (no record can be confirmed from names alone).
ALIASES = {
    "Brunei": "BRN", "Cape Verde": "CPV", "Czech Republic": "CZE",
    "Federated States of Micronesia": "FSM", "French Southern and Antarctic Lands": "ATF",
    "Hong Kong": "HKG", "India": "IND", "Ivory Coast": "CIV", "Laos": "LAO", "Macau": "MAC",
    "Moldova": "MDA", "North Korea": "PRK", "Pakistan": "PAK", "Palestine": "PSE",
    "Pitcairn Islands": "PCN", "Portugal": "PRT", "Republic of the Congo": "COG",
    "Russia": "RUS", "Sahrawi Republic": "ESH",
    "Saint Helena, Ascension and Tristan da Cunha": "SHN", "Serbia": "SRB",
    "South Korea": "KOR", "Spain": "ESP", "Svalbard and Jan Mayen": "SJM", "Syria": "SYR",
    "Tanzania": "TZA", "Turkey": "TUR", "United Kingdom": "GBR", "United States": "USA",
    "United States Minor Outlying Islands": "UMI", "Vatican City": "VAT", "Vietnam": "VNM",
    "Wallis and Futuna": "WLF",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\([^)]*\)", " ", s)  # drop "(UK)", "(Neth.)" style suffixes
    s = s.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\bsaint\b", "st", s).strip()


def main():
    with open(CLEAN, encoding="utf-8-sig", newline="") as f:
        wiki = [r for r in csv.DictReader(f) if "aggregate_row" not in r["flags"]]
    with open(INVENTORY, encoding="utf-8-sig", newline="") as f:
        recs = list(csv.DictReader(f))

    by_norm, by_iso = {}, {}
    for r in recs:
        by_norm.setdefault(norm(r["adm0_name"]), []).append(r)
        by_iso.setdefault(r["iso_3"], []).append(r)

    # Pass 1: exact record-name matches take only the records with that name.
    claimed, assigned, wiki_unmatched = {}, [], []  # claimed: record_index -> wiki name
    pending_alias = []
    for w in wiki:
        name = w["name_wikipedia"]
        if name in ALIASES:
            pending_alias.append(w)
            continue
        hits = by_norm.get(norm(name), [])
        if hits and not any(h["record_index"] in claimed for h in hits):
            for h in hits:
                claimed[h["record_index"]] = name
            assigned.append((w, hits, "exact"))
        else:
            wiki_unmatched.append((name, "name matches a record already used" if hits else ""))
    # Pass 2: country-level aliases take every record under the code not claimed above.
    for w in pending_alias:
        hits = [h for h in by_iso.get(ALIASES[w["name_wikipedia"]], []) if h["record_index"] not in claimed]
        if hits:
            for h in hits:
                claimed[h["record_index"]] = w["name_wikipedia"]
            assigned.append((w, hits, "alias"))
        else:
            wiki_unmatched.append((w["name_wikipedia"], "alias code has no free record"))

    matched = []  # (wiki row, record, how, piece_scope)
    for w, hits, how in assigned:
        n = len(by_iso[hits[0]["iso_3"]]) if how == "alias" else len(hits)
        scope = "single_record" if len(hits) == 1 and how == "exact" else f"country_level_{len(hits)}_records"
        for rr in hits:
            matched.append((w, rr, how, scope))
    used = {m[1]["record_index"] for m in matched}
    rec_unmatched = [r for r in recs if r["record_index"] not in used]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"elevation-extremes-by-record-{STAMP}.csv"
    wcols = [c for c in wiki[0] if c not in ("source_url", "revision_id", "fetched")]
    rcols = ["record_index", "adm0_id", "adm0_name", "iso_3", "status_nm", "region1_nm"]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(rcols + ["match_type", "piece_scope"] + wcols + ["source_url", "revision_id", "fetched"])
        for wr, rr, how, scope in sorted(matched, key=lambda m: int(m[1]["record_index"])):
            w.writerow([rr[c] for c in rcols] + [how, scope] + [wr[c] for c in wcols] + [wr["source_url"], wr["revision_id"], wr["fetched"]])
        for rr in rec_unmatched:
            w.writerow([rr[c] for c in rcols] + ["unmatched", ""] + [""] * len(wcols) + ["", "", ""])

    lines = [
        f"Join report {STAMP}",
        f"Wikipedia rows (excluding aggregate): {len(wiki)}",
        f"Fieldmaps records: {len(recs)}",
        f"Wikipedia rows matched: {len(assigned)} ({sum(1 for a in assigned if a[2] == 'exact')} exact, {sum(1 for a in assigned if a[2] == 'alias')} alias); records receiving values: {len(matched)}",
        f"Wikipedia rows with no record: {len(wiki_unmatched)}",
        *[f"  {n} {k}".rstrip() for n, k in wiki_unmatched],
        f"Fieldmaps records with no Wikipedia row: {len(rec_unmatched)}",
        *[f"  {r['record_index']:>3} {r['adm0_name']} [{r['iso_3']}] {r['status_nm']}" for r in rec_unmatched],
    ]
    rep = OUT_DIR / f"join-report-{STAMP}.txt"
    rep.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
