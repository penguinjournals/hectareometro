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
  var shareText = '¿Cuanto son '+shareHectareas+' hectáreas en realidad?';
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

function drawCircle(map,radius,mapCenter){
  cleanMap();
  mapCenter = map.getCenter();
  circle = new google.maps.Circle({
    map: map,
    radius: radius,
    strokeWeight: 0,
    fillColor: '#FF0000',
    center: mapCenter
  });
}

function getRadiusInMetersFromHectareas(hectareas){
  var squareMeters = hectareas * 10000;
  var radius = Math.round(Math.sqrt(squareMeters/Math.PI));
  return radius;
}

// A standard football pitch (~105 x 68 m) is about 7140 m².
var FOOTBALL_FIELD_SQUARE_METERS = 7140;

function formatNumberEs(value, decimals){
  decimals = decimals || 0;
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function getEquivalencesText(hectareas){
  var ha = parseFloat(hectareas);
  if (isNaN(ha) || ha <= 0) {
    return '';
  }
  var squareMeters = ha * 10000;
  var squareKm = ha / 100;
  var footballFields = squareMeters / FOOTBALL_FIELD_SQUARE_METERS;
  var fieldsText = footballFields < 10
    ? formatNumberEs(footballFields, 1)
    : formatNumberEs(Math.round(footballFields));
  var fieldsLabel = footballFields >= 0.95 && footballFields < 1.05 ? ' campo de fútbol' : ' campos de fútbol';
  return formatNumberEs(squareMeters) + ' m²  ·  ' +
         formatNumberEs(squareKm, 2) + ' km²  ·  ' +
         '≈ ' + fieldsText + fieldsLabel;
}

function updateEquivalences(hectareas){
  $('#equivalences').text(getEquivalencesText(hectareas));
}

function cleanMap(){
  if (circle) {
    circle.setMap(null);
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
