// Data for the liters tool (/litros/ and /en/liters/): the unit ladder, the
// equivalence entities and the canonical rates. Loaded as browser globals by
// the tool pages AND require()-able from build/generate.js (see the export at
// the bottom), so the numbers live in exactly one place.

// What one person DRINKS in a day, in liters. EFSA adequate intake is 2.0 L/day
// for women and 2.5 L/day for men (total water, all sources); we use the round
// figure usually quoted for drinking water.
// https://www.efsa.europa.eu/en/efsajournal/pub/1459
var DRINK_L_PER_DAY = 2;

// Average HOUSEHOLD water use per person and day in Spain, in liters (showers,
// toilets, washing...). INE, Encuesta sobre el suministro y saneamiento del
// agua: 133 L/inhabitant/day (2020, latest published).
// https://www.ine.es/prensa/essa_2020.pdf
var HOUSEHOLD_L_PER_PERSON_DAY = 133;

// US liquid gallon. https://en.wikipedia.org/wiki/Gallon
var GALLON_LITERS = 3.78541;

// Acre-foot: the reservoir/water-management unit in the US (one acre flooded
// one foot deep), the English-speaking counterpart of the Spanish hm³.
// 43,560 ft³ ≈ 1,233,481.84 L. https://en.wikipedia.org/wiki/Acre-foot
var ACRE_FOOT_LITERS = 1233481.84;

// Units accepted by the amount input (and the ?u= URL param). The selector
// shows a per-language subset: es offers l|gal|hm3, en offers gal|l|acft.
var LITER_INPUT_UNITS = {
  l: 1,
  gal: GALLON_LITERS,
  hm3: 1e9,
  acft: ACRE_FOOT_LITERS
};

// The unit ladder, ascending. The tool picks the first rung (from the largest
// down) that yields >= 10 icons; the user can re-express in any other rung.
// - liters: canonical value of ONE icon.
// - selector: label in the manual unit selector.
// - legend: body of the "Each <emoji> = ..." caption (numbers are hardcoded
//   per language, so each locale formats them its own way).
// - one/many: for the "≈ N <name>" count line.
var LITER_UNITS = [
  {
    id: 'vaso', liters: 0.25, emoji: '🥛',
    es: { selector: 'en vasos de agua', one: 'vaso de agua', many: 'vasos de agua', legend: '1 vaso de agua (0,25 litros)' },
    en: { selector: 'in glasses of water', one: 'glass of water', many: 'glasses of water', legend: '1 glass of water (0.25 litres)' }
  },
  {
    id: 'botella', liters: 1.5, emoji: '🍾',
    es: { selector: 'en botellas de litro y medio', one: 'botella de litro y medio', many: 'botellas de litro y medio', legend: '1 botella grande de agua (1,5 litros)' },
    en: { selector: 'in 1.5-litre bottles', one: '1.5-litre bottle', many: '1.5-litre bottles', legend: '1 large water bottle (1.5 litres)' }
  },
  {
    id: 'persona', liters: DRINK_L_PER_DAY, emoji: '🧍',
    es: { selector: 'en personas (agua de beber)', one: 'persona bebiendo durante un día', many: 'personas bebiendo durante un día', legend: 'lo que bebe una persona en un día (2 litros)' },
    en: { selector: 'in people (drinking water)', one: 'person drinking for a day', many: 'people drinking for a day', legend: 'what one person drinks in a day (2 litres)' }
  },
  {
    id: 'hogar', liters: HOUSEHOLD_L_PER_PERSON_DAY, emoji: '🏠',
    es: { selector: 'en consumo doméstico (persona y día)', one: 'persona de consumo doméstico diario', many: 'personas de consumo doméstico diario', legend: 'el consumo doméstico de agua de una persona en un día (133 litros, INE)' },
    en: { selector: 'in household use (person per day)', one: 'person-day of household use', many: 'person-days of household use', legend: 'one person’s household water use for a day (133 litres, Spain)' }
  },
  {
    id: 'banera', liters: 150, emoji: '🛁',
    es: { selector: 'en bañeras', one: 'bañera llena', many: 'bañeras llenas', legend: '1 bañera llena (150 litros)' },
    en: { selector: 'in bathtubs', one: 'full bathtub', many: 'full bathtubs', legend: '1 full bathtub (150 litres)' }
  },
  {
    id: 'cisterna', liters: 30000, emoji: '🚛',
    es: { selector: 'en camiones cisterna', one: 'camión cisterna', many: 'camiones cisterna', legend: '1 camión cisterna (30.000 litros)' },
    en: { selector: 'in tanker trucks', one: 'tanker truck', many: 'tanker trucks', legend: '1 tanker truck (30,000 litres)' }
  },
  {
    // 50 m x 25 m x 2 m minimum depth = 2,500 m³ = 2.5 million liters.
    // https://en.wikipedia.org/wiki/Olympic-size_swimming_pool (World Aquatics)
    id: 'piscina', liters: 2500000, emoji: '🏊',
    es: { selector: 'en piscinas olímpicas', one: 'piscina olímpica', many: 'piscinas olímpicas', legend: '1 piscina olímpica (2,5 millones de litros)' },
    en: { selector: 'in Olympic pools', one: 'Olympic swimming pool', many: 'Olympic swimming pools', legend: '1 Olympic swimming pool (2.5 million litres)' }
  },
  {
    id: 'hm3', liters: 1e9, emoji: '🌊',
    es: { selector: 'en hectómetros cúbicos', one: 'hectómetro cúbico', many: 'hectómetros cúbicos', legend: '1 hectómetro cúbico (1.000 millones de litros), la unidad de los embalses' },
    en: { selector: 'in cubic hectometres', one: 'cubic hectometre', many: 'cubic hectometres', legend: '1 cubic hectometre (1 billion litres), the unit used for reservoirs' }
  }
];

// Named periods for the equivalence phrase, in days. `simple: true` marks the
// most natural ones, slightly preferred by the phrase picker. The `personal`
// ones extend the "what YOU drink in..." range beyond a year.
var LITER_PERIODS = [
  { days: 1, es: 'un día', en: 'a day', simple: true },
  { days: 1.5, es: 'un día y medio', en: 'a day and a half' },
  { days: 2, es: 'dos días', en: 'two days' },
  { days: 3, es: 'tres días', en: 'three days' },
  { days: 4, es: 'cuatro días', en: 'four days' },
  { days: 5, es: 'cinco días', en: 'five days' },
  { days: 7, es: 'una semana', en: 'a week', simple: true },
  { days: 10, es: 'diez días', en: 'ten days' },
  { days: 14, es: 'dos semanas', en: 'two weeks' },
  { days: 21, es: 'tres semanas', en: 'three weeks' },
  { days: 30, es: 'un mes', en: 'a month', simple: true },
  { days: 45, es: 'mes y medio', en: 'a month and a half' },
  { days: 61, es: 'dos meses', en: 'two months' },
  { days: 91, es: 'tres meses', en: 'three months' },
  { days: 122, es: 'cuatro meses', en: 'four months' },
  { days: 182, es: 'medio año', en: 'half a year' },
  { days: 274, es: 'nueve meses', en: 'nine months' },
  { days: 365, es: 'un año', en: 'a year', simple: true }
];

var LITER_PERIODS_PERSONAL = LITER_PERIODS.concat([
  { days: 548, es: 'año y medio', en: 'a year and a half' },
  { days: 730, es: 'dos años', en: 'two years' },
  { days: 1095, es: 'tres años', en: 'three years' },
  { days: 1460, es: 'cuatro años', en: 'four years' },
  { days: 1825, es: 'cinco años', en: 'five years' },
  { days: 2555, es: 'siete años', en: 'seven years' },
  { days: 3650, es: 'diez años', en: 'ten years' },
  { days: 5475, es: 'quince años', en: 'fifteen years' },
  { days: 7300, es: 'veinte años', en: 'twenty years' },
  { days: 29200, es: 'toda una vida (80 años)', en: 'a whole lifetime (80 years)', simple: true }
]);

// Curated entities for "≈ what the population of X drinks in ...". Recognizable
// places only: ~30 well-known Spanish cities, the 17 autonomous communities,
// Spain and a few world anchors for the huge figures. Populations are rounded;
// Spanish figures from INE (padrón municipal / cifras de población, 2024,
// https://www.ine.es), world figures from UN estimates. lat/lon/z center the
// hectares map when the phrase links to the place. `anchor: true` marks the
// world anchors, slightly penalized so Spanish places win ties.
var LITER_ENTITIES = [
  // Cities (INE padrón municipal, rounded)
  { id: 'madrid', es: 'Madrid', en: 'Madrid', pop: 3340000, lat: 40.4168, lon: -3.7038, z: 11 },
  { id: 'barcelona', es: 'Barcelona', en: 'Barcelona', pop: 1660000, lat: 41.3874, lon: 2.1686, z: 11 },
  { id: 'valencia', es: 'Valencia', en: 'Valencia', pop: 810000, lat: 39.4699, lon: -0.3763, z: 12 },
  { id: 'sevilla', es: 'Sevilla', en: 'Seville', pop: 685000, lat: 37.3891, lon: -5.9845, z: 12 },
  { id: 'zaragoza', es: 'Zaragoza', en: 'Zaragoza', pop: 690000, lat: 41.6488, lon: -0.8891, z: 12 },
  { id: 'malaga', es: 'Málaga', en: 'Málaga', pop: 590000, lat: 36.7213, lon: -4.4213, z: 12 },
  { id: 'murcia', es: 'Murcia', en: 'Murcia', pop: 470000, lat: 37.9922, lon: -1.1307, z: 12 },
  { id: 'palma', es: 'Palma de Mallorca', en: 'Palma de Mallorca', pop: 425000, lat: 39.5696, lon: 2.6502, z: 12 },
  { id: 'laspalmas', es: 'Las Palmas de Gran Canaria', en: 'Las Palmas', pop: 380000, lat: 28.1235, lon: -15.4363, z: 12 },
  { id: 'alicante', es: 'Alicante', en: 'Alicante', pop: 350000, lat: 38.3452, lon: -0.481, z: 12 },
  { id: 'bilbao', es: 'Bilbao', en: 'Bilbao', pop: 347000, lat: 43.263, lon: -2.935, z: 12 },
  { id: 'cordoba', es: 'Córdoba', en: 'Córdoba', pop: 320000, lat: 37.8882, lon: -4.7794, z: 12 },
  { id: 'valladolid', es: 'Valladolid', en: 'Valladolid', pop: 300000, lat: 41.6523, lon: -4.7245, z: 12 },
  { id: 'vigo', es: 'Vigo', en: 'Vigo', pop: 295000, lat: 42.2406, lon: -8.7207, z: 12 },
  { id: 'gijon', es: 'Gijón', en: 'Gijón', pop: 270000, lat: 43.5322, lon: -5.6611, z: 12 },
  { id: 'vitoria', es: 'Vitoria-Gasteiz', en: 'Vitoria-Gasteiz', pop: 255000, lat: 42.8467, lon: -2.6716, z: 12 },
  { id: 'coruna', es: 'A Coruña', en: 'A Coruña', pop: 245000, lat: 43.3623, lon: -8.4115, z: 12 },
  { id: 'granada', es: 'Granada', en: 'Granada', pop: 230000, lat: 37.1773, lon: -3.5986, z: 12 },
  { id: 'oviedo', es: 'Oviedo', en: 'Oviedo', pop: 220000, lat: 43.3619, lon: -5.8494, z: 12 },
  { id: 'cartagena', es: 'Cartagena', en: 'Cartagena', pop: 218000, lat: 37.6257, lon: -0.9966, z: 12 },
  { id: 'jerez', es: 'Jerez de la Frontera', en: 'Jerez de la Frontera', pop: 213000, lat: 36.685, lon: -6.1261, z: 12 },
  { id: 'pamplona', es: 'Pamplona', en: 'Pamplona', pop: 205000, lat: 42.8125, lon: -1.6458, z: 12 },
  { id: 'almeria', es: 'Almería', en: 'Almería', pop: 200000, lat: 36.834, lon: -2.4637, z: 12 },
  { id: 'donostia', es: 'San Sebastián', en: 'San Sebastián', pop: 190000, lat: 43.3183, lon: -1.9812, z: 12 },
  { id: 'burgos', es: 'Burgos', en: 'Burgos', pop: 174000, lat: 42.3439, lon: -3.6969, z: 12 },
  { id: 'santander', es: 'Santander', en: 'Santander', pop: 172000, lat: 43.4623, lon: -3.8099, z: 12 },
  { id: 'logrono', es: 'Logroño', en: 'Logroño', pop: 150000, lat: 42.4627, lon: -2.4449, z: 12 },
  { id: 'salamanca', es: 'Salamanca', en: 'Salamanca', pop: 143000, lat: 40.9701, lon: -5.6635, z: 12 },
  { id: 'cadiz', es: 'Cádiz', en: 'Cádiz', pop: 111000, lat: 36.5271, lon: -6.2886, z: 12 },
  { id: 'toledo', es: 'Toledo', en: 'Toledo', pop: 85000, lat: 39.8628, lon: -4.0273, z: 13 },
  // Autonomous communities (INE cifras de población, rounded)
  { id: 'andalucia', es: 'Andalucía', en: 'Andalusia', pop: 8600000, lat: 37.5, lon: -4.7, z: 7 },
  { id: 'cataluna', es: 'Cataluña', en: 'Catalonia', pop: 8000000, lat: 41.8, lon: 1.6, z: 8 },
  { id: 'commadrid', es: 'la Comunidad de Madrid', en: 'the Madrid region', pop: 7000000, lat: 40.5, lon: -3.7, z: 9 },
  { id: 'valenciana', es: 'la Comunidad Valenciana', en: 'the Valencian Community', pop: 5300000, lat: 39.5, lon: -0.75, z: 8 },
  { id: 'galicia', es: 'Galicia', en: 'Galicia', pop: 2700000, lat: 42.75, lon: -8.0, z: 8 },
  { id: 'castillaleon', es: 'Castilla y León', en: 'Castile and León', pop: 2390000, lat: 41.7, lon: -4.5, z: 7 },
  { id: 'canarias', es: 'Canarias', en: 'the Canary Islands', pop: 2240000, lat: 28.3, lon: -16.0, z: 7 },
  { id: 'euskadi', es: 'Euskadi', en: 'the Basque Country', pop: 2220000, lat: 43.0, lon: -2.6, z: 9 },
  { id: 'castillamancha', es: 'Castilla-La Mancha', en: 'Castilla-La Mancha', pop: 2100000, lat: 39.5, lon: -3.0, z: 7 },
  { id: 'regionmurcia', es: 'la Región de Murcia', en: 'the Region of Murcia', pop: 1570000, lat: 38.0, lon: -1.5, z: 9 },
  { id: 'aragon', es: 'Aragón', en: 'Aragon', pop: 1350000, lat: 41.5, lon: -0.9, z: 8 },
  { id: 'baleares', es: 'Baleares', en: 'the Balearic Islands', pop: 1230000, lat: 39.6, lon: 2.9, z: 8 },
  { id: 'extremadura', es: 'Extremadura', en: 'Extremadura', pop: 1050000, lat: 39.2, lon: -6.1, z: 8 },
  { id: 'asturias', es: 'Asturias', en: 'Asturias', pop: 1010000, lat: 43.3, lon: -5.9, z: 9 },
  { id: 'navarra', es: 'Navarra', en: 'Navarre', pop: 680000, lat: 42.7, lon: -1.6, z: 9 },
  { id: 'cantabria', es: 'Cantabria', en: 'Cantabria', pop: 590000, lat: 43.2, lon: -4.0, z: 9 },
  { id: 'larioja', es: 'La Rioja', en: 'La Rioja', pop: 320000, lat: 42.3, lon: -2.5, z: 10 },
  // Spain
  { id: 'espana', es: 'España', en: 'Spain', pop: 48600000, lat: 40.2, lon: -3.7, z: 6 },
  // World anchors (UN estimates, rounded)
  { id: 'lisboa', es: 'Lisboa', en: 'Lisbon', pop: 550000, lat: 38.7223, lon: -9.1393, z: 12, anchor: true },
  { id: 'paris', es: 'París', en: 'Paris', pop: 2100000, lat: 48.8566, lon: 2.3522, z: 12, anchor: true },
  { id: 'londres', es: 'Londres', en: 'London', pop: 8900000, lat: 51.5074, lon: -0.1278, z: 11, anchor: true },
  { id: 'nuevayork', es: 'Nueva York', en: 'New York', pop: 8300000, lat: 40.7128, lon: -74.006, z: 11, anchor: true },
  { id: 'mexicodf', es: 'Ciudad de México', en: 'Mexico City', pop: 9200000, lat: 19.4326, lon: -99.1332, z: 11, anchor: true },
  { id: 'tokio', es: 'Tokio', en: 'Tokyo', pop: 14000000, lat: 35.6762, lon: 139.6503, z: 11, anchor: true },
  { id: 'portugal', es: 'Portugal', en: 'Portugal', pop: 10600000, lat: 39.5, lon: -8.0, z: 7, anchor: true },
  { id: 'francia', es: 'Francia', en: 'France', pop: 68000000, lat: 46.6, lon: 2.5, z: 6, anchor: true },
  { id: 'eeuu', es: 'Estados Unidos', en: 'the United States', pop: 335000000, lat: 39.8, lon: -98.6, z: 4, anchor: true },
  { id: 'ue', es: 'la Unión Europea', en: 'the European Union', pop: 450000000, lat: 50.0, lon: 9.0, z: 4, anchor: true },
  { id: 'india', es: 'la India', en: 'India', pop: 1440000000, lat: 22.0, lon: 79.0, z: 4, anchor: true },
  { id: 'mundo', es: 'todo el planeta', en: 'the whole planet', pop: 8100000000, lat: 20.0, lon: 0.0, z: 2, anchor: true }
];

// Lets build/generate.js reuse these constants for the landing pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DRINK_L_PER_DAY: DRINK_L_PER_DAY,
    HOUSEHOLD_L_PER_PERSON_DAY: HOUSEHOLD_L_PER_PERSON_DAY,
    GALLON_LITERS: GALLON_LITERS,
    ACRE_FOOT_LITERS: ACRE_FOOT_LITERS,
    LITER_INPUT_UNITS: LITER_INPUT_UNITS,
    LITER_UNITS: LITER_UNITS,
    LITER_PERIODS: LITER_PERIODS,
    LITER_PERIODS_PERSONAL: LITER_PERIODS_PERSONAL,
    LITER_ENTITIES: LITER_ENTITIES
  };
}
