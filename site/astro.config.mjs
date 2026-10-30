import { defineConfig } from 'astro/config';

// Static site. When it goes under a subpath (GitHub Pages project site, or inside the portfolio),
// set `base` here, e.g. base: '/country-extremes/'. All internal links use import.meta.env.BASE_URL.
export default defineConfig({
  output: 'static',
  build: { inlineStylesheets: 'auto' },
});
