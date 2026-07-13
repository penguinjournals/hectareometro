// Kilos tool (/kilos/ and /en/kilos/): draws a weight as rows of isotype-style
// pictograms. Loads together with kilos-data.js, liters-data.js (for the
// shared LITER_ENTITIES population dataset) and hectareas-utils.js
// (getUrlParameter, autoGrowInput, share-link updaters). There is NO map, so
// there is no initMap callback: the page wiring runs on document.ready, and
// only if the page has the #kilos input (the iframe reuses the pure builders
// through js/kilos-iframe.js).
//
// The builders (pickKiloUnit, buildKiloPictogram, buildKiloPhrase) are pure
// and take the language explicitly, so build/generate.js can require() this
// file to produce the landing pages' copy without jQuery or a browser.

var MAX_KILO_ICONS = 500;

// Above this |log(ratio)| (~±35%) no population reads as a natural match, so
// the phrase falls back to "the weight of N people".
var KILO_PHRASE_MAX_SCORE = 0.3;

// Locale-aware formatter that works both in the browser and under node.
function kilosFmt(value, decimals, lang) {
  return value.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function kiloUnitById(id) {
  for (var i = 0; i < KILO_UNITS.length; i++) {
    if (KILO_UNITS[i].id === id) {
      return KILO_UNITS[i];
    }
  }
  return null;
}

// First rung (from the largest down) that yields at least 10 icons; the
// smallest rung (egg) when even that draws fewer. When the rungs are far
// apart and the pick would overflow the icon cap, a few big icons beat a
// capped wall of small ones, so step up to the next rung.
function pickKiloUnit(kg) {
  for (var i = KILO_UNITS.length - 1; i >= 0; i--) {
    if (kg / KILO_UNITS[i].kg >= 10) {
      if (kg / KILO_UNITS[i].kg > MAX_KILO_ICONS && i < KILO_UNITS.length - 1) {
        return KILO_UNITS[i + 1];
      }
      return KILO_UNITS[i];
    }
  }
  return KILO_UNITS[0];
}

var KILO_TEXTS = {
  es: {
    each: 'Cada',
    capNote: function(total) { return ' (se muestran ' + MAX_KILO_ICONS + ' de ' + total + ')'; },
    persons: function(n) { return 'el peso de ' + n + ' personas'; },
    entity: function(name, pop) { return 'lo que pesan todos los habitantes de ' + name + ' (' + pop + ') juntos'; },
    humanity: function(times) { return times + ' veces el peso de toda la humanidad'; },
    inhabitants: ' hab.',
    millionInhabitants: ' M hab.'
  },
  en: {
    each: 'Each',
    capNote: function(total) { return ' (showing ' + MAX_KILO_ICONS + ' of ' + total + ')'; },
    persons: function(n) { return 'the weight of ' + n + ' people'; },
    entity: function(name, pop) { return 'the combined weight of everyone in ' + name + ' (' + pop + ')'; },
    humanity: function(times) { return times + ' times the weight of all of humanity'; },
    inhabitants: ' people',
    millionInhabitants: 'M people'
  }
};

function kiloCountText(count, unit, lang) {
  var decimals;
  if (Math.abs(count - Math.round(count)) < 0.005) {
    decimals = 0;
  } else {
    decimals = count < 0.1 ? 2 : 1;
  }
  var name = (count >= 0.95 && count < 1.05) ? unit[lang].one : unit[lang].many;
  return '≈ ' + kilosFmt(count, decimals, lang) + ' ' + name;
}

// Builds everything the pictogram block needs. Pure: returns
// { rowsHtml, sizeClass, countText, legendText, ariaLabel }.
function buildKiloPictogram(kg, unit, lang) {
  var T = KILO_TEXTS[lang];
  var count = kg / unit.kg;
  var whole = Math.floor(count);
  var frac = count - whole;
  var capped = whole >= MAX_KILO_ICONS && count > MAX_KILO_ICONS;
  var iconsWhole = Math.min(whole, MAX_KILO_ICONS);
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
  var countText = kiloCountText(count, unit, lang);
  if (capped) {
    countText += T.capNote(kilosFmt(Math.round(count), 0, lang));
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

function kiloPopulationText(pop, lang) {
  var T = KILO_TEXTS[lang];
  if (pop >= 1000000) {
    var millions = pop / 1000000;
    return kilosFmt(millions, millions === Math.round(millions) ? 0 : 1, lang) + T.millionInhabitants;
  }
  return kilosFmt(pop, 0, lang) + T.inhabitants;
}

// The human equivalence phrase: "≈ the combined weight of everyone in Bilbao
// (347,000 people)". One degree of freedom (there is no time dimension in
// weight): the population whose combined weight (75 kg/person) best matches.
// Mid amounts fall back to "the weight of N people" — unless the drawing is
// already in person icons, where that would repeat the count. Beyond the
// world's population it becomes "N times the weight of all of humanity", and
// below ~0.75 people it stays empty (the eggs/apples tell the story).
// Returns HTML (the entity name links to the hectares map centered on it).
function buildKiloPhrase(kg, unitId, lang) {
  var T = KILO_TEXTS[lang];
  var persons = kg / PERSON_KG;

  if (persons < 0.75) {
    return '';
  }

  var best = null;
  var largest = null;
  LITER_ENTITIES.forEach(function(e) {
    var score = Math.abs(Math.log(persons / e.pop)) + (e.anchor ? 0.05 : 0);
    if (!best || score < best.score) {
      best = { entity: e, score: score };
    }
    if (!largest || e.pop > largest.pop) {
      largest = e;
    }
  });

  if (persons > largest.pop) {
    var times = persons / largest.pop;
    return '≈ ' + T.humanity(kilosFmt(times, times < 10 ? 1 : 0, lang));
  }
  if (best.score > KILO_PHRASE_MAX_SCORE) {
    if (unitId === 'persona') {
      return '';
    }
    var n;
    if (persons < 10) {
      n = kilosFmt(persons, Math.abs(persons - Math.round(persons)) < 0.05 ? 0 : 1, lang);
    } else {
      // Rounded to 2 significant figures: "≈ el peso de 19.000 personas".
      var magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(persons)) - 1));
      n = kilosFmt(Math.round(persons / magnitude) * magnitude, 0, lang);
    }
    return '≈ ' + T.persons(n);
  }
  var e = best.entity;
  var mapHome = lang === 'en' ? '/en/' : '/';
  var link = '<a href="' + mapHome + '?lat=' + e.lat + '&lon=' + e.lon + '&z=' + e.z + '">' + e[lang] + '</a>';
  return '≈ ' + T.entity(link, kiloPopulationText(e.pop, lang));
}

// Lets build/generate.js reuse the builders for the landing pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  var kilosData = require('./kilos-data.js');
  PERSON_KG = kilosData.PERSON_KG;
  POUND_KG = kilosData.POUND_KG;
  KILO_INPUT_UNITS = kilosData.KILO_INPUT_UNITS;
  KILO_UNITS = kilosData.KILO_UNITS;
  LITER_ENTITIES = require('./liters-data.js').LITER_ENTITIES;
  module.exports = {
    MAX_KILO_ICONS: MAX_KILO_ICONS,
    kilosFmt: kilosFmt,
    kiloUnitById: kiloUnitById,
    pickKiloUnit: pickKiloUnit,
    buildKiloPictogram: buildKiloPictogram,
    buildKiloPhrase: buildKiloPhrase
  };
}

// ---------------------------------------------------------------------------
// Page wiring (browser only from here on).
// ---------------------------------------------------------------------------

var KILO_STRINGS = {
  es: {
    unitNames: { kg: 'kilos', lb: 'libras', t: 'toneladas' },
    autoOption: 'unidad automática',
    shareText: function(n, unit) {
      return '¿Cuánto son ' + n + ' ' + KILO_STRINGS.es.unitNames[unit] + ' en realidad?';
    },
    shareDefault: 'Eres más pesado que una vaca en brazos — visualiza cualquier peso con iconos'
  },
  en: {
    unitNames: { kg: 'kilos', lb: 'pounds', t: 'tonnes' },
    autoOption: 'automatic unit',
    shareText: function(n, unit) {
      return 'How heavy is ' + n + ' ' + KILO_STRINGS.en.unitNames[unit] + ', really?';
    },
    shareDefault: 'Heavier than a ton of bricks — see any weight drawn with icons'
  }
};

// Accepts comma decimals ("1,5"); returns null for empty/invalid/non-positive.
function parseKilos(value) {
  var v = parseFloat(String(value).replace(',', '.'));
  return (isNaN(v) || v <= 0) ? null : v;
}

function toKilos(value, inputUnit) {
  return value * (KILO_INPUT_UNITS[inputUnit] || 1);
}

if (typeof $ !== 'undefined') {
  var kiloLang = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'en' : 'es';

  // Language defaults: kilos on the Spanish page, pounds on the English one.
  // 1,000 matches the section H1 ("¿Cuánto son 1.000 kilos?").
  var baseInputUnit = kiloLang === 'en' ? 'lb' : 'kg';
  var baseAmount = 1000;

  // hectareas-utils.js reads the global baseUrl when building share links, so
  // it must point at this page (per language).
  var baseUrl = kiloLang === 'en'
    ? 'https://hectareometro.com/en/kilos/'
    : 'https://hectareometro.com/kilos/';
  var iframeWidth = 450;
  var iframeHeight = 350;
  // Read by updateIframeShare() in hectareas-utils.js.
  var iframeBaseUrl = 'https://hectareometro.com/iframe-kilos.html';

  var kiloI18n = function() {
    return KILO_STRINGS[kiloLang];
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
  // text instead of form controls, the pictogram, and a footer with the clean
  // URL plus a QR pointing at this exact comparison) and downloads it as PNG.
  var downloadPictoImage = function() {
    var value = parseKilos($('#kilos').val());
    if (value === null) {
      return;
    }
    loadImageLibs(function() {
      var inputUnit = $('#kilos-unit').val();
      var shareUrl = baseUrl + '?' + jQuery.param({ k: $('#kilos').val(), u: inputUnit });
      var brand = kiloLang === 'en' ? 'Hectareometer' : 'Hectareómetro';
      var title = (kiloLang === 'en' ? 'How heavy is ' : '¿Cuánto son ')
        + kilosFmt(value, value === Math.round(value) ? 0 : 2, kiloLang)
        + ' ' + kiloI18n().unitNames[inputUnit] + '?';

      var $capture = $('<div>', { id: 'picto-capture' })
        .append($('<div>', { id: 'capture-header', text: brand }))
        .append($('<p>', { id: 'capture-title', text: title }))
        .append($('<div>', { id: 'capture-picto', 'class': $('#pictogram').attr('class'), html: $('#pictogram').html() }))
        .append($('<p>', { id: 'capture-count', text: $('#picto-count').text() }))
        .append($('<p>', { id: 'capture-legend', text: $('#picto-legend').text() }))
        .append($('<p>', { id: 'capture-phrase', text: $('#kilo-phrase').text() }));
      // The visible URL is the clean tool address; the QR carries the exact
      // comparison (?k=&u=).
      var $qr = $('<div>', { id: 'capture-qr' });
      var qrCaption = kiloLang === 'en' ? 'See it on the Hectareometer' : 'Ver en el hectareómetro';
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
          var amount = String($('#kilos').val()).replace(',', '.');
          link.download = 'hectareometro-' + amount + '-' + inputUnit + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          $capture.remove();
        });
      }, 100);
    });
  };

  // URL scheme: ?k=<amount in the chosen input unit>&u=<kg|lb|t>
  var initializeKiloParametersIfSet = function() {
    var paramAmount = getUrlParameter('k');
    var paramUnit = getUrlParameter('u');
    if (paramUnit != undefined && KILO_INPUT_UNITS[paramUnit]) {
      baseInputUnit = paramUnit;
    }
    if (paramAmount != undefined && parseKilos(paramAmount) !== null) {
      baseAmount = parseKilos(paramAmount);
    }
  };

  // Conversion to the input units the user did NOT pick (t only from 1,000 kg).
  var updateKiloEquivalences = function(totalKg, inputUnit) {
    if (totalKg === null) {
      $('#equivalences').text('');
      return;
    }
    var parts = [];
    if (inputUnit !== 'kg') {
      parts.push(kilosFmt(totalKg, totalKg < 100 ? 2 : 0, kiloLang) + ' ' + kiloI18n().unitNames.kg);
    }
    if (inputUnit !== 'lb') {
      var lb = totalKg / POUND_KG;
      parts.push(kilosFmt(lb, lb < 100 ? 2 : 0, kiloLang) + ' ' + kiloI18n().unitNames.lb);
    }
    if (inputUnit !== 't' && totalKg >= 1000) {
      var t = totalKg / 1000;
      parts.push(kilosFmt(t, t < 100 ? 1 : 0, kiloLang) + ' ' + kiloI18n().unitNames.t);
    }
    $('#equivalences').text(parts.join(i18n().sep));
  };

  var generateKiloSharingButtons = function() {
    var params = { k: $('#kilos').val(), u: $('#kilos-unit').val() };
    var str = jQuery.param(params);
    var shareUrl = baseUrl + '?' + str;
    var shareText = kiloI18n().shareText(params.k, params.u);
    updateWhatsappShareLink(shareUrl, shareText);
    updateTwitterShareLink(shareUrl, shareText);
    updateFacebookShareLink(shareUrl, shareText);
    updateUrlShareLink(shareUrl);
    // The iframe needs the language too (the page URL carries it in its path).
    updateIframeShare(kiloLang === 'en' ? str + '&hl=en' : str, iframeWidth, iframeHeight);
  };

  var refreshKiloViz = function() {
    var value = parseKilos($('#kilos').val());
    var inputUnit = $('#kilos-unit').val();
    if (value === null) {
      $('#pictogram').empty().removeAttr('aria-label');
      $('#picto-count, #picto-legend, #kilo-phrase').empty();
      updateKiloEquivalences(null);
      return;
    }
    var totalKg = toKilos(value, inputUnit);
    var selected = $('#picto-unit').val();
    var unit = selected === 'auto' ? pickKiloUnit(totalKg) : kiloUnitById(selected);
    var picto = buildKiloPictogram(totalKg, unit, kiloLang);
    $('#pictogram')
      .html(picto.rowsHtml)
      .attr('class', picto.sizeClass)
      .attr('aria-label', picto.ariaLabel);
    $('#picto-count').text(picto.countText);
    $('#picto-legend').text(picto.legendText);
    $('#kilo-phrase').html(buildKiloPhrase(totalKg, unit.id, kiloLang));
    updateKiloEquivalences(totalKg, inputUnit);
  };

  var populatePictoUnitSelector = function() {
    var $select = $('#picto-unit');
    $select.append($('<option>', { value: 'auto', text: kiloI18n().autoOption }));
    KILO_UNITS.forEach(function(u) {
      $select.append($('<option>', { value: u.id, text: u.emoji + ' ' + u[kiloLang].selector }));
    });
  };

  $(document).ready(function() {
    if (!$('#kilos').length) {
      return;
    }
    // Landing pages preset the amount (always in kilos); URL params override.
    if (typeof PRESET_KILOS !== 'undefined') {
      baseAmount = PRESET_KILOS;
      baseInputUnit = 'kg';
    }
    initializeKiloParametersIfSet();
    populatePictoUnitSelector();
    $('#kilos').val(baseAmount);
    // ?u= accepts every unit but each language's selector only lists its own
    // three; if the URL brings one of the others, add it on the fly so the
    // unit isn't silently dropped.
    $('#kilos-unit').val(baseInputUnit);
    if ($('#kilos-unit').val() !== baseInputUnit) {
      $('#kilos-unit').append($('<option>', { value: baseInputUnit, text: kiloI18n().unitNames[baseInputUnit] }));
      $('#kilos-unit').val(baseInputUnit);
    }
    autoGrowInput('#kilos');
    $('#iframe-share-width').val(iframeWidth);
    $('#iframe-share-height').val(iframeHeight);
    var onInputChange = function() {
      refreshKiloViz();
      generateKiloSharingButtons();
    };
    $('#kilos').keyup(onInputChange);
    $('#kilos-unit, #picto-unit').change(onInputChange);
    $('#picto-download').click(function(e) {
      e.preventDefault();
      downloadPictoImage();
    });
    $('#iframe-share-width, #iframe-share-height').keyup(function() {
      iframeWidth = $('#iframe-share-width').val();
      iframeHeight = $('#iframe-share-height').val();
      generateKiloSharingButtons();
    });
    updateWhatsappShareLink(baseUrl, kiloI18n().shareDefault);
    updateTwitterShareLink(baseUrl, kiloI18n().shareDefault);
    updateFacebookShareLink(baseUrl, kiloI18n().shareDefault);
    updateUrlShareLink(baseUrl);
    refreshKiloViz();
    generateKiloSharingButtons();
  });
}
