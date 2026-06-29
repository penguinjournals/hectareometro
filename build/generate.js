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

// Real-world references of roughly each surface, to make every page unique and
// genuinely useful (3 recognisable places/things per size, avoiding repeating
// the football-field figure already given in the first paragraph).
const COMPARISONS = {
  1: [
    'un campo de rugby con sus zonas de marca (~1 ha)',
    'la Plaza Mayor de Madrid (unos 1,2 ha)',
    'una manzana del Ensanche de Barcelona (la «illa» de Cerdà, ~1,2 ha)',
  ],
  100: [
    'el Parque del Retiro de Madrid (unas 118 ha)',
    'la mitad del Principado de Mónaco (todo el país mide 202 ha)',
    'más de dos veces el recinto de la Ciudad del Vaticano (44 ha)',
  ],
  300: [
    'Central Park de Nueva York (unas 341 ha)',
    'el doble del Hyde Park de Londres (142 ha)',
    'la primera sección del Bosque de Chapultepec, en Ciudad de México (~274 ha)',
  ],
  400: [
    'el doble del Principado de Mónaco (202 ha cada uno)',
    'algo más que Central Park de Nueva York (341 ha)',
    'casi tres veces el Hyde Park de Londres (142 ha)',
  ],
  1000: [
    'el Bois de Boulogne de París (unas 846 ha)',
    'el aeropuerto de Londres-Heathrow (~1.270 ha)',
    'casi tres veces Central Park de Nueva York (341 ha)',
  ],
  3000: [
    'el aeropuerto Adolfo Suárez Madrid-Barajas (unas 3.050 ha)',
    'la mitad de la isla de Manhattan (~5.900 ha)',
    'unas nueve veces Central Park de Nueva York (341 ha)',
  ],
  4000: [
    'casi todo el municipio de Bilbao (unas 4.137 ha)',
    'dos tercios de la isla de Manhattan (~5.900 ha)',
    'unas doce veces Central Park de Nueva York (341 ha)',
  ],
  20000: [
    'casi el doble de la ciudad de Barcelona (~10.100 ha)',
    'más que todo el país de Liechtenstein (~16.000 ha)',
    'un tercio del término municipal de Madrid (~60.400 ha)',
  ],
};

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

  const subject = ha === 1 ? 'esta hectárea' : 'estas ' + fmt(ha) + ' hectáreas';
  const drawn = ha === 1 ? 'dibujada' : 'dibujadas';
  const examples = COMPARISONS[ha];
  const examplesBlock = examples
    ? `
      <p>Para hacerte una idea, <b>${haLabel}</b> ocupan más o menos lo mismo que:</p>
      <ul class="examples-list">
${examples.map(e => '        <li>' + e + '</li>').join('\n')}
      </ul>
      <p>Arrastra el mapa hasta tu ciudad y cambia el número de hectáreas para comparar otras superficies al instante.</p>`
    : `
      <p>
        Recuerda que una hectárea es un cuadrado de 100 × 100 metros (10.000 m²). Puedes cambiar el
        número de hectáreas en el recuadro del mapa para comparar otras superficies al instante.
      </p>`;

  const intro = `      <p>
        <b>${haLabel} equivalen a ${m2} metros cuadrados</b> (${km2} km²), es decir, aproximadamente
        <b>${ff} campos de fútbol</b>. Pero una cifra así es difícil de imaginar: arrastra el mapa de
        arriba hasta tu ciudad o un sitio que conozcas para ver ${subject} ${drawn} a escala real.
      </p>${examplesBlock}`;

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
        Dicho de otro modo: <b>una hectárea es más grande que un campo de fútbol</b>, no al revés.
      </p>

      <figure class="ha-vs-field">
        <svg viewBox="0 0 330 316" role="img" xmlns="http://www.w3.org/2000/svg"
             aria-label="Comparación a escala de una hectárea (100 × 100 m) y un campo de fútbol (105 × 68 m) superpuestos">
          <g transform="translate(8,8)">
            <!-- 1 hectárea: 100 × 100 m a escala 1 m = 3 px -->
            <rect x="0" y="0" width="300" height="300" fill="rgba(43,131,208,0.22)" stroke="#2B83D0" stroke-width="2"/>
            <!-- Campo de fútbol: 105 × 68 m, alineado abajo-izquierda -->
            <rect x="0" y="96" width="315" height="204" fill="rgba(37,166,90,0.55)" stroke="#0f7a3d" stroke-width="2"/>
            <line x1="157.5" y1="96" x2="157.5" y2="300" stroke="#ffffff" stroke-width="2"/>
            <circle cx="157.5" cy="198" r="27.45" fill="none" stroke="#ffffff" stroke-width="2"/>
            <circle cx="157.5" cy="198" r="2.5" fill="#ffffff"/>
          </g>
        </svg>
        <figcaption>
          <span class="legend"><span class="swatch swatch-ha"></span> 1 hectárea — 100 × 100 m (10.000 m²)</span>
          <span class="legend"><span class="swatch swatch-field"></span> Campo de fútbol — 105 × 68 m (≈ 7.140 m²)</span>
          <span class="note">Ambos dibujados a la misma escala. El campo es algo más largo, pero mucho más estrecho: ocupa solo unos 0,7 de la hectárea.</span>
        </figcaption>
      </figure>

      <p>
        Por eso la frase «ha ardido la superficie de X campos de fútbol» es engañosa: hace que las
        superficies parezcan mayores de lo que son. Cuando se habla de «300 campos de fútbol», en
        realidad equivale a unas 210 hectáreas. Usa el mapa de arriba para verlo a escala real.
      </p>

      <h2>¿De dónde salen las medidas del campo de fútbol?</h2>
      <p>
        Las dimensiones de un campo de fútbol no son fijas. Las define la <b>Regla 1 (El terreno de
        juego)</b> de las <a href="https://www.theifab.com/laws/latest/the-field-of-play/" target="_blank" rel="noopener">Reglas
        de Juego del IFAB</a>, el organismo que —junto con la FIFA— redacta las reglas del fútbol.
        Según la Regla 1:
      </p>
      <blockquote class="rules-quote" cite="https://www.theifab.com/laws/latest/the-field-of-play/">
        <p><b>Partidos normales:</b> longitud (línea de banda) mínimo 90 m (100 yds) – máximo 120 m (130 yds);
        anchura (línea de meta) mínimo 45 m (50 yds) – máximo 90 m (100 yds).</p>
        <p><b>Partidos internacionales:</b> longitud mínimo 100 m (110 yds) – máximo 110 m (120 yds);
        anchura mínimo 64 m (70 yds) – máximo 75 m (80 yds).</p>
        <footer>— IFAB, <cite>Reglas de Juego, Regla 1: El terreno de juego</cite></footer>
      </blockquote>
      <p>
        Para los cálculos de esta página usamos <b>105 × 68 m</b> (7.140 m²), la medida que la
        <b>FIFA recomienda</b> para los estadios de competiciones de élite y la más habitual en los
        grandes campos. Es solo una referencia: como ves en las reglas, un campo puede ser bastante
        más grande o más pequeño.
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

function writeSitemap() {
  const urls = [`${BASE_URL}/`, ...PAGES.map(p => `${BASE_URL}/${p.slug}/`)];
  const body = urls.map(u => {
    const priority = u === `${BASE_URL}/` ? '1.0' : '0.8';
    return `  <url>\n    <loc>${u}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log(`sitemap.xml written with ${urls.length} URLs`);
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
  writeSitemap();
  console.log(`\n${PAGES.length} pages generated.`);
}

main();

module.exports = { PAGES, BASE_URL };
