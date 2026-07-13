// Embeddable liters pictogram (iframe-litros.html). Loads after
// hectareas-utils.js, liters-data.js and liters.js: reuses their globals
// (baseAmount, baseInputUnit, literLang) and pure builders. There is no
// input in the iframe, so it just reads ?l=&u=&v=(&hl=en) and renders once.
// The credit link points at the tool page preloaded with the same view.
$(document).ready(function() {
  initializeLiterParametersIfSet();
  var totalLiters = toLiters(baseAmount, baseInputUnit);
  var unit = basePictoUnit === 'auto' ? pickLiterUnit(totalLiters) : literUnitById(basePictoUnit);
  var picto = buildPictogram(totalLiters, unit, literLang);
  $('#pictogram')
    .html(picto.rowsHtml)
    .attr('class', picto.sizeClass)
    .attr('aria-label', picto.ariaLabel);
  $('#picto-count').text(picto.countText);
  $('#picto-legend').text(picto.legendText);
  var creditParams = { l: baseAmount, u: baseInputUnit };
  if (basePictoUnit !== 'auto') {
    creditParams.v = basePictoUnit;
  }
  $('#litros-credit a').attr('href', baseUrl + '?' + jQuery.param(creditParams));
});
