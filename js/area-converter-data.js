// Data for the area converter (/hectareas-a-metros-cuadrados/ and
// /en/hectares-to-square-meters/): every unit the converter understands, with
// its exact factor to square meters. Loaded as a browser global by the tool
// pages AND require()-able from build/generate.js (see the export at the
// bottom), so the numbers live in exactly one place.
//
// Imperial/US factors are exact by definition since the International Yard
// and Pound Agreement (1959): 1 ft = 0.3048 m, so 1 ft² = 0.09290304 m²,
// 1 yd² = 9 ft² = 0.83612736 m², 1 acre = 43,560 ft² = 4,046.8564224 m² and
// 1 mi² = 640 acres = 2,589,988.110336 m².
// https://en.wikipedia.org/wiki/International_yard_and_pound

// Descending by size: this is the order of the results table.
var AREA_UNITS = [
  {
    id: 'mi2', m2: 2589988.110336,
    es: { one: 'milla cuadrada', many: 'millas cuadradas', symbol: 'mi²' },
    en: { one: 'square mile', many: 'square miles', symbol: 'sq mi' }
  },
  {
    id: 'km2', m2: 1000000,
    es: { one: 'kilómetro cuadrado', many: 'kilómetros cuadrados', symbol: 'km²' },
    en: { one: 'square kilometre', many: 'square kilometres', symbol: 'km²' }
  },
  {
    id: 'ha', m2: 10000,
    es: { one: 'hectárea', many: 'hectáreas', symbol: 'ha' },
    en: { one: 'hectare', many: 'hectares', symbol: 'ha' }
  },
  {
    id: 'acre', m2: 4046.8564224,
    es: { one: 'acre', many: 'acres', symbol: 'ac' },
    en: { one: 'acre', many: 'acres', symbol: 'ac' }
  },
  {
    id: 'm2', m2: 1,
    es: { one: 'metro cuadrado', many: 'metros cuadrados', symbol: 'm²' },
    en: { one: 'square metre', many: 'square metres', symbol: 'm²' }
  },
  {
    id: 'yd2', m2: 0.83612736,
    es: { one: 'yarda cuadrada', many: 'yardas cuadradas', symbol: 'yd²' },
    en: { one: 'square yard', many: 'square yards', symbol: 'yd²' }
  },
  {
    id: 'ft2', m2: 0.09290304,
    es: { one: 'pie cuadrado', many: 'pies cuadrados', symbol: 'ft²' },
    en: { one: 'square foot', many: 'square feet', symbol: 'ft²' }
  }
];

// Lets build/generate.js reuse these constants for the pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AREA_UNITS: AREA_UNITS
  };
}
