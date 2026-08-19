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
const crypto = require('crypto');
const { execSync } = require('child_process');

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
// Round figures plus the ones the press actually uses when reporting wildfires
// and land deals. Every quantity added here needs a COMPARISONS entry in both
// languages; everything else (pages, sitemap, chips, hreflang) follows.
const QUANTITIES = [
  1, 100, 300, 400, 500, 1000, 2000, 3000, 4000, 5000,
  10000, 15000, 20000, 30000, 50000, 100000, 200000,
];
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
    faqHeading: 'Preguntas frecuentes',
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
    faqHeading: 'Frequently asked questions',
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
    500: [
      'unas cuatro veces el Parque del Retiro de Madrid (118 ha)',
      'dos veces y media el Principado de Mónaco (202 ha)',
      'casi el doble de la primera sección del Bosque de Chapultepec (~274 ha)',
    ],
    1000: [
      'el Bois de Boulogne de París (unas 846 ha)',
      'el aeropuerto de Londres-Heathrow (~1.270 ha)',
      'casi tres veces Central Park de Nueva York (341 ha)',
    ],
    2000: [
      'el Bois de Boulogne y el Bois de Vincennes de París juntos (~1.840 ha)',
      'un tercio de la isla de Manhattan (~5.900 ha)',
      'unas seis veces Central Park de Nueva York (341 ha)',
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
    5000: [
      'casi toda la isla de Manhattan (~5.900 ha)',
      'la mitad de la ciudad de Barcelona (~10.100 ha)',
      'unas quince veces Central Park de Nueva York (341 ha)',
    ],
    10000: [
      'un cuadrado de 10 × 10 kilómetros (100 km²)',
      'toda la ciudad de Barcelona (~10.100 ha)',
      'casi el doble de la isla de Manhattan (~5.900 ha)',
    ],
    15000: [
      'casi todo el país de Liechtenstein (~16.000 ha)',
      'una vez y media la ciudad de Barcelona (~10.100 ha)',
      'unas cuarenta y cuatro veces Central Park de Nueva York (341 ha)',
    ],
    20000: [
      'casi el doble de la ciudad de Barcelona (~10.100 ha)',
      'más que todo el país de Liechtenstein (~16.000 ha)',
      'un tercio del término municipal de Madrid (~60.400 ha)',
    ],
    30000: [
      'la mitad del término municipal de Madrid (~60.400 ha)',
      'casi el doble del país de Liechtenstein (~16.000 ha)',
      'unas tres veces la ciudad de Barcelona (~10.100 ha)',
    ],
    50000: [
      'casi toda la isla de Ibiza (~57.200 ha)',
      'cuatro quintas partes del término municipal de Madrid (~60.400 ha)',
      'unas cinco veces la ciudad de Barcelona (~10.100 ha)',
    ],
    100000: [
      'casi el doble de la isla de Ibiza (~57.200 ha)',
      'una vez y media el término municipal de Madrid (~60.400 ha)',
      'dos tercios de la isla de Gran Canaria (~156.000 ha)',
    ],
    200000: [
      'algo más que toda la provincia de Guipúzcoa (~198.000 ha)',
      'más que la isla de Gran Canaria (~156.000 ha)',
      'más de tres veces el término municipal de Madrid (~60.400 ha)',
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
    500: [
      "about three and a half times London's Hyde Park (142 ha)",
      'two and a half times the Principality of Monaco (202 ha)',
      "one and a half times New York's Central Park (341 ha)",
    ],
    1000: [
      'the Bois de Boulogne in Paris (~846 ha)',
      'London Heathrow airport (~1,270 ha)',
      "almost three times New York's Central Park (341 ha)",
    ],
    2000: [
      'the Bois de Boulogne and Bois de Vincennes in Paris combined (~1,840 ha)',
      'a third of the island of Manhattan (~5,900 ha)',
      "about six times New York's Central Park (341 ha)",
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
    5000: [
      'most of the island of Manhattan (~5,900 ha)',
      'about half the city of Paris (~10,500 ha)',
      "roughly fifteen times New York's Central Park (341 ha)",
    ],
    10000: [
      'a square 10 × 10 kilometres (100 km²)',
      'the whole city of Paris (~10,500 ha)',
      'almost twice the island of Manhattan (~5,900 ha)',
    ],
    15000: [
      'almost the whole country of Liechtenstein (~16,000 ha)',
      'one and a half times the city of Paris (~10,500 ha)',
      "about forty-four times New York's Central Park (341 ha)",
    ],
    20000: [
      'larger than the entire country of Liechtenstein (~16,000 ha)',
      'almost twice the city of Paris (~10,500 ha)',
      'over three times the island of Manhattan (~5,900 ha)',
    ],
    30000: [
      'half the municipality of Madrid (~60,400 ha)',
      'almost twice the country of Liechtenstein (~16,000 ha)',
      'nearly three times the city of Paris (~10,500 ha)',
    ],
    50000: [
      'almost the whole island of Ibiza (~57,200 ha)',
      'about five times the city of Paris (~10,500 ha)',
      'three times the country of Liechtenstein (~16,000 ha)',
    ],
    100000: [
      'almost two-thirds of Greater London (~157,200 ha)',
      'ten times the city of Paris (~10,500 ha)',
      'almost twice the island of Ibiza (~57,200 ha)',
    ],
    200000: [
      'larger than the whole of Greater London (~157,200 ha)',
      'more than the island of Gran Canaria (~156,000 ha)',
      'about three-quarters of the country of Luxembourg (~258,600 ha)',
    ],
  },
};

// ---- page content builders ----------------------------------------------

// Latitude the tool centres on when a page sets no PRESET_LAT (the default in
// js/hectareas.js). Only used to size the zoom below.
const DEFAULT_MAP_LAT = 43.3086485;
// Narrowest map viewport we design for, in CSS pixels (mobile is ~72% of
// sessions). The circle has to fit inside it at the preset zoom.
const MAP_MIN_WIDTH_PX = 260;

// Without this every quantity page loaded at the js default zoom of 12, where
// 1 ha is a 4-pixel dot and 200.000 ha overflow the viewport entirely. Pick the
// closest zoom in that still fits the whole circle: Web Mercator ground
// resolution is 156543.03 * cos(lat) / 2^zoom metres per pixel.
// Lengths for the landing FAQs: metres below 1 km, kilometres above.
function lenEs(m) {
  return m >= 1000 ? `${fmt(m / 1000, 2, 'es')} km` : `${fmt(Math.round(m), 0, 'es')} metros`;
}

function lenEn(m) {
  return m >= 1000 ? `${fmt(m / 1000, 2, 'en')} km` : `${fmt(Math.round(m), 0, 'en')} metres`;
}

function zoomForHa(ha) {
  const diameter = 2 * Math.sqrt((ha * 10000) / Math.PI);
  const mppAtZoom0 = 156543.03392 * Math.cos((DEFAULT_MAP_LAT * Math.PI) / 180);
  const zoom = Math.floor(Math.log2((MAP_MIN_WIDTH_PX * mppAtZoom0) / diameter));
  return Math.max(8, Math.min(18, zoom));
}

function quantityPage(lang, ha) {
  const m2 = fmt(ha * 10000, 0, lang);
  const km2 = fmt(ha / 100, 2, lang);
  const ff = fields(ha, lang);
  const ac = acres(ha, lang);
  const n = fmt(ha, 0, lang);
  const examples = COMPARISONS[lang][ha];
  // Side of a square of this area and radius of the circle the tool draws.
  const sideM = Math.sqrt(ha * 10000);
  const radiusM = Math.sqrt((ha * 10000) / Math.PI);

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
      faqs: [
        {
          q: ha === 1 ? '¿Cuánto es una hectárea?' : `¿Cuánto son ${n} hectáreas?`,
          a: `${haLabel} son ${m2} metros cuadrados (${km2} km²), aproximadamente ${ff} campos de fútbol.`,
        },
        {
          q: `¿Cuántos campos de fútbol caben en ${haLabel}?`,
          a: `Unos ${ff} campos de fútbol reglamentarios. Cada campo mide 105 × 68 metros, unos 7.140 m², es decir, 0,714 hectáreas: una hectárea es más grande que un campo de fútbol, no al revés.`,
        },
        {
          q: `¿Cuánto mide un cuadrado de ${haLabel}?`,
          a: `Un cuadrado de ${haLabel} mide ${lenEs(sideM)} de lado. Dibujado como círculo, que es lo que hace el Hectareómetro, tendría ${lenEs(radiusM)} de radio.`,
        },
      ],
      linkLabel: haLabel,
      presetExtra: ` var PRESET_ZOOM = ${zoomForHa(ha)};`,
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
    faqs: [
      {
        q: ha === 1 ? 'How big is a hectare?' : `How big are ${n} hectares?`,
        a: `${haLabel} are ${m2} square metres (${km2} km²), about ${ff} football fields or ${ac} acres.`,
      },
      {
        q: `How many football fields fit in ${haLabel}?`,
        a: `About ${ff} standard football pitches. Each pitch is 105 × 68 metres, roughly 7,140 m², i.e. 0.714 hectares — so a hectare is bigger than a football pitch, not the other way round.`,
      },
      {
        q: `How big is a square of ${haLabel}?`,
        a: `A square of ${haLabel} measures ${lenEn(sideM)} on each side. Drawn as a circle, which is what the Hectareometer does, it would have a radius of ${lenEn(radiusM)}.`,
      },
    ],
    linkLabel: haLabel,
    presetExtra: ` var PRESET_ZOOM = ${zoomForHa(ha)};`,
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
      faqs: [
        {
          q: '¿A cuántos campos de fútbol equivale una hectárea?',
          a: 'Una hectárea equivale a unos 1,4 campos de fútbol. Un campo reglamentario (~105 × 68 m, unos 7.140 m²) ocupa alrededor de 0,7 hectáreas.',
        },
        {
          q: '¿Cuántas hectáreas mide un campo de fútbol?',
          a: 'Un campo de 105 × 68 metros ocupa 7.140 m², es decir, 0,714 hectáreas: algo menos de tres cuartos de hectárea.',
        },
        {
          q: '¿Cuánto mide una hectárea?',
          a: 'Una hectárea son 10.000 metros cuadrados: un cuadrado de 100 × 100 metros. Cien hectáreas son un kilómetro cuadrado.',
        },
        {
          q: '¿Por qué se miden los incendios en campos de fútbol?',
          a: 'Porque es una imagen conocida, pero engaña: al ser el campo más pequeño que la hectárea, el número de campos siempre sale mayor y la superficie parece más grande de lo que es. 300 campos de fútbol son solo unas 210 hectáreas.',
        },
        {
          q: '¿Cuántos campos de fútbol ocupa una planta solar?',
          a: 'Una macroplanta fotovoltaica de las que se tramitan hoy en España ocupa entre 200 y 350 hectáreas, es decir, entre 280 y 490 campos de fútbol. Las 275 hectáreas de la planta de Haza del Sol, en Guadalajara, son unos 385 campos.',
        },
      ],
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
    faqs: [
      {
        q: 'How many football fields is a hectare?',
        a: 'A hectare is about 1.4 football fields. A standard pitch (~105 × 68 m, about 7,140 m²) covers roughly 0.7 hectares.',
      },
      {
        q: 'How many hectares is a football pitch?',
        a: 'A 105 × 68 metre pitch covers 7,140 m², i.e. 0.714 hectares — a little under three quarters of a hectare.',
      },
      {
        q: 'How big is a hectare?',
        a: 'A hectare is 10,000 square metres: a square of 100 × 100 metres. One hundred hectares make a square kilometre, and a hectare is about 2.47 acres.',
      },
      {
        q: 'Why are wildfires measured in football fields?',
        a: 'Because it is a familiar image, but it misleads: as a pitch is smaller than a hectare, the number of pitches always comes out larger and the area sounds bigger than it is. 300 football fields are only about 210 hectares.',
      },
    ],
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
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántas hectáreas se han quemado en España en incendios forestales entre 2020 y 2025?</dt>
        <dd>Unas <b><a href="${madridMapUrl(total)}">${totalLabel} hectáreas</a></b> (9.168 km², más
          que toda la Comunidad de Madrid). El peor año del periodo fue 2025, con casi 355.000
          hectáreas, el dato más alto desde 1994; el récord de la serie histórica (1961-2025) sigue
          siendo 1985, con 484.475 hectáreas.</dd>

        <dt>¿Cuál fue el peor año de incendios en España?</dt>
        <dd>1985, con <a href="${madridMapUrl(BURNED_1985)}">484.475 hectáreas</a> quemadas: el
          máximo de la serie histórica, que arranca en 1961. Le sigue 1994, con
          <a href="${madridMapUrl(BURNED_1994)}">437.602 hectáreas</a>.</dd>

        <dt>¿Cuántas hectáreas ardieron en España en 2025?</dt>
        <dd><a href="${madridMapUrl(byYear[2025])}">${fmt(Math.round(byYear[2025]), 0)} hectáreas</a>,
          casi 355.000: el peor año desde 1994 y más de un tercio de todo lo quemado entre 2020
          y 2025.</dd>

        <dt>¿Cuánto es una hectárea quemada?</dt>
        <dd>Una <a href="/1-hectarea/">hectárea</a> son 10.000 metros cuadrados: un cuadrado de
          100 × 100 metros, o algo más de <a href="/hectarea-campo-de-futbol/">un campo de fútbol</a>.
          Cien hectáreas son un kilómetro cuadrado.</dd>

        <dt>¿De dónde salen los datos de superficie quemada?</dt>
        <dd>De las estadísticas del Ministerio de Agricultura, Pesca y Alimentación, en la serie
          recopilada por EpData. Son hectáreas de superficie forestal quemada, sumando arbolado y
          matorral.</dd>
      </dl>
      <p>
        ¿Quieres ver otras superficies a escala? Compara
        <a href="/hectarea-campo-de-futbol/">una hectárea con un campo de fútbol</a>, mira
        <a href="/las-dimensiones-del-eclipse/">cuánta España tapó la sombra del eclipse</a> o
        <a href="/cuanto-ocupan-centros-datos-aws-aragon/">cuánto ocupan los centros de datos de AWS
        en Aragón</a>. Y si prefieres dibujar tú, tienes
        <a href="/medir-superficie/">medir una superficie</a> y el
        <a href="/">Hectareómetro</a>.
      </p>`;
  return {
    key: 'burned-area-spain', lang: 'es', ha: Math.round(total),
    // modified bumped on 2026-08-13: the article gained its FAQ section and a
    // closing block of internal links.
    family: 'hectareas', published: '2026-07-09', modified: '2026-08-13',
    slug: 'hectareas-quemadas-incendios-espana',
    path: '/hectareas-quemadas-incendios-espana/',
    presetExtra: ` var PRESET_ZOOM = 8; var PRESET_LAT = ${MADRID.lat}; var PRESET_LON = ${MADRID.lon};`,
    title: 'Hectáreas quemadas en incendios forestales en España (2020-2025) | Hectareómetro',
    description: `Entre 2020 y 2025 ardieron en España ${totalLabel} hectáreas en incendios forestales, más que toda la Comunidad de Madrid. Míralo dibujado a escala sobre un mapa real.`,
    h1: '¿Cuánta superficie se ha quemado en España en incendios forestales?',
    intro,
    question: '¿Cuántas hectáreas se han quemado en España en incendios forestales entre 2020 y 2025?',
    answer: `Entre 2020 y 2025 se quemaron unas ${totalLabel} hectáreas en incendios forestales en España (9.168 km², más que la superficie de la Comunidad de Madrid). El peor año del periodo fue 2025, con casi 355.000 hectáreas, el dato más alto desde 1994; el récord de la serie histórica (1961-2025) sigue siendo de 1985, con 484.475 hectáreas.`,
    faqs: [
      { q: '¿Cuántas hectáreas se han quemado en España en incendios forestales entre 2020 y 2025?', a: `Unas ${totalLabel} hectáreas (9.168 km², más que toda la Comunidad de Madrid). El peor año del periodo fue 2025, con casi 355.000 hectáreas, el dato más alto desde 1994; el récord de la serie histórica (1961-2025) sigue siendo 1985, con 484.475 hectáreas.` },
      { q: '¿Cuál fue el peor año de incendios en España?', a: '1985, con 484.475 hectáreas quemadas: el máximo de la serie histórica, que arranca en 1961. Le sigue 1994, con 437.602 hectáreas.' },
      { q: '¿Cuántas hectáreas ardieron en España en 2025?', a: `${fmt(Math.round(byYear[2025]), 0)} hectáreas, casi 355.000: el peor año desde 1994 y más de un tercio de todo lo quemado entre 2020 y 2025.` },
      { q: '¿Cuánto es una hectárea quemada?', a: 'Una hectárea son 10.000 metros cuadrados: un cuadrado de 100 × 100 metros, o algo más de un campo de fútbol. Cien hectáreas son un kilómetro cuadrado.' },
      { q: '¿De dónde salen los datos de superficie quemada?', a: 'De las estadísticas del Ministerio de Agricultura, Pesca y Alimentación, en la serie recopilada por EpData. Son hectáreas de superficie forestal quemada, sumando arbolado y matorral.' },
    ],
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

// ---- Las dimensiones del eclipse (12 de agosto de 2026) --------------------
//
// Editorial data for the eclipse article. Spanish-only (the framing is the band
// over Spain). Everything below is either quoted from a primary source or
// computed here from primary-source geometry; nothing is copied from press.
//
// PRIMARY SOURCES
// · Path of the umbra (northern limit, southern limit, central line) and, for
//   each instant, path width, Sun altitude and central duration: NASA/Fred
//   Espenak, "Path of the Total Solar Eclipse of 2026 Aug 12".
//   https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html
//   Central line fixes over Spain (UT → local = UT+2):
//     18:26  44 42.8N  8 23.9W   width 311 km  Sun 13°  1m53.0s
//     18:28  43 22.3N  6 11.3W   width 304 km  Sun 10°  1m49.3s
//     18:30  41 49.0N  3 11.1W   width 294 km  Sun  8°  1m44.6s
//     18:32  39 24.5N  2 57.0E   width 270 km  Sun  2°  1m35.8s
// · Local circumstances, cities and Sun altitudes over Spain: IGN,
//   https://eclipses.ign.es/eclipse-total-sol-de-12-de-agosto-2026.html
//   (A Coruña: totality 76 s with the Sun at 12°; the central line passes by
//   Avilés, Oviedo, Aranda de Duero, Soria, Peñíscola and Palma de Mallorca).
// · Longest totality in Spain, 1m50s near Luarca (Asturias); the central line
//   runs Luarca → Peñíscola: https://es.wikipedia.org/wiki/Eclipse_solar_del_12_de_agosto_de_2026
//
// COMPUTED HERE (not taken from anyone)
// · Darkened area: NASA's northern and southern limit polylines were closed
//   into a corridor polygon, projected to a Lambert azimuthal EQUAL-AREA
//   projection centred on Spain, and intersected with the geometry of the 52
//   Spanish provinces on a 1,5 km grid. Accuracy check: the same provinces sum
//   to 505.684 km², against the official 505.990 km² — a 0,06 % error.
//   Result: 201.323 km² = 20.132.325 ha of Spanish land inside the band, 39,8 %
//   of the country, across 31 provinces, 11 of them completely inside.
// · Umbra ground speed, from the central-line fixes above (haversine / 120 s):
//   18:26→18:28  231 km → 6.936 km/h · 18:28→18:30  301 km → 9.016 km/h ·
//   18:30→18:32  583 km → 17.484 km/h. Crossing Luarca (20:27:37 local) to
//   Peñíscola (20:31:09), 680 km in 3 min 33 s → 11.512 km/h average.
// · Margins of the cities left out, as the distance to the nearest limit:
//   Madrid 11 km (southern edge), Pamplona 11 km (northern), Barcelona 31 km,
//   San Sebastián 42 km, Salamanca 45 km, Toledo 78 km.
// · Scale model of the 400 rule: Moon = a 24 cm basketball → scale 1:14.478.333
//   → Moon at 26,6 m and Sun a 96 m sphere at 10,3 km.
const ECLIPSE_2026 = {
  ha: 20132325,            // Spanish land inside the band of totality
  km2: 201323,
  pctSpain: 39.8,
  provinces: 31,
  wholeProvinces: ['León', 'Teruel', 'Burgos', 'Asturias', 'Soria', 'Palencia',
    'Castellón', 'Cantabria', 'La Rioja', 'Baleares', 'Álava'],
  widthKm: 294,            // path width over the middle of Spain (18:30 UT)
  crossKm: 680,            // Luarca → Peñíscola along the central line
  crossSeconds: 213,
  speedIn: 6936,           // km/h entering over Asturias
  speedMid: 9016,          // km/h over Castilla y León / Aragón
  speedOut: 17484,         // km/h leaving over the Mediterranean
};

function eclipseArticle() {
  const e = ECLIPSE_2026;
  const NASA_URL = 'https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html';
  const IGN_URL = 'https://eclipses.ign.es/eclipse-total-sol-de-12-de-agosto-2026.html';
  const CIENCIA_URL = 'https://www.ciencia.gob.es/Noticias/2026/agosto/manana-eclipse-total-sol-Peninsula-Iberica.html';
  // The band drawn as an equivalent circle (253 km of radius) over the peninsula.
  const mapUrl = `/?ha=${e.ha}&lat=41.6&lon=-3.2&z=6`;
  const dist = (d, lat, lon, z) => `/distancias/?d=${d}&u=km&lat=${lat}&lon=${lon}&z=${z}`;
  // es-ES leaves 4-digit numbers ungrouped ("6936"); force the thousands dot.
  const fmtG = n => n.toLocaleString('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
  const haLabel = fmt(e.ha, 0);                    // 20.132.325
  const km2Label = fmt(e.km2, 0);                  // 201.323
  const pitchesLabel = fmt(Math.round(e.ha / 0.714), 0); // 28.196.534
  const burnedTimes = Math.round(e.ha / 916817);   // 22
  const intro = `      <p>
        El <b>12 de agosto de 2026</b>, a las ocho y media de la tarde, la sombra de la Luna entró en
        España por la costa de Asturias y salió al Mediterráneo tres minutos y medio después. Era el
        primer eclipse solar total sobre la Península en <b>114 años</b>
        (<a href="${CIENCIA_URL}" target="_blank" rel="noopener">el anterior fue en 1912</a>), y
        durante unos noventa segundos una franja entera del país se quedó a oscuras con el Sol todavía
        en el cielo.
      </p>
      <p>
        Ya se ha contado el asombro. Aquí vamos a contar <b>las medidas</b>: cuánta superficie de
        España cabía dentro de esa sombra, a qué velocidad iba y por qué un disco de 1,4 millones de
        kilómetros tapa exactamente a otro de 3.475. Porque un eclipse, además de bonito, es un
        problema de escalas —y eso es lo que sabemos dibujar.
      </p>
      <p>
        Empecemos por el titular: la franja de totalidad cubrió
        <b><a href="${mapUrl}">${haLabel} hectáreas</a></b> de territorio español. El círculo del mapa
        de arriba tiene exactamente esa superficie.
      </p>

      <h2>La franja a oscuras: ${haLabel} hectáreas</h2>
      <p>
        La <b>franja de totalidad</b> —la única zona donde el Sol se tapa del todo— fue una cinta de
        unos <b>${e.widthKm} kilómetros de ancho</b> que cruzó la Península en diagonal, de Luarca a
        Peñíscola, y siguió hasta Baleares. Fuera de ella, el resto del país vio un eclipse parcial,
        que no es lo mismo ni de lejos: basta que asome un 1 % del Sol para que no anochezca.
      </p>
      <p>
        ¿Cuánta España quedó dentro? Para responderlo hemos cruzado los <b>límites norte y sur de la
        franja publicados por la NASA</b>
        (<a href="${NASA_URL}" target="_blank" rel="noopener">tablas de F. Espenak</a>) con la
        geometría real de las 52 provincias españolas, sobre una malla de 1,5 km y en una proyección
        de áreas iguales. El resultado:
      </p>
      <table class="equiv-table">
        <thead><tr><th>La franja de totalidad sobre España</th><th>Cuánto es</th></tr></thead>
        <tbody>
          <tr><td>Superficie de territorio español dentro de la franja</td><td><b><a href="${mapUrl}">${haLabel} ha</a></b> (${km2Label} km²)</td></tr>
          <tr><td>Porcentaje de España</td><td><b>${String(e.pctSpain).replace('.', ',')} %</b> del país</td></tr>
          <tr><td>Provincias tocadas</td><td>${e.provinces}, de ellas ${e.wholeProvinces.length} enteras</td></tr>
          <tr><td>En campos de fútbol</td><td>unos <a href="/hectarea-campo-de-futbol/">${pitchesLabel}</a></td></tr>
          <tr><td>Comparada con Castilla y León</td><td>2,1 veces</td></tr>
          <tr><td>Comparada con lo quemado en incendios entre 2020 y 2025</td><td><a href="/hectareas-quemadas-incendios-espana/">${burnedTimes} veces</a></td></tr>
        </tbody>
      </table>
      <p>
        Veinte millones de hectáreas es una cifra que no significa nada hasta que se dibuja. Por eso el
        mapa de arriba pinta un círculo de esa misma superficie: <b>253 kilómetros de radio</b>, más de
        medio millar de kilómetros de punta a punta. Es
        <a href="/200000-hectareas/">cien veces</a> la mayor de nuestras páginas de cantidad. Arrástralo
        sobre tu comunidad y verás lo que significa que casi <b>cuatro de cada diez hectáreas del país</b>
        se quedaran sin Sol a la vez.
      </p>
      <p>
        Once provincias cupieron <b>enteras</b> dentro de la franja: ${e.wholeProvinces.slice(0, -1).join(', ')} y
        ${e.wholeProvinces[e.wholeProvinces.length - 1]}. Zaragoza se quedó al 95 %, Guadalajara al 99 %,
        Valladolid al 98 %. Y luego están las que se partieron por la mitad: Cuenca y Valencia entraron
        justas al 49 %, Navarra al 53 %.
      </p>

      <h2>Los que se quedaron a las puertas</h2>
      <p>
        Lo más cruel de un eclipse es su borde. La diferencia entre ver la corona solar y ver un Sol
        mordido no es gradual: es una línea en el suelo. Y esa línea pasó
        <b><a href="${dist('11', '40.4168', '-3.7038', 10)}">a 11 kilómetros</a></b> del centro de
        <b>Madrid</b>, por el norte de la ciudad. Once kilómetros: menos de lo que mucha gente hace para
        ir a trabajar.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Ciudad</th><th>Se quedó a…</th><th>Del borde</th></tr></thead>
        <tbody>
          <tr><td>Madrid</td><td><a href="${dist('11', '40.4168', '-3.7038', 10)}">11 km</a></td><td>sur</td></tr>
          <tr><td>Pamplona</td><td><a href="${dist('11', '42.8125', '-1.6458', 10)}">11 km</a></td><td>norte</td></tr>
          <tr><td>Barcelona</td><td><a href="${dist('31', '41.3874', '2.1686', 9)}">31 km</a></td><td>norte</td></tr>
          <tr><td>San Sebastián</td><td>42 km</td><td>norte</td></tr>
          <tr><td>Salamanca</td><td>45 km</td><td>sur</td></tr>
          <tr><td>Toledo</td><td>78 km</td><td>sur</td></tr>
        </tbody>
      </table>
      <p>
        Dentro, en cambio, entraron Oviedo, Santander, Bilbao, Vitoria, Logroño, León, Palencia,
        Burgos, Valladolid, Soria, Segovia, Guadalajara, Zaragoza, Teruel, Cuenca, Lleida, Tarragona,
        Castellón, Valencia, Palma, Ibiza y Maó. Un eclipse se mide en kilómetros, y por eso conviene
        <a href="/medir-distancias/">medirlos bien</a>.
      </p>

      <h2>La regla del 400: por qué el Sol y la Luna miden lo mismo</h2>
      <p>
        Que exista algo llamado «eclipse total» es una casualidad cósmica que roza lo absurdo. El Sol
        tiene <b>1.392.700 km</b> de diámetro y la Luna <b>3.475 km</b>: el Sol es <b>400 veces más
        grande</b>. Pero el Sol está a 149,6 millones de kilómetros y la Luna a 384.400: el Sol está
        <b>389 veces más lejos</b>. Dos cuatrocientos que se cancelan. Por eso los dos discos se ven
        casi idénticos desde aquí, y por eso la Luna puede tapar el Sol dejando asomar solo la corona.
      </p>
      <p>
        Como los dos números no son exactamente iguales —y además la Luna se acerca y se aleja entre
        356.500 y 406.700 km—, unas veces el disco lunar sobra y otras se queda corto. Cuando se queda
        corto, el eclipse es <b>anular</b> y deja un anillo de Sol. El 12 de agosto la Luna venía cerca
        de su perigeo y sobró un 4 %: por eso hubo totalidad.
      </p>
      <p>Puesto a escala humana, con la Luna reducida a un <b>balón de baloncesto</b> de 24 cm:</p>
      <table class="equiv-table">
        <thead><tr><th>Escala 1:14.478.333</th><th>Tamaño</th><th>A qué distancia</th></tr></thead>
        <tbody>
          <tr><td>La Luna</td><td>un balón de baloncesto (24 cm)</td><td>26,6 m: al fondo de la calle</td></tr>
          <tr><td>La Tierra</td><td>una pelota de 88 cm</td><td>—</td></tr>
          <tr><td>El Sol</td><td>una esfera de <b>96 metros</b> (un edificio de 30 plantas)</td><td><b><a href="${dist('10.3', '40.4168', '-3.7038', 11)}">10,3 km</a></b>: al otro lado de la ciudad</td></tr>
        </tbody>
      </table>
      <p>
        Ahí está el truco entero: un balón a la distancia de un portal tapando un edificio de treinta
        plantas que está a diez kilómetros. Pincha en los 10,3 km para verlos dibujados sobre tu ciudad
        y hacerte a la idea de dónde habría que poner ese Sol de juguete.
      </p>

      <h2>La carrera de la sombra: hasta 17.500 km/h</h2>
      <p>
        Aquí está el dato que más nos ha sorprendido al calcularlo. En todas partes se lee que la
        sombra de un eclipse viaja a <b>2.000 o 3.000 km/h</b>. Es verdad… para un eclipse con el Sol
        alto. En España no se pareció ni remotamente.
      </p>
      <p>
        Porque el eclipse del 12 de agosto fue <b>un eclipse de atardecer</b>: el Sol estaba a solo
        <b>12° sobre el horizonte</b> en Galicia y a <b>2°</b> en Menorca, ya casi poniéndose
        (<a href="${IGN_URL}" target="_blank" rel="noopener">circunstancias locales del IGN</a>). Y cuando
        el Sol está bajo, la sombra se proyecta de refilón sobre el suelo y se estira muchísimo, igual
        que tu propia sombra al atardecer. Una sombra estirada barre mucho más terreno en el mismo
        tiempo: la velocidad se multiplica por <b>1 ÷ seno de la altura del Sol</b>. Con el Sol a 8°,
        eso es multiplicar por siete.
      </p>
      <p>
        Tomando las posiciones de la línea central que publica la NASA cada dos minutos y midiendo las
        distancias entre ellas, esto es lo que iba haciendo la sombra sobre España:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Tramo (hora peninsular)</th><th>Recorrido</th><th>Velocidad</th></tr></thead>
        <tbody>
          <tr><td>20:26 → 20:28 · entrando por Asturias</td><td>231 km</td><td>${fmtG(e.speedIn)} km/h</td></tr>
          <tr><td>20:28 → 20:30 · Castilla y León y Aragón</td><td>301 km</td><td>${fmtG(e.speedMid)} km/h</td></tr>
          <tr><td>20:30 → 20:32 · saliendo al Mediterráneo</td><td>583 km</td><td>${fmt(e.speedOut, 0)} km/h</td></tr>
        </tbody>
      </table>
      <p>
        La sombra <b>aceleró</b> mientras cruzaba el país, porque el Sol seguía bajando. Salió por
        Baleares a <b>${fmt(e.speedOut, 0)} km/h</b>: catorce veces la velocidad del sonido, casi cinco
        kilómetros por segundo, el doble de rápido que el avión más veloz jamás construido.
      </p>
      <p>
        Del punto donde tocó tierra, en <b>Luarca</b>, al punto donde la dejó, en <b>Peñíscola</b>, hay
        <b><a href="${dist('680', '43.624', '-6.626', 6)}">${e.crossKm} kilómetros</a></b> en línea
        recta. La sombra los recorrió en <b>3 minutos y 33 segundos</b>, a una media de
        ${fmt(11512, 0)} km/h. Para poner eso en perspectiva, con la distancia que mejor conocemos:
      </p>
      <table class="equiv-table">
        <thead><tr><th><a href="${dist('505', '40.4168', '-3.7038', 6)}">Madrid–Barcelona (505 km)</a></th><th>Tarda</th></tr></thead>
        <tbody>
          <tr><td>Andando</td><td>más de 4 días sin parar</td></tr>
          <tr><td>En coche</td><td>unas 5 horas y media</td></tr>
          <tr><td>En AVE</td><td>2 h 30 min</td></tr>
          <tr><td>En avión</td><td>1 h 15 min</td></tr>
          <tr><td><b>La sombra de la Luna sobre Aragón</b></td><td><b>3 min 22 s</b></td></tr>
          <tr><td><b>La sombra ya sobre el Mediterráneo</b></td><td><b>1 min 44 s</b></td></tr>
        </tbody>
      </table>
      <p>
        Y aun así, la totalidad duró <b>menos de dos minutos</b> en cada sitio (1 min 50 s cerca de
        Luarca, el máximo en España). No es contradictorio: la franja medía ${e.widthKm} km de ancho,
        pero lo que te pasa por encima es la sombra entera a diez mil kilómetros por hora. Estás dentro
        el tiempo que tarda en pasarte.
      </p>
      <p>
        Por cierto: que el Sol estuviera tan bajo también explica que hubiera que buscar horizontes
        despejados hacia el oeste. Si quieres saber hasta dónde llega tu vista cuando el Sol se pone,
        lo contamos en <a href="/a-que-distancia-esta-el-horizonte/">a qué distancia está el
        horizonte</a>.
      </p>

      <h2>Mide tu propio eclipse</h2>
      <p>
        Todas las cifras de este artículo son enlaces vivos: puedes moverlos, cambiarlos y ponerlos
        sobre el sitio que quieras. Si te has quedado con ganas:
      </p>
      <ul>
        <li>Dibuja <a href="${mapUrl}">los ${haLabel} hectáreas</a> de la franja sobre tu comunidad
          con el <a href="/">Hectareómetro</a>.</li>
        <li>Mira <a href="${dist('11', '40.4168', '-3.7038', 10)}">los 11 km</a> que dejaron a Madrid
          fuera, y compáralos con lo que tú recorres cada día.</li>
        <li>Traza a mano la comarca que te interese y saca su superficie exacta con
          <a href="/medir-superficie/">medir una superficie</a>, o la distancia entre dos puntos con
          <a href="/medir-distancias/">medir distancias</a>.</li>
        <li>Convierte las hectáreas a km² en el
          <a href="/hectareas-a-metros-cuadrados/">conversor de superficies</a>.</li>
      </ul>
      <p>
        El próximo eclipse total en España es el <b>2 de agosto de 2027</b>, y el siguiente, el
        <b>26 de enero de 2028</b> (anular). Tres en tres años después de un siglo sin ninguno. Habrá
        tiempo de medirlos.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuánta superficie de España se quedó a oscuras durante el eclipse?</dt>
        <dd>Unos <a href="${mapUrl}">${haLabel} hectáreas</a> (${km2Label} km²) de territorio español
          quedaron dentro de la franja de totalidad, el ${String(e.pctSpain).replace('.', ',')} % del
          país: casi cuatro de cada diez hectáreas. Es 2,1 veces la superficie de Castilla y León y
          unos ${pitchesLabel} campos de fútbol.</dd>

        <dt>¿Qué provincias entraron enteras en la franja de totalidad?</dt>
        <dd>Once: ${e.wholeProvinces.join(', ')}. En total la franja tocó ${e.provinces} provincias;
          Zaragoza quedó dentro al 95 %, Guadalajara al 99 % y Valladolid al 98 %.</dd>

        <dt>¿Por qué en Madrid no se vio el eclipse total?</dt>
        <dd>Porque el borde sur de la franja pasó a unos 11 kilómetros del centro de la ciudad, por el
          norte. En Madrid capital el Sol se tapó casi del todo, pero «casi» no cuenta: basta que
          asome una uña de Sol para que no se vea la corona ni se haga de noche. El norte de la
          provincia sí entró: un 41 % de su superficie.</dd>

        <dt>¿A qué velocidad se movió la sombra de la Luna sobre España?</dt>
        <dd>Entre ${fmtG(e.speedIn)} km/h al entrar por Asturias y ${fmt(e.speedOut, 0)} km/h al salir
          al Mediterráneo, acelerando durante todo el recorrido. Cruzó la Península, de Luarca a
          Peñíscola (${e.crossKm} km), en 3 minutos y 33 segundos. Es mucho más que los 2.000-3.000
          km/h habituales porque el Sol estaba muy bajo, casi poniéndose, y una sombra rasante barre
          el suelo mucho más deprisa.</dd>

        <dt>¿Por qué el Sol y la Luna se ven del mismo tamaño?</dt>
        <dd>Por una casualidad: el Sol es unas 400 veces más grande que la Luna (1.392.700 km frente a
          3.475 km), pero está unas 389 veces más lejos (149,6 millones de kilómetros frente a
          384.400). Las dos proporciones casi se cancelan, así que los discos se ven casi iguales
          desde la Tierra.</dd>

        <dt>¿Cuánto duró la totalidad del eclipse en España?</dt>
        <dd>Menos de dos minutos en cualquier punto: el máximo fueron 1 minuto y 50 segundos cerca de
          Luarca (Asturias), y fue bajando hasta poco más de minuto y medio en Baleares. La franja
          medía unos ${e.widthKm} km de ancho, pero la sombra la barría a más de 10.000 km/h.</dd>
      </dl>
      <p>
        ¿Quieres seguir midiendo cosas grandes? Mira
        <a href="/hectareas-quemadas-incendios-espana/">cuánta superficie arde en los incendios de
        España</a>, <a href="/cuanto-ocupan-centros-datos-aws-aragon/">cuánto ocupan los centros de
        datos de AWS en Aragón</a> o compara
        <a href="/hectarea-campo-de-futbol/">una hectárea con un campo de fútbol</a>. Y si lo tuyo son
        las distancias, tienes la <a href="/distancias/">herramienta de distancias</a>.
      </p>`;
  return {
    key: 'dimensiones-eclipse-2026', lang: 'es', ha: e.ha,
    family: 'hectareas', published: '2026-08-13', modified: '2026-08-13',
    slug: 'las-dimensiones-del-eclipse',
    path: '/las-dimensiones-del-eclipse/',
    presetExtra: ' var PRESET_ZOOM = 6; var PRESET_LAT = 41.6; var PRESET_LON = -3.2;',
    title: 'Las dimensiones del eclipse: 20 millones de hectáreas de España a oscuras | Hectareómetro',
    description: `La franja de totalidad del eclipse del 12 de agosto de 2026 cubrió ${haLabel} hectáreas de España, el ${String(e.pctSpain).replace('.', ',')} % del país. La superficie, la regla del 400 y la sombra a 17.500 km/h, dibujadas a escala.`,
    h1: 'Las dimensiones del eclipse',
    intro,
    question: '¿Cuánta superficie de España cubrió la franja de totalidad del eclipse?',
    answer: `La franja de totalidad del eclipse del 12 de agosto de 2026 cubrió unos ${haLabel} hectáreas (${km2Label} km²) de territorio español, el ${String(e.pctSpain).replace('.', ',')} % del país, repartidas por ${e.provinces} provincias, once de ellas enteras.`,
    faqs: [
      { q: '¿Cuánta superficie de España se quedó a oscuras durante el eclipse?', a: `Unos ${haLabel} hectáreas (${km2Label} km²) de territorio español quedaron dentro de la franja de totalidad, el ${String(e.pctSpain).replace('.', ',')} % del país: casi cuatro de cada diez hectáreas. Es 2,1 veces la superficie de Castilla y León y unos ${pitchesLabel} campos de fútbol.` },
      { q: '¿Qué provincias entraron enteras en la franja de totalidad?', a: `Once: ${e.wholeProvinces.join(', ')}. En total la franja tocó ${e.provinces} provincias; Zaragoza quedó dentro al 95 %, Guadalajara al 99 % y Valladolid al 98 %.` },
      { q: '¿Por qué en Madrid no se vio el eclipse total?', a: 'Porque el borde sur de la franja pasó a unos 11 kilómetros del centro de la ciudad, por el norte. En Madrid capital el Sol se tapó casi del todo, pero «casi» no cuenta: basta que asome una uña de Sol para que no se vea la corona ni se haga de noche. El norte de la provincia sí entró: un 41 % de su superficie.' },
      { q: '¿A qué velocidad se movió la sombra de la Luna sobre España?', a: `Entre ${fmtG(e.speedIn)} km/h al entrar por Asturias y ${fmt(e.speedOut, 0)} km/h al salir al Mediterráneo, acelerando durante todo el recorrido. Cruzó la Península, de Luarca a Peñíscola (${e.crossKm} km), en 3 minutos y 33 segundos. Es mucho más que los 2.000-3.000 km/h habituales porque el Sol estaba muy bajo, casi poniéndose, y una sombra rasante barre el suelo mucho más deprisa.` },
      { q: '¿Por qué el Sol y la Luna se ven del mismo tamaño?', a: 'Por una casualidad: el Sol es unas 400 veces más grande que la Luna (1.392.700 km frente a 3.475 km), pero está unas 389 veces más lejos (149,6 millones de kilómetros frente a 384.400). Las dos proporciones casi se cancelan, así que los discos se ven casi iguales desde la Tierra.' },
      { q: '¿Cuánto duró la totalidad del eclipse en España?', a: `Menos de dos minutos en cualquier punto: el máximo fueron 1 minuto y 50 segundos cerca de Luarca (Asturias), y fue bajando hasta poco más de minuto y medio en Baleares. La franja medía unos ${e.widthKm} km de ancho, pero la sombra la barría a más de 10.000 km/h.` },
    ],
    linkLabel: 'Las dimensiones del eclipse',
  };
}

// ---- ¿Cuántas hectáreas ocupa una planta solar? ---------------------------
//
// Editorial data for the solar-plant article. Spanish-only (the frame is the
// debate about rustic land in Spain). Everything below is either quoted from a
// primary source or computed here from primary-source figures.
//
// PRIMARY SOURCES
// · MAPA, «AgrInfo nº 37. Extensión y evolución de los parques fotovoltaicos en
//   España» (junio de 2024). https://www.mapa.gob.es/dam/mapa/contenido/ministerio/servicios/servicios-de-informacion/analisis-y-prospectiva/ayp-serie-agrinfo/ayp_37_parquefotovoltaico.pdf
//   Cifras usadas: ~50.000 ha de parques fotovoltaicos en 2023 (la misma cifra
//   por dos vías, la encuesta ESYRCE y la inferida desde la potencia registrada
//   en el MITERD), el 0,2 % de la superficie agraria útil; crecimiento acumulado
//   2016-2023 del 166 %, por encima del 20 % anual desde 2020; Castilla-La
//   Mancha 11.460 ha y Extremadura 11.340 ha (el 48 % del total); de las 23.095
//   ha nuevas de paneles detectadas entre 2012 y 2022, el 82 % (18.905 ha) venía
//   de secano, el 11 % (2.449 ha) de regadío y el 7 % de forestal y no agrario,
//   desplazando sobre todo cereal, barbecho, girasol y olivar; los proyectos de
//   más de 50 MW evaluados favorablemente en enero de 2023 sumaban otras ~50.000
//   ha, con lo que el total rondaría las 100.000 ha si se ejecutan todos.
// · Red Eléctrica: 50.000,6 MW de solar fotovoltaica instalada a 1 de febrero de
//   2026, de los que 8.978,5 MW son autoconsumo (tejados, no ocupan suelo
//   agrario); más de 41.500 MW conectados a la red sin contar autoconsumo al
//   cierre de 2025, frente a 32.350 MW al cierre de 2024; 50.188 GWh generados
//   por la fotovoltaica en 2025, el 18,4 % de la generación nacional.
//   https://www.pv-magazine.es/2026/02/11/espana-supera-los-50-gw-de-potencia-fotovoltaica-instalada/
// · IDAE, «Consumos del Sector Residencial en España»: 3.487 kWh al año de
//   consumo eléctrico medio por hogar.
// · Haza del Sol (Alfanar Energía España): 275 ha y 150 MW en Fuentelencina y
//   Berninches, 13 municipios afectados (11 de Guadalajara y 2 de Madrid), línea
//   de 220 kV y subestación en Berninches; calificación urbanística publicada en
//   el DOCM el 29 de junio de 2026. https://www.elespanol.com/eldigitalcastillalamancha/region/guadalajara/20260629/macroplanta-solar-hectareas-afecta-municipios-guadalajara-da-nuevo-paso-adelante/1003744303252_0.html
// · Antequera y Mollina (Jinko Power): cuatro plantas, 329 ha, 175 MWp, 135
//   millones de euros, 370.000 MWh al año y 60.000 hogares abastecidos según la
//   promotora. https://elsoldeantequera.com/antequera/una-empresa-china-invertira-135-millones-de-euros-en-una-planta-solar-de-329-hectareas-en-antequera/
// · Torres de la Alameda y Villalbilla (Madrid): 290 ha y más de 155.000 paneles.
//   https://www.hibridosyelectricos.com/energia/155000-paneles-solares-en-superficie-400-campos-futbol-macroproyecto-solar-comunidad-madrid-no-gusta-todos_82970_102.html
// · Llucmajor (Mallorca), 20 de julio de 2026: Calablava 4 (103,69 ha, 67.232
//   paneles) y Llucmajor Solar (39,4 ha, 70.602 paneles), 143 ha en total.
//   https://www.ultimahora.es/noticias/part-forana/2026/07/20/2673123/luz-verde-mas-200-campos-futbol-suelo-rustico-ocupados-placas-solares-llucmajor.html
//
// CALCULADO AQUÍ
// · Ratio ha/MW de los dos proyectos con las dos cifras publicadas: 275/150 =
//   1,8 y 329/175 = 1,9 ha por MW. Confirma la regla de ~2 ha/MW con la que el
//   MAPA infiere superficie desde la potencia registrada.
// · Superficie ocupada HOY por las plantas en suelo: 41.500 MW (sin
//   autoconsumo) × ~2 ha/MW ≈ 80.000 ha = 800 km². Segunda vía de control: las
//   50.000 ha del MAPA en 2023 escaladas por el crecimiento de potencia
//   (25.500 → 41.500 MW, ×1,63) dan 81.400 ha. Las dos rutas coinciden.
// · Círculo equivalente a 80.000 ha: radio de 15,96 km (√(800/π)).
// · Metros cuadrados de planta por hogar abastecido, por dos vías:
//   (a) horas equivalentes de 2025 = 50.188 GWh / potencia media del año
//       ((32.350 + 41.500)/2 = 36.925 MW) = 1.359 h → 1 MW abastece
//       1.359.000 kWh / 3.487 kWh = 390 hogares → 1,9 ha (19.000 m²) / 390 =
//       49 m² por hogar;
//   (b) cifras de la promotora de Antequera: 3.290.000 m² / 60.000 hogares =
//       55 m² por hogar. Horquilla: medio centenar de metros cuadrados.
// · Campos de fútbol de cada proyecto a 0,714 ha por campo (105 × 68 m, la
//   medida que usa todo el sitio): 275 ha → 385, 329 → 461, 290 → 406,
//   143 → 200, 103,69 → 145 y 39,4 → 55. Sirven para comprobar los titulares.
const SOLAR = {
  hazaHa: 275,
  hazaMw: 150,
  antequeraHa: 329,
  antequeraMw: 175,
  antequeraHomes: 60000,
  madridHa: 290,
  madridPanels: 155000,
  llucmajorHa: 143,
  calablavaHa: 103.69,
  llucmajorSolarHa: 39.4,
  haMapa2023: 50000,
  clmHa: 11460,
  extremaduraHa: 11340,
  growthPct: 166,
  newHa: 23095,
  secanoHa: 18905,
  regadioHa: 2449,
  haIfAllBuilt: 100000,
  mwGround2025: 41500,     // REE, sin autoconsumo, cierre de 2025
  mwGround2024: 32350,     // REE, sin autoconsumo, cierre de 2024
  mwSelfFeb2026: 8978.5,   // autoconsumo incluido en los 50.000,6 MW totales
  gwh2025: 50188,
  homeKwhYear: 3487,       // IDAE
  haEstimate: 80000,
};

function solarPlantArticle() {
  const s = SOLAR;
  const MAPA_URL = 'https://www.mapa.gob.es/es/prensa/ultimas-noticias/detalle_noticias/los-parques-fotovoltaicos-ocupan-en-espana-una-extension-equivalente-al-0-2---de-la-superficie-agraria-util/f907b139-85d2-411a-b580-62d6e2344545';
  const AGRINFO_URL = 'https://www.mapa.gob.es/dam/mapa/contenido/ministerio/servicios/servicios-de-informacion/analisis-y-prospectiva/ayp-serie-agrinfo/ayp_37_parquefotovoltaico.pdf';
  const ESPANOL_URL = 'https://www.elespanol.com/eldigitalcastillalamancha/region/guadalajara/20260629/macroplanta-solar-hectareas-afecta-municipios-guadalajara-da-nuevo-paso-adelante/1003744303252_0.html';
  const ANTEQUERA_URL = 'https://elsoldeantequera.com/antequera/una-empresa-china-invertira-135-millones-de-euros-en-una-planta-solar-de-329-hectareas-en-antequera/';
  const MADRID_URL = 'https://www.hibridosyelectricos.com/energia/155000-paneles-solares-en-superficie-400-campos-futbol-macroproyecto-solar-comunidad-madrid-no-gusta-todos_82970_102.html';
  const LLUCMAJOR_URL = 'https://www.ultimahora.es/noticias/part-forana/2026/07/20/2673123/luz-verde-mas-200-campos-futbol-suelo-rustico-ocupados-placas-solares-llucmajor.html';
  const REE_URL = 'https://www.pv-magazine.es/2026/02/11/espana-supera-los-50-gw-de-potencia-fotovoltaica-instalada/';

  // The 275 ha of Haza del Sol drawn between Fuentelencina and Berninches.
  const mapUrl = `/?ha=${s.hazaHa}&lat=40.5445&lon=-2.8415&z=14`;
  // Every solar park in Spain as a single circle over Madrid (radius ~16 km).
  const spainMapUrl = `/?ha=${s.haEstimate}&lat=${MADRID.lat}&lon=${MADRID.lon}&z=10`;
  // es-ES leaves 4-digit numbers ungrouped ("1120"); force the thousands dot.
  const fmtG = n => n.toLocaleString('es-ES', { useGrouping: 'always', maximumFractionDigits: 0 });
  const pitches = ha => fmtG(Math.round(ha / 0.714));
  const dec = (n, d = 1) => fmt(n, d);

  const hazaRatio = dec(s.hazaHa / s.hazaMw);                  // 1,8
  const antequeraRatio = dec(s.antequeraHa / s.antequeraMw);   // 1,9
  const avgMw = (s.mwGround2024 + s.mwGround2025) / 2;         // 36.925 MW
  const eqHours = Math.round((s.gwh2025 * 1000) / avgMw);      // 1.359 h
  const homesPerMw = Math.round((eqHours * 1000) / s.homeKwhYear); // 390
  const m2PerHomeCalc = Math.round((1.9 * 10000) / homesPerMw);    // 49 m²
  const m2PerHomePromo = Math.round((s.antequeraHa * 10000) / s.antequeraHomes); // 55 m²
  const circleKm = fmt(Math.round(Math.sqrt((s.haEstimate / 100) / Math.PI)), 0); // 16 km
  const burned2025 = BURNED_BY_YEAR.find(r => r.year === 2025).ha;
  const burnedShare = Math.round(burned2025 / s.haEstimate * 10) / 10; // 4,4 veces
  const awsTimes = Math.round(s.haEstimate / AWS_ARAGON.ha);   // 100 veces

  const intro = `      <p>
        Una planta solar fotovoltaica ocupa <b>alrededor de 2 hectáreas por cada megavatio</b> que instala.
        Con esa regla, un huerto solar modesto se queda en 10 o 20 hectáreas, y una macroplanta de las que
        salen en el telediario se va a las <b>200-350 hectáreas</b>. La de <b>Haza del Sol</b>, en tramitación
        entre Fuentelencina y Berninches (Guadalajara), ocupará
        <b><a href="${mapUrl}">${s.hazaHa} hectáreas</a></b> con ${s.hazaMw} MW de potencia. Pincha en el enlace
        para verlas dibujadas a escala sobre la Alcarria, y arrastra el mapa hasta tu pueblo.
      </p>
      <p>
        ${s.hazaHa} hectáreas son <b>2,75 km²</b> y unos <b>${pitches(s.hazaHa)} campos de fútbol</b>
        (cada campo, <a href="/hectarea-campo-de-futbol/">0,714 hectáreas</a>). No es una cifra excepcional:
        es más o menos lo que mide hoy cualquier proyecto grande, y por eso el debate sobre el suelo rústico
        se ha convertido en una discusión sobre hectáreas.
      </p>

      <h2>La regla: unas 2 hectáreas por megavatio</h2>
      <p>
        La superficie no la marcan solo los paneles: entre filas hay que dejar pasillos para que no se den
        sombra, y a eso se suman los caminos, las zanjas, los inversores y la subestación. De ahí que el
        <a href="${AGRINFO_URL}" target="_blank" rel="noopener">Ministerio de Agricultura</a> infiera la
        superficie ocupada a partir de la potencia registrada con una regla de este orden. Los dos proyectos
        de 2026 que publican a la vez hectáreas y megavatios la confirman:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Proyecto</th><th>Superficie</th><th>Potencia</th><th>ha por MW</th><th>Campos de fútbol</th></tr></thead>
        <tbody>
          <tr><td>Haza del Sol (Guadalajara)</td><td><a href="${mapUrl}">${s.hazaHa} ha</a></td><td>${s.hazaMw} MW</td><td>${hazaRatio}</td><td>${pitches(s.hazaHa)}</td></tr>
          <tr><td>Antequera y Mollina (Málaga)</td><td>${s.antequeraHa} ha</td><td>${s.antequeraMw} MWp</td><td>${antequeraRatio}</td><td>${pitches(s.antequeraHa)}</td></tr>
          <tr><td>Torres de la Alameda y Villalbilla (Madrid)</td><td>${s.madridHa} ha</td><td>—</td><td>—</td><td>${pitches(s.madridHa)}</td></tr>
          <tr><td>Calablava 4 y Llucmajor Solar (Mallorca)</td><td>${s.llucmajorHa} ha</td><td>—</td><td>—</td><td>${pitches(s.llucmajorHa)}</td></tr>
        </tbody>
      </table>
      <p>
        Fuentes: <a href="${ESPANOL_URL}" target="_blank" rel="noopener">El Español</a> (Haza del Sol,
        promovida por Alfanar y con 13 municipios afectados, once en Guadalajara y dos en Madrid),
        <a href="${ANTEQUERA_URL}" target="_blank" rel="noopener">El Sol de Antequera</a> (Jinko Power, cuatro
        plantas y 135 millones de euros), <a href="${MADRID_URL}" target="_blank" rel="noopener">Híbridos y
        Eléctricos</a> (más de ${fmt(s.madridPanels, 0)} paneles al este de Madrid) y
        <a href="${LLUCMAJOR_URL}" target="_blank" rel="noopener">Última Hora</a> (Llucmajor, autorizadas el 20
        de julio de 2026). La columna de campos de fútbol es cuenta nuestra.
      </p>

      <h2>Por qué se cuentan en campos de fútbol (y por qué esta vez el cálculo está bien)</h2>
      <p>
        Este sitio nació porque «se han quemado X campos de fútbol» casi siempre engaña: como
        <a href="/hectarea-campo-de-futbol/">un campo mide 0,714 hectáreas</a> y no una, el número de campos
        sale más grande que el de hectáreas y la superficie parece mayor de lo que es. Así que hemos hecho
        la cuenta con los titulares de las plantas solares de este verano, y la sorpresa es que <b>salen
        bien</b>:
      </p>
      <ul>
        <li>Llucmajor, «más de 200 campos de fútbol»: ${s.llucmajorHa} ha ÷ 0,714 = <b>${pitches(s.llucmajorHa)} campos</b>. ✔</li>
        <li>Calablava 4, «unos 145»: ${dec(s.calablavaHa, 2)} ha = <b>${pitches(s.calablavaHa)} campos</b>. ✔</li>
        <li>Llucmajor Solar, «alrededor de 55»: ${dec(s.llucmajorSolarHa)} ha = <b>${pitches(s.llucmajorSolarHa)} campos</b>. ✔</li>
        <li>Madrid, «400 campos»: ${s.madridHa} ha = <b>${pitches(s.madridHa)} campos</b>. ✔ (el «450» que también circula sí se pasa).</li>
      </ul>
      <p>
        Es decir: en fotovoltaica la prensa está dividiendo por 0,71 y no confundiendo el campo con la
        hectárea. La comparación sigue siendo poco útil —casi nadie sabe cuánto ocupan 385 campos de fútbol
        seguidos—, pero al menos la aritmética es honesta. Si prefieres verlo,
        <a href="${mapUrl}">dibuja las ${s.hazaHa} hectáreas sobre tu pueblo</a> o compáralas con
        <a href="/300-hectareas/">300 hectáreas</a>.
      </p>

      <h2>Cuánto suelo ocupan todas las plantas solares de España</h2>
      <p>
        En 2023, el Ministerio de Agricultura midió la fotovoltaica española por dos caminos independientes
        —la encuesta de superficies ESYRCE y la potencia inscrita en el registro del MITERD— y los dos dieron
        lo mismo: <b><a href="${MAPA_URL}" target="_blank" rel="noopener">cerca de ${fmt(s.haMapa2023, 0)}
        hectáreas</a></b> de parques fotovoltaicos, el <b>0,2 % de la superficie agraria útil</b> del país.
        Castilla-La Mancha (${fmt(s.clmHa, 0)} ha) y Extremadura (${fmt(s.extremaduraHa, 0)} ha) concentraban
        el 48 %. Desde 2016 esa superficie ha crecido un ${s.growthPct} %, con subidas de más del 20 % cada año.
      </p>
      <p>
        Desde entonces la potencia se ha disparado. Al cierre de 2025 España tenía más de
        <b>${fmt(s.mwGround2025, 0)} MW</b> fotovoltaicos conectados a la red sin contar el autoconsumo
        (los cerca de 9.000 MW que hay en tejados no ocupan campo), según
        <a href="${REE_URL}" target="_blank" rel="noopener">los datos de Red Eléctrica</a>. Aplicando la regla
        de 2 ha/MW salen <b><a href="${spainMapUrl}">unas ${fmt(s.haEstimate, 0)} hectáreas</a></b>, 800 km².
        Por la otra vía —escalar las ${fmt(s.haMapa2023, 0)} ha de 2023 con el crecimiento de potencia— salen
        81.400. Las dos rutas coinciden, así que la cifra es sólida como orden de magnitud.
      </p>
      <p>Y ${fmt(s.haEstimate, 0)} hectáreas, puestas en perspectiva, son esto:</p>
      <table class="equiv-table">
        <thead><tr><th>Toda la fotovoltaica en suelo de España…</th><th>Equivale a</th></tr></thead>
        <tbody>
          <tr><td>Superficie estimada</td><td><a href="${spainMapUrl}">≈ ${fmt(s.haEstimate, 0)} hectáreas</a> (800 km²)</td></tr>
          <tr><td>Dibujada como un círculo</td><td>${circleKm} km de radio</td></tr>
          <tr><td>Porcentaje de España</td><td>0,16 %</td></tr>
          <tr><td>Lo que ardió en España en 2025</td><td>${dec(burnedShare)} veces esta superficie</td></tr>
          <tr><td>Los centros de datos de AWS en Aragón</td><td>${awsTimes} veces menos</td></tr>
        </tbody>
      </table>
      <p>
        Dicho de otro modo: todos los huertos solares de España juntos caben en un círculo de
        ${circleKm} kilómetros de radio, ocupan menos de la cuarta parte de lo que
        <a href="/hectareas-quemadas-incendios-espana/">ardió en el verano de 2025</a>
        (${fmt(Math.round(burned2025), 0)} hectáreas) y unas ${awsTimes} veces lo que van a ocupar
        <a href="/cuanto-ocupan-centros-datos-aws-aragon/">los centros de datos de AWS en Aragón</a>.
        El propio ministerio avisa de que, si se construyen todos los proyectos de más de 50 MW que ya tenían
        evaluación favorable, la superficie rondaría las
        <a href="/100000-hectareas/">${fmt(s.haIfAllBuilt, 0)} hectáreas</a>.
      </p>

      <h2>¿De qué tierras salen esas hectáreas?</h2>
      <p>
        Es la parte que enciende el debate en los pueblos, y hay dato. Entre 2012 y 2022 el ministerio
        detectó <b>${fmt(s.newHa, 0)} hectáreas nuevas</b> de paneles, y las rastreó hasta el uso que tenía
        antes cada parcela: el <b>82 %</b> (${fmt(s.secanoHa, 0)} ha) era <b>secano</b>, el <b>11 %</b>
        (${fmtG(s.regadioHa)} ha) <b>regadío</b> y el 7 % restante, forestal y no agrario. Los cultivos
        desplazados fueron sobre todo cereal, barbecho, girasol y olivar. Traducido: la fotovoltaica se está
        comiendo, casi siempre, la tierra agrícola menos productiva —lo que no quita que sea la tierra de
        alguien, como recuerdan los agricultores de Fuentelencina con sus almendros y sus colmenas.
      </p>

      <h2>Medio centenar de metros cuadrados por hogar</h2>
      <p>
        La cifra que de verdad ayuda a decidir no es cuántas hectáreas ocupa una planta, sino cuánta
        superficie hace falta <b>por cada hogar al que da luz</b>. Sale por dos caminos y los dos llevan al
        mismo sitio:
      </p>
      <ul>
        <li>Con los datos de 2025: la fotovoltaica española generó ${fmt(s.gwh2025, 0)} GWh con una potencia
          media de ${fmt(Math.round(avgMw), 0)} MW, o sea <b>${fmtG(eqHours)} horas equivalentes</b>. Un
          megavatio da entonces para unos <b>${homesPerMw} hogares</b> (a ${fmtG(s.homeKwhYear)} kWh al año
          por vivienda, el consumo medio según el IDAE) y ocupa 1,9 hectáreas → <b>${m2PerHomeCalc} m² por
          hogar</b>.</li>
        <li>Con las cifras de la promotora de Antequera: ${s.antequeraHa} hectáreas para
          ${fmt(s.antequeraHomes, 0)} hogares → <b>${m2PerHomePromo} m² por hogar</b>.</li>
      </ul>
      <p>
        <b>Unos 50 metros cuadrados de campo por vivienda</b>: el tamaño de un estudio pequeño, o cuatro
        plazas de garaje. Es la manera más honesta de mirar la cifra, porque pone el suelo ocupado al lado
        de lo que se saca de él.
      </p>

      <h2>Dibuja la planta que te toca de cerca</h2>
      <p>
        Si tienes un proyecto en tramitación al lado de casa, la superficie viene en el anuncio del boletín
        oficial. Escribe ese número de hectáreas en el <a href="/">Hectareómetro</a> y arrastra el círculo
        hasta tu término municipal; o, si quieres el contorno exacto en vez de un círculo, usa
        <a href="/medir-superficie/">la herramienta de medir superficies</a> para dibujar el polígono sobre
        el mapa y compartir el enlace. Y si lo que te dan son metros cuadrados, el
        <a href="/hectareas-a-metros-cuadrados/">conversor de unidades de superficie</a> los pasa a hectáreas.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántas hectáreas ocupa una planta solar?</dt>
        <dd>Unas <b>2 hectáreas por megavatio</b> instalado. Un huerto solar pequeño ocupa 10-20 hectáreas y
          una macroplanta, entre 200 y 350: la de <a href="${mapUrl}">Haza del Sol</a> (Guadalajara) ocupará
          ${s.hazaHa} hectáreas con ${s.hazaMw} MW, y la de Antequera y Mollina, ${s.antequeraHa} con
          ${s.antequeraMw} MWp.</dd>

        <dt>¿Cuántos campos de fútbol son 275 hectáreas?</dt>
        <dd>Unos <b>${pitches(s.hazaHa)} campos de fútbol</b>, contando cada campo como
          <a href="/hectarea-campo-de-futbol/">0,714 hectáreas</a> (105 × 68 m). Ojo: un campo de fútbol
          <b>no</b> es una hectárea, es algo menos de tres cuartos.</dd>

        <dt>¿Cuánto suelo ocupan todas las plantas solares de España?</dt>
        <dd>El Ministerio de Agricultura midió <b>${fmt(s.haMapa2023, 0)} hectáreas</b> en 2023, el 0,2 % de
          la superficie agraria útil. Con los ${fmt(s.mwGround2025, 0)} MW en suelo del cierre de 2025 la
          estimación sube a <a href="${spainMapUrl}">unas ${fmt(s.haEstimate, 0)} hectáreas</a> (800 km², el
          0,16 % del país).</dd>

        <dt>¿Cuánta superficie hace falta por hogar abastecido?</dt>
        <dd>Alrededor de <b>50 metros cuadrados</b> de planta por vivienda: entre ${m2PerHomeCalc} m² con las
          horas equivalentes reales de 2025 y el consumo medio del IDAE, y ${m2PerHomePromo} m² con las cifras
          que da la promotora de la planta de Antequera.</dd>

        <dt>¿Qué tierras ocupan los parques fotovoltaicos?</dt>
        <dd>De las ${fmt(s.newHa, 0)} hectáreas nuevas de paneles detectadas entre 2012 y 2022, el 82 % venía
          de secano, el 11 % de regadío y el 7 % de terreno forestal y no agrario, desplazando sobre todo
          cereal, barbecho, girasol y olivar.</dd>
      </dl>
      <p>
        ¿Quieres ver otras superficies a escala? Prueba el <a href="/">Hectareómetro</a>, compara
        <a href="/hectarea-campo-de-futbol/">una hectárea con un campo de fútbol</a>, mira
        <a href="/cuanto-ocupan-centros-datos-aws-aragon/">cuánto ocupan los centros de datos de AWS en
        Aragón</a> o <a href="/hectareas-quemadas-incendios-espana/">cuánta superficie arde cada verano en
        España</a>.
      </p>`;

  return {
    key: 'solar-plant-hectares', lang: 'es', ha: s.hazaHa,
    family: 'hectareas', published: '2026-08-18', modified: '2026-08-18',
    slug: 'cuantas-hectareas-ocupa-una-planta-solar',
    path: '/cuantas-hectareas-ocupa-una-planta-solar/',
    presetExtra: ' var PRESET_ZOOM = 14; var PRESET_LAT = 40.5445; var PRESET_LON = -2.8415;',
    title: '¿Cuántas hectáreas (y campos de fútbol) ocupa una planta solar? | Hectareómetro',
    description: `Una planta solar ocupa unas 2 hectáreas por MW: las macroplantas de 2026 rondan las 275-329 hectáreas, unos ${pitches(s.hazaHa)} campos de fútbol. Míralo dibujado a escala, con cuánto suelo ocupa ya la fotovoltaica en España.`,
    h1: '¿Cuánta superficie ocupa una planta solar fotovoltaica?',
    intro,
    question: '¿Cuántas hectáreas ocupa una planta solar?',
    answer: `Una planta solar fotovoltaica ocupa unas 2 hectáreas por megavatio instalado: los huertos pequeños se quedan en 10-20 hectáreas y las macroplantas rondan las 200-350 (Haza del Sol, en Guadalajara, ${s.hazaHa} hectáreas con ${s.hazaMw} MW, unos ${pitches(s.hazaHa)} campos de fútbol).`,
    faqs: [
      { q: '¿Cuántas hectáreas ocupa una planta solar?', a: `Unas 2 hectáreas por megavatio instalado. Un huerto solar pequeño ocupa 10-20 hectáreas y una macroplanta, entre 200 y 350: la de Haza del Sol (Guadalajara) ocupará ${s.hazaHa} hectáreas con ${s.hazaMw} MW, y la de Antequera y Mollina, ${s.antequeraHa} con ${s.antequeraMw} MWp.` },
      { q: '¿Cuántos campos de fútbol son 275 hectáreas?', a: `Unos ${pitches(s.hazaHa)} campos de fútbol, contando cada campo como 0,714 hectáreas (105 × 68 m). Ojo: un campo de fútbol no es una hectárea, es algo menos de tres cuartos.` },
      { q: '¿Cuánto suelo ocupan todas las plantas solares de España?', a: `El Ministerio de Agricultura midió ${fmt(s.haMapa2023, 0)} hectáreas en 2023, el 0,2 % de la superficie agraria útil. Con los ${fmt(s.mwGround2025, 0)} MW en suelo del cierre de 2025 la estimación sube a unas ${fmt(s.haEstimate, 0)} hectáreas (800 km², el 0,16 % del país).` },
      { q: '¿Cuánta superficie hace falta por hogar abastecido?', a: `Alrededor de 50 metros cuadrados de planta por vivienda: entre ${m2PerHomeCalc} m² con las horas equivalentes reales de 2025 y el consumo medio del IDAE, y ${m2PerHomePromo} m² con las cifras que da la promotora de la planta de Antequera.` },
      { q: '¿Qué tierras ocupan los parques fotovoltaicos?', a: `De las ${fmt(s.newHa, 0)} hectáreas nuevas de paneles detectadas entre 2012 y 2022, el 82 % venía de secano, el 11 % de regadío y el 7 % de terreno forestal y no agrario, desplazando sobre todo cereal, barbecho, girasol y olivar.` },
    ],
    linkLabel: 'Cuántas hectáreas ocupa una planta solar',
  };
}

const ARTICLES = [burnedAreaArticle(), awsAragonArticle(), eclipseArticle(), solarPlantArticle()];

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
      faqs: [
        { q: h1, a: answer },
        {
          q: `¿Cuántos metros cúbicos ${verb} ${noun}?`,
          a: `${m3Text} metros cúbicos. Un metro cúbico son exactamente 1.000 litros, así que basta con dividir entre mil.`,
        },
        {
          q: `¿Cuántos galones ${verb} ${noun}?`,
          a: `Unos ${galText} galones estadounidenses. Un galón US equivale a 3,785 litros (el galón imperial británico, a 4,546).`,
        },
      ],
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
    faqs: [
      { q: h1, a: answer },
      {
        q: `How many cubic metres are ${noun}?`,
        a: `${m3Text} cubic metres. One cubic metre is exactly 1,000 litres, so you just divide by a thousand.`,
      },
      {
        q: `How many gallons are ${noun}?`,
        a: `About ${galText} US gallons. One US gallon is 3.785 litres (a British imperial gallon is 4.546).`,
      },
    ],
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

// ¿Cuántos litros tiene un camión cisterna? Spanish-only editorial
// (es + x-default). The embedded tool is preset to the site's canonical tanker,
// 30,000 L, which the pictogram draws as 200 bathtubs with the phrase «lo que
// beben 15.000 personas en un día» — the copy matches both.
// Data validated 2026-08-05 (web):
// · Capacities by type (Nieves Energía, sector blog): small 5,000-10,000 L,
//   medium 15,000-20,000 L, large 30,000-40,000 L (articulated tractor +
//   tank semi-trailer); the most common hydrocarbon tankers in Spain and
//   Europe hold 32,000-36,000 L, split into 4-8 compartments (ADR).
//   Drinking-water tanks on rigid trucks: ~6,000-24,000 L (frenoscamino.com).
// · Weight, not volume, is the real limit: water is 1 kg/L, so 30,000 L = 30 t.
//   Maximum authorised mass for an articulated set in Spain went from 40 to
//   44 t on 2025-10-23 (BOE, July 2025), with tankers phased in from January
//   2026 (aupatrans.com). Diesel is ~0.835 kg/L, so 36,000 L of diesel ≈ 30 t
//   — that is why fuel tankers carry more litres than water tankers.
// · Real 2026 drought case: Karrantza (Bizkaia, 2,715 inhabitants) receives
//   250 m³ = 250,000 L of water a day, Monday to Friday, trucked from the
//   Zalla reservoir of the Consorcio de Aguas Bilbao-Bizkaia (eldiario.es,
//   August 2026) → ~8 tankers of 30,000 L a day, ~92 L per inhabitant a day.
// Sources: https://nievesenergia.com/blog/transporte-combustible/capacidad-tanques-camiones-cisterna/ ·
// https://aupatrans.com/44-toneladas/ ·
// https://www.eldiario.es/euskadi/camiones-cisterna-paliar-sequia-karrantza-recibira-mes-250-000-litros-agua-dia-lunes-viernes_1_13424347.html
const TANKER_LITERS = 30000;

function tankerTruckArticle() {
  const INE_URL = 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736176834&menu=ultiDatos&idp=1254735976602';
  const CAPACITY_URL = 'https://nievesenergia.com/blog/transporte-combustible/capacidad-tanques-camiones-cisterna/';
  const MASS_URL = 'https://aupatrans.com/44-toneladas/';
  const KARRANTZA_URL = 'https://www.eldiario.es/euskadi/camiones-cisterna-paliar-sequia-karrantza-recibira-mes-250-000-litros-agua-dia-lunes-viernes_1_13424347.html';
  const intro = `      <p>
        Un <b>camión cisterna</b> lleva, según el tipo, entre <b>10.000 y 40.000 litros</b>. El
        valor que se usa como referencia cuando se habla de agua es de
        <b><a href="/litros/?l=30000">30.000 litros</a></b>, y esa es la cantidad que dibuja el
        mapa de arriba: <b>200 bañeras</b> llenas, o lo que <b>beben 15.000 personas en un día</b>.
        Cambia la referencia con el selector «Ver» para verlo en vasos, en botellas o en piscinas.
      </p>
      <p>
        Los camiones pequeños de reparto urbano se quedan en 5.000-10.000 litros; los grandes
        conjuntos articulados (tractora + cisterna de semirremolque) llegan a 30.000-40.000. En
        España, las cisternas de hidrocarburos más habituales rondan los <b>32.000-36.000
        litros</b>, repartidos en <b>entre 4 y 8 compartimentos</b> independientes para poder
        entregar distintos productos y evitar que la carga se mueva
        (<a href="${CAPACITY_URL}" target="_blank" rel="noopener">datos del sector</a>).
      </p>

      <h2>Capacidad de un camión cisterna, por tipos</h2>
      <table class="equiv-table">
        <thead><tr><th>Tipo de cisterna</th><th>Capacidad habitual</th></tr></thead>
        <tbody>
          <tr><td>Pequeña, reparto urbano o rural</td><td>5.000 – 10.000 litros</td></tr>
          <tr><td>Camión rígido (4x2, 6x4, 8x4)</td><td>10.000 – 24.000 litros</td></tr>
          <tr><td>Conjunto articulado (tractora + semirremolque)</td><td>30.000 – 40.000 litros</td></tr>
          <tr><td>Cisterna de hidrocarburos típica en España</td><td>32.000 – 36.000 litros</td></tr>
          <tr><td>Referencia de agua de esta web</td><td><a href="/litros/?l=30000">30.000 litros</a></td></tr>
        </tbody>
      </table>

      <h2>El límite no es el volumen: es el peso</h2>
      <p>
        ¿Por qué no se fabrican cisternas de agua de 60.000 litros, si el espacio daría? Porque el
        agua pesa: <b>un litro de agua es un kilo</b>, así que <b>30.000 litros son 30
        toneladas</b> —<a href="/kilos/?k=30000">míralas dibujadas</a>— solo de carga, sin contar
        el camión. Y la <b>masa máxima autorizada</b> de un conjunto articulado en España pasó de
        <b>40 a 44 toneladas</b> en octubre de 2025, con las cisternas incorporadas desde enero de
        2026 (<a href="${MASS_URL}" target="_blank" rel="noopener">reforma publicada en el BOE</a>).
        Descontada la tara del conjunto, unas 15 toneladas, la carga útil se queda en el entorno de
        las 25-29 toneladas: de ahí los 30.000 litros.
      </p>
      <p>
        Ese mismo cálculo explica una curiosidad: las cisternas de <b>combustible</b> llevan más
        litros que las de agua. El gasóleo pesa unos <b>0,835 kg por litro</b>, así que
        <b>36.000 litros de gasóleo son también unas 30 toneladas</b>. Mismo peso, un 20 % más de
        volumen.
      </p>

      <h2>¿A cuánta gente abastece un camión cisterna?</h2>
      <p>Pincha en cualquier cifra para verla dibujada arriba a escala:</p>
      <ul class="examples-list">
        <li><b><a href="/litros/?l=30000&v=persona">15.000 personas</a></b> tienen agua para beber
          un día entero (a 2 litros por persona).</li>
        <li>Un camión cubre el <b>consumo doméstico completo</b> —ducha, cisterna del váter,
          lavadora, cocina— de
          <b><a href="/litros/?l=30000&v=hogar">234 personas durante un día</a></b>, a los 128
          litros por habitante y día de media española
          (<a href="${INE_URL}" target="_blank" rel="noopener">INE</a>). Dicho de otra forma: el
          gasto de casa de una sola persona durante más de siete meses.</li>
        <li>Son <b><a href="/litros/?l=30000&v=banera">200 bañeras</a></b> llenas de 150 litros.</li>
      </ul>
      <p>
        No es un cálculo teórico: en los veranos de sequía hay pueblos que viven de los camiones.
        En <b>agosto de 2026</b>, la localidad vizcaína de <b>Karrantza</b> (2.715 habitantes)
        recibe <b>250.000 litros de agua al día</b> de lunes a viernes en camiones cisterna desde el
        depósito de Zalla (<a href="${KARRANTZA_URL}" target="_blank" rel="noopener">eldiario.es</a>).
        Eso son unos <b>8 camiones de 30.000 litros cada día</b>, es decir <b>92 litros por
        habitante y día</b>: por debajo de la media española de 128, porque el agua traída en camión
        se destina a lo imprescindible.
      </p>

      <h2>¿Cuántos camiones cisterna hacen falta para…?</h2>
      <p>
        Aquí es donde la unidad se vuelve útil: el camión cisterna es una buena regla mental para
        cantidades grandes de agua.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Para llenar…</th><th>Camiones de 30.000 litros</th></tr></thead>
        <tbody>
          <tr><td><a href="/cuantos-litros-piscina-olimpica/">Una piscina olímpica</a> (2,5 millones de litros)</td><td><a href="/litros/?l=2500000&v=cisterna">83 camiones</a></td></tr>
          <tr><td><a href="/100000-litros/">100.000 litros</a></td><td>algo más de 3 camiones</td></tr>
          <tr><td>Una piscina particular de 50.000 litros</td><td>menos de 2 camiones</td></tr>
          <tr><td><a href="/cuanto-es-un-hectometro-cubico/">Un hectómetro cúbico</a> (1.000 millones de litros)</td><td><a href="/litros/?l=1000000000&v=cisterna">33.333 camiones</a></td></tr>
        </tbody>
      </table>
      <p>
        Puesto en fila —un camión articulado mide unos 16,5 metros—, los 33.333 camiones que llenan
        un solo hectómetro cúbico formarían una caravana de
        <b><a href="/distancias/?d=550&u=km&lat=40.4168&lon=-3.7038&z=6">550 kilómetros</a></b>: más
        que la distancia en línea recta entre
        <a href="/distancias/?d=505&u=km&lat=40.4168&lon=-3.7038&z=6">Madrid y Barcelona</a>. Por eso
        el agua de los embalses se mide en hm³ y no en camiones.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos litros tiene un camión cisterna?</dt>
        <dd>Entre 10.000 y 40.000 litros según el tipo. La referencia habitual para el agua son
          <a href="/litros/?l=30000">30.000 litros</a>; las cisternas de combustible más comunes en
          España llevan entre 32.000 y 36.000 litros.</dd>

        <dt>¿Cuánto pesa un camión cisterna lleno de agua?</dt>
        <dd>Como un litro de agua pesa un kilo, 30.000 litros son <a href="/kilos/?k=30000">30
          toneladas</a> solo de carga. Sumada la tara del conjunto (unas 15 toneladas), se roza la
          masa máxima autorizada, que en España es de 44 toneladas para vehículos articulados.</dd>

        <dt>¿Por qué las cisternas de combustible llevan más litros que las de agua?</dt>
        <dd>Porque el gasóleo pesa menos: unos 0,835 kg por litro frente al kilo por litro del agua.
          Con el mismo límite de peso caben unos 36.000 litros de gasóleo donde solo entrarían
          30.000 de agua.</dd>

        <dt>¿Para cuánta gente da el agua de un camión cisterna?</dt>
        <dd>Un camión de 30.000 litros da agua de beber a unas 15.000 personas durante un día, o
          cubre el consumo doméstico completo (128 litros por persona y día, media del INE) de
          234 personas durante un día.</dd>

        <dt>¿Cuántos camiones cisterna llenan una piscina olímpica?</dt>
        <dd>Unos <a href="/litros/?l=2500000&v=cisterna">83 camiones</a> de 30.000 litros, porque
          una <a href="/cuantos-litros-piscina-olimpica/">piscina olímpica</a> contiene 2,5 millones
          de litros.</dd>
      </dl>
      <p>
        ¿Quieres visualizar otras cantidades de agua? Prueba la
        <a href="/litros/">herramienta de litros</a>, mira cuánto es
        <a href="/cuantos-litros-piscina-olimpica/">una piscina olímpica</a> o cuánto es
        <a href="/cuanto-es-un-hectometro-cubico/">un hectómetro cúbico</a>. Y si lo tuyo son las
        superficies o los pesos, tienes el <a href="/">Hectareómetro</a> y la
        <a href="/kilos/">herramienta de kilos</a>.
      </p>`;
  return {
    section: 'litros', lang: 'es', key: 'camion-cisterna', l: TANKER_LITERS,
    family: 'litros', published: '2026-08-02', modified: '2026-08-02',
    slug: 'cuantos-litros-tiene-un-camion-cisterna',
    path: '/cuantos-litros-tiene-un-camion-cisterna/',
    title: '¿Cuántos litros lleva un camión cisterna? | Hectareómetro',
    description: 'Un camión cisterna lleva entre 10.000 y 40.000 litros; la referencia del agua son 30.000 litros (30 toneladas). Capacidades por tipo, por qué manda el peso y a cuánta gente abastece.',
    h1: '¿Cuántos litros de agua caben en un camión cisterna?',
    intro,
    question: '¿Cuántos litros tiene un camión cisterna?',
    answer: 'Un camión cisterna lleva entre 10.000 y 40.000 litros según el tipo. La referencia habitual para el agua son 30.000 litros, que pesan 30 toneladas; las cisternas de hidrocarburos más comunes en España llevan entre 32.000 y 36.000 litros.',
    faqs: [
      { q: '¿Cuántos litros tiene un camión cisterna?', a: 'Entre 10.000 y 40.000 litros según el tipo. La referencia habitual para el agua son 30.000 litros; las cisternas de combustible más comunes en España llevan entre 32.000 y 36.000 litros.' },
      { q: '¿Cuánto pesa un camión cisterna lleno de agua?', a: 'Como un litro de agua pesa un kilo, 30.000 litros son 30 toneladas solo de carga. Sumada la tara del conjunto (unas 15 toneladas), se roza la masa máxima autorizada, que en España es de 44 toneladas para vehículos articulados.' },
      { q: '¿Por qué las cisternas de combustible llevan más litros que las de agua?', a: 'Porque el gasóleo pesa menos: unos 0,835 kg por litro frente al kilo por litro del agua. Con el mismo límite de peso caben unos 36.000 litros de gasóleo donde solo entrarían 30.000 de agua.' },
      { q: '¿Para cuánta gente da el agua de un camión cisterna?', a: 'Un camión de 30.000 litros da agua de beber a unas 15.000 personas durante un día, o cubre el consumo doméstico completo (128 litros por persona y día, media del INE) de 234 personas durante un día.' },
      { q: '¿Cuántos camiones cisterna llenan una piscina olímpica?', a: 'Unos 83 camiones de 30.000 litros, porque una piscina olímpica contiene 2,5 millones de litros.' },
    ],
    linkLabel: '¿Cuántos litros lleva un camión cisterna?',
  };
}

// ¿Cuántos litros tiene una bañera? Bilingual (bath vs shower is universal).
// The embedded tool is preset to the site's canonical bathtub, 150 L, which the
// pictogram draws as «≈ 75 personas bebiendo durante un día» — the copy matches.
// Data validated 2026-08-07 (web):
// · Manufacturer capacities, Roca technical sheets (roca.es, "Capacidad (l)"):
//   Contesa steel 150×70 → 153 L; Contesa steel 170×70 → 183 L (interior
//   1,525 × 575 × 395 mm); Vythos acrylic two-seater 170×75 → 208 L; Easy
//   acrylic 170×75 → 215 L.
// · The 170×70 interior bounding box is 1.525 × 0.575 × 0.395 = 346 L, so the
//   declared 183 L is only ~53 % of it: a tub is not a box (sloped backrest,
//   narrower bottom, water stops at the overflow). Computed here, not copied.
// · Displacement: human density ≈ 1 kg/L, so a 70 kg body pushes up ~70 L.
// · Shower flow rates span the whole range in the sources — 10-12 L/min
//   (Geberit), up to 20 L/min (Fundación Aquae), 6-9 L/min for a low-flow head
//   — hence the article gives a crossover TABLE plus a way to measure your own
//   instead of one bogus number. Bottle test: L/min = 90 / seconds to fill a
//   1.5 L bottle.
// · EN side: EPA WaterSense says a shower uses 10-25 gallons and "a bath takes
//   up to 70 gallons"; the federal showerhead cap is 2.5 gpm (Energy Policy Act
//   of 1992) and WaterSense-labelled heads ≤ 2.0 gpm, "nearly 40 gallons per
//   day" for the average family's showering — which is exactly one 150 L bath.
// · Heating: 1 kWh raises 860 L by 1 °C, so 150 L from 15 to 40 °C = 4.4 kWh.
// Sources: https://www.roca.es/productos/banera-acero-rectangular-235860..0 ·
// https://www.epa.gov/watersense/showerheads ·
// https://19january2017snapshot.epa.gov/www3/watersense/kids/showerpower.html ·
// https://www.geberit.es/productos-para-el-bano/inspiracion/consejos-y-trucos/ahorrar-agua-en-el-bano/ ·
// https://www.fundacionaquae.org/cuanta-agua-consume-la-ducha-minuto/
const BATHTUB_LITERS = 150;
// Roca catalogue capacities, in litres, for the by-size table.
const TUB_150x70 = 153;
const TUB_170x70 = 183;
const TUB_170x75_BIPLAZA = 208;
const TUB_170x75_ACRYLIC = 215;
// Interior of the 170×70 Contesa, in metres, for the bounding-box calculation.
const TUB_INTERIOR = { l: 1.525, w: 0.575, h: 0.395 };
// Body volume displaced by an average adult, in litres (≈ 1 kg/L).
const BODY_DISPLACEMENT_L = 70;
// Shower flow rates for the crossover table, in litres per minute.
const SHOWER_FLOWS = [6, 9, 12, 15, 20];
// A moderate bath: filled to about two thirds, not to the overflow.
const MODERATE_BATH_L = 100;

const BATHTUB_ALTERNATES = {
  es: '/cuantos-litros-tiene-una-banera/',
  en: '/en/how-many-litres-in-a-bathtub/',
};

function bathtubArticle(lang) {
  const es = lang === 'es';
  const grpLocale = es ? 'es-ES' : 'en-GB';
  const fmtG = n => n.toLocaleString(grpLocale, { useGrouping: 'always', maximumFractionDigits: 0 });
  const n1 = n => fmt(n, 1, lang);
  const ROCA_URL = 'https://www.roca.es/productos/banera-acero-rectangular-235860..0';
  const INE_URL = 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736176834&menu=ultiDatos&idp=1254735976602';
  const GEBERIT_URL = 'https://www.geberit.es/productos-para-el-bano/inspiracion/consejos-y-trucos/ahorrar-agua-en-el-bano/';
  const AQUAE_URL = 'https://www.fundacionaquae.org/cuanta-agua-consume-la-ducha-minuto/';
  const EPA_URL = 'https://www.epa.gov/watersense/showerheads';
  const EPA_KIDS_URL = 'https://19january2017snapshot.epa.gov/www3/watersense/kids/showerpower.html';

  const boxL = Math.round(TUB_INTERIOR.l * TUB_INTERIOR.w * TUB_INTERIOR.h * 1000); // 346
  const boxPct = Math.round((TUB_170x70 / boxL) * 100); // 53
  const drinkDays = BATHTUB_LITERS / litersData.DRINK_L_PER_DAY; // 75
  const householdDay = litersData.HOUSEHOLD_L_PER_PERSON_DAY; // 128
  const yearOfBaths = BATHTUB_LITERS * 365; // 54,750
  const yearOfHousehold = householdDay * 365; // 46,720
  const tanker = Math.round(30000 / BATHTUB_LITERS); // 200
  const perPool = Math.round(POOL_LITERS / BATHTUB_LITERS); // 16,667
  const perHm3 = Math.round(1e9 / BATHTUB_LITERS); // 6,666,667
  const gallons = BATHTUB_LITERS / litersData.GALLON_LITERS; // 39.6
  const waterCost = (BATHTUB_LITERS / 1000) * WATER_PRICE_EUR_M3; // 0.30 €
  // 1 kWh heats 860 L by 1 °C: kWh = litres × ΔT × 4.186 / 3600.
  const heatKwh = (BATHTUB_LITERS * 25 * 4.186) / 3600; // 4.36
  // Spanish crossover table only; the English one is told in gpm (see gpmRows).
  const flowNotes = { 6: ' (cabezal de bajo consumo)', 12: ' (cabezal normal)', 20: ' (cabezal antiguo)' };
  const flowRows = SHOWER_FLOWS.map(q =>
    `          <tr><td>${fmt(q, 0, lang)} litros/minuto${flowNotes[q] || ''}</td><td>${n1(BATHTUB_LITERS / q)} min</td><td>${n1(MODERATE_BATH_L / q)} min</td></tr>`
  ).join('\n');

  if (es) {
    const intro = `      <p>
        Una <b>bañera</b> estándar llena hasta el rebosadero contiene entre <b>150 y 220 litros</b>
        de agua: la clásica de 170 × 70 centímetros que hay en medio país declara
        <b>${TUB_170x70} litros</b> en la ficha del fabricante
        (<a href="${ROCA_URL}" target="_blank" rel="noopener">Roca</a>). Pero el agua que gastas al
        bañarte es menos, unos <b><a href="/litros/?l=150">150 litros</a></b>, porque nadie la llena
        hasta el borde y porque tu propio cuerpo desplaza unos ${BODY_DISPLACEMENT_L} litros. Esos
        150 litros son los que dibuja el pictograma de arriba: <b>${drinkDays} personas bebiendo
        durante un día</b>. Cambia la referencia con el selector «Ver» para verlos en vasos o en
        botellas.
      </p>

      <h2>¿Cuántos litros tiene una bañera, por tamaños?</h2>
      <p>
        Los fabricantes publican la capacidad en la ficha técnica de cada modelo, así que no hace
        falta estimarla. Estas son las de cuatro bañeras de catálogo de
        <a href="${ROCA_URL}" target="_blank" rel="noopener">Roca</a>:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Bañera</th><th>Capacidad</th></tr></thead>
        <tbody>
          <tr><td>Acero, 150 × 70 cm</td><td>${TUB_150x70} litros</td></tr>
          <tr><td>Acero, 170 × 70 cm (la más común)</td><td>${TUB_170x70} litros</td></tr>
          <tr><td>Acrílica biplaza, 170 × 75 cm</td><td>${TUB_170x75_BIPLAZA} litros</td></tr>
          <tr><td>Acrílica, 170 × 75 cm</td><td>${TUB_170x75_ACRYLIC} litros</td></tr>
          <tr><td>Referencia de esta web</td><td><a href="/litros/?l=150">150 litros</a></td></tr>
        </tbody>
      </table>

      <h2>Por qué caben menos litros de los que parece</h2>
      <p>
        Si mides una bañera por dentro y la tratas como una caja, la cuenta se dispara. La de
        170 × 70 tiene un hueco interior de <b>1,525 × 0,575 × 0,395 metros</b>, que serían
        <b>${boxL} litros</b>… pero el fabricante declara ${TUB_170x70}: apenas el <b>${boxPct} %</b>.
        Una bañera no es una caja. El respaldo va inclinado, el fondo es más estrecho que el borde,
        las esquinas están redondeadas y el agua deja de subir en el rebosadero, unos centímetros
        por debajo del filo. De ahí que casi todo el mundo sobreestime cuánta agua cabe.
      </p>

      <h2>El agua que gastas no es la capacidad de la bañera</h2>
      <p>
        Hay una segunda razón, y es de Arquímedes: <b>tú también ocupas sitio</b>. El cuerpo humano
        tiene prácticamente la densidad del agua (un kilo por litro), así que una persona de
        ${BODY_DISPLACEMENT_L} kilos desplaza unos <b>${BODY_DISPLACEMENT_L} litros</b>. Al meterte,
        el nivel sube el equivalente a esos ${BODY_DISPLACEMENT_L} litros que <i>no</i> has tenido
        que abrir del grifo. Por eso un baño normal —agua hasta la cintura, contigo dentro— gasta
        del orden de <b><a href="/litros/?l=100">100</a> a <a href="/litros/?l=150">150 litros</a></b>
        aunque la bañera admita ${TUB_170x75_ACRYLIC}.
      </p>
      <p>
        Y como un litro de agua pesa un kilo, esos 150 litros son también
        <b><a href="/kilos/?k=150">150 kilos</a></b> de agua apoyados en el suelo de tu baño,
        más tu peso.
      </p>

      <h2>¿Gasta más un baño o una ducha?</h2>
      <p>
        La respuesta honesta es: <b>depende del caudal de tu ducha y de lo que tardes</b>, y por eso
        las cifras que circulan no coinciden. Las fuentes van de los
        <a href="${GEBERIT_URL}" target="_blank" rel="noopener">10-12 litros por minuto</a> de un
        cabezal normal a los <a href="${AQUAE_URL}" target="_blank" rel="noopener">20 litros por
        minuto</a> de uno antiguo, y bajan a 6-9 con un cabezal de bajo consumo. Con esos números,
        estos son los <b>minutos de ducha que equivalen a un baño</b>:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Caudal de la ducha</th><th>= baño de 150 litros</th><th>= baño de 100 litros</th></tr></thead>
        <tbody>
${flowRows}
        </tbody>
      </table>
      <p>
        Traducido: con un cabezal de bajo consumo la ducha gana casi siempre, porque tendrías que
        estar <b>25 minutos</b> debajo para igualar un baño. Con una ducha vieja de 20 litros por
        minuto, en cambio, <b>a los siete minutos y medio ya has gastado la bañera entera</b>. La
        ducha no ahorra por ser ducha: ahorra por ser corta y por el cabezal.
      </p>

      <h2>Mide el caudal de tu ducha en diez segundos</h2>
      <p>
        No hace falta creerse ninguna media. Coge una <b>botella de litro y medio</b>, ponla bajo la
        ducha abierta del todo y cronometra lo que tarda en llenarse. El caudal sale de una división:
      </p>
      <p style="text-align:center"><b>litros por minuto = 90 ÷ segundos que tarda la botella</b></p>
      <p>
        Si tarda 6 segundos, tu ducha son 15 litros por minuto; si tarda 9, son 10. Con un cubo de
        10 litros la fórmula es <b>600 ÷ segundos</b>. Una vez sabes tu caudal, la tabla de arriba
        deja de ser una estimación y pasa a ser tu número.
      </p>

      <h2>Una bañera, en cosas que sí te imaginas</h2>
      <p>Pincha en cualquier cifra para verla dibujada arriba a escala:</p>
      <ul class="examples-list">
        <li>Es lo que <b><a href="/litros/?l=150">bebe una persona en ${drinkDays} días</a></b>, a
          dos litros al día.</li>
        <li>Es algo más que <b>todo el consumo doméstico de una persona en un día</b> en España:
          <a href="/litros/?l=128">${householdDay} litros</a> entre ducha, cisterna, lavadora y
          cocina (<a href="${INE_URL}" target="_blank" rel="noopener">INE</a>). Un solo baño gasta
          el agua de un día entero de casa.</li>
        <li>En un <a href="/cuantos-litros-tiene-un-camion-cisterna/">camión cisterna</a> caben
          <b><a href="/litros/?l=30000&v=banera">${tanker} bañeras</a></b>.</li>
        <li>En una <a href="/cuantos-litros-piscina-olimpica/">piscina olímpica</a>,
          <b><a href="/litros/?l=2500000&v=banera">${fmtG(perPool)} bañeras</a></b>; en un
          <a href="/cuanto-es-un-hectometro-cubico/">hectómetro cúbico</a>, ${fmtG(perHm3)}.</li>
        <li>En galones estadounidenses, unos <b>${n1(gallons)} galones</b>.</li>
      </ul>
      <p>
        El dato que mejor coloca la cifra es el anual. <b>Bañarte todos los días</b> son
        <b><a href="/litros/?l=54750">${fmtG(yearOfBaths)} litros al año</a></b>, más que
        los ${fmtG(yearOfHousehold)} litros que consume en casa un español medio en todo el año
        contando absolutamente todo. Dicho de otra forma: bañarse a diario gasta más agua que todo
        lo demás que haces en casa junto.
      </p>

      <h2>¿Cuánto cuesta llenar una bañera?</h2>
      <p>
        Poco, si hablamos del agua: a <b>${fmt(WATER_PRICE_EUR_M3, 2, lang)} €/m³</b> de media en
        España, los 150 litros de un baño cuestan <b>${fmt(waterCost, 2, lang)} €</b>. Treinta
        céntimos.
      </p>
      <p>
        Lo caro es <b>calentarla</b>. Subir 150 litros de los 15 °C que salen del grifo a los 40 °C
        de un baño necesita unos <b>${n1(heatKwh)} kWh</b> —un kilovatio-hora calienta 860 litros un
        grado—, y eso cuesta varias veces más que el agua, se caliente con gas o con electricidad. La
        cuenta, por si quieres hacerla con tu temperatura: <b>kWh = litros × grados a subir ÷ 860</b>.
        Ahí está el verdadero coste de un baño, y también su huella de carbono.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos litros tiene una bañera?</dt>
        <dd>Una bañera estándar de 170 × 70 cm declara <b>${TUB_170x70} litros</b> de capacidad, y
          los modelos más grandes llegan a ${TUB_170x75_ACRYLIC}. Un baño real gasta menos, del
          orden de <a href="/litros/?l=150">150 litros</a>, porque no se llena hasta el borde y el
          cuerpo desplaza unos ${BODY_DISPLACEMENT_L} litros.</dd>

        <dt>¿Gasta más agua un baño o una ducha?</dt>
        <dd>Depende del caudal. Con un cabezal de bajo consumo (6 litros por minuto) harían falta
          25 minutos de ducha para igualar un baño de 150 litros; con uno antiguo de 20 litros por
          minuto bastan 7 minutos y medio. La ducha ahorra si es corta y el cabezal es eficiente.</dd>

        <dt>¿Cuántos litros gasta una ducha de 5 minutos?</dt>
        <dd>Entre 30 y 100 litros según el cabezal: 30 con uno de bajo consumo de 6 litros por
          minuto, unos 60 con uno normal de 12 y hasta 100 con uno antiguo de 20. Puedes medir el
          tuyo cronometrando cuánto tarda en llenarse una botella de litro y medio: litros por
          minuto = 90 ÷ segundos.</dd>

        <dt>¿Cuánto pesa una bañera llena de agua?</dt>
        <dd>Un litro de agua pesa un kilo, así que 150 litros son <a href="/kilos/?k=150">150
          kilos</a> de agua, y una bañera llena hasta el rebosadero con ${TUB_170x70} litros pesa
          ${TUB_170x70} kilos más la propia bañera y la persona que se baña.</dd>

        <dt>¿Cuánto cuesta llenar una bañera?</dt>
        <dd>Unos ${fmt(waterCost, 2, lang)} € de agua a ${fmt(WATER_PRICE_EUR_M3, 2, lang)} €/m³, el
          precio medio en España. Calentarla es lo caro: pasar 150 litros de 15 a 40 °C necesita
          unos ${n1(heatKwh)} kWh de gas o electricidad.</dd>
      </dl>
      <p>
        ¿Quieres visualizar otras cantidades de agua? Prueba la
        <a href="/litros/">herramienta de litros</a>, mira cuánto lleva un
        <a href="/cuantos-litros-tiene-un-camion-cisterna/">camión cisterna</a>, cuánto es
        <a href="/cuantos-litros-piscina-olimpica/">una piscina olímpica</a> o cuánto es
        <a href="/cuanto-es-un-hectometro-cubico/">un hectómetro cúbico</a>. Y si lo tuyo son las
        superficies o los pesos, tienes el <a href="/">Hectareómetro</a> y la
        <a href="/kilos/">herramienta de kilos</a>.
      </p>`;
    return {
      section: 'litros', lang: 'es', key: 'banera', l: BATHTUB_LITERS,
      family: 'litros', published: '2026-08-07', modified: '2026-08-07',
      slug: 'cuantos-litros-tiene-una-banera',
      path: BATHTUB_ALTERNATES.es, alternates: BATHTUB_ALTERNATES,
      title: '¿Cuántos litros tiene una bañera? Baño vs ducha, con números | Hectareómetro',
      description: 'Una bañera de 170 × 70 cm declara 183 litros y un baño real gasta unos 150. Capacidades por tamaño, cuántos minutos de ducha equivalen a un baño y cómo medir el caudal de la tuya.',
      h1: '¿Cuántos litros de agua caben en una bañera?',
      intro,
      question: '¿Cuántos litros tiene una bañera?',
      answer: 'Una bañera estándar de 170 × 70 cm declara 183 litros de capacidad y los modelos grandes llegan a 215. Un baño real gasta menos, unos 150 litros, porque no se llena hasta el borde y el cuerpo desplaza unos 70 litros.',
      faqs: [
        { q: '¿Cuántos litros tiene una bañera?', a: `Una bañera estándar de 170 × 70 cm declara ${TUB_170x70} litros de capacidad, y los modelos más grandes llegan a ${TUB_170x75_ACRYLIC}. Un baño real gasta menos, del orden de 150 litros, porque no se llena hasta el borde y el cuerpo desplaza unos ${BODY_DISPLACEMENT_L} litros.` },
        { q: '¿Gasta más agua un baño o una ducha?', a: 'Depende del caudal. Con un cabezal de bajo consumo (6 litros por minuto) harían falta 25 minutos de ducha para igualar un baño de 150 litros; con uno antiguo de 20 litros por minuto bastan 7 minutos y medio. La ducha ahorra si es corta y el cabezal es eficiente.' },
        { q: '¿Cuántos litros gasta una ducha de 5 minutos?', a: 'Entre 30 y 100 litros según el cabezal: 30 con uno de bajo consumo de 6 litros por minuto, unos 60 con uno normal de 12 y hasta 100 con uno antiguo de 20. Puedes medir el tuyo cronometrando cuánto tarda en llenarse una botella de litro y medio: litros por minuto = 90 ÷ segundos.' },
        { q: '¿Cuánto pesa una bañera llena de agua?', a: `Un litro de agua pesa un kilo, así que 150 litros son 150 kilos de agua, y una bañera llena hasta el rebosadero con ${TUB_170x70} litros pesa ${TUB_170x70} kilos más la propia bañera y la persona que se baña.` },
        { q: '¿Cuánto cuesta llenar una bañera?', a: `Unos ${fmt(waterCost, 2, lang)} € de agua a ${fmt(WATER_PRICE_EUR_M3, 2, lang)} €/m³, el precio medio en España. Calentarla es lo caro: pasar 150 litros de 15 a 40 °C necesita unos ${n1(heatKwh)} kWh de gas o electricidad.` },
      ],
      linkLabel: '¿Cuántos litros tiene una bañera?',
    };
  }

  // English. Same skeleton, but the shower crossover is told in US terms:
  // 2.5 gpm is the federal cap, 2.0 gpm the WaterSense limit, and EPA's "nearly
  // 40 gallons a day" of family showering is exactly one 150 L / 40 gal bath.
  const gpmRows = [
    { gpm: 1.5, note: ' (efficient head)' },
    { gpm: 2.0, note: ' (WaterSense limit)' },
    { gpm: 2.5, note: ' (US federal maximum)' },
  ].map(r =>
    `          <tr><td>${fmt(r.gpm, 1, lang)} gpm${r.note} = ${fmt(r.gpm * litersData.GALLON_LITERS, 1, lang)} litres/min</td><td>${n1(gallons / r.gpm)} min</td><td>${n1((MODERATE_BATH_L / litersData.GALLON_LITERS) / r.gpm)} min</td></tr>`
  ).join('\n');

  const intro = `      <p>
        A standard <b>bathtub</b> filled to the overflow holds between <b>150 and 220 litres</b>
        (40 to 58 US gallons) of water: the common 170 × 70 cm tub is rated at
        <b>${TUB_170x70} litres</b> — ${n1(TUB_170x70 / litersData.GALLON_LITERS)} gallons — on the
        manufacturer's spec sheet (<a href="${ROCA_URL}" target="_blank" rel="noopener">Roca</a>).
        The water you actually use for a bath is less, around
        <b><a href="/en/liters/?l=150&u=l">150 litres</a></b> or ${n1(gallons)} gallons, because
        nobody fills a tub to the brim and because your own body displaces about
        ${BODY_DISPLACEMENT_L} litres. That is what the pictogram above draws:
        <b>${drinkDays} people drinking for a day</b>. Use the "Show" selector to see it in glasses
        or bottles instead.
      </p>

      <h2>How many litres is a bathtub, by size?</h2>
      <p>
        Manufacturers publish the capacity on every model's spec sheet, so there is no need to
        estimate it. These are four catalogue tubs from
        <a href="${ROCA_URL}" target="_blank" rel="noopener">Roca</a>:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Bathtub</th><th>Capacity</th></tr></thead>
        <tbody>
          <tr><td>Steel, 150 × 70 cm</td><td>${TUB_150x70} litres (${n1(TUB_150x70 / litersData.GALLON_LITERS)} gal)</td></tr>
          <tr><td>Steel, 170 × 70 cm (the common one)</td><td>${TUB_170x70} litres (${n1(TUB_170x70 / litersData.GALLON_LITERS)} gal)</td></tr>
          <tr><td>Acrylic two-seater, 170 × 75 cm</td><td>${TUB_170x75_BIPLAZA} litres (${n1(TUB_170x75_BIPLAZA / litersData.GALLON_LITERS)} gal)</td></tr>
          <tr><td>Acrylic, 170 × 75 cm</td><td>${TUB_170x75_ACRYLIC} litres (${n1(TUB_170x75_ACRYLIC / litersData.GALLON_LITERS)} gal)</td></tr>
          <tr><td>This site's reference</td><td><a href="/en/liters/?l=150&u=l">150 litres</a> (${n1(gallons)} gal)</td></tr>
        </tbody>
      </table>
      <p>
        Big soaking and freestanding tubs go further: the US Environmental Protection Agency puts a
        full bath at <a href="${EPA_KIDS_URL}" target="_blank" rel="noopener">up to 70 gallons</a>
        (265 litres) against 10 to 25 gallons for a shower.
      </p>

      <h2>Why a tub holds less than it looks</h2>
      <p>
        Measure a bathtub inside and treat it as a box and the number runs away from you. The
        170 × 70 tub has an interior of <b>1.525 × 0.575 × 0.395 metres</b>, which would be
        <b>${boxL} litres</b>… yet the maker rates it at ${TUB_170x70}: only <b>${boxPct} %</b> of
        that. A tub is not a box. The backrest slopes, the bottom is narrower than the rim, the
        corners are rounded, and the water stops rising at the overflow, a few centimetres below the
        edge. That is why almost everybody overestimates how much water fits.
      </p>

      <h2>The water you use is not the tub's capacity</h2>
      <p>
        There is a second reason, and it is Archimedes: <b>you take up room too</b>. The human body
        is almost exactly as dense as water (one kilo per litre), so a ${BODY_DISPLACEMENT_L} kg
        (155 lb) person displaces about <b>${BODY_DISPLACEMENT_L} litres</b>, roughly 18 gallons.
        Getting in raises the level by that much water you never had to run from the tap. So a
        normal bath — water at waist height, with you in it — uses on the order of
        <b><a href="/en/liters/?l=100&u=l">100</a> to
        <a href="/en/liters/?l=150&u=l">150 litres</a></b> even in a tub rated for
        ${TUB_170x75_ACRYLIC}.
      </p>
      <p>
        And since a litre of water weighs a kilo, those 150 litres are also
        <b><a href="/en/kilos/?k=150&u=kg">150 kilos</a></b> (330 lb) of water resting on your
        bathroom floor, plus your own weight.
      </p>

      <h2>Does a bath or a shower use more water?</h2>
      <p>
        The honest answer is: <b>it depends on your showerhead and how long you take</b>. In the US
        the federal cap has been <b>2.5 gallons per minute</b> since the Energy Policy Act of 1992,
        and <a href="${EPA_URL}" target="_blank" rel="noopener">WaterSense-labelled heads</a> use no
        more than 2.0 gpm. Here is how many <b>minutes of shower equal one bath</b>:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Shower flow</th><th>= 150 L / ${n1(gallons)} gal bath</th><th>= 100 L / ${n1(MODERATE_BATH_L / litersData.GALLON_LITERS)} gal bath</th></tr></thead>
        <tbody>
${gpmRows}
        </tbody>
      </table>
      <p>
        In other words, with a standard 2.5 gpm head you would have to stand under it for
        <b>${n1(gallons / 2.5)} minutes</b> to match a single bath — and with an efficient one, for
        ${n1(gallons / 1.5)}. That is why the shower almost always wins in the US, and why EPA can
        say the average family uses <a href="${EPA_URL}" target="_blank" rel="noopener">nearly 40
        gallons a day</a> showering: the whole family's showers add up to about one bath.
      </p>

      <h2>Measure your shower in ten seconds</h2>
      <p>
        You do not have to trust any average. Put a <b>one-gallon jug</b> under the shower running
        full and time how long it takes to fill:
      </p>
      <p style="text-align:center"><b>gallons per minute = 60 ÷ seconds to fill the jug</b></p>
      <p>
        If it fills in 24 seconds, your shower is 2.5 gpm; in 30 seconds, 2.0. With a 1.5-litre
        bottle the formula is <b>litres per minute = 90 ÷ seconds</b>. Once you know your flow, the
        table above stops being an estimate and becomes your number.
      </p>

      <h2>A bathtub, in things you can picture</h2>
      <p>Click any figure to see it drawn to scale above:</p>
      <ul class="examples-list">
        <li>It is what <b><a href="/en/liters/?l=150&u=l">one person drinks in ${drinkDays}
          days</a></b>, at two litres a day.</li>
        <li>It is slightly more than <b>one person's entire household water use for a day</b>:
          <a href="/en/liters/?l=128&u=l">${householdDay} litres</a> covering showers, toilet,
          laundry and cooking (<a href="${INE_URL}" target="_blank" rel="noopener">Spanish national
          statistics office</a>). A single bath spends a whole day of home water.</li>
        <li>A <a href="/en/liters/?l=30000&u=l&v=banera">tanker truck</a> holds <b>${tanker}
          bathtubs</b>.</li>
        <li>An <a href="/en/how-many-litres-in-an-olympic-swimming-pool/">Olympic swimming pool</a>
          holds <b><a href="/en/liters/?l=2500000&u=l&v=banera">${fmtG(perPool)} bathtubs</a></b>;
          a cubic hectometre, ${fmtG(perHm3)}.</li>
      </ul>
      <p>
        The figure that really lands is the yearly one. <b>Bathing every day</b> comes to
        <b><a href="/en/liters/?l=54750&u=l">${fmtG(yearOfBaths)} litres a year</a></b>
        (${fmtG(Math.round(yearOfBaths / litersData.GALLON_LITERS))} gallons), more than the
        ${fmtG(yearOfHousehold)} litres an average person uses at home in a whole year for
        everything else combined. Put another way: bathing daily uses more water than everything
        else you do at home put together.
      </p>

      <h2>What does a bath cost?</h2>
      <p>
        Not much, if you mean the water: at about €${fmt(WATER_PRICE_EUR_M3, 2, lang)} per cubic
        metre — Spain's average, the reference this site uses — the 150 litres of a bath cost
        €${fmt(waterCost, 2, lang)}. Thirty cents.
      </p>
      <p>
        The expensive part is <b>heating it</b>. Taking 150 litres from the 15 °C (59 °F) that comes
        out of the tap to a 40 °C (104 °F) bath needs about <b>${n1(heatKwh)} kWh</b> — one
        kilowatt-hour heats 860 litres by one degree — which costs several times the water itself,
        on gas or on electricity. The formula, if you want to run it at your own temperature:
        <b>kWh = litres × degrees of rise ÷ 860</b>. That is the real cost of a bath, and its
        carbon footprint too.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How many litres are in a bathtub?</dt>
        <dd>A standard 170 × 70 cm bathtub is rated at <b>${TUB_170x70} litres</b>
          (${n1(TUB_170x70 / litersData.GALLON_LITERS)} US gallons), and larger models reach
          ${TUB_170x75_ACRYLIC}. A real bath uses less, around
          <a href="/en/liters/?l=150&u=l">150 litres</a>, because nobody fills to the brim and your
          body displaces about ${BODY_DISPLACEMENT_L} litres.</dd>

        <dt>How many gallons are in a bathtub?</dt>
        <dd>About ${n1(TUB_170x70 / litersData.GALLON_LITERS)} US gallons for a standard tub filled
          to the overflow, and ${n1(gallons)} gallons for a typical bath. EPA puts a big full tub at
          up to 70 gallons.</dd>

        <dt>Does a bath or a shower use more water?</dt>
        <dd>It depends on the flow. With a standard 2.5 gpm showerhead you would need about
          ${n1(gallons / 2.5)} minutes to match a ${n1(gallons)}-gallon bath; with an efficient
          1.5 gpm head, ${n1(gallons / 1.5)} minutes. A shower saves water when it is short and the
          head is efficient, not just because it is a shower.</dd>

        <dt>How much water does a 5-minute shower use?</dt>
        <dd>Between 7.5 and 12.5 US gallons (28 to 47 litres) at 1.5 to 2.5 gallons per minute. You
          can measure your own by timing a one-gallon jug under the shower: gallons per minute =
          60 ÷ seconds.</dd>

        <dt>How much does a bathtub of water weigh?</dt>
        <dd>A litre of water weighs a kilo, so 150 litres are
          <a href="/en/kilos/?k=150&u=kg">150 kilos</a> (330 lb) of water, and a tub filled to the
          overflow with ${TUB_170x70} litres weighs ${TUB_170x70} kilos plus the tub itself and the
          person in it.</dd>
      </dl>
      <p>
        Want to visualize other amounts of water? Try the
        <a href="/en/liters/">liters tool</a>, or see how much
        <a href="/en/how-many-litres-in-an-olympic-swimming-pool/">an Olympic swimming pool</a>
        holds. And if you are after areas or weights, there is the
        <a href="/en/">Hectareometer</a> and the <a href="/en/kilos/">kilos tool</a>.
      </p>`;
  return {
    section: 'litros', lang: 'en', key: 'banera', l: BATHTUB_LITERS,
    family: 'litros', published: '2026-08-07', modified: '2026-08-07',
    slug: 'how-many-litres-in-a-bathtub',
    path: BATHTUB_ALTERNATES.en, alternates: BATHTUB_ALTERNATES,
    title: 'How many litres (and gallons) are in a bathtub? Bath vs shower | Hectareometer',
    description: 'A standard 170 × 70 cm bathtub is rated at 183 litres (48 gallons) and a real bath uses about 150. Capacities by size, how many minutes of shower equal a bath, and how to measure your own.',
    h1: 'How many litres of water are in a bathtub?',
    intro,
    question: 'How many litres are in a bathtub?',
    answer: 'A standard 170 × 70 cm bathtub is rated at 183 litres (48 US gallons) of capacity and larger models reach 215. A real bath uses less, about 150 litres or 40 gallons, because nobody fills a tub to the brim and the body displaces around 70 litres.',
    faqs: [
      { q: 'How many litres are in a bathtub?', a: `A standard 170 × 70 cm bathtub is rated at ${TUB_170x70} litres (${n1(TUB_170x70 / litersData.GALLON_LITERS)} US gallons), and larger models reach ${TUB_170x75_ACRYLIC}. A real bath uses less, around 150 litres, because nobody fills to the brim and your body displaces about ${BODY_DISPLACEMENT_L} litres.` },
      { q: 'How many gallons are in a bathtub?', a: `About ${n1(TUB_170x70 / litersData.GALLON_LITERS)} US gallons for a standard tub filled to the overflow, and ${n1(gallons)} gallons for a typical bath. EPA puts a big full tub at up to 70 gallons.` },
      { q: 'Does a bath or a shower use more water?', a: `It depends on the flow. With a standard 2.5 gpm showerhead you would need about ${n1(gallons / 2.5)} minutes to match a ${n1(gallons)}-gallon bath; with an efficient 1.5 gpm head, ${n1(gallons / 1.5)} minutes. A shower saves water when it is short and the head is efficient, not just because it is a shower.` },
      { q: 'How much water does a 5-minute shower use?', a: 'Between 7.5 and 12.5 US gallons (28 to 47 litres) at 1.5 to 2.5 gallons per minute. You can measure your own by timing a one-gallon jug under the shower: gallons per minute = 60 ÷ seconds.' },
      { q: 'How much does a bathtub of water weigh?', a: `A litre of water weighs a kilo, so 150 litres are 150 kilos (330 lb) of water, and a tub filled to the overflow with ${TUB_170x70} litres weighs ${TUB_170x70} kilos plus the tub itself and the person in it.` },
    ],
    linkLabel: 'How many litres are in a bathtub?',
  };
}

// ¿Cuántos litros de agua consume una persona al día? Editorial es-only
// (es + x-default): el esqueleto son los datos del INE y el reparto por
// comunidades, así que es una pieza centrada en España (norma de mirrors).
//
// Datos validados 2026-08-14 (web):
// · Consumo doméstico España: 128 litros por habitante y día, dato de 2024 de
//   la Estadística sobre el Suministro y Saneamiento del Agua del INE,
//   publicada el 2 de julio de 2026 (igual que en 2022). Coste unitario total
//   2,02 €/m³ = 1,09 de suministro + 0,93 de saneamiento (+5,2 %). Extremos por
//   comunidad: Cantabria 186 L/hab/día, País Vasco 79. Pérdidas reales de la
//   red (fugas y averías): 14,6 % del agua suministrada = 624 hm³.
//   https://ine.es/dyngs/Prensa/ESSA2024.htm
// · Ingesta de agua: la Autoridad Europea de Seguridad Alimentaria (EFSA, 2010)
//   fija ingestas adecuadas de 2,0 L/día en mujeres y 2,5 L/día en hombres,
//   pero son de AGUA TOTAL — incluye la de los alimentos y todas las bebidas—
//   y para temperatura y actividad moderadas. El "2 litros de agua al día" es
//   una simplificación: parte ya viene en la comida.
//   https://www.efsa.europa.eu/en/efsajournal/pub/1459
// · Huella hídrica: 1.385 m³ por persona y año de media mundial (unos 3.800
//   litros al día), Mekonnen y Hoekstra / Water Footprint Network. Productos:
//   ternera 15.415 L/kg, taza de café ~132 L, camiseta de algodón 2.700 L.
//   https://www.waterfootprint.org/resources/multimediahub/Hoekstra-Mekonnen-2012-WaterFootprint-of-Humanity.pdf
//
// Cuentas hechas aquí: 128 × 365 = 46.720 L/año = 46,72 m³ → 94 € al año a
// 2,02 €/m³; 46.720 ÷ 2 = 64 años bebiendo; 624 hm³ ÷ (128 × 365) = 13,4
// millones de personas durante un año, el 27 % de todo el consumo doméstico
// español (48,6 M hab × 128 L × 365 = 2.271 hm³); una taza de café al día son
// 48.180 L al año, MÁS que los 46.720 que salen de los grifos de casa.
const DAILY_WATER = {
  drink: 2,
  household: 128,
  footprint: 3800,
  leaksHm3: 624,
  leaksPct: 14.6,
  maxRegion: { name: 'Cantabria', l: 186 },
  minRegion: { name: 'País Vasco', l: 79 },
  pricePerM3: 2.02,
};

function dailyWaterArticle() {
  const w = DAILY_WATER;
  const INE_URL = 'https://ine.es/dyngs/Prensa/ESSA2024.htm';
  const EFSA_URL = 'https://www.efsa.europa.eu/en/efsajournal/pub/1459';
  const WFN_URL = 'https://www.waterfootprint.org/resources/multimediahub/Hoekstra-Mekonnen-2012-WaterFootprint-of-Humanity.pdf';
  const year = w.household * 365;              // 46.720 L
  const yearLabel = fmt(year, 0);
  const costYear = fmt((year / 1000) * w.pricePerM3, 0);   // 94 €
  const drinkYears = Math.round(year / w.drink / 365);      // 64 años
  const leaksPeople = ((w.leaksHm3 * 1e9) / year / 1e6).toFixed(1).replace('.', ',');
  const coffeeYear = fmt(132 * 365, 0);        // 48.180 L
  const intro = `      <p>
        <b>Depende de a qué llames «consumir»</b>, y ahí está todo el lío. Hay tres números
        distintos rondando por ahí, se confunden constantemente y no se parecen en nada: bebemos
        unos <b><a href="/litros/?l=2">2 litros al día</a></b>, gastamos en casa
        <b><a href="/litros/?l=128">128</a></b> y, contando el agua que hizo falta para producir lo
        que comemos y vestimos, arrastramos unos <b><a href="/litros/?l=3800">3.800</a></b>. El
        primero y el último se llevan un factor de <b>1.900</b>.
      </p>
      <p>
        El dibujo de arriba son esos 128 litros, el consumo doméstico medio en España: la
        herramienta los pinta como <b>64 personas bebiendo durante un día</b>. Eso es exactamente lo
        que significa la cifra — lo que tú gastas en casa en una jornada da de beber a 64 personas.
      </p>

      <h2>Los tres números que nunca son el mismo</h2>
      <table class="equiv-table">
        <thead><tr><th>Qué mide</th><th>Al día</th><th>Al año</th><th>De dónde sale</th></tr></thead>
        <tbody>
          <tr><td>Lo que <b>bebes</b></td><td><a href="/litros/?l=2">2 L</a></td><td>730 L</td><td>EFSA (ingesta adecuada)</td></tr>
          <tr><td>Lo que <b>gastas en casa</b></td><td><a href="/litros/?l=128">128 L</a></td><td><a href="/litros/?l=46720">${yearLabel} L</a></td><td>INE 2024</td></tr>
          <tr><td>Tu <b>huella hídrica</b></td><td><a href="/litros/?l=3800">3.800 L</a></td><td>1.385 m³</td><td>Water Footprint Network</td></tr>
        </tbody>
      </table>
      <p>
        Fíjate en la segunda fila: <b>lo que sale de tus grifos en un año es lo que una persona bebe
        en ${drinkYears} años</b>. La herramienta lo redondea a «toda una vida» porque su escalón más
        alto son 80 años, pero la cuenta exacta es esa: ${yearLabel} litros ÷ 2 al día.
      </p>

      <h2>2 litros al día: el número que casi todo el mundo cita mal</h2>
      <p>
        La <a href="${EFSA_URL}" target="_blank" rel="noopener">Autoridad Europea de Seguridad
        Alimentaria</a> fija la ingesta adecuada en <b>2,0 litros al día para las mujeres y 2,5 para
        los hombres</b>. Pero hay una letra pequeña que se cae siempre al citarlo: esas cifras son de
        <b>agua total</b>, e incluyen la que viene en los alimentos y en todas las bebidas —café,
        leche, sopa, fruta—, no solo la del vaso. Y valen para temperatura y actividad moderadas: con
        calor o ejercicio, suben.
      </p>
      <p>
        Así que lo de «hay que beber ocho vasos de agua al día» no es exactamente lo que dice la
        recomendación. Una parte se la come, literalmente. Aun así, 2 litros de agua bebida al día es
        la referencia que usa el Hectareómetro para sus equivalencias, y en un año son
        <a href="/litros/?l=730">730 litros</a>: menos de <a href="/500-litros/">medio metro cúbico</a>.
      </p>

      <h2>128 litros: lo que de verdad sale de tus grifos</h2>
      <p>
        Este es el número serio, y lo publica el INE en su
        <a href="${INE_URL}" target="_blank" rel="noopener">Estadística sobre el Suministro y
        Saneamiento del Agua</a>: <b>${w.household} litros por habitante y día</b> en los hogares
        españoles, dato de 2024 publicado en julio de 2026 e idéntico al de 2022. Incluye ducha,
        cisterna, lavadora, cocina, limpieza y el grifo que dejas corriendo mientras te cepillas.
      </p>
      <p>
        Al año son <b><a href="/litros/?l=46720">${yearLabel} litros</a></b> por persona, unos
        <b>46,7 metros cúbicos</b>. A los <b>${String(w.pricePerM3).replace('.', ',')} €/m³</b> que
        cuesta de media el agua en España (1,09 € de suministro más 0,93 € de saneamiento), eso es
        alrededor de <b>${costYear} euros al año</b> por persona. Es de las facturas más baratas de
        la casa, y probablemente por eso nadie mira el contador.
      </p>
      <h3>Y depende mucho de dónde vivas</h3>
      <p>
        La media nacional esconde una diferencia enorme. En <b>${w.maxRegion.name}</b> se gastan
        <b><a href="/litros/?l=186">${w.maxRegion.l} litros</a></b> por habitante y día; en el
        <b>${w.minRegion.name}</b>, <b><a href="/litros/?l=79">${w.minRegion.l}</a></b>. Son
        <b>2,4 veces más</b> en un extremo que en el otro, dentro del mismo país. Pesa el clima, el
        tipo de vivienda (los jardines y las piscinas se notan), la antigüedad de las redes y lo que
        cuesta el metro cúbico en cada sitio.
      </p>

      <h2>Los 624 hectómetros cúbicos que se pierden por el camino</h2>
      <p>
        Aquí está el dato que más nos ha sorprendido de la estadística. Del agua que entra en las
        redes de distribución españolas, el <b>${String(w.leaksPct).replace('.', ',')} %</b> no llega
        a ningún grifo: se pierde en <b>fugas y averías</b>. En 2024 fueron
        <b><a href="/litros/?l=624&u=hm3">${w.leaksHm3} hectómetros cúbicos</a></b>.
      </p>
      <p>
        Un <a href="/cuanto-es-un-hectometro-cubico/">hectómetro cúbico</a> son mil millones de
        litros, así que hablamos de <b>624.000 millones de litros</b> perdidos en un año. Con eso se
        abastecería a <b>${leaksPeople} millones de personas</b> durante un año entero al ritmo de
        128 litros diarios: cerca de una cuarta parte de España. Dicho de otro modo, las fugas
        equivalen al <b>27 %</b> de todo lo que consumen los hogares españoles juntos.
      </p>
      <p>
        Merece la pena tenerlo en la cabeza cuando llega el verano y las campañas piden cerrar el
        grifo al enjabonarse. Está bien cerrarlo —abajo van los números—, pero el agujero más grande
        de la cuenta no está en tu ducha.
      </p>

      <h2>3.800 litros: el agua que no ves</h2>
      <p>
        El tercer número es de otra liga. La <b>huella hídrica</b> cuenta toda el agua que hizo falta
        para producir lo que consumes: el riego del cereal que comió la vaca, el algodón de tu
        camiseta, el grano de tu café. Según el trabajo de Mekonnen y Hoekstra para la
        <a href="${WFN_URL}" target="_blank" rel="noopener">Water Footprint Network</a>, la media
        mundial es de <b>1.385 m³ por persona y año</b>: unos <b>3.800 litros al día</b>, casi
        <b>30 veces</b> el consumo doméstico.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Producto</th><th>Agua que hizo falta</th><th>En días de tu consumo doméstico</th></tr></thead>
        <tbody>
          <tr><td>1 kg de ternera</td><td><a href="/litros/?l=15415">15.415 L</a></td><td>120 días</td></tr>
          <tr><td>Un filete de 200 g</td><td>3.083 L</td><td>24 días</td></tr>
          <tr><td>Una camiseta de algodón</td><td><a href="/litros/?l=2700">2.700 L</a></td><td>21 días</td></tr>
          <tr><td>Una taza de café</td><td>132 L</td><td>1 día</td></tr>
        </tbody>
      </table>
      <p>
        La última fila es la que mejor lo resume: <b>una taza de café al día son ${coffeeYear} litros
        al año</b>, más que los ${yearLabel} litros que salen de todos los grifos de tu casa en el
        mismo tiempo. El agua que no ves pesa más que la que pagas.
      </p>

      <h2>Cómo bajar de 128</h2>
      <p>
        Una advertencia honesta antes de los consejos: <b>el reparto del consumo por usos varía
        mucho según la fuente</b>, igual que nos pasó con los caudales de ducha al escribir sobre
        <a href="/cuantos-litros-tiene-una-banera/">las bañeras</a>. Así que aquí no hay porcentajes
        inventados, solo litros que puedes medir tú:
      </p>
      <ul>
        <li><b>La ducha manda.</b> Un cabezal normal echa entre 10 y 12 litros por minuto, y los hay
          de 20. Diez minutos de ducha pueden ser <a href="/litros/?l=120">120 litros</a>: casi tu
          día entero. Con un cabezal eficiente (6-9 L/min) esa misma ducha baja a 60-90.</li>
        <li><b>Mide tu caudal</b> con el truco de la botella: llena una de 1,5 litros y cronometra.
          Litros por minuto = 90 ÷ segundos. Es la cuenta más rentable de este artículo.</li>
        <li><b>Un baño en bañera</b> son unos <a href="/litros/?l=150">150 litros</a>, más de lo que
          gastas en todo un día normal.</li>
        <li><b>Riegos y piscinas</b> son lo que dispara las medias regionales. Llenar una piscina
          pequeña de 8 × 4 y 1,4 m son <a href="/litros/?l=45000">45.000 litros</a>: tu consumo
          doméstico de casi un año.</li>
      </ul>
      <p>
        Y por poner la escala en su sitio: si toda España bajara un litro por persona y día,
        ahorraríamos unos <a href="/litros/?l=18&u=hm3">18 hectómetros cúbicos</a> al año. Las fugas
        de la red se llevan 624.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos litros de agua consume una persona al día?</dt>
        <dd>En España, <b><a href="/litros/?l=128">128 litros por habitante y día</a></b> de consumo
          doméstico (INE, dato de 2024), que no hay que confundir con los 2 litros que se beben ni
          con los 3.800 de la huella hídrica, que incluye el agua usada para producir lo que comemos
          y vestimos.</dd>

        <dt>¿Cuánta agua hay que beber al día?</dt>
        <dd>La EFSA fija la ingesta adecuada en 2,0 litros diarios para las mujeres y 2,5 para los
          hombres, pero de agua total: incluye la que viene en los alimentos y en el resto de
          bebidas, no solo la del vaso. Con calor o ejercicio hace falta más.</dd>

        <dt>¿Cuánta agua consume una persona al año?</dt>
        <dd>Unos <a href="/litros/?l=46720">${yearLabel} litros</a> de consumo doméstico (46,7 m³),
          lo que una persona tarda ${drinkYears} años en beberse. Cuestan alrededor de
          ${costYear} euros al año a los ${String(w.pricePerM3).replace('.', ',')} €/m³ de media
          española.</dd>

        <dt>¿En qué comunidad se gasta más agua?</dt>
        <dd>En ${w.maxRegion.name}, con ${w.maxRegion.l} litros por habitante y día, frente a los
          ${w.minRegion.l} del ${w.minRegion.name}, que es la que menos gasta: 2,4 veces de
          diferencia (INE, 2024).</dd>

        <dt>¿Cuánta agua se pierde en fugas en España?</dt>
        <dd>El ${String(w.leaksPct).replace('.', ',')} % del agua suministrada a las redes de
          distribución, ${w.leaksHm3} hectómetros cúbicos en 2024: 624.000 millones de litros, con
          los que se abastecería a ${leaksPeople} millones de personas durante un año.</dd>

        <dt>¿Qué es la huella hídrica?</dt>
        <dd>Toda el agua que hizo falta para producir lo que consumes, no solo la que te llega por la
          tubería. La media mundial son 1.385 m³ por persona y año, unos 3.800 litros diarios. Un
          kilo de ternera lleva 15.415 litros detrás y una camiseta de algodón, 2.700.</dd>
      </dl>
      <p>
        ¿Quieres seguir con el agua? Mira <a href="/cuanto-es-un-hectometro-cubico/">cuánto es un
        hectómetro cúbico</a>, <a href="/cuantos-litros-tiene-una-banera/">cuántos litros tiene una
        bañera</a> o <a href="/cuantos-litros-piscina-olimpica/">cuántos una piscina olímpica</a>. Y
        si quieres dibujar tu propia cifra, tienes la
        <a href="/litros/">herramienta de litros</a>.
      </p>`;
  return {
    section: 'litros', lang: 'es', key: 'consumo-diario', l: w.household,
    family: 'litros', published: '2026-08-14', modified: '2026-08-14',
    slug: 'cuantos-litros-consume-una-persona-al-dia',
    path: '/cuantos-litros-consume-una-persona-al-dia/',
    title: '¿Cuántos litros de agua consume una persona al día? Beber vs gastar | Hectareómetro',
    description: 'Bebemos 2 litros al día, gastamos 128 en casa (INE) y arrastramos 3.800 de huella hídrica. Los tres números explicados, el reparto por comunidades y los 624 hm³ que se pierden en fugas.',
    h1: '¿Cuánta agua consume una persona al día?',
    intro,
    question: '¿Cuántos litros de agua consume una persona al día?',
    answer: `En España el consumo doméstico medio es de ${w.household} litros por habitante y día (INE, dato de 2024), que no hay que confundir con los 2 litros que se beben ni con los 3.800 litros de la huella hídrica, que incluye el agua usada para producir lo que comemos y vestimos.`,
    faqs: [
      { q: '¿Cuántos litros de agua consume una persona al día?', a: `En España, ${w.household} litros por habitante y día de consumo doméstico (INE, dato de 2024), que no hay que confundir con los 2 litros que se beben ni con los 3.800 de la huella hídrica, que incluye el agua usada para producir lo que comemos y vestimos.` },
      { q: '¿Cuánta agua hay que beber al día?', a: 'La EFSA fija la ingesta adecuada en 2,0 litros diarios para las mujeres y 2,5 para los hombres, pero de agua total: incluye la que viene en los alimentos y en el resto de bebidas, no solo la del vaso. Con calor o ejercicio hace falta más.' },
      { q: '¿Cuánta agua consume una persona al año?', a: `Unos ${yearLabel} litros de consumo doméstico (46,7 m³), lo que una persona tarda ${drinkYears} años en beberse. Cuestan alrededor de ${costYear} euros al año a los ${String(w.pricePerM3).replace('.', ',')} €/m³ de media española.` },
      { q: '¿En qué comunidad se gasta más agua?', a: `En ${w.maxRegion.name}, con ${w.maxRegion.l} litros por habitante y día, frente a los ${w.minRegion.l} del ${w.minRegion.name}, que es la que menos gasta: 2,4 veces de diferencia (INE, 2024).` },
      { q: '¿Cuánta agua se pierde en fugas en España?', a: `El ${String(w.leaksPct).replace('.', ',')} % del agua suministrada a las redes de distribución, ${w.leaksHm3} hectómetros cúbicos en 2024: 624.000 millones de litros, con los que se abastecería a ${leaksPeople} millones de personas durante un año.` },
      { q: '¿Qué es la huella hídrica?', a: 'Toda el agua que hizo falta para producir lo que consumes, no solo la que te llega por la tubería. La media mundial son 1.385 m³ por persona y año, unos 3.800 litros diarios. Un kilo de ternera lleva 15.415 litros detrás y una camiseta de algodón, 2.700.' },
    ],
    linkLabel: '¿Cuánta agua consume una persona al día?',
  };
}

const LITER_ARTICLES = [
  poolArticle('es'), poolArticle('en'), cubicHectometreArticle(),
  tankerTruckArticle(), bathtubArticle('es'), bathtubArticle('en'),
  dailyWaterArticle(),
];

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

// ¿Cuánto es una milla náutica? Bilingual (universal topic). The embedded
// distances tool is preset to a 1,852 m radius circle: over the bay of
// Santander on es, over the Strait of Dover on en.
// Data validated 2026-07-29 (web): the international nautical mile is exactly
// 1,852 m, adopted by the First International Extraordinary Hydrographic
// Conference (Monaco, 1929); the US adopted it in 1954 and the UK in 1970,
// dropping its Admiralty mile of 6,080 ft = 1,853.184 m. It approximates one
// minute of arc of a meridian: a minute of latitude runs from ~1,843 m at the
// equator to ~1,862 m near the poles (the Earth is not a sphere), so 1,852 is
// a round compromise. 1 knot = 1 nautical mile per hour = 1.852 km/h
// = 0.514 m/s; the name comes from the chip log, whose line carried knots
// every 47 ft 3 in and was timed with a 28-second sandglass. Statute mile =
// 1,609.344 m, so a nautical mile is ~15 % longer (1 nmi = 1.15078 mi) and
// 6,076.12 ft. UNCLOS limits: territorial sea 12 nmi, contiguous zone 24,
// exclusive economic zone 200.
// Sources: https://en.wikipedia.org/wiki/Nautical_mile ·
// https://www.britannica.com/science/nautical-mile ·
// https://oceanservice.noaa.gov/facts/nautical-mile-knot.html ·
// https://en.wikipedia.org/wiki/Chip_log
const NAUTICAL_ALTERNATES = {
  es: '/cuanto-es-una-milla-nautica/',
  en: '/en/how-long-is-a-nautical-mile/',
};

function nauticalMileArticle(lang) {
  const es = lang === 'es';
  const NOAA_URL = 'https://oceanservice.noaa.gov/facts/nautical-mile-knot.html';
  if (es) {
  const distUrl = '/distancias/?d=1852&u=m&lat=43.4623&lon=-3.8099&z=13';
  const dist = (d, z) => `/distancias/?d=${d}&u=km&lat=43.4623&lon=-3.8099&z=${z}`;
  const intro = `      <p>
        <b>Una milla náutica son 1.852 metros exactos</b>: <b><a href="${distUrl}">1,852
        kilómetros</a></b>, o unas <b>1,15 millas terrestres</b>. No es una cifra arbitraria ni un
        redondeo caprichoso: la milla náutica nació midiendo la Tierra, y equivale
        aproximadamente a <b>un minuto de arco de meridiano</b>. El dibujo de arriba muestra ese
        radio de 1.852 metros sobre la bahía de Santander; arrastra el mapa hasta tu costa para
        verla a escala.
      </p>
      <p>
        Con esa definición, la milla náutica es un <b>15 % más larga</b> que la milla terrestre de
        toda la vida (1.609,344 m). Por eso, cuando un barco o un avión hablan de «millas», no son
        las mismas millas que las de una carretera.
      </p>

      <h2>¿Por qué mide 1.852 metros?</h2>
      <p>
        Porque la unidad no se eligió pensando en el metro, sino en el planeta. Una circunferencia
        tiene 360 grados y cada grado se divide en 60 minutos de arco: en total, <b>21.600
        minutos</b>. Si a cada minuto de meridiano le asignamos una milla náutica, la vuelta
        completa a la Tierra por un meridiano mide 21.600 millas náuticas, es decir
        <b>40.003 kilómetros</b>… y el meridiano real mide unos 40.008 km. La aproximación es
        asombrosamente buena.
      </p>
      <p>
        Esa elección tiene una ventaja práctica enorme para navegar: sobre una carta náutica,
        <b>un minuto de latitud es exactamente una milla náutica</b>. Se toma la distancia con el
        compás, se lleva a la escala de latitudes del margen y se lee directamente. Y un grado
        completo de latitud son 60 millas náuticas, es decir <a href="${dist('111.12', 8)}">111,12
        km</a>.
      </p>

      <h2>De la milla del Almirantazgo a los 1.852 metros</h2>
      <p>
        Hasta 1929 no había una milla náutica única: cada país usaba la suya. Los británicos
        navegaban con la <b>milla del Almirantazgo</b>, 6.080 pies (<b>1.853,184 m</b>), y
        Estados Unidos manejaba un valor ligeramente distinto. La <b>Conferencia Hidrográfica
        Internacional Extraordinaria de Mónaco</b>, en <b>1929</b>, zanjó el asunto fijando la
        <b>milla náutica internacional en 1.852 metros exactos</b>. Estados Unidos adoptó la
        definición en <b>1954</b> y el Reino Unido en <b>1970</b>, jubilando su milla del
        Almirantazgo.
      </p>
      <p>
        ¿Por qué 1.852 y no el valor «verdadero»? Porque no hay un único valor verdadero: la Tierra
        no es una esfera perfecta, sino un elipsoide achatado por los polos, así que un minuto de
        latitud mide unos <b>1.843 m en el ecuador</b> y hasta unos <b>1.862 m cerca de los
        polos</b>. Los 1.852 metros son el compromiso redondo que se quedó.
      </p>

      <h2>¿Y qué es un nudo?</h2>
      <p>
        Un <b>nudo</b> es simplemente <b>una milla náutica por hora</b>: 1,852 km/h, o unos
        0,514 metros por segundo (<a href="${NOAA_URL}" target="_blank" rel="noopener">NOAA</a>).
        Ojo con el error clásico: <b>no se dice «nudos por hora»</b>, porque la hora ya va dentro
        del nudo.
      </p>
      <p>
        El nombre viene de cómo se medía la velocidad antes de la electrónica: la <b>corredera de
        barquilla</b>. Se echaba por la popa una tablilla de madera atada a un cabo que llevaba
        <b>nudos cada 47 pies y 3 pulgadas</b> (unos 14,4 m) y se contaban los nudos que se
        soltaban mientras corría un <b>reloj de arena de 28 segundos</b>. Los nudos contados eran,
        directamente, las millas náuticas por hora.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Velocidad</th><th>Equivale a</th><th>Ejemplo típico</th></tr></thead>
        <tbody>
          <tr><td>1 nudo</td><td>1,85 km/h</td><td>una persona paseando muy despacio</td></tr>
          <tr><td>6 nudos</td><td>11,1 km/h</td><td>un velero de crucero</td></tr>
          <tr><td>20 nudos</td><td>37 km/h</td><td>un buque portacontenedores</td></tr>
          <tr><td>30 nudos</td><td>55,6 km/h</td><td>una lancha rápida o una fragata</td></tr>
          <tr><td>480 nudos</td><td>889 km/h</td><td>un avión de línea en crucero</td></tr>
        </tbody>
      </table>

      <h2>Milla náutica, milla terrestre y kilómetro</h2>
      <table class="equiv-table">
        <thead><tr><th>Unidad</th><th>En metros</th><th>En millas náuticas</th></tr></thead>
        <tbody>
          <tr><td>Kilómetro</td><td>1.000 m</td><td>0,54 mn</td></tr>
          <tr><td>Milla terrestre</td><td>1.609,344 m</td><td>0,87 mn</td></tr>
          <tr><td>Milla náutica</td><td>1.852 m</td><td>1 mn</td></tr>
        </tbody>
      </table>
      <p>
        En sentido contrario: una milla náutica son <b>1,15 millas terrestres</b> y
        <b>6.076 pies</b>. Se abrevia <b>M</b> en la marina, <b>NM</b> en aviación y <b>nmi</b> o
        <b>mn</b> en otros contextos.
      </p>

      <h2>Tabla de conversión de millas náuticas</h2>
      <p>Pincha en cualquier distancia para verla dibujada arriba a escala:</p>
      <table class="equiv-table">
        <thead><tr><th>Millas náuticas</th><th>Distancia</th></tr></thead>
        <tbody>
          <tr><td>1 milla náutica</td><td><a href="${distUrl}">1.852 m</a> (1,852 km)</td></tr>
          <tr><td>2 millas náuticas</td><td><a href="${dist('3.704', 12)}">3,7 km</a></td></tr>
          <tr><td>5 millas náuticas</td><td><a href="${dist('9.26', 11)}">9,26 km</a></td></tr>
          <tr><td>10 millas náuticas</td><td><a href="${dist('18.52', 10)}">18,52 km</a></td></tr>
          <tr><td>12 millas náuticas (aguas territoriales)</td><td><a href="${dist('22.224', 10)}">22,2 km</a></td></tr>
          <tr><td>100 millas náuticas</td><td><a href="${dist('185.2', 7)}">185,2 km</a></td></tr>
          <tr><td>200 millas náuticas (zona económica exclusiva)</td><td><a href="${dist('370.4', 6)}">370,4 km</a></td></tr>
        </tbody>
      </table>

      <h2>Dónde te vas a encontrar millas náuticas</h2>
      <p>
        Además de en el mar y en el aire, la milla náutica es la unidad con la que se dibujan las
        fronteras marítimas. El derecho del mar (la Convención de las Naciones Unidas sobre el
        Derecho del Mar) mide desde la costa <b>12 millas náuticas de aguas territoriales</b>
        (unos <a href="${dist('22.224', 10)}">22,2 km</a>), 24 para la zona contigua y
        <b>200 millas náuticas de zona económica exclusiva</b>
        (<a href="${dist('370.4', 6)}">370,4 km</a>): de ahí las famosas «200 millas» de los
        caladeros de pesca.
      </p>
      <p>
        Si lo que quieres es medir una travesía concreta y no un radio, dibújala punto a punto con
        la <a href="/medir-distancias/">herramienta de medir distancias</a>: te da los kilómetros
        de la ruta que tracees sobre el mapa.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos metros tiene una milla náutica?</dt>
        <dd>Exactamente <a href="${distUrl}">1.852 metros</a>, es decir 1,852 km. Es un valor
          definido por convenio internacional desde 1929, no una medida aproximada.</dd>

        <dt>¿Cuántos kilómetros son una milla náutica?</dt>
        <dd>1,852 km. A la inversa, un kilómetro son 0,54 millas náuticas.</dd>

        <dt>¿Por qué una milla náutica mide 1.852 metros?</dt>
        <dd>Porque equivale aproximadamente a un minuto de arco de meridiano: 21.600 minutos por
          vuelta a la Tierra × 1.852 m dan 40.003 km, casi exactamente el meridiano terrestre. Así,
          en una carta náutica un minuto de latitud es una milla náutica.</dd>

        <dt>¿Qué diferencia hay entre una milla náutica y una milla terrestre?</dt>
        <dd>La milla terrestre mide 1.609,344 m y la náutica 1.852 m: la náutica es un 15 % más
          larga. Una milla náutica equivale a 1,15 millas terrestres.</dd>

        <dt>¿Cuánto es un nudo en kilómetros por hora?</dt>
        <dd>Un nudo es una milla náutica por hora, o sea 1,852 km/h. Un barco a 20 nudos navega a
          unos 37 km/h. No se dice «nudos por hora»: la hora ya está incluida en el nudo.</dd>

        <dt>¿Cuántas millas náuticas son las aguas territoriales?</dt>
        <dd>12 millas náuticas desde la costa, unos 22,2 km. La zona económica exclusiva llega a
          200 millas náuticas, unos 370,4 km.</dd>
      </dl>
      <p>
        ¿Quieres seguir jugando con distancias? Mira <a href="/cuanto-son-10000-pasos/">cuántos
        kilómetros son 10.000 pasos</a> o abre la <a href="/distancias/">herramienta de
        distancias</a> y dibuja la tuya. Y si lo tuyo son las superficies, tienes el
        <a href="/">Hectareómetro</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'es', key: 'milla-nautica', ha: 0,
    family: 'distancias', published: '2026-07-29', modified: '2026-07-29',
    slug: 'cuanto-es-una-milla-nautica',
    path: NAUTICAL_ALTERNATES.es, alternates: NAUTICAL_ALTERNATES,
    dist: 1852, distUnit: 'm',
    presetExtra: ' var PRESET_ZOOM = 13; var PRESET_LAT = 43.4623; var PRESET_LON = -3.8099;',
    title: '¿Cuánto es una milla náutica y por qué mide 1.852 metros? | Hectareómetro',
    description: 'Una milla náutica son 1.852 metros exactos (1,852 km, un 15 % más que una milla terrestre). Por qué mide eso, qué es un nudo y tabla de conversión. Míralo dibujado en un mapa.',
    h1: '¿Cuánto es una milla náutica?',
    intro,
    question: '¿Cuánto es una milla náutica?',
    answer: 'Una milla náutica son 1.852 metros exactos, es decir 1,852 kilómetros o unas 1,15 millas terrestres. Equivale aproximadamente a un minuto de arco de meridiano.',
    faqs: [
      { q: '¿Cuántos metros tiene una milla náutica?', a: 'Exactamente 1.852 metros, es decir 1,852 km. Es un valor definido por convenio internacional desde 1929, no una medida aproximada.' },
      { q: '¿Cuántos kilómetros son una milla náutica?', a: '1,852 km. A la inversa, un kilómetro son 0,54 millas náuticas.' },
      { q: '¿Por qué una milla náutica mide 1.852 metros?', a: 'Porque equivale aproximadamente a un minuto de arco de meridiano: 21.600 minutos por vuelta a la Tierra × 1.852 m dan 40.003 km, casi exactamente el meridiano terrestre. Así, en una carta náutica un minuto de latitud es una milla náutica.' },
      { q: '¿Qué diferencia hay entre una milla náutica y una milla terrestre?', a: 'La milla terrestre mide 1.609,344 m y la náutica 1.852 m: la náutica es un 15 % más larga. Una milla náutica equivale a 1,15 millas terrestres.' },
      { q: '¿Cuánto es un nudo en kilómetros por hora?', a: 'Un nudo es una milla náutica por hora, o sea 1,852 km/h. Un barco a 20 nudos navega a unos 37 km/h. No se dice «nudos por hora»: la hora ya está incluida en el nudo.' },
      { q: '¿Cuántas millas náuticas son las aguas territoriales?', a: '12 millas náuticas desde la costa, unos 22,2 km. La zona económica exclusiva llega a 200 millas náuticas, unos 370,4 km.' },
    ],
    linkLabel: '¿Cuánto es una milla náutica?',
  };
  }

  // English mirror (universal topic). Preset centred on the Strait of Dover;
  // leads with metres (the definition) and gives feet and statute miles too.
  const distUrl = '/en/distances/?d=1852&u=m&lat=51.1279&lon=1.3134&z=13';
  const dist = (d, z) => `/en/distances/?d=${d}&u=km&lat=51.1279&lon=1.3134&z=${z}`;
  const intro = `      <p>
        <b>A nautical mile is exactly 1,852 metres</b>: <b><a href="${distUrl}">1.852
        kilometres</a></b>, about <b>1.15 statute miles</b> or <b>6,076 feet</b>. The figure is not
        arbitrary — the nautical mile was born measuring the Earth, and it corresponds to roughly
        <b>one minute of arc of a meridian</b>. The drawing above shows that 1,852 m radius over the
        Strait of Dover; drag the map to your own coast to see it to scale.
      </p>
      <p>
        That makes the nautical mile <b>15 % longer</b> than the statute mile you use on land
        (1,609.344 m). So when a ship or an aircraft talks about "miles", they are not the same
        miles as the ones on a road sign.
      </p>

      <h2>Why is it 1,852 metres?</h2>
      <p>
        Because the unit was not built around the metre, but around the planet. A circle has 360
        degrees and each degree is split into 60 minutes of arc: <b>21,600 minutes</b> in all. Give
        each minute of a meridian one nautical mile and a full meridian comes to 21,600 nautical
        miles, that is <b>40,003 kilometres</b> — while the real meridian measures about 40,008 km.
        A remarkably good approximation.
      </p>
      <p>
        That choice has a huge practical advantage at sea: on a nautical chart, <b>one minute of
        latitude is exactly one nautical mile</b>. You pick up the distance with dividers, take it
        to the latitude scale in the margin and read it off directly. And a full degree of latitude
        is 60 nautical miles, or <a href="${dist('111.12', 8)}">111.12 km</a>.
      </p>

      <h2>From the Admiralty mile to 1,852 metres</h2>
      <p>
        Until 1929 there was no single nautical mile: every country used its own. Britain sailed
        with the <b>Admiralty mile</b> of 6,080 feet (<b>1,853.184 m</b>), and the United States
        worked with a slightly different value. The <b>First International Extraordinary
        Hydrographic Conference</b>, held in Monaco in <b>1929</b>, settled it by fixing the
        <b>international nautical mile at exactly 1,852 metres</b>. The United States adopted the
        definition in <b>1954</b> and the United Kingdom in <b>1970</b>, retiring its Admiralty
        mile.
      </p>
      <p>
        Why 1,852 and not the "true" value? Because there is no single true value: the Earth is not
        a perfect sphere but an ellipsoid flattened at the poles, so a minute of latitude runs from
        about <b>1,843 m at the equator</b> to some <b>1,862 m near the poles</b>. The 1,852 metres
        are the round compromise that stuck.
      </p>

      <h2>So what is a knot?</h2>
      <p>
        A <b>knot</b> is simply <b>one nautical mile per hour</b>: 1.852 km/h, about 1.15 mph or
        0.514 metres per second (<a href="${NOAA_URL}" target="_blank" rel="noopener">NOAA</a>).
        Watch out for the classic mistake: there is <b>no such thing as "knots per hour"</b>,
        because the hour is already baked into the knot.
      </p>
      <p>
        The name comes from how speed was measured before electronics: the <b>chip log</b>. A
        wooden board tied to a line was thrown off the stern; the line carried <b>knots every 47
        feet 3 inches</b> (about 14.4 m) and the crew counted how many ran out while a
        <b>28-second sandglass</b> emptied. The knots counted were, directly, the nautical miles
        per hour.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Speed</th><th>Equals</th><th>Typical example</th></tr></thead>
        <tbody>
          <tr><td>1 knot</td><td>1.85 km/h (1.15 mph)</td><td>a very slow stroll</td></tr>
          <tr><td>6 knots</td><td>11.1 km/h (6.9 mph)</td><td>a cruising sailboat</td></tr>
          <tr><td>20 knots</td><td>37 km/h (23 mph)</td><td>a container ship</td></tr>
          <tr><td>30 knots</td><td>55.6 km/h (35 mph)</td><td>a speedboat or a frigate</td></tr>
          <tr><td>480 knots</td><td>889 km/h (552 mph)</td><td>an airliner at cruise</td></tr>
        </tbody>
      </table>

      <h2>Nautical mile, statute mile and kilometre</h2>
      <table class="equiv-table">
        <thead><tr><th>Unit</th><th>In metres</th><th>In nautical miles</th></tr></thead>
        <tbody>
          <tr><td>Kilometre</td><td>1,000 m</td><td>0.54 nmi</td></tr>
          <tr><td>Statute mile</td><td>1,609.344 m</td><td>0.87 nmi</td></tr>
          <tr><td>Nautical mile</td><td>1,852 m</td><td>1 nmi</td></tr>
        </tbody>
      </table>
      <p>
        The other way round: one nautical mile is <b>1.15 statute miles</b> and <b>6,076 feet</b>.
        It is abbreviated <b>M</b> at sea, <b>NM</b> in aviation and <b>nmi</b> elsewhere.
      </p>

      <h2>Nautical mile conversion table</h2>
      <p>Click any distance to see it drawn to scale above:</p>
      <table class="equiv-table">
        <thead><tr><th>Nautical miles</th><th>Distance</th></tr></thead>
        <tbody>
          <tr><td>1 nautical mile</td><td><a href="${distUrl}">1,852 m</a> (1.852 km · 1.15 mi)</td></tr>
          <tr><td>2 nautical miles</td><td><a href="${dist('3.704', 12)}">3.7 km</a> (2.3 mi)</td></tr>
          <tr><td>5 nautical miles</td><td><a href="${dist('9.26', 11)}">9.26 km</a> (5.75 mi)</td></tr>
          <tr><td>10 nautical miles</td><td><a href="${dist('18.52', 10)}">18.52 km</a> (11.5 mi)</td></tr>
          <tr><td>12 nautical miles (territorial waters)</td><td><a href="${dist('22.224', 10)}">22.2 km</a> (13.8 mi)</td></tr>
          <tr><td>100 nautical miles</td><td><a href="${dist('185.2', 7)}">185.2 km</a> (115 mi)</td></tr>
          <tr><td>200 nautical miles (exclusive economic zone)</td><td><a href="${dist('370.4', 6)}">370.4 km</a> (230 mi)</td></tr>
        </tbody>
      </table>

      <h2>Where you will run into nautical miles</h2>
      <p>
        Beyond ships and aircraft, the nautical mile is the unit that draws maritime borders. The
        law of the sea (the United Nations Convention on the Law of the Sea) measures from the coast
        <b>12 nautical miles of territorial waters</b> (about
        <a href="${dist('22.224', 10)}">22.2 km</a>), 24 for the contiguous zone and
        <b>200 nautical miles of exclusive economic zone</b>
        (<a href="${dist('370.4', 6)}">370.4 km</a>) — hence the famous "200-mile limit" of fishing
        grounds. For scale, the Strait of Dover under the map above is about 18 nautical miles
        across at its narrowest, so those 12 miles of territorial waters nearly meet in the middle.
      </p>
      <p>
        If you want to measure an actual passage rather than a radius, trace it point by point with
        the <a href="/en/measure-distance/">measure-a-distance tool</a>: it gives you the length of
        whatever route you draw on the map.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How many metres are in a nautical mile?</dt>
        <dd>Exactly <a href="${distUrl}">1,852 metres</a>, that is 1.852 km. It is a value fixed by
          international agreement since 1929, not an approximation.</dd>

        <dt>How long is a nautical mile in miles?</dt>
        <dd>1.15 statute miles (1.852 km, or 6,076 feet). The other way round, a statute mile is
          0.87 nautical miles.</dd>

        <dt>Why is a nautical mile 1,852 metres?</dt>
        <dd>Because it corresponds to roughly one minute of arc of a meridian: 21,600 minutes around
          the Earth × 1,852 m give 40,003 km, almost exactly the Earth's meridian. That is why one
          minute of latitude on a chart is one nautical mile.</dd>

        <dt>What is the difference between a nautical mile and a statute mile?</dt>
        <dd>The statute mile is 1,609.344 m and the nautical mile is 1,852 m: the nautical mile is
          15 % longer, or 1.15 statute miles.</dd>

        <dt>How fast is one knot?</dt>
        <dd>A knot is one nautical mile per hour, so 1.852 km/h or about 1.15 mph. A ship doing 20
          knots is sailing at roughly 37 km/h (23 mph). Never say "knots per hour": the hour is
          already part of the knot.</dd>

        <dt>How many nautical miles are territorial waters?</dt>
        <dd>12 nautical miles from the coast, about 22.2 km. The exclusive economic zone extends to
          200 nautical miles, some 370.4 km.</dd>
      </dl>
      <p>
        Want to keep playing with distances? See <a href="/en/how-far-is-10000-steps/">how far
        10,000 steps is</a> or open the <a href="/en/distances/">distances tool</a> and draw your
        own. And if areas are more your thing, there is the <a href="/en/">Hectareometer</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'en', key: 'milla-nautica', ha: 0,
    family: 'distancias', published: '2026-07-29', modified: '2026-07-29',
    slug: 'how-long-is-a-nautical-mile',
    path: NAUTICAL_ALTERNATES.en, alternates: NAUTICAL_ALTERNATES,
    dist: 1852, distUnit: 'm',
    presetExtra: ' var PRESET_ZOOM = 13; var PRESET_LAT = 51.1279; var PRESET_LON = 1.3134;',
    title: 'How long is a nautical mile, and why 1,852 metres? | Hectareometer',
    description: 'A nautical mile is exactly 1,852 metres (1.852 km, 1.15 statute miles) — 15 % longer than a land mile. Why it measures that, what a knot is and a conversion table, drawn on a map.',
    h1: 'How long is a nautical mile?',
    intro,
    question: 'How long is a nautical mile?',
    answer: 'A nautical mile is exactly 1,852 metres: 1.852 kilometres, about 1.15 statute miles or 6,076 feet. It corresponds to roughly one minute of arc of a meridian.',
    faqs: [
      { q: 'How many metres are in a nautical mile?', a: 'Exactly 1,852 metres, that is 1.852 km. It is a value fixed by international agreement since 1929, not an approximation.' },
      { q: 'How long is a nautical mile in miles?', a: '1.15 statute miles (1.852 km, or 6,076 feet). The other way round, a statute mile is 0.87 nautical miles.' },
      { q: 'Why is a nautical mile 1,852 metres?', a: "Because it corresponds to roughly one minute of arc of a meridian: 21,600 minutes around the Earth × 1,852 m give 40,003 km, almost exactly the Earth's meridian. That is why one minute of latitude on a chart is one nautical mile." },
      { q: 'What is the difference between a nautical mile and a statute mile?', a: 'The statute mile is 1,609.344 m and the nautical mile is 1,852 m: the nautical mile is 15 % longer, or 1.15 statute miles.' },
      { q: 'How fast is one knot?', a: 'A knot is one nautical mile per hour, so 1.852 km/h or about 1.15 mph. A ship doing 20 knots is sailing at roughly 37 km/h (23 mph). Never say "knots per hour": the hour is already part of the knot.' },
      { q: 'How many nautical miles are territorial waters?', a: '12 nautical miles from the coast, about 22.2 km. The exclusive economic zone extends to 200 nautical miles, some 370.4 km.' },
    ],
    linkLabel: 'How long is a nautical mile?',
  };
}

// ¿Cuánto mide un maratón? Bilingual (universal topic). The embedded distances
// tool is preset to a 42.195 km radius circle over Madrid (es) and a 26.2-mile
// one over London (en) — same circle, each language's headline figure.
// Data validated 2026-08-05 (web):
// · The distance is 42.195 km exactly (26 miles 385 yards = 41,842.94 m +
//   352.04 m); half marathon 21.0975 km (13.11 mi).
// · 1896 Athens: ~40 km, Marathon to Athens. Distances varied for two decades:
//   Stockholm 1912 ran 40.2 km, Antwerp 1920 ran 42.75 km.
// · London 1908: the course started on the East Lawn of Windsor Castle (with
//   Edward VII's permission, so the royal children could watch) and finished at
//   White City Stadium, where the lap was cut to 385 yards to end in front of
//   the royal box → "about 26 miles plus 385 yards on the track". The IAAF
//   adopted that distance in 1921; its minutes are silent as to why.
//   (Wikipedia, Athletics at the 1908 Summer Olympics – Men's marathon.)
// · Straight-line distances computed with the haversine formula: Windsor Castle
//   → White City 26.5 km; Madrid → El Escorial 42.2 km; Madrid → Aranjuez
//   43.7 km; central London → Guildford 43.0 km.
// · Average finish times: 4:29:53 overall, 4:21:03 men, 4:48:45 women — the
//   RunRepeat study of 19,614,975 results from 32,335 races (2008-2018).
// · World records: men 1:59:30, Sabastian Sawe (KEN), London, 2026-04-26 (first
//   sub-2-hour marathon in a race); women mixed-sex 2:09:56, Ruth Chepng'etich
//   (KEN), Chicago, 2024-10-13; women-only 2:15:41, Tigst Assefa (ETH), London,
//   2026-04-26.
// Sources: https://en.wikipedia.org/wiki/Athletics_at_the_1908_Summer_Olympics_%E2%80%93_Men%27s_marathon ·
// https://en.wikipedia.org/wiki/Marathon_world_record_progression ·
// https://runrepeat.com/research-marathon-performance-across-nations
const MARATHON_KM = 42.195;
const MARATHON_ALTERNATES = {
  es: '/cuanto-mide-un-maraton/',
  en: '/en/how-long-is-a-marathon/',
};

function marathonArticle(lang) {
  const es = lang === 'es';
  const OLYMPIC_1908_URL = 'https://en.wikipedia.org/wiki/Athletics_at_the_1908_Summer_Olympics_%E2%80%93_Men%27s_marathon';
  const WR_URL = 'https://en.wikipedia.org/wiki/Marathon_world_record_progression';
  const RUNREPEAT_URL = 'https://runrepeat.com/research-marathon-performance-across-nations';

  if (es) {
  const distUrl = '/distancias/?d=42.195&u=km&lat=40.4168&lon=-3.7038&z=9';
  const dist = (d, z) => `/distancias/?d=${d}&u=km&lat=40.4168&lon=-3.7038&z=${z}`;
  const intro = `      <p>
        Un <b>maratón mide 42,195 kilómetros</b>: <b><a href="${distUrl}">42.195 metros</a></b>
        exactos, o 26 millas y 385 yardas, que es de donde sale la cifra. El
        <b>medio maratón</b> son justo la mitad, <b><a href="${dist('21.0975', 10)}">21,0975
        km</a></b>. El dibujo de arriba pone esos 42,195 km como radio con centro en Madrid:
        arrastra el mapa hasta tu ciudad para ver hasta dónde llegarías en línea recta si corrieras
        un maratón sin girar.
      </p>
      <p>
        Desde el centro de Madrid, 42 kilómetros en línea recta te dejan justo en <b>El
        Escorial</b> (42,2 km) o pasado <b>Aranjuez</b> (43,7 km). Es la magnitud que sorprende
        cuando se dibuja: un maratón no es «una carrera larga», es cruzar una provincia entera de
        parte a parte.
      </p>

      <h2>¿Por qué un maratón mide 42,195 km?</h2>
      <p>
        Porque una familia real quiso ver la salida desde su jardín. Suena a chiste, pero es
        básicamente lo que pasó.
      </p>
      <p>
        El primer maratón olímpico, en <b>Atenas 1896</b>, recorrió unos <b>40 kilómetros</b>: los
        que separan la localidad de Maratón de Atenas, en homenaje a la leyenda del soldado que
        llevó corriendo la noticia de la victoria sobre los persas. Durante dos décadas la distancia
        fue orientativa y cambiaba en cada edición: <b>Estocolmo 1912</b> corrió 40,2 km y
        <b>Amberes 1920</b>, 42,75 km.
      </p>
      <p>
        La cifra definitiva nació en <b>Londres 1908</b>. La organización quiso que la carrera
        saliera del <b>castillo de Windsor</b> —concretamente del <i>East Lawn</i>, el jardín junto
        a la terraza privada, con permiso de Eduardo VII, para que los niños de la familia real
        vieran la salida desde allí— y terminara en el <b>estadio de White City</b>, en Londres.
        Para que la meta quedara <b>frente al palco real</b>, la última vuelta a la pista se recortó
        a <b>385 yardas</b> (352 metros). Total: <b>26 millas y 385 yardas</b>, es decir
        <b>42.195 metros</b>
        (<a href="${OLYMPIC_1908_URL}" target="_blank" rel="noopener">actas de la carrera</a>).
      </p>
      <p>
        En <b>1921</b>, la IAAF (hoy World Athletics) decidió unificar la distancia y eligió
        precisamente la de Londres 1908. Las actas de aquella reunión <b>no explican por qué</b>:
        simplemente se adoptó, y de ahí que hoy medio mundo corra una distancia que se fijó para
        cuadrar con un palco.
      </p>
      <table class="equiv-table">
        <thead><tr><th>42,195 km son…</th><th>Equivalen a</th></tr></thead>
        <tbody>
          <tr><td>En metros</td><td>42.195 m</td></tr>
          <tr><td>En millas</td><td>26,22 millas (26 millas y 385 yardas)</td></tr>
          <tr><td>En medios maratones</td><td>2 (de 21,0975 km)</td></tr>
          <tr><td>En pasos</td><td>unos 56.000 (<a href="/cuanto-son-10000-pasos/">a 0,75 m por paso</a>)</td></tr>
          <tr><td>En millas náuticas</td><td>22,8 (<a href="/cuanto-es-una-milla-nautica/">de 1.852 m</a>)</td></tr>
        </tbody>
      </table>

      <h2>Un detalle curioso del recorrido de 1908</h2>
      <p>
        En línea recta, del castillo de Windsor al estadio de White City hay
        <b><a href="${dist('26.5', 10)}">26,5 kilómetros</a></b>. Los corredores hicieron 42,195: el
        recorrido real da vueltas, como cualquier maratón urbano. Es la diferencia entre el radio que
        dibuja esta herramienta y los kilómetros que de verdad se corren, y por eso ningún maratón
        «llega» tan lejos como parece: <a href="/medir-distancias/">dibuja la ruta punto a punto</a>
        si quieres medir un trazado real.
      </p>

      <h2>Ritmos y tiempos: cuánto se tarda en correr un maratón</h2>
      <p>
        La media mundial está en torno a las <b>4 horas y media</b>. El mayor análisis publicado,
        con <b>19,6 millones de resultados</b> de más de 32.000 carreras
        (<a href="${RUNREPEAT_URL}" target="_blank" rel="noopener">RunRepeat</a>), da un tiempo medio
        de <b>4 h 29 min</b>: <b>4 h 21 min</b> los hombres y <b>4 h 49 min</b> las mujeres.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Tiempo final</th><th>Ritmo</th><th>Velocidad</th></tr></thead>
        <tbody>
          <tr><td>3 h 00 min</td><td>4:16 min/km</td><td>14,1 km/h</td></tr>
          <tr><td>3 h 30 min</td><td>4:59 min/km</td><td>12,1 km/h</td></tr>
          <tr><td>4 h 00 min</td><td>5:41 min/km</td><td>10,6 km/h</td></tr>
          <tr><td>4 h 30 min (la media)</td><td>6:24 min/km</td><td>9,4 km/h</td></tr>
          <tr><td>5 h 00 min</td><td>7:07 min/km</td><td>8,4 km/h</td></tr>
          <tr><td>6 h 00 min</td><td>8:32 min/km</td><td>7,0 km/h</td></tr>
        </tbody>
      </table>
      <p>
        En el otro extremo está el <b>récord del mundo masculino</b>: <b>1 h 59 min 30 s</b>, de
        <b>Sabastian Sawe</b> en el maratón de Londres del 26 de abril de 2026, la primera vez que se
        baja de dos horas en competición
        (<a href="${WR_URL}" target="_blank" rel="noopener">World Athletics</a>). Son
        <b>2:50 min/km</b> durante 42 kilómetros seguidos, a <b>21,2 km/h</b>: el ritmo al que la
        mayoría de la gente corre 400 metros. En mujeres, el récord en carrera mixta es de
        <b>2 h 09 min 56 s</b> (Ruth Chepng'etich, Chicago 2024) y el de carrera solo femenina,
        <b>2 h 15 min 41 s</b> (Tigst Assefa, Londres 2026).
      </p>

      <h2>Las distancias de carrera, dibujadas</h2>
      <p>Pincha en cualquiera para verla a escala arriba, con centro en Madrid:</p>
      <table class="equiv-table">
        <thead><tr><th>Carrera</th><th>Distancia</th></tr></thead>
        <tbody>
          <tr><td>5K</td><td><a href="${dist('5', 12)}">5 km</a></td></tr>
          <tr><td>10K</td><td><a href="${dist('10', 11)}">10 km</a></td></tr>
          <tr><td>Media maratón</td><td><a href="${dist('21.0975', 10)}">21,0975 km</a></td></tr>
          <tr><td>Maratón</td><td><a href="${distUrl}">42,195 km</a></td></tr>
          <tr><td>100 km (ultramaratón)</td><td><a href="${dist('100', 8)}">100 km</a></td></tr>
        </tbody>
      </table>
      <p>
        Ojo: son radios en línea recta desde el centro del mapa, no rutas. Sirven para captar la
        magnitud —cuánto abarca un maratón sobre tu ciudad—, no para trazar el recorrido.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cuántos kilómetros tiene un maratón?</dt>
        <dd>Un maratón mide <a href="${distUrl}">42,195 kilómetros</a>: 42.195 metros, o 26 millas y
          385 yardas.</dd>

        <dt>¿Por qué el maratón mide 42,195 km y no 42 justos?</dt>
        <dd>Por el recorrido de los Juegos Olímpicos de Londres 1908: salía del jardín del castillo
          de Windsor y la última vuelta en el estadio de White City se recortó a 385 yardas para
          acabar frente al palco real, lo que dio 26 millas y 385 yardas. La IAAF adoptó esa
          distancia como oficial en 1921.</dd>

        <dt>¿Cuánto mide un medio maratón?</dt>
        <dd>21,0975 km, exactamente la mitad de un maratón. Suele redondearse a 21 km o 21,1 km.</dd>

        <dt>¿Cuánto se tarda en correr un maratón?</dt>
        <dd>La media mundial ronda las 4 horas y media (4 h 29 min según el análisis de RunRepeat con
          19,6 millones de resultados: 4 h 21 min los hombres y 4 h 49 min las mujeres). Bajar de
          3 horas se considera una marca de corredor avanzado.</dd>

        <dt>¿Cuál es el récord del mundo de maratón?</dt>
        <dd>1 h 59 min 30 s, de Sabastian Sawe en el maratón de Londres del 26 de abril de 2026: la
          primera vez que se bajó de dos horas en competición, a un ritmo de 2:50 min/km. En mujeres,
          2 h 09 min 56 s (Ruth Chepng'etich, Chicago 2024) en carrera mixta.</dd>

        <dt>¿Cuántos pasos son un maratón?</dt>
        <dd>Unos 56.000 pasos, con una zancada de 0,75 m; corriendo, la zancada es más larga
          (1-1,5 m), así que un maratón puede quedarse en 30.000-40.000 zancadas.</dd>
      </dl>
      <p>
        ¿Quieres seguir jugando con distancias? Mira <a href="/cuanto-son-10000-pasos/">cuántos
        kilómetros son 10.000 pasos</a>, <a href="/cuanto-es-una-milla-nautica/">cuánto es una milla
        náutica</a> o abre la <a href="/distancias/">herramienta de distancias</a> y dibuja la tuya.
        Y si lo tuyo son las superficies, tienes el <a href="/">Hectareómetro</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'es', key: 'maraton', ha: 0,
    family: 'distancias', published: '2026-08-04', modified: '2026-08-04',
    slug: 'cuanto-mide-un-maraton',
    path: MARATHON_ALTERNATES.es, alternates: MARATHON_ALTERNATES,
    dist: MARATHON_KM, distUnit: 'km',
    presetExtra: ' var PRESET_ZOOM = 9; var PRESET_LAT = 40.4168; var PRESET_LON = -3.7038;',
    title: '¿Cuántos kilómetros tiene un maratón y por qué 42,195? | Hectareómetro',
    description: 'Un maratón mide 42,195 km (26 millas y 385 yardas) y el medio maratón 21,0975 km. Por qué esa cifra tan rara, ritmos y tiempos, y el maratón dibujado a escala sobre tu ciudad.',
    h1: '¿Cuánto mide un maratón?',
    intro,
    question: '¿Cuánto mide un maratón?',
    answer: 'Un maratón mide 42,195 kilómetros, es decir 42.195 metros o 26 millas y 385 yardas. El medio maratón es exactamente la mitad: 21,0975 km.',
    faqs: [
      { q: '¿Cuántos kilómetros tiene un maratón?', a: 'Un maratón mide 42,195 kilómetros: 42.195 metros, o 26 millas y 385 yardas.' },
      { q: '¿Por qué el maratón mide 42,195 km y no 42 justos?', a: 'Por el recorrido de los Juegos Olímpicos de Londres 1908: salía del jardín del castillo de Windsor y la última vuelta en el estadio de White City se recortó a 385 yardas para acabar frente al palco real, lo que dio 26 millas y 385 yardas. La IAAF adoptó esa distancia como oficial en 1921.' },
      { q: '¿Cuánto mide un medio maratón?', a: '21,0975 km, exactamente la mitad de un maratón. Suele redondearse a 21 km o 21,1 km.' },
      { q: '¿Cuánto se tarda en correr un maratón?', a: 'La media mundial ronda las 4 horas y media (4 h 29 min según el análisis de RunRepeat con 19,6 millones de resultados: 4 h 21 min los hombres y 4 h 49 min las mujeres). Bajar de 3 horas se considera una marca de corredor avanzado.' },
      { q: '¿Cuál es el récord del mundo de maratón?', a: '1 h 59 min 30 s, de Sabastian Sawe en el maratón de Londres del 26 de abril de 2026: la primera vez que se bajó de dos horas en competición, a un ritmo de 2:50 min/km. En mujeres, 2 h 09 min 56 s (Ruth Chepng\'etich, Chicago 2024) en carrera mixta.' },
      { q: '¿Cuántos pasos son un maratón?', a: 'Unos 56.000 pasos, con una zancada de 0,75 m; corriendo, la zancada es más larga (1-1,5 m), así que un maratón puede quedarse en 30.000-40.000 zancadas.' },
    ],
    linkLabel: '¿Cuánto mide un maratón?',
  };
  }

  // English mirror (universal topic). Preset centred on London and expressed in
  // miles (26.2 mi is the iconic figure in English; the circle is the same
  // 42.195 km radius), which is also the en tool's default unit.
  const distUrl = '/en/distances/?d=26.2&u=mi&lat=51.5074&lon=-0.1278&z=9';
  const dist = (d, z) => `/en/distances/?d=${d}&u=mi&lat=51.5074&lon=-0.1278&z=${z}`;
  const intro = `      <p>
        A <b>marathon is 26.2 miles</b> — <b><a href="${distUrl}">26 miles and 385 yards</a></b>, to
        be exact, or <b>42.195 kilometres</b>. A <b>half marathon</b> is precisely half of that:
        <b><a href="${dist('13.11', 10)}">13.11 miles</a></b> (21.0975 km). The drawing above uses
        those 26.2 miles as a radius centred on London: drag the map to your own city to see how far
        you would get if you ran a marathon in a straight line.
      </p>
      <p>
        From central London, 26.2 miles as the crow flies lands you in <b>Guildford</b> (26.7 mi /
        43.0 km). That is the thing the drawing makes obvious: a marathon is not "a long race", it
        is crossing a whole county.
      </p>

      <h2>Why is a marathon 26.2 miles?</h2>
      <p>
        Because a royal family wanted to watch the start from its garden. It sounds like a joke, but
        that is essentially what happened.
      </p>
      <p>
        The first Olympic marathon, in <b>Athens 1896</b>, covered about <b>40 km</b> (25 miles) —
        the road from the town of Marathon to Athens, honouring the legend of the soldier who ran to
        announce the victory over the Persians. For two decades the distance was approximate and
        changed every Games: <b>Stockholm 1912</b> ran 40.2 km and <b>Antwerp 1920</b> ran 42.75 km.
      </p>
      <p>
        The figure we use today was born at <b>London 1908</b>. The organisers wanted the race to
        start at <b>Windsor Castle</b> — on the <i>East Lawn</i>, beside the private terrace, with
        Edward VII's permission, so the royal children could watch the start — and to finish inside
        <b>White City Stadium</b>. To bring the finish line <b>in front of the royal box</b>, the
        final lap of the track was cut to <b>385 yards</b> (352 m). The total: <b>26 miles and 385
        yards</b>, i.e. <b>42,195 metres</b>
        (<a href="${OLYMPIC_1908_URL}" target="_blank" rel="noopener">race records</a>).
      </p>
      <p>
        In <b>1921</b> the IAAF (now World Athletics) standardised the marathon and picked exactly
        the London 1908 distance. The minutes of that meeting <b>give no reason why</b>: it was
        simply adopted — which is how half the world came to run a distance set to line up with a
        grandstand.
      </p>
      <table class="equiv-table">
        <thead><tr><th>26.2 miles is…</th><th>Equal to</th></tr></thead>
        <tbody>
          <tr><td>In kilometres</td><td>42.195 km (42,195 m)</td></tr>
          <tr><td>In miles and yards</td><td>26 miles 385 yards</td></tr>
          <tr><td>In half marathons</td><td>2 (of 13.11 mi / 21.0975 km)</td></tr>
          <tr><td>In steps</td><td>about 56,000 (<a href="/en/how-far-is-10000-steps/">at a 0.75 m stride</a>)</td></tr>
          <tr><td>In nautical miles</td><td>22.8 (<a href="/en/how-long-is-a-nautical-mile/">of 1,852 m</a>)</td></tr>
        </tbody>
      </table>

      <h2>A curious detail about the 1908 course</h2>
      <p>
        In a straight line, Windsor Castle to White City Stadium is
        <b><a href="${dist('16.5', 10)}">16.5 miles</a></b> (26.5 km). The runners covered 26.2
        miles: the real course winds, as every city marathon does. That is the difference between the
        radius this tool draws and the miles actually run — and why no marathon reaches as far as it
        sounds. <a href="/en/measure-distance/">Trace a route point by point</a> if you want to
        measure an actual course.
      </p>

      <h2>Pace and finishing times</h2>
      <p>
        The worldwide average is around <b>4 hours 30 minutes</b>. The largest published analysis,
        covering <b>19.6 million results</b> from more than 32,000 races
        (<a href="${RUNREPEAT_URL}" target="_blank" rel="noopener">RunRepeat</a>), puts the average
        finish at <b>4:29:53</b> — <b>4:21:03</b> for men and <b>4:48:45</b> for women.
      </p>
      <table class="equiv-table">
        <thead><tr><th>Finish time</th><th>Pace</th><th>Speed</th></tr></thead>
        <tbody>
          <tr><td>3:00</td><td>6:52 min/mi (4:16 min/km)</td><td>8.7 mph</td></tr>
          <tr><td>3:30</td><td>8:01 min/mi (4:59 min/km)</td><td>7.5 mph</td></tr>
          <tr><td>4:00</td><td>9:09 min/mi (5:41 min/km)</td><td>6.6 mph</td></tr>
          <tr><td>4:30 (the average)</td><td>10:18 min/mi (6:24 min/km)</td><td>5.8 mph</td></tr>
          <tr><td>5:00</td><td>11:27 min/mi (7:07 min/km)</td><td>5.2 mph</td></tr>
          <tr><td>6:00</td><td>13:44 min/mi (8:32 min/km)</td><td>4.4 mph</td></tr>
        </tbody>
      </table>
      <p>
        At the other end sits the <b>men's world record</b>: <b>1:59:30</b>, set by <b>Sabastian
        Sawe</b> at the London Marathon on 26 April 2026 — the first sub-two-hour marathon in a race
        (<a href="${WR_URL}" target="_blank" rel="noopener">World Athletics</a>). That is
        <b>4:34 min/mi</b> (2:50 min/km) held for 26.2 miles, at <b>13.2 mph</b>: roughly the pace
        most people can hold for 400 metres. For women, the mixed-race record is <b>2:09:56</b>
        (Ruth Chepng'etich, Chicago 2024) and the women-only record <b>2:15:41</b> (Tigst Assefa,
        London 2026).
      </p>

      <h2>Race distances, drawn to scale</h2>
      <p>Click any of them to see it above, centred on London:</p>
      <table class="equiv-table">
        <thead><tr><th>Race</th><th>Distance</th></tr></thead>
        <tbody>
          <tr><td>5K</td><td><a href="${dist('3.11', 12)}">3.11 mi</a> (5 km)</td></tr>
          <tr><td>10K</td><td><a href="${dist('6.21', 11)}">6.21 mi</a> (10 km)</td></tr>
          <tr><td>Half marathon</td><td><a href="${dist('13.11', 10)}">13.11 mi</a> (21.0975 km)</td></tr>
          <tr><td>Marathon</td><td><a href="${distUrl}">26.2 mi</a> (42.195 km)</td></tr>
          <tr><td>100 km (ultramarathon)</td><td><a href="${dist('62.14', 8)}">62.14 mi</a> (100 km)</td></tr>
        </tbody>
      </table>
      <p>
        Bear in mind these are straight-line radii from the centre of the map, not routes. They are
        for grasping the scale — how much of your city a marathon spans — not for plotting a course.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How long is a marathon?</dt>
        <dd>A marathon is <a href="${distUrl}">26.2 miles</a>: 26 miles and 385 yards, or
          42.195 kilometres (42,195 m).</dd>

        <dt>Why is a marathon 26 miles and 385 yards?</dt>
        <dd>Because of the 1908 London Olympic course: it started on the lawn of Windsor Castle and
          the final lap inside White City Stadium was cut to 385 yards so the finish line sat in
          front of the royal box, giving 26 miles 385 yards. The IAAF made that distance official in
          1921.</dd>

        <dt>How long is a half marathon?</dt>
        <dd>13.11 miles (21.0975 km), exactly half a marathon. It is usually rounded to 13.1 miles or
          21 km.</dd>

        <dt>How long does it take to run a marathon?</dt>
        <dd>The worldwide average is about 4 hours 30 minutes (4:29:53 in RunRepeat's analysis of
          19.6 million results: 4:21:03 for men and 4:48:45 for women). Breaking 3 hours is
          considered an advanced-runner mark.</dd>

        <dt>What is the marathon world record?</dt>
        <dd>1:59:30, set by Sabastian Sawe at the London Marathon on 26 April 2026 — the first
          sub-two-hour marathon in a race, at 2:50 min/km (4:34 min/mi). For women, 2:09:56 (Ruth
          Chepng'etich, Chicago 2024) in a mixed race.</dd>

        <dt>How many steps are in a marathon?</dt>
        <dd>About 56,000 walking steps at a 0.75 m stride. Running strides are longer (1–1.5 m), so
          running a marathon can take 30,000–40,000 strides.</dd>
      </dl>
      <p>
        Want to keep playing with distances? See <a href="/en/how-far-is-10000-steps/">how far
        10,000 steps is</a>, <a href="/en/how-long-is-a-nautical-mile/">how long a nautical mile
        is</a>, or open the <a href="/en/distances/">distances tool</a> and draw your own. And if
        areas are more your thing, there is the <a href="/en/">Hectareometer</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'en', key: 'maraton', ha: 0,
    family: 'distancias', published: '2026-08-04', modified: '2026-08-04',
    slug: 'how-long-is-a-marathon',
    path: MARATHON_ALTERNATES.en, alternates: MARATHON_ALTERNATES,
    dist: 26.2, distUnit: 'mi',
    presetExtra: ' var PRESET_ZOOM = 9; var PRESET_LAT = 51.5074; var PRESET_LON = -0.1278;',
    title: 'How long is a marathon, and why 26.2 miles? | Hectareometer',
    description: 'A marathon is 26.2 miles — 26 miles 385 yards, or 42.195 km — and a half marathon 13.11 miles. Why that odd figure, pace and finishing times, drawn to scale on a map.',
    h1: 'How long is a marathon?',
    intro,
    question: 'How long is a marathon?',
    answer: 'A marathon is 26.2 miles: 26 miles and 385 yards, or 42.195 kilometres. A half marathon is exactly half of that, 13.11 miles (21.0975 km).',
    faqs: [
      { q: 'How long is a marathon?', a: 'A marathon is 26.2 miles: 26 miles and 385 yards, or 42.195 kilometres (42,195 m).' },
      { q: 'Why is a marathon 26 miles and 385 yards?', a: 'Because of the 1908 London Olympic course: it started on the lawn of Windsor Castle and the final lap inside White City Stadium was cut to 385 yards so the finish line sat in front of the royal box, giving 26 miles 385 yards. The IAAF made that distance official in 1921.' },
      { q: 'How long is a half marathon?', a: '13.11 miles (21.0975 km), exactly half a marathon. It is usually rounded to 13.1 miles or 21 km.' },
      { q: 'How long does it take to run a marathon?', a: "The worldwide average is about 4 hours 30 minutes (4:29:53 in RunRepeat's analysis of 19.6 million results: 4:21:03 for men and 4:48:45 for women). Breaking 3 hours is considered an advanced-runner mark." },
      { q: 'What is the marathon world record?', a: "1:59:30, set by Sabastian Sawe at the London Marathon on 26 April 2026 — the first sub-two-hour marathon in a race, at 2:50 min/km (4:34 min/mi). For women, 2:09:56 (Ruth Chepng'etich, Chicago 2024) in a mixed race." },
      { q: 'How many steps are in a marathon?', a: 'About 56,000 walking steps at a 0.75 m stride. Running strides are longer (1–1.5 m), so running a marathon can take 30,000–40,000 strides.' },
    ],
    linkLabel: 'How long is a marathon?',
  };
}

// ¿A qué distancia está el horizonte? Bilingual (universal topic).
// Data validated 2026-08-11 (web + computed here):
// · Geometric horizon: d = sqrt(2Rh) → with R = 6,371 km, d(km) = 3.57 × sqrt(h in m).
// · With standard atmospheric refraction the ray curves down, equivalent to an
//   Earth of radius 7R/6 → d(km) = 3.86 × sqrt(h in m), i.e. ~8 % farther.
//   Both are rough: good to a few per cent, more with thermal inversions.
//   Source: Andrew T. Young (SDSU), https://aty.sdsu.edu/explain/atmos_refr/horizon.html
// · Imperial form of the same rules: d(mi) = 1.22 × sqrt(h in ft) geometric,
//   1.32 × sqrt(h in ft) with refraction (= sqrt(7h/4), the classic sailor rule).
// · Curvature drop below the tangent line: 0.0785 m × d(km)² ≈ 8 cm at 1 km,
//   which in imperial is ~8 inches at 1 mile (0.67 ft × d(mi)²).
// · Longest photographed line of sight on Earth: Pic de Finestrelles (2,826 m,
//   Pyrenees) → Pic Gaspard (3,883 m, Écrins, Alps), 443 km, by Marc Bret at
//   dawn on 2016-07-16; recognised by Guinness World Records. Checked here with
//   haversine: 442.5 km. Pure geometry caps that pair at 3.57×(√2826+√3883) =
//   412 km, refraction raises the ceiling to 446 km — the shot only exists
//   because the air bends light.
//   Sources: https://en.wikipedia.org/wiki/Pic_de_Finestrelles ·
//   https://en.wikipedia.org/wiki/Pic_Gaspard ·
//   https://beyondhorizons.eu/2016/08/03/pic-de-finestrelles-pic-gaspard-ecrins-443-km/
// · Teide (3,715 m) to the west coast of Gran Canaria (Punta de Sardina):
//   93.5 km by haversine, well inside the 235 km + 5 km two-height limit.
const HORIZON_ALTERNATES = {
  es: '/a-que-distancia-esta-el-horizonte/',
  en: '/en/how-far-away-is-the-horizon/',
};

function horizonArticle(lang) {
  const es = lang === 'es';
  const YOUNG_URL = 'https://aty.sdsu.edu/explain/atmos_refr/horizon.html';
  const RECORD_URL = 'https://beyondhorizons.eu/2016/08/03/pic-de-finestrelles-pic-gaspard-ecrins-443-km/';

  if (es) {
  const distUrl = '/distancias/?d=4.7&u=km&lat=43.3183&lon=-1.9812&z=12';
  const dist = (d, z) => `/distancias/?d=${d}&u=km&lat=43.3183&lon=-1.9812&z=${z}`;
  const intro = `      <p>
        <b>El horizonte está a unos 4,7 kilómetros</b> cuando miras el mar de pie en la playa, con
        los ojos a 1,70 m sobre la arena. Contando la refracción del aire —que curva la luz y deja
        ver un poco más lejos— son unos <b><a href="${distUrl}">5 kilómetros</a></b>. Es un paseo de
        una hora: el borde del mundo visible está mucho más cerca de lo que parece.
      </p>
      <p>
        El círculo de arriba dibuja esos 4,7 km desde la playa de La Concha, en Donostia. Arrastra el
        mapa hasta tu playa, tu ventana o tu montaña para ver hasta dónde llega tu horizonte.
      </p>

      <h2>La fórmula de la distancia al horizonte</h2>
      <p>
        Solo depende de una cosa: <b>lo alto que tengas los ojos</b>. Con la altura <i>h</i> en
        metros, la distancia al horizonte en kilómetros es:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Fórmula</th><th>Qué calcula</th><th>Ojos a 1,70 m</th></tr></thead>
        <tbody>
          <tr><td><b>d ≈ 3,57 × √h</b></td><td>Horizonte geométrico (Tierra pelada, sin aire)</td><td>4,7 km</td></tr>
          <tr><td><b>d ≈ 3,86 × √h</b></td><td>Horizonte real, con la refracción atmosférica normal</td><td>5,0 km</td></tr>
        </tbody>
      </table>
      <p>
        La primera sale de Pitágoras: la línea que va de tus ojos al punto donde la vista roza la
        Tierra es tangente a la esfera, así que mide √(2·R·h), con <b>R = 6.371 km</b> de radio
        terrestre. Haciendo la cuenta, √(2 × 6.371.000) = 3.569, de ahí el <b>3,57</b>.
      </p>
      <p>
        La segunda añade el aire. La atmósfera es más densa abajo que arriba, así que los rayos de
        luz se curvan ligeramente <b>hacia el suelo</b> y siguen un poco la curvatura del planeta:
        ves algo más lejos de lo que la geometría permitiría. En condiciones normales equivale a una
        Tierra con un radio 7/6 del real, un <b>8 % más de alcance</b>
        (<a href="${YOUNG_URL}" target="_blank" rel="noopener">Andrew T. Young, SDSU</a>). Con
        inversiones térmicas sobre el mar el efecto se dispara, y por eso a veces aparecen espejismos
        de costas o barcos que «deberían» estar ocultos.
      </p>

      <h2>Tabla: a qué distancia está el horizonte según la altura</h2>
      <table class="equiv-table">
        <thead><tr><th>Desde dónde miras</th><th>Altura de los ojos</th><th>Horizonte (geométrico)</th><th>Con refracción</th></tr></thead>
        <tbody>
          <tr><td>Tumbado en la toalla</td><td>0,2 m</td><td>1,6 km</td><td>1,7 km</td></tr>
          <tr><td>De pie en la playa</td><td>1,70 m</td><td><a href="${distUrl}">4,7 km</a></td><td>5,0 km</td></tr>
          <tr><td>En el paseo marítimo o una duna</td><td>5 m</td><td>8,0 km</td><td>8,6 km</td></tr>
          <tr><td>Torre de vigilancia</td><td>10 m</td><td>11,3 km</td><td>12,2 km</td></tr>
          <tr><td>Un décimo piso</td><td>30 m</td><td>19,6 km</td><td><a href="${dist('21.1', 10)}">21,1 km</a></td></tr>
          <tr><td>Un faro</td><td>50 m</td><td>25,2 km</td><td>27,3 km</td></tr>
          <tr><td>Un acantilado</td><td>100 m</td><td>35,7 km</td><td><a href="${dist('38.6', 9)}">38,6 km</a></td></tr>
          <tr><td>Un rascacielos</td><td>250 m</td><td>56,4 km</td><td>61,0 km</td></tr>
          <tr><td>Un monte costero</td><td>500 m</td><td>79,8 km</td><td>86,3 km</td></tr>
          <tr><td>La cima del Teide</td><td>3.715 m</td><td>217,6 km</td><td><a href="${dist('235', 7)}">235,3 km</a></td></tr>
          <tr><td>Un avión de línea</td><td>10.000 m</td><td>357 km</td><td><a href="${dist('386', 6)}">386 km</a></td></tr>
        </tbody>
      </table>
      <p>
        Desde la Estación Espacial Internacional, a 400 km, el horizonte se va a unos
        <b>2.300 km</b>: la mitad de Europa de un vistazo. A esas alturas la fórmula corta ya no
        vale y hay que usar la completa, √(h² + 2·R·h).
      </p>

      <h2>Para ver el doble de lejos hay que subir cuatro veces más</h2>
      <p>
        La raíz cuadrada de la fórmula es la clave y explica lo que todo el mundo nota en la playa:
        <b>ponerse de puntillas no sirve de nada</b>. Como la distancia crece con la raíz de la
        altura, para duplicar tu horizonte necesitas <b>cuadruplicar</b> tu altura sobre el suelo.
      </p>
      <p>
        De los 1,70 m de tus ojos a los 6,80 m de un segundo piso, el horizonte pasa de 5,0 a
        10,1 km. Para verlo al doble otra vez habría que subir a 27 m, y otra vez, a 109 m. Por eso
        los faros se construyen altos y en promontorios, y por eso hace falta un avión para que el
        horizonte se vaya a cientos de kilómetros.
      </p>

      <h2>Por qué se ven montañas a 100 km pero no la costa</h2>
      <p>
        Porque el horizonte no es una pared: es el punto donde tu línea de visión roza el suelo. Todo
        lo que esté <b>más alto</b> que ese punto de roce vuelve a asomar por detrás. Para saber si
        dos cosas se ven entre sí se suman los dos horizontes:
      </p>
      <p>
        <b>d ≈ 3,86 × (√h₁ + √h₂)</b>, con las dos alturas en metros y el resultado en kilómetros.
      </p>
      <p>
        De pie en la playa (5,0 km) puedes ver la cumbre de un monte de 500 m (86,3 km) que esté
        hasta a <b>91 km</b>, aunque su pueblo, al nivel del mar, lleve ochenta kilómetros oculto.
        Es exactamente lo que pasa en Canarias: el <b>Teide</b> (3.715 m) se ve desde la costa oeste
        de Gran Canaria, a <b>93 km</b>, mientras que la playa de enfrente es invisible.
      </p>
      <p>
        El caso extremo es el <b>récord mundial de línea de visión fotografiada</b>: 443 kilómetros
        entre el <b>Pic de Finestrelles</b> (2.826 m, Pirineos) y el <b>Pic Gaspard</b> (3.883 m, en
        los Écrins alpinos), que Marc Bret fotografió al amanecer del 16 de julio de 2016
        (<a href="${RECORD_URL}" target="_blank" rel="noopener">Beyond Horizons</a>). Y aquí está lo
        bonito: la geometría pura da para esa pareja de montañas un máximo de <b>412 km</b>. La foto
        no debería existir. Con la refracción, el techo sube a <b>446 km</b>. Esos 443 km solo son
        posibles porque el aire curva la luz.
      </p>

      <h2>Cuánto se hunde lo que está más allá del horizonte</h2>
      <p>
        Otra forma de mirarlo: cuánto «cae» la superficie de la Tierra respecto a tu línea de visión.
        La caída en metros es <b>0,0785 × d²</b>, con la distancia en kilómetros:
      </p>
      <table class="equiv-table">
        <thead><tr><th>A esta distancia…</th><th>La Tierra se hunde</th></tr></thead>
        <tbody>
          <tr><td>1 km</td><td>8 cm</td></tr>
          <tr><td>5 km</td><td>2,0 m</td></tr>
          <tr><td>10 km</td><td>7,8 m</td></tr>
          <tr><td>20 km</td><td>31 m</td></tr>
          <tr><td>50 km</td><td>196 m</td></tr>
        </tbody>
      </table>
      <p>
        De ahí el clásico del barco que se aleja y <b>desaparece por abajo</b>, casco primero y
        mástil al final. Para alguien de pie en la playa, un velero con el mástil a 10 m sigue siendo
        visible —solo el mástil— hasta unos <b>17 km</b>, más del triple de lo que llega tu
        horizonte. En millas la regla es igual de redonda: la caída son <b>8 pulgadas por milla al
        cuadrado</b>.
      </p>

      <h2>Dibuja tu horizonte</h2>
      <p>Pincha en cualquiera para verlo a escala arriba, con centro en La Concha:</p>
      <table class="equiv-table">
        <thead><tr><th>Mirando desde</th><th>Horizonte</th></tr></thead>
        <tbody>
          <tr><td>La playa (1,70 m)</td><td><a href="${distUrl}">4,7 km</a></td></tr>
          <tr><td>Un décimo piso (30 m)</td><td><a href="${dist('21.1', 10)}">21,1 km</a></td></tr>
          <tr><td>Un acantilado (100 m)</td><td><a href="${dist('38.6', 9)}">38,6 km</a></td></tr>
          <tr><td>El Teide (3.715 m)</td><td><a href="${dist('235', 7)}">235 km</a></td></tr>
          <tr><td>Un avión (10.000 m)</td><td><a href="${dist('386', 6)}">386 km</a></td></tr>
        </tbody>
      </table>
      <p>
        El círculo es el radio en línea recta desde el centro del mapa, así que dibuja justo tu
        horizonte: todo lo que queda dentro está, en teoría, a la vista. Si lo que quieres es medir
        la distancia entre dos puntos concretos —tu ventana y esa montaña—, usa la herramienta de
        <a href="/medir-distancias/">medir distancias</a>.
      </p>

      <h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿A qué distancia está el horizonte?</dt>
        <dd>Para una persona de pie en la playa, con los ojos a 1,70 m del suelo, el horizonte está a
          <a href="${distUrl}">4,7 km</a> por geometría pura y a unos 5 km contando la refracción del
          aire. Cuanto más alto mires, más lejos: 21 km desde un décimo piso, 386 km desde un avión.</dd>

        <dt>¿Cuál es la fórmula para calcular la distancia al horizonte?</dt>
        <dd>d ≈ 3,57 × √h, con la altura de los ojos h en metros y la distancia d en kilómetros. Sale
          de la tangente a una esfera de 6.371 km de radio. Si se cuenta la refracción atmosférica
          normal, la constante sube a 3,86 (un 8 % más lejos).</dd>

        <dt>¿Por qué se ve más lejos desde un sitio alto?</dt>
        <dd>Porque el horizonte es el punto donde tu línea de visión roza la superficie curva de la
          Tierra, y cuanto más alto estés, más tarda en rozarla. Ojo: crece con la raíz cuadrada de
          la altura, así que para ver el doble de lejos hay que subir cuatro veces más alto.</dd>

        <dt>¿Hasta dónde se ve desde un avión?</dt>
        <dd>A la altitud de crucero de un avión de línea, unos 10.000 metros, el horizonte está a
          unos 386 km (357 km sin contar la refracción). Desde la Estación Espacial Internacional, a
          400 km de altura, se va hasta unos 2.300 km.</dd>

        <dt>¿Por qué se ven montañas mucho más lejos que el horizonte?</dt>
        <dd>Porque lo que sobresale por encima del punto de roce vuelve a asomar. Sumando los dos
          horizontes, d ≈ 3,86 × (√h₁ + √h₂), un monte de 500 m se ve desde la playa a 91 km, y el
          Teide (3.715 m) se ve desde Gran Canaria, a 93 km, aunque la costa de enfrente esté oculta.
          El récord fotografiado son 443 km, del Pic de Finestrelles al Pic Gaspard.</dd>

        <dt>¿Por qué los barcos desaparecen por abajo?</dt>
        <dd>Porque la superficie del mar se hunde respecto a tu línea de visión: unos 0,0785 × d²
          metros, con d en kilómetros. Primero se pierde el casco y al final el mástil; un velero con
          el mástil a 10 m sigue asomando hasta unos 17 km, aunque tu horizonte esté a 5.</dd>
      </dl>
      <p>
        ¿Quieres seguir jugando con distancias? Mira <a href="/cuanto-es-una-milla-nautica/">cuánto es
        una milla náutica</a>, <a href="/cuanto-mide-un-maraton/">cuánto mide un maratón</a> o abre la
        <a href="/distancias/">herramienta de distancias</a> y dibuja la tuya. Y si lo tuyo son las
        superficies, tienes el <a href="/">Hectareómetro</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'es', key: 'horizonte', ha: 0,
    family: 'distancias', published: '2026-08-11', modified: '2026-08-11',
    slug: 'a-que-distancia-esta-el-horizonte',
    path: HORIZON_ALTERNATES.es, alternates: HORIZON_ALTERNATES,
    dist: 4.7, distUnit: 'km',
    presetExtra: ' var PRESET_ZOOM = 12; var PRESET_LAT = 43.3183; var PRESET_LON = -1.9812;',
    title: '¿A qué distancia está el horizonte? La fórmula y un mapa | Hectareómetro',
    description: 'Desde la playa el horizonte está a solo 4,7 km. La fórmula (3,57 × raíz de la altura), la tabla por alturas, por qué se ven montañas a 100 km y tu horizonte dibujado a escala en un mapa.',
    h1: '¿A qué distancia está el horizonte?',
    intro,
    question: '¿A qué distancia está el horizonte?',
    answer: 'Para una persona de pie en la playa, con los ojos a 1,70 m del suelo, el horizonte está a 4,7 km por geometría pura y a unos 5 km contando la refracción del aire. La fórmula es d ≈ 3,57 × √h, con la altura de los ojos en metros.',
    faqs: [
      { q: '¿A qué distancia está el horizonte?', a: 'Para una persona de pie en la playa, con los ojos a 1,70 m del suelo, el horizonte está a 4,7 km por geometría pura y a unos 5 km contando la refracción del aire. Cuanto más alto mires, más lejos: 21 km desde un décimo piso, 386 km desde un avión.' },
      { q: '¿Cuál es la fórmula para calcular la distancia al horizonte?', a: 'd ≈ 3,57 × √h, con la altura de los ojos h en metros y la distancia d en kilómetros. Sale de la tangente a una esfera de 6.371 km de radio. Si se cuenta la refracción atmosférica normal, la constante sube a 3,86 (un 8 % más lejos).' },
      { q: '¿Por qué se ve más lejos desde un sitio alto?', a: 'Porque el horizonte es el punto donde tu línea de visión roza la superficie curva de la Tierra, y cuanto más alto estés, más tarda en rozarla. Crece con la raíz cuadrada de la altura, así que para ver el doble de lejos hay que subir cuatro veces más alto.' },
      { q: '¿Hasta dónde se ve desde un avión?', a: 'A la altitud de crucero de un avión de línea, unos 10.000 metros, el horizonte está a unos 386 km (357 km sin contar la refracción). Desde la Estación Espacial Internacional, a 400 km de altura, se va hasta unos 2.300 km.' },
      { q: '¿Por qué se ven montañas mucho más lejos que el horizonte?', a: 'Porque lo que sobresale por encima del punto de roce vuelve a asomar. Sumando los dos horizontes, d ≈ 3,86 × (√h₁ + √h₂), un monte de 500 m se ve desde la playa a 91 km, y el Teide (3.715 m) se ve desde Gran Canaria, a 93 km, aunque la costa de enfrente esté oculta. El récord fotografiado son 443 km, del Pic de Finestrelles al Pic Gaspard.' },
      { q: '¿Por qué los barcos desaparecen por abajo?', a: 'Porque la superficie del mar se hunde respecto a tu línea de visión: unos 0,0785 × d² metros, con d en kilómetros. Primero se pierde el casco y al final el mástil; un velero con el mástil a 10 m sigue asomando hasta unos 17 km, aunque tu horizonte esté a 5.' },
    ],
    linkLabel: '¿A qué distancia está el horizonte?',
  };
  }

  // English mirror (universal topic). Preset centred on Brighton beach and
  // expressed in miles, the en tool's default unit: 2.9 mi is the same 4.7 km.
  const distUrl = '/en/distances/?d=2.9&u=mi&lat=50.8198&lon=-0.1372&z=12';
  const dist = (d, z) => `/en/distances/?d=${d}&u=mi&lat=50.8198&lon=-0.1372&z=${z}`;
  const intro = `      <p>
        <b>The horizon is about 3 miles away</b> — <b><a href="${distUrl}">2.9 miles</a></b>, or
        4.7 km — when you stand on a beach with your eyes 5 ft 7 in (1.70 m) above the sand. Counting
        the refraction of the air, which bends light and lets you see slightly farther, it is closer
        to 3.1 miles (5 km). That is an hour's walk: the edge of the visible world is far nearer than
        it looks.
      </p>
      <p>
        The circle above draws those 2.9 miles from Brighton beach. Drag the map to your own beach,
        window or hilltop to see how far your horizon reaches.
      </p>

      <h2>The horizon distance formula</h2>
      <p>
        It depends on one thing only: <b>how high your eyes are</b>. With the height <i>h</i>, the
        distance to the horizon is:
      </p>
      <table class="equiv-table">
        <thead><tr><th>Formula</th><th>What it gives</th><th>Eyes at 5 ft 7 in</th></tr></thead>
        <tbody>
          <tr><td><b>d ≈ 1.22 × √h</b> (miles, h in feet)<br><b>d ≈ 3.57 × √h</b> (km, h in metres)</td><td>Geometric horizon (bare Earth, no air)</td><td>2.9 mi / 4.7 km</td></tr>
          <tr><td><b>d ≈ 1.32 × √h</b> (miles, h in feet)<br><b>d ≈ 3.86 × √h</b> (km, h in metres)</td><td>Real horizon, with normal atmospheric refraction</td><td>3.1 mi / 5.0 km</td></tr>
        </tbody>
      </table>
      <p>
        The first comes straight from Pythagoras: the line from your eyes to the point where your
        sight grazes the ground is tangent to the sphere, so it measures √(2·R·h) with
        <b>R = 6,371 km</b>, the Earth's radius. Run the numbers and √(2 × 6,371,000) = 3,569 —
        hence the <b>3.57</b>. Sailors know the imperial version as √(7h/4).
      </p>
      <p>
        The second adds the air. The atmosphere is denser at the bottom than at the top, so light
        rays bend slightly <b>downwards</b> and follow the curve of the planet a little: you see
        farther than geometry allows. Under normal conditions it works out as an Earth with 7/6 of
        the real radius, <b>about 8 % more reach</b>
        (<a href="${YOUNG_URL}" target="_blank" rel="noopener">Andrew T. Young, SDSU</a>). Over the
        sea, temperature inversions can push it much further — which is why coastlines and ships that
        "should" be hidden sometimes appear as mirages.
      </p>

      <h2>How far is the horizon, by height</h2>
      <table class="equiv-table">
        <thead><tr><th>Where you are looking from</th><th>Eye height</th><th>Horizon (geometric)</th><th>With refraction</th></tr></thead>
        <tbody>
          <tr><td>Lying on your towel</td><td>8 in (0.2 m)</td><td>1.0 mi (1.6 km)</td><td>1.1 mi (1.7 km)</td></tr>
          <tr><td>Standing on the beach</td><td>5 ft 7 in (1.70 m)</td><td><a href="${distUrl}">2.9 mi</a> (4.7 km)</td><td>3.1 mi (5.0 km)</td></tr>
          <tr><td>Seafront promenade or a dune</td><td>16 ft (5 m)</td><td>5.0 mi (8.0 km)</td><td>5.4 mi (8.6 km)</td></tr>
          <tr><td>A lookout tower</td><td>33 ft (10 m)</td><td>7.0 mi (11.3 km)</td><td>7.6 mi (12.2 km)</td></tr>
          <tr><td>A tenth-floor window</td><td>98 ft (30 m)</td><td>12.2 mi (19.6 km)</td><td><a href="${dist('13.1', 10)}">13.1 mi</a> (21.1 km)</td></tr>
          <tr><td>A lighthouse</td><td>164 ft (50 m)</td><td>15.7 mi (25.2 km)</td><td>17.0 mi (27.3 km)</td></tr>
          <tr><td>A cliff top</td><td>328 ft (100 m)</td><td>22.2 mi (35.7 km)</td><td><a href="${dist('24', 9)}">24.0 mi</a> (38.6 km)</td></tr>
          <tr><td>A skyscraper</td><td>820 ft (250 m)</td><td>35.1 mi (56.4 km)</td><td>37.9 mi (61.0 km)</td></tr>
          <tr><td>A coastal hill</td><td>1,640 ft (500 m)</td><td>49.6 mi (79.8 km)</td><td>53.6 mi (86.3 km)</td></tr>
          <tr><td>The summit of Ben Nevis</td><td>4,413 ft (1,345 m)</td><td>81.4 mi (130.9 km)</td><td><a href="${dist('88', 8)}">88.0 mi</a> (141.6 km)</td></tr>
          <tr><td>A cruising airliner</td><td>32,808 ft (10,000 m)</td><td>221.8 mi (357 km)</td><td><a href="${dist('240', 6)}">239.8 mi</a> (386 km)</td></tr>
        </tbody>
      </table>
      <p>
        From the International Space Station, 250 miles (400 km) up, the horizon runs out to about
        <b>1,425 miles</b> (2,300 km): half of Europe in one glance. That high the short formula
        breaks down and you need the full one, √(h² + 2·R·h).
      </p>

      <h2>To see twice as far, you must climb four times higher</h2>
      <p>
        The square root in the formula is the whole story, and it explains what everyone notices on a
        beach: <b>standing on tiptoe achieves nothing</b>. Because distance grows with the square
        root of height, doubling your horizon means <b>quadrupling</b> your height above the ground.
      </p>
      <p>
        Going from eye level (5 ft 7 in) to a second-floor window (22 ft) takes the horizon from
        3.1 to 6.3 miles. Doubling it again means climbing to 89 ft, and again, to 357 ft. That is
        why lighthouses are built tall and on headlands, and why it takes an aircraft to push the
        horizon out to hundreds of miles.
      </p>

      <h2>Why you can see mountains 60 miles away but not the coast</h2>
      <p>
        Because the horizon is not a wall: it is the point where your line of sight grazes the
        ground. Anything <b>taller</b> than that grazing point pops back into view behind it. To know
        whether two things can see each other, add their two horizons:
      </p>
      <p>
        <b>d ≈ 1.32 × (√h₁ + √h₂)</b> in miles and feet, or <b>3.86 × (√h₁ + √h₂)</b> in kilometres
        and metres.
      </p>
      <p>
        Standing on the beach (3.1 mi of horizon) you can see the top of a 1,640 ft hill (53.6 mi of
        horizon) up to <b>57 miles</b> (91 km) away — while the village at its foot, at sea level,
        has been hidden for the last fifty miles.
      </p>
      <p>
        The extreme case is the <b>world record for the longest photographed line of sight</b>:
        443 km (275 miles) from <b>Pic de Finestrelles</b> (2,826 m, in the Pyrenees) to <b>Pic
        Gaspard</b> (3,883 m, in the Écrins in the Alps), shot by Marc Bret at dawn on 16 July 2016
        (<a href="${RECORD_URL}" target="_blank" rel="noopener">Beyond Horizons</a>). Here is the
        lovely part: pure geometry caps that pair of mountains at <b>412 km</b>. The photograph
        should not exist. With refraction the ceiling rises to <b>446 km</b>. Those 443 km are only
        possible because the air bends light.
      </p>

      <h2>How far the world drops away beyond the horizon</h2>
      <p>
        Another way to look at it: how far the Earth's surface falls below your line of sight. The
        drop is <b>8 inches × d²</b> with the distance in miles (0.0785 m × d² in kilometres):
      </p>
      <table class="equiv-table">
        <thead><tr><th>At this distance…</th><th>The Earth drops by</th></tr></thead>
        <tbody>
          <tr><td>1 mile (1.6 km)</td><td>8 in (20 cm)</td></tr>
          <tr><td>3 miles (4.8 km)</td><td>6 ft (1.8 m)</td></tr>
          <tr><td>6 miles (9.7 km)</td><td>24 ft (7.3 m)</td></tr>
          <tr><td>12 miles (19.3 km)</td><td>96 ft (29 m)</td></tr>
          <tr><td>30 miles (48 km)</td><td>600 ft (183 m)</td></tr>
        </tbody>
      </table>
      <p>
        Hence the classic sight of a ship sailing away and <b>disappearing from the bottom up</b>,
        hull first and mast last. For someone standing on the beach, a yacht with a 33 ft mast is
        still visible — the mast alone — out to about <b>10.7 miles</b> (17 km), more than three
        times as far as your own horizon.
      </p>

      <h2>Draw your horizon</h2>
      <p>Click any of them to see it above, centred on Brighton:</p>
      <table class="equiv-table">
        <thead><tr><th>Looking from</th><th>Horizon</th></tr></thead>
        <tbody>
          <tr><td>The beach (5 ft 7 in)</td><td><a href="${distUrl}">2.9 mi</a> (4.7 km)</td></tr>
          <tr><td>A tenth-floor window (98 ft)</td><td><a href="${dist('13.1', 10)}">13.1 mi</a> (21.1 km)</td></tr>
          <tr><td>A cliff top (328 ft)</td><td><a href="${dist('24', 9)}">24 mi</a> (38.6 km)</td></tr>
          <tr><td>Ben Nevis (4,413 ft)</td><td><a href="${dist('88', 8)}">88 mi</a> (141.6 km)</td></tr>
          <tr><td>An airliner (32,808 ft)</td><td><a href="${dist('240', 6)}">240 mi</a> (386 km)</td></tr>
        </tbody>
      </table>
      <p>
        The circle is a straight-line radius from the centre of the map, so it draws exactly your
        horizon: everything inside it is, in theory, in view. If what you want is the distance
        between two specific points — your window and that mountain — use the
        <a href="/en/measure-distance/">measure a distance</a> tool.
      </p>

      <h2>Frequently asked questions</h2>
      <dl class="faq">
        <dt>How far away is the horizon?</dt>
        <dd>For a person standing on a beach, with their eyes 5 ft 7 in (1.70 m) above the ground,
          the horizon is <a href="${distUrl}">2.9 miles</a> (4.7 km) away by pure geometry, or about
          3.1 miles (5 km) counting the refraction of the air. The higher you look from, the farther
          it goes: 13 miles from a tenth-floor window, 240 miles from an airliner.</dd>

        <dt>What is the formula for the distance to the horizon?</dt>
        <dd>d ≈ 1.22 × √h with the eye height in feet and the distance in miles, or d ≈ 3.57 × √h in
          metres and kilometres. It is the tangent to a sphere of radius 6,371 km. Counting normal
          atmospheric refraction the constants rise to 1.32 and 3.86 — about 8 % farther.</dd>

        <dt>Why can you see farther from higher up?</dt>
        <dd>Because the horizon is the point where your line of sight grazes the curved surface of
          the Earth, and the higher you are, the longer it takes to graze it. It grows with the
          square root of height, so seeing twice as far means climbing four times higher.</dd>

        <dt>How far can you see from a plane?</dt>
        <dd>At an airliner's cruising altitude, around 33,000 ft (10,000 m), the horizon is about
          240 miles (386 km) away — 222 miles without refraction. From the International Space
          Station, 250 miles up, it reaches about 1,425 miles (2,300 km).</dd>

        <dt>Why can you see mountains much farther than the horizon?</dt>
        <dd>Because anything that rises above the grazing point comes back into view. Adding the two
          horizons, d ≈ 1.32 × (√h₁ + √h₂) in feet and miles, a 1,640 ft hill is visible from the
          beach at 57 miles. The photographed record is 443 km (275 miles), from Pic de Finestrelles
          in the Pyrenees to Pic Gaspard in the Alps.</dd>

        <dt>Why do ships disappear from the bottom up?</dt>
        <dd>Because the sea surface drops away from your line of sight by roughly 8 inches times the
          distance in miles squared. The hull goes first and the mast last: a yacht with a 33 ft mast
          still shows above the water out to about 10.7 miles, even though your own horizon is only
          3 miles away.</dd>
      </dl>
      <p>
        Want to keep playing with distances? See <a href="/en/how-long-is-a-nautical-mile/">how long
        a nautical mile is</a>, <a href="/en/how-long-is-a-marathon/">how long a marathon is</a>, or
        open the <a href="/en/distances/">distances tool</a> and draw your own. And if areas are more
        your thing, there is the <a href="/en/">Hectareometer</a>.
      </p>`;
  return {
    section: 'distancias', lang: 'en', key: 'horizonte', ha: 0,
    family: 'distancias', published: '2026-08-11', modified: '2026-08-11',
    slug: 'how-far-away-is-the-horizon',
    path: HORIZON_ALTERNATES.en, alternates: HORIZON_ALTERNATES,
    dist: 2.9, distUnit: 'mi',
    presetExtra: ' var PRESET_ZOOM = 12; var PRESET_LAT = 50.8198; var PRESET_LON = -0.1372;',
    title: 'How far away is the horizon? The formula and a map | Hectareometer',
    description: 'From the beach the horizon is only 2.9 miles (4.7 km) away. The formula (1.22 × the square root of your height), a table by height, why mountains show up 60 miles out, and your horizon drawn to scale on a map.',
    h1: 'How far away is the horizon?',
    intro,
    question: 'How far away is the horizon?',
    answer: 'For a person standing on a beach, with their eyes 5 ft 7 in (1.70 m) above the ground, the horizon is 2.9 miles (4.7 km) away by pure geometry, or about 3.1 miles (5 km) counting refraction. The formula is d ≈ 1.22 × √h with the eye height in feet.',
    faqs: [
      { q: 'How far away is the horizon?', a: 'For a person standing on a beach, with their eyes 5 ft 7 in (1.70 m) above the ground, the horizon is 2.9 miles (4.7 km) away by pure geometry, or about 3.1 miles (5 km) counting the refraction of the air. The higher you look from, the farther it goes: 13 miles from a tenth-floor window, 240 miles from an airliner.' },
      { q: 'What is the formula for the distance to the horizon?', a: 'd ≈ 1.22 × √h with the eye height in feet and the distance in miles, or d ≈ 3.57 × √h in metres and kilometres. It is the tangent to a sphere of radius 6,371 km. Counting normal atmospheric refraction the constants rise to 1.32 and 3.86 — about 8 % farther.' },
      { q: 'Why can you see farther from higher up?', a: 'Because the horizon is the point where your line of sight grazes the curved surface of the Earth, and the higher you are, the longer it takes to graze it. It grows with the square root of height, so seeing twice as far means climbing four times higher.' },
      { q: 'How far can you see from a plane?', a: "At an airliner's cruising altitude, around 33,000 ft (10,000 m), the horizon is about 240 miles (386 km) away — 222 miles without refraction. From the International Space Station, 250 miles up, it reaches about 1,425 miles (2,300 km)." },
      { q: 'Why can you see mountains much farther than the horizon?', a: 'Because anything that rises above the grazing point comes back into view. Adding the two horizons, d ≈ 1.32 × (√h₁ + √h₂) in feet and miles, a 1,640 ft hill is visible from the beach at 57 miles. The photographed record is 443 km (275 miles), from Pic de Finestrelles in the Pyrenees to Pic Gaspard in the Alps.' },
      { q: 'Why do ships disappear from the bottom up?', a: 'Because the sea surface drops away from your line of sight by roughly 8 inches times the distance in miles squared. The hull goes first and the mast last: a yacht with a 33 ft mast still shows above the water out to about 10.7 miles, even though your own horizon is only 3 miles away.' },
    ],
    linkLabel: 'How far away is the horizon?',
  };
}

const DIST_ARTICLES = [
  tenThousandStepsArticle('es'), tenThousandStepsArticle('en'),
  nauticalMileArticle('es'), nauticalMileArticle('en'),
  marathonArticle('es'), marathonArticle('en'),
  horizonArticle('es'), horizonArticle('en'),
];

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
      faqs: [
        { q: h1, a: answer },
        {
          q: `¿Cuántas libras ${verb} ${noun}?`,
          a: `Unas ${lbText} libras. Un kilo equivale a 2,205 libras, y una libra a 0,454 kilos.`,
        },
        ...(k >= 1000 ? [{
          q: `¿Cuántas toneladas ${verb} ${noun}?`,
          a: `${tText} toneladas. Una tonelada métrica son 1.000 kilos.`,
        }] : []),
      ],
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
    faqs: [
      { q: h1, a: answer },
      {
        q: `How many pounds is ${noun}?`,
        a: `About ${lbText} pounds. One kilo is 2.205 pounds, and one pound is 0.454 kilos.`,
      },
      ...(k >= 1000 ? [{
        q: `How many tonnes is ${noun}?`,
        a: `${tText} tonnes. One metric tonne is 1,000 kilos.`,
      }] : []),
    ],
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

// THE single source of a page's FAQ. Both the FAQPage JSON-LD and the visible
// <dl class="faq"> are built from this list, so they cannot drift apart — which
// is exactly what had happened: every quantity landing shipped FAQPage markup
// with a question that appeared nowhere on the page. Pages may carry a `faqs`
// array ([{ q, a }, ...]); otherwise their single question/answer is used.
// The strings are PLAIN TEXT (no HTML): they go verbatim into the JSON-LD.
function faqsFor(page) {
  return page.faqs || [{ q: page.question, a: page.answer }];
}

// Visible FAQ block for the quantity landings. Editorial articles (page.path)
// hand-write their <dl class="faq"> inside `intro`, with links inside, so they
// are skipped here and keep owning their own markup.
function faqBlockHtml(page) {
  if (page.path) return '';
  const faqs = faqsFor(page).filter(f => f && f.q && f.a);
  if (!faqs.length) return '';
  const items = faqs
    .map(f => `        <dt>${escapeHtml(f.q)}</dt>\n        <dd>${escapeHtml(f.a)}</dd>`)
    .join('\n\n');
  return `
      <h2>${UI[page.lang].faqHeading}</h2>
      <dl class="faq">
${items}
      </dl>
`;
}

function buildJsonLd(page, canonical, breadcrumbItems) {
  const faqs = faqsFor(page);
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
    FAQ_BLOCK: faqBlockHtml(page),
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

// ---- sitemap <lastmod> ----------------------------------------------------
//
// A lastmod is only worth having if it is accurate: Google ignores the dates of
// sitemaps where every URL changes on every deploy. Two things would fake that
// here — regenerating rewrites all 100+ pages whether or not they changed, and
// publishing one article rewrites the related-articles block of dozens more.
// Neither is a reason to recrawl.
//
// So the date does not come from file mtimes or from git. Each URL gets a
// fingerprint of ITS OWN content (title, description, h1, intro, FAQ, the map
// preset) and the date only moves when that fingerprint moves. The fingerprints
// and their dates live in build/lastmod.json, which is committed: that file is
// the memory of when each URL last really changed. Delete it and the dates are
// re-seeded from git history, so it is recoverable, not precious.
const LASTMOD_PATH = path.join(__dirname, 'lastmod.json');

function buildDate() {
  return process.env.SITEMAP_DATE || new Date().toISOString().slice(0, 10);
}

function sha1(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function fileForPath(urlPath) {
  return path.posix.join(urlPath.replace(/^\//, ''), 'index.html');
}

// Generated pages are fingerprinted from the page object, which contains only
// their own content. Hand-maintained pages and the article hubs have no page
// object, so they are hashed from their HTML with the navbar and footer (the
// 16 lockstep copies) stripped out: editing the shared navigation must not look
// like 100 pages changed.
function contentFingerprint(page, file) {
  if (page) {
    return sha1(JSON.stringify([
      page.title, page.description, page.h1, page.intro, faqsFor(page),
      page.presetExtra || '', page.ha, page.l, page.k, page.dist, page.distUnit,
    ]));
  }
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/<nav[\s\S]*?<\/nav>/g, '')
    .replace(/<footer[\s\S]*?<\/footer>/g, '');
  return sha1(html);
}

function loadLastmodMemory() {
  try {
    return JSON.parse(fs.readFileSync(LASTMOD_PATH, 'utf8'));
  } catch (err) {
    return {};
  }
}

function git(command, fallback) {
  try {
    return execSync(command, { cwd: ROOT, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (err) {
    return fallback; // no git checkout (or no history): seeding falls back to today
  }
}

// Date of the last commit that touched each file, used ONLY to seed a URL the
// first time it shows up in the memory file.
let GIT_DATES = null;
function gitLastCommitDates() {
  if (GIT_DATES) return GIT_DATES;
  GIT_DATES = {};
  let date = null;
  git('git log --no-renames --date=short --format=@%cd --name-only', '').split('\n').forEach(line => {
    if (line.startsWith('@')) { date = line.slice(1).trim(); return; }
    const file = line.trim();
    if (file && date && !(file in GIT_DATES)) GIT_DATES[file] = date;
  });
  return GIT_DATES;
}

// Files with uncommitted changes are being deployed now, so their last commit
// date would be a lie: they seed as today.
let GIT_DIRTY = null;
function gitDirtyFiles() {
  if (GIT_DIRTY) return GIT_DIRTY;
  GIT_DIRTY = new Set(git('git status --porcelain', '').split('\n')
    .map(line => line.slice(3).trim())
    .filter(Boolean));
  return GIT_DIRTY;
}

function writeSitemap() {
  const entries = [];
  const add = (urlPath, page) => entries.push({ urlPath, page });
  add('/');
  add('/en/');
  LANGS.forEach(lang => add(measurePath(lang)));
  LANGS.forEach(lang => add(measureDistancePath(lang)));
  LANGS.forEach(lang => add(distancesPath(lang)));
  LANGS.forEach(lang => add(litersPath(lang)));
  LANGS.forEach(lang => add(kilosPath(lang)));
  LANGS.forEach(lang => add(converterPath(lang)));
  LANGS.forEach(lang => add(articlesHubPath(lang)));
  LANGS.forEach(lang => KEYS.forEach(key => add(pathFor(lang, key), buildPage(lang, key))));
  LANGS.forEach(lang => LITER_QUANTITIES.forEach(l => add(literPathFor(lang, l), literPage(lang, l))));
  LANGS.forEach(lang => KILO_QUANTITIES.forEach(k => add(kiloPathFor(lang, k), kiloPage(lang, k))));
  ARTICLES.forEach(page => add(page.path, page));
  LITER_ARTICLES.forEach(page => add(page.path, page));
  DIST_ARTICLES.forEach(page => add(page.path, page));

  const remembered = loadLastmodMemory();
  const memory = {};
  const today = buildDate();
  const sectionHomes = new Set([].concat(...LANGS.map(lang => [
    measurePath(lang), measureDistancePath(lang), distancesPath(lang), litersPath(lang),
    kilosPath(lang), converterPath(lang), articlesHubPath(lang),
  ])));
  let changed = 0;
  const warnings = [];

  const body = entries.map(({ urlPath, page }) => {
    const file = fileForPath(urlPath);
    const fingerprint = contentFingerprint(page, file);
    const before = remembered[urlPath];
    let lastmod;
    if (!before) {
      const seed = gitLastCommitDates()[file];
      lastmod = (!seed || gitDirtyFiles().has(file)) ? today : seed;
    } else if (before.fingerprint !== fingerprint) {
      lastmod = today;
      changed++;
    } else {
      lastmod = before.lastmod;
    }
    // Editorial articles date themselves: their `modified` is what the Article
    // JSON-LD publishes, so the sitemap says exactly the same thing. If the copy
    // changed and nobody bumped it, say so instead of drifting silently.
    if (page && page.path && page.modified) {
      if (before && before.fingerprint !== fingerprint && page.modified !== today) {
        warnings.push(`${urlPath}: el contenido ha cambiado pero modified sigue en ${page.modified}`);
      }
      lastmod = page.modified;
    }
    memory[urlPath] = { fingerprint, lastmod };
    const priority = (urlPath === '/' || urlPath === '/en/') ? '1.0'
      : sectionHomes.has(urlPath) ? '0.9' : '0.8';
    return `  <url>\n    <loc>${BASE_URL}${urlPath}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  fs.writeFileSync(LASTMOD_PATH, JSON.stringify(memory, null, 2) + '\n');
  const seeded = entries.filter(e => !remembered[e.urlPath]).length;
  console.log(`sitemap.xml written with ${entries.length} URLs`
    + (seeded ? ` (${seeded} lastmod sembrados desde git)` : '')
    + (changed ? ` · ${changed} con contenido nuevo → ${today}` : ' · sin cambios de contenido'));
  warnings.forEach(w => console.log(`  ⚠ ${w}`));
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
