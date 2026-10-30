# Country extremes site (Astro)

Static site: home, dashboard, five games and an about page, published at https://matts-maps.github.io/extremes/.

```
npm install        # once
npm run dev        # http://localhost:4321/extremes/
npm run build      # static output in dist/
npm run preview    # serve dist/
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds `site/` and publishes `site/dist` with GitHub Pages (Pages source: GitHub Actions). `base` in `astro.config.mjs` is `/extremes/`; every internal link uses `import.meta.env.BASE_URL`, so changing `base` is the only edit needed to host elsewhere.

## Data

`src/data/*.json` is written by `../scripts/build_site_data.py` from the latest dated JSON in `../data/game` and `../data/dashboard`. Do not edit it by hand. The scripts that prepare the data (`prepare_*.py`, `build_master.py` and so on) are in `../scripts`.

## Structure

- `src/pages/` one page per route: `index`, `dashboard`, `about` and the five games (`higher-lower`, `guess`, `hotter-or-colder`, `wetter-or-drier`, `climate-guess`). The dashboard is not linked from the home page or the menu.
- `src/components/SiteMenu.astro` the header menu (Home, a game drop-down, About); `Logo.astro` the logo.
- `src/layouts/Base.astro` the page shell and the icon sprite.
- `src/scripts/` page logic. The games share code:
  - `game-common.js` units switch, best scores, map markup, chart animator, small helpers
  - `compare-core.js` the "pick one of two countries" flow (higher or lower; `climate-compare.js` for hotter or colder and wetter or drier)
  - `guess-core.js` the "guess the figure" flow (guess the height, climate guess)
- `src/styles/` `game-base.css` is the shared page look (also used by the about page); one stylesheet per page otherwise.

The `game/` and `dashboard/` folders hold the original single-file templates the pages were ported from.
