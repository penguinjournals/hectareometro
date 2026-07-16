// Embeddable measured-area map (iframe-measure.html). Loads after
// hectareas-utils.js and measure.js: reuses their globals and helpers, and
// initialises on DOM ready instead of the Maps callback (the API is loaded
// synchronously here, like in the other iframes). Render-only: the embedded
// shape is not editable and there are no drawing controls.
$(document).ready(function() {
  initializeMeasureParametersIfSet();
  initializeIframeSizeParametersIfSet();
  $('#map').width(iframeWidth);
  $('#map').height(iframeHeight);
  map = new google.maps.Map(document.getElementById('map'), {
    'zoom': zoomLevel,
    'center': new google.maps.LatLng(mapLatitude, mapLongitude),
    'mapTypeId': google.maps.MapTypeId.ROADMAP
  });
  if (pendingShape) {
    renderShapeFromState(pendingShape, false);
    if (!viewportInUrl) {
      map.fitBounds(shapeBounds());
    }
  }
});
