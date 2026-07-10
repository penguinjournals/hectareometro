# Hectareómetro

Static site (GitHub Pages, hectareometro.com) that draws N hectares to scale as a
circle on Google Maps, so people can grasp areas like wildfire burned surface.
Bilingual: Spanish at the root, English under `/en/`.

## Build

- `node build/generate.js` regenerates every landing page (`<slug>/index.html`,
  `en/<slug>/index.html`), `sitemap.xml` and `build/pages.json`.
- **Never hand-edit generated `*/index.html` pages** — change `build/generate.js`
  or `build/template.html` and regenerate. Only the homepages (`index.html`,
  `en/index.html`) are maintained by hand.

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

## SEO checklist — apply to EVERY new feature/page

- Unique `<title>` and meta description.
- `<link rel="canonical">`.
- hreflang alternates: es + en + x-default; Spanish-only pages get es + x-default.
- JSON-LD structured data (FAQPage with a question/answer for landing pages).
- Added to `sitemap.xml` through the generator (never by hand).
- Internal linking: homepage "Ejemplos: ¿cuánto son…?" block and the
  "Mira otras cantidades" related-links block (`relatedLinks()` in the generator).
- Descriptive URL slug (e.g. `/hectareas-quemadas-incendios-espana/`).
- Spanish number formatting in copy (thousands with dots: `916.817`).
