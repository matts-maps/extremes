"""Inline the dashboard data into the template and write the single-file dashboard.

Input : dashboard/template.html, data/dashboard/dashboard-data-2026-10-29.json
Output: dashboard/country-extremes-dashboard-2026-10-29.html
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tpl = (ROOT / "dashboard/template.html").read_text(encoding="utf-8")
data = (ROOT / "data/dashboard/dashboard-data-2026-10-29.json").read_text(encoding="utf-8")
assert "/*DATA*/" in tpl
out = ROOT / "dashboard/country-extremes-dashboard-2026-10-29.html"
out.write_text(tpl.replace("/*DATA*/", data.replace("</", "<\\/")), encoding="utf-8")
print(out, f"{out.stat().st_size/1e6:.2f} MB")
