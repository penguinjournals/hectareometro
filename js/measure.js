// Measure tool. Two landing pages share this one engine:
//  - /medir-superficie/, /en/measure-area/ (PAGE_TOOL 'area'): the user draws a
//    circle, rectangle or polygon and the tool shows its area live in hectares,
//    m², km² (and acres/sq ft/sq mi on the English page).
//  - /medir-distancias/, /en/measure-distance/ (PAGE_TOOL 'distance'): the user
//    draws an open route ('line' mode) and the tool shows its length live in
//    km · m · miles.
// The readout is shape-type-driven — a 'line' shows length, the closed shapes
// show area — so which page you are on only decides the base URL, the auto-armed
// mode and the share text.
// Loads together with hectareas-utils.js (share-link updaters, getUrlParameter,
// formatNumberLocale, getEquivalencesText, trackEvent) and INSTEAD of
// hectareas.js/distances.js, so initMap can be defined here for the Google
// Maps callback. Needs the Maps API loaded with &libraries=geometry
// (spherical.computeArea / computeLength / computeDistanceBetween). The retired
// DrawingManager is NOT used: drawing is plain click/mousemove listeners over
// the core Circle/Rectangle/Polygon/Polyline classes.
//
// The drawn shape travels in the URL (?s=&pts=&r=), so a measured area can be
// shared or embedded. Unlike the rest of the site, this tool also rewrites the
// address bar with history.replaceState: sharing the drawing is the point of
// the page, so the visible URL must always carry it.

var map;
var mapLatitude = 43.3086485;
var mapLongitude = -1.9667056;
var zoomLevel = 12;

// 'area' (circle/rect/poly, default) or 'distance' (route/line). The pages set
// PAGE_TOOL alongside PAGE_LANG; the iframe leaves it unset (renders any shape).
var MEASURE_TOOL = (typeof PAGE_TOOL !== 'undefined') ? PAGE_TOOL : 'area';

// null | 'circle' | 'rect' | 'poly' | 'line' — the armed drawing mode.
var drawMode = null;
// 0 = waiting for first click, 1 = drawing (after first click).
var drawStep = 0;
// The finished shape: { type: 'circle'|'rect'|'poly'|'line', overlay: overlay }.
var activeShape = null;

// In-progress artifacts.
var polyPath = [];
var firstVertexMarker = null;
var previewLine = null;
var previewShape = null; // circle or rectangle being sized
var rectCornerA = null;

var MAX_POLY_VERTICES = 100;
var MIN_CIRCLE_RADIUS_M = 1;

var SHAPE_STYLE = {
  strokeColor: '#FF0000',
  strokeWeight: 3,
  fillColor: '#FF0000',
  fillOpacity: 0.15
};

var VERTEX_ICON = {
  path: 0, // google.maps.SymbolPath.CIRCLE (Maps may not be loaded yet)
  scale: 6,
  fillColor: '#FF0000',
  fillOpacity: 1,
  strokeColor: '#FFFFFF',
  strokeWeight: 2
};

// hectareas-utils.js reads the global baseUrl when building share links, so it
// must point at this page (per language and per tool).
var baseUrl = MEASURE_TOOL === 'distance'
  ? ((typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en')
      ? 'https://hectareometro.com/en/measure-distance/'
      : 'https://hectareometro.com/medir-distancias/')
  : ((typeof PAGE_LANG !== 'undefined' && PAGE_LANG === 'en')
      ? 'https://hectareometro.com/en/measure-area/'
      : 'https://hectareometro.com/medir-superficie/');
var iframeWidth = 400;
var iframeHeight = 400;
// Read by updateIframeShare() in hectareas-utils.js.
var iframeBaseUrl = 'https://hectareometro.com/iframe-measure.html';

var MEASURE_STRINGS = {
  es: {
    hintIdle: 'Elige una forma y dibújala sobre el mapa',
    hintCircle1: 'Haz clic en el mapa para marcar el centro del círculo',
    hintCircle2: 'Haz clic de nuevo para fijar el radio',
    hintRect1: 'Haz clic para marcar la primera esquina',
    hintRect2: 'Haz clic en la esquina opuesta',
    hintPoly1: 'Haz clic para ir añadiendo puntos',
    hintPolyReady: 'Sigue añadiendo puntos, o cierra la figura pinchando en el primero',
    hintPolyMax: 'Has llegado al máximo de ' + MAX_POLY_VERTICES + ' puntos: cierra la figura',
    hintLine1: 'Haz clic para ir marcando el recorrido',
    hintLineReady: 'Sigue añadiendo puntos; doble clic o «Finalizar» para terminar',
    hintLineMax: 'Has llegado al máximo de ' + MAX_POLY_VERTICES + ' puntos',
    hintLineDone: 'Arrastra los puntos del recorrido para ajustarlo',
    hintDone: 'Arrastra la figura o sus puntos para ajustarla',
    viewAsCircle: 'Ver esta superficie como un círculo en el Hectareómetro →',
    shareText: function(haText) {
      return 'He medido ' + haText + ' hectáreas dibujándolas sobre el mapa';
    },
    shareDefault: 'Dibuja una superficie sobre el mapa y mide sus hectáreas',
    shareTextDistance: function(lenText) {
      return 'He medido un recorrido de ' + lenText + ' dibujándolo sobre el mapa';
    },
    shareDefaultDistance: 'Dibuja un recorrido sobre el mapa y mide su distancia'
  },
  en: {
    hintIdle: 'Pick a shape and draw it on the map',
    hintCircle1: 'Click the map to set the centre of the circle',
    hintCircle2: 'Click again to set the radius',
    hintRect1: 'Click to set the first corner',
    hintRect2: 'Click the opposite corner',
    hintPoly1: 'Click to add points',
    hintPolyReady: 'Keep adding points, or close the shape by clicking the first one',
    hintPolyMax: 'You reached the maximum of ' + MAX_POLY_VERTICES + ' points: close the shape',
    hintLine1: 'Click to trace the route point by point',
    hintLineReady: 'Keep adding points; double-click or “Finish” to end',
    hintLineMax: 'You reached the maximum of ' + MAX_POLY_VERTICES + ' points',
    hintLineDone: 'Drag the route points to adjust it',
    hintDone: 'Drag the shape or its handles to adjust it',
    viewAsCircle: 'See this area as a circle on the Hectareometer →',
    shareText: function(haText) {
      return 'I measured ' + haText + ' hectares by drawing them on a map';
    },
    shareDefault: 'Draw any area on a map and measure its hectares',
    shareTextDistance: function(lenText) {
      return 'I measured a ' + lenText + ' route by drawing it on a map';
    },
    shareDefaultDistance: 'Draw a route on a map and measure its distance'
  }
};

function measureI18n() {
  return MEASURE_STRINGS[SITE_LANG] || MEASURE_STRINGS.es;
}

function setHint(text) {
  var hint = document.getElementById('draw-hint');
  if (hint) {
    hint.textContent = text || '';
  }
}

function debounce(fn, ms) {
  var timer = null;
  return function() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(fn, ms);
  };
}

// ---------------------------------------------------------------------------
// Area math.
// ---------------------------------------------------------------------------

function rectCorners(bounds) {
  var sw = bounds.getSouthWest();
  var ne = bounds.getNorthEast();
  return [
    sw,
    new google.maps.LatLng(sw.lat(), ne.lng()),
    ne,
    new google.maps.LatLng(ne.lat(), sw.lng())
  ];
}

function computeShapeArea() {
  if (!activeShape) {
    return null;
  }
  if (activeShape.type === 'circle') {
    var r = activeShape.overlay.getRadius();
    return Math.PI * r * r;
  }
  if (activeShape.type === 'rect') {
    // Spherical, not flat: at big sizes the flat lat×lon approximation drifts.
    return google.maps.geometry.spherical.computeArea(rectCorners(activeShape.overlay.getBounds()));
  }
  // Self-intersecting polygons give misleading results here; documented in
  // the page's FAQ rather than detected at runtime.
  return google.maps.geometry.spherical.computeArea(activeShape.overlay.getPath());
}

// Length of the drawn route, in metres (null unless a line is active).
function computeShapeLength() {
  if (!activeShape || activeShape.type !== 'line') {
    return null;
  }
  return google.maps.geometry.spherical.computeLength(activeShape.overlay.getPath());
}

// The distance readout shows all three units at once, e.g. "3,42 km · 3.420 m · 2,13 mi".
function formatLengthAllUnits(meters) {
  return [
    formatNumberLocale(meters / 1000, 2) + ' km',
    formatNumberLocale(Math.round(meters)) + ' m',
    formatNumberLocale(meters / MI_METERS, 2) + ' mi'
  ].join(i18n().sep);
}

// A single readable length for share text (km above a kilometre, else metres).
function formatLengthShort(meters) {
  return meters >= 1000
    ? formatNumberLocale(meters / 1000, 2) + ' km'
    : formatNumberLocale(Math.round(meters)) + ' m';
}

function shapeBounds() {
  if (!activeShape) {
    return null;
  }
  if (activeShape.type === 'circle' || activeShape.type === 'rect') {
    return activeShape.overlay.getBounds();
  }
  // Polygon and polyline both expose getPath().
  var bounds = new google.maps.LatLngBounds();
  activeShape.overlay.getPath().forEach(function(latLng) {
    bounds.extend(latLng);
  });
  return bounds;
}

function measureAreaDecimals(ha) {
  if (ha < 0.1) {
    return 3;
  }
  if (ha < 10) {
    return 2;
  }
  if (ha < 1000) {
    return 1;
  }
  return 0;
}

function updateAreaDisplay() {
  var readout = document.getElementById('area-readout');
  var equivalences = document.getElementById('equivalences');
  var viewAsCircle = document.getElementById('view-as-circle');
  // Route: show length in km · m · mi. "View as circle" is area-only.
  if (activeShape && activeShape.type === 'line') {
    if (viewAsCircle) { viewAsCircle.style.display = 'none'; }
    var meters = computeShapeLength();
    if (meters === null || meters <= 0) {
      if (readout) { readout.textContent = ''; }
      if (equivalences) { equivalences.textContent = ''; }
      return;
    }
    if (readout) { readout.textContent = formatLengthAllUnits(meters); }
    if (equivalences) { equivalences.textContent = ''; }
    return;
  }
  var m2 = computeShapeArea();
  if (m2 === null || m2 <= 0) {
    if (readout) { readout.textContent = ''; }
    if (equivalences) { equivalences.textContent = ''; }
    if (viewAsCircle) { viewAsCircle.style.display = 'none'; }
    return;
  }
  var ha = m2 / 10000;
  if (readout) {
    readout.textContent = formatNumberLocale(ha, measureAreaDecimals(ha)) + ' ha';
  }
  if (equivalences) {
    var text = getEquivalencesText(ha);
    // Imperial extras only make sense on the English page (acres already come
    // from getEquivalencesText there).
    if (SITE_LANG === 'en') {
      var extras = [];
      if (m2 < 50000) {
        extras.push(formatNumberLocale(Math.round(m2 * 10.7639)) + ' sq ft');
      }
      if (ha >= 100) {
        extras.push(formatNumberLocale(m2 / 2589988.110336, 2) + ' sq mi');
      }
      if (extras.length) {
        text += i18n().sep + extras.join(i18n().sep);
      }
    }
    equivalences.textContent = text;
  }
  if (viewAsCircle && map) {
    var center = shapeBounds().getCenter();
    var haRounded = Math.round(ha * 100) / 100;
    var home = SITE_LANG === 'en' ? '/en/' : '/';
    viewAsCircle.href = home + '?' + jQuery.param({
      ha: haRounded,
      lat: round5(center.lat()),
      lon: round5(center.lng()),
      z: map.getZoom()
    });
    viewAsCircle.textContent = measureI18n().viewAsCircle;
    viewAsCircle.style.display = '';
  }
}

// ---------------------------------------------------------------------------
// URL scheme: ?s=<c|r|p|l>&pts=<lat,lon[~lat,lon...]>[&r=<meters>]&lat=&lon=&z=
// (pts carries the shape's own points — circle center, rect SW~NE corners,
// polygon vertices or route/line vertices — while lat/lon/z always describe the
// viewport.)
// ---------------------------------------------------------------------------

function round5(v) {
  return Math.round(v * 100000) / 100000;
}

function pointsToString(latLngs) {
  var parts = [];
  for (var i = 0; i < latLngs.length; i++) {
    parts.push(round5(latLngs[i].lat()) + ',' + round5(latLngs[i].lng()));
  }
  return parts.join('~');
}

function parsePoints(str) {
  var points = [];
  var parts = String(str).split('~');
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split(',');
    var lat = parseFloat(pair[0]);
    var lon = parseFloat(pair[1]);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }
    points.push({ lat: lat, lon: lon });
  }
  return points;
}

// Built by hand instead of with jQuery.param: encoding "," and "~" (both safe
// in a query string) would triple the length of a polygon URL.
function serializeShape() {
  if (!activeShape) {
    return null;
  }
  if (activeShape.type === 'circle') {
    var center = activeShape.overlay.getCenter();
    return 's=c&pts=' + pointsToString([center]) + '&r=' + Math.round(activeShape.overlay.getRadius());
  }
  if (activeShape.type === 'rect') {
    var bounds = activeShape.overlay.getBounds();
    return 's=r&pts=' + pointsToString([bounds.getSouthWest(), bounds.getNorthEast()]);
  }
  var path = [];
  activeShape.overlay.getPath().forEach(function(latLng) {
    path.push(latLng);
  });
  // Route (open polyline) vs polygon differ only by the shape code.
  return (activeShape.type === 'line' ? 's=l&pts=' : 's=p&pts=') + pointsToString(path);
}

// Parsed from the URL before the map exists; drawn by renderShapeFromState().
var pendingShape = null;
var viewportInUrl = false;

function initializeMeasureParametersIfSet() {
  var paramLat = getUrlParameter('lat');
  var paramLon = getUrlParameter('lon');
  var paramZoom = getUrlParameter('z');
  if (paramLat != undefined && paramLon != undefined && paramZoom != undefined) {
    mapLatitude = parseFloat(paramLat);
    mapLongitude = parseFloat(paramLon);
    zoomLevel = parseInt(paramZoom);
    viewportInUrl = true;
  }
  var paramShape = getUrlParameter('s');
  var points = getUrlParameter('pts') != undefined ? parsePoints(getUrlParameter('pts')) : null;
  if (!points || !points.length) {
    return;
  }
  if (paramShape === 'c') {
    var radius = parseFloat(getUrlParameter('r'));
    if (!isNaN(radius) && radius >= MIN_CIRCLE_RADIUS_M) {
      pendingShape = { type: 'circle', center: points[0], radius: radius };
    }
  } else if (paramShape === 'r' && points.length === 2) {
    pendingShape = { type: 'rect', sw: points[0], ne: points[1] };
  } else if (paramShape === 'p' && points.length >= 3 && points.length <= MAX_POLY_VERTICES) {
    pendingShape = { type: 'poly', points: points };
  } else if (paramShape === 'l' && points.length >= 2 && points.length <= MAX_POLY_VERTICES) {
    pendingShape = { type: 'line', points: points };
  }
}

// ---------------------------------------------------------------------------
// Share links + live URL.
// ---------------------------------------------------------------------------

function measureParamString() {
  var shape = serializeShape();
  if (!shape || !map || !map.getCenter) {
    return null;
  }
  var center = map.getCenter();
  return shape + '&' + jQuery.param({
    lat: round5(center.lat()),
    lon: round5(center.lng()),
    z: map.getZoom()
  });
}

function generateMeasureSharingButtons() {
  var str = measureParamString();
  if (str === null) {
    var shareDefault = MEASURE_TOOL === 'distance'
      ? measureI18n().shareDefaultDistance
      : measureI18n().shareDefault;
    updateWhatsappShareLink(baseUrl, shareDefault);
    updateTwitterShareLink(baseUrl, shareDefault);
    updateFacebookShareLink(baseUrl, shareDefault);
    updateUrlShareLink(baseUrl);
    updateIframeShare('', iframeWidth, iframeHeight);
    return;
  }
  var shareUrl = baseUrl + '?' + str;
  var shareText;
  if (activeShape && activeShape.type === 'line') {
    shareText = measureI18n().shareTextDistance(formatLengthShort(computeShapeLength()));
  } else {
    var ha = computeShapeArea() / 10000;
    shareText = measureI18n().shareText(formatNumberLocale(ha, measureAreaDecimals(ha)));
  }
  updateWhatsappShareLink(shareUrl, shareText);
  updateTwitterShareLink(shareUrl, shareText);
  updateFacebookShareLink(shareUrl, shareText);
  updateUrlShareLink(shareUrl);
  // The iframe needs the language too (the page URL carries it in its path).
  updateIframeShare(SITE_LANG === 'en' ? str + '&hl=en' : str, iframeWidth, iframeHeight);
}

// The address bar mirrors the drawing so copying the URL always shares it.
function replaceStateNow() {
  if (!window.history || !history.replaceState) {
    return;
  }
  var str = measureParamString();
  history.replaceState(null, '', window.location.pathname + (str ? '?' + str : ''));
}

var onShapeChangedDebounced = debounce(function() {
  // updateAreaDisplay is cheap and keeps the "view as circle" link's zoom
  // fresh when the user pans/zooms without touching the shape.
  updateAreaDisplay();
  generateMeasureSharingButtons();
  replaceStateNow();
}, 300);

// Central hook: anything that alters the shape (finishing it, dragging it,
// editing a handle) funnels through here.
function onShapeChanged() {
  updateAreaDisplay();
  onShapeChangedDebounced();
}

// ---------------------------------------------------------------------------
// Shape lifecycle.
// ---------------------------------------------------------------------------

function removeInProgressArtifacts() {
  if (previewShape) {
    previewShape.setMap(null);
    previewShape = null;
  }
  if (previewLine) {
    previewLine.setMap(null);
    previewLine = null;
  }
  if (firstVertexMarker) {
    firstVertexMarker.setMap(null);
    firstVertexMarker = null;
  }
  polyPath = [];
  rectCornerA = null;
  drawStep = 0;
  toggleCloseButton(false);
}

function cancelDrawing() {
  removeInProgressArtifacts();
  if (drawMode) {
    setHint(hintForModeStart(drawMode));
  }
}

function clearShape() {
  removeInProgressArtifacts();
  if (activeShape) {
    activeShape.overlay.setMap(null);
    activeShape = null;
  }
  updateAreaDisplay();
  generateMeasureSharingButtons();
  replaceStateNow();
  setHint(drawMode ? hintForModeStart(drawMode) : measureI18n().hintIdle);
}

function attachEditListeners(shape) {
  var overlay = shape.overlay;
  if (shape.type === 'circle') {
    overlay.addListener('radius_changed', onShapeChanged);
    overlay.addListener('center_changed', onShapeChanged);
  } else if (shape.type === 'rect') {
    overlay.addListener('bounds_changed', onShapeChanged);
  } else {
    var path = overlay.getPath();
    path.addListener('set_at', onShapeChanged);
    path.addListener('insert_at', onShapeChanged);
    path.addListener('remove_at', onShapeChanged);
    overlay.addListener('dragend', onShapeChanged);
  }
}

function finishShape(shape) {
  removeInProgressArtifacts();
  activeShape = shape;
  attachEditListeners(shape);
  setDrawMode(null);
  setHint(shape.type === 'line' ? measureI18n().hintLineDone : measureI18n().hintDone);
  onShapeChanged();
  trackEvent('tool_used', { tool: 'measure', shape: shape.type });
}

// Rebuilds a shape parsed from the URL (the page makes it editable; the
// render-only iframe passes editable=false).
function renderShapeFromState(state, editable) {
  if (!state) {
    return;
  }
  var overlay;
  if (state.type === 'circle') {
    overlay = new google.maps.Circle({
      map: map,
      center: new google.maps.LatLng(state.center.lat, state.center.lon),
      radius: state.radius,
      strokeColor: SHAPE_STYLE.strokeColor,
      strokeWeight: SHAPE_STYLE.strokeWeight,
      fillColor: SHAPE_STYLE.fillColor,
      fillOpacity: SHAPE_STYLE.fillOpacity,
      editable: !!editable,
      draggable: !!editable
    });
  } else if (state.type === 'rect') {
    overlay = new google.maps.Rectangle({
      map: map,
      bounds: new google.maps.LatLngBounds(
        new google.maps.LatLng(state.sw.lat, state.sw.lon),
        new google.maps.LatLng(state.ne.lat, state.ne.lon)
      ),
      strokeColor: SHAPE_STYLE.strokeColor,
      strokeWeight: SHAPE_STYLE.strokeWeight,
      fillColor: SHAPE_STYLE.fillColor,
      fillOpacity: SHAPE_STYLE.fillOpacity,
      editable: !!editable,
      draggable: !!editable
    });
  } else if (state.type === 'line') {
    overlay = new google.maps.Polyline({
      map: map,
      path: state.points.map(function(p) {
        return new google.maps.LatLng(p.lat, p.lon);
      }),
      strokeColor: SHAPE_STYLE.strokeColor,
      strokeWeight: SHAPE_STYLE.strokeWeight,
      editable: !!editable,
      draggable: !!editable
    });
  } else {
    overlay = new google.maps.Polygon({
      map: map,
      paths: state.points.map(function(p) {
        return new google.maps.LatLng(p.lat, p.lon);
      }),
      strokeColor: SHAPE_STYLE.strokeColor,
      strokeWeight: SHAPE_STYLE.strokeWeight,
      fillColor: SHAPE_STYLE.fillColor,
      fillOpacity: SHAPE_STYLE.fillOpacity,
      editable: !!editable,
      draggable: !!editable
    });
  }
  activeShape = { type: state.type, overlay: overlay };
  if (editable) {
    attachEditListeners(activeShape);
    setHint(state.type === 'line' ? measureI18n().hintLineDone : measureI18n().hintDone);
  }
  updateAreaDisplay();
}

// ---------------------------------------------------------------------------
// Drawing modes.
// ---------------------------------------------------------------------------

function hintForModeStart(mode) {
  var S = measureI18n();
  return mode === 'circle' ? S.hintCircle1
    : mode === 'rect' ? S.hintRect1
    : mode === 'line' ? S.hintLine1
    : S.hintPoly1;
}

function toggleCloseButton(visible) {
  var button = document.getElementById('draw-close');
  if (button) {
    button.style.display = visible ? '' : 'none';
  }
}

function setModeButtonsActive(mode) {
  var ids = { circle: 'mode-circle', rect: 'mode-rect', poly: 'mode-poly', line: 'mode-line' };
  for (var key in ids) {
    var button = document.getElementById(ids[key]);
    if (button) {
      button.className = 'draw-mode-btn' + (key === mode ? ' active' : '');
    }
  }
}

// Arms a drawing mode (null disarms). Arming with a finished shape on the map
// removes it: one shape at a time, like every other tool on the site.
function setDrawMode(mode) {
  removeInProgressArtifacts();
  if (mode && activeShape) {
    activeShape.overlay.setMap(null);
    activeShape = null;
    updateAreaDisplay();
    generateMeasureSharingButtons();
    replaceStateNow();
  }
  drawMode = mode;
  setModeButtonsActive(mode);
  if (map) {
    // Double-click closes the polygon, so the default dblclick zoom would
    // fight it; a crosshair signals "the next click draws".
    map.setOptions({
      draggableCursor: mode ? 'crosshair' : null,
      disableDoubleClickZoom: !!mode
    });
  }
  if (mode) {
    setHint(hintForModeStart(mode));
  }
}

// --- Circle: click center, click again to fix the radius. ---

function startCircle(latLng) {
  drawStep = 1;
  previewShape = new google.maps.Circle({
    map: map,
    center: latLng,
    radius: 0,
    strokeColor: SHAPE_STYLE.strokeColor,
    strokeWeight: SHAPE_STYLE.strokeWeight,
    fillColor: SHAPE_STYLE.fillColor,
    fillOpacity: SHAPE_STYLE.fillOpacity,
    clickable: false
  });
  setHint(measureI18n().hintCircle2);
}

function finishCircle(latLng) {
  var radius = google.maps.geometry.spherical.computeDistanceBetween(previewShape.getCenter(), latLng);
  if (radius < MIN_CIRCLE_RADIUS_M) {
    return; // ignore: still in preview, waiting for a real radius
  }
  var shape = { type: 'circle', overlay: previewShape };
  previewShape.setRadius(radius);
  previewShape.setOptions({ editable: true, draggable: true, clickable: true });
  previewShape = null;
  finishShape(shape);
}

// --- Rectangle: click one corner, click the opposite one. ---

function boundsFrom(cornerA, cornerB) {
  var bounds = new google.maps.LatLngBounds();
  bounds.extend(cornerA);
  bounds.extend(cornerB);
  return bounds;
}

function startRect(latLng) {
  drawStep = 1;
  rectCornerA = latLng;
  previewShape = new google.maps.Rectangle({
    map: map,
    bounds: boundsFrom(latLng, latLng),
    strokeColor: SHAPE_STYLE.strokeColor,
    strokeWeight: SHAPE_STYLE.strokeWeight,
    fillColor: SHAPE_STYLE.fillColor,
    fillOpacity: SHAPE_STYLE.fillOpacity,
    clickable: false
  });
  setHint(measureI18n().hintRect2);
}

function finishRect(latLng) {
  if (latLng.lat() === rectCornerA.lat() || latLng.lng() === rectCornerA.lng()) {
    return; // degenerate (a line): keep waiting for a real opposite corner
  }
  var shape = { type: 'rect', overlay: previewShape };
  previewShape.setBounds(boundsFrom(rectCornerA, latLng));
  previewShape.setOptions({ editable: true, draggable: true, clickable: true });
  previewShape = null;
  finishShape(shape);
}

// --- Polygon: successive clicks; closes on the first vertex. ---

function samePoint(a, b) {
  return Math.abs(a.lat() - b.lat()) < 1e-7 && Math.abs(a.lng() - b.lng()) < 1e-7;
}

function refreshPreviewLine(cursorLatLng) {
  var path = polyPath.slice();
  if (cursorLatLng) {
    path.push(cursorLatLng);
  }
  if (!previewLine) {
    previewLine = new google.maps.Polyline({
      map: map,
      path: path,
      strokeColor: SHAPE_STYLE.strokeColor,
      strokeWeight: SHAPE_STYLE.strokeWeight,
      clickable: false
    });
  } else {
    previewLine.setPath(path);
  }
}

// Shared by the polygon and the route (line): both grow a path of clicks. A
// polygon closes on its first vertex and needs 3 points; a route stays open and
// finishes at 2 points via double-click or the "Finish" button.
function addPolyVertex(latLng) {
  var isLine = drawMode === 'line';
  if (polyPath.length && samePoint(polyPath[polyPath.length - 1], latLng)) {
    return; // duplicate click (or the click half of a dblclick)
  }
  if (polyPath.length >= MAX_POLY_VERTICES) {
    setHint(isLine ? measureI18n().hintLineMax : measureI18n().hintPolyMax);
    return;
  }
  polyPath.push(latLng);
  drawStep = 1;
  refreshPreviewLine();
  if (!isLine && polyPath.length === 1) {
    // The first vertex is a clickable marker: its hit area doubles as the
    // "close the ring" target, no pixel math needed. A route never closes, so
    // it has no such marker.
    firstVertexMarker = new google.maps.Marker({
      map: map,
      position: latLng,
      icon: VERTEX_ICON,
      title: ''
    });
    firstVertexMarker.addListener('click', closePolygon);
  }
  if (isLine) {
    if (polyPath.length >= 2) {
      toggleCloseButton(true);
      setHint(measureI18n().hintLineReady);
    }
  } else if (polyPath.length >= 3) {
    toggleCloseButton(true);
    setHint(measureI18n().hintPolyReady);
  }
}

function closePolygon() {
  if (polyPath.length < 3) {
    return;
  }
  var path = polyPath.slice();
  removeInProgressArtifacts();
  var overlay = new google.maps.Polygon({
    map: map,
    paths: path,
    strokeColor: SHAPE_STYLE.strokeColor,
    strokeWeight: SHAPE_STYLE.strokeWeight,
    fillColor: SHAPE_STYLE.fillColor,
    fillOpacity: SHAPE_STYLE.fillOpacity,
    editable: true,
    draggable: true
  });
  finishShape({ type: 'poly', overlay: overlay });
}

// --- Route: successive clicks; finishes (open) at 2+ points. ---

function finishLine() {
  if (polyPath.length < 2) {
    return;
  }
  var path = polyPath.slice();
  removeInProgressArtifacts();
  var overlay = new google.maps.Polyline({
    map: map,
    path: path,
    strokeColor: SHAPE_STYLE.strokeColor,
    strokeWeight: SHAPE_STYLE.strokeWeight,
    editable: true,
    draggable: true
  });
  finishShape({ type: 'line', overlay: overlay });
}

// --- Map event dispatch. ---

function handleMapClick(e) {
  if (!drawMode) {
    return;
  }
  if (drawMode === 'circle') {
    drawStep === 0 ? startCircle(e.latLng) : finishCircle(e.latLng);
  } else if (drawMode === 'rect') {
    drawStep === 0 ? startRect(e.latLng) : finishRect(e.latLng);
  } else {
    addPolyVertex(e.latLng);
  }
}

function handleMapMouseMove(e) {
  if (!drawMode || drawStep === 0) {
    return;
  }
  if (drawMode === 'circle' && previewShape) {
    previewShape.setRadius(google.maps.geometry.spherical.computeDistanceBetween(previewShape.getCenter(), e.latLng));
  } else if (drawMode === 'rect' && previewShape) {
    previewShape.setBounds(boundsFrom(rectCornerA, e.latLng));
  } else if ((drawMode === 'poly' || drawMode === 'line') && polyPath.length) {
    refreshPreviewLine(e.latLng);
  }
}

function handleMapDblClick() {
  if (drawMode === 'poly') {
    closePolygon();
  } else if (drawMode === 'line') {
    finishLine();
  }
}

// ---------------------------------------------------------------------------
// Page init (Google Maps callback). The iframe does NOT use this: it builds
// its own map and calls initializeMeasureParametersIfSet() +
// renderShapeFromState() directly (js/measure-iframe.js).
// ---------------------------------------------------------------------------

function initMap() {
  VERTEX_ICON.path = google.maps.SymbolPath.CIRCLE;
  initializeMeasureParametersIfSet();
  map = new google.maps.Map(document.getElementById('map'), {
    'zoom': zoomLevel,
    'center': new google.maps.LatLng(mapLatitude, mapLongitude),
    'mapTypeId': google.maps.MapTypeId.ROADMAP
  });
  map.addListener('click', handleMapClick);
  map.addListener('mousemove', handleMapMouseMove);
  map.addListener('dblclick', handleMapDblClick);
  // Panning/zooming with a drawn shape changes the shared viewport.
  map.addListener('center_changed', onShapeChangedDebounced);
  map.addListener('zoom_changed', onShapeChangedDebounced);

  if (pendingShape) {
    renderShapeFromState(pendingShape, true);
    if (!viewportInUrl) {
      map.fitBounds(shapeBounds());
    }
  }

  setHint(activeShape
    ? (activeShape.type === 'line' ? measureI18n().hintLineDone : measureI18n().hintDone)
    : measureI18n().hintIdle);

  // Native listeners on purpose: measure.js must stay usable next to the old
  // jQuery shipped by the iframes (no jQuery.on there). Each control is guarded
  // because the distance page ships only #mode-line (no circle/rect/poly).
  function onClick(id, handler) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', handler);
    }
  }
  onClick('mode-circle', function() { setDrawMode('circle'); });
  onClick('mode-rect', function() { setDrawMode('rect'); });
  onClick('mode-poly', function() { setDrawMode('poly'); });
  onClick('mode-line', function() { setDrawMode('line'); });
  onClick('draw-clear', function() {
    setDrawMode(null);
    clearShape();
    // The distance page has no shape buttons, so it re-arms route mode itself.
    if (MEASURE_TOOL === 'distance') {
      setDrawMode('line');
    }
  });
  onClick('draw-close', function() {
    drawMode === 'line' ? finishLine() : closePolygon();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      cancelDrawing();
    }
  });

  // The distance page starts ready to draw a route (no shape to restore).
  if (MEASURE_TOOL === 'distance' && !activeShape) {
    setDrawMode('line');
  }

  $('#iframe-share-width').val(iframeWidth);
  $('#iframe-share-height').val(iframeHeight);
  $('#iframe-share-width, #iframe-share-height').keyup(function() {
    iframeWidth = $('#iframe-share-width').val();
    iframeHeight = $('#iframe-share-height').val();
    generateMeasureSharingButtons();
  });

  generateMeasureSharingButtons();
}
