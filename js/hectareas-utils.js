function generateSocialNetworkSharingButtons(){
  mapCenter = map.getCenter();
  shareHectareas = $('#hectareas').val();
  shareLatitude = mapCenter.lat();
  shareLongitude = mapCenter.lng();
  shareZoom = map.getZoom();
  var params = { ha: shareHectareas, lat: shareLatitude, lon: shareLongitude, z: shareZoom };
  var str = jQuery.param( params );
  var shareUrl = baseUrl+'?'+str;
  var shareText = '¿Cuanto son '+shareHectareas+' hectáreas en realidad?';
  updateTwitterShareLink(shareUrl,shareText);
  updateFacebookShareLink(shareUrl,shareText);
  updateUrlShareLink(shareUrl);
  updateIframeShare(str,iframeWidth,iframeHeight);
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
  iframeContent = '<iframe src="'+url+'&w='+width+'&h='+height+'" width="'+width+'" height="'+height+'"><p>Tu navegador no soporta iframes, lo sentimos.</p></iframe>';
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
  if ( paramLat != undefined && paramLon != undefined && paramZoom != undefined && paramHa != undefined){
    mapLatitude = parseFloat(paramLat);
    mapLongitude = parseFloat(paramLon);
    zoomLevel = parseInt(paramZoom);
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
