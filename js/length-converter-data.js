// Data for the length converter (/kilometros-a-millas/ and
// /en/kilometers-to-miles/): every unit the converter understands, with its
// exact factor to metres. Loaded as a browser global by the tool pages AND
// require()-able from build/generate.js (see the export at the bottom), so the
// numbers live in exactly one place. Mirrors js/area-converter-data.js.
//
// Every imperial/US factor here is exact by definition since the International
// Yard and Pound Agreement (1959): 1 yd = 0.9144 m exactly, so 1 ft = 0.3048 m,
// 1 in = 0.0254 m and 1 mi = 1,760 yd = 1,609.344 m.
// https://en.wikipedia.org/wiki/International_yard_and_pound
// The nautical mile is exactly 1,852 m by the 1929 Monaco convention (one
// minute of arc of a meridian, rounded); the US and the UK adopted it in 1954
// and 1970. https://en.wikipedia.org/wiki/Nautical_mile

// Descending by size: this is the order of the results table. Note the
// nautical mile leads — it is longer than the statute mile, which is the whole
// point of /cuanto-es-una-milla-nautica/.
var LENGTH_UNITS = [
  {
    id: 'nmi', m: 1852,
    es: { one: 'milla náutica', many: 'millas náuticas', symbol: 'mn' },
    en: { one: 'nautical mile', many: 'nautical miles', symbol: 'nmi' }
  },
  {
    id: 'mi', m: 1609.344,
    es: { one: 'milla', many: 'millas', symbol: 'mi' },
    en: { one: 'mile', many: 'miles', symbol: 'mi' }
  },
  {
    id: 'km', m: 1000,
    es: { one: 'kilómetro', many: 'kilómetros', symbol: 'km' },
    en: { one: 'kilometre', many: 'kilometres', symbol: 'km' }
  },
  {
    id: 'm', m: 1,
    es: { one: 'metro', many: 'metros', symbol: 'm' },
    en: { one: 'metre', many: 'metres', symbol: 'm' }
  },
  {
    id: 'yd', m: 0.9144,
    es: { one: 'yarda', many: 'yardas', symbol: 'yd' },
    en: { one: 'yard', many: 'yards', symbol: 'yd' }
  },
  {
    id: 'ft', m: 0.3048,
    es: { one: 'pie', many: 'pies', symbol: 'ft' },
    en: { one: 'foot', many: 'feet', symbol: 'ft' }
  },
  {
    id: 'in', m: 0.0254,
    es: { one: 'pulgada', many: 'pulgadas', symbol: 'in' },
    en: { one: 'inch', many: 'inches', symbol: 'in' }
  },
  {
    id: 'cm', m: 0.01,
    es: { one: 'centímetro', many: 'centímetros', symbol: 'cm' },
    en: { one: 'centimetre', many: 'centimetres', symbol: 'cm' }
  }
];

// Lets build/generate.js reuse these constants for the pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LENGTH_UNITS: LENGTH_UNITS
  };
}
