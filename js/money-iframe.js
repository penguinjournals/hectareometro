// Embeddable money view (iframe-dinero.html). Loads after hectareas-utils.js,
// money-data.js and money.js: reuses their globals (baseMoney, baseCurrency,
// baseTimeView, baseObjView, moneyLang, baseUrl) and pure builders. There is
// no input in the iframe, so it just reads ?m=&c=&vt=&vo=(&hl=en) and renders
// once. The credit link points at the tool page preloaded with the same view.
$(document).ready(function() {
  initializeMoneyParametersIfSet();
  var units = resolveMoneyUnits(baseMoney, baseCurrency, baseTimeView, baseObjView);
  $('#money-headline').text(buildMoneyHeadline(baseMoney, baseCurrency, units.time, units.obj, moneyLang));
  var bar = buildMoneyTimeBar(baseMoney, baseCurrency, moneyLang, new Date().getFullYear());
  $('#money-bar').html(bar.html);
  $('#money-bar-caption').html(bar.caption);
  [['money-time', units.time], ['money-obj', units.obj]].forEach(function(pair) {
    var picto = buildMoneyPictogram(baseMoney, pair[1], moneyLang);
    $('#' + pair[0] + '-picto')
      .html(picto.rowsHtml)
      .attr('class', 'money-picto ' + picto.sizeClass)
      .attr('aria-label', picto.ariaLabel);
    $('#' + pair[0] + '-count').text(picto.countText);
    $('#' + pair[0] + '-legend').text(picto.legendText);
  });
  var creditParams = { m: baseMoney, c: baseCurrency };
  if (baseTimeView !== 'auto') {
    creditParams.vt = baseTimeView;
  }
  if (baseObjView !== 'auto') {
    creditParams.vo = baseObjView;
  }
  $('#money-credit a').attr('href', baseUrl + '?' + jQuery.param(creditParams));
});
