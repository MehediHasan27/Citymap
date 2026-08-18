import { defineConfig } from 'vite';

/* base is injected at build time so the same source deploys to either target:
 *   GitHub Pages project site -> /Citymap/   (BASE_PATH set by the workflow)
 *   Vercel / Netlify / any root domain -> /  (default)
 * Anything reading assets from JS must go through the asset() helper in main.js,
 * since Vite only rewrites base-relative URLs in HTML and CSS. */
export default defineConfig({
  base: process.env.BASE_PATH || '/',
});
