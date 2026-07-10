// Embeddable distances map (iframe-distances.html). Loads after
// hectareas-utils.js and distances.js: reuses their globals (iframeWidth,
// iframeHeight, baseDistance, baseUnit...) and helpers, and initialises on
// DOM ready instead of the Maps callback (the API is loaded synchronously
// here, like in the hectares iframe).
$(document).ready(function() {
  initializeDistanceParametersIfSet();
  initializeIframeSizeParametersIfSet();
  $('#map').width(iframeWidth);
  $('#map').height(iframeHeight);
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
  });
  map.addListener('zoom_changed', function(){
    refreshDistanceCircle();
  });
});
