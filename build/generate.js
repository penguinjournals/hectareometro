#!/usr/bin/env node
/*
 * Static landing-page generator for hectareometro.com
 *
 * Generates SEO landing pages for the quantity/comparison queries that already
 * receive impressions in Google Search Console (e.g. "cuanto son 400 hectareas",
 * "cuantos campos de futbol es una hectarea"). Each page reuses the existing app
 * (map preloaded with PRESET_HECTAREAS) plus tailored title/H1/intro/JSON-LD.
 *
 * Usage:  node build/generate.js
 * Output: <slug>/index.html for every page, plus build/pages.json manifest.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const BASE_URL = 'https://hectareometro.com';
const FOOTBALL_FIELD_M2 = 7140;

// es-ES number formatting (matches js/hectareas-utils.js)
function fmt(value, decimals = 0) {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fields(ha) {
  const f = (ha * 10000) / FOOTBALL_FIELD_M2;
  return f < 10 ? fmt(f, 1) : fmt(Math.round(f));
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Hectare quantities to target, derived from Search Console queries.
const QUANTITIES = [1, 100, 300, 400, 1000, 3000, 4000, 20000];

function quantityPage(ha) {
  const noun = ha === 1 ? 'hectárea' : 'hectáreas';
  const slug = ha === 1 ? '1-hectarea' : `${ha}-hectareas`;
  const m2 = fmt(ha * 10000);
  const km2 = fmt(ha / 100, 2);
  const ff = fields(ha);
  const haLabel = `${fmt(ha)} ${noun}`;

  const title = ha === 1
    ? '¿Cuánto es una hectárea? Tamaño, m² y campos de fútbol | Hectareómetro'
    : `¿Cuánto son ${fmt(ha)} hectáreas? Tamaño en un mapa | Hectareómetro`;
  const description = `${haLabel} son ${m2} m² (${km2} km²), unos ${ff} campos de fútbol. Míralo dibujado a escala sobre un mapa real en el Hectareómetro.`;
  const h1 = ha === 1 ? '¿Cuánto es una hectárea?' : `¿Cuánto son ${fmt(ha)} hectáreas?`;

  const intro = `      <p>
        <b>${haLabel} equivalen a ${m2} metros cuadrados</b> (${km2} km²), es decir, aproximadamente
        <b>${ff} campos de fútbol</b>. Pero una cifra así es difícil de imaginar: arrastra el mapa de
        arriba hasta tu ciudad o un sitio que conozcas para ver ${ha === 1 ? 'esta hectárea' : 'estas ' + fmt(ha) + ' hectáreas'} dibujadas a escala real.
      </p>
      <p>
        Recuerda que una hectárea es un cuadrado de 100 × 100 metros (10.000 m²). Puedes cambiar el
        número de hectáreas en el recuadro del mapa para comparar otras superficies al instante.
      </p>`;

  const question = ha === 1 ? '¿Cuánto es una hectárea?' : `¿Cuánto son ${fmt(ha)} hectáreas?`;
  const answer = `${haLabel} son ${m2} metros cuadrados (${km2} km²), aproximadamente ${ff} campos de fútbol.`;

  return { slug, ha, title, description, h1, intro, question, answer, linkLabel: haLabel };
}

function comparisonPage() {
  const ha = 1;
  const slug = 'hectarea-campo-de-futbol';
  const title = '¿A cuántos campos de fútbol equivale una hectárea? | Hectareómetro';
  const description = 'Una hectárea equivale a unos 1,4 campos de fútbol (un campo mide ~0,7 ha). Míralo dibujado a escala sobre un mapa real en el Hectareómetro.';
  const h1 = '¿A cuántos campos de fútbol equivale una hectárea?';
  const intro = `      <p>
        Una hectárea equivale a <b>aproximadamente 1,4 campos de fútbol</b>. Un campo reglamentario
        mide unos 105 × 68 metros (alrededor de 7.140 m²), es decir, unas <b>0,7 hectáreas</b>.
      </p>
      <p>
        Por eso la frase «ha ardido la superficie de X campos de fútbol» es engañosa: hace que las
        superficies parezcan mayores de lo que son. Cuando se habla de «300 campos de fútbol», en
        realidad equivale a unas 210 hectáreas. Usa el mapa de arriba para verlo a escala real.
      </p>`;
  const question = '¿A cuántos campos de fútbol equivale una hectárea?';
  const answer = 'Una hectárea equivale a unos 1,4 campos de fútbol. Un campo reglamentario (~105 × 68 m, unos 7.140 m²) ocupa alrededor de 0,7 hectáreas.';
  return { slug, ha, title, description, h1, intro, question, answer, linkLabel: 'Hectárea vs campo de fútbol' };
}

const PAGES = [...QUANTITIES.map(quantityPage), comparisonPage()];

function buildJsonLd(page) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [{
      '@type': 'Question',
      'name': page.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': page.answer },
    }],
  }, null, 2);
}

function relatedLinksFor(page) {
  return PAGES.filter(p => p.slug !== page.slug)
    .map(p => `        <li><a href="/${p.slug}/">${escapeHtml(p.linkLabel)}</a></li>`)
    .join('\n');
}

function render(page) {
  const canonical = `${BASE_URL}/${page.slug}/`;
  return TEMPLATE
    .replace(/\{\{TITLE\}\}/g, escapeHtml(page.title))
    .replace(/\{\{OG_TITLE\}\}/g, escapeHtml(page.h1))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(page.description))
    .replace(/\{\{CANONICAL\}\}/g, canonical)
    .replace(/\{\{H1\}\}/g, escapeHtml(page.h1))
    .replace(/\{\{INTRO\}\}/g, page.intro)
    .replace(/\{\{HA\}\}/g, String(page.ha))
    .replace(/\{\{RELATED_LINKS\}\}/g, relatedLinksFor(page))
    .replace(/\{\{JSON_LD\}\}/g, buildJsonLd(page));
}

function main() {
  PAGES.forEach(page => {
    const dir = path.join(ROOT, page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(page));
    console.log(`generated /${page.slug}/`);
  });
  // Manifest for reuse (homepage links, sitemap) in later steps.
  const manifest = PAGES.map(p => ({ slug: p.slug, label: p.linkLabel, title: p.title }));
  fs.writeFileSync(path.join(__dirname, 'pages.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n${PAGES.length} pages generated.`);
}

main();

module.exports = { PAGES, BASE_URL };
