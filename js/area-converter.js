// Area converter (/hectareas-a-metros-cuadrados/ and
// /en/hectares-to-square-meters/): converts an amount in any area unit to all
// the other units. Loads together with area-converter-data.js and
// hectareas-utils.js (getUrlParameter, autoGrowInput, share-link updaters).
// There is NO map here, so there is no initMap callback: the page wiring runs
// on document.ready, and only if the page has the #area-value input.
//
// The builders (convertArea, buildAreaRows) are pure and take the language
// explicitly, so build/generate.js can require() this file without jQuery or
// a browser.

function areaUnitById(id) {
  for (var i = 0; i < AREA_UNITS.length; i++) {
    if (AREA_UNITS[i].id === id) {
      return AREA_UNITS[i];
    }
  }
  return null;
}

function convertArea(value, fromId, toId) {
  return value * areaUnitById(fromId).m2 / areaUnitById(toId).m2;
}

// One rounding rule for the whole converter: about 5 significant figures,
// never fewer than 0 or more than 8 decimals. The 8-decimal ceiling covers
// the worst sensible case (1 ft² = 0.00000929 ha) without scientific
// notation; above 100,000 the integer part alone already carries 6+ figures.
function areaDecimals(v) {
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

function areaFmt(v, lang) {
  var decimals = areaDecimals(v);
  return v.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

// Rows of the results table: the amount expressed in every unit except the
// one it was typed in, largest unit first. Returns
// [{ id, symbol, label, valueText }].
function buildAreaRows(value, fromId, lang) {
  var rows = [];
  for (var i = 0; i < AREA_UNITS.length; i++) {
    var unit = AREA_UNITS[i];
    if (unit.id === fromId) {
      continue;
    }
    var converted = value * areaUnitById(fromId).m2 / unit.m2;
    var name = Math.abs(converted - 1) < 1e-9 ? unit[lang].one : unit[lang].many;
    rows.push({
      id: unit.id,
      symbol: unit[lang].symbol,
      label: name,
      valueText: areaFmt(converted, lang)
    });
  }
  return rows;
}

// Lets build/generate.js reuse the builders for the pages' copy.
if (typeof module !== 'undefined' && module.exports) {
  var areaData = require('./area-converter-data.js');
  AREA_UNITS = areaData.AREA_UNITS;
  module.exports = {
    AREA_UNITS: AREA_UNITS,
    areaUnitById: areaUnitById,
    convertArea: convertArea,
    areaDecimals: areaDecimals,
    areaFmt: areaFmt,
    buildAreaRows: buildAreaRows
  };
}

// ---------------------------------------------------------------------------
// Page wiring (browser only from here on).
// ---------------------------------------------------------------------------

var AREA_STRINGS = {
  es: {
    inLabel: 'en',
    shareText: function(n, unitName) {
      return '¿Cuánto son ' + n + ' ' + unitName + ' en metros cuadrados, acres o km²?';
    },
    shareDefault: 'Convierte hectáreas, metros cuadrados, acres y más'
  },
  en: {
    inLabel: 'in',
    shareText: function(n, unitName) {
      return 'How much is ' + n + ' ' + unitName + ' in square metres, acres or km²?';
    },
    shareDefault: 'Convert hectares, square metres, acres and more'
  }
};

// Accepts comma decimals ("1,5"); returns null for empty/invalid/non-positive.
function parseAreaValue(value) {
  var v = parseFloat(String(value).replace(',', '.'));
  return (isNaN(v) || v <= 0) ? null : v;
}

if (typeof $ !== 'undefined') {
  var areaLang = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'en' : 'es';

  // Defaults answer the query that brings the traffic: 1 hectare in m².
  var baseAreaAmount = 1;
  var baseAreaUnit = 'ha';

  // hectareas-utils.js reads the global baseUrl when building share links, so
  // it must point at this page (per language).
  var baseUrl = areaLang === 'en'
    ? 'https://hectareometro.com/en/hectares-to-square-meters/'
    : 'https://hectareometro.com/hectareas-a-metros-cuadrados/';

  var areaI18n = function() {
    return AREA_STRINGS[areaLang];
  };

  // URL scheme: ?a=<amount in the chosen unit>&u=<unit id>
  var initializeAreaParametersIfSet = function() {
    var paramAmount = getUrlParameter('a');
    var paramUnit = getUrlParameter('u');
    if (paramUnit != undefined && areaUnitById(paramUnit)) {
      baseAreaUnit = paramUnit;
    }
    if (paramAmount != undefined && parseAreaValue(paramAmount) !== null) {
      baseAreaAmount = parseAreaValue(paramAmount);
    }
  };

  var areaShareParams = function() {
    return { a: $('#area-value').val(), u: $('#area-unit').val() };
  };

  var generateAreaSharingButtons = function() {
    var params = areaShareParams();
    var shareUrl = baseUrl + '?' + jQuery.param(params);
    var unit = areaUnitById(params.u);
    var shareText = areaI18n().shareText(params.a, unit ? unit[areaLang].many : params.u);
    updateWhatsappShareLink(shareUrl, shareText);
    updateTwitterShareLink(shareUrl, shareText);
    updateFacebookShareLink(shareUrl, shareText);
    updateUrlShareLink(shareUrl);
  };

  var refreshAreaResults = function() {
    var value = parseAreaValue($('#area-value').val());
    var fromId = $('#area-unit').val();
    var $tbody = $('#area-results tbody');
    if (value === null || !areaUnitById(fromId)) {
      $tbody.empty();
      return;
    }
    var html = buildAreaRows(value, fromId, areaLang).map(function(row) {
      return '<tr><td class="area-result-value"><b>' + row.valueText + '</b> ' + row.symbol + '</td><td>' + row.label + '</td></tr>';
    }).join('');
    $tbody.html(html);
  };

  $(document).ready(function() {
    if (!$('#area-value').length) {
      return;
    }
    initializeAreaParametersIfSet();
    $('#area-value').val(baseAreaAmount);
    $('#area-unit').val(baseAreaUnit);
    autoGrowInput('#area-value');
    var onInputChange = function() {
      refreshAreaResults();
      generateAreaSharingButtons();
    };
    $('#area-value').keyup(onInputChange);
    $('#area-unit').change(onInputChange);
    updateWhatsappShareLink(baseUrl, areaI18n().shareDefault);
    updateTwitterShareLink(baseUrl, areaI18n().shareDefault);
    updateFacebookShareLink(baseUrl, areaI18n().shareDefault);
    updateUrlShareLink(baseUrl);
    refreshAreaResults();
    generateAreaSharingButtons();
  });
}
