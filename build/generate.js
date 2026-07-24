#!/usr/bin/env node
/*
 * Static landing-page generator for hectareometro.com (bilingual: es / en)
 *
 * Generates SEO landing pages for the quantity/comparison queries that already
 * receive impressions in Google Search Console. Spanish pages live at the root
 * (/400-hectareas/); English pages live under /en/ (/en/400-hectares/). Each
 * page reuses the existing app (map preloaded with PRESET_HECTAREAS) plus
 * tailored title/H1/intro/JSON-LD, hreflang alternates and a language switcher.
 *
 * Usage:  node build/generate.js
 * Output: <slug>/index.html and en/<slug>/index.html for every page, the
 *         sitemap.xml and the build/pages.json manifest.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const TEMPLATE_LITROS = fs.readFileSync(path.join(__dirname, 'template-litros.html'), 'utf8');
const TEMPLATE_KILOS = fs.readFileSync(path.join(__dirname, 'template-kilos.html'), 'utf8');
const TEMPLATE_DISTANCIAS = fs.readFileSync(path.join(__dirname, 'template-distancias.html'), 'utf8');
const BASE_URL = 'https://hectareometro.com';
const FOOTBALL_FIELD_M2 = 7140;
const ACRES_PER_HECTARE = 2.47105;

// The liters/kilos tools' data and pure builders live with the runtime JS so
// the numbers exist only once.
const litersLib = require('../js/liters.js');
const litersData = require('../js/liters-data.js');
const kilosLib = require('../js/kilos.js');
const kilosData = require('../js/kilos-data.js');

const LANGS = ['es', 'en'];
const QUANTITIES = [1, 100, 300, 400, 1000, 3000, 4000, 20000];
const KEYS = [...QUANTITIES, 'comparison'];
// Liters landings: round mid-range figures plus the Olympic pool (2.5M L),
// the headline figure of the family (same round+headline mix as QUANTITIES).
const LITER_QUANTITIES = [100, 500, 1000, 5000, 10000, 100000, 1000000, 2500000];
// Kilos landings: round figures plus the fully loaded 40-tonne truck as the
// headline figure.
const KILO_QUANTITIES = [100, 500, 1000, 5000, 10000, 40000, 100000, 1000000];

// ---- helpers -------------------------------------------------------------

function localeFor(lang) {
  return lang === 'en' ? 'en-GB' : 'es-ES';
}

function fmt(value, decimals = 0, lang = 'es') {
  return value.toLocaleString(localeFor(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fields(ha, lang) {
  const f = (ha * 10000) / FOOTBALL_FIELD_M2;
  return f < 10 ? fmt(f, 1, lang) : fmt(Math.round(f), 0, lang);
}

function acres(ha, lang) {
  const a = ha * ACRES_PER_HECTARE;
  return a < 10 ? fmt(a, 2, lang) : fmt(Math.round(a), 0, lang);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- article dates -------------------------------------------------------

const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

// "2026-07-21" -> "21 de julio de 2026" (es) / "21 July 2026" (en). Parsed by
// components (no Date/timezone shifting).
function formatArticleDate(dateStr, lang) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const month = MONTHS[lang][m - 1];
  return lang === 'es' ? `${d} de ${month} de ${y}` : `${d} ${month} ${y}`;
}

// Byline shown under the H1 of editorial articles: publish date, plus the
// update date when the article was modified later.
function articleDateHtml(page) {
  if (!page.published) return '';
  const lang = page.lang;
  const label = lang === 'es' ? 'Publicado el' : 'Published on';
  let html = `<p class="article-date">${label} <time datetime="${page.published}">${formatArticleDate(page.published, lang)}</time>`;
  if (page.modified && page.modified !== page.published) {
    const upd = lang === 'es' ? ' · actualizado el' : ' · updated on';
    html += `${upd} <time datetime="${page.modified}">${formatArticleDate(page.modified, lang)}</time>`;
  }
  return html + '</p>';
}

// Newest-first: sort a list of article objects by publish date descending
// (stable: articles sharing a date keep their list order).
function byNewest(articles) {
  return articles
    .map((a, i) => [a, i])
    .sort((x, y) => (y[0].published || '').localeCompare(x[0].published || '') || x[1] - y[1])
    .map(pair => pair[0]);
}

// ---- per-language UI chrome (template placeholders) ----------------------

const UI = {
  es: {
    htmlLang: 'es', ogLocale: 'es_ES', siteName: 'Hectareómetro',
    navDistances: 'Distancias', navLiters: 'Litros', navKilos: 'Kilos', navMenu: 'Menú',
    navMeasure: 'Medir una superficie', navMeasureDist: 'Medir distancias', navConverter: 'Conversor',
    converterChipLabel: 'Hectáreas a metros cuadrados',
    overlayPre: '¿Cuánto ocupan', overlayPost: 'hectáreas?',
    shareCta: '¿Te ha servido? Compártelo 👇', shareMore: 'Más opciones de compartir',
    labelLink: 'Link:', labelIframe: 'Iframe:', labelWidth: 'Ancho:', labelHeight: 'Alto:',
    relatedHeading: 'Mira otras cantidades', backText: '← Volver al Hectareómetro',
    switchLabel: 'English',
    literToolPre: '¿Cuánta agua son', literSee: 'Ver',
    literAriaUnit: 'Unidad de volumen', literAriaDraw: 'Unidad del dibujo',
    literUnitOptions: '<option value="l" selected>litros</option>\n      <option value="gal">galones</option>\n      <option value="hm3">hm³</option>',
    relatedHeadingLiters: 'Mira otras cantidades de agua',
    backTextLiters: '← Volver a la herramienta de litros',
    literDownload: 'Descargar como imagen',
    kiloToolPre: '¿Cuánto son', kiloAriaUnit: 'Unidad de peso',
    kiloUnitOptions: '<option value="kg" selected>kilos</option>\n      <option value="lb">libras</option>\n      <option value="t">toneladas</option>',
    relatedHeadingKilos: 'Mira otros pesos',
    backTextKilos: '← Volver a la herramienta de kilos',
    distOverlayPre: '¿Hasta dónde llegaría en', distOverlayPost: '?',
    distAriaUnit: 'Unidad de distancia',
    distUnitOptions: '<option value="km" selected>km</option>\n      <option value="m">metros</option>\n      <option value="mi">millas</option>',
    relatedHeadingDistances: 'Mira otras distancias',
    backTextDistances: '← Volver a la herramienta de distancias',
    navArticles: 'Artículos',
    hubTitle: 'Artículos: cantidades y magnitudes explicadas | Hectareómetro',
    hubDescription: 'Artículos que explican cantidades difíciles de imaginar: hectáreas quemadas en incendios, los litros de una piscina olímpica y más, siempre dibujadas a escala.',
    hubH1: 'Artículos',
    hubIntro: 'Historias y guías sobre cantidades difíciles de imaginar: superficies, volúmenes de agua, pesos… siempre con la cifra dibujada a escala para que se entienda de verdad.',
    hubRead: 'Leer →',
    familyLabels: { hectareas: 'Hectáreas', litros: 'Litros', kilos: 'Kilos', distancias: 'Distancias' },
    allArticles: 'Todos los artículos →',
    articlesHeading: 'Artículos',
  },
  en: {
    htmlLang: 'en', ogLocale: 'en_GB', siteName: 'Hectareometer',
    navDistances: 'Distances', navLiters: 'Liters', navKilos: 'Kilos', navMenu: 'Menu',
    navMeasure: 'Measure an area', navMeasureDist: 'Measure a distance', navConverter: 'Converter',
    converterChipLabel: 'Hectares to square meters',
    overlayPre: 'How big are', overlayPost: 'hectares?',
    shareCta: 'Found it useful? Share it 👇', shareMore: 'More sharing options',
    labelLink: 'Link:', labelIframe: 'Iframe:', labelWidth: 'Width:', labelHeight: 'Height:',
    relatedHeading: 'See other amounts', backText: '← Back to the Hectareometer',
    switchLabel: 'Español',
    literToolPre: 'How much water is', literSee: 'Show',
    literAriaUnit: 'Volume unit', literAriaDraw: 'Drawing unit',
    literUnitOptions: '<option value="gal" selected>gallons</option>\n      <option value="l">litres</option>\n      <option value="acft">acre-feet</option>',
    relatedHeadingLiters: 'See other amounts of water',
    backTextLiters: '← Back to the liters tool',
    literDownload: 'Download as image',
    kiloToolPre: 'How heavy is', kiloAriaUnit: 'Weight unit',
    kiloUnitOptions: '<option value="lb" selected>pounds</option>\n      <option value="kg">kilos</option>\n      <option value="t">tonnes</option>',
    relatedHeadingKilos: 'See other weights',
    backTextKilos: '← Back to the kilos tool',
    distOverlayPre: 'How far would I get in', distOverlayPost: '?',
    distAriaUnit: 'Distance unit',
    distUnitOptions: '<option value="km" selected>km</option>\n      <option value="m">metres</option>\n      <option value="mi">miles</option>',
    relatedHeadingDistances: 'See other distances',
    backTextDistances: '← Back to the distances tool',
    navArticles: 'Articles',
    hubTitle: 'Articles: quantities and magnitudes explained | Hectareometer',
    hubDescription: 'Articles that explain hard-to-picture quantities: the litres in an Olympic swimming pool and more, always drawn to scale.',
    hubH1: 'Articles',
    hubIntro: 'Stories and guides about hard-to-picture quantities: areas, volumes of water, weights… always with the figure drawn to scale so it actually sinks in.',
    hubRead: 'Read →',
    familyLabels: { hectareas: 'Hectares', litros: 'Liters', kilos: 'Kilos', distancias: 'Distances' },
    allArticles: 'All articles →',
    articlesHeading: 'Articles',
  },
};

// ---- URL / slug helpers --------------------------------------------------

function slugFor(lang, key) {
  if (key === 'comparison') {
    return lang === 'es' ? 'hectarea-campo-de-futbol' : 'hectare-football-field';
  }
  const ha = Number(key);
  if (lang === 'es') return ha === 1 ? '1-hectarea' : `${ha}-hectareas`;
  return ha === 1 ? '1-hectare' : `${ha}-hectares`;
}

// Root-relative path, e.g. '/400-hectareas/' or '/en/400-hectares/'
function pathFor(lang, key) {
  const prefix = lang === 'es' ? '' : '/en';
  return `${prefix}/${slugFor(lang, key)}/`;
}

function homePath(lang) {
  return lang === 'es' ? '/' : '/en/';
}

// The distances tool pages are hand-maintained (like the homepages) but the
// generator links to them (navbar/footer) and lists them in the sitemap.
function distancesPath(lang) {
  return lang === 'es' ? '/distancias/' : '/en/distances/';
}

// The liters tool pages are hand-maintained too (see CLAUDE.md).
function litersPath(lang) {
  return lang === 'es' ? '/litros/' : '/en/liters/';
}

// And so are the kilos tool pages.
function kilosPath(lang) {
  return lang === 'es' ? '/kilos/' : '/en/kilos/';
}

// The measure tool (draw a shape on the map, get its area) is hand-maintained.
function measurePath(lang) {
  return lang === 'es' ? '/medir-superficie/' : '/en/measure-area/';
}

// Its distance sibling (draw a route on the map, get its length) is
// hand-maintained too; it shares the measure engine (js/measure.js).
function measureDistancePath(lang) {
  return lang === 'es' ? '/medir-distancias/' : '/en/measure-distance/';
}

// The area converter is hand-maintained too. It is NOT in the navbar (only
// footer, homes and related links), by design.
function converterPath(lang) {
  return lang === 'es' ? '/hectareas-a-metros-cuadrados/' : '/en/hectares-to-square-meters/';
}

// The articles hub, unlike the tool pages, IS generated (writeArticlesHub):
// it lists every editorial article of its language from ALL_ARTICLES, so a
// new article shows up there without touching anything else.
function articlesHubPath(lang) {
  return lang === 'es' ? '/articulos/' : '/en/articles/';
}

function fullUrl(lang, key) {
  return BASE_URL + pathFor(lang, key);
}

// ---- real-world comparisons ---------------------------------------------

const COMPARISONS = {
  es: {
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
  },
  en: {
    1: [
      'a rugby pitch including its in-goal areas (~1 ha)',
      "London's Trafalgar Square (~1.2 ha)",
      "a city block in Barcelona's Eixample (~1.2 ha)",
    ],
    100: [
      "London's Hyde Park (~142 ha)",
      'half of the Principality of Monaco (the whole country is 202 ha)',
      'more than twice the grounds of Vatican City (44 ha)',
    ],
    300: [
      "New York's Central Park (~341 ha)",
      "twice London's Hyde Park (142 ha)",
      'one and a half times the Principality of Monaco (202 ha)',
    ],
    400: [
      'twice the Principality of Monaco (202 ha each)',
      "slightly more than New York's Central Park (341 ha)",
      "almost three times London's Hyde Park (142 ha)",
    ],
    1000: [
      'the Bois de Boulogne in Paris (~846 ha)',
      'London Heathrow airport (~1,270 ha)',
      "almost three times New York's Central Park (341 ha)",
    ],
    3000: [
      'Madrid-Barajas airport (~3,050 ha)',
      'half of the island of Manhattan (~5,900 ha)',
      "about nine times New York's Central Park (341 ha)",
    ],
    4000: [
      'two-thirds of the island of Manhattan (~5,900 ha)',
      "about twelve times New York's Central Park (341 ha)",
      'the Principality of Monaco roughly twenty times over (202 ha)',
    ],
    20000: [
      'larger than the entire country of Liechtenstein (~16,000 ha)',
      'almost twice the city of Paris (~10,500 ha)',
      'over three times the island of Manhattan (~5,900 ha)',
    ],
  },
};

// ---- page content builders ----------------------------------------------

function quantityPage(lang, ha) {
  const m2 = fmt(ha * 10000, 0, lang);
  const km2 = fmt(ha / 100, 2, lang);
  const ff = fields(ha, lang);
  const ac = acres(ha, lang);
  const n = fmt(ha, 0, lang);
  const examples = COMPARISONS[lang][ha];

  if (lang === 'es') {
    const noun = ha === 1 ? 'hectárea' : 'hectáreas';
    const haLabel = `${n} ${noun}`;
    const subject = ha === 1 ? 'esta hectárea' : `estas ${n} hectáreas`;
    const drawn = ha === 1 ? 'dibujada' : 'dibujadas';
    const examplesBlock = `
      <p>Para hacerte una idea, <b>${haLabel}</b> ocupan más o menos lo mismo que:</p>
      <ul class="examples-list">
${examples.map(e => '        <li>' + e + '</li>').join('\n')}
      </ul>
      <p>Arrastra el mapa hasta tu ciudad y cambia el número de hectáreas para comparar otras superficies al instante.</p>`;
    const intro = `      <p>
        <b>${haLabel} equivalen a ${m2} metros cuadrados</b> (${km2} km²), es decir, aproximadamente
        <b>${ff} campos de fútbol</b>. Pero una cifra así es difícil de imaginar: arrastra el mapa de
        arriba hasta tu ciudad o un sitio que conozcas para ver ${subject} ${drawn} a escala real.
      </p>${examplesBlock}`;
    return {
      key: String(ha), lang, ha,
      title: ha === 1
        ? '¿Cuánto es una hectárea? Tamaño, m² y campos de fútbol | Hectareómetro'
        : `¿Cuánto son ${n} hectáreas? Tamaño en un mapa | Hectareómetro`,
      description: `${haLabel} son ${m2} m² (${km2} km²), unos ${ff} campos de fútbol. Míralo dibujado a escala sobre un mapa real en el Hectareómetro.`,
      h1: ha === 1 ? '¿Cuánto es una hectárea?' : `¿Cuánto son ${n} hectáreas?`,
      intro,
      question: ha === 1 ? '¿Cuánto es una hectárea?' : `¿Cuánto son ${n} hectáreas?`,
      answer: `${haLabel} son ${m2} metros cuadrados (${km2} km²), aproximadamente ${ff} campos de fútbol.`,
      linkLabel: haLabel,
    };
  }

  // English
  const noun = ha === 1 ? 'hectare' : 'hectares';
  const haLabel = `${n} ${noun}`;
  const subject = ha === 1 ? 'this hectare' : `these ${n} hectares`;
  const examplesBlock = `
      <p>To picture it, <b>${haLabel}</b> cover roughly the same as:</p>
      <ul class="examples-list">
${examples.map(e => '        <li>' + e + '</li>').join('\n')}
      </ul>
      <p>Drag the map to your city and change the number of hectares to compare other areas instantly.</p>`;
  const intro = `      <p>
        <b>${haLabel} equal ${m2} square metres</b> (${km2} km²) — about <b>${ff} football fields</b>
        or ${ac} acres. But a figure like that is hard to picture: drag the map above to your city or
        a place you know to see ${subject} drawn at real scale.
      </p>${examplesBlock}`;
  return {
    key: String(ha), lang, ha,
    title: ha === 1
      ? 'How big is a hectare? Size in m², acres and football fields | Hectareometer'
      : `How big are ${n} hectares? See it on a map | Hectareometer`,
    description: `${haLabel} are ${m2} m² (${km2} km²), about ${ff} football fields or ${ac} acres. See it drawn to scale on a real map with the Hectareometer.`,
    h1: ha === 1 ? 'How big is a hectare?' : `How big are ${n} hectares?`,
    intro,
    question: ha === 1 ? 'How big is a hectare?' : `How big are ${n} hectares?`,
    answer: `${haLabel} are ${m2} square metres (${km2} km²), about ${ff} football fields or ${ac} acres.`,
    linkLabel: haLabel,
  };
}

function comparisonFigure(lang) {
  const ariaLabel = lang === 'es'
    ? 'Comparación a escala de una hectárea (100 × 100 m) y un campo de fútbol (105 × 68 m) superpuestos'
    : 'To-scale comparison of one hectare (100 × 100 m) and a football pitch (105 × 68 m) overlaid';
  const legendHa = lang === 'es' ? '1 hectárea — 100 × 100 m (10.000 m²)' : '1 hectare — 100 × 100 m (10,000 m²)';
  const legendField = lang === 'es' ? 'Campo de fútbol — 105 × 68 m (≈ 7.140 m²)' : 'Football pitch — 105 × 68 m (≈ 7,140 m²)';
  const note = lang === 'es'
    ? 'Ambos dibujados a la misma escala. El campo es algo más largo, pero mucho más estrecho: ocupa solo unos 0,7 de la hectárea.'
    : 'Both drawn at the same scale. The pitch is a little longer but much narrower: it covers only about 0.7 of the hectare.';
  return `      <figure class="ha-vs-field">
        <svg viewBox="0 0 330 316" role="img" xmlns="http://www.w3.org/2000/svg"
             aria-label="${escapeHtml(ariaLabel)}">
          <g transform="translate(8,8)">
            <rect x="0" y="0" width="300" height="300" fill="rgba(43,131,208,0.22)" stroke="#2B83D0" stroke-width="2"/>
            <rect x="0" y="96" width="315" height="204" fill="rgba(37,166,90,0.55)" stroke="#0f7a3d" stroke-width="2"/>
            <line x1="157.5" y1="96" x2="157.5" y2="300" stroke="#ffffff" stroke-width="2"/>
            <circle cx="157.5" cy="198" r="27.45" fill="none" stroke="#ffffff" stroke-width="2"/>
            <circle cx="157.5" cy="198" r="2.5" fill="#ffffff"/>
          </g>
        </svg>
        <figcaption>
          <span class="legend"><span class="swatch swatch-ha"></span> ${legendHa}</span>
          <span class="legend"><span class="swatch swatch-field"></span> ${legendField}</span>
          <span class="note">${note}</span>
        </figcaption>
      </figure>`;
}

function comparisonPage(lang) {
  const figure = comparisonFigure(lang);
  if (lang === 'es') {
    const intro = `      <p>
        Una hectárea equivale a <b>aproximadamente 1,4 campos de fútbol</b>. Un campo reglamentario
        mide unos 105 × 68 metros (alrededor de 7.140 m²), es decir, unas <b>0,7 hectáreas</b>.
        Dicho de otro modo: <b>una hectárea es más grande que un campo de fútbol</b>, no al revés.
      </p>

${figure}

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
    return {
      key: 'comparison', lang, ha: 1,
      title: '¿A cuántos campos de fútbol equivale una hectárea? | Hectareómetro',
      description: 'Una hectárea equivale a unos 1,4 campos de fútbol (un campo mide ~0,7 ha). Míralo dibujado a escala sobre un mapa real en el Hectareómetro.',
      h1: '¿A cuántos campos de fútbol equivale una hectárea?',
      intro,
      question: '¿A cuántos campos de fútbol equivale una hectárea?',
      answer: 'Una hectárea equivale a unos 1,4 campos de fútbol. Un campo reglamentario (~105 × 68 m, unos 7.140 m²) ocupa alrededor de 0,7 hectáreas.',
      linkLabel: 'Hectárea vs campo de fútbol',
    };
  }

  // English
  const intro = `      <p>
        A hectare is about <b>1.4 football fields</b>. A standard pitch measures roughly 105 × 68 metres
        (around 7,140 m²), which is about <b>0.7 hectares</b>. In other words: <b>a hectare is bigger
        than a football pitch</b>, not the other way round.
      </p>

${figure}

      <p>
        That is why the phrase "an area of X football fields burned down" is misleading: it makes
        surfaces look bigger than they are. When people say "300 football fields", it is really about
        210 hectares. Use the map above to see it at real scale.
      </p>

      <h2>Where do the football-pitch dimensions come from?</h2>
      <p>
        The dimensions of a football pitch are not fixed. They are set by <b>Law 1 (The Field of Play)</b>
        of the <a href="https://www.theifab.com/laws/latest/the-field-of-play/" target="_blank" rel="noopener">IFAB
        Laws of the Game</a>, the body that — together with FIFA — writes the rules of football.
        According to Law 1:
      </p>
      <blockquote class="rules-quote" cite="https://www.theifab.com/laws/latest/the-field-of-play/">
        <p><b>Normal matches:</b> length (touchline) minimum 90 m (100 yds) – maximum 120 m (130 yds);
        width (goal line) minimum 45 m (50 yds) – maximum 90 m (100 yds).</p>
        <p><b>International matches:</b> length minimum 100 m (110 yds) – maximum 110 m (120 yds);
        width minimum 64 m (70 yds) – maximum 75 m (80 yds).</p>
        <footer>— IFAB, <cite>Laws of the Game, Law 1: The Field of Play</cite></footer>
      </blockquote>
      <p>
        For the maths on this page we use <b>105 × 68 m</b> (7,140 m²), the size <b>FIFA recommends</b>
        for elite-competition stadiums and the most common one at big grounds. It is only a reference:
        as the rules show, a pitch can be quite a bit larger or smaller.
      </p>`;
  return {
    key: 'comparison', lang, ha: 1,
    title: 'How many football fields is a hectare? | Hectareometer',
    description: 'A hectare is about 1.4 football fields (a pitch is ~0.7 ha). See it drawn to scale on a real map with the Hectareometer.',
    h1: 'How many football fields is a hectare?',
    intro,
    question: 'How many football fields is a hectare?',
    answer: 'A hectare is about 1.4 football fields. A standard pitch (~105 × 68 m, about 7,140 m²) covers roughly 0.7 hectares.',
    linkLabel: 'Hectare vs football field',
  };
}

function buildPage(lang, key) {
  return key === 'comparison' ? comparisonPage(lang) : quantityPage(lang, Number(key));
}

// ---- editorial articles (Spanish-only) ------------------------------------

const EPDATA_URL = 'https://www.epdata.es/hectareas-quemadas-incendios-forestales-espana/d04011b5-4a23-4425-ad44-fb2623305f88';
const MADRID = { lat: 40.418284251687076, lon: -3.6874296855236155 };

// Superficie forestal quemada por año en España. Fuente: Ministerio de
// Agricultura y Pesca, Alimentación y Medio Ambiente, serie recopilada por
// EpData (EPDATA_URL). `towns` son términos municipales españoles (superficie
// en km²; 1 km² = 100 ha) cuya suma se aproxima a lo quemado ese año.
const BURNED_BY_YEAR = [
  { year: 2020, ha: 69706.50, towns: 'Madrid + Alcalá de Henares (692 km²)' },
  { year: 2021, ha: 92251.45, towns: 'Cuenca (911 km²)' },
  { year: 2022, ha: 263218.83, towns: 'Cáceres + Murcia (2.632 km²)' },
  { year: 2023, ha: 89135.67, towns: 'Murcia (882 km²)' },
  { year: 2024, ha: 47711.13, towns: 'Alcañiz (472 km²)' },
  { year: 2025, ha: 354793.50, towns: 'Cáceres + Jerez de la Frontera + Ejea de los Caballeros (3.548 km²)' },
];
const TOTAL_TOWNS = 'Cáceres + Lorca + Badajoz + Córdoba + Jerez de la Frontera + Albacete + Antequera (9.184 km²)';

// Récords de la serie histórica completa (1961-2025), citados en el texto.
const BURNED_1985 = 484475.20; // el año con más superficie quemada de la serie
const BURNED_1994 = 437602.50; // el segundo peor, referencia habitual

// Link to the tool with the circle centred on Madrid, zoomed out enough for
// the whole circle to fit in the viewport.
function madridMapUrl(ha) {
  const zoom = ha > 500000 ? 8 : ha > 150000 ? 9 : 10;
  return `${BASE_URL}/?ha=${Math.round(ha)}&lat=${MADRID.lat}&lon=${MADRID.lon}&z=${zoom}`;
}

function burnedAreaArticle() {
  const total = BURNED_BY_YEAR.reduce((sum, r) => sum + r.ha, 0);
  const totalLabel = fmt(Math.round(total), 0);
  const byYear = {};
  BURNED_BY_YEAR.forEach(r => { byYear[r.year] = r.ha; });
  const rows = BURNED_BY_YEAR.map(r =>
    `          <tr><td>${r.year}</td><td><a href="${madridMapUrl(r.ha)}">${fmt(r.ha, 2)} ha</a></td><td>≈ ${r.towns}</td></tr>`
  ).join('\n');
  const intro = `      <p>
        Entre 2020 y 2025 han ardido en España
        <b><a href="${madridMapUrl(total)}">${totalLabel} hectáreas</a></b> en incendios forestales.
        Es una cifra tan grande que cuesta imaginarla: equivale a 9.168 km², más que
        toda la Comunidad de Madrid (unas 802.800 ha) y cerca de 1,3 millones de campos de fútbol.
        Pincha en el enlace para ver esa superficie dibujada como un círculo con centro en Madrid,
        y arrastra después el mapa hasta tu ciudad para verla sobre un lugar que conozcas.
      </p>
      <p>
        No todos los años son iguales. <b>2025 fue con diferencia el peor año del periodo</b>, con
        <a href="${madridMapUrl(byYear[2025])}">casi 355.000 hectáreas quemadas</a>, el dato anual
        más alto en España desde 1994, cuando ardieron
        <a href="${madridMapUrl(BURNED_1994)}">437.602 hectáreas</a>. Le sigue 2022, con
        <a href="${madridMapUrl(byYear[2022])}">más de 263.000 hectáreas</a>. En el otro extremo,
        2024 fue el año más benigno, con <a href="${madridMapUrl(byYear[2024])}">menos de 48.000</a>.
      </p>
      <p>
        Mirando la serie histórica completa, que arranca en 1961, el peor año del que tenemos datos
        sigue siendo <b>1985</b>: aquel año ardieron
        <a href="${madridMapUrl(BURNED_1985)}">484.475 hectáreas</a>, más de la mitad de todo lo
        quemado entre 2020 y 2025 junto.
      </p>

      <h2>Hectáreas quemadas por año en España (2020-2025)</h2>
      <p>Pincha en cualquier cifra para verla dibujada a escala sobre el mapa, con centro en Madrid:</p>
      <table class="equiv-table equiv-table-wide">
        <thead><tr><th>Año</th><th>Hectáreas quemadas</th><th>Municipios con esta superficie</th></tr></thead>
        <tbody>
${rows}
          <tr><td><b>Total 2020-2025</b></td><td><b><a href="${madridMapUrl(total)}">${fmt(total, 2)} ha</a></b></td><td>≈ ${TOTAL_TOWNS}</td></tr>
        </tbody>
      </table>
      <p>
        La tercera columna compara cada año con la superficie del término municipal de municipios
        españoles (1 km² son 100 hectáreas): por ejemplo, solo lo quemado en 2022 equivale a los
        términos municipales de Cáceres y Murcia juntos.
      </p>
      <p>
        Como ves, estos símiles son difíciles de visualizar en la cabeza, ¿verdad? Pues por eso
        creamos el Hectareómetro: dibuja el círculo, llévalo encima de tu casa y verás cómo se te
        hace más fácil.
      </p>

      <h2>¿De dónde salen los datos?</h2>
      <p>
        Los datos de superficie forestal quemada proceden de las estadísticas del Ministerio de
        Agricultura y Pesca, Alimentación y Medio Ambiente.
        <a href="${EPDATA_URL}" target="_blank" rel="noopener">Gracias al equipo de EpData por
        recolectar estos datos</a>.
      </p>`;
  return {
    key: 'burned-area-spain', lang: 'es', ha: Math.round(total),
    family: 'hectareas', published: '2026-07-09', modified: '2026-07-09',
    slug: 'hectareas-quemadas-incendios-espana',
    path: '/hectareas-quemadas-incendios-espana/',
    presetExtra: ` var PRESET_ZOOM = 8; var PRESET_LAT = ${MADRID.lat}; var PRESET_LON = ${MADRID.lon};`,
    title: 'Hectáreas quemadas en incendios forestales en España (2020-2025) | Hectareómetro',
    description: `Entre 2020 y 2025 ardieron en España ${totalLabel} hectáreas en incendios forestales, más que toda la Comunidad de Madrid. Míralo dibujado a escala sobre un mapa real.`,
    h1: '¿Cuánta superficie se ha quemado en España en incendios forestales?',
    intro,
    question: '¿Cuántas hectáreas se han quemado en España en incendios forestales entre 2020 y 2025?',
    answer: `Entre 2020 y 2025 se quemaron unas ${totalLabel} hectáreas en incendios forestales en España (9.168 km², más que la superficie de la Comunidad de Madrid). El peor año del periodo fue 2025, con casi 355.000 hectáreas, el dato más alto desde 1994; el récord de la serie histórica (1961-2025) sigue siendo de 1985, con 484.475 hectáreas.`,
    linkLabel: 'Hectáreas quemadas en incendios en España (2020-2025)',
  };
}

// ¿Cuánto ocupan los centros de datos de AWS en Aragón? Editorial es-only
// (familia hectáreas). Cifras validadas vía web el 2026-07-24:
//   - Superficie ~800 ha; 30 edificios de centros de datos, 10 subestaciones
//     eléctricas y 12 edificios auxiliares, en 11 campus repartidos por las tres
//     provincias aragonesas. eldiario.es (30 edificios / 10 subestaciones):
//     https://www.eldiario.es/aragon/economia/expansion-amazon-aragon-incluye-30-edificios-centros-datos-10-subestaciones_1_13131240.html
//   - Inversión 33.700 M€ hasta 2035; ~29.900 empleos/año y 31.700 M€ al PIB
//     nacional (estimaciones del propio AWS). Plan de Interés General de Aragón
//     (PIGA): https://www.aragon.es/-/expansion-aws-aragon
//   - Energía: la ampliación sumará más de 10.800 GWh/año, más que todo el
//     consumo eléctrico actual de Aragón.
//   - Agua: los centros de datos de Amazon en Aragón emplearon unos 68 millones
//     de litros en 2025 (El Economista):
//     https://www.eleconomista.es/tecnologia/noticias/13965821/06/26/los-centros-de-datos-de-amazon-en-aragon-emplearon-68-millones-de-litros-de-agua.html
//     El permiso original contemplaba 36,4 M L/año por centro y la empresa pidió
//     subir a 53,9 M L/año (+48 %); ~90 % del año se refrigera con aire (free
//     cooling) y solo con calor extremo se usa refrigeración evaporativa (agua).
//   - Litigio: Ecologistas en Acción Aragón promueve el primer litigio contra
//     un centro de datos en España, contra el PIGA. Climática:
//     https://climatica.coop/aragon-primer-litigio-centros-de-datos-espana-amazon/
const AWS_ARAGON = {
  ha: 800,
  investMeur: 33700,
  jobs: 29900,
  gwhYear: 10800,
  water2025L: 68000000,
  waterPermitPerCenterL: 36400000,
  waterRequestedPerCenterL: 53900000,
};

function awsAragonArticle() {
  const a = AWS_ARAGON;
  const ELDIARIO_URL = 'https://www.eldiario.es/aragon/economia/expansion-amazon-aragon-incluye-30-edificios-centros-datos-10-subestaciones_1_13131240.html';
  const PIGA_URL = 'https://www.aragon.es/-/expansion-aws-aragon';
  const ECONOMISTA_URL = 'https://www.eleconomista.es/tecnologia/noticias/13965821/06/26/los-centros-de-datos-de-amazon-en-aragon-emplearon-68-millones-de-litros-de-agua.html';
  const CLIMATICA_URL = 'https://climatica.coop/aragon-primer-litigio-centros-de-datos-espana-amazon/';
  // Circle of 800 ha (8 km²) centred on Zaragoza, zoomed so it fits.
  const mapUrl = `/?ha=${a.ha}&lat=41.6488&lon=-0.8891&z=13`;
  // es-ES leaves 4-digit numbers ungrouped ("1120"); force the thousands dot.
  const fmtG = n => n.toLocaleString('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
  const pitchesLabel = fmtG(Math.round(a.ha / 0.714)); // 1.120 (FIFA pitch ≈ 0,714 ha)
  const pools = Math.round(a.water2025L / 2500000); // piscinas olímpicas
  const investLabel = fmt(a.investMeur, 0); // 33.700
  const jobsLabel = fmt(a.jobs, 0);
  const gwhLabel = fmt(a.gwhYear, 0);
  const water2025Label = fmt(a.water2025L, 0);
  const intro = `      <p>
        Amazon Web Services (AWS) está construyendo en Aragón una de las mayores concentraciones de
        centros de datos de Europa: <b>${investLabel} millones de euros</b> de inversión hasta 2035 y unas
        <b><a href="${mapUrl}">${a.ha} hectáreas</a></b> de suelo ocupado, repartidas en 11 campus por las
        tres provincias (Zaragoza, Huesca y Teruel). Pincha en el enlace para ver esas 800 hectáreas
        dibujadas como un círculo sobre Zaragoza, y arrastra el mapa hasta tu ciudad para hacerte una idea.
      </p>
      <p>
        Ochocientas hectáreas son <b>8 km²</b>: alrededor de <b>${pitchesLabel} campos de fútbol</b>
        (cada uno, <a href="/hectarea-campo-de-futbol/">unas 0,7 hectáreas</a>) o más de seis veces el
        parque del Retiro de Madrid. Es la huella de una infraestructura que, sobre el papel, apenas se ve
        —naves bajas y subestaciones—, pero que en el territorio pesa tanto por el suelo que ocupa como por
        el agua y la electricidad que consume.
      </p>

      <h2>800 hectáreas de centros de datos: cuánto es eso</h2>
      <p>Lo que el <a href="${PIGA_URL}" target="_blank" rel="noopener">Plan de Interés General de Aragón</a>
        autoriza a AWS, en cifras:</p>
      <table class="equiv-table">
        <thead><tr><th>La expansión de AWS en Aragón…</th><th>Cifra</th></tr></thead>
        <tbody>
          <tr><td>Superficie ocupada</td><td><a href="${mapUrl}">≈ ${a.ha} hectáreas</a> (8 km²)</td></tr>
          <tr><td>En campos de fútbol</td><td>unos ${pitchesLabel}</td></tr>
          <tr><td>Edificios de centros de datos</td><td>30</td></tr>
          <tr><td>Subestaciones eléctricas</td><td>10</td></tr>
          <tr><td>Inversión hasta 2035</td><td>${investLabel} millones de euros</td></tr>
          <tr><td>Empleo estimado (dato de AWS)</td><td>~${jobsLabel} puestos al año</td></tr>
        </tbody>
      </table>
      <p>
        Las cifras de infraestructura proceden del expediente del PIGA y de la información publicada por
        <a href="${ELDIARIO_URL}" target="_blank" rel="noopener">eldiario.es</a>; las de empleo e inversión
        son estimaciones del propio Amazon.
      </p>

      <h2>El otro coste: agua y electricidad</h2>
      <p>
        Un centro de datos no solo ocupa suelo: para enfriar los servidores gasta <b>agua</b> y para
        alimentarlos, <b>electricidad</b>. En 2025 los centros de datos de Amazon en Aragón emplearon unos
        <b><a href="/litros/?l=${a.water2025L}">${water2025Label} litros de agua</a></b> —el equivalente a unas
        ${pools} <a href="/cuantos-litros-piscina-olimpica/">piscinas olímpicas</a>—, según
        <a href="${ECONOMISTA_URL}" target="_blank" rel="noopener">El Economista</a>. Buena parte del año la
        refrigeración se hace solo con aire; el agua entra sobre todo en los días de calor extremo, cuando
        más escasea. El permiso original preveía 36,4 millones de litros al año por centro y la empresa ha
        pedido elevarlo a 53,9 millones (un 48 % más) por los veranos cada vez más cálidos.
      </p>
      <p>
        En electricidad, la ampliación sumará más de <b>${gwhLabel} GWh al año</b>: más que <b>todo el consumo
        eléctrico actual de Aragón</b>. De ahí que el proyecto reavive el debate sobre si hay capacidad
        renovable suficiente y sobre qué otros usos —o industrias— quedan desplazados.
      </p>

      <h2>La polémica: el primer litigio contra un centro de datos en España</h2>
      <p>
        La escala del plan ha abierto la <b>primera batalla judicial contra los centros de datos en España</b>.
        Ecologistas en Acción Aragón ha promovido un
        <a href="${CLIMATICA_URL}" target="_blank" rel="noopener">litigio contra el PIGA</a> que autoriza las
        ampliaciones de AWS, denunciando un modelo de expansión que, dicen, «secuestra el agua, la energía y el
        futuro» de la comunidad. El proyecto, a la vez, es presentado por el Gobierno de Aragón y por Amazon
        como una palanca de inversión y empleo. Dibujar sus 800 hectáreas ayuda a poner en perspectiva de qué
        tamaño de infraestructura estamos hablando.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántas hectáreas ocuparán los centros de datos de AWS en Aragón?</dt>
        <dd>Unas <b>800 hectáreas</b> (8 km²), repartidas en 11 campus por las tres provincias aragonesas,
          con 30 edificios de centros de datos y 10 subestaciones eléctricas. Equivale a unos
          ${pitchesLabel} campos de fútbol.</dd>

        <dt>¿Cuánto va a invertir Amazon en Aragón?</dt>
        <dd>AWS ha anunciado una inversión de <b>${investLabel} millones de euros</b> hasta 2035, con una
          estimación de unos ${jobsLabel} empleos al año (dato de la propia empresa).</dd>

        <dt>¿Cuánta agua consume un centro de datos de Amazon en Aragón?</dt>
        <dd>En 2025, los centros de datos de Amazon en Aragón emplearon unos <b>68 millones de litros</b> de
          agua (unas ${pools} piscinas olímpicas). El permiso contempla 36,4 millones de litros al año por
          centro, y la empresa ha pedido subirlo a 53,9 millones.</dd>

        <dt>¿Cuánta electricidad consumirán?</dt>
        <dd>La ampliación sumará más de <b>10.800 GWh al año</b>, más que todo el consumo eléctrico actual de
          Aragón.</dd>
      </dl>
      <p>
        ¿Quieres ver otras superficies a escala? Prueba el <a href="/">Hectareómetro</a>, compara
        <a href="/hectarea-campo-de-futbol/">una hectárea con un campo de fútbol</a> o mira
        <a href="/hectareas-quemadas-incendios-espana/">cuánta superficie arde en los incendios de España</a>.
        Y si te interesa el agua, tienes la <a href="/litros/">herramienta de litros</a> y
        <a href="/cuanto-es-un-hectometro-cubico/">qué es un hectómetro cúbico</a>.
      </p>`;
  return {
    key: 'aws-aragon-data-centers', lang: 'es', ha: a.ha,
    family: 'hectareas', published: '2026-07-24', modified: '2026-07-24',
    slug: 'cuanto-ocupan-centros-datos-aws-aragon',
    path: '/cuanto-ocupan-centros-datos-aws-aragon/',
    presetExtra: ' var PRESET_ZOOM = 13; var PRESET_LAT = 41.6488; var PRESET_LON = -0.8891;',
    title: '¿Cuánto ocupan los centros de datos de AWS (Amazon) en Aragón? | Hectareómetro',
    description: `Amazon (AWS) invertirá ${investLabel} millones y ocupará unas 800 hectáreas con sus centros de datos en Aragón: unos ${pitchesLabel} campos de fútbol. Míralo dibujado a escala, con su consumo de agua y electricidad.`,
    h1: '¿Cuánta superficie ocupan los centros de datos de AWS en Aragón?',
    intro,
    question: '¿Cuántas hectáreas ocupan los centros de datos de AWS en Aragón?',
    answer: `Los centros de datos de AWS (Amazon) en Aragón ocuparán unas 800 hectáreas (8 km², unos ${pitchesLabel} campos de fútbol), repartidas en 11 campus por las tres provincias, con una inversión de ${investLabel} millones de euros hasta 2035.`,
    faqs: [
      { q: '¿Cuántas hectáreas ocuparán los centros de datos de AWS en Aragón?', a: `Unas 800 hectáreas (8 km²), repartidas en 11 campus por las tres provincias aragonesas, con 30 edificios de centros de datos y 10 subestaciones eléctricas. Equivale a unos ${pitchesLabel} campos de fútbol.` },
      { q: '¿Cuánto va a invertir Amazon en Aragón?', a: `AWS ha anunciado una inversión de ${investLabel} millones de euros hasta 2035, con una estimación de unos ${jobsLabel} empleos al año (dato de la propia empresa).` },
      { q: '¿Cuánta agua consume un centro de datos de Amazon en Aragón?', a: `En 2025, los centros de datos de Amazon en Aragón emplearon unos 68 millones de litros de agua (unas ${pools} piscinas olímpicas). El permiso contempla 36,4 millones de litros al año por centro, y la empresa ha pedido subirlo a 53,9 millones.` },
      { q: '¿Cuánta electricidad consumirán?', a: 'La ampliación sumará más de 10.800 GWh al año, más que todo el consumo eléctrico actual de Aragón.' },
    ],
    linkLabel: 'Centros de datos de AWS en Aragón',
  };
}

const ARTICLES = [burnedAreaArticle(), awsAragonArticle()];

// ---- liters landing pages ------------------------------------------------

function literSlugFor(lang, l) {
  return lang === 'es' ? `${l}-litros` : `${l}-liters`;
}

function literPathFor(lang, l) {
  const prefix = lang === 'es' ? '' : '/en';
  return `${prefix}/${literSlugFor(lang, l)}/`;
}

function literFullUrl(lang, l) {
  return BASE_URL + literPathFor(lang, l);
}

function buildLiterHreflang(l) {
  const lines = LANGS.map(lg => `<link rel="alternate" hreflang="${lg}" href="${literFullUrl(lg, l)}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${literFullUrl('es', l)}">`);
  return lines.join('\n');
}

function buildLiterLangSwitch(lang, l) {
  const other = lang === 'es' ? 'en' : 'es';
  return `<a href="${literPathFor(other, l)}" hreflang="${other}">${UI[lang].switchLabel}</a>`;
}

// Amount chips + the tool link; liters articles moved to relatedArticlesBlock.
function relatedLiterLinks(lang, currentKey) {
  const links = LITER_QUANTITIES.filter(l => l !== currentKey)
    .map(l => `        <li><a href="${literPathFor(lang, l)}">${escapeHtml(literPage(lang, l).linkLabel)}</a></li>`);
  const toolLabel = lang === 'es' ? 'La herramienta de litros' : 'The liters tool';
  links.push(`        <li><a href="${litersPath(lang)}">${toolLabel}</a></li>`);
  return links.join('\n');
}

// In Spanish, an exact million takes "de": "1.000.000 de litros".
function literNoun(lang, l) {
  const n = fmt(l, 0, lang);
  if (lang === 'es') {
    return l >= 1000000 && l % 1000000 === 0 ? `${n} de litros` : `${n} litros`;
  }
  return `${n} litres`;
}

function literPage(lang, l) {
  const unit = litersLib.pickLiterUnit(l);
  const picto = litersLib.buildPictogram(l, unit, lang);
  const phraseHtml = litersLib.buildLiterPhrase(l, unit.id, lang);
  const phrasePlain = phraseHtml.replace(/<[^>]+>/g, '').replace(/^≈ /, '');
  const countPlain = picto.countText.replace(/^≈ /, '');
  const noun = literNoun(lang, l);
  const m3 = l / 1000;
  const m3Text = fmt(m3, m3 < 10 ? 1 : 0, lang);
  const gal = l / litersData.GALLON_LITERS;
  const galText = fmt(Math.round(gal), 0, lang);

  if (lang === 'es') {
    // "¿Cuánto ES un 1.000.000 de litros?" but "¿Cuánto SON 500 litros?".
    const verb = l >= 1000000 && l % 1000000 === 0 ? 'es' : 'son';
    const title = `¿Cuánto ${verb} ${noun} de agua? Visualízalo con iconos | Hectareómetro`;
    const h1 = `¿Cuánto ${verb} ${noun} de agua?`;
    const description = `¿Cuánto ${verb} ${noun}? Aproximadamente ${countPlain}: ${phrasePlain}. Míralo dibujado con iconos, de vasos de agua a piscinas olímpicas.`;
    const answer = `${noun.charAt(0).toUpperCase() + noun.slice(1)} de agua son aproximadamente ${countPlain}, es decir, ${phrasePlain}. En otras unidades: ${m3Text} m³ o unos ${galText} galones.`;
    const intro = [
      `<p>El dibujo de arriba muestra <b>${noun} de agua</b> como ${countPlain}: cada icono representa ${unit.es.legend}. Es ${phraseHtml.replace(/^≈ /, 'aproximadamente ')}.</p>`,
      `<p>En otras unidades, ${noun} son <b>${m3Text} metros cúbicos</b> o unos <b>${galText} galones</b>. Cambia el número en la herramienta o elige otra referencia para el dibujo (vasos, bañeras, camiones cisterna, piscinas olímpicas…) con el selector «Ver».</p>`,
    ].join('\n      ');
    return {
      section: 'litros', lang, key: l, l, title, description, h1, intro,
      question: h1, answer, linkLabel: `${fmt(l, 0, lang)} litros`,
    };
  }
  const title = `How much is ${noun} of water? See it with icons | Hectareometer`;
  const h1 = `How much is ${noun} of water?`;
  const description = `How much is ${noun}? About ${countPlain}: ${phrasePlain}. See it drawn with icons, from glasses of water to Olympic swimming pools.`;
  const answer = `${noun.charAt(0).toUpperCase() + noun.slice(1)} of water is about ${countPlain}, i.e. ${phrasePlain}. In other units: ${m3Text} m³ or about ${galText} US gallons.`;
  const intro = [
    `<p>The drawing above shows <b>${noun} of water</b> as ${countPlain}: each icon represents ${unit.en.legend}. It is ${phraseHtml.replace(/^≈ /, 'roughly ')}.</p>`,
    `<p>In other units, ${noun} is <b>${m3Text} cubic metres</b> or about <b>${galText} US gallons</b>. Change the number in the tool or pick another reference for the drawing (glasses, bathtubs, tanker trucks, Olympic pools…) with the "Show" selector.</p>`,
  ].join('\n      ');
  return {
    section: 'litros', lang, key: l, l, title, description, h1, intro,
    question: h1, answer, linkLabel: `${fmt(l, 0, lang)} litres`,
  };
}

// ---- editorial liters articles (bilingual: es + en) -----------------------

// Olympic pool: 50 × 25 m, 2 m minimum depth = 2,500 m³ = 2,500,000 L (World
// Aquatics facilities rules). Competition pools (Olympics/World Champs) are
// usually built to 3 m → 3,750 m³. Average Spanish water price 2.02 €/m³
// (supply + sanitation; INE, Estadística sobre el suministro y saneamiento del
// agua). Retail reference prices for the per-litre comparison: bottled water
// ~0.50 €/L in a supermarket, ~2.50 €/L in a bar.
const POOL_LITERS = 2500000;
const WATER_PRICE_EUR_M3 = 2.02;
const BOTTLE_SUPERMARKET_EUR_L = 0.50;
const BOTTLE_BAR_EUR_L = 2.50;

// Cubic hectometre article. 1 hm³ = cube 100 m per side = 1,000,000 m³ =
// 1,000,000,000 L = 400 Olympic pools. Total Spanish reservoir capacity
// ≈ 56,000 hm³ (46,915 hm³ = 83.7% of total, MITECO Boletín Hidrológico
// Semanal, abril 2026 → ~56,050 hm³). Largest reservoir: La Serena (Badajoz,
// río Zújar) 3,220 hm³ — the biggest in Spain, 3rd in Europe (CH Guadiana).
// Domestic consumption 128 L/person/day (INE, validated 2026-07-13).
const SPAIN_RESERVOIR_CAPACITY_HM3 = 56000;
const LA_SERENA_HM3 = 3220;

// es ↔ en slugs for the pool article; used for canonical + hreflang cross-refs.
const POOL_ALTERNATES = {
  es: '/cuantos-litros-piscina-olimpica/',
  en: '/en/how-many-litres-in-an-olympic-swimming-pool/',
};

function poolArticle(lang) {
  const es = lang === 'es';
  // es-ES leaves 4-digit numbers ungrouped ("5050"); force the thousands
  // separator so these figures match the hardcoded copy around them.
  const grpLocale = es ? 'es-ES' : 'en-GB';
  const fmtG = n => n.toLocaleString(grpLocale, { useGrouping: 'always', maximumFractionDigits: 0 });
  const tankers = Math.round(POOL_LITERS / 30000); // 83
  const bathtubs = fmtG(Math.round(POOL_LITERS / 150)); // 16.667 / 16,667
  const bathYears = Math.floor((POOL_LITERS / 150) / 365); // 45 (one bathtub a day; ~45.7)
  const poolsPerHm3 = fmtG(1e9 / POOL_LITERS); // 400
  const gallons = fmtG(Math.round(POOL_LITERS / litersData.GALLON_LITERS)); // 660.430
  const cost2m = fmtG(Math.round((POOL_LITERS / 1000) * WATER_PRICE_EUR_M3)); // 5.050
  const cost3m = fmtG(Math.round(3750 * WATER_PRICE_EUR_M3)); // 7.575
  // Per-litre tap-water price and how many tap litres a bottle's price buys.
  const pricePerLiter = WATER_PRICE_EUR_M3 / 1000; // 0,00202 €
  const centsPerLiter = fmt(pricePerLiter * 100, 1, lang); // 0,2 / 0.2
  const priceM3 = fmt(WATER_PRICE_EUR_M3, 2, lang); // 2,02 / 2.02
  const superPrice = fmt(BOTTLE_SUPERMARKET_EUR_L, 2, lang); // 0,50 / 0.50
  const barPrice = fmt(BOTTLE_BAR_EUR_L, 2, lang); // 2,50 / 2.50
  const superEquiv = fmtG(Math.round(BOTTLE_SUPERMARKET_EUR_L / pricePerLiter)); // 248
  const barEquiv = fmtG(Math.round(BOTTLE_BAR_EUR_L / pricePerLiter)); // 1.238
  const INE_URL = 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736176834&menu=ultiDatos&idp=1254735976602';

  if (es) {
    const intro = `      <p>
        Una <b>piscina olímpica</b> contiene unos <b><a href="/2500000-litros/">2,5 millones de
        litros</a></b> de agua, es decir, <b>2.500 metros cúbicos</b>. Esa es la cifra con la
        profundidad mínima que exige el reglamento (2 metros); en las piscinas de competición, que
        suelen tener 3 metros de fondo, el volumen sube hasta unos <b>3,75 millones de litros</b>
        (3.750 m³). El dibujo de arriba reparte esos 2,5 millones de litros en unos
        <b>${tankers} camiones cisterna</b>: cambia la referencia con el selector «Ver» para verla
        en bañeras, vasos o lo que quieras.
      </p>

      <h2>¿Cuánto mide una piscina olímpica?</h2>
      <p>
        Las medidas están fijadas por el reglamento de instalaciones de
        <a href="https://www.worldaquatics.com/" target="_blank" rel="noopener">World Aquatics</a>
        (la antigua FINA), el organismo que rige la natación mundial:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Dimensión</th><th>Medida oficial</th></tr></thead>
        <tbody>
          <tr><td>Largo</td><td>50 metros</td></tr>
          <tr><td>Ancho</td><td>25 metros</td></tr>
          <tr><td>Calles</td><td>10 calles de 2,5 metros</td></tr>
          <tr><td>Profundidad mínima</td><td>2 metros (3 m en competición)</td></tr>
          <tr><td>Superficie del agua</td><td>1.250 m² (0,125 hectáreas)</td></tr>
        </tbody>
      </table>
      <p>
        Con 50 × 25 metros y 2 metros de fondo salen <b>2.500 m³</b>, que son esos 2,5 millones de
        litros. En galones estadounidenses, unos <b>${gallons} galones</b>.
      </p>

      <h2>Una piscina olímpica, en cosas que sí te imaginas</h2>
      <p>Pincha en cualquier cifra para verla dibujada arriba a escala:</p>
      <ul class="examples-list">
        <li>Unas <b><a href="/litros/?l=2500000&v=banera">${bathtubs} bañeras</a></b> llenas (más de ${bathYears} años llenando una bañera al día).</li>
        <li>Unos <b><a href="/litros/?l=2500000&v=cisterna">${tankers} camiones cisterna</a></b> de agua (30.000 litros cada uno).</li>
        <li><a href="/litros/?l=2500000">Aproximadamente lo que bebe en un día toda la población de
          Baleares</a> (aunque de <i>beber</i>, apenas gastamos 2 litros al día por persona).</li>
        <li>La cuadragésima parte de un <b><a href="/litros/?l=1&u=hm3">hectómetro cúbico</a></b>, la
          unidad de los embalses: en 1 hm³ caben <b>${poolsPerHm3} piscinas olímpicas</b>.</li>
      </ul>

      <h2>¿Cuánto cuesta llenar una piscina olímpica?</h2>
      <p>
        En España el metro cúbico de agua cuesta de media <b>${priceM3} €</b>
        (dato del <a href="${INE_URL}" target="_blank" rel="noopener">INE</a>,
        sumando suministro y saneamiento). Llenar los 2.500 m³ de una piscina olímpica costaría, solo
        de agua, alrededor de <b>${cost2m} €</b>; si es una piscina de competición de 3 metros de
        fondo (3.750 m³), unos <b>${cost3m} €</b>. Es una estimación: el precio varía mucho de una
        ciudad a otra y no incluye el tratamiento ni la parte fija de la factura.
      </p>

      <h2>¿Cuánto cuesta un litro de agua?</h2>
      <p>
        Como un metro cúbico son 1.000 litros, para saber lo que cuesta un litro de agua del grifo
        basta con dividir el precio del metro cúbico entre 1.000. A <b>${priceM3} €/m³</b>,
        un <b>litro de agua del grifo</b> sale por unos <b>0,002 €</b>: apenas <b>${centsPerLiter} céntimos</b>.
        Puesto así se entiende por qué el agua embotellada, y no digamos la de un bar, es cientos o
        miles de veces más cara que abrir el grifo:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Un litro de agua…</th><th>Precio por litro</th></tr></thead>
        <tbody>
          <tr><td>Del grifo</td><td>~0,002 € (${centsPerLiter} céntimos)</td></tr>
          <tr><td>Embotellada, en el supermercado</td><td>${superPrice} € (unos ${superEquiv} litros de agua del grifo)</td></tr>
          <tr><td>En un bar</td><td>${barPrice} € (unos ${barEquiv} litros de agua del grifo)</td></tr>
        </tbody>
      </table>
      <p>
        Dicho de otro modo: por lo que cuesta una botella de agua de <b>${barPrice} €</b>
        en un bar tendrías <b>${barEquiv} litros</b> saliendo del grifo de tu casa.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos litros tiene una piscina olímpica?</dt>
        <dd>Una piscina olímpica (50 × 25 metros, 2 metros de profundidad mínima) contiene unos
          <b><a href="/2500000-litros/">2,5 millones de litros</a></b>, es decir, 2.500 metros
          cúbicos. Con la profundidad de competición de 3 metros llega hasta unos 3,75 millones de
          litros (3.750 m³).</dd>

        <dt>¿Cuánto mide una piscina olímpica?</dt>
        <dd>Mide 50 metros de largo por 25 de ancho, repartidos en 10 calles de 2,5 metros, con una
          profundidad mínima de 2 metros (3 en competición), según el reglamento de World Aquatics.</dd>

        <dt>¿Cuántas bañeras o camiones cisterna caben en una piscina olímpica?</dt>
        <dd>Unas <a href="/litros/?l=2500000&v=banera">${bathtubs} bañeras</a> llenas (de 150 litros) o unos
          <a href="/litros/?l=2500000&v=cisterna">${tankers} camiones cisterna</a> (de 30.000 litros).</dd>

        <dt>¿Cuánto cuesta llenar una piscina olímpica?</dt>
        <dd>A ${priceM3} €/m³ (precio medio del agua en España, INE), unos
          ${cost2m} € de agua para los 2.500 m³ con 2 metros de profundidad, y alrededor de
          ${cost3m} € para una piscina de competición de 3 metros (3.750 m³).</dd>
      </dl>
      <p>
        ¿Quieres visualizar otras cantidades de agua? Prueba la
        <a href="/litros/">herramienta de litros</a>, mira cuánto es
        <a href="/100000-litros/">100.000 litros</a> o cuánto ocupa
        <a href="/litros/?l=1&u=hm3">un hectómetro cúbico</a>. Y si lo tuyo son las superficies o las
        distancias, tienes el <a href="/">Hectareómetro</a> y la herramienta de
        <a href="/distancias/">distancias</a>.
      </p>`;
    return {
      section: 'litros', lang: 'es', key: 'piscina-olimpica', l: POOL_LITERS,
      family: 'litros', published: '2026-07-14', modified: '2026-07-14',
      slug: 'cuantos-litros-piscina-olimpica',
      path: POOL_ALTERNATES.es, alternates: POOL_ALTERNATES,
      title: '¿Cuántos litros tiene una piscina olímpica? Medidas y equivalencias | Hectareómetro',
      description: 'Una piscina olímpica tiene unos 2,5 millones de litros (2.500 m³): unas 16.667 bañeras o 83 camiones cisterna. Medidas oficiales, equivalencias y cuánto cuesta llenarla.',
      h1: '¿Cuántos litros de agua tiene una piscina olímpica?',
      intro,
      question: '¿Cuántos litros tiene una piscina olímpica?',
      answer: 'Una piscina olímpica (50 × 25 metros y 2 metros de profundidad mínima) contiene unos 2,5 millones de litros de agua, es decir, 2.500 metros cúbicos. En las piscinas de competición, con 3 metros de fondo, sube hasta unos 3,75 millones de litros (3.750 m³).',
      faqs: [
        { q: '¿Cuántos litros tiene una piscina olímpica?', a: 'Una piscina olímpica (50 × 25 metros, 2 metros de profundidad mínima) contiene unos 2,5 millones de litros, es decir, 2.500 metros cúbicos. Con la profundidad de competición de 3 metros llega hasta unos 3,75 millones de litros (3.750 m³).' },
        { q: '¿Cuánto mide una piscina olímpica?', a: 'Mide 50 metros de largo por 25 de ancho, repartidos en 10 calles de 2,5 metros, con una profundidad mínima de 2 metros (3 en competición), según el reglamento de World Aquatics.' },
        { q: '¿Cuántas bañeras o camiones cisterna caben en una piscina olímpica?', a: 'Unas 16.667 bañeras llenas (de 150 litros) o unos 83 camiones cisterna (de 30.000 litros).' },
        { q: '¿Cuánto cuesta llenar una piscina olímpica?', a: `A ${priceM3} €/m³ (precio medio del agua en España, INE), unos ${cost2m} € de agua para los 2.500 m³ con 2 metros de profundidad, y alrededor de ${cost3m} € para una piscina de competición de 3 metros (3.750 m³).` },
      ],
      linkLabel: '¿Cuántos litros tiene una piscina olímpica?',
    };
  }

  // English
  const intro = `      <p>
        An <b>Olympic swimming pool</b> holds about <b><a href="/en/2500000-liters/">2.5 million
        litres</a></b> of water, i.e. <b>2,500 cubic metres</b>. That is the figure at the minimum
        depth the rules require (2 metres); competition pools, usually built 3 metres deep, hold up
        to about <b>3.75 million litres</b> (3,750 m³). The drawing above splits those 2.5 million
        litres into roughly <b>${tankers} tanker trucks</b>: use the "Show" selector to see it in
        bathtubs, glasses or whatever you like.
      </p>

      <h2>How big is an Olympic swimming pool?</h2>
      <p>
        The dimensions are set by the facilities rules of
        <a href="https://www.worldaquatics.com/" target="_blank" rel="noopener">World Aquatics</a>
        (formerly FINA), the world governing body of swimming:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Dimension</th><th>Official size</th></tr></thead>
        <tbody>
          <tr><td>Length</td><td>50 metres</td></tr>
          <tr><td>Width</td><td>25 metres</td></tr>
          <tr><td>Lanes</td><td>10 lanes of 2.5 metres</td></tr>
          <tr><td>Minimum depth</td><td>2 metres (3 m in competition)</td></tr>
          <tr><td>Water surface</td><td>1,250 m² (0.125 hectares)</td></tr>
        </tbody>
      </table>
      <p>
        At 50 × 25 metres and 2 metres deep you get <b>2,500 m³</b>, which is those 2.5 million
        litres. In US gallons, about <b>${gallons} gallons</b>.
      </p>

      <h2>An Olympic pool, in things you can actually picture</h2>
      <p>Click any figure to see it drawn to scale above:</p>
      <ul class="examples-list">
        <li>About <b><a href="/en/liters/?l=2500000&v=banera">${bathtubs} full bathtubs</a></b> (over ${bathYears} years of filling one bathtub a day).</li>
        <li>About <b><a href="/en/liters/?l=2500000&v=cisterna">${tankers} tanker trucks</a></b> of water (30,000 litres each).</li>
        <li><a href="/en/liters/?l=2500000">Roughly what the entire population of the Balearic
          Islands drinks in a day</a> (though as <i>drinking</i> water we only use about 2 litres a
          day each).</li>
        <li>One fortieth of a <b><a href="/en/liters/?l=1&u=hm3">cubic hectometre</a></b>, the unit
          used for reservoirs: 1 hm³ holds <b>${poolsPerHm3} Olympic pools</b>.</li>
      </ul>

      <h2>How much does it cost to fill an Olympic swimming pool?</h2>
      <p>
        In Spain a cubic metre of water costs <b>€${priceM3}</b> on average
        (<a href="${INE_URL}" target="_blank" rel="noopener">INE</a> figure, supply plus sanitation).
        Filling the 2,500 m³ of an Olympic pool would cost, for the water alone, around
        <b>€${cost2m}</b>; for a 3-metre competition pool (3,750 m³), about <b>€${cost3m}</b>. It is
        only an estimate: the price varies a lot from town to town and excludes treatment and the
        fixed part of the bill.
      </p>

      <h2>How much does a litre of water cost?</h2>
      <p>
        Since a cubic metre is 1,000 litres, to work out what a litre of tap water costs you just
        divide the price of a cubic metre by 1,000. At <b>€${priceM3}/m³</b>, a <b>litre of tap
        water</b> costs about <b>€0.002</b>: barely <b>${centsPerLiter} cents</b>. Put that way, it
        is clear why bottled water — let alone water at a bar — is hundreds or thousands of times
        more expensive than turning on the tap:
      </p>
      <table class="equiv-table">
        <thead><tr><th>A litre of water…</th><th>Price per litre</th></tr></thead>
        <tbody>
          <tr><td>From the tap</td><td>~€0.002 (${centsPerLiter} cents)</td></tr>
          <tr><td>Bottled, at the supermarket</td><td>€${superPrice} (about ${superEquiv} litres of tap water)</td></tr>
          <tr><td>At a bar</td><td>€${barPrice} (about ${barEquiv} litres of tap water)</td></tr>
        </tbody>
      </table>
      <p>
        Put another way: for what a <b>€${barPrice}</b> bottle of water costs at a bar you would get
        <b>${barEquiv} litres</b> straight from the tap at home.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How many litres are in an Olympic swimming pool?</dt>
        <dd>An Olympic swimming pool (50 × 25 metres, 2-metre minimum depth) holds about
          <b><a href="/en/2500000-liters/">2.5 million litres</a></b>, i.e. 2,500 cubic metres. At
          the 3-metre competition depth it reaches about 3.75 million litres (3,750 m³).</dd>

        <dt>How big is an Olympic swimming pool?</dt>
        <dd>It is 50 metres long by 25 metres wide, split into 10 lanes of 2.5 metres, with a minimum
          depth of 2 metres (3 in competition), under the World Aquatics rules.</dd>

        <dt>How many bathtubs or tanker trucks fit in an Olympic swimming pool?</dt>
        <dd>About <a href="/en/liters/?l=2500000&v=banera">${bathtubs} full bathtubs</a> (150 litres each) or about
          <a href="/en/liters/?l=2500000&v=cisterna">${tankers} tanker trucks</a> (30,000 litres each).</dd>

        <dt>How much does it cost to fill an Olympic swimming pool?</dt>
        <dd>At €${priceM3}/m³ (Spain's average water price, INE), about €${cost2m} of water for the
          2,500 m³ at 2 metres deep, and around €${cost3m} for a 3-metre competition pool
          (3,750 m³).</dd>
      </dl>
      <p>
        Want to picture other amounts of water? Try the
        <a href="/en/liters/">liters tool</a>, see how much
        <a href="/en/100000-liters/">100,000 litres</a> is or how big
        <a href="/en/liters/?l=1&u=hm3">a cubic hectometre</a> is. And if you are after areas or
        distances, there is the <a href="/en/">Hectareometer</a> and the
        <a href="/en/distances/">distances tool</a>.
      </p>`;
  return {
    section: 'litros', lang: 'en', key: 'piscina-olimpica', l: POOL_LITERS,
    family: 'litros', published: '2026-07-14', modified: '2026-07-14',
    slug: 'how-many-litres-in-an-olympic-swimming-pool',
    path: POOL_ALTERNATES.en, alternates: POOL_ALTERNATES,
    title: 'How many litres are in an Olympic swimming pool? Size & equivalents | Hectareometer',
    description: 'An Olympic swimming pool holds about 2.5 million litres (2,500 m³): some 16,667 bathtubs or 83 tanker trucks. Official size, equivalents and what it costs to fill.',
    h1: 'How many litres of water are in an Olympic swimming pool?',
    intro,
    question: 'How many litres are in an Olympic swimming pool?',
    answer: 'An Olympic swimming pool (50 × 25 metres and a 2-metre minimum depth) holds about 2.5 million litres of water, i.e. 2,500 cubic metres. Competition pools, at 3 metres deep, hold up to about 3.75 million litres (3,750 m³).',
    faqs: [
      { q: 'How many litres are in an Olympic swimming pool?', a: 'An Olympic swimming pool (50 × 25 metres, 2-metre minimum depth) holds about 2.5 million litres, i.e. 2,500 cubic metres. At the 3-metre competition depth it reaches about 3.75 million litres (3,750 m³).' },
      { q: 'How big is an Olympic swimming pool?', a: 'It is 50 metres long by 25 metres wide, split into 10 lanes of 2.5 metres, with a minimum depth of 2 metres (3 in competition), under the World Aquatics rules.' },
      { q: 'How many bathtubs or tanker trucks fit in an Olympic swimming pool?', a: 'About 16,667 full bathtubs (150 litres each) or about 83 tanker trucks (30,000 litres each).' },
      { q: 'How much does it cost to fill an Olympic swimming pool?', a: `At €${priceM3}/m³ (Spain's average water price, INE), about €${cost2m} of water for the 2,500 m³ at 2 metres deep, and around €${cost3m} for a 3-metre competition pool (3,750 m³).` },
    ],
    linkLabel: 'How many litres are in an Olympic swimming pool?',
  };
}

// ¿Cuánto es un hectómetro cúbico? Spanish-only editorial (es + x-default).
// The embedded tool is preset to 1 hm³ = 1e9 L, which the pictogram draws as
// 400 Olympic pools; the copy matches that drawing.
function cubicHectometreArticle() {
  const INE_URL = 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736176834&menu=ultiDatos&idp=1254735976602';
  const MITECO_URL = 'https://www.miteco.gob.es/es/agua/temas/evaluacion-de-los-recursos-hidricos/boletin-hidrologico.html';
  const SERENA_URL = 'https://es.wikipedia.org/wiki/Embalse_de_La_Serena';
  const intro = `      <p>
        En los telediarios de verano se repite el dato: «los embalses están al 55 %» o «ha entrado
        un <b>hectómetro cúbico</b> de agua». Pero casi nadie tiene una imagen mental de cuánto es
        eso. Un <b>hectómetro cúbico (hm³)</b> es la unidad con la que se mide el agua embalsada en
        España, y equivale a <b>mil millones de litros</b>: 1.000.000 de metros cúbicos, o el agua
        que cabe en <b><a href="/litros/?l=1&u=hm3">400 piscinas olímpicas</a></b>. El dibujo de
        arriba reparte justo ese hectómetro cúbico en esas 400 piscinas.
      </p>

      <h2>¿Qué es exactamente un hectómetro cúbico?</h2>
      <p>
        Un hectómetro son <b>100 metros</b> (del prefijo <i>hecto-</i>, cien). Un hectómetro cúbico
        es, por tanto, el volumen de un <b>cubo de 100 metros de lado</b>: 100 × 100 × 100 =
        <b>1.000.000 de metros cúbicos</b>. Y como cada metro cúbico son 1.000 litros, un hm³ son
        <b>1.000 millones de litros</b> (mil millones, 10⁹). Piensa en un cubo de agua tan alto como
        un edificio de 30 plantas y con la base de un campo de fútbol y medio: eso es un hm³.
      </p>
      <table class="equiv-table">
        <thead><tr><th>1 hectómetro cúbico (hm³) es…</th><th>Equivale a</th></tr></thead>
        <tbody>
          <tr><td>En metros cúbicos</td><td>1.000.000 m³</td></tr>
          <tr><td>En litros</td><td>1.000.000.000 L (mil millones)</td></tr>
          <tr><td>Forma</td><td>un cubo de 100 × 100 × 100 metros</td></tr>
          <tr><td>En piscinas olímpicas</td><td>400 piscinas</td></tr>
          <tr><td>En camiones cisterna</td><td>unos 33.333 (de 30.000 litros)</td></tr>
        </tbody>
      </table>

      <h2>Un hectómetro cúbico, en cosas que sí te imaginas</h2>
      <p>Pincha en cualquier cifra para verla dibujada arriba a escala:</p>
      <ul class="examples-list">
        <li><b><a href="/litros/?l=1&u=hm3">400 piscinas olímpicas</a></b> llenas hasta el borde
          (cada una, <a href="/cuantos-litros-piscina-olimpica/">2,5 millones de litros</a>).</li>
        <li>Unos <b><a href="/litros/?l=1000000000&v=cisterna">33.333 camiones cisterna</a></b> de
          agua, de 30.000 litros cada uno.</li>
        <li><a href="/litros/?l=1000000000">Aproximadamente lo que bebe en todo un año la población
          de Aragón</a> (unos 1,4 millones de personas, a 2 litros al día).</li>
        <li>El <b>consumo doméstico</b> de una ciudad entera: a 128 litros por persona y día (media
          española, <a href="${INE_URL}" target="_blank" rel="noopener">INE</a>), 1 hm³ da para el
          gasto de casa de <b>7,8 millones de personas durante un día</b>.</li>
      </ul>

      <h2>Por qué el hectómetro cúbico es la unidad de los embalses</h2>
      <p>
        La capacidad total de embalse en España ronda los <b>${SPAIN_RESERVOIR_CAPACITY_HM3.toLocaleString('es-ES')} hm³</b>
        (según el <a href="${MITECO_URL}" target="_blank" rel="noopener">Boletín Hidrológico</a>
        del MITECO). El embalse más grande es el de <b><a href="${SERENA_URL}" target="_blank" rel="noopener">La
        Serena</a></b> (Badajoz, sobre el río Zújar), con capacidad para <b>3.220 hm³</b>: él solo
        podría llenar más de <b>1,2 millones de piscinas olímpicas</b>. Manejar el agua de un país
        en litros sería absurdo (demasiados ceros), así que se usa el hm³, que redondea a cifras
        manejables: un embalse mediano guarda unas decenas de hm³; uno grande, cientos.
      </p>

      <h2>Cómo leer «los embalses están al 60 %»</h2>
      <p>
        Cuando oyes que los embalses están «al 60 %», significa que entre todos guardan el 60 % de
        su capacidad: unos <b>33.600 hm³</b> de los ${SPAIN_RESERVOIR_CAPACITY_HM3.toLocaleString('es-ES')} posibles. Por eso los
        veranos de sequía la cifra baja y salta a los titulares —los mismos años en los que
        <a href="/hectareas-quemadas-incendios-espana/">arden más hectáreas en incendios</a>—, y un
        otoño lluvioso puede sumar varios hm³ en una sola semana. Ese porcentaje resume, en una
        unidad que nadie ve pero todos citan, cuánta agua le queda al país.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos litros tiene un hectómetro cúbico?</dt>
        <dd>Un hectómetro cúbico son <b>1.000 millones de litros</b> (1.000.000 de metros cúbicos),
          el agua que cabe en unas <a href="/litros/?l=1&u=hm3">400 piscinas olímpicas</a>.</dd>

        <dt>¿Cuánto es un hm³ en metros cúbicos?</dt>
        <dd>Un hm³ es 1.000.000 de metros cúbicos: el volumen de un cubo de 100 metros de lado
          (100 × 100 × 100).</dd>

        <dt>¿Cuánta agua pueden embalsar los pantanos de España?</dt>
        <dd>La capacidad total ronda los ${SPAIN_RESERVOIR_CAPACITY_HM3.toLocaleString('es-ES')} hm³. El mayor embalse es el de La Serena
          (Badajoz), que por sí solo puede almacenar 3.220 hm³.</dd>

        <dt>¿Qué significa que un embalse está al 50 %?</dt>
        <dd>Que guarda la mitad de su capacidad. A escala nacional, «al 50 %» serían unos
          28.000 hm³ de los ${SPAIN_RESERVOIR_CAPACITY_HM3.toLocaleString('es-ES')} que caben en todos los embalses del país.</dd>
      </dl>
      <p>
        ¿Quieres visualizar otras cantidades de agua? Prueba la
        <a href="/litros/">herramienta de litros</a>, mira cuánto es
        <a href="/cuantos-litros-piscina-olimpica/">una piscina olímpica</a> o cuánto son
        <a href="/100000-litros/">100.000 litros</a>. Y si lo tuyo son las superficies o las
        distancias, tienes el <a href="/">Hectareómetro</a> y la herramienta de
        <a href="/distancias/">distancias</a>.
      </p>`;
  return {
    section: 'litros', lang: 'es', key: 'hectometro-cubico', l: 1000000000,
    family: 'litros', published: '2026-07-20', modified: '2026-07-20',
    slug: 'cuanto-es-un-hectometro-cubico',
    path: '/cuanto-es-un-hectometro-cubico/',
    title: '¿Cuánto es un hectómetro cúbico? La unidad de los embalses, explicada | Hectareómetro',
    description: 'Un hectómetro cúbico (hm³) son 1.000 millones de litros: 1.000.000 m³, un cubo de 100 metros de lado o 400 piscinas olímpicas. La unidad de los embalses, explicada y dibujada.',
    h1: '¿Cuánto es un hectómetro cúbico (hm³)?',
    intro,
    question: '¿Cuánto es un hectómetro cúbico?',
    answer: 'Un hectómetro cúbico (hm³) son 1.000 millones de litros, es decir, 1.000.000 de metros cúbicos: el volumen de un cubo de 100 metros de lado, equivalente a unas 400 piscinas olímpicas. Es la unidad con la que se mide el agua de los embalses.',
    faqs: [
      { q: '¿Cuántos litros tiene un hectómetro cúbico?', a: 'Un hectómetro cúbico son 1.000 millones de litros (1.000.000 de metros cúbicos), el agua que cabe en unas 400 piscinas olímpicas.' },
      { q: '¿Cuánto es un hm³ en metros cúbicos?', a: 'Un hm³ es 1.000.000 de metros cúbicos: el volumen de un cubo de 100 metros de lado (100 × 100 × 100).' },
      { q: '¿Cuánta agua pueden embalsar los pantanos de España?', a: 'La capacidad total ronda los 56.000 hm³. El mayor embalse es el de La Serena (Badajoz), que por sí solo puede almacenar 3.220 hm³.' },
      { q: '¿Qué significa que un embalse está al 50 %?', a: 'Que guarda la mitad de su capacidad. A escala nacional, «al 50 %» serían unos 28.000 hm³ de los 56.000 que caben en todos los embalses del país.' },
    ],
    linkLabel: '¿Cuánto es un hectómetro cúbico?',
  };
}

const LITER_ARTICLES = [poolArticle('es'), poolArticle('en'), cubicHectometreArticle()];

// ---- editorial distances articles (Spanish-only, map-based) ----------------

// Evergreen distance chips for the related block of distances articles (there
// are no distances landing pages, so we link the tool + a few known-good
// presets that fit their viewport).
function relatedDistanceLinks(lang) {
  const es = lang === 'es';
  const chips = es ? [
    ['/distancias/?d=42.195&u=km&lat=40.4168&lon=-3.7038&z=9', 'Un maratón (42,195 km)'],
    ['/distancias/?d=505&u=km&lat=40.4168&lon=-3.7038&z=6', 'Madrid–Barcelona (505 km)'],
    ['/distancias/?d=1&u=mi&lat=40.4168&lon=-3.7038&z=12', 'Una milla'],
    ['/distancias/', 'La herramienta de distancias'],
  ] : [
    ['/en/distances/?d=42.195&u=km&lat=40.4168&lon=-3.7038&z=9', 'A marathon (42.195 km)'],
    ['/en/distances/?d=505&u=km&lat=40.4168&lon=-3.7038&z=6', 'Madrid–Barcelona (505 km)'],
    ['/en/distances/?d=1&u=mi&lat=40.4168&lon=-3.7038&z=12', 'One mile'],
    ['/en/distances/', 'The distances tool'],
  ];
  return chips.map(([href, label]) => `        <li><a href="${href}">${escapeHtml(label)}</a></li>`).join('\n');
}

// ¿Cuánto son 10.000 pasos? Spanish-only editorial (es + x-default). The
// embedded distances tool is preset to a 7.5 km radius circle over Madrid,
// which is what 10,000 steps come to at a ~0.75 m stride.
// Data validated 2026-07-21 (web): average stride 0.70-0.80 m → 1 km ≈
// 1,300-1,400 steps → 10,000 steps ≈ 7-8 km (7.5 km at 0.75 m). Origin of the
// figure: the "Manpo-kei" (万歩計, "10,000-steps meter") pedometer sold by
// Yamasa in 1965, after the 1964 Tokyo Olympics — a marketing number, not a
// research finding. Current evidence: Lancet Public Health 2025 systematic
// review & dose-response meta-analysis (Ding et al., 57 studies) — ~7,000
// steps/day cut all-cause mortality by ~47% vs 2,000, with benefits levelling
// off around 5,000-7,000 and still improving up to ~12,000.
const STEPS_ALTERNATES = {
  es: '/cuanto-son-10000-pasos/',
  en: '/en/how-far-is-10000-steps/',
};

function tenThousandStepsArticle(lang) {
  const es = lang === 'es';
  const LANCET_URL = 'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(25)00164-1/fulltext';
  if (es) {
  const distUrl = '/distancias/?d=7.5&u=km&lat=40.4168&lon=-3.7038&z=11';
  const intro = `      <p>
        <b>10.000 pasos son, más o menos, entre 7 y 8 kilómetros</b> de camino: unos
        <b><a href="${distUrl}">7,5 kilómetros</a></b> si tu zancada mide alrededor de 0,75 metros,
        la media de una persona adulta. El dibujo de arriba muestra ese radio de 7,5 km como un
        círculo con centro en Madrid: arrastra el mapa hasta tu ciudad para ver hasta dónde
        llegarías caminando en línea recta desde tu casa.
      </p>
      <p>
        La cuenta es sencilla: con un <b>paso medio de 0,7 a 0,8 metros</b>, en un kilómetro caben
        entre <b>1.300 y 1.400 pasos</b>. Así que 10.000 pasos rondan los 7-8 km según tu estatura y
        tu ritmo (la gente más alta y más rápida da pasos más largos y, por tanto, menos pasos por
        kilómetro).
      </p>

      <h2>¿De dónde salen los 10.000 pasos?</h2>
      <p>
        Puede que te sorprenda: la cifra de 10.000 pasos <b>no nació de ningún estudio médico</b>,
        sino de una campaña de marketing. En <b>1965</b>, poco después de los Juegos Olímpicos de
        Tokio de 1964, la empresa japonesa Yamasa lanzó uno de los primeros podómetros de bolsillo y
        lo llamó <b>«Manpo-kei»</b> (万歩計), que significa literalmente <b>«medidor de 10.000
        pasos»</b>. Se cuenta que eligieron ese número en parte porque el carácter japonés de
        «10.000» (万) recuerda a una persona caminando, y porque era una cifra redonda, fácil de
        recordar y de vender. El objetivo redondo se quedó grabado y hoy lo llevan de serie relojes y
        móviles de todo el mundo, aunque en su origen no había ciencia detrás.
      </p>

      <h2>¿Cuántos pasos hacen falta de verdad?</h2>
      <p>
        La buena noticia es que <b>no necesitas llegar a 10.000</b> para llevarte casi todo el
        beneficio. La mayor revisión hecha hasta la fecha, publicada en <i>The Lancet Public
        Health</i> en 2025 (<a href="${LANCET_URL}" target="_blank" rel="noopener">un metaanálisis
        de 57 estudios</a>), encontró que caminar unos <b>7.000 pasos al día</b> se asocia a un
        <b>47 % menos de mortalidad</b> frente a quedarse en 2.000, además de menos riesgo de
        enfermedad cardiovascular, diabetes tipo 2, demencia y depresión. El beneficio crece rápido
        hasta los <b>5.000-7.000 pasos</b> y a partir de ahí la curva se aplana: cada 1.000 pasos de
        más siguen sumando algo, pero cada vez menos, hasta unos 12.000. En otras palabras, 10.000
        es una meta estupenda si la alcanzas, pero <b>7.000 ya es un objetivo excelente</b> y mucho
        más realista para la mayoría.
      </p>

      <h2>¿Cuánto se tarda en dar 10.000 pasos?</h2>
      <p>
        A un ritmo de paseo normal (unos 5 km/h), esos 7,5 km se recorren en aproximadamente
        <b>1 hora y media</b>; a un paso más tranquilo puede irse a <b>1 hora y 40 minutos</b>.
        No hace falta hacerlos del tirón: se van sumando a lo largo del día —ir al trabajo, la
        compra, pasear al perro—. En cuanto al gasto energético, 10.000 pasos suponen del orden de
        <b>300 a 500 kcal</b>, según tu peso y el ritmo.
      </p>

      <h2>Cuántos kilómetros son tus pasos</h2>
      <p>Pincha en cualquier distancia para verla dibujada arriba a escala, con centro en Madrid:</p>
      <table class="equiv-table">
        <thead><tr><th>Pasos</th><th>Distancia aproximada</th></tr></thead>
        <tbody>
          <tr><td>1.000 pasos</td><td><a href="/distancias/?d=0.75&u=km&lat=40.4168&lon=-3.7038&z=14">0,75 km</a> (unos 750 m)</td></tr>
          <tr><td>2.500 pasos</td><td><a href="/distancias/?d=1.9&u=km&lat=40.4168&lon=-3.7038&z=13">1,9 km</a></td></tr>
          <tr><td>5.000 pasos</td><td><a href="/distancias/?d=3.75&u=km&lat=40.4168&lon=-3.7038&z=12">3,75 km</a></td></tr>
          <tr><td>7.000 pasos</td><td><a href="/distancias/?d=5.25&u=km&lat=40.4168&lon=-3.7038&z=12">5,25 km</a></td></tr>
          <tr><td>10.000 pasos</td><td><a href="${distUrl}">7,5 km</a></td></tr>
        </tbody>
      </table>
      <p>
        Son distancias en línea recta desde el centro: sirven para hacerte una idea de la magnitud,
        no de la ruta real que seguirías por calles. Cambia el número en la
        <a href="/distancias/">herramienta de distancias</a> para probar la tuya.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos kilómetros son 10.000 pasos?</dt>
        <dd>Entre 7 y 8 kilómetros, unos <a href="${distUrl}">7,5 km</a> con una zancada media de
          0,75 metros. Depende de tu estatura y tu ritmo.</dd>

        <dt>¿Cuántos pasos hay en un kilómetro?</dt>
        <dd>Entre 1.300 y 1.400 pasos, con un paso medio de 0,7 a 0,8 metros. Cuanto más alto eres,
          más largo es el paso y menos pasos necesitas por kilómetro.</dd>

        <dt>¿De dónde viene lo de los 10.000 pasos?</dt>
        <dd>De una campaña de marketing japonesa de 1965: el podómetro «Manpo-kei» («medidor de
          10.000 pasos») de la empresa Yamasa. Era un número redondo y pegadizo, no una
          recomendación basada en estudios.</dd>

        <dt>¿Hay que hacer 10.000 pasos al día para estar sano?</dt>
        <dd>No es imprescindible. Según un metaanálisis de 2025 en <i>The Lancet Public Health</i>,
          unos 7.000 pasos al día ya reducen la mortalidad en torno a un 47 % frente a 2.000, y el
          beneficio se aplana a partir de los 5.000-7.000 pasos. 10.000 está muy bien, pero 7.000 es
          un objetivo excelente y más realista.</dd>

        <dt>¿Cuánto se tarda en dar 10.000 pasos?</dt>
        <dd>Alrededor de 1 hora y media a ritmo de paseo (5 km/h), o hasta 1 hora y 40 minutos a un
          paso tranquilo. No hace falta hacerlos seguidos: se acumulan a lo largo del día.</dd>
      </dl>
      <p>
        ¿Quieres seguir jugando con distancias? Mira <a href="/distancias/?d=42.195&u=km&lat=40.4168&lon=-3.7038&z=9">cuánto
        mide un maratón</a> o abre la <a href="/distancias/">herramienta de distancias</a> y dibuja
        la tuya. Y si lo tuyo son las superficies, tienes el <a href="/">Hectareómetro</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'es', key: '10000-pasos', ha: 0,
    family: 'distancias', published: '2026-07-21', modified: '2026-07-21',
    slug: 'cuanto-son-10000-pasos',
    path: '/cuanto-son-10000-pasos/',
    dist: 7.5, distUnit: 'km',
    presetExtra: ' var PRESET_ZOOM = 11; var PRESET_LAT = 40.4168; var PRESET_LON = -3.7038;',
    title: '¿Cuántos kilómetros son 10.000 pasos? Míralo en un mapa | Hectareómetro',
    description: '10.000 pasos son unos 7,5 km (entre 7 y 8 km). De dónde viene la cifra, cuántos pasos hacen falta de verdad y cuánto se tarda. Míralo dibujado a escala en un mapa.',
    h1: '¿Cuántos kilómetros son 10.000 pasos?',
    intro,
    question: '¿Cuántos kilómetros son 10.000 pasos?',
    answer: '10.000 pasos son, más o menos, entre 7 y 8 kilómetros: unos 7,5 km con una zancada media de 0,75 metros. En un kilómetro caben entre 1.300 y 1.400 pasos.',
    faqs: [
      { q: '¿Cuántos kilómetros son 10.000 pasos?', a: 'Entre 7 y 8 kilómetros, unos 7,5 km con una zancada media de 0,75 metros. Depende de tu estatura y tu ritmo.' },
      { q: '¿Cuántos pasos hay en un kilómetro?', a: 'Entre 1.300 y 1.400 pasos, con un paso medio de 0,7 a 0,8 metros. Cuanto más alto eres, más largo es el paso y menos pasos necesitas por kilómetro.' },
      { q: '¿De dónde viene lo de los 10.000 pasos?', a: 'De una campaña de marketing japonesa de 1965: el podómetro «Manpo-kei» («medidor de 10.000 pasos») de la empresa Yamasa. Era un número redondo y pegadizo, no una recomendación basada en estudios.' },
      { q: '¿Hay que hacer 10.000 pasos al día para estar sano?', a: 'No es imprescindible. Según un metaanálisis de 2025 en The Lancet Public Health, unos 7.000 pasos al día ya reducen la mortalidad en torno a un 47 % frente a 2.000, y el beneficio se aplana a partir de los 5.000-7.000 pasos. 10.000 está muy bien, pero 7.000 es un objetivo excelente y más realista.' },
      { q: '¿Cuánto se tarda en dar 10.000 pasos?', a: 'Alrededor de 1 hora y media a ritmo de paseo (5 km/h), o hasta 1 hora y 40 minutos a un paso tranquilo. No hace falta hacerlos seguidos: se acumulan a lo largo del día.' },
    ],
    linkLabel: '¿Cuántos kilómetros son 10.000 pasos?',
    alternates: STEPS_ALTERNATES,
  };
  }

  // English mirror (universal topic). Preset centred on London; leads with the
  // km answer and gives the mile equivalent alongside (the en tool defaults to
  // miles, but the article's headline figure is 7.5 km).
  const distUrl = '/en/distances/?d=7.5&u=km&lat=51.5074&lon=-0.1278&z=11';
  const intro = `      <p>
        <b>10,000 steps come to roughly 7 to 8 kilometres</b> of walking: about
        <b><a href="${distUrl}">7.5 km</a></b> — around <b>4.7 miles</b> — if your stride is close to
        0.75 metres, the average for an adult. The drawing above shows that 7.5 km radius as a circle
        centred on London: drag the map to your own city to see how far you would get walking in a
        straight line from your front door.
      </p>
      <p>
        The maths is simple: with an <b>average step of 0.7 to 0.8 metres</b>, a kilometre takes
        between <b>1,300 and 1,400 steps</b> (a mile is roughly 2,000–2,250). So 10,000 steps land
        around 7–8 km depending on your height and pace — taller, faster walkers take longer strides
        and therefore fewer steps per kilometre.
      </p>

      <h2>Where does the 10,000-steps figure come from?</h2>
      <p>
        It may surprise you: the 10,000-steps target <b>did not come from a medical study</b>, but
        from a marketing campaign. In <b>1965</b>, shortly after the 1964 Tokyo Olympics, the
        Japanese company Yamasa launched one of the first pocket pedometers and called it
        <b>"Manpo-kei"</b> (万歩計), which literally means <b>"10,000-steps meter"</b>. The story goes
        that they picked the number partly because the Japanese character for "10,000" (万) looks a
        little like a walking person, and partly because a round figure is easy to remember and to
        sell. The round goal stuck, and today watches and phones the world over ship with it —
        even though there was no science behind it to begin with.
      </p>

      <h2>How many steps do you actually need?</h2>
      <p>
        The good news is that <b>you don't have to reach 10,000</b> to get almost all of the benefit.
        The largest review to date, published in <i>The Lancet Public Health</i> in 2025
        (<a href="${LANCET_URL}" target="_blank" rel="noopener">a meta-analysis of 57 studies</a>),
        found that walking about <b>7,000 steps a day</b> is linked to a <b>47% lower risk of dying
        early</b> compared with 2,000, along with lower risk of cardiovascular disease, type 2
        diabetes, dementia and depression. The benefit rises quickly up to <b>5,000–7,000 steps</b>
        and then flattens out: each extra 1,000 steps still helps, but less and less, up to about
        12,000. In other words, 10,000 is a great goal if you hit it, but <b>7,000 is already an
        excellent, far more realistic target</b> for most people.
      </p>

      <h2>How long does it take to walk 10,000 steps?</h2>
      <p>
        At a normal walking pace (about 5 km/h, or roughly 3 mph), those 7.5 km take approximately
        <b>1 hour and a half</b>; at a gentler pace it can stretch to <b>1 hour 40 minutes</b>. You
        don't have to do them in one go — they add up over the day, from the commute to the shops to
        walking the dog. As for energy, 10,000 steps burn on the order of <b>300 to 500 kcal</b>,
        depending on your weight and pace.
      </p>

      <h2>How far your steps go</h2>
      <p>Click any distance to see it drawn to scale above, centred on London:</p>
      <table class="equiv-table">
        <thead><tr><th>Steps</th><th>Approximate distance</th></tr></thead>
        <tbody>
          <tr><td>1,000 steps</td><td><a href="/en/distances/?d=0.75&u=km&lat=51.5074&lon=-0.1278&z=14">0.75 km</a> (~0.47 mi)</td></tr>
          <tr><td>2,500 steps</td><td><a href="/en/distances/?d=1.9&u=km&lat=51.5074&lon=-0.1278&z=13">1.9 km</a> (~1.2 mi)</td></tr>
          <tr><td>5,000 steps</td><td><a href="/en/distances/?d=3.75&u=km&lat=51.5074&lon=-0.1278&z=12">3.75 km</a> (~2.3 mi)</td></tr>
          <tr><td>7,000 steps</td><td><a href="/en/distances/?d=5.25&u=km&lat=51.5074&lon=-0.1278&z=12">5.25 km</a> (~3.3 mi)</td></tr>
          <tr><td>10,000 steps</td><td><a href="${distUrl}">7.5 km</a> (~4.7 mi)</td></tr>
        </tbody>
      </table>
      <p>
        These are straight-line distances from the centre: they give you a feel for the magnitude,
        not the real route you'd follow along streets. Change the number in the
        <a href="/en/distances/">distances tool</a> to try your own.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How many kilometres is 10,000 steps?</dt>
        <dd>Between 7 and 8 kilometres — about <a href="${distUrl}">7.5 km</a> (roughly 4.7 miles)
          with an average stride of 0.75 metres. It depends on your height and pace.</dd>

        <dt>How many steps are there in a kilometre?</dt>
        <dd>Between 1,300 and 1,400 steps, with an average step of 0.7 to 0.8 metres. The taller you
          are, the longer your stride and the fewer steps you need per kilometre (a mile is roughly
          2,000–2,250 steps).</dd>

        <dt>Where does the 10,000-steps idea come from?</dt>
        <dd>From a 1965 Japanese marketing campaign: the "Manpo-kei" ("10,000-steps meter") pedometer
          made by Yamasa. It was a round, catchy number, not a recommendation based on studies.</dd>

        <dt>Do you need 10,000 steps a day to be healthy?</dt>
        <dd>Not necessarily. According to a 2025 meta-analysis in <i>The Lancet Public Health</i>,
          about 7,000 steps a day already cut the risk of dying early by around 47% compared with
          2,000, and the benefit flattens out beyond 5,000–7,000 steps. 10,000 is great, but 7,000
          is an excellent and more realistic target.</dd>

        <dt>How long does it take to walk 10,000 steps?</dt>
        <dd>About 1 hour and a half at a normal walking pace (5 km/h ≈ 3 mph), or up to 1 hour 40
          minutes at a gentle pace. You don't have to do them all at once — they add up over the
          day.</dd>
      </dl>
      <p>
        Want to keep playing with distances? See <a href="/en/distances/?d=42.195&u=km&lat=51.5074&lon=-0.1278&z=9">how
        long a marathon is</a> or open the <a href="/en/distances/">distances tool</a> and draw your
        own. And if areas are more your thing, there is the <a href="/en/">Hectareometer</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'en', key: '10000-pasos', ha: 0,
    family: 'distancias', published: '2026-07-21', modified: '2026-07-21',
    slug: 'how-far-is-10000-steps',
    path: STEPS_ALTERNATES.en, alternates: STEPS_ALTERNATES,
    dist: 7.5, distUnit: 'km',
    presetExtra: ' var PRESET_ZOOM = 11; var PRESET_LAT = 51.5074; var PRESET_LON = -0.1278;',
    title: 'How far is 10,000 steps? In km and miles, on a map | Hectareometer',
    description: '10,000 steps come to about 7.5 km (4.7 miles) — between 7 and 8 km. Where the figure comes from, how many steps you really need and how long it takes. See it drawn to scale on a map.',
    h1: 'How far is 10,000 steps?',
    intro,
    question: 'How many kilometres is 10,000 steps?',
    answer: '10,000 steps come to roughly 7 to 8 kilometres: about 7.5 km (4.7 miles) with an average stride of 0.75 metres. A kilometre takes between 1,300 and 1,400 steps.',
    faqs: [
      { q: 'How many kilometres is 10,000 steps?', a: 'Between 7 and 8 kilometres — about 7.5 km (roughly 4.7 miles) with an average stride of 0.75 metres. It depends on your height and pace.' },
      { q: 'How many steps are there in a kilometre?', a: 'Between 1,300 and 1,400 steps, with an average step of 0.7 to 0.8 metres. The taller you are, the longer your stride and the fewer steps you need per kilometre (a mile is roughly 2,000–2,250 steps).' },
      { q: 'Where does the 10,000-steps idea come from?', a: 'From a 1965 Japanese marketing campaign: the "Manpo-kei" ("10,000-steps meter") pedometer made by Yamasa. It was a round, catchy number, not a recommendation based on studies.' },
      { q: 'Do you need 10,000 steps a day to be healthy?', a: 'Not necessarily. According to a 2025 meta-analysis in The Lancet Public Health, about 7,000 steps a day already cut the risk of dying early by around 47% compared with 2,000, and the benefit flattens out beyond 5,000–7,000 steps. 10,000 is great, but 7,000 is an excellent and more realistic target.' },
      { q: 'How long does it take to walk 10,000 steps?', a: 'About 1 hour and a half at a normal walking pace (5 km/h ≈ 3 mph), or up to 1 hour 40 minutes at a gentle pace. You don\'t have to do them all at once — they add up over the day.' },
    ],
    linkLabel: 'How far is 10,000 steps?',
  };
}

const DIST_ARTICLES = [tenThousandStepsArticle('es'), tenThousandStepsArticle('en')];

// Every editorial article, whatever its family: the single source for the
// /articulos/ hub, the article cards and the sitemap. Add new article lists
// here and they show up everywhere at once.
function allArticles() {
  return [...ARTICLES, ...LITER_ARTICLES, ...DIST_ARTICLES];
}

// Newest-first, so every listing (the hub, the article cards, the JSON-LD
// ItemList) shows the most recent articles first.
function articlesForLang(lang) {
  return byNewest(allArticles().filter(a => a.lang === lang));
}

// ---- kilos landing pages ---------------------------------------------------

function kiloSlugFor(lang, k) {
  return `${k}-kilos`;
}

function kiloPathFor(lang, k) {
  const prefix = lang === 'es' ? '' : '/en';
  return `${prefix}/${kiloSlugFor(lang, k)}/`;
}

function kiloFullUrl(lang, k) {
  return BASE_URL + kiloPathFor(lang, k);
}

function buildKiloHreflang(k) {
  const lines = LANGS.map(lg => `<link rel="alternate" hreflang="${lg}" href="${kiloFullUrl(lg, k)}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${kiloFullUrl('es', k)}">`);
  return lines.join('\n');
}

function buildKiloLangSwitch(lang, k) {
  const other = lang === 'es' ? 'en' : 'es';
  return `<a href="${kiloPathFor(other, k)}" hreflang="${other}">${UI[lang].switchLabel}</a>`;
}

function relatedKiloLinks(lang, currentK) {
  const links = KILO_QUANTITIES.filter(k => k !== currentK)
    .map(k => `        <li><a href="${kiloPathFor(lang, k)}">${escapeHtml(kiloPage(lang, k).linkLabel)}</a></li>`);
  const toolLabel = lang === 'es' ? 'La herramienta de kilos' : 'The kilos tool';
  links.push(`        <li><a href="${kilosPath(lang)}">${toolLabel}</a></li>`);
  return links.join('\n');
}

// In Spanish, an exact million takes "de": "1.000.000 de kilos".
function kiloNoun(lang, k) {
  const n = fmt(k, 0, lang);
  if (lang === 'es') {
    return k >= 1000000 && k % 1000000 === 0 ? `${n} de kilos` : `${n} kilos`;
  }
  return `${n} kilos`;
}

function kiloPage(lang, k) {
  const unit = kilosLib.pickKiloUnit(k);
  const picto = kilosLib.buildKiloPictogram(k, unit, lang);
  const phraseHtml = kilosLib.buildKiloPhrase(k, unit.id, lang);
  const phrasePlain = phraseHtml.replace(/<[^>]+>/g, '').replace(/^≈ /, '');
  const countPlain = picto.countText.replace(/^≈ /, '');
  const noun = kiloNoun(lang, k);
  const lb = k / kilosData.POUND_KG;
  const lbText = fmt(Math.round(lb), 0, lang);
  const t = k / 1000;
  const tText = fmt(t, t < 10 ? 1 : 0, lang);

  if (lang === 'es') {
    // "¿Cuánto ES 1.000.000 de kilos?" but "¿Cuánto SON 500 kilos?".
    const verb = k >= 1000000 && k % 1000000 === 0 ? 'es' : 'son';
    const title = `¿Cuánto ${verb} ${noun}? Visualízalo con iconos | Hectareómetro`;
    const h1 = `¿Cuánto ${verb} ${noun}?`;
    const phraseTail = phrasePlain ? `: ${phrasePlain}` : '';
    const description = `¿Cuánto ${verb} ${noun}? Aproximadamente ${countPlain}${phraseTail}. Míralo dibujado con iconos, de huevos a ballenas azules.`;
    const tPart = k >= 1000 ? ` o ${tText} toneladas` : '';
    const answer = `${noun.charAt(0).toUpperCase() + noun.slice(1)} son aproximadamente ${countPlain}${phraseTail}. En otras unidades: ${lbText} libras${tPart}.`;
    const phraseSentence = phraseHtml ? ` Es ${phraseHtml.replace(/^≈ /, 'aproximadamente ')}.` : '';
    const intro = [
      `<p>El dibujo de arriba muestra <b>${noun}</b> como ${countPlain}: cada icono representa ${unit.es.legend}.${phraseSentence}</p>`,
      `<p>En otras unidades, ${noun} son <b>${lbText} libras</b>${k >= 1000 ? ` o <b>${tText} toneladas</b>` : ''}. Cambia el número en la herramienta o elige otra referencia para el dibujo (huevos, personas, vacas, coches, elefantes…) con el selector «Ver».</p>`,
    ].join('\n      ');
    return {
      section: 'kilos', lang, key: k, k, title, description, h1, intro,
      question: h1, answer, linkLabel: `${fmt(k, 0, lang)} kilos`,
    };
  }
  const title = `How heavy is ${noun}? See it with icons | Hectareometer`;
  const h1 = `How heavy is ${noun}?`;
  const phraseTail = phrasePlain ? `: ${phrasePlain}` : '';
  const description = `How heavy is ${noun}? About ${countPlain}${phraseTail}. See it drawn with icons, from eggs to blue whales.`;
  const tPart = k >= 1000 ? ` or ${tText} tonnes` : '';
  const answer = `${noun.charAt(0).toUpperCase() + noun.slice(1)} is about ${countPlain}${phraseTail}. In other units: ${lbText} pounds${tPart}.`;
  const phraseSentence = phraseHtml ? ` It is ${phraseHtml.replace(/^≈ /, 'roughly ')}.` : '';
  const intro = [
    `<p>The drawing above shows <b>${noun}</b> as ${countPlain}: each icon represents ${unit.en.legend}.${phraseSentence}</p>`,
    `<p>In other units, ${noun} is <b>${lbText} pounds</b>${k >= 1000 ? ` or <b>${tText} tonnes</b>` : ''}. Change the number in the tool or pick another reference for the drawing (eggs, people, cows, cars, elephants…) with the "Show" selector.</p>`,
  ].join('\n      ');
  return {
    section: 'kilos', lang, key: k, k, title, description, h1, intro,
    question: h1, answer, linkLabel: `${fmt(k, 0, lang)} kilos`,
  };
}

// ---- rendering -----------------------------------------------------------

// Breadcrumb trail for a generated page: home › section tool › page, or
// home › articles hub › page for editorial articles. Used both for the
// visible .breadcrumb-line nav and the BreadcrumbList JSON-LD.
function breadcrumbTrail(page, canonical) {
  const lang = page.lang;
  const ui = UI[lang];
  const items = [{ name: ui.siteName, url: BASE_URL + homePath(lang) }];
  const isArticle = !!page.path;
  if (isArticle) {
    items.push({ name: ui.navArticles, url: BASE_URL + articlesHubPath(lang) });
  } else if (page.section === 'distancias') {
    items.push({ name: ui.navDistances, url: BASE_URL + distancesPath(lang) });
  } else if (page.section === 'litros') {
    items.push({ name: ui.navLiters, url: BASE_URL + litersPath(lang) });
  } else if (page.section === 'kilos') {
    items.push({ name: ui.navKilos, url: BASE_URL + kilosPath(lang) });
  }
  // Hectare landings hang straight off the home (the hectares tool IS the home)
  items.push({ name: page.linkLabel, url: canonical });
  return items;
}

function buildBreadcrumbHtml(items, lang) {
  const ariaLabel = lang === 'es' ? 'Ruta de navegación' : 'Breadcrumb';
  const lis = items.map((it, i) => i === items.length - 1
    ? `    <li><span aria-current="page">${escapeHtml(it.name)}</span></li>`
    : `    <li><a href="${it.url.replace(BASE_URL, '')}">${escapeHtml(it.name)}</a></li>`);
  return `<nav class="breadcrumb-line" aria-label="${ariaLabel}">\n  <ol>\n${lis.join('\n')}\n  </ol>\n</nav>`;
}

function buildJsonLd(page, canonical, breadcrumbItems) {
  // Pages carry a single question/answer; editorial articles can pass a `faqs`
  // array ([{ q, a }, ...]) that mirrors their visible <dl class="faq">.
  const faqs = page.faqs || [{ q: page.question, a: page.answer }];
  const graph = [
    {
      '@type': 'FAQPage',
      'inLanguage': page.lang,
      'mainEntity': faqs.map(f => ({
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      'itemListElement': breadcrumbItems.map((it, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': it.name,
        'item': it.url,
      })),
    },
  ];
  // Editorial articles additionally get Article markup (dates come from the
  // article objects; bump `modified` when their content changes).
  if (page.path && page.published) {
    graph.push({
      '@type': 'Article',
      'headline': page.h1,
      'description': page.description,
      'inLanguage': page.lang,
      'datePublished': page.published,
      'dateModified': page.modified || page.published,
      'author': { '@type': 'Person', 'name': 'David González Diez' },
      'publisher': {
        '@type': 'Organization',
        'name': UI[page.lang].siteName,
        'logo': { '@type': 'ImageObject', 'url': `${BASE_URL}/images/logo.png` },
      },
      'image': `${BASE_URL}/images/logo.png`,
      'mainEntityOfPage': canonical,
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

// Article cards of the page's own family (excluding itself) + a link to the
// hub. Empty when the family has no other articles (e.g. kilos, for now).
function relatedArticlesBlock(page) {
  const lang = page.lang;
  const family = page.section === 'litros' ? 'litros' : page.section === 'kilos' ? 'kilos' : page.section === 'distancias' ? 'distancias' : 'hectareas';
  const articles = articlesForLang(lang).filter(a => a.family === family && a.key !== page.key);
  if (!articles.length) return '';
  const ui = UI[lang];
  return `      <div class="section-block">
        <h2>${escapeHtml(ui.articlesHeading)}</h2>
        <div class="card-grid">
${articles.map(a => buildArticleCard(a, lang)).join('\n')}
        </div>
        <p><a href="${articlesHubPath(lang)}">${escapeHtml(ui.allArticles)}</a></p>
      </div>`;
}

function buildHreflang(key) {
  const lines = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${fullUrl(l, key)}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${fullUrl('es', key)}">`);
  return lines.join('\n');
}

function buildLangSwitch(lang, key) {
  const other = lang === 'es' ? 'en' : 'es';
  return `<a href="${pathFor(other, key)}" hreflang="${other}">${UI[lang].switchLabel}</a>`;
}

// Quantity chips only: articles now live in their own cards block
// (relatedArticlesBlock), not mixed in with the amounts.
function relatedLinks(lang, currentKey) {
  return KEYS.filter(k => k !== currentKey)
    .map(k => `        <li><a href="${pathFor(lang, k)}">${escapeHtml(buildPage(lang, k).linkLabel)}</a></li>`)
    .concat(`        <li><a href="${converterPath(lang)}">${escapeHtml(UI[lang].converterChipLabel)}</a></li>`)
    .join('\n');
}

// ---- articles hub (/articulos/, /en/articles/) -----------------------------

const TEMPLATE_HUB = fs.readFileSync(path.join(__dirname, 'template-hub.html'), 'utf8');

// One .card-article. Also reused (as a hand-copied pattern) by the homepages
// and tool pages, so keep the markup in sync with them if it changes.
function buildArticleCard(article, lang) {
  const ui = UI[lang];
  const kicker = ui.familyLabels[article.family] || '';
  return `        <div class="card card-article">
          <a href="${article.path}">
            <span class="card-kicker">${escapeHtml(kicker)}</span>
            <h3>${escapeHtml(article.h1)}</h3>
            <p>${escapeHtml(article.description)}</p>
            <span class="card-cta">${escapeHtml(ui.hubRead)}</span>
          </a>
        </div>`;
}

function buildHubHreflang() {
  const lines = LANGS.map(lg => `<link rel="alternate" hreflang="${lg}" href="${BASE_URL + articlesHubPath(lg)}">`);
  lines.push(`<link rel="alternate" hreflang="x-default" href="${BASE_URL + articlesHubPath('es')}">`);
  return lines.join('\n');
}

// CollectionPage + ItemList. The en hub legitimately lists fewer items than
// the es one (some articles are Spanish-only): equivalent listings, not
// identical ones.
function buildHubJsonLd(lang, articles, crumbs) {
  const ui = UI[lang];
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        'name': ui.hubH1,
        'description': ui.hubDescription,
        'inLanguage': lang,
        'url': BASE_URL + articlesHubPath(lang),
      },
      {
        '@type': 'ItemList',
        'itemListElement': articles.map((a, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'name': a.h1,
          'url': BASE_URL + a.path,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': crumbs.map((it, i) => ({
          '@type': 'ListItem',
          'position': i + 1,
          'name': it.name,
          'item': it.url,
        })),
      },
    ],
  }, null, 2);
}

function writeArticlesHub(lang) {
  const ui = UI[lang];
  const other = lang === 'es' ? 'en' : 'es';
  const articles = articlesForLang(lang);
  const crumbs = [
    { name: ui.siteName, url: BASE_URL + homePath(lang) },
    { name: ui.navArticles, url: BASE_URL + articlesHubPath(lang) },
  ];
  const repl = {
    LANG: ui.htmlLang,
    BREADCRUMB: buildBreadcrumbHtml(crumbs, lang),
    HREFLANG: buildHubHreflang(),
    LANG_SWITCH: `<a href="${articlesHubPath(other)}" hreflang="${other}">${ui.switchLabel}</a>`,
    CANONICAL: BASE_URL + articlesHubPath(lang),
    TITLE: escapeHtml(ui.hubTitle),
    OG_TITLE: escapeHtml(ui.hubH1),
    DESCRIPTION: escapeHtml(ui.hubDescription),
    SITE_NAME: ui.siteName,
    OG_LOCALE: ui.ogLocale,
    JSON_LD: buildHubJsonLd(lang, articles, crumbs),
    H1: escapeHtml(ui.hubH1),
    INTRO: escapeHtml(ui.hubIntro),
    ARTICLE_CARDS: articles.map(a => buildArticleCard(a, lang)).join('\n'),
    HOME_URL: homePath(lang),
    NAV_MEASURE_URL: measurePath(lang),
    NAV_MEASURE_LABEL: ui.navMeasure,
    NAV_MEASUREDIST_URL: measureDistancePath(lang),
    NAV_MEASUREDIST_LABEL: ui.navMeasureDist,
    NAV_DIST_URL: distancesPath(lang),
    NAV_DIST_LABEL: ui.navDistances,
    NAV_LITERS_URL: litersPath(lang),
    NAV_LITERS_LABEL: ui.navLiters,
    NAV_KILOS_URL: kilosPath(lang),
    NAV_KILOS_LABEL: ui.navKilos,
    NAV_CONVERTER_URL: converterPath(lang),
    NAV_CONVERTER_LABEL: ui.navConverter,
    NAV_ARTICLES_URL: articlesHubPath(lang),
    NAV_ARTICLES_LABEL: ui.navArticles,
    NAV_MENU_LABEL: ui.navMenu,
  };
  let out = TEMPLATE_HUB;
  Object.keys(repl).forEach(k => {
    out = out.split('{{' + k + '}}').join(repl[k]);
  });
  const dir = path.join(ROOT, articlesHubPath(lang).replace(/^\/+|\/+$/g, ''));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), out);
  console.log(`generated ${articlesHubPath(lang)}`);
  return { lang, slug: lang === 'es' ? 'articulos' : 'articles', path: articlesHubPath(lang), label: ui.navArticles, title: ui.hubTitle };
}

function render(page, template) {
  const ui = UI[page.lang];
  const isLiters = page.section === 'litros';
  const isKilos = page.section === 'kilos';
  const isDistances = page.section === 'distancias';
  // Editorial articles (any section) carry their own path and exist in one
  // language only: canonical = BASE_URL + path, hreflang es + x-default, and
  // the language switch points at the section's tool in the other language
  // (the home for hectares articles). Liters/kilos LANDINGS have no path and
  // use their own slug-family hreflang instead.
  const isArticle = !!page.path;
  const other = page.lang === 'es' ? 'en' : 'es';
  let canonical, hreflang, langSwitch;
  if (isArticle && page.alternates) {
    // Bilingual editorial article: hreflang points each language at its
    // translation (x-default = Spanish); the switch jumps to the sibling.
    canonical = BASE_URL + page.path;
    hreflang = Object.keys(page.alternates)
      .map(lg => `<link rel="alternate" hreflang="${lg}" href="${BASE_URL + page.alternates[lg]}">`)
      .concat(`<link rel="alternate" hreflang="x-default" href="${BASE_URL + page.alternates.es}">`)
      .join('\n');
    langSwitch = `<a href="${page.alternates[other]}" hreflang="${other}">${UI[page.lang].switchLabel}</a>`;
  } else if (isArticle) {
    // Single-language editorial article (es-only): es + x-default, switch to
    // the section's tool (or home) in the other language.
    canonical = BASE_URL + page.path;
    hreflang = [
      `<link rel="alternate" hreflang="${page.lang}" href="${canonical}">`,
      `<link rel="alternate" hreflang="x-default" href="${canonical}">`,
    ].join('\n');
    const switchHref = isLiters ? litersPath(other) : isKilos ? kilosPath(other) : isDistances ? distancesPath(other) : homePath(other);
    langSwitch = `<a href="${switchHref}" hreflang="${other}">${UI[page.lang].switchLabel}</a>`;
  } else if (isLiters) {
    canonical = literFullUrl(page.lang, page.key);
    hreflang = buildLiterHreflang(page.key);
    langSwitch = buildLiterLangSwitch(page.lang, page.key);
  } else if (isKilos) {
    canonical = kiloFullUrl(page.lang, page.key);
    hreflang = buildKiloHreflang(page.key);
    langSwitch = buildKiloLangSwitch(page.lang, page.key);
  } else {
    canonical = fullUrl(page.lang, page.key);
    hreflang = buildHreflang(page.key);
    langSwitch = buildLangSwitch(page.lang, page.key);
  }
  const crumbs = breadcrumbTrail(page, canonical);
  const repl = {
    LANG: ui.htmlLang,
    PAGE_LANG: page.lang,
    HREFLANG: hreflang,
    LANG_SWITCH: langSwitch,
    CANONICAL: canonical,
    TITLE: escapeHtml(page.title),
    OG_TITLE: escapeHtml(page.h1),
    DESCRIPTION: escapeHtml(page.description),
    SITE_NAME: ui.siteName,
    OG_LOCALE: ui.ogLocale,
    JSON_LD: buildJsonLd(page, canonical, crumbs),
    BREADCRUMB: buildBreadcrumbHtml(crumbs, page.lang),
    RELATED_ARTICLES_BLOCK: relatedArticlesBlock(page),
    HA: String(page.ha),
    L: String(page.l || ''),
    K: String(page.k || ''),
    DIST: String(page.dist || ''),
    DIST_UNIT: page.distUnit || '',
    DIST_OVERLAY_PRE: ui.distOverlayPre,
    DIST_OVERLAY_POST: ui.distOverlayPost,
    DIST_ARIA_UNIT: ui.distAriaUnit,
    DIST_UNIT_OPTIONS: ui.distUnitOptions,
    PRESET_EXTRA: page.presetExtra || '',
    LITER_TOOL_PRE: ui.literToolPre,
    LITER_UNIT_OPTIONS: ui.literUnitOptions,
    LITER_SEE: ui.literSee,
    LITER_ARIA_UNIT: ui.literAriaUnit,
    LITER_ARIA_DRAW: ui.literAriaDraw,
    LITER_DOWNLOAD: ui.literDownload,
    KILO_TOOL_PRE: ui.kiloToolPre,
    KILO_UNIT_OPTIONS: ui.kiloUnitOptions,
    KILO_ARIA_UNIT: ui.kiloAriaUnit,
    OVERLAY_PRE: ui.overlayPre,
    OVERLAY_POST: ui.overlayPost,
    SHARE_CTA: ui.shareCta,
    SHARE_MORE: ui.shareMore,
    LABEL_LINK: ui.labelLink,
    LABEL_IFRAME: ui.labelIframe,
    LABEL_WIDTH: ui.labelWidth,
    LABEL_HEIGHT: ui.labelHeight,
    H1: escapeHtml(page.h1),
    ARTICLE_DATE: isArticle ? articleDateHtml(page) : '',
    INTRO: page.intro,
    RELATED_HEADING: isLiters ? ui.relatedHeadingLiters : isKilos ? ui.relatedHeadingKilos : isDistances ? ui.relatedHeadingDistances : ui.relatedHeading,
    RELATED_LINKS: isLiters ? relatedLiterLinks(page.lang, page.key)
      : isKilos ? relatedKiloLinks(page.lang, page.key)
      : isDistances ? relatedDistanceLinks(page.lang)
      : relatedLinks(page.lang, page.key),
    HOME_URL: homePath(page.lang),
    NAV_MEASURE_URL: measurePath(page.lang),
    NAV_MEASURE_LABEL: ui.navMeasure,
    NAV_MEASUREDIST_URL: measureDistancePath(page.lang),
    NAV_MEASUREDIST_LABEL: ui.navMeasureDist,
    NAV_DIST_URL: distancesPath(page.lang),
    NAV_DIST_LABEL: ui.navDistances,
    NAV_LITERS_URL: litersPath(page.lang),
    NAV_LITERS_LABEL: ui.navLiters,
    NAV_KILOS_URL: kilosPath(page.lang),
    NAV_KILOS_LABEL: ui.navKilos,
    NAV_CONVERTER_URL: converterPath(page.lang),
    NAV_CONVERTER_LABEL: ui.navConverter,
    NAV_ARTICLES_URL: articlesHubPath(page.lang),
    NAV_ARTICLES_LABEL: ui.navArticles,
    NAV_MENU_LABEL: ui.navMenu,
    BACK_TEXT: isLiters ? ui.backTextLiters : isKilos ? ui.backTextKilos : isDistances ? ui.backTextDistances : ui.backText,
  };
  let out = template || TEMPLATE;
  Object.keys(repl).forEach(k => {
    out = out.split('{{' + k + '}}').join(repl[k]);
  });
  return out;
}

function writeSitemap() {
  const urls = [`${BASE_URL}/`, `${BASE_URL}/en/`];
  LANGS.forEach(lang => urls.push(BASE_URL + measurePath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + measureDistancePath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + distancesPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + litersPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + kilosPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + converterPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + articlesHubPath(lang)));
  LANGS.forEach(lang => KEYS.forEach(key => urls.push(fullUrl(lang, key))));
  LANGS.forEach(lang => LITER_QUANTITIES.forEach(l => urls.push(literFullUrl(lang, l))));
  LANGS.forEach(lang => KILO_QUANTITIES.forEach(k => urls.push(kiloFullUrl(lang, k))));
  ARTICLES.forEach(page => urls.push(BASE_URL + page.path));
  LITER_ARTICLES.forEach(page => urls.push(BASE_URL + page.path));
  DIST_ARTICLES.forEach(page => urls.push(BASE_URL + page.path));
  const body = urls.map(u => {
    const isHome = u === `${BASE_URL}/` || u === `${BASE_URL}/en/`;
    const isSectionHome = LANGS.some(lang => u === BASE_URL + measurePath(lang) || u === BASE_URL + measureDistancePath(lang) || u === BASE_URL + distancesPath(lang) || u === BASE_URL + litersPath(lang) || u === BASE_URL + kilosPath(lang) || u === BASE_URL + converterPath(lang) || u === BASE_URL + articlesHubPath(lang));
    const priority = isHome ? '1.0' : isSectionHome ? '0.9' : '0.8';
    return `  <url>\n    <loc>${u}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log(`sitemap.xml written with ${urls.length} URLs`);
}

function main() {
  const manifest = [];
  LANGS.forEach(lang => {
    KEYS.forEach(key => {
      const page = buildPage(lang, key);
      const slug = slugFor(lang, key);
      const dir = lang === 'es' ? path.join(ROOT, slug) : path.join(ROOT, 'en', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), render(page));
      manifest.push({ lang, slug, path: pathFor(lang, key), label: page.linkLabel, title: page.title });
      console.log(`generated ${pathFor(lang, key)}`);
    });
  });
  LANGS.forEach(lang => {
    LITER_QUANTITIES.forEach(l => {
      const page = literPage(lang, l);
      const slug = literSlugFor(lang, l);
      const dir = lang === 'es' ? path.join(ROOT, slug) : path.join(ROOT, 'en', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), render(page, TEMPLATE_LITROS));
      manifest.push({ lang, slug, path: literPathFor(lang, l), label: page.linkLabel, title: page.title });
      console.log(`generated ${literPathFor(lang, l)}`);
    });
  });
  LANGS.forEach(lang => {
    KILO_QUANTITIES.forEach(k => {
      const page = kiloPage(lang, k);
      const slug = kiloSlugFor(lang, k);
      const dir = lang === 'es' ? path.join(ROOT, slug) : path.join(ROOT, 'en', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), render(page, TEMPLATE_KILOS));
      manifest.push({ lang, slug, path: kiloPathFor(lang, k), label: page.linkLabel, title: page.title });
      console.log(`generated ${kiloPathFor(lang, k)}`);
    });
  });
  ARTICLES.forEach(page => {
    const dir = path.join(ROOT, page.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(page));
    manifest.push({ lang: page.lang, slug: page.slug, path: page.path, label: page.linkLabel, title: page.title });
    console.log(`generated ${page.path}`);
  });
  LITER_ARTICLES.forEach(page => {
    // Derive the output dir from the path so en articles land under en/.
    const dir = path.join(ROOT, page.path.replace(/^\/+|\/+$/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(page, TEMPLATE_LITROS));
    manifest.push({ lang: page.lang, slug: page.slug, path: page.path, label: page.linkLabel, title: page.title });
    console.log(`generated ${page.path}`);
  });
  DIST_ARTICLES.forEach(page => {
    const dir = path.join(ROOT, page.path.replace(/^\/+|\/+$/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), render(page, TEMPLATE_DISTANCIAS));
    manifest.push({ lang: page.lang, slug: page.slug, path: page.path, label: page.linkLabel, title: page.title });
    console.log(`generated ${page.path}`);
  });
  LANGS.forEach(lang => manifest.push(writeArticlesHub(lang)));
  fs.writeFileSync(path.join(__dirname, 'pages.json'), JSON.stringify(manifest, null, 2));
  writeSitemap();
  console.log(`\n${manifest.length} pages generated (${LANGS.length} languages × (${KEYS.length} keys + ${LITER_QUANTITIES.length} liter + ${KILO_QUANTITIES.length} kilo amounts) + ${ARTICLES.length + LITER_ARTICLES.length + DIST_ARTICLES.length} articles + ${LANGS.length} article hubs).`);
}

main();

module.exports = { LANGS, KEYS, BASE_URL, pathFor, slugFor, buildPage };
