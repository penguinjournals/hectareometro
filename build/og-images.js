#!/usr/bin/env node
// Renders images/og/<name>.png (1200x630) for every page with a map preset:
// OpenStreetMap tiles around the page's map centre, the page's circle drawn to
// scale (filled for hectares, outline for distances) and the answer on a card.
// Needs Google Chrome (headless). Images are committed; only missing ones are
// rendered unless --force is passed. Usage: node build/og-images.js [--force] [name...]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const g = require('./generate.js');

const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found (set CHROME=/path/to/chrome)'); process.exit(1); }

const W = 1200, H = 630;
const OUT = path.join(__dirname, '..', 'images', 'og');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter(a => !a.startsWith('--'));

function tilePos(lat, lon, z) {
  const n = Math.pow(2, z) * 256;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

function html(t) {
  const c = tilePos(t.lat, t.lon, t.zoom);
  const tlx = c.x - W / 2, tly = c.y - H / 2;
  const mpp = (156543.03392 * Math.cos((t.lat * Math.PI) / 180)) / Math.pow(2, t.zoom);
  const r = t.radiusM / mpp;
  const tiles = [];
  for (let tx = Math.floor(tlx / 256); tx <= Math.floor((tlx + W - 1) / 256); tx++) {
    for (let ty = Math.floor(tly / 256); ty <= Math.floor((tly + H - 1) / 256); ty++) {
      const sub = ['a', 'b', 'c'][(tx + ty) % 3];
      tiles.push(`<img src="https://${sub}.tile.openstreetmap.org/${t.zoom}/${tx}/${ty}.png" style="left:${tx * 256 - tlx}px;top:${ty * 256 - tly}px">`);
    }
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const circle = t.outline
    ? `<div class="circle outline" style="width:${2 * r}px;height:${2 * r}px;left:${W / 2 - r}px;top:${H / 2 - r}px"></div><div class="dot"></div>`
    : `<div class="circle" style="width:${2 * r}px;height:${2 * r}px;left:${W / 2 - r}px;top:${H / 2 - r}px"></div>`;
  const brand = t.lang === 'es' ? 'hectareómetro' : 'hectareometer';
  const sub = t.sub.length > 120 ? t.sub.slice(0, 117).replace(/\s+\S*$/, '') + '…' : t.sub;
  const titleSize = t.title.length > 48 ? 34 : t.title.length > 30 ? 40 : 46;
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700;800&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#EDEBE4;font-family:"Inter",system-ui,sans-serif}
.map{position:absolute;inset:0;overflow:hidden}
.map img{position:absolute;width:256px;height:256px;filter:saturate(.8)}
.circle{position:absolute;border-radius:50%;background:rgba(228,85,58,.28);border:4px solid #E4553A;box-shadow:0 0 0 10px rgba(228,85,58,.10)}
.circle.outline{background:transparent;border-width:5px}
.dot{position:absolute;left:${W / 2 - 7}px;top:${H / 2 - 7}px;width:14px;height:14px;border-radius:50%;background:#E4553A;border:3px solid #fff}
.card{position:absolute;left:40px;bottom:40px;max-width:640px;background:rgba(255,255,255,.96);border:1px solid #E5E3DB;border-radius:22px;padding:22px 28px 24px;box-shadow:0 10px 40px rgba(20,20,18,.18)}
.brand{display:flex;align-items:center;gap:9px;font-family:"Inter Tight";font-weight:700;font-size:20px;color:#151513;letter-spacing:-.02em;margin-bottom:10px}
.brand i{width:18px;height:18px;border-radius:50%;background:rgba(228,85,58,.16);border:3px solid #E4553A;display:inline-block}
.t{font-family:"Inter Tight";font-weight:800;font-size:${titleSize}px;line-height:1.08;letter-spacing:-.03em;color:#151513}
.s{margin-top:10px;font-size:19px;font-weight:500;color:#55554F;line-height:1.35}
.attr{position:absolute;right:10px;bottom:8px;font-size:12px;color:#55554F;background:rgba(255,255,255,.85);padding:3px 7px;border-radius:6px}
</style></head><body>
<div class="map">${tiles.join('')}${circle}</div>
<div class="card"><div class="brand"><i></i>${brand}</div><div class="t">${esc(t.title)}</div><div class="s">${esc(sub)}</div></div>
<div class="attr">© OpenStreetMap contributors</div>
</body></html>`;
}

function render(t) {
  return new Promise((resolve, reject) => {
    const file = path.join(TMP, t.name + '.html');
    fs.writeFileSync(file, html(t));
    const out = path.join(OUT, t.name + '.png');
    execFile(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`,
      '--virtual-time-budget=20000', '--timeout=60000',
      `--screenshot=${out}`, 'file://' + file,
    ], { timeout: 45000, killSignal: 'SIGKILL' }, err => {
      // Chrome occasionally lingers after writing the screenshot; a kill on
      // timeout is fine as long as the file is there.
      if (err && !fs.existsSync(out)) return reject(err);
      // JPEG (macOS sips) keeps each image around 100-150 KB instead of 600+ KB
      // of PNG; the generator accepts either extension.
      try {
        const jpg = out.replace(/\.png$/, '.jpg');
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', out, '--out', jpg], { stdio: 'ignore' });
        fs.unlinkSync(out);
        resolve(jpg);
      } catch (e) {
        resolve(out);
      }
    });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let targets = g.ogTargets();
  if (only.length) targets = targets.filter(t => only.includes(t.name));
  const exists = n => ['.jpg', '.png'].some(ext => fs.existsSync(path.join(OUT, n + ext)));
  if (!force) targets = targets.filter(t => !exists(t.name));
  console.log(`${targets.length} og images to render`);
  // Sequential on purpose: a polite pace for the OpenStreetMap tile servers.
  for (const t of targets) {
    await render(t);
    console.log('  ' + t.name);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
