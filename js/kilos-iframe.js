// Embeddable kilos pictogram (iframe-kilos.html). Loads after
// hectareas-utils.js, liters-data.js (shared entities), kilos-data.js and
// kilos.js: reuses their globals (baseAmount, baseInputUnit, kiloLang) and
// pure builders. There is no input in the iframe, so it just reads
// ?k=&u=&v=(&hl=en) and renders once. The credit link points at the tool page
// preloaded with the same view.
$(document).ready(function() {
  initializeKiloParametersIfSet();
  var totalKg = toKilos(baseAmount, baseInputUnit);
  var unit = basePictoUnit === 'auto' ? pickKiloUnit(totalKg) : kiloUnitById(basePictoUnit);
  var picto = buildKiloPictogram(totalKg, unit, kiloLang);
  $('#pictogram')
    .html(picto.rowsHtml)
    .attr('class', picto.sizeClass)
    .attr('aria-label', picto.ariaLabel);
  $('#picto-count').text(picto.countText);
  $('#picto-legend').text(picto.legendText);
  var creditParams = { k: baseAmount, u: baseInputUnit };
  if (basePictoUnit !== 'auto') {
    creditParams.v = basePictoUnit;
  }
  $('#kilos-credit a').attr('href', baseUrl + '?' + jQuery.param(creditParams));
});
