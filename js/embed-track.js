// Analytics for the embeddable iframes: a cookieless gtag that sends a single
// `embed_view {tool, host}` so we know which sites embed which tool. No
// page_view, no storage (third-party context), nothing else. `trackEvent()`
// in hectareas-utils.js also becomes live here, so a broken map inside an
// embed reports `map_error` too. Loaded with `defer`; `data-tool` names the tool.
(function () {
  'use strict';
  var script = document.currentScript;
  var tool = (script && script.getAttribute('data-tool')) || 'unknown';
  if (!/(^|\.)hectareometro\.com$/.test(location.hostname)) {
    try { if (localStorage.getItem('hm-track-debug') !== '1') return; } catch (e) { return; }
  }
  var host = 'direct';
  try { if (document.referrer) host = new URL(document.referrer).hostname || 'direct'; } catch (e) {}
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', 'G-7KGFGQLBRJ', { send_page_view: false, client_storage: 'none', allow_google_signals: false, allow_ad_personalization_signals: false });
  gtag('event', 'embed_view', { tool: tool, host: host, non_interaction: true });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-7KGFGQLBRJ';
  document.head.appendChild(s);
})();
