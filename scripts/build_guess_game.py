"""Inline the game pool into the guess-the-height template and write the single-file game.

Input : game/template-guess.html, data/game/game-pool-2026-10-29.json, data/game/map-data-2026-10-29.json
Output: guess/index.html
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
tpl = (ROOT / "game/template-guess.html").read_text(encoding="utf-8")
data = (ROOT / "data/game/game-pool-2026-10-29.json").read_text(encoding="utf-8")
mapdata = (ROOT / "data/game/map-data-2026-10-29.json").read_text(encoding="utf-8")
assert "/*DATA*/" in tpl and "/*MAPDATA*/" in tpl
out = ROOT / "guess/index.html"
esc = lambda t: t.replace("</", chr(60) + chr(92) + "/")
out.write_text(tpl.replace("/*DATA*/", esc(data)).replace("/*MAPDATA*/", esc(mapdata)), encoding="utf-8")
print(out, f"{out.stat().st_size/1e6:.2f} MB")
