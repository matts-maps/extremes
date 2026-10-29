"""Fetch the Wikipedia highest-point and lowest-point country tables to raw CSV.

Standard library only. Output is untouched cell text (footnote markers removed
from the text and kept in a separate '<column>__notes' field), so cleaning can
be done and checked as its own step.

Run:  python fetch_tables.py
"""
import csv
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

# Both "highest point" and "lowest point" list titles redirect to this one
# table (checked 29 October 2026), so it is fetched once.
PAGES = {"elevation-extremes": "List_of_elevation_extremes_by_country"}
UA = "country-extremes/0.1 (matt.sims1@googlemail.com)"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw"


def fetch_html(page):
    q = urllib.parse.urlencode(
        {"action": "parse", "page": page, "prop": "text|revid", "redirects": 1, "format": "json", "formatversion": 2}
    )
    req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    return data["parse"]["text"], data["parse"]["revid"]


class TableParser(HTMLParser):
    """Collects every <table class=wikitable> as a list of rows of (text, notes)."""

    def __init__(self):
        super().__init__()
        self.tables = []
        self._depth = 0  # table nesting
        self._row = None
        self._cell = None
        self._sup = 0
        self._skip = 0  # style/script
        self._pending = {}  # col index -> (remaining rows, text, notes) for rowspan

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table" and "wikitable" in (a.get("class") or "") and self._depth == 0:
            self._depth = 1
            self.tables.append([])
            self._pending = {}
        elif tag == "table" and self._depth:
            self._depth += 1
        if not self._depth:
            return
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = {
                "text": [], "notes": [],
                "rowspan": int(re.sub(r"\D", "", a.get("rowspan", "1")) or 1),
                "colspan": int(re.sub(r"\D", "", a.get("colspan", "1")) or 1),
            }
        elif tag == "sup" and self._cell is not None:
            self._sup += 1
        elif tag in ("style", "script"):
            self._skip += 1
        elif tag == "br" and self._cell is not None and not self._sup:
            self._cell["text"].append(" / ")

    def handle_endtag(self, tag):
        if not self._depth:
            return
        if tag == "table":
            self._depth -= 1
        elif tag in ("td", "th") and self._cell is not None:
            c = self._cell
            self._cell = None
            self._add_cell(c)
        elif tag == "tr" and self._row is not None:
            self._flush_row()
        elif tag == "sup" and self._sup:
            self._sup -= 1
        elif tag in ("style", "script") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._cell is None or self._skip:
            return
        (self._cell["notes"] if self._sup else self._cell["text"]).append(data)

    def _add_cell(self, c):
        text = re.sub(r"\s+", " ", "".join(c["text"])).strip()
        notes = " ".join("".join(c["notes"]).split())
        for _ in range(c["colspan"]):
            self._row.append({"text": text, "notes": notes, "rowspan": c["rowspan"]})

    def _flush_row(self):
        # Fill columns that are carried down by an earlier rowspan.
        row, out, col, it = self._row, [], 0, iter(self._row)
        cells = list(it)
        i = 0
        while i < len(cells) or col in self._pending:
            if col in self._pending:
                left, text, notes = self._pending[col]
                out.append((text, notes))
                if left > 1:
                    self._pending[col] = (left - 1, text, notes)
                else:
                    del self._pending[col]
            else:
                c = cells[i]
                i += 1
                out.append((c["text"], c["notes"]))
                if c["rowspan"] > 1:
                    self._pending[col] = (c["rowspan"] - 1, c["text"], c["notes"])
            col += 1
        if out:
            self.tables[-1].append(out)
        self._row = None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = date.today().isoformat()
    for key, page in PAGES.items():
        html, revid = fetch_html(page)
        p = TableParser()
        p.feed(html)
        # The main table is the one with the most rows.
        table = max(p.tables, key=len)
        header = [t for t, _ in table[0]]
        rows = table[1:]
        path = OUT / f"wikipedia-{key}-raw-{stamp}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(header + [h + "__notes" for h in header] + ["source_url", "revision_id", "fetched"])
            url = f"https://en.wikipedia.org/wiki/{page}"
            for r in rows:
                r = r + [("", "")] * (len(header) - len(r))
                w.writerow([t for t, _ in r] + [n for _, n in r] + [url, revid, stamp])
        print(f"{key}: {len(rows)} rows, {len(header)} columns {header} -> {path}")
        print(f"  tables found on page: {[len(t) for t in p.tables]}")


if __name__ == "__main__":
    sys.exit(main())
