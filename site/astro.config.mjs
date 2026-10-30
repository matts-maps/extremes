import { defineConfig } from 'astro/config';

// Static site served by GitHub Pages at https://matts-maps.github.io/extremes/ (see .github/workflows/deploy.yml).
// All internal links use import.meta.env.BASE_URL, so changing `base` is the only edit needed to host elsewhere.
export default defineConfig({
  site: 'https://matts-maps.github.io',
  base: '/extremes/',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
});
