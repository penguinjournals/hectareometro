// Data for the money tool (/dinero/ and /en/money/). Loaded as browser globals
// by the tool pages AND require()-able from build/generate.js (see the export
// at the bottom), so the numbers live in exactly one place.
//
// Money is not converted between currencies (exchange rates move every day):
// the currency picks the COUNTRY whose wages and prices make the comparison.
// EUR → Spain, USD → United States. GBP/CAD can be added as two more entries
// with the same shape.
//
// Each currency has two ladders, both ascending:
// - time: how long it takes to EARN the amount (minimum wage, average wage,
//   a whole working life, a whole country working).
// - objects: what the amount BUYS (a meal, a car, a home, a city budget…).
// Every rung: id (unique within its ladder, travels as ?vt= / ?vo=), value
// (in the currency), emoji, and per-language texts: selector (the "Show"
// dropdown), one/many (the "≈ N <name>" count line) and legend (the "Each
// <emoji> = …" caption, numbers hardcoded per locale, with the data year).
//
// REVIEW EVERY YEAR: wages and prices go stale. `year` is the reference year
// shown next to the figures.

// A working life: 40 years of work (25 to 65), the basis of the "vida
// laboral" rung and of the time bar.
var WORKING_LIFE_YEARS = 40;
var WORKING_LIFE_START_AGE = 25;

// ---- Spain (EUR) ----------------------------------------------------------

// SMI 2026, Real Decreto 126/2026 (BOE-A-2026-3815): 40,70 €/día, 1.221 €/mes
// in 14 payments, 17.094 €/año. https://www.boe.es/eli/es/rd/2026/02/18/126/con
var ES_SMI_DAY = 40.70;
var ES_SMI_YEAR = 17094;
// Mean gross annual wage, INE Encuesta Anual de Estructura Salarial 2024
// (published 28-may-2026): 29.540,26 € (median 24.497,17 €). MEAN, gross,
// part-time included. https://ine.es/dyngs/Prensa/EAES2024.htm
var ES_AVG_WAGE = 29540.26;
// Employed people, EPA 2T 2026: 22.779.000. https://ine.es/dyngs/Prensa/EPA2T26.htm
var ES_EMPLOYED = 22779000;
// Population at 1-jul-2026 (provisional): 49.801.559.
// https://www.ine.es/dyngs/Prensa/ECP2T26.htm
var ES_POPULATION = 49801559;

// ---- United States (USD) ---------------------------------------------------

// Federal minimum wage: $7.25/h since 24-Jul-2009 (FLSA); full time = 2,080 h
// = $15,080/yr. https://www.dol.gov/agencies/whd/minimum-wage
var US_MIN_WAGE_HOUR = 7.25;
// Mean annual wage, all occupations, BLS OEWS May 2025: $69,770 (MEAN, like
// the Spanish figure). https://www.bls.gov/news.release/archives/ocwage_05152026.htm
var US_AVG_WAGE = 69770;
// Employed, CPS Sept 2026 (SA): 163,152,000.
// https://www.bls.gov/news.release/archives/empsit_10022026.htm
var US_EMPLOYED = 163152000;
// Resident population 1-Jul-2025, Census Vintage 2025: 341,784,857.
// https://www.census.gov/newsroom/press-kits/2026/national-state-population-estimates.html
var US_POPULATION = 341784857;

var MONEY_CURRENCIES = {
  eur: {
    code: 'EUR', symbol: '€',
    year: 2026,
    country: { es: 'España', en: 'Spain' },
    names: { es: { one: 'euro', many: 'euros' }, en: { one: 'euro', many: 'euros' } },
    avgWage: ES_AVG_WAGE,
    minWageYear: ES_SMI_YEAR,
    // Approximate effective working hours per full-time year in Spain (only
    // used to say "N hours" for amounts under a day of work).
    workHoursPerYear: 1760,
    population: ES_POPULATION,
    time: [
      {
        id: 'dia', value: ES_SMI_DAY, emoji: '⏱️',
        es: { selector: 'en días de salario mínimo', one: 'día de salario mínimo', many: 'días de salario mínimo', legend: '1 día de salario mínimo (40,70 €, SMI 2026)' },
        en: { selector: 'in days on the minimum wage', one: 'day on the minimum wage', many: 'days on the minimum wage', legend: '1 day on Spain’s minimum wage (€40.70, 2026)' }
      },
      {
        id: 'mes', value: ES_SMI_YEAR / 12, emoji: '📅',
        es: { selector: 'en meses de salario mínimo', one: 'mes de salario mínimo', many: 'meses de salario mínimo', legend: '1 mes de salario mínimo con las pagas extra prorrateadas (1.424,50 €; 17.094 € al año)' },
        en: { selector: 'in months on the minimum wage', one: 'month on the minimum wage', many: 'months on the minimum wage', legend: '1 month on Spain’s minimum wage, bonuses included (€1,424.50; €17,094 a year)' }
      },
      {
        id: 'ano', value: ES_AVG_WAGE, emoji: '💼',
        es: { selector: 'en años de salario medio', one: 'año de salario medio', many: 'años de salario medio', legend: '1 año de salario medio bruto (29.540 €, INE)' },
        en: { selector: 'in years of average wage', one: 'year of average wage', many: 'years of average wage', legend: '1 year of Spain’s average gross wage (€29,540)' }
      },
      {
        id: 'vida', value: ES_AVG_WAGE * WORKING_LIFE_YEARS, emoji: '⏳',
        es: { selector: 'en vidas laborales', one: 'vida laboral entera', many: 'vidas laborales enteras', legend: '1 vida laboral: 40 años cobrando el salario medio (1,18 millones de €)' },
        en: { selector: 'in working lives', one: 'whole working life', many: 'whole working lives', legend: '1 working life: 40 years on the average wage (€1.18 million)' }
      },
      {
        id: 'empresa', value: ES_AVG_WAGE * 1000, emoji: '🏢',
        es: { selector: 'en nóminas de 1.000 empleados', one: 'año de sueldos de una empresa de 1.000 empleados', many: 'años de sueldos de una empresa de 1.000 empleados', legend: '1 año de sueldos de una empresa de 1.000 empleados, a salario medio (29,5 millones de €)' },
        en: { selector: 'in 1,000-employee payrolls', one: 'year of a 1,000-employee payroll', many: 'years of a 1,000-employee payroll', legend: '1 year of payroll for a 1,000-employee company, at the average wage (€29.5 million)' }
      },
      {
        id: 'pais-dia', value: ES_EMPLOYED * ES_AVG_WAGE / 365, emoji: '🏭',
        es: { selector: 'en días de trabajo de todo el país', one: 'día de sueldos de toda España', many: 'días de sueldos de toda España', legend: '1 día de sueldos de los 22,8 millones de ocupados de España, a salario medio (1.844 millones de €)' },
        en: { selector: 'in days of the whole country’s work', one: 'day of wages for all of Spain', many: 'days of wages for all of Spain', legend: '1 day of wages for Spain’s 22.8 million workers, at the average wage (€1.84 billion)' }
      },
      {
        id: 'pais-ano', value: ES_EMPLOYED * ES_AVG_WAGE, emoji: '🗺️',
        es: { selector: 'en años de trabajo de todo el país', one: 'año de sueldos de toda España', many: 'años de sueldos de toda España', legend: '1 año de sueldos de los 22,8 millones de ocupados de España, a salario medio (673.000 millones de €)' },
        en: { selector: 'in years of the whole country’s work', one: 'year of wages for all of Spain', many: 'years of wages for all of Spain', legend: '1 year of wages for Spain’s 22.8 million workers, at the average wage (€673 billion)' }
      }
    ],
    objects: [
      {
        // Hostelería de España + Edenred, Nov 2025: 14,2 €.
        // https://forbes.es/economia/833253/el-menu-del-dia-se-encarece-un-15-de-media-en-espana-hasta-los-142-euros/
        id: 'menu', value: 14.2, emoji: '🍽️',
        es: { selector: 'en menús del día', one: 'menú del día', many: 'menús del día', legend: '1 menú del día (14,20 € de media)' },
        en: { selector: 'in set lunches', one: 'set lunch', many: 'set lunches', legend: '1 Spanish set lunch, “menú del día” (€14.20 on average)' }
      },
      {
        // Pensión media de jubilación, septiembre 2026: 1.576,1 €/mes (14
        // payments). Ministerio de Inclusión via Europa Press.
        // https://www.esdiario.com/economia/260925/198648/gasto-pensiones-sube-6-3-septiembre-nuevo-maximo-14-500-millones.html
        id: 'pension', value: 1576.1, emoji: '🧓',
        es: { selector: 'en pensiones de jubilación', one: 'pensión de jubilación media', many: 'pensiones de jubilación medias', legend: '1 pensión de jubilación media de un mes (1.576 €)' },
        en: { selector: 'in monthly pensions', one: 'average monthly pension', many: 'average monthly pensions', legend: '1 month of Spain’s average retirement pension (€1,576)' }
      },
      {
        // Barómetro VN (Coches.com, Ganvam, Santander Consumer), 3T 2026:
        // 43.477 € offered price after discounts (not sales-weighted).
        // https://noticias.coches.com/informes/precios-coches-nuevos-2026-segundo-trimestre/566847
        id: 'coche', value: 43477, emoji: '🚗',
        es: { selector: 'en coches nuevos', one: 'coche nuevo', many: 'coches nuevos', legend: '1 coche nuevo (43.477 € de precio medio)' },
        en: { selector: 'in new cars', one: 'new car', many: 'new cars', legend: '1 new car (€43,477 average price in Spain)' }
      },
      {
        // No official price PER HOME exists in Spain (only €/m²): Registradores
        // ERI 2T 2026, 2.487 €/m², times a 90 m² home = 223.830 €.
        // https://www.registradores.org/documents/d/guest/eri_2t_2026
        id: 'vivienda', value: 2487 * 90, emoji: '🏠',
        es: { selector: 'en viviendas', one: 'vivienda', many: 'viviendas', legend: '1 vivienda de 90 m² al precio medio (2.487 €/m²: unos 224.000 €)' },
        en: { selector: 'in homes', one: 'home', many: 'homes', legend: 'a 90 m² home at Spain’s average price (€2,487/m²: about €224,000)' }
      },
      {
        // 400.000 € per winning décimo (20 € ticket); 328.000 € after tax.
        // https://www.aedaf.es/es/documentos/descarga/75326/fiscalidad-premios-loteria-de-navidad-2025
        id: 'gordo', value: 400000, emoji: '🎟️',
        es: { selector: 'en décimos del Gordo', one: 'décimo premiado con el Gordo', many: 'décimos premiados con el Gordo', legend: '1 décimo del Gordo de Navidad (400.000 € antes de impuestos)' },
        en: { selector: 'in Christmas lottery jackpots', one: 'winning “El Gordo” ticket', many: 'winning “El Gordo” tickets', legend: '1 winning ticket of Spain’s Christmas lottery, “El Gordo” (€400,000 before tax)' }
      },
      {
        // Neymar, Barcelona → PSG, 3-ago-2017: 222 M€ release clause. Still
        // the record in 2026.
        id: 'fichaje', value: 222000000, emoji: '⚽',
        es: { selector: 'en fichajes de Neymar', one: 'fichaje de Neymar', many: 'fichajes de Neymar', legend: '1 fichaje de Neymar por el PSG (222 millones de €, el más caro de la historia)' },
        en: { selector: 'in Neymar transfers', one: 'Neymar transfer', many: 'Neymar transfers', legend: '1 Neymar transfer to PSG (€222 million, the most expensive ever)' }
      },
      {
        // Presupuesto 2026 del Ayuntamiento de Madrid: 6.578 M€ (7.724 M€ with
        // its public companies). https://diario.madrid.es/blog/notas-de-prensa/el-pleno-aprueba-el-presupuesto-del-ayuntamiento-de-madrid-que-contara-con-6-578-millones-de-euros/
        id: 'ciudad', value: 6578000000, emoji: '🏛️',
        es: { selector: 'en presupuestos de Madrid', one: 'presupuesto anual del Ayuntamiento de Madrid', many: 'presupuestos anuales del Ayuntamiento de Madrid', legend: '1 presupuesto anual del Ayuntamiento de Madrid (6.578 millones de €, 2026)' },
        en: { selector: 'in Madrid city budgets', one: 'Madrid city budget', many: 'Madrid city budgets', legend: '1 yearly budget of Madrid City Council (€6.58 billion, 2026)' }
      },
      {
        // Nómina mensual de pensiones contributivas, septiembre 2026:
        // 14.498 M€ for 10,5 million pensions.
        // https://www.esdiario.com/economia/260925/198648/gasto-pensiones-sube-6-3-septiembre-nuevo-maximo-14-500-millones.html
        id: 'pensiones', value: 14498000000, emoji: '👵',
        es: { selector: 'en meses de pensiones', one: 'mes de pensiones', many: 'meses de pensiones', legend: '1 mes de todas las pensiones contributivas de España (14.498 millones de €)' },
        en: { selector: 'in months of pensions', one: 'month of pensions', many: 'months of pensions', legend: '1 month of all of Spain’s contributory pensions (€14.5 billion)' }
      },
      {
        // PIB nominal 2025: 1.690.012 M€. https://www.ine.es/dyngs/Prensa/CNA2025.htm
        id: 'pib', value: 1690012000000, emoji: '🌐',
        es: { selector: 'en PIB de España', one: 'año de PIB de España', many: 'años de PIB de España', legend: '1 PIB de España: todo lo que produce el país en un año (1,69 billones de €, 2025)' },
        en: { selector: 'in Spain’s GDP', one: 'year of Spain’s GDP', many: 'years of Spain’s GDP', legend: '1 year of Spain’s GDP (€1.69 trillion, 2025)' }
      }
    ]
  },
  usd: {
    code: 'USD', symbol: '$',
    year: 2026,
    country: { es: 'Estados Unidos', en: 'the United States' },
    names: { es: { one: 'dólar', many: 'dólares' }, en: { one: 'dollar', many: 'dollars' } },
    avgWage: US_AVG_WAGE,
    minWageYear: US_MIN_WAGE_HOUR * 2080,
    workHoursPerYear: 2080,
    population: US_POPULATION,
    time: [
      {
        id: 'dia', value: US_MIN_WAGE_HOUR * 8, emoji: '⏱️',
        es: { selector: 'en días de salario mínimo', one: 'día de salario mínimo', many: 'días de salario mínimo', legend: '1 día de salario mínimo federal de EE. UU. (8 horas a 7,25 $: 58 $)' },
        en: { selector: 'in days on the minimum wage', one: 'day on the minimum wage', many: 'days on the minimum wage', legend: '1 day on the federal minimum wage (8 hours at $7.25: $58)' }
      },
      {
        id: 'mes', value: US_MIN_WAGE_HOUR * 2080 / 12, emoji: '📅',
        es: { selector: 'en meses de salario mínimo', one: 'mes de salario mínimo', many: 'meses de salario mínimo', legend: '1 mes de salario mínimo federal a jornada completa (1.256,67 $; 15.080 $ al año)' },
        en: { selector: 'in months on the minimum wage', one: 'month on the minimum wage', many: 'months on the minimum wage', legend: '1 full-time month on the federal minimum wage ($1,256.67; $15,080 a year)' }
      },
      {
        id: 'ano', value: US_AVG_WAGE, emoji: '💼',
        es: { selector: 'en años de salario medio', one: 'año de salario medio', many: 'años de salario medio', legend: '1 año de salario medio bruto en EE. UU. (69.770 $, BLS)' },
        en: { selector: 'in years of average wage', one: 'year of average wage', many: 'years of average wage', legend: '1 year of the average US wage ($69,770, BLS)' }
      },
      {
        id: 'vida', value: US_AVG_WAGE * WORKING_LIFE_YEARS, emoji: '⏳',
        es: { selector: 'en vidas laborales', one: 'vida laboral entera', many: 'vidas laborales enteras', legend: '1 vida laboral: 40 años cobrando el salario medio (2,79 millones de $)' },
        en: { selector: 'in working lives', one: 'whole working life', many: 'whole working lives', legend: '1 working life: 40 years on the average wage ($2.79 million)' }
      },
      {
        id: 'empresa', value: US_AVG_WAGE * 1000, emoji: '🏢',
        es: { selector: 'en nóminas de 1.000 empleados', one: 'año de sueldos de una empresa de 1.000 empleados', many: 'años de sueldos de una empresa de 1.000 empleados', legend: '1 año de sueldos de una empresa de 1.000 empleados, a salario medio (69,8 millones de $)' },
        en: { selector: 'in 1,000-employee payrolls', one: 'year of a 1,000-employee payroll', many: 'years of a 1,000-employee payroll', legend: '1 year of payroll for a 1,000-employee company, at the average wage ($69.8 million)' }
      },
      {
        id: 'pais-dia', value: US_EMPLOYED * US_AVG_WAGE / 365, emoji: '🏭',
        es: { selector: 'en días de trabajo de todo el país', one: 'día de sueldos de todo EE. UU.', many: 'días de sueldos de todo EE. UU.', legend: '1 día de sueldos de los 163 millones de ocupados de EE. UU., a salario medio (31.200 millones de $)' },
        en: { selector: 'in days of the whole country’s work', one: 'day of wages for the whole US', many: 'days of wages for the whole US', legend: '1 day of wages for America’s 163 million workers, at the average wage ($31.2 billion)' }
      },
      {
        id: 'pais-ano', value: US_EMPLOYED * US_AVG_WAGE, emoji: '🗺️',
        es: { selector: 'en años de trabajo de todo el país', one: 'año de sueldos de todo EE. UU.', many: 'años de sueldos de todo EE. UU.', legend: '1 año de sueldos de los 163 millones de ocupados de EE. UU., a salario medio (11,4 billones de $)' },
        en: { selector: 'in years of the whole country’s work', one: 'year of wages for the whole US', many: 'years of wages for the whole US', legend: '1 year of wages for America’s 163 million workers, at the average wage ($11.4 trillion)' }
      }
    ],
    objects: [
      {
        // Powerball ticket: $2.
        id: 'billete', value: 2, emoji: '🎫',
        es: { selector: 'en boletos de Powerball', one: 'boleto de Powerball', many: 'boletos de Powerball', legend: '1 boleto de la lotería Powerball (2 $)' },
        en: { selector: 'in Powerball tickets', one: 'Powerball ticket', many: 'Powerball tickets', legend: '1 Powerball ticket ($2)' }
      },
      {
        // Zillow Observed Rent Index, January 2026: $1,895 typical asking rent.
        // https://www.zillow.com/research/data/
        id: 'alquiler', value: 1895, emoji: '🔑',
        es: { selector: 'en meses de alquiler', one: 'mes de alquiler', many: 'meses de alquiler', legend: '1 mes de alquiler típico en EE. UU. (1.895 $, Zillow)' },
        en: { selector: 'in months of rent', one: 'month of rent', many: 'months of rent', legend: '1 month of typical US rent ($1,895, Zillow)' }
      },
      {
        // Kelley Blue Book average transaction price, Aug 2026: $50,089.
        // https://www.coxautoinc.com/insights/august-2026-atp-report/
        id: 'coche', value: 50089, emoji: '🚗',
        es: { selector: 'en coches nuevos', one: 'coche nuevo', many: 'coches nuevos', legend: '1 coche nuevo en EE. UU. (50.089 $ de precio medio)' },
        en: { selector: 'in new cars', one: 'new car', many: 'new cars', legend: '1 new car ($50,089 average transaction price)' }
      },
      {
        // NAR median existing-home price, Aug 2026: $429,100.
        // https://www.nar.realtor/newsroom/nar-existing-home-sales-report-shows-2-0-decrease-in-august
        id: 'vivienda', value: 429100, emoji: '🏠',
        es: { selector: 'en viviendas', one: 'vivienda', many: 'viviendas', legend: '1 vivienda en EE. UU. (429.100 $, precio mediano)' },
        en: { selector: 'in homes', one: 'home', many: 'homes', legend: '1 home ($429,100 median existing-home price)' }
      },
      {
        // Record lottery jackpot: Powerball $2.04B, 7-Nov-2022.
        // https://abc7ny.com/largest-lottery-jackpots-biggest-jackpot-powerball-mega-millions/13519211/
        id: 'bote', value: 2040000000, emoji: '🎰',
        es: { selector: 'en botes récord de Powerball', one: 'bote récord de Powerball', many: 'botes récord de Powerball', legend: '1 bote récord de Powerball (2.040 millones de $, 2022)' },
        en: { selector: 'in record Powerball jackpots', one: 'record Powerball jackpot', many: 'record Powerball jackpots', legend: '1 record Powerball jackpot ($2.04 billion, 2022)' }
      },
      {
        // NYC adopted budget FY2027: $125.84B.
        // https://comptroller.nyc.gov/reports/comments-on-new-york-citys-fiscal-year-2027-adopted-budget/
        id: 'ciudad', value: 125840000000, emoji: '🏛️',
        es: { selector: 'en presupuestos de Nueva York', one: 'presupuesto anual de Nueva York', many: 'presupuestos anuales de Nueva York', legend: '1 presupuesto anual de la ciudad de Nueva York (125.840 millones de $)' },
        en: { selector: 'in New York City budgets', one: 'New York City budget', many: 'New York City budgets', legend: '1 yearly New York City budget ($125.84 billion, FY2027)' }
      },
      {
        // Social Security (OASDI) total cost 2025: $1,609B. 2026 Trustees Report.
        // https://www.ssa.gov/OACT/TR/2026/II_A_highlights.html
        id: 'pensiones', value: 1609000000000, emoji: '👵',
        es: { selector: 'en años de Seguridad Social', one: 'año de pensiones de la Seguridad Social', many: 'años de pensiones de la Seguridad Social', legend: '1 año de la Seguridad Social de EE. UU. (1,61 billones de $, 2025)' },
        en: { selector: 'in years of Social Security', one: 'year of Social Security', many: 'years of Social Security', legend: '1 year of Social Security ($1.61 trillion, 2025)' }
      },
      {
        // US nominal GDP 2025: $30,861.292B (BEA via FRED GDPA).
        // https://fred.stlouisfed.org/series/GDPA
        id: 'pib', value: 30861292000000, emoji: '🌐',
        es: { selector: 'en PIB de EE. UU.', one: 'año de PIB de EE. UU.', many: 'años de PIB de EE. UU.', legend: '1 PIB de EE. UU.: todo lo que produce el país en un año (30,9 billones de $, 2025)' },
        en: { selector: 'in US GDP', one: 'year of US GDP', many: 'years of US GDP', legend: '1 year of US GDP ($30.9 trillion, 2025)' }
      }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WORKING_LIFE_YEARS: WORKING_LIFE_YEARS,
    WORKING_LIFE_START_AGE: WORKING_LIFE_START_AGE,
    MONEY_CURRENCIES: MONEY_CURRENCIES
  };
}
