// Distances tool (/distancias/ and /en/distances/): the circle RADIUS is the
// distance typed by the user. Loads together with hectareas-utils.js (shared
// helpers: drawCircle, cleanMap, getUrlParameter, share-link updaters,
// formatNumberLocale) and INSTEAD of hectareas.js, so initMap can be defined
// here for the Google Maps callback.
var map;
var mapLatitude = 43.3086485;
var mapLongitude = -1.9667056;
var circle;
var mapCenter;
var radius;
var zoomLevel = 12;

var UNIT_TO_METERS = { km: 1000, m: 1, mi: 1609.344 };

// Language defaults: km on the Spanish page, miles on the English page.
var baseUnit = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en') ? 'mi' : 'km';
var baseDistance = baseUnit === 'mi' ? 1 : 2;

// hectareas-utils.js reads the global baseUrl when building share links, so it
// must point at this page (per language), not at the hectares home.
var baseUrl = (typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en')
  ? 'https://hectareometro.com/en/distances/'
  : 'https://hectareometro.com/distancias/';
var iframeWidth = 400;
var iframeHeight = 400;
// Read by updateIframeShare() in hectareas-utils.js.
var iframeBaseUrl = 'https://hectareometro.com/iframe-distances.html';

var DIST_STRINGS = {
  es: {
    unitNames: { km: 'kilómetros', m: 'metros', mi: 'millas' },
    shareText: function(d, unit) {
      return '¿Hasta dónde llegaría en ' + d + ' ' + DIST_STRINGS.es.unitNames[unit] + '?';
    },
    shareDefault: 'Comprueba hasta dónde llega una distancia en el mundo real'
  },
  en: {
    unitNames: { km: 'kilometres', m: 'metres', mi: 'miles' },
    shareText: function(d, unit) {
      return 'How far would I get in ' + d + ' ' + DIST_STRINGS.en.unitNames[unit] + '?';
    },
    shareDefault: 'See how far a distance really goes on a map'
  }
};

function distI18n() {
  return DIST_STRINGS[SITE_LANG] || DIST_STRINGS.es;
}

// Accepts comma decimals ("1,5"); returns null for empty/invalid/non-positive.
function parseDistance(value) {
  var v = parseFloat(String(value).replace(',', '.'));
  return (isNaN(v) || v <= 0) ? null : v;
}

function getRadiusMetersFromDistance(value, unit) {
  var v = parseDistance(value);
  var factor = UNIT_TO_METERS[unit];
  return (v === null || !factor) ? null : v * factor;
}

// Conversions to the two units the user did NOT pick.
function getDistanceEquivalencesText(value, unit) {
  var meters = getRadiusMetersFromDistance(value, unit);
  if (meters === null) {
    return '';
  }
  var parts = [];
  if (unit !== 'km') {
    parts.push(formatNumberLocale(meters / 1000, 2) + ' km');
  }
  if (unit !== 'm') {
    parts.push(formatNumberLocale(Math.round(meters)) + ' m');
  }
  if (unit !== 'mi') {
    parts.push(formatNumberLocale(meters / UNIT_TO_METERS.mi, 2) + ' mi');
  }
  return parts.join(i18n().sep);
}

function updateDistanceEquivalences() {
  $('#equivalences').text(getDistanceEquivalencesText($('#distance').val(), $('#distance-unit').val()));
}

// URL scheme: ?d=<number in the chosen unit>&u=<km|m|mi>&lat=&lon=&z=
function initializeDistanceParametersIfSet() {
  var paramLat = getUrlParameter('lat');
  var paramLon = getUrlParameter('lon');
  var paramZoom = getUrlParameter('z');
  var paramDistance = getUrlParameter('d');
  var paramUnit = getUrlParameter('u');
  if (paramLat != undefined && paramLon != undefined && paramZoom != undefined) {
    mapLatitude = parseFloat(paramLat);
    mapLongitude = parseFloat(paramLon);
    zoomLevel = parseInt(paramZoom);
  }
  if (paramUnit != undefined && UNIT_TO_METERS[paramUnit]) {
    baseUnit = paramUnit;
  }
  if (paramDistance != undefined && parseDistance(paramDistance) !== null) {
    baseDistance = parseDistance(paramDistance);
  }
}

function generateDistanceSharingButtons() {
  if (!map || !map.getCenter) {
    return;
  }
  mapCenter = map.getCenter();
  if (!mapCenter) {
    return;
  }
  var shareDistance = $('#distance').val();
  var shareUnit = $('#distance-unit').val();
  var params = { d: shareDistance, u: shareUnit, lat: mapCenter.lat(), lon: mapCenter.lng(), z: map.getZoom() };
  var str = jQuery.param(params);
  var shareUrl = baseUrl + '?' + str;
  var shareText = distI18n().shareText(shareDistance, shareUnit);
  updateWhatsappShareLink(shareUrl, shareText);
  updateTwitterShareLink(shareUrl, shareText);
  updateFacebookShareLink(shareUrl, shareText);
  updateUrlShareLink(shareUrl);
  updateIframeShare(str, iframeWidth, iframeHeight);
}

// Redraws with the current radius, or clears the circle while the input is
// empty/invalid (radius === null).
function refreshDistanceCircle() {
  if (radius) {
    drawCircle(map, radius, mapCenter, 'outline');
  } else {
    cleanMap();
  }
}

function initMap() {
  // Landing pages can preset the tool (read BEFORE the URL params so a shared
  // ?d=&u=&lat= link still wins over the preset, mirroring hectareas.js).
  if (typeof PRESET_DISTANCE !== 'undefined' && PRESET_DISTANCE) {
    baseDistance = PRESET_DISTANCE;
  }
  if (typeof PRESET_DIST_UNIT !== 'undefined' && UNIT_TO_METERS[PRESET_DIST_UNIT]) {
    baseUnit = PRESET_DIST_UNIT;
  }
  if (typeof PRESET_ZOOM !== 'undefined' && PRESET_ZOOM) {
    zoomLevel = PRESET_ZOOM;
  }
  if (typeof PRESET_LAT !== 'undefined' && typeof PRESET_LON !== 'undefined') {
    mapLatitude = PRESET_LAT;
    mapLongitude = PRESET_LON;
  }
  initializeDistanceParametersIfSet();
  $('#distance').val(baseDistance);
  $('#distance-unit').val(baseUnit);
  autoGrowInput('#distance');
  updateDistanceEquivalences();
  $('#iframe-share-width').val(iframeWidth);
  $('#iframe-share-height').val(iframeHeight);
  mapCenter = new google.maps.LatLng(mapLatitude, mapLongitude);
  radius = getRadiusMetersFromDistance(baseDistance, baseUnit);
  map = new google.maps.Map(document.getElementById('map'), {
    'zoom': zoomLevel,
    'center': mapCenter,
    'mapTypeId': google.maps.MapTypeId.ROADMAP
  });
  refreshDistanceCircle();
  map.addListener('center_changed', function(){
    refreshDistanceCircle();
    generateDistanceSharingButtons();
  });
  map.addListener('zoom_changed', function(){
    refreshDistanceCircle();
    generateDistanceSharingButtons();
  });
  var onInputChange = function() {
    radius = getRadiusMetersFromDistance($('#distance').val(), $('#distance-unit').val());
    updateDistanceEquivalences();
    refreshDistanceCircle();
    generateDistanceSharingButtons();
  };
  $('#distance').keyup(onInputChange);
  $('#distance-unit').change(onInputChange);
  $('#iframe-share-width, #iframe-share-height').keyup(function() {
    iframeWidth = $('#iframe-share-width').val();
    iframeHeight = $('#iframe-share-height').val();
    generateDistanceSharingButtons();
  });
  updateWhatsappShareLink(baseUrl, distI18n().shareDefault);
  updateTwitterShareLink(baseUrl, distI18n().shareDefault);
  updateFacebookShareLink(baseUrl, distI18n().shareDefault);
  updateUrlShareLink(baseUrl);
  generateDistanceSharingButtons();
};
