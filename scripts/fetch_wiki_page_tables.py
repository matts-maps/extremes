"""Fetch every wikitable on a Wikipedia page to raw CSVs (one per table). Standard library only.

Run: python fetch_wiki_page_tables.py <page_title> <output_prefix>
"""
import csv, sys
from datetime import date
from pathlib import Path
from fetch_tables import fetch_html, TableParser, OUT

def main(page, prefix):
    html, revid = fetch_html(page)
    p = TableParser()
    p.feed(html)
    stamp = date.today().isoformat()
    OUT.mkdir(parents=True, exist_ok=True)
    for n, table in enumerate(p.tables):
        if len(table) < 3:
            continue
        header = [t for t, _ in table[0]]
        path = OUT / f"{prefix}-t{n}-raw-{stamp}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(header + [h + "__notes" for h in header] + ["revision_id", "fetched"])
            for r in table[1:]:
                r = r + [("", "")] * (len(header) - len(r))
                w.writerow([t for t, _ in r[:len(header)]] + [x for _, x in r[:len(header)]] + [revid, stamp])
        print(n, len(table) - 1, header, path.name)
    print("revision", revid)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
