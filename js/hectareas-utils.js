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

function getRadiusInMetersFromHectareas(hectareas){
  var squareMeters = hectareas * 10000;
  var radius = Math.round(Math.sqrt(squareMeters/Math.PI));
  return radius;
}

// A standard football pitch (~105 x 68 m) is about 7140 m².
var FOOTBALL_FIELD_SQUARE_METERS = 7140;
var ACRES_PER_HECTARE = 2.47105;

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

function updateEquivalences(hectareas){
  $('#equivalences').text(getEquivalencesText(hectareas));
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
function trackEvent(name, params) {
  if (typeof gtag === 'function') {
    gtag('event', name, params || {});
  }
}

(function initEngagementTracking() {
  if (typeof gtag !== 'function' || typeof document === 'undefined') {
    return;
  }
  var TOOL_BY_ID = { hectareas: 'hectares', distance: 'distances', liters: 'liters', kilos: 'kilos' };
  var SHARE_BY_ID = { 'whatsapp-share': 'whatsapp', 'twitter-share': 'twitter', 'facebook-share': 'facebook', 'url-share': 'copy_link' };
  var toolUsed = false;
  var start = function() {
    // First real edit of the amount input = this visit "used the tool".
    document.addEventListener('input', function(e) {
      var id = e.target && e.target.id;
      if (!toolUsed && TOOL_BY_ID[id]) {
        toolUsed = true;
        trackEvent('tool_used', { tool: TOOL_BY_ID[id] });
      }
    });
    // Unit selectors (input unit) and the "Ver"/"Show" ladder-rung selector.
    document.addEventListener('change', function(e) {
      var id = e.target && e.target.id;
      if (id === 'distance-unit' || id === 'liters-unit' || id === 'kilos-unit') {
        trackEvent('unit_change', { kind: 'input_unit', control: id });
      } else if (id === 'picto-unit') {
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
