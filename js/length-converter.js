// Length converter (/kilometros-a-millas/ and /en/kilometers-to-miles/):
// converts an amount in any distance unit to all the other units. Loads
// together with length-converter-data.js and hectareas-utils.js
// (getUrlParameter, autoGrowInput, share-link updaters). There is NO map here,
// so there is no initMap callback: the page wiring runs on document.ready, and
// only if the page has the #length-value input. Mirrors js/area-converter.js.
//
// The builders (convertLength, buildLengthRows) are pure and take the language
// explicitly, so build/generate.js can require() this file without jQuery or
// a browser.

function lengthUnitById(id) {
  for (var i = 0; i < LENGTH_UNITS.length; i++) {
    if (LENGTH_UNITS[i].id === id) {
      return LENGTH_UNITS[i];
    }
  }
  return null;
}

function convertLength(value, fromId, toId) {
  return value * lengthUnitById(fromId).m / lengthUnitById(toId).m;
}

// Same rounding rule as the area converter: about 5 significant figures, never
// fewer than 0 or more than 8 decimals. The 8-decimal ceiling covers the worst
// sensible case (1 cm = 0.00000621 mi) without scientific notation; above
// 100,000 the integer part alone already carries 6+ figures.
function lengthDecimals(v) {
  if (v <= 0) {
    return 0;
  }
  if (v >= 100000) {
    return 0;
  }
  if (v >= 1) {
    return Math.max(0, 5 - (Math.floor(Math.log10(v)) + 1));
  }
  var leadingZeros = -Math.floor(Math.log10(v)) - 1;
  return Math.min(8, 4 + leadingZeros);
}

function lengthFmt(v, lang) {
  var decimals = lengthDecimals(v);
  return v.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

// Rows of the results table: the amount expressed in every unit except the one
// it was typed in, largest unit first. Returns
// [{ id, symbol, label, valueText }].
function buildLengthRows(value, fromId, lang) {
  var rows = [];
  for (var i = 0; i < LENGTH_UNITS.length; i++) {
    var unit = LENGTH_UNITS[i];
    if (unit.id === fromId) {
      continue;
    }
    var converted = value * lengthUnitById(fromId).m / unit.m;
    var name = Math.abs(converted - 1) < 1e-9 ? unit[lang].one : unit[lang].many;
    rows.push({
      id: unit.id,
      symbol: unit[lang].symbol,
      label: name,
      valueText: lengthFmt(converted, lang)
    });
  }
  return rows;
}

// Lets build/generate.js reuse the builders for the pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  var lengthData = require('./length-converter-data.js');
  LENGTH_UNITS = lengthData.LENGTH_UNITS;
  module.exports = {
    LENGTH_UNITS: LENGTH_UNITS,
    lengthUnitById: lengthUnitById,
    convertLength: convertLength,
    lengthDecimals: lengthDecimals,
    lengthFmt: lengthFmt,
    buildLengthRows: buildLengthRows
  };
}

// ---------------------------------------------------------------------------
// Page wiring (browser only from here on).
// ---------------------------------------------------------------------------

var LENGTH_STRINGS = {
  es: {
    shareText: function(n, unitName) {
      return '¿Cuánto son ' + n + ' ' + unitName + ' en millas, metros o pies?';
    },
    shareDefault: 'Convierte kilómetros, millas, metros, pies y más'
  },
  en: {
    shareText: function(n, unitName) {
      return 'How much is ' + n + ' ' + unitName + ' in miles, metres or feet?';
    },
    shareDefault: 'Convert kilometres, miles, metres, feet and more'
  }
};

// Accepts comma decimals ("1,5"); returns null for empty/invalid/non-positive.
function parseLengthValue(value) {
  var v = parseFloat(String(value).replace(',', '.'));
  return (isNaN(v) || v <= 0) ? null : v;
}

if (typeof $ !== 'undefined') {
  var lengthLang = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'en' : 'es';

  // Defaults answer the query that brings the traffic: 1 km in miles on es,
  // 1 mile in km on en.
  var baseLengthAmount = 1;
  var baseLengthUnit = lengthLang === 'en' ? 'mi' : 'km';

  // hectareas-utils.js reads the global baseUrl when building share links, so
  // it must point at this page (per language).
  var baseUrl = lengthLang === 'en'
    ? 'https://hectareometro.com/en/kilometers-to-miles/'
    : 'https://hectareometro.com/kilometros-a-millas/';

  var lengthI18n = function() {
    return LENGTH_STRINGS[lengthLang];
  };

  // URL scheme: ?d=<amount in the chosen unit>&u=<unit id>, the same `d`/`u`
  // pair the distances tool uses.
  var initializeLengthParametersIfSet = function() {
    var paramAmount = getUrlParameter('d');
    var paramUnit = getUrlParameter('u');
    if (paramUnit != undefined && lengthUnitById(paramUnit)) {
      baseLengthUnit = paramUnit;
    }
    if (paramAmount != undefined && parseLengthValue(paramAmount) !== null) {
      // Keep the value exactly as typed in the URL, so a shared ?d=42,195 shows
      // "42,195" on the Spanish page instead of "42.195", which es-ES readers
      // would read as forty-two thousand. refreshLengthResults() re-parses it
      // (comma decimals included), so nothing downstream cares.
      baseLengthAmount = paramAmount;
    }
  };

  var lengthShareParams = function() {
    return { d: $('#length-value').val(), u: $('#length-unit').val() };
  };

  var generateLengthSharingButtons = function() {
    var params = lengthShareParams();
    var shareUrl = baseUrl + '?' + jQuery.param(params);
    var unit = lengthUnitById(params.u);
    var shareText = lengthI18n().shareText(params.d, unit ? unit[lengthLang].many : params.u);
    updateWhatsappShareLink(shareUrl, shareText);
    updateTwitterShareLink(shareUrl, shareText);
    updateFacebookShareLink(shareUrl, shareText);
    updateUrlShareLink(shareUrl);
  };

  var refreshLengthResults = function() {
    var value = parseLengthValue($('#length-value').val());
    var fromId = $('#length-unit').val();
    var $tbody = $('#length-results tbody');
    if (value === null || !lengthUnitById(fromId)) {
      $tbody.empty();
      return;
    }
    var html = buildLengthRows(value, fromId, lengthLang).map(function(row) {
      return '<tr><td class="conv-result-value"><b>' + row.valueText + '</b> ' + row.symbol + '</td><td>' + row.label + '</td></tr>';
    }).join('');
    $tbody.html(html);
  };

  $(document).ready(function() {
    if (!$('#length-value').length) {
      return;
    }
    initializeLengthParametersIfSet();
    $('#length-value').val(baseLengthAmount);
    $('#length-unit').val(baseLengthUnit);
    autoGrowInput('#length-value');
    var onInputChange = function() {
      refreshLengthResults();
      generateLengthSharingButtons();
    };
    $('#length-value').keyup(onInputChange);
    $('#length-unit').change(onInputChange);
    updateWhatsappShareLink(baseUrl, lengthI18n().shareDefault);
    updateTwitterShareLink(baseUrl, lengthI18n().shareDefault);
    updateFacebookShareLink(baseUrl, lengthI18n().shareDefault);
    updateUrlShareLink(baseUrl);
    refreshLengthResults();
    generateLengthSharingButtons();
  });
}
