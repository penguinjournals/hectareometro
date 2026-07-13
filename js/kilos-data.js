// Data for the kilos tool (/kilos/ and /en/kilos/): the unit ladder and the
// canonical rates. Loaded as browser globals by the tool pages AND
// require()-able from build/generate.js (see the export at the bottom), so
// the numbers live in exactly one place. The population entities for the
// equivalence phrase are NOT duplicated here: the kilos pages also load
// js/liters-data.js and reuse its LITER_ENTITIES.

// Average adult body weight, in kg. Worldwide adult mean is ~62 kg; European
// adults average ~70-75 kg, so we use the round European figure.
// https://en.wikipedia.org/wiki/Human_body_weight
var PERSON_KG = 75;

// Pound (avoirdupois), exact by definition. https://en.wikipedia.org/wiki/Pound_(mass)
var POUND_KG = 0.45359237;

// Units accepted by the amount input (and the ?u= URL param). The selector
// shows a per-language subset: es offers kg|lb|t, en offers lb|kg|t.
var KILO_INPUT_UNITS = {
  kg: 1,
  lb: POUND_KG,
  t: 1000
};

// The unit ladder, ascending. The tool picks the first rung (from the largest
// down) that yields >= 10 icons; the user can re-express in any other rung.
// - kg: canonical weight of ONE icon (sources in comments).
// - selector: label in the manual unit selector.
// - legend: body of the "Each <emoji> = ..." caption (numbers hardcoded per
//   language so each locale formats them its own way).
// - one/many: for the "≈ N <name>" count line.
var KILO_UNITS = [
  {
    // Medium (M) egg: 53-63 g. https://es.wikipedia.org/wiki/Huevo_(alimento)
    id: 'huevo', kg: 0.06, emoji: '🥚',
    es: { selector: 'en huevos', one: 'huevo', many: 'huevos', legend: '1 huevo (60 gramos)' },
    en: { selector: 'in eggs', one: 'egg', many: 'eggs', legend: '1 egg (60 grams)' }
  },
  {
    // Typical eating apple: ~180-220 g.
    id: 'manzana', kg: 0.2, emoji: '🍎',
    es: { selector: 'en manzanas', one: 'manzana', many: 'manzanas', legend: '1 manzana (200 gramos)' },
    en: { selector: 'in apples', one: 'apple', many: 'apples', legend: '1 apple (200 grams)' }
  },
  {
    id: 'persona', kg: PERSON_KG, emoji: '🧍',
    es: { selector: 'en personas', one: 'persona', many: 'personas', legend: '1 persona adulta (75 kilos)' },
    en: { selector: 'in people', one: 'person', many: 'people', legend: '1 adult person (75 kg, about 165 lb)' }
  },
  {
    // Adult cow: 600-800 kg depending on the breed.
    id: 'vaca', kg: 700, emoji: '🐄',
    es: { selector: 'en vacas', one: 'vaca', many: 'vacas', legend: '1 vaca (700 kilos)' },
    en: { selector: 'in cows', one: 'cow', many: 'cows', legend: '1 cow (700 kg)' }
  },
  {
    // Average passenger car kerb weight: ~1,400-1,500 kg.
    id: 'coche', kg: 1500, emoji: '🚗',
    es: { selector: 'en coches', one: 'coche', many: 'coches', legend: '1 coche (1.500 kilos)' },
    en: { selector: 'in cars', one: 'car', many: 'cars', legend: '1 car (1,500 kg)' }
  },
  {
    // Adult African bush elephant: ~4-7 t; 6 t is a large male.
    // https://en.wikipedia.org/wiki/African_bush_elephant
    id: 'elefante', kg: 6000, emoji: '🐘',
    es: { selector: 'en elefantes', one: 'elefante', many: 'elefantes', legend: '1 elefante africano (6.000 kilos)' },
    en: { selector: 'in elephants', one: 'elephant', many: 'elephants', legend: '1 African elephant (6,000 kg)' }
  },
  {
    // EU maximum authorised mass for a five/six-axle artic: 40 t
    // (Directive 96/53/EC).
    id: 'camion', kg: 40000, emoji: '🚚',
    es: { selector: 'en camiones', one: 'camión de 40 toneladas', many: 'camiones de 40 toneladas', legend: '1 camión cargado al máximo legal (40.000 kilos)' },
    en: { selector: 'in trucks', one: 'fully loaded 40-tonne truck', many: 'fully loaded 40-tonne trucks', legend: '1 truck at the EU legal maximum (40,000 kg)' }
  },
  {
    // Blue whale: typically ~130-150 t, up to ~180 t. Largest animal ever.
    // https://en.wikipedia.org/wiki/Blue_whale
    id: 'ballena', kg: 150000, emoji: '🐋',
    es: { selector: 'en ballenas azules', one: 'ballena azul', many: 'ballenas azules', legend: '1 ballena azul (150.000 kilos, el mayor animal que ha existido)' },
    en: { selector: 'in blue whales', one: 'blue whale', many: 'blue whales', legend: '1 blue whale (150,000 kg, the largest animal ever)' }
  },
  {
    // Eiffel Tower: ~10,100 t total (7,300 t of iron); rounded to 10,000 t.
    // https://www.toureiffel.paris/en/the-monument/key-figures
    id: 'eiffel', kg: 10000000, emoji: '🗼',
    es: { selector: 'en torres Eiffel', one: 'torre Eiffel', many: 'torres Eiffel', legend: '1 torre Eiffel (10.000 toneladas)' },
    en: { selector: 'in Eiffel Towers', one: 'Eiffel Tower', many: 'Eiffel Towers', legend: '1 Eiffel Tower (10,000 tonnes)' }
  }
];

// Lets build/generate.js reuse these constants for the landing pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PERSON_KG: PERSON_KG,
    POUND_KG: POUND_KG,
    KILO_INPUT_UNITS: KILO_INPUT_UNITS,
    KILO_UNITS: KILO_UNITS
  };
}
