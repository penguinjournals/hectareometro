// Site chrome (no framework): mobile menu, cookie notice, engagement events.
// Loaded with `defer` on every page; the tools' own scripts never depend on it.
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

  // --- engagement: which navigation elements actually get used ---------------
  function track(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var kind = a.closest('.ladder') ? 'ladder'
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
})();
