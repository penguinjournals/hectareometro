// Money tool (/dinero/ and /en/money/): turns an amount of money into the
// time it takes to EARN it and into things it BUYS. Loads together with
// money-data.js and hectareas-utils.js (getUrlParameter, autoGrowInput,
// share-link updaters). There is NO map, so there is no initMap callback: the
// page wiring runs on document.ready, and only if the page has the #money
// input (the iframe reuses the pure builders through js/money-iframe.js).
//
// Three views of the same amount, top to bottom:
// 1. the headline: "1 millón de euros ≈ 36 años de salario medio, o 5 viviendas";
// 2. the time panel: a bar (the amount against a 40-year working life, or a
//    timeline back through history when one life is not enough) plus a
//    pictogram on the time ladder;
// 3. the objects panel: a pictogram on the objects ladder.
// Each panel has its own "Show" selector (?vt= / ?vo=).
//
// Embeddable version: iframe-dinero.html (js/money-iframe.js), which reuses
// the URL parsing and the builders below.
//
// The builders are pure and take the currency and language explicitly, so
// build/generate.js can require() this file for the landing pages' copy.

var MAX_MONEY_ICONS = 500;

// Thresholds of the ladders: same rule as liters/kilos (>= 10 icons).
var MONEY_MIN_ICONS = 10;

// Historical marks for the timeline (calendar years, negative = BC), and the
// deep-time ones (years ago) for amounts no human history can hold.
// Approximate dates, picked to be recognisable rather than precise.
var MONEY_HISTORY = [
  { y: -9500, emoji: '🌾', es: 'nace la agricultura', en: 'farming begins' },
  { y: -2560, emoji: '🔺', es: 'la Gran Pirámide de Guiza', en: 'the Great Pyramid of Giza' },
  { y: -753, emoji: '🏛️', es: 'la fundación de Roma', en: 'the founding of Rome' },
  { y: 476, emoji: '⚔️', es: 'la caída de Roma', en: 'the fall of Rome' },
  { y: 1492, emoji: '⛵', es: 'Colón llega a América', en: 'Columbus reaches the Americas' },
  { y: 1789, emoji: '🇫🇷', es: 'la Revolución francesa', en: 'the French Revolution' },
  { y: 1969, emoji: '🌕', es: 'el ser humano pisa la Luna', en: 'the Moon landing' }
];
var MONEY_DEEP_TIME = [
  { ago: 300000, emoji: '🧍', es: 'aparece el Homo sapiens', en: 'Homo sapiens appears' },
  { ago: 66000000, emoji: '🦖', es: 'se extinguen los dinosaurios', en: 'the dinosaurs die out' },
  { ago: 4540000000, emoji: '🌍', es: 'se forma la Tierra', en: 'the Earth forms' },
  { ago: 13800000000, emoji: '💥', es: 'el Big Bang', en: 'the Big Bang' }
];

// Locale-aware formatter that works both in the browser and under node.
// Formats in en-GB and swaps the separators for es: es-ES leaves 4-digit
// numbers ungrouped ("1500"), and the site writes "1.500".
function moneyFmt(value, decimals, lang) {
  var s = value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  if (lang === 'en') {
    return s;
  }
  return s.replace(/[,.]/g, function(c) { return c === ',' ? '.' : ','; });
}

// Up to `maxDecimals` decimals, without trailing zeros: 1,5 · 2 · 1.000.
function trimFmt(value, maxDecimals, lang) {
  var decimals = 0;
  while (decimals < maxDecimals && Math.abs(value * Math.pow(10, decimals) - Math.round(value * Math.pow(10, decimals))) > 1e-9) {
    decimals++;
  }
  return moneyFmt(value, decimals, lang);
}

// Rounds to `sig` significant figures (for big counts: "≈ 66.700.000 menús").
function roundSig(value, sig) {
  if (value === 0) {
    return 0;
  }
  var magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(value))) - sig + 1);
  return Math.round(value / magnitude) * magnitude;
}

// A plain number with as many decimals as it deserves: 1,5 · 36 · 2.400.
function niceNumber(value, lang) {
  if (value < 1) {
    return moneyFmt(value, value < 0.1 ? 2 : 1, lang);
  }
  if (value >= 10000) {
    return moneyFmt(roundSig(value, 3), 0, lang);
  }
  if (value >= 10 || Math.abs(value - Math.round(value)) < 0.05) {
    return moneyFmt(Math.round(value), 0, lang);
  }
  return moneyFmt(value, value < 0.1 ? 2 : 1, lang);
}

function moneyCurrency(curId) {
  return MONEY_CURRENCIES[curId] || MONEY_CURRENCIES.eur;
}

// The amount in words, the way the press writes it in each language.
// es: "1.500 €", "1 millón de euros", "1.600 millones de euros", "2 billones
//     de euros" (billón = 10¹²; 10⁹ is "mil millones").
// en: "€1,500", "$1 million", "$1.6 billion", "$2 trillion" (short scale).
function moneyText(amount, curId, lang) {
  var cur = moneyCurrency(curId);
  var names = cur.names[lang];
  var num = function(v) {
    return trimFmt(v >= 10000 ? roundSig(v, 3) : v, v < 10 ? 2 : 1, lang);
  };
  if (lang === 'es') {
    var curWord = names.many;
    if (amount >= 1e12) {
      var b = amount / 1e12;
      return num(b) + (b === 1 ? ' billón de ' : ' billones de ') + curWord;
    }
    if (amount >= 1e6) {
      var m = amount / 1e6;
      return num(m) + (m === 1 ? ' millón de ' : ' millones de ') + curWord;
    }
    return moneyFmt(amount, amount === Math.round(amount) ? 0 : 2, lang) + ' ' + cur.symbol;
  }
  var scales = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']];
  for (var i = 0; i < scales.length; i++) {
    if (amount >= scales[i][0]) {
      return cur.symbol + num(amount / scales[i][0]) + ' ' + scales[i][1];
    }
  }
  return cur.symbol + moneyFmt(amount, amount === Math.round(amount) ? 0 : 2, lang);
}

function moneyUnitById(ladder, id) {
  for (var i = 0; i < ladder.length; i++) {
    if (ladder[i].id === id) {
      return ladder[i];
    }
  }
  return null;
}

// First rung (from the largest down) that yields at least 10 icons; the
// smallest rung when even that draws fewer. When the rungs are far apart and
// the pick would overflow the icon cap, a few big icons beat a capped wall of
// small ones, so step up to the next rung.
function pickMoneyUnit(amount, ladder) {
  for (var i = ladder.length - 1; i >= 0; i--) {
    if (amount / ladder[i].value >= MONEY_MIN_ICONS) {
      if (amount / ladder[i].value > MAX_MONEY_ICONS && i < ladder.length - 1) {
        return ladder[i + 1];
      }
      return ladder[i];
    }
  }
  return ladder[0];
}

var MONEY_TEXTS = {
  es: {
    each: 'Cada',
    capNote: function(total) { return ' (se muestran ' + MAX_MONEY_ICONS + ' de ' + total + ')'; },
    or: ', o ',
    perCapita: function(v, country, pop) { return '≈ ' + v + ' por cada habitante de ' + country + ' (' + pop + ')'; },
    millionPeople: ' millones de habitantes',
    minutes: function(n) { return n + (n === '1' ? ' minuto' : ' minutos'); },
    hours: function(n) { return n + (n === '1' ? ' hora' : ' horas'); },
    days: function(n) { return n + (n === '1' ? ' día' : ' días'); },
    months: function(n) { return n + (n === '1' ? ' mes' : ' meses'); },
    years: function(n) { return n + (n === '1' ? ' año' : ' años'); },
    age: function(n) { return n + ' años'; },
    today: 'hoy',
    lifeCaption: function(wage, dur, endAge) {
      return 'Cobrando el salario medio (' + wage + ' al año) y sin gastar nada, tardarías <b>' + dur
        + '</b> en ganarlo' + (endAge ? ': empezando a trabajar a los 25, lo juntarías a los ' + endAge + '.' : '.');
    },
    historyCaption: function(wage, year, lives) {
      return 'Ni una vida laboral entera basta: cobrando el salario medio (' + wage + ' al año) y sin gastar nada, '
        + 'tendrías que haber empezado a trabajar en <b>' + year + '</b> y no parar ni un día hasta hoy. '
        + 'Son ' + lives + ' vidas laborales seguidas.';
    },
    deepCaption: function(wage, ago, lives, era) {
      return 'Cobrando el salario medio (' + wage + ' al año) y sin gastar nada, tendrías que haber empezado a trabajar '
        + '<b>hace ' + ago + '</b>, ' + era + ', y no parar hasta hoy: ' + lives + ' vidas laborales seguidas.';
    },
    eras: ['en plena prehistoria', 'antes de que existiera el ser humano', 'cuando aún vivían los dinosaurios',
      'antes incluso de los dinosaurios', 'antes de que existiera la Tierra'],
    universeCaption: function(wage, times) {
      return 'Cobrando el salario medio (' + wage + ' al año) ni trabajando desde el Big Bang llegarías: '
        + 'harían falta <b>' + times + ' veces la edad del universo</b>.';
    },
    yearLabel: function(y) { return y > 0 ? 'el año ' + y : 'el año ' + (-y || 1) + ' a. C.'; },
    shortYear: function(y) { return y > 0 ? String(y) : (-y || 1) + ' a. C.'; },
    agoText: function(v) {
      if (v >= 1e9) { return moneyFmt(v / 1e9, 1, 'es').replace(',0', '') + ' mil millones de años'; }
      if (v >= 1e6) { return niceNumber(v / 1e6, 'es') + ' millones de años'; }
      return niceNumber(v, 'es') + ' años';
    },
    alongTheWay: 'Por el camino: ',
    lifeBarLabel: 'Vida laboral (de los 25 a los 65 años)'
  },
  en: {
    each: 'Each',
    capNote: function(total) { return ' (showing ' + MAX_MONEY_ICONS + ' of ' + total + ')'; },
    or: ', or ',
    perCapita: function(v, country, pop) { return '≈ ' + v + ' for every person in ' + country + ' (' + pop + ')'; },
    millionPeople: ' million people',
    minutes: function(n) { return n + (n === '1' ? ' minute' : ' minutes'); },
    hours: function(n) { return n + (n === '1' ? ' hour' : ' hours'); },
    days: function(n) { return n + (n === '1' ? ' day' : ' days'); },
    months: function(n) { return n + (n === '1' ? ' month' : ' months'); },
    years: function(n) { return n + (n === '1' ? ' year' : ' years'); },
    age: function(n) { return 'age ' + n; },
    today: 'today',
    lifeCaption: function(wage, dur, endAge) {
      return 'On the average wage (' + wage + ' a year) and spending nothing, it would take you <b>' + dur
        + '</b> to earn it' + (endAge ? ': starting work at 25, you would have it at ' + endAge + '.' : '.');
    },
    historyCaption: function(wage, year, lives) {
      return 'One working life is not enough: on the average wage (' + wage + ' a year) and spending nothing, '
        + 'you would have had to start work in <b>' + year + '</b> and never stop until today. '
        + 'That is ' + lives + ' working lives back to back.';
    },
    deepCaption: function(wage, ago, lives, era) {
      return 'On the average wage (' + wage + ' a year) and spending nothing, you would have had to start work '
        + '<b>' + ago + ' ago</b>, ' + era + ', and never stop until today: ' + lives + ' working lives back to back.';
    },
    eras: ['deep in prehistory', 'before humans existed', 'while the dinosaurs still roamed',
      'before even the dinosaurs', 'before the Earth existed'],
    universeCaption: function(wage, times) {
      return 'On the average wage (' + wage + ' a year) not even working since the Big Bang would do: '
        + 'it would take <b>' + times + ' times the age of the universe</b>.';
    },
    yearLabel: function(y) { return y > 0 ? 'AD ' + y : (-y || 1) + ' BC'; },
    shortYear: function(y) { return y > 0 ? String(y) : (-y || 1) + ' BC'; },
    agoText: function(v) {
      if (v >= 1e9) { return moneyFmt(v / 1e9, 1, 'en').replace('.0', '') + ' billion years'; }
      if (v >= 1e6) { return niceNumber(v / 1e6, 'en') + ' million years'; }
      return niceNumber(v, 'en') + ' years';
    },
    alongTheWay: 'Along the way: ',
    lifeBarLabel: 'Working life (age 25 to 65)'
  }
};

function moneyCountText(count, unit, lang) {
  var name = (count >= 0.95 && count < 1.05) ? unit[lang].one : unit[lang].many;
  return '≈ ' + niceNumber(count, lang) + ' ' + name;
}

// Builds everything one pictogram block needs. Pure: returns
// { rowsHtml, sizeClass, countText, legendText, ariaLabel }.
function buildMoneyPictogram(amount, unit, lang) {
  var T = MONEY_TEXTS[lang];
  var count = amount / unit.value;
  var whole = Math.floor(count);
  var frac = count - whole;
  var capped = whole >= MAX_MONEY_ICONS && count > MAX_MONEY_ICONS;
  var iconsWhole = Math.min(whole, MAX_MONEY_ICONS);
  var showFrac = !capped && count > 0 && (frac >= 0.02 || whole === 0);
  var fracPct = Math.min(99, Math.max(2, Math.round(frac * 100)));
  var totalIcons = iconsWhole + (showFrac ? 1 : 0);

  var icons = [];
  // When capped, the 500th slot becomes an ellipsis: the wall of icons should
  // read as "it keeps going", not as the full amount.
  var emojiCount = capped ? iconsWhole - 1 : iconsWhole;
  for (var i = 0; i < emojiCount; i++) {
    icons.push('<span class="picto">' + unit.emoji + '</span>');
  }
  if (capped) {
    icons.push('<span class="picto picto-more">…</span>');
  }
  if (showFrac) {
    icons.push('<span class="picto"><span class="picto-clip" style="width:' + fracPct + '%">' + unit.emoji + '</span></span>');
  }
  var rows = [];
  for (var r = 0; r < icons.length; r += 10) {
    rows.push('<div class="picto-row">' + icons.slice(r, r + 10).join('') + '</div>');
  }

  var sizeClass = totalIcons <= 50 ? 'picto-l' : totalIcons <= 150 ? 'picto-m' : totalIcons <= 300 ? 'picto-s' : 'picto-xs';
  var countText = moneyCountText(count, unit, lang);
  if (capped) {
    countText += T.capNote(niceNumber(count, lang));
  }
  var legendText = T.each + ' ' + unit.emoji + ' = ' + unit[lang].legend;
  return {
    rowsHtml: rows.join(''),
    sizeClass: sizeClass,
    countText: countText,
    legendText: legendText,
    ariaLabel: countText + '. ' + legendText
  };
}

// "1 millón de euros ≈ 36 años de salario medio, o 5 viviendas". Plain text.
function buildMoneyHeadline(amount, curId, timeUnit, objUnit, lang) {
  var T = MONEY_TEXTS[lang];
  var timePart = moneyCountText(amount / timeUnit.value, timeUnit, lang).replace(/^≈ /, '');
  var objPart = moneyCountText(amount / objUnit.value, objUnit, lang).replace(/^≈ /, '');
  return moneyText(amount, curId, lang) + ' ≈ ' + timePart + T.or + objPart;
}

// "≈ 20 € por cada habitante de España (49,4 millones de habitantes)". Empty
// below one cent per person, where it says nothing.
function buildPerCapita(amount, curId, lang) {
  var cur = moneyCurrency(curId);
  var T = MONEY_TEXTS[lang];
  var per = amount / cur.population;
  if (per < 0.01) {
    return '';
  }
  var pop = moneyFmt(cur.population / 1e6, 1, lang) + T.millionPeople;
  return T.perCapita(moneyText(per >= 100 ? Math.round(per) : Math.round(per * 100) / 100, curId, lang), cur.country[lang], pop);
}

// How long the average wage takes to earn `years` worth of it, in the
// largest unit that reads naturally (working hours → days → months → years).
function moneyDurationText(years, curId, lang) {
  var cur = moneyCurrency(curId);
  var T = MONEY_TEXTS[lang];
  var hours = years * cur.workHoursPerYear;
  if (hours < 1) {
    return T.minutes(String(Math.max(1, Math.round(hours * 60))));
  }
  if (hours < 8) {
    return T.hours(niceNumber(Math.max(hours, 0.1), lang));
  }
  var days = hours / 8;
  if (years < 1 / 12) {
    return T.days(niceNumber(days, lang));
  }
  if (years < 1) {
    return T.months(niceNumber(years * 12, lang));
  }
  return T.years(niceNumber(years, lang));
}

// Picks the marks that fit on the bar: most recent first, at least `gap`
// (fraction of the bar) apart from each other and from both ends.
function pickBarMarks(marks, gap) {
  var chosen = [];
  marks.forEach(function(m) {
    if (m.pos < gap || m.pos > 1 - gap / 2) {
      return;
    }
    for (var i = 0; i < chosen.length; i++) {
      if (Math.abs(chosen[i].pos - m.pos) < gap) {
        return;
      }
    }
    chosen.push(m);
  });
  return chosen.sort(function(a, b) { return a.pos - b.pos; });
}

function barHtml(fillPct, ticks, marks, ariaLabel) {
  var html = '<div class="money-bar" role="img" aria-label="' + ariaLabel.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;') + '">';
  html += '<div class="money-bar-track"><div class="money-bar-fill" style="width:' + fillPct.toFixed(2) + '%"></div>';
  marks.forEach(function(m) {
    html += '<span class="money-bar-mark" style="left:' + (m.pos * 100).toFixed(2) + '%" title="' + m.title + '">' + m.emoji + '</span>';
  });
  html += '</div><div class="money-bar-ticks">';
  ticks.forEach(function(t) {
    html += '<span class="money-bar-tick" style="left:' + (t.pos * 100).toFixed(2) + '%">' + t.label + '</span>';
  });
  return html + '</div></div>';
}

// The time bar. Pure: returns { html, caption, legend } (caption is HTML).
// - Up to one working life: the amount against 40 years of average wage
//   (age 25 to 65), filled up to when you would have it.
// - Beyond: a timeline from the year you would have had to start working
//   until today, with the history (or deep time) it crosses.
function buildMoneyTimeBar(amount, curId, lang, nowYear) {
  var cur = moneyCurrency(curId);
  var T = MONEY_TEXTS[lang];
  var years = amount / cur.avgWage;
  var wage = moneyText(Math.round(cur.avgWage), curId, lang);
  var life = WORKING_LIFE_YEARS;

  if (years <= life) {
    var ticks = [];
    for (var a = 0; a <= life; a += 10) {
      ticks.push({ pos: a / life, label: T.age(String(WORKING_LIFE_START_AGE + a)) });
    }
    var endAge = years >= 1 ? String(Math.min(WORKING_LIFE_START_AGE + life, Math.round(WORKING_LIFE_START_AGE + years))) : '';
    var caption = T.lifeCaption(wage, moneyDurationText(years, curId, lang), endAge);
    return {
      html: barHtml(Math.max(0.5, years / life * 100), ticks, [], T.lifeBarLabel + '. ' + caption),
      caption: caption,
      legend: ''
    };
  }

  var lives = niceNumber(years / life, lang);
  var startYear = Math.round(nowYear - years);
  var universe = MONEY_DEEP_TIME[MONEY_DEEP_TIME.length - 1].ago;
  if (years >= universe) {
    return { html: '', caption: T.universeCaption(wage, niceNumber(years / universe, lang)), legend: '' };
  }
  // History and deep-time marks share the bar: each lands wherever it falls
  // (pickBarMarks drops the ones outside it).
  var marks = MONEY_HISTORY.map(function(h) {
    return { pos: (h.y - startYear) / years, emoji: h.emoji, title: h[lang], when: T.shortYear(h.y) };
  }).concat(MONEY_DEEP_TIME.map(function(d) {
    return { pos: 1 - d.ago / years, emoji: d.emoji, title: d[lang], when: '' };
  })).reverse();
  var startLabel, captionB;
  if (startYear > -12000) {
    startLabel = T.shortYear(startYear);
    captionB = T.historyCaption(wage, T.yearLabel(startYear), lives);
  } else {
    var eraIndex = years < 300000 ? 0 : years < 66000000 ? 1 : years < 230000000 ? 2 : years < 4540000000 ? 3 : 4;
    startLabel = '−' + T.agoText(years);
    captionB = T.deepCaption(wage, T.agoText(years), lives, T.eras[eraIndex]);
  }
  var shown = pickBarMarks(marks, 0.09);
  var legend = shown.length
    ? T.alongTheWay + shown.map(function(m) { return m.emoji + ' ' + m.title + (m.when ? ' (' + m.when + ')' : ''); }).join(' · ')
    : '';
  var ticksB = [{ pos: 0, label: startLabel }, { pos: 1, label: T.today }];
  return {
    html: barHtml(100, ticksB, shown, captionB),
    caption: captionB,
    legend: legend
  };
}

// Accepts "1.500", "1,5", "1.500,25" (es) and "1,500", "1.5" (en): a
// separator followed by exactly three digits is a thousands separator, any
// other is the decimal point. Returns null for empty/invalid/non-positive.
function parseMoney(value) {
  var s = String(value).replace(/\s|€|\$|£/g, '');
  if (!s) {
    return null;
  }
  var lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  var intPart = s;
  var decPart = '';
  if (lastSep >= 0 && !/^\d{3}$/.test(s.slice(lastSep + 1))) {
    intPart = s.slice(0, lastSep);
    decPart = s.slice(lastSep + 1);
  }
  var v = parseFloat(intPart.replace(/[.,]/g, '') + (decPart ? '.' + decPart : ''));
  return (isNaN(v) || v <= 0) ? null : v;
}

// The scales offered next to the amount box. es writes "1.600 millones" (it
// skips "mil millones" unless the number is round), en "1.6 billion".
var MONEY_SCALES = [1, 1e3, 1e6, 1e9, 1e12];

function pickMoneyScale(amount, lang) {
  for (var i = MONEY_SCALES.length - 1; i >= 0; i--) {
    var v = amount / MONEY_SCALES[i];
    if (v < 1) {
      continue;
    }
    var exact = Math.abs(v - Math.round(v)) < 1e-9;
    var threeDecimals = Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;
    if (exact || (lang === 'en' && threeDecimals)) {
      return MONEY_SCALES[i];
    }
  }
  return 1;
}

// Lets build/generate.js reuse the builders for the landing pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  var moneyData = require('./money-data.js');
  MONEY_CURRENCIES = moneyData.MONEY_CURRENCIES;
  WORKING_LIFE_YEARS = moneyData.WORKING_LIFE_YEARS;
  WORKING_LIFE_START_AGE = moneyData.WORKING_LIFE_START_AGE;
  module.exports = {
    MAX_MONEY_ICONS: MAX_MONEY_ICONS,
    moneyFmt: moneyFmt,
    trimFmt: trimFmt,
    moneyText: moneyText,
    niceNumber: niceNumber,
    moneyUnitById: moneyUnitById,
    pickMoneyUnit: pickMoneyUnit,
    buildMoneyPictogram: buildMoneyPictogram,
    buildMoneyHeadline: buildMoneyHeadline,
    buildPerCapita: buildPerCapita,
    buildMoneyTimeBar: buildMoneyTimeBar,
    moneyDurationText: moneyDurationText,
    parseMoney: parseMoney,
    pickMoneyScale: pickMoneyScale
  };
}

// ---------------------------------------------------------------------------
// Page wiring (browser only from here on).
// ---------------------------------------------------------------------------

var MONEY_STRINGS = {
  es: {
    scaleNames: { 1: '', 1000: 'mil', 1000000: 'millones de', 1000000000: 'mil millones de', 1000000000000: 'billones de' },
    autoOption: 'automático',
    shareText: function(text) { return '¿Cuánto es de verdad ' + text + '?'; },
    shareDefault: 'El dinero, medido en tiempo de trabajo y en cosas que conoces'
  },
  en: {
    scaleNames: { 1: '', 1000: 'thousand', 1000000: 'million', 1000000000: 'billion', 1000000000000: 'trillion' },
    autoOption: 'automatic',
    shareText: function(text) { return 'How much is ' + text + ', really?'; },
    shareDefault: 'Money, measured in working time and in things you know'
  }
};

if (typeof $ !== 'undefined') {
  var moneyLang = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'en' : 'es';

  // Language defaults: euros on the Spanish page, dollars on the English one.
  // One million matches the section H1.
  var baseCurrency = moneyLang === 'en' ? 'usd' : 'eur';
  var baseMoney = 1000000;
  // Which ladder rungs the drawings use ('auto' = picked automatically).
  var baseTimeView = 'auto';
  var baseObjView = 'auto';

  // hectareas-utils.js reads the global baseUrl when building share links.
  var baseUrl = moneyLang === 'en'
    ? 'https://hectareometro.com/en/money/'
    : 'https://hectareometro.com/dinero/';

  var iframeWidth = 500;
  var iframeHeight = 600;
  // Read by updateIframeShare() in hectareas-utils.js.
  var iframeBaseUrl = 'https://hectareometro.com/iframe-dinero.html';

  var moneyI18n = function() {
    return MONEY_STRINGS[moneyLang];
  };

  // Rungs for the current amount: the URL/selector choice when it exists in
  // this currency's ladder, the automatic pick otherwise.
  var resolveMoneyUnits = function(amount, curId, vt, vo) {
    var cur = MONEY_CURRENCIES[curId];
    return {
      time: (vt && vt !== 'auto' && moneyUnitById(cur.time, vt)) || pickMoneyUnit(amount, cur.time),
      obj: (vo && vo !== 'auto' && moneyUnitById(cur.objects, vo)) || pickMoneyUnit(amount, cur.objects)
    };
  };

  // html2canvas and the QR generator are only needed if the user asks for the
  // image, so they load from the CDN on the first click.
  var loadScriptOnce = function(src, isLoaded, callback) {
    if (isLoaded()) {
      callback();
      return;
    }
    var script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  };

  var loadImageLibs = function(callback) {
    loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      function() { return !!window.html2canvas; },
      function() {
        loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
          function() { return !!window.QRCode; },
          callback);
      });
  };

  // Builds an off-screen infographic (brand header, the question, the
  // headline, the time bar, both pictograms and a footer with the clean URL
  // plus a QR pointing at this exact comparison) and downloads it as PNG.
  var downloadMoneyImage = function() {
    var amount = currentAmount();
    if (amount === null) {
      return;
    }
    loadImageLibs(function() {
      var curId = currentCurrency();
      var shareUrl = baseUrl + '?' + jQuery.param(moneyShareParams());
      var brand = moneyLang === 'en' ? 'Hectareometer' : 'Hectareómetro';
      var title = moneyI18n().shareText(moneyText(amount, curId, moneyLang));
      var block = function(prefix) {
        return $('<div>')
          .append($('<div>', { 'class': $('#' + prefix + '-picto').attr('class'), html: $('#' + prefix + '-picto').html() }))
          .append($('<p>', { 'class': 'capture-count', text: $('#' + prefix + '-count').text() }))
          .append($('<p>', { 'class': 'capture-legend', text: $('#' + prefix + '-legend').text() }));
      };
      var $capture = $('<div>', { id: 'picto-capture' })
        .append($('<div>', { id: 'capture-header', text: brand }))
        .append($('<p>', { id: 'capture-title', text: title }))
        .append($('<p>', { id: 'capture-phrase', text: $('#money-headline').text() }))
        .append($('<div>', { html: $('#money-bar').html() }))
        .append($('<p>', { 'class': 'capture-legend', text: $('#money-bar-caption').text() }))
        .append(block('money-time'))
        .append(block('money-obj'))
        .append($('<p>', { 'class': 'capture-legend', text: $('#money-percapita').text() }));
      var $qr = $('<div>', { id: 'capture-qr' });
      var qrCaption = moneyLang === 'en' ? 'See it on the Hectareometer' : 'Ver en el hectareómetro';
      $capture.append($('<div>', { id: 'capture-footer' })
        .append($('<span>', { id: 'capture-url', text: baseUrl.replace('https://', '') }))
        .append($('<div>', { id: 'capture-qr-block' })
          .append($qr)
          .append($('<span>', { id: 'capture-qr-caption', text: qrCaption }))));
      $('body').append($capture);
      new QRCode($qr[0], { text: shareUrl, width: 96, height: 96 });

      // qrcodejs swaps its canvas for an <img> with a data URL; give it a
      // beat to load before capturing.
      setTimeout(function() {
        html2canvas($capture[0], { backgroundColor: '#ffffff', scale: 2 }).then(function(canvas) {
          var link = document.createElement('a');
          link.download = 'hectareometro-' + amount + '-' + curId + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          $capture.remove();
        });
      }, 100);
    });
  };

  // The select carries "<currency>:<scale>": "eur:1000000" = millones de euros.
  var populateScaleSelector = function() {
    var $select = $('#money-scale');
    $select.empty();
    Object.keys(MONEY_CURRENCIES).forEach(function(curId) {
      var cur = MONEY_CURRENCIES[curId];
      var $group = $('<optgroup>', { label: cur.names[moneyLang].many + ' (' + cur.country[moneyLang] + ')' });
      MONEY_SCALES.forEach(function(scale) {
        var scaleName = moneyI18n().scaleNames[scale];
        var text;
        if (moneyLang === 'es') {
          text = (scaleName ? scaleName + ' ' : '') + cur.names.es.many;
        } else {
          text = (scaleName ? scaleName + ' ' : '') + cur.names.en.many;
        }
        $group.append($('<option>', { value: curId + ':' + scale, text: text }));
      });
      $select.append($group);
    });
  };

  var populateViewSelector = function(selector, ladder, current) {
    var $select = $(selector);
    $select.empty();
    $select.append($('<option>', { value: 'auto', text: moneyI18n().autoOption }));
    ladder.forEach(function(u) {
      $select.append($('<option>', { value: u.id, text: u.emoji + ' ' + u[moneyLang].selector }));
    });
    $select.val(moneyUnitById(ladder, current) ? current : 'auto');
  };

  var currentCurrency = function() {
    return String($('#money-scale').val()).split(':')[0];
  };

  var currentAmount = function() {
    var v = parseMoney($('#money').val());
    if (v === null) {
      return null;
    }
    return v * Number(String($('#money-scale').val()).split(':')[1]);
  };

  // URL scheme: ?m=<full amount>&c=<eur|usd>&vt=<time rung>&vo=<object rung>
  var initializeMoneyParametersIfSet = function() {
    var paramAmount = getUrlParameter('m');
    var paramCur = getUrlParameter('c');
    var paramVt = getUrlParameter('vt');
    var paramVo = getUrlParameter('vo');
    if (paramCur != undefined && MONEY_CURRENCIES[paramCur]) {
      baseCurrency = paramCur;
    }
    if (paramAmount != undefined && parseMoney(paramAmount) !== null) {
      baseMoney = parseMoney(paramAmount);
    }
    if (paramVt != undefined) {
      baseTimeView = paramVt;
    }
    if (paramVo != undefined) {
      baseObjView = paramVo;
    }
  };

  var moneyShareParams = function() {
    var amount = currentAmount();
    var params = { m: amount === null ? '' : String(amount), c: currentCurrency() };
    var vt = $('#money-time-unit').val();
    var vo = $('#money-obj-unit').val();
    if (vt && vt !== 'auto') {
      params.vt = vt;
    }
    if (vo && vo !== 'auto') {
      params.vo = vo;
    }
    return params;
  };

  var generateMoneySharingButtons = function() {
    var params = moneyShareParams();
    var shareUrl = baseUrl + '?' + jQuery.param(params);
    var amount = currentAmount();
    var shareText = amount === null ? moneyI18n().shareDefault : moneyI18n().shareText(moneyText(amount, params.c, moneyLang));
    updateWhatsappShareLink(shareUrl, shareText);
    updateTwitterShareLink(shareUrl, shareText);
    updateFacebookShareLink(shareUrl, shareText);
    updateUrlShareLink(shareUrl);
    // The iframe needs the language too (the page URL carries it in its path).
    var str = jQuery.param(params);
    updateIframeShare(moneyLang === 'en' ? str + '&hl=en' : str, iframeWidth, iframeHeight);
  };

  var renderPicto = function(prefix, amount, unit) {
    var picto = buildMoneyPictogram(amount, unit, moneyLang);
    $('#' + prefix + '-picto')
      .html(picto.rowsHtml)
      .attr('class', 'money-picto ' + picto.sizeClass)
      .attr('aria-label', picto.ariaLabel);
    $('#' + prefix + '-count').text(picto.countText);
    $('#' + prefix + '-legend').text(picto.legendText);
  };

  var refreshMoneyViz = function() {
    var amount = currentAmount();
    if (amount === null) {
      $('#money-time-picto, #money-obj-picto').empty().removeAttr('aria-label');
      $('#money-headline, #money-percapita, #money-bar, #money-bar-caption, #money-bar-legend, #money-time-count, #money-time-legend, #money-obj-count, #money-obj-legend, #equivalences').empty();
      return;
    }
    var curId = currentCurrency();
    var cur = MONEY_CURRENCIES[curId];
    var units = resolveMoneyUnits(amount, curId, $('#money-time-unit').val(), $('#money-obj-unit').val());
    var timeUnit = units.time;
    var objUnit = units.obj;
    // Written out in full: the selector already says "millones"/"billion".
    var full = trimFmt(amount, 2, moneyLang);
    $('#equivalences').text('= ' + (moneyLang === 'en' ? cur.symbol + full : full + ' ' + cur.symbol));
    $('#money-headline').text(buildMoneyHeadline(amount, curId, timeUnit, objUnit, moneyLang));
    var bar = buildMoneyTimeBar(amount, curId, moneyLang, new Date().getFullYear());
    $('#money-bar').html(bar.html);
    $('#money-bar-caption').html(bar.caption);
    $('#money-bar-legend').text(bar.legend);
    renderPicto('money-time', amount, timeUnit);
    renderPicto('money-obj', amount, objUnit);
    $('#money-percapita').text(buildPerCapita(amount, curId, moneyLang));
  };

  $(document).ready(function() {
    if (!$('#money').length) {
      return;
    }
    // Landing pages preset the amount (in the page's default currency); URL
    // params override.
    if (typeof PRESET_MONEY !== 'undefined') {
      baseMoney = PRESET_MONEY;
    }
    initializeMoneyParametersIfSet();
    populateScaleSelector();
    var scale = pickMoneyScale(baseMoney, moneyLang);
    $('#money-scale').val(baseCurrency + ':' + scale);
    $('#money').val(trimFmt(baseMoney / scale, 3, moneyLang));
    var cur = MONEY_CURRENCIES[baseCurrency];
    populateViewSelector('#money-time-unit', cur.time, baseTimeView);
    populateViewSelector('#money-obj-unit', cur.objects, baseObjView);
    autoGrowInput('#money');
    $('#iframe-share-width').val(iframeWidth);
    $('#iframe-share-height').val(iframeHeight);

    var onInputChange = function() {
      refreshMoneyViz();
      generateMoneySharingButtons();
    };
    $('#money').keyup(onInputChange);
    $('#money-time-unit, #money-obj-unit').change(onInputChange);
    // A currency change swaps both ladders (each country has its own rungs).
    $('#money-scale').change(function() {
      var c = MONEY_CURRENCIES[currentCurrency()];
      populateViewSelector('#money-time-unit', c.time, $('#money-time-unit').val());
      populateViewSelector('#money-obj-unit', c.objects, $('#money-obj-unit').val());
      onInputChange();
    });
    $('#picto-download').click(function(e) {
      e.preventDefault();
      downloadMoneyImage();
    });
    $('#iframe-share-width, #iframe-share-height').keyup(function() {
      iframeWidth = $('#iframe-share-width').val();
      iframeHeight = $('#iframe-share-height').val();
      generateMoneySharingButtons();
    });
    refreshMoneyViz();
    generateMoneySharingButtons();
  });
}
