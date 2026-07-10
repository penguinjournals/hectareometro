# Hectareómetro

Static site (GitHub Pages, hectareometro.com) that draws N hectares to scale as a
circle on Google Maps, so people can grasp areas like wildfire burned surface.
It also has a distances tool (`/distancias/`, `/en/distances/`) where the circle
RADIUS is the typed distance (km/m/miles; default km on es, miles on en).
Bilingual: Spanish at the root, English under `/en/`.

## Build

- `node build/generate.js` regenerates every landing page (`<slug>/index.html`,
  `en/<slug>/index.html`), `sitemap.xml` and `build/pages.json`.
- **Never hand-edit generated `*/index.html` pages** — change `build/generate.js`
  or `build/template.html` and regenerate. Hand-maintained pages: `index.html`,
  `en/index.html`, `distancias/index.html`, `en/distances/index.html`. Their
  sitemap entries live in `writeSitemap()` in the generator.
- The navbar and footer markup is duplicated in 5 places (the 4 hand pages +
  `build/template.html`) — edit them in lockstep. Keep the navbar static (not
  `navbar-fixed-top`): a fixed one would fight the map overlays' z-index.

## Structure

- Quantity/comparison pages: driven by `QUANTITIES`/`KEYS` in `build/generate.js`,
  generated in both languages.
- Articles: Spanish-only editorial pages in the `ARTICLES` list in
  `build/generate.js` (e.g. `/hectareas-quemadas-incendios-espana/`). They carry
  their own `path`, hreflang (es + x-default only) and optional map presets.
- Editorial data (e.g. burned hectares per year from EpData) is copied into
  constants in `build/generate.js` with the source URL in a comment. Source CSVs
  are NOT committed to this repo.
- The map tool reads URL params `?ha=&lat=&lon=&z=` (`initializeParametersIfSet()`
  in `js/hectareas-utils.js`). Pages can preset the embedded map via
  `PRESET_HECTAREAS` / `PRESET_ZOOM` / `PRESET_LAT` / `PRESET_LON`
  (read in `js/hectareas.js`).
- The distances tool reads `?d=&u=&lat=&lon=&z=` (`u` in km|m|mi) in
  `js/distances.js`, which loads together with `js/hectareas-utils.js` and
  INSTEAD of `js/hectareas.js` (both define the `initMap` Maps callback).
  No embeddable iframe for distances yet (`iframe.html` is hectares-only).
- The Google Maps API key is referer-restricted to hectareometro.com: on
  localhost the map dies a few seconds after load (RefererNotAllowedMapError).
  Test interactions quickly after load, or trust production.

## SEO checklist — apply to EVERY new feature/page AND to modifications

New pages/sections:

- Unique `<title>` and meta description.
- `<link rel="canonical">`.
- hreflang alternates: es + en + x-default; Spanish-only pages get es + x-default.
- JSON-LD structured data (FAQPage with a question/answer for landing pages;
  WebApplication + FAQPage for tool pages). No HTML inside JSON-LD or meta tags.
- Added to `sitemap.xml` through `writeSitemap()` in `build/generate.js` (never
  by hand) — hand-maintained pages included. Then regenerate. Priorities:
  homes 1.0, section homes (e.g. the distances tool) 0.9, everything else 0.8.
- Internal linking: homepage "Ejemplos: ¿cuánto son…?" block and the
  "Mira otras cantidades" related-links block (`relatedLinks()` in the generator).
  A new SECTION also gets navbar + footer links (5 lockstep locations).
- Descriptive URL slug (e.g. `/hectareas-quemadas-incendios-espana/`).
- Spanish number formatting in copy (thousands with dots: `916.817`).

When MODIFYING existing pages/features:

- If a URL is added, removed or renamed → update `writeSitemap()` and regenerate;
  never leave the sitemap stale.
- Keep title/description/JSON-LD consistent with the visible copy you changed
  (the FAQ `<dl>` and the FAQPage JSON-LD must say the same thing).
- Prefer turning example figures into internal links to the tools, preloaded
  via URL params (`?ha=` / `?d=&u=`) with lat/lon/z chosen so the circle fits
  the viewport.
- Bilingual parity: any content change on an es page gets its mirror on the en
  page (and vice versa) unless the page is deliberately single-language.
