// Site chrome (no framework): mobile menu, cookie notice, engagement events.
// Loaded with `defer` on every page; the tools' own scripts never depend on it.
// Event dictionary: see "Tracking" in CLAUDE.md.
(function () {
  'use strict';
  var lang = (document.documentElement.lang || 'es').slice(0, 2);

  // --- mobile menu -----------------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- cookie notice (bilingual, remembered per browser) ---------------------
  var KEY = 'hm-cookies-ok';
  var seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { seen = false; }
  if (!seen) {
    var T = lang === 'en'
      ? { text: 'This site uses cookies for analytics and ads.', more: 'Learn more', ok: 'Got it' }
      : { text: 'Este sitio usa cookies para analítica y publicidad.', more: 'Más información', ok: 'Entendido' };
    var moreHref = lang === 'en' ? 'https://policies.google.com/technologies/cookies?hl=en' : 'https://policies.google.com/technologies/cookies?hl=es';
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookies');
    bar.innerHTML = '<p>' + T.text + ' <a href="' + moreHref + '" target="_blank" rel="noopener">' + T.more + '</a></p><button type="button">' + T.ok + '</button>';
    bar.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.parentNode.removeChild(bar);
    });
    document.body.appendChild(bar);
  }

  // --- engagement events -----------------------------------------------------
  // Production only (localhost previews would pollute GA4), unless the
  // `hm-track-debug` localStorage flag is set for testing.
  function allowed() {
    if (/(^|\.)hectareometro\.com$/.test(location.hostname)) return true;
    try { return localStorage.getItem('hm-track-debug') === '1'; } catch (e) { return false; }
  }
  function track(name, params) {
    if (typeof gtag === 'function' && allowed()) gtag('event', name, params || {});
  }
  // Which tool this page is about, from <body data-section> (set by the
  // generator and the hand pages). Articles/hubs have no tool → 'none'.
  var TOOL_BY_SECTION = { hectareas: 'hectares', distancias: 'distances', litros: 'liters', kilos: 'kilos', dinero: 'money', medir: 'measure', 'medir-dist': 'measure_distance', 'conv-area': 'converter', 'conv-dist': 'length_converter' };
  var tool = TOOL_BY_SECTION[document.body.getAttribute('data-section')] || 'none';

  // Which navigation elements actually get used.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var kind = a.classList.contains('brand') ? 'brand'
      : a.closest('.hdr-actions') ? 'lang'
      : a.closest('.ladder') ? 'ladder'
      : a.closest('.related-links') ? 'chip'
      : a.closest('.lenses') ? 'lens'
      : a.closest('.site-nav') ? 'nav'
      : a.closest('.card-grid') ? 'card'
      : a.closest('.site-footer') ? 'footer'
      : null;
    if (kind) track('nav_click', { kind: kind, href: a.getAttribute('href') || '' });
  });
  document.addEventListener('toggle', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('share') && e.target.open) {
      track('share_open', {});
    }
  }, true);

  // answer_view / ladder_view: the block has been ≥ 50 % (30 % for the tall
  // ladder) visible for one continuous second. Once per page. This is the
  // "did they get the answer?" signal that bounce rate and scroll depth can't
  // give on an answer-first page.
  function viewed(selector, ratio, name) {
    var el = document.querySelector(selector);
    if (!el || !('IntersectionObserver' in window)) return;
    var timer = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= ratio) {
          if (!timer) timer = setTimeout(function () { io.disconnect(); track(name, { tool: tool }); }, 1000);
        } else if (timer) {
          clearTimeout(timer); timer = null;
        }
      });
    }, { threshold: [ratio] });
    io.observe(el);
  }
  viewed('.hero-visual', 0.5, 'answer_view');
  viewed('.ladder', 0.3, 'ladder_view');

  // answer_copy: the visitor copied text from the answer (H1, equivalences,
  // map pill, converter result). Silent success: copy and leave.
  var copied = false;
  document.addEventListener('copy', function () {
    if (copied) return;
    var sel = window.getSelection ? window.getSelection() : null;
    var node = sel && sel.anchorNode;
    if (!node) return;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (el && el.closest && el.closest('h1.ans, #equivalences, .map-pill, .conv-result-value, .picto-count, .money-count')) {
      copied = true;
      track('answer_copy', { tool: tool });
    }
  });

  // web_vitals: LCP / CLS / INP from PerformanceObserver, one event each,
  // sent when the page is hidden. Field data for a site CrUX does not cover.
  // Trimmed version of the web-vitals library's algorithms; good enough to
  // track p75 by device and page type, not a lab-grade implementation.
  (function webVitals() {
    if (!('PerformanceObserver' in window) || typeof gtag !== 'function') return;
    // A page opened in a background tab has no meaningful LCP (it paints when
    // the tab is shown); CLS/INP are still fine.
    var hiddenAtStart = document.visibilityState === 'hidden';
    var lcp = null, lcpEl = '', cls = 0, win = 0, winStart = 0, winLast = 0, inp = 0, sent = false;
    function observe(type, cb, opts) {
      try {
        var po = new PerformanceObserver(function (list) { list.getEntries().forEach(cb); });
        po.observe(Object.assign({ type: type, buffered: true }, opts || {}));
        return po;
      } catch (e) { return null; }
    }
    var lcpObs = observe('largest-contentful-paint', function (entry) {
      lcp = entry.startTime;
      var n = entry.element;
      lcpEl = n ? (n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '')) : '';
    });
    observe('layout-shift', function (entry) {
      if (entry.hadRecentInput) return;
      // Session windows: gap < 1 s, length < 5 s; CLS = the largest window.
      if (win && entry.startTime - winLast < 1000 && entry.startTime - winStart < 5000) {
        win += entry.value;
      } else {
        win = entry.value; winStart = entry.startTime;
      }
      winLast = entry.startTime;
      if (win > cls) cls = win;
    });
    observe('event', function (entry) {
      if (entry.interactionId && entry.duration > inp) inp = entry.duration;
    }, { durationThreshold: 40 });
    function stopLcp() { if (lcpObs) { lcpObs.disconnect(); lcpObs = null; } }
    ['keydown', 'pointerdown', 'click'].forEach(function (t) { addEventListener(t, stopLcp, { once: true, capture: true }); });
    function send() {
      if (sent) return;
      sent = true;
      stopLcp();
      var metrics = [];
      if (lcp !== null && !hiddenAtStart) metrics.push(['LCP', Math.round(lcp), lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor', lcpEl]);
      metrics.push(['CLS', Math.round(cls * 1000) / 1000, cls <= 0.1 ? 'good' : cls <= 0.25 ? 'needs-improvement' : 'poor', '']);
      if (inp) metrics.push(['INP', Math.round(inp), inp <= 200 ? 'good' : inp <= 500 ? 'needs-improvement' : 'poor', '']);
      metrics.forEach(function (m) {
        track('web_vitals', { metric_name: m[0], metric_value: m[1], rating: m[2], element: m[3], tool: tool, non_interaction: true });
      });
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(); });
    addEventListener('pagehide', send);
  })();
})();
