function generateSocialNetworkSharingButtons(){
  if (!map || !map.getCenter) {
    return;
  }
  mapCenter = map.getCenter();
  if (!mapCenter) {
    return;
  }
  shareHectareas = $('#hectareas').val();
  shareLatitude = mapCenter.lat();
  shareLongitude = mapCenter.lng();
  shareZoom = map.getZoom();
  var params = { ha: shareHectareas, lat: shareLatitude, lon: shareLongitude, z: shareZoom };
  var str = jQuery.param( params );
  var shareUrl = baseUrl+'?'+str;
  var shareText = i18n().shareText(shareHectareas);
  updateWhatsappShareLink(shareUrl,shareText);
  updateTwitterShareLink(shareUrl,shareText);
  updateFacebookShareLink(shareUrl,shareText);
  updateUrlShareLink(shareUrl);
  updateIframeShare(str,iframeWidth,iframeHeight);
}

function updateWhatsappShareLink(url, text){
  var whatsappShareBaseUrl='https://wa.me/?text='+encodeURIComponent(text+' '+url);
  $('#whatsapp-share').attr('href',whatsappShareBaseUrl);
}

function updateTwitterShareLink(url, text){
  var twitterShareBaseUrl='https://twitter.com/share?text='+encodeURIComponent(text)+'&url='+encodeURIComponent(url);
  $('#twitter-share').attr('href',twitterShareBaseUrl);
}

function updateFacebookShareLink(url, text){
  facebookShareBaseUrl='https://www.facebook.com/dialog/feed?app_id=1654095918174581&redirect_uri='+encodeURIComponent(baseUrl)+'&link='+encodeURIComponent(url);
  $('#facebook-share').attr('href',facebookShareBaseUrl);
}

function updateUrlShareLink(url){
  $('#url-share').attr('value', url);
}

function updateIframeShare(urlParameters,width,height){
  url = iframeBaseUrl+'?'+urlParameters;
  iframeContent = '<iframe src="'+url+'&w='+width+'&h='+height+'" width="'+width+'" height="'+height+'" frameBorder="0"><p>Tu navegador no soporta iframes, lo sentimos.</p></iframe>';
  $('#iframe-share').text(iframeContent);
}

function generateShareableUrl(parametersString){
  return baseUrl+'?'+parametersString;
}

// Dot marking the circle's origin point (only used by the 'outline' style).
var centerDot;

// style: default draws the filled area circle (hectares tool); 'outline'
// draws just the circumference plus a dot at the origin (distances tool).
function drawCircle(map,radius,mapCenter,style){
  cleanMap();
  mapCenter = map.getCenter();
  if (style === 'outline') {
    circle = new google.maps.Circle({
      map: map,
      radius: radius,
      strokeWeight: 3,
      strokeColor: '#FF0000',
      fillOpacity: 0,
      center: mapCenter
    });
    centerDot = new google.maps.Marker({
      map: map,
      position: mapCenter,
      clickable: false,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 5,
        fillColor: '#FF0000',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2
      }
    });
  } else {
    circle = new google.maps.Circle({
      map: map,
      radius: radius,
      strokeWeight: 0,
      fillColor: '#FF0000',
      center: mapCenter
    });
  }
}

// Zooms OUT (never in) until the whole circle fits in the map viewport.
// Call it only when the user changes the amount or unit — never from the
// map's own zoom/center listeners — so zooming into the circle by hand
// still works. fitBounds keeps the centre (the circle sits on it) and picks
// the closest zoom at which the circle's bounding box fits.
function fitCircleIfOverflow(map, circle){
  if (!map || !circle || !map.getBounds || !circle.getBounds) {
    return;
  }
  var view = map.getBounds();
  var box = circle.getBounds();
  if (!view || !box) {
    return;
  }
  if (view.contains(box.getNorthEast()) && view.contains(box.getSouthWest())) {
    return;
  }
  map.fitBounds(box, 24);
}

function getRadiusInMetersFromHectareas(hectareas){
  var squareMeters = hectareas * 10000;
  var radius = Math.round(Math.sqrt(squareMeters/Math.PI));
  return radius;
}

// A standard football pitch (~105 x 68 m) is about 7140 m².
var FOOTBALL_FIELD_SQUARE_METERS = 7140;
var ACRES_PER_HECTARE = 2.47105;
// Metres in an international mile — single source shared by the distance tools.
var MI_METERS = 1609.344;

// Current language is set per page via PAGE_LANG (defaults to Spanish).
var SITE_LANG = (typeof PAGE_LANG !== 'undefined') ? PAGE_LANG : 'es';

var STRINGS = {
  es: {
    locale: 'es-ES',
    fields: 'campos de fútbol',
    field: 'campo de fútbol',
    acres: 'acres',
    showAcres: false,
    sep: '  ·  ',
    shareText: function(ha){ return '¿Cuánto son ' + ha + ' hectáreas en realidad?'; },
    shareDefault: 'Comprueba lo que ocupa una hectárea en el mundo real'
  },
  en: {
    locale: 'en-GB',
    fields: 'football fields',
    field: 'football field',
    acres: 'acres',
    showAcres: true,
    sep: '  ·  ',
    shareText: function(ha){ return 'How big are ' + ha + ' hectares, really?'; },
    shareDefault: 'See how big a hectare really is on a map'
  }
};

function i18n(){
  return STRINGS[SITE_LANG] || STRINGS.es;
}

function formatNumberLocale(value, decimals){
  decimals = decimals || 0;
  return value.toLocaleString(i18n().locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function getEquivalencesText(hectareas){
  var ha = parseFloat(hectareas);
  if (isNaN(ha) || ha <= 0) {
    return '';
  }
  var S = i18n();
  var squareMeters = ha * 10000;
  var squareKm = ha / 100;
  var footballFields = squareMeters / FOOTBALL_FIELD_SQUARE_METERS;
  var fieldsText = footballFields < 10
    ? formatNumberLocale(footballFields, 1)
    : formatNumberLocale(Math.round(footballFields));
  var fieldsLabel = footballFields >= 0.95 && footballFields < 1.05 ? S.field : S.fields;
  var parts = [
    formatNumberLocale(squareMeters) + ' m²',
    formatNumberLocale(squareKm, 2) + ' km²',
    '≈ ' + fieldsText + ' ' + fieldsLabel
  ];
  if (S.showAcres) {
    var ac = ha * ACRES_PER_HECTARE;
    var acText = ac < 10 ? formatNumberLocale(ac, 2) : formatNumberLocale(Math.round(ac));
    parts.push(acText + ' ' + S.acres);
  }
  return parts.join(S.sep);
}

// Headline comparison alone ("≈ 4.202 campos de fútbol"): the pill drawn
// over the map in the 2026 layout.
function getFieldsPill(hectareas){
  var ha = parseFloat(hectareas);
  if (isNaN(ha) || ha <= 0) {
    return '';
  }
  var S = i18n();
  var footballFields = (ha * 10000) / FOOTBALL_FIELD_SQUARE_METERS;
  var fieldsText = footballFields < 10
    ? formatNumberLocale(footballFields, 1)
    : formatNumberLocale(Math.round(footballFields));
  var fieldsLabel = footballFields >= 0.95 && footballFields < 1.05 ? S.field : S.fields;
  return '≈ ' + fieldsText + ' ' + fieldsLabel;
}

function updateEquivalences(hectareas){
  $('#equivalences').text(getEquivalencesText(hectareas));
  $('#map-pill').text(getFieldsPill(hectareas));
}

// Grows the amount input when the typed number no longer fits its base width
// (the stylesheet's min-width/max-width still bound the result).
function autoGrowInput(selector) {
  var $input = $(selector);
  if (!$input.length) {
    return;
  }
  var resize = function() {
    $input.css('width', (String($input.val()).length + 2) + 'ch');
  };
  $input.on('input keyup change', resize);
  resize();
}

// Static map placeholder (see mapPlaceholderImg() in build/generate.js):
// drop it right away when the page opens at a shared location (the picture
// shows the default one), otherwise fade it out once the real tiles are in.
function mapPlaceholderReady(map){
  var container = document.getElementById('map-container');
  var img = container ? container.querySelector('.map-placeholder') : null;
  if (!img) {
    return;
  }
  var remove = function(){ if (img.parentNode) { img.parentNode.removeChild(img); } };
  if (getUrlParameter('lat') !== undefined || getUrlParameter('lon') !== undefined) {
    remove();
    return;
  }
  // Fade when every visible tile is in; but never trap the user behind it:
  // the first drag or zoom, or 8 s, also dismiss it (a single slow tile would
  // otherwise keep 'tilesloaded' from ever firing).
  var done = false;
  var dismiss = function(){
    if (done) { return; }
    done = true;
    container.classList.add('map-ready');
    setTimeout(remove, 400);
  };
  google.maps.event.addListenerOnce(map, 'tilesloaded', dismiss);
  google.maps.event.addListenerOnce(map, 'dragstart', dismiss);
  google.maps.event.addListenerOnce(map, 'zoom_changed', dismiss);
  setTimeout(dismiss, 8000);
}

function cleanMap(){
  if (circle) {
    circle.setMap(null);
  }
  if (centerDot) {
    centerDot.setMap(null);
  }
}

function initializeParametersIfSet(){
  var paramLat = getUrlParameter('lat');
  var paramLon = getUrlParameter('lon');
  var paramZoom = getUrlParameter('z');
  var paramHa = getUrlParameter('ha');
  if ( paramLat != undefined && paramLon != undefined && paramZoom != undefined){
    mapLatitude = parseFloat(paramLat);
    mapLongitude = parseFloat(paramLon);
    zoomLevel = parseInt(paramZoom);
  }
  if ( paramHa != undefined ){
    baseHectareas = parseFloat(paramHa);
  }
}

function initializeIframeSizeParametersIfSet(){
  var width = getUrlParameter('w');
  var height = getUrlParameter('h');
  if ( width != undefined && height != undefined){
    iframeWidth = parseInt(width);
    iframeHeight = parseInt(height);
  }
}

function getUrlParameter(sParam) {
    var sPageURL = decodeURIComponent(window.location.search.substring(1)),
        sURLVariables = sPageURL.split('&'),
        sParameterName,
        i;
    for (i = 0; i < sURLVariables.length; i++) {
        sParameterName = sURLVariables[i].split('=');
        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : sParameterName[1];
        }
    }
};

// GA4 engagement events. Page views alone can't tell whether visitors actually
// USE the tools; these custom events do. A no-op where gtag is absent (the
// iframes ship no Analytics), so this file stays safe to load everywhere.
// Native delegation on purpose: the hectares iframe still ships jQuery 1.4.4,
// which predates jQuery.on(), so we avoid jQuery here entirely.
function trackingAllowed() {
  // Production only (localhost previews would pollute GA4), unless the
  // `hm-track-debug` localStorage flag is set for testing. Mirrors js/site.js.
  if (/(^|\.)hectareometro\.com$/.test(location.hostname)) { return true; }
  try { return localStorage.getItem('hm-track-debug') === '1'; } catch (e) { return false; }
}
function trackEvent(name, params) {
  if (typeof gtag === 'function' && trackingAllowed()) {
    gtag('event', name, params || {});
  }
}

// Two-significant-figure bucket of what the visitor typed ("1.250,5" / "1,250.5"
// → 1300) so the `amount` dimension stays readable and below GA4's cardinality
// limit. Returns null for nothing/garbage.
function amountBucket(raw) {
  var s = String(raw || '').replace(/\s/g, '');
  if (!s) { return null; }
  var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both separators: the last one is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only commas: one followed by 1-2 digits is a decimal mark, else thousands.
    s = /,\d{1,2}$/.test(s) && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    // Only dots: ".ddd" groups repeated or on an es page are thousands.
    var esPage = (document.documentElement.lang || 'es').slice(0, 2) !== 'en';
    if (s.indexOf('.') !== lastDot || (esPage && /\.\d{3}$/.test(s))) { s = s.replace(/\./g, ''); }
  }
  var n = parseFloat(s);
  if (!isFinite(n) || n <= 0) { return null; }
  return Number(n.toPrecision(2));
}

// Google Maps health. `gm_authFailure` is the global the Maps API calls on
// key/referer/billing errors; the capturing 'error' listener catches the
// script being blocked (ad blockers, firewalls) because this file runs before
// the Maps <script> tag is parsed; the timeout catches everything else.
var mapErrorSent = false;
function reportMapError(reason) {
  if (mapErrorSent) { return; }
  mapErrorSent = true;
  trackEvent('map_error', { reason: reason });
}
window.gm_authFailure = function() { reportMapError('auth'); };
window.addEventListener('error', function(e) {
  var t = e && e.target;
  if (t && t.tagName === 'SCRIPT' && /maps\.google/.test(t.src || '')) { reportMapError('api_blocked'); }
}, true);
(function watchMapLoad() {
  var check = function() {
    if (!document.getElementById('map')) { return; }
    setTimeout(function() {
      if (!(window.google && window.google.maps && window.google.maps.Map)) {
        reportMapError(navigator.onLine === false ? 'offline' : 'timeout');
      }
    }, 10000);
  };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', check); } else { check(); }
})();

// map_interact: the first time the visitor moves the map by hand (drag, zoom
// or a tap), once per page. Programmatic zooms (fitting the circle after a
// new amount) do not count, which is why zoom is read from DOM gestures and
// the zoom buttons rather than from Maps' zoom_changed.
function trackMap(map) {
  var el = document.getElementById('map');
  if (!map || !el || !window.google || !google.maps) { return; }
  var done = false;
  var fire = function(action) {
    if (done) { return; }
    done = true;
    trackEvent('map_interact', { action: action });
  };
  google.maps.event.addListenerOnce(map, 'dragstart', function() { fire('drag'); });
  google.maps.event.addListenerOnce(map, 'click', function() { fire('tap'); });
  el.addEventListener('wheel', function() { fire('zoom'); }, { passive: true });
  el.addEventListener('dblclick', function() { fire('zoom'); });
  el.addEventListener('touchstart', function(e) { if (e.touches && e.touches.length > 1) { fire('zoom'); } }, { passive: true });
  el.addEventListener('click', function(e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.closest('#hectareas-overlay')) { fire('zoom'); }
  });
}

(function initEngagementTracking() {
  if (typeof gtag !== 'function' || typeof document === 'undefined') {
    return;
  }
  var TOOL_BY_ID = { hectareas: 'hectares', distance: 'distances', liters: 'liters', kilos: 'kilos', money: 'money', 'area-value': 'converter', 'length-value': 'length_converter' };
  var UNIT_BY_ID = { hectareas: null, distance: 'distance-unit', liters: 'liters-unit', kilos: 'kilos-unit', money: 'money-scale', 'area-value': 'area-unit', 'length-value': 'length-unit' };
  var SHARE_BY_ID = { 'whatsapp-share': 'whatsapp', 'twitter-share': 'twitter', 'facebook-share': 'facebook', 'url-share': 'copy_link' };
  var toolUsed = false, pendingInput = null, pendingTimer = null;
  // The amount the visitor wanted (2 significant figures) and its unit: the
  // demand signal that tells which landing pages are missing.
  var amountParams = function(input) {
    var id = input.id;
    var amount = amountBucket(input.value);
    var unit = 'ha';
    var sel = UNIT_BY_ID[id] ? document.getElementById(UNIT_BY_ID[id]) : null;
    if (sel) { unit = String(sel.value || ''); }
    if (id === 'money' && unit.indexOf(':') > -1) {
      // "<currency>:<scale>" → amount in full units of the currency.
      var parts = unit.split(':');
      unit = parts[0];
      if (amount !== null) { amount = Number((amount * Number(parts[1] || 1)).toPrecision(2)); }
    }
    var p = { tool: TOOL_BY_ID[id], unit: unit };
    if (amount !== null) { p.amount = String(amount); }
    return p;
  };
  var flushToolUsed = function() {
    if (!pendingInput) { return; }
    var input = pendingInput;
    pendingInput = null;
    clearTimeout(pendingTimer);
    trackEvent('tool_used', amountParams(input));
  };
  var start = function() {
    // First real edit of the amount input = this visit "used the tool". Sent
    // 1.5 s after the last keystroke so `amount` carries the finished number;
    // flushed early if the page is hidden before that.
    document.addEventListener('input', function(e) {
      var id = e.target && e.target.id;
      if (!TOOL_BY_ID[id] || (toolUsed && !pendingInput)) { return; }
      toolUsed = true;
      pendingInput = e.target;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(flushToolUsed, 1500);
    });
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') { flushToolUsed(); } });
    window.addEventListener('pagehide', flushToolUsed);
    // Unit selectors (input unit) and the "Ver"/"Show" ladder-rung selector.
    document.addEventListener('change', function(e) {
      var id = e.target && e.target.id;
      if (id === 'distance-unit' || id === 'liters-unit' || id === 'kilos-unit' || id === 'money-scale' || id === 'area-unit') {
        trackEvent('unit_change', { kind: 'input_unit', control: id });
      } else if (id === 'picto-unit' || id === 'money-time-unit' || id === 'money-obj-unit') {
        trackEvent('unit_change', { kind: 'view', value: e.target.value });
      }
    });
    // Share and image-download clicks (delegated; the targets only exist on
    // tool pages, so this is inert elsewhere).
    document.addEventListener('click', function(e) {
      var el = e.target && e.target.closest ? e.target.closest('a, input') : null;
      if (!el) {
        return;
      }
      if (SHARE_BY_ID[el.id]) {
        trackEvent('share_click', { network: SHARE_BY_ID[el.id] });
      } else if (el.id === 'picto-download') {
        trackEvent('image_download', {});
      }
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
