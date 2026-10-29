r"""Fetch the ISO 3166-1 officially assigned code table from Wikipedia (standard library only).

Output: data/iso/iso3166-1-2026-10-29.csv  (name, alpha2, alpha3, numeric, independent)
Run: python scripts\fetch_iso3166.py
"""
import csv, json, re, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data/iso/iso3166-1-2026-10-29.csv"
q = urllib.parse.urlencode({"action": "parse", "page": "ISO_3166-1", "prop": "text|revid", "redirects": 1, "format": "json", "formatversion": 2})
req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": "country-extremes/0.1 (matt.sims1@googlemail.com)"})
data = json.load(urllib.request.urlopen(req, timeout=60))
html = data["parse"]["text"]


class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.tables = []; self.row = None; self.cell = None; self.depth = 0; self.skip = 0
    def handle_starttag(self, tag, a):
        a = dict(a)
        if tag == "table":
            self.tables.append([]); self.depth += 1
        elif tag == "tr": self.row = []
        elif tag in ("td", "th"): self.cell = []
        elif tag == "sup": self.skip += 1
        elif tag == "style": self.skip += 1
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip()); self.cell = None
        elif tag == "tr" and self.row is not None and self.tables:
            self.tables[-1].append(self.row); self.row = None
        elif tag in ("sup", "style"): self.skip -= 1
    def handle_data(self, d):
        if self.cell is not None and not self.skip: self.cell.append(d)


p = P(); p.feed(html)
def ok(r):
    return len(r) >= 6 and re.fullmatch(r"[A-Z]{2}", r[1]) and re.fullmatch(r"[A-Z]{3}", r[2])


best = max(p.tables, key=lambda t: sum(1 for r in t if ok(r)))
rows = [r for r in best if ok(r)]
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh); w.writerow(["name", "alpha2", "alpha3", "numeric", "independent"]); w.writerows([r[:4] + [r[5]] for r in rows])
print(len(rows), "rows, revision", data["parse"]["revid"])
