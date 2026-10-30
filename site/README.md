# Country extremes site (Astro)

Static site: home, dashboard, five games, about page. Built 30 October 2026 from the single-file HTML versions.

```
npm install        # once
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
```

Data: `src/data/*.json`, written by `../scripts/build_site_data.py` (do not edit by hand).
Subpath hosting (GitHub Pages project site, or inside the portfolio): set `base` in `astro.config.mjs`.
Each page is `src/pages/...` plus a script in `src/scripts/` and a stylesheet in `src/styles/`. `game-base.css` and `game-common.js` hold what the five games share.
