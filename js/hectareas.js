var map;
var mapLatitude = 43.3086485;
var mapLongitude = -1.9667056;
var circle;
var mapCenter;
var radius;
var zoomLevel = 12;
var baseHectareas = 1000;
var iframeWidth = 400;
var iframeHeight = 400;
var baseUrl = 'https://hectareometro.com/';
var iframeBaseUrl = 'https://hectareometro.com/iframe.html';
var facebookName = 'Comprueba lo que ocupa una hectárea en el mundo real.';
var facebookDescription = 'Nunca te has preguntado a qué equivalen las hectáreas que arden en un incendio cuando lo escuchas en las noticias. Aquí podrás comprobarlo sobre un mapa que podrás mover hasta un sitio que conozcas.';
var facebookCaption = 'Las hectáreas están muy bien, pero entenderlas es aún mejor.';

$(document).ready(function() {
  initializeParametersIfSet();
  $('#hectareas').val(baseHectareas);
  $('#iframe-share-width').val(iframeWidth);
  $('#iframe-share-height').val(iframeHeight);
  mapCenter = new google.maps.LatLng(mapLatitude, mapLongitude);
  radius = getRadiusInMetersFromHectareas(baseHectareas);
  map = new google.maps.Map(document.getElementById('map'), {
    'zoom': zoomLevel,
    'center': mapCenter,
    'mapTypeId': google.maps.MapTypeId.ROADMAP
  });
  drawCircle(map,radius,mapCenter);
  map.addListener('center_changed', function(){
    drawCircle(map,radius,mapCenter);
    generateSocialNetworkSharingButtons();
  });
  map.addListener('zoom_changed', function(){
    drawCircle(map,radius,mapCenter)
    generateSocialNetworkSharingButtons();
  });
  $('.customizable-parameter').keyup(function() {
    baseHectareas = $('#hectareas').val();
    iframeWidth = $('#iframe-share-width').val();
    iframeHeight = $('#iframe-share-height').val();
    radius = getRadiusInMetersFromHectareas(baseHectareas);
    drawCircle(map,radius,mapCenter);
    generateSocialNetworkSharingButtons();
  });
  updateTwitterShareLink(baseUrl,'Comprueba lo que ocupa una hectárea en el mundo real');
  updateFacebookShareLink(baseUrl,'Comprueba lo que ocupa una hectárea en el mundo real');
  updateUrlShareLink(baseUrl);
  var emptyParameters = '';
  updateIframeShare(emptyParameters,iframeWidth,iframeHeight);
});
