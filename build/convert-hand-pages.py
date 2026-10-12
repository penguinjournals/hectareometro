#!/usr/bin/env python3
"""One-off migration of the 18 hand-maintained pages to the 2026 layout.
Kept in the repo as documentation of what the hand pages' chrome is made of;
the chrome itself comes from `node build/chrome.js`."""
import re, json, subprocess, sys, html

PAGES = [
  # file, lang, section, switch href, kind
  ('index.html', 'es', 'hectareas', '/en/', 'ha'),
  ('en/index.html', 'en', 'hectareas', '/', 'ha'),
  ('distancias/index.html', 'es', 'distancias', '/en/distances/', 'dist'),
  ('en/distances/index.html', 'en', 'distancias', '/distancias/', 'dist'),
  ('litros/index.html', 'es', 'litros', '/en/liters/', 'picto'),
  ('en/liters/index.html', 'en', 'litros', '/litros/', 'picto'),
  ('kilos/index.html', 'es', 'kilos', '/en/kilos/', 'picto'),
  ('en/kilos/index.html', 'en', 'kilos', '/kilos/', 'picto'),
  ('dinero/index.html', 'es', 'dinero', '/en/money/', 'money'),
  ('en/money/index.html', 'en', 'dinero', '/dinero/', 'money'),
  ('medir-superficie/index.html', 'es', 'medir', '/en/measure-area/', 'measure'),
  ('en/measure-area/index.html', 'en', 'medir', '/medir-superficie/', 'measure'),
  ('medir-distancias/index.html', 'es', 'medir-dist', '/en/measure-distance/', 'measure'),
  ('en/measure-distance/index.html', 'en', 'medir-dist', '/medir-distancias/', 'measure'),
  ('hectareas-a-metros-cuadrados/index.html', 'es', 'conv-area', '/en/hectares-to-square-meters/', 'conv'),
  ('en/hectares-to-square-meters/index.html', 'en', 'conv-area', '/hectareas-a-metros-cuadrados/', 'conv'),
  ('kilometros-a-millas/index.html', 'es', 'conv-dist', '/en/kilometers-to-miles/', 'conv'),
  ('en/kilometers-to-miles/index.html', 'en', 'conv-dist', '/kilometros-a-millas/', 'conv'),
]

def chrome(lang, section, href, iframe):
    out = subprocess.check_output(['node', 'build/chrome.js', lang, section, href] + ([] if iframe else ['noiframe']))
    return json.loads(out)

def ladder(lang, ha):
    js = f"const g=require('./build/generate.js');process.stdout.write(g.ladderFor('{lang}',{ha}))"
    return subprocess.check_output(['node', '-e', js]).decode()

def must(pattern, s, flags=re.S):
    m = re.search(pattern, s, flags)
    if not m:
        raise SystemExit('pattern not found: ' + pattern[:70])
    return m

for file, lang, section, href, kind in PAGES:
    s = open(file).read()
    iframe = 'iframe-share' in s
    C = chrome(lang, section, href, iframe)

    # ---- head: drop the old asset stack, add the shared head block ---------
    head_end = s.index('</head>')
    head, body = s[:head_end], s[head_end:]
    head = re.sub(r'\s*<!-- Google tag \(gtag\.js\) -->.*?</script>\n', '\n', head, count=1, flags=re.S)
    for pat in [
        r'<meta charset="utf-8">\n', r'<meta name="viewport"[^>]*>\n', r'<link rel="icon" href="/?favicon\.ico">\n',
        r'<link rel="stylesheet" href="https://maxcdn\.bootstrapcdn\.com/[^>]*>\n',
        r"<link href='https://fonts\.googleapis\.com/css\?family=Open\+Sans'[^>]*>\n",
        r"<link href='/?css/style\.css'[^>]*>\n",
        r'<script src="https://maxcdn\.bootstrapcdn\.com/bootstrap/[^>]*></script>\n',
        r'<script src="https://platform\.twitter\.com/widgets\.js"[^>]*></script>\n',
        r'<link rel="stylesheet" type="text/css" href="//cdnjs\.cloudflare\.com/ajax/libs/cookieconsent2[^>]*/>\n',
        r'<script src="//cdnjs\.cloudflare\.com/ajax/libs/cookieconsent2[^>]*></script>\n',
        r'<script>\nwindow\.addEventListener\("load", function\(\)\{\nwindow\.cookieconsent\.initialise\(.*?\}\)\}\);\n</script>\n',
    ]:
        head, n = re.subn(pat, '', head, flags=re.S)
    head = head.replace('<head>\n', '<head>\n' + C['HEAD_COMMON'] + '\n', 1)
    head = re.sub(r'src="js/', 'src="/js/', head)
    s = head + body

    # ---- body chrome -----------------------------------------------------
    s = re.sub(r'<body>', f'<body data-section="{section}">', s, count=1)
    s = re.sub(r'<nav class="navbar navbar-default site-nav">.*?</nav>\n', C['HEADER'] + '\n', s, count=1, flags=re.S)
    s = re.sub(r'<footer class="site-footer text-center">.*?</footer>', C['FOOTER'], s, count=1, flags=re.S)
    s = s.replace('<i class="fa fa-download"></i>', C['ICON_DOWNLOAD'])

    # ---- share block out of the flow (goes into hero-more) ----------------
    s, n = re.subn(r'  <div id="share-block" class="text-center">.*?</form>\s*</div>\s*</div>\s*</div>\n', '', s, count=1, flags=re.S)
    assert n == 1, file + ': share block'

    # ---- H1 + sub ----------------------------------------------------------
    m = must(r'\n\s*<h1>(.*?)</h1>\n', s)
    h1 = m.group(1).strip()
    s = s[:m.start()] + '\n' + s[m.end():]
    desc = html.unescape(must(r'<meta name="description" content="([^"]*)"', s).group(1))
    sub = html.escape(desc, quote=False)
    crumb = ''  # hand pages sit directly under the home; keep the hero clean

    head_html = f"""    <div class="hero-head">
      <h1 class="ans">{h1}</h1>
      <p class="sub">{sub}</p>
"""
    more_html = ''
    if kind == 'ha':
        more_html += ladder(lang, 1) + '\n'
        # the hectares chip group of the examples block moves up under the map
        m = must(r'      <div class="chip-group">\n        <span class="chip-group-label">(Hectáreas|Hectares)</span>\n(.*?)      </div>\n', s)
        more_html += '      <h2 class="eyebrow">' + m.group(1) + '</h2>\n' + m.group(2)
        s = s[:m.start()] + s[m.end():]
    more_html += C['SHARE_BLOCK'] + '\n'

    def hero(cls, head_extra, visual):
        return f"""<section class="hero{cls}">
  <div class="wrap">
{head_html}{head_extra}    </div>
    <div class="hero-visual">
{visual}
    </div>
    <div class="hero-more">
{more_html}    </div>
  </div>
</section>
"""

    if kind in ('ha', 'dist'):
        m = must(r'<div id="map-container">\n  <div id="map"></div>\n  <div id="hectareas-overlay">\n(.*?)    <div id="equivalences" aria-live="polite"></div>\n  </div>\n</div>\n', s)
        ctl_inner = m.group(1)
        # "¿Cuánto ocupan … hectáreas?" → control card: question + input + unit
        ctl_inner = ctl_inner.replace('¿Cuánto ocupan', '¿Cuánto son')
        ctl_inner = re.sub(r'<label for="(hectareas|distance)">([^<]*?)\??</label>\n(\s*)$', lambda mm: f'<span class="ctl-unit">{mm.group(2).strip()}</span>\n{mm.group(3)}', ctl_inner)
        ctl_inner = re.sub(r'<input type="text" id="(hectareas|distance)" class="customizable-parameter">', r'<input type="text" id="\1" class="customizable-parameter" inputmode="decimal" autocomplete="off">', ctl_inner)
        ctl_inner = re.sub(r'^    ', '        ', ctl_inner, flags=re.M)
        head_extra = f"""      <div class="ctl">
{ctl_inner}      </div>
      <p id="equivalences" class="ans-line" aria-live="polite"></p>
"""
        visual = f"""      <div id="map-container">
        <div id="map"></div>
        <div class="map-pill" id="map-pill"></div>
        <div class="map-hint">{C['MAP_HINT']}</div>
      </div>"""
        s = s[:m.start()] + hero('', head_extra, visual) + s[m.end():]
    elif kind == 'measure':
        m = must(r'<div id="map-container">\n(.*?)\n</div>\n\n', s)
        inner = m.group(1)
        inner = re.sub(r'^', '    ', inner, flags=re.M)
        visual = f"""      <div id="map-container">
{inner}
      </div>"""
        s = s[:m.start()] + hero('', '', visual) + s[m.end():]
    elif kind in ('picto', 'money'):
        m = must(r'<div id="litros-tool">\n  <div id="litros-panel">\n(.*?)    <div id="equivalences" aria-live="polite"></div>\n  </div>\n(.*?)\n</div>\n\n', s)
        panel = re.sub(r'^    ', '          ', m.group(1), flags=re.M)
        panel = re.sub(r'<input type="text" id="(liters|kilos|money)" class="customizable-parameter"', r'<input type="text" id="\1" class="customizable-parameter" inputmode="decimal" autocomplete="off"', panel)
        rest = re.sub(r'^  ', '        ', m.group(2), flags=re.M)
        head_extra = f"""      <div id="litros-tool">
        <div id="litros-panel">
{panel}          <div id="equivalences" aria-live="polite"></div>
        </div>
      </div>
"""
        visual = (f"      <div class=\"picto-stage\">\n{rest}\n      </div>" if kind == 'picto' else rest)
        s = s[:m.start()] + hero(' hero-nomap', head_extra, visual) + s[m.end():]
    elif kind == 'conv':
        m = must(r'<div id="converter-tool">\n  <div id="converter-panel">\n(.*?)  </div>\n(.*?)\n</div>\n\n', s)
        panel = re.sub(r'^    ', '          ', m.group(1), flags=re.M)
        panel = re.sub(r'<input type="text" id="(area-value|length-value)" class="customizable-parameter"', r'<input type="text" id="\1" class="customizable-parameter" inputmode="decimal" autocomplete="off"', panel)
        table = re.sub(r'^  ', '        ', m.group(2), flags=re.M)
        head_extra = f"""      <div id="converter-tool">
        <div id="converter-panel">
{panel}        </div>
      </div>
"""
        visual = f"      <div id=\"converter-tool\" class=\"converter-results\">\n{table}\n      </div>"
        s = s[:m.start()] + hero(' hero-nomap', head_extra, visual) + s[m.end():]

    # ---- content wrappers --------------------------------------------------
    s = s.replace('<div class="container-fluid">', '<div class="wrap">', 1)
    s, n1 = re.subn(r'  <div class="row">\n    <div class="col-xs-12 col-md-8 col-md-offset-2 content-section">\n(.*?)\n    </div>\n  </div>\n', r'  <div class="prose section">\n\1\n  </div>\n', s, flags=re.S)
    s, n2 = re.subn(r'  <div class="row">\n    <div class="col-xs-12 col-md-8 col-md-offset-2 content-section section-block">\n(.*?)\n    </div>\n  </div>\n', r'  <section class="section prose">\n\1\n  </section>\n', s, flags=re.S)
    # the lenses block closes the content column, before the footer
    s = s.replace('</div>\n<footer class="site-footer">', C['LENSES_BLOCK'] + '\n</div>\n</main>\n<footer class="site-footer">', 1)
    s = s.replace('<section class="hero', '<main>\n<section class="hero', 1)
    left = [c for c in ['container-fluid', 'col-md', 'navbar', 'fa fa-', 'data-toggle', 'bootstrap', 'cookieconsent', 'twitter.com/widgets', 'Open+Sans'] if c in s]
    assert not left, file + ': leftovers ' + str(left)
    open(file, 'w').write(s)
    print(f'{file}: prose={n1} sections={n2} iframe={iframe}')
