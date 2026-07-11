// Liters tool (/litros/ and /en/liters/): draws a quantity of water as rows of
// isotype-style pictograms. Loads together with liters-data.js and
// hectareas-utils.js (getUrlParameter, autoGrowInput, share-link updaters).
// There is NO map here, so there is no initMap callback: the page wiring runs
// on document.ready, and only if the page has the #liters input (the iframe
// reuses the pure builders below through js/liters-iframe.js).
//
// The builders (pickLiterUnit, buildPictogram, buildLiterPhrase) are pure and
// take the language explicitly, so build/generate.js can require() this file
// to produce the landing pages' copy without jQuery or a browser.

var MAX_LITER_ICONS = 500;

// Above this |log(ratio)| (~±35%) no entity/period combination reads as
// natural, so the phrase falls back to "N people in a day".
var PHRASE_MAX_SCORE = 0.3;

// Locale-aware formatter that works both in the browser and under node
// (hectareas-utils' formatNumberLocale needs the page's PAGE_LANG global).
function litersFmt(value, decimals, lang) {
  return value.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function literUnitById(id) {
  for (var i = 0; i < LITER_UNITS.length; i++) {
    if (LITER_UNITS[i].id === id) {
      return LITER_UNITS[i];
    }
  }
  return null;
}

// First rung (from the largest down) that yields at least 10 icons; the
// smallest rung (glass) when even that draws fewer. When the rungs are far
// apart and the pick would overflow the icon cap (e.g. 100,000 L = 667
// bathtubs but only 3.3 tanker trucks), a few big icons beat a capped wall
// of small ones, so step up to the next rung.
function pickLiterUnit(liters) {
  for (var i = LITER_UNITS.length - 1; i >= 0; i--) {
    if (liters / LITER_UNITS[i].liters >= 10) {
      if (liters / LITER_UNITS[i].liters > MAX_LITER_ICONS && i < LITER_UNITS.length - 1) {
        return LITER_UNITS[i + 1];
      }
      return LITER_UNITS[i];
    }
  }
  return LITER_UNITS[0];
}

var LITER_TEXTS = {
  es: {
    each: 'Cada',
    capNote: function(total) { return ' (se muestran ' + MAX_LITER_ICONS + ' de ' + total + ')'; },
    lessThanADay: {
      beber: 'menos de lo que bebes tú en un día',
      hogar: 'menos del consumo doméstico de agua de una persona en un día'
    },
    personal: {
      beber: function(period) { return 'lo que bebes tú en ' + period; },
      hogar: function(period) { return 'el consumo doméstico de agua de una persona durante ' + period; }
    },
    entity: {
      beber: function(name, pop, period) { return 'lo que bebe la población de ' + name + ' (' + pop + ') en ' + period; },
      hogar: function(name, pop, period) { return 'el consumo doméstico de agua de ' + name + ' (' + pop + ') durante ' + period; }
    },
    generic: {
      beber: function(n) { return 'lo que beben ' + n + ' personas en un día'; },
      hogar: function(n) { return 'el consumo doméstico de agua de ' + n + ' personas en un día'; }
    },
    inhabitants: ' hab.',
    millionInhabitants: ' M hab.'
  },
  en: {
    each: 'Each',
    capNote: function(total) { return ' (showing ' + MAX_LITER_ICONS + ' of ' + total + ')'; },
    lessThanADay: {
      beber: 'less than what you drink in a day',
      hogar: 'less than one person’s household water use for a day'
    },
    personal: {
      beber: function(period) { return 'what you drink in ' + period; },
      hogar: function(period) { return 'one person’s household water use for ' + period; }
    },
    entity: {
      beber: function(name, pop, period) { return 'what the population of ' + name + ' (' + pop + ') drinks in ' + period; },
      hogar: function(name, pop, period) { return 'the household water use of ' + name + ' (' + pop + ') for ' + period; }
    },
    generic: {
      beber: function(n) { return 'what ' + n + ' people drink in a day'; },
      hogar: function(n) { return 'the household water use of ' + n + ' people for a day'; }
    },
    inhabitants: ' people',
    millionInhabitants: 'M people'
  }
};

function literCountText(count, unit, lang) {
  var decimals;
  if (Math.abs(count - Math.round(count)) < 0.005) {
    decimals = 0;
  } else {
    decimals = count < 0.1 ? 2 : 1;
  }
  var name = (count >= 0.95 && count < 1.05) ? unit[lang].one : unit[lang].many;
  return '≈ ' + litersFmt(count, decimals, lang) + ' ' + name;
}

// Builds everything the pictogram block needs. Pure: returns
// { rowsHtml, sizeClass, countText, legendText, ariaLabel }.
function buildPictogram(liters, unit, lang) {
  var T = LITER_TEXTS[lang];
  var count = liters / unit.liters;
  var whole = Math.floor(count);
  var frac = count - whole;
  var capped = whole >= MAX_LITER_ICONS && count > MAX_LITER_ICONS;
  var iconsWhole = Math.min(whole, MAX_LITER_ICONS);
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
    // The fixed-width .picto reserves the full slot; the inner .picto-clip
    // crops the emoji horizontally to the fraction (isotype-style).
    icons.push('<span class="picto"><span class="picto-clip" style="width:' + fracPct + '%">' + unit.emoji + '</span></span>');
  }
  var rows = [];
  for (var r = 0; r < icons.length; r += 10) {
    rows.push('<div class="picto-row">' + icons.slice(r, r + 10).join('') + '</div>');
  }

  var sizeClass = totalIcons <= 50 ? 'picto-l' : totalIcons <= 150 ? 'picto-m' : totalIcons <= 300 ? 'picto-s' : 'picto-xs';
  var countText = literCountText(count, unit, lang);
  if (capped) {
    countText += T.capNote(litersFmt(Math.round(count), 0, lang));
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

function literPopulationText(pop, lang) {
  var T = LITER_TEXTS[lang];
  if (pop >= 1000000) {
    var millions = pop / 1000000;
    return litersFmt(millions, millions === Math.round(millions) ? 0 : 1, lang) + T.millionInhabitants;
  }
  return litersFmt(pop, 0, lang) + T.inhabitants;
}

// The human equivalence phrase: "≈ what the population of Bilbao (347,000
// people) drinks in a day and a half". Two degrees of freedom (entity ×
// named period) scored by |log| distance, with light penalties so simple
// periods and Spanish places win ties. Small amounts talk about "you";
// unmatchable amounts fall back to "N people in a day". Returns HTML (the
// entity name links to the hectares map centered on it).
function buildLiterPhrase(liters, unitId, lang) {
  var T = LITER_TEXTS[lang];
  var mode = unitId === 'hogar' ? 'hogar' : 'beber';
  var rate = mode === 'hogar' ? HOUSEHOLD_L_PER_PERSON_DAY : DRINK_L_PER_DAY;
  var personDays = liters / rate;

  if (personDays <= 0) {
    return '';
  }
  if (personDays < 0.75) {
    return '≈ ' + T.lessThanADay[mode];
  }

  var personalBest = null;
  LITER_PERIODS_PERSONAL.forEach(function(p) {
    var score = Math.abs(Math.log(personDays / p.days)) + (p.simple ? 0 : 0.03);
    if (!personalBest || score < personalBest.score) {
      personalBest = { period: p, score: score };
    }
  });

  var entityBest = null;
  LITER_ENTITIES.forEach(function(e) {
    LITER_PERIODS.forEach(function(p) {
      var score = Math.abs(Math.log(personDays / (e.pop * p.days)))
        + (p.simple ? 0 : 0.03)
        + (e.anchor ? 0.05 : 0);
      if (!entityBest || score < entityBest.score) {
        entityBest = { entity: e, period: p, score: score };
      }
    });
  });

  var usePersonal = personalBest.score <= entityBest.score;
  var best = usePersonal ? personalBest : entityBest;
  if (best.score > PHRASE_MAX_SCORE) {
    // Rounded to 2 significant figures: "≈ 19.000 personas", not "18.797".
    var magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(personDays)) - 1));
    var rounded = Math.round(personDays / magnitude) * magnitude;
    return '≈ ' + T.generic[mode](litersFmt(rounded, 0, lang));
  }
  if (usePersonal) {
    return '≈ ' + T.personal[mode](best.period[lang]);
  }
  var e = best.entity;
  var mapHome = lang === 'en' ? '/en/' : '/';
  var link = '<a href="' + mapHome + '?lat=' + e.lat + '&lon=' + e.lon + '&z=' + e.z + '">' + e[lang] + '</a>';
  return '≈ ' + T.entity[mode](link, literPopulationText(e.pop, lang), best.period[lang]);
}

// Lets build/generate.js reuse the builders for the landing pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  var litersData = require('./liters-data.js');
  DRINK_L_PER_DAY = litersData.DRINK_L_PER_DAY;
  HOUSEHOLD_L_PER_PERSON_DAY = litersData.HOUSEHOLD_L_PER_PERSON_DAY;
  GALLON_LITERS = litersData.GALLON_LITERS;
  ACRE_FOOT_LITERS = litersData.ACRE_FOOT_LITERS;
  LITER_INPUT_UNITS = litersData.LITER_INPUT_UNITS;
  LITER_UNITS = litersData.LITER_UNITS;
  LITER_PERIODS = litersData.LITER_PERIODS;
  LITER_PERIODS_PERSONAL = litersData.LITER_PERIODS_PERSONAL;
  LITER_ENTITIES = litersData.LITER_ENTITIES;
  module.exports = {
    MAX_LITER_ICONS: MAX_LITER_ICONS,
    litersFmt: litersFmt,
    literUnitById: literUnitById,
    pickLiterUnit: pickLiterUnit,
    buildPictogram: buildPictogram,
    buildLiterPhrase: buildLiterPhrase
  };
}

// ---------------------------------------------------------------------------
// Page wiring (browser only from here on).
// ---------------------------------------------------------------------------

var LITER_STRINGS = {
  es: {
    unitNames: { l: 'litros', gal: 'galones', hm3: 'hectómetros cúbicos', acft: 'acres-pies' },
    autoOption: 'unidad automática',
    seeIn: 'Ver',
    shareText: function(n, unit) {
      return '¿Cuánto es ' + n + ' ' + LITER_STRINGS.es.unitNames[unit] + ' de agua?';
    },
    shareDefault: 'Visualiza cuánta agua es cualquier cantidad de litros'
  },
  en: {
    unitNames: { l: 'litres', gal: 'gallons', hm3: 'cubic hectometres', acft: 'acre-feet' },
    autoOption: 'automatic unit',
    seeIn: 'Show',
    shareText: function(n, unit) {
      return 'How much water is ' + n + ' ' + LITER_STRINGS.en.unitNames[unit] + ', really?';
    },
    shareDefault: 'See how much water any amount really is, drawn with icons'
  }
};

// Accepts comma decimals ("1,5"); returns null for empty/invalid/non-positive.
function parseLiters(value) {
  var v = parseFloat(String(value).replace(',', '.'));
  return (isNaN(v) || v <= 0) ? null : v;
}

function toLiters(value, inputUnit) {
  return value * (LITER_INPUT_UNITS[inputUnit] || 1);
}

if (typeof $ !== 'undefined') {
  var literLang = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'en' : 'es';

  // Language defaults: liters on the Spanish page, US gallons on the English one.
  var baseInputUnit = literLang === 'en' ? 'gal' : 'l';
  var baseAmount = 100;

  // hectareas-utils.js reads the global baseUrl when building share links, so
  // it must point at this page (per language).
  var baseUrl = literLang === 'en'
    ? 'https://hectareometro.com/en/liters/'
    : 'https://hectareometro.com/litros/';
  var iframeWidth = 450;
  var iframeHeight = 350;
  // Read by updateIframeShare() in hectareas-utils.js.
  var iframeBaseUrl = 'https://hectareometro.com/iframe-litros.html';

  var literI18n = function() {
    return LITER_STRINGS[literLang];
  };

  // html2canvas and the QR generator are only needed if the user asks for the
  // image, so they load from the CDN on the first click instead of weighing
  // down the page.
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

  // Builds an off-screen infographic (brand header, the question as plain
  // text instead of form controls, the pictogram, and a footer with the URL
  // plus a QR pointing at this exact comparison) and downloads it as a PNG.
  var downloadPictoImage = function() {
    var value = parseLiters($('#liters').val());
    if (value === null) {
      return;
    }
    loadImageLibs(function() {
      var inputUnit = $('#liters-unit').val();
      var shareUrl = baseUrl + '?' + jQuery.param({ l: $('#liters').val(), u: inputUnit });
      var brand = literLang === 'en' ? 'Hectareometer' : 'Hectareómetro';
      var title = (literLang === 'en' ? 'How much water is ' : '¿Cuánta agua son ')
        + litersFmt(value, value === Math.round(value) ? 0 : 2, literLang)
        + ' ' + literI18n().unitNames[inputUnit] + '?';

      var $capture = $('<div>', { id: 'picto-capture' })
        .append($('<div>', { id: 'capture-header', text: brand }))
        .append($('<p>', { id: 'capture-title', text: title }))
        .append($('<div>', { id: 'capture-picto', 'class': $('#pictogram').attr('class'), html: $('#pictogram').html() }))
        .append($('<p>', { id: 'capture-count', text: $('#picto-count').text() }))
        .append($('<p>', { id: 'capture-legend', text: $('#picto-legend').text() }))
        .append($('<p>', { id: 'capture-phrase', text: $('#liter-phrase').text() }));
      // The visible URL is the clean tool address; the QR is the one carrying
      // the exact comparison (?l=&u=).
      var $qr = $('<div>', { id: 'capture-qr' });
      var qrCaption = literLang === 'en' ? 'See it on the Hectareometer' : 'Ver en el hectareómetro';
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
          var amount = String($('#liters').val()).replace(',', '.');
          link.download = 'hectareometro-' + amount + '-' + inputUnit + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          $capture.remove();
        });
      }, 100);
    });
  };

  // URL scheme: ?l=<amount in the chosen input unit>&u=<l|gal>
  var initializeLiterParametersIfSet = function() {
    var paramAmount = getUrlParameter('l');
    var paramUnit = getUrlParameter('u');
    if (paramUnit != undefined && LITER_INPUT_UNITS[paramUnit]) {
      baseInputUnit = paramUnit;
    }
    if (paramAmount != undefined && parseLiters(paramAmount) !== null) {
      baseAmount = parseLiters(paramAmount);
    }
  };

  // Conversion to the input unit the user did NOT pick (plus m³ when large).
  var updateLiterEquivalences = function(totalLiters, inputUnit) {
    if (totalLiters === null) {
      $('#equivalences').text('');
      return;
    }
    var parts = [];
    if (inputUnit !== 'l') {
      parts.push(litersFmt(totalLiters, totalLiters < 100 ? 2 : 0, literLang) + ' ' + literI18n().unitNames.l);
    }
    if (inputUnit !== 'gal') {
      var gal = totalLiters / GALLON_LITERS;
      parts.push(litersFmt(gal, gal < 100 ? 2 : 0, literLang) + ' ' + literI18n().unitNames.gal);
    }
    if (totalLiters >= 1000) {
      parts.push(litersFmt(totalLiters / 1000, totalLiters < 100000 ? 1 : 0, literLang) + ' m³');
    }
    // From ~0.1 hm³ up, show the big-magnitude unit of the page's language
    // (hm³ on es, acre-feet on en) unless it is already the input unit.
    if (totalLiters >= 100000000) {
      if (literLang === 'es' && inputUnit !== 'hm3') {
        parts.push(litersFmt(totalLiters / LITER_INPUT_UNITS.hm3, totalLiters < 1e10 ? 2 : 1, literLang) + ' hm³');
      }
      if (literLang === 'en' && inputUnit !== 'acft') {
        var acft = totalLiters / ACRE_FOOT_LITERS;
        parts.push(litersFmt(acft, acft < 100 ? 1 : 0, literLang) + ' ' + literI18n().unitNames.acft);
      }
    }
    $('#equivalences').text(parts.join(i18n().sep));
  };

  var generateLiterSharingButtons = function() {
    var params = { l: $('#liters').val(), u: $('#liters-unit').val() };
    var str = jQuery.param(params);
    var shareUrl = baseUrl + '?' + str;
    var shareText = literI18n().shareText(params.l, params.u);
    updateWhatsappShareLink(shareUrl, shareText);
    updateTwitterShareLink(shareUrl, shareText);
    updateFacebookShareLink(shareUrl, shareText);
    updateUrlShareLink(shareUrl);
    // The iframe needs the language too (the page URL carries it in its path).
    updateIframeShare(literLang === 'en' ? str + '&hl=en' : str, iframeWidth, iframeHeight);
  };

  var refreshLiterViz = function() {
    var value = parseLiters($('#liters').val());
    var inputUnit = $('#liters-unit').val();
    if (value === null) {
      $('#pictogram').empty().removeAttr('aria-label');
      $('#picto-count, #picto-legend, #liter-phrase').empty();
      updateLiterEquivalences(null);
      return;
    }
    var totalLiters = toLiters(value, inputUnit);
    var selected = $('#picto-unit').val();
    var unit = selected === 'auto' ? pickLiterUnit(totalLiters) : literUnitById(selected);
    var picto = buildPictogram(totalLiters, unit, literLang);
    $('#pictogram')
      .html(picto.rowsHtml)
      .attr('class', picto.sizeClass)
      .attr('aria-label', picto.ariaLabel);
    $('#picto-count').text(picto.countText);
    $('#picto-legend').text(picto.legendText);
    $('#liter-phrase').html(buildLiterPhrase(totalLiters, unit.id, literLang));
    updateLiterEquivalences(totalLiters, inputUnit);
  };

  var populatePictoUnitSelector = function() {
    var $select = $('#picto-unit');
    $select.append($('<option>', { value: 'auto', text: literI18n().autoOption }));
    LITER_UNITS.forEach(function(u) {
      $select.append($('<option>', { value: u.id, text: u.emoji + ' ' + u[literLang].selector }));
    });
  };

  $(document).ready(function() {
    if (!$('#liters').length) {
      return;
    }
    // Landing pages preset the amount (always in liters); URL params override.
    if (typeof PRESET_LITERS !== 'undefined') {
      baseAmount = PRESET_LITERS;
      baseInputUnit = 'l';
    }
    initializeLiterParametersIfSet();
    populatePictoUnitSelector();
    $('#liters').val(baseAmount);
    // ?u= accepts every unit but each language's selector only lists its own
    // three; if the URL brings one of the others (e.g. ?u=acft on the Spanish
    // page), add it on the fly so the unit isn't silently dropped.
    $('#liters-unit').val(baseInputUnit);
    if ($('#liters-unit').val() !== baseInputUnit) {
      $('#liters-unit').append($('<option>', { value: baseInputUnit, text: literI18n().unitNames[baseInputUnit] }));
      $('#liters-unit').val(baseInputUnit);
    }
    autoGrowInput('#liters');
    $('#iframe-share-width').val(iframeWidth);
    $('#iframe-share-height').val(iframeHeight);
    var onInputChange = function() {
      refreshLiterViz();
      generateLiterSharingButtons();
    };
    $('#liters').keyup(onInputChange);
    $('#liters-unit, #picto-unit').change(onInputChange);
    $('#picto-download').click(function(e) {
      e.preventDefault();
      downloadPictoImage();
    });
    $('#iframe-share-width, #iframe-share-height').keyup(function() {
      iframeWidth = $('#iframe-share-width').val();
      iframeHeight = $('#iframe-share-height').val();
      generateLiterSharingButtons();
    });
    updateWhatsappShareLink(baseUrl, literI18n().shareDefault);
    updateTwitterShareLink(baseUrl, literI18n().shareDefault);
    updateFacebookShareLink(baseUrl, literI18n().shareDefault);
    updateUrlShareLink(baseUrl);
    refreshLiterViz();
    generateLiterSharingButtons();
  });
}
