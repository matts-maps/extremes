"""Inline the climate pool into the hotter-colder template and write the single-file game.

Input : game/template-hotter-colder.html, data/game/climate-pool-2026-10-29.json, data/game/map-data-2026-10-29.json
Output: hotter-or-colder/index.html
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tpl = (ROOT / "game/template-hotter-colder.html").read_text(encoding="utf-8")
data = (ROOT / "data/game/climate-pool-2026-10-29.json").read_text(encoding="utf-8")
mapdata = (ROOT / "data/game/map-data-2026-10-29.json").read_text(encoding="utf-8")
assert "/*DATA*/" in tpl and "/*MAPDATA*/" in tpl
out = ROOT / "hotter-or-colder/index.html"
out.parent.mkdir(parents=True, exist_ok=True)
esc = lambda t: t.replace("</", chr(60) + chr(92) + "/")
out.write_text(tpl.replace("/*DATA*/", esc(data)).replace("/*MAPDATA*/", esc(mapdata)), encoding="utf-8")
print(out, f"{out.stat().st_size/1e6:.2f} MB")
