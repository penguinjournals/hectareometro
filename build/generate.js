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

// ---- per-language UI chrome (template placeholders) ----------------------

const UI = {
  es: {
    htmlLang: 'es', ogLocale: 'es_ES', siteName: 'Hectareómetro',
    navDistances: 'Distancias', navLiters: 'Litros', navKilos: 'Kilos', navMenu: 'Menú',
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
  },
  en: {
    htmlLang: 'en', ogLocale: 'en_GB', siteName: 'Hectareometer',
    navDistances: 'Distances', navLiters: 'Liters', navKilos: 'Kilos', navMenu: 'Menu',
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

const ARTICLES = [burnedAreaArticle()];

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

function relatedLiterLinks(lang, currentL) {
  const links = LITER_QUANTITIES.filter(l => l !== currentL)
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

function buildJsonLd(page) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'inLanguage': page.lang,
    'mainEntity': [{
      '@type': 'Question',
      'name': page.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': page.answer },
    }],
  }, null, 2);
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

function relatedLinks(lang, currentKey) {
  const links = KEYS.filter(k => k !== currentKey)
    .map(k => `        <li><a href="${pathFor(lang, k)}">${escapeHtml(buildPage(lang, k).linkLabel)}</a></li>`);
  ARTICLES.filter(a => a.lang === lang && a.key !== currentKey)
    .forEach(a => links.push(`        <li><a href="${a.path}">${escapeHtml(a.linkLabel)}</a></li>`));
  return links.join('\n');
}

function render(page, template) {
  const ui = UI[page.lang];
  const isLiters = page.section === 'litros';
  const isKilos = page.section === 'kilos';
  // Articles carry their own path and exist in one language only; liters and
  // kilos landings have their own slug family and template.
  const canonical = isLiters
    ? literFullUrl(page.lang, page.key)
    : isKilos
    ? kiloFullUrl(page.lang, page.key)
    : page.path ? BASE_URL + page.path : fullUrl(page.lang, page.key);
  const hreflang = isLiters
    ? buildLiterHreflang(page.key)
    : isKilos
    ? buildKiloHreflang(page.key)
    : page.path
    ? [
        `<link rel="alternate" hreflang="${page.lang}" href="${canonical}">`,
        `<link rel="alternate" hreflang="x-default" href="${canonical}">`,
      ].join('\n')
    : buildHreflang(page.key);
  const langSwitch = isLiters
    ? buildLiterLangSwitch(page.lang, page.key)
    : isKilos
    ? buildKiloLangSwitch(page.lang, page.key)
    : page.path
    ? `<a href="${homePath(page.lang === 'es' ? 'en' : 'es')}" hreflang="${page.lang === 'es' ? 'en' : 'es'}">${UI[page.lang].switchLabel}</a>`
    : buildLangSwitch(page.lang, page.key);
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
    JSON_LD: buildJsonLd(page),
    HA: String(page.ha),
    L: String(page.l || ''),
    K: String(page.k || ''),
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
    INTRO: page.intro,
    RELATED_HEADING: isLiters ? ui.relatedHeadingLiters : isKilos ? ui.relatedHeadingKilos : ui.relatedHeading,
    RELATED_LINKS: isLiters ? relatedLiterLinks(page.lang, page.key)
      : isKilos ? relatedKiloLinks(page.lang, page.key)
      : relatedLinks(page.lang, page.key),
    HOME_URL: homePath(page.lang),
    NAV_DIST_URL: distancesPath(page.lang),
    NAV_DIST_LABEL: ui.navDistances,
    NAV_LITERS_URL: litersPath(page.lang),
    NAV_LITERS_LABEL: ui.navLiters,
    NAV_KILOS_URL: kilosPath(page.lang),
    NAV_KILOS_LABEL: ui.navKilos,
    NAV_MENU_LABEL: ui.navMenu,
    BACK_TEXT: isLiters ? ui.backTextLiters : isKilos ? ui.backTextKilos : ui.backText,
  };
  let out = template || TEMPLATE;
  Object.keys(repl).forEach(k => {
    out = out.split('{{' + k + '}}').join(repl[k]);
  });
  return out;
}

function writeSitemap() {
  const urls = [`${BASE_URL}/`, `${BASE_URL}/en/`];
  LANGS.forEach(lang => urls.push(BASE_URL + distancesPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + litersPath(lang)));
  LANGS.forEach(lang => urls.push(BASE_URL + kilosPath(lang)));
  LANGS.forEach(lang => KEYS.forEach(key => urls.push(fullUrl(lang, key))));
  LANGS.forEach(lang => LITER_QUANTITIES.forEach(l => urls.push(literFullUrl(lang, l))));
  LANGS.forEach(lang => KILO_QUANTITIES.forEach(k => urls.push(kiloFullUrl(lang, k))));
  ARTICLES.forEach(page => urls.push(BASE_URL + page.path));
  const body = urls.map(u => {
    const isHome = u === `${BASE_URL}/` || u === `${BASE_URL}/en/`;
    const isSectionHome = LANGS.some(lang => u === BASE_URL + distancesPath(lang) || u === BASE_URL + litersPath(lang) || u === BASE_URL + kilosPath(lang));
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
  fs.writeFileSync(path.join(__dirname, 'pages.json'), JSON.stringify(manifest, null, 2));
  writeSitemap();
  console.log(`\n${manifest.length} pages generated (${LANGS.length} languages × (${KEYS.length} keys + ${LITER_QUANTITIES.length} liter + ${KILO_QUANTITIES.length} kilo amounts) + ${ARTICLES.length} articles).`);
}

main();

module.exports = { LANGS, KEYS, BASE_URL, pathFor, slugFor, buildPage };
