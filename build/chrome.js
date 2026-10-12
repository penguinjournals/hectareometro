#!/usr/bin/env node
// Prints the shared chrome (header, footer, lenses, share box, head assets)
// for a hand-maintained page, so the 18 hand pages carry exactly the markup
// the generated pages get. Usage:
//   node build/chrome.js <lang> <section> <langSwitchHref> [noiframe]
// sections: hectareas distancias litros kilos dinero medir medir-dist conv-area conv-dist
const g = require('./generate.js');
const [lang, section, switchHref, noiframe] = process.argv.slice(2);
if (!lang || !section || !switchHref) {
  console.error('usage: node build/chrome.js <lang> <section> <langSwitchHref> [noiframe]');
  process.exit(1);
}
const other = lang === 'es' ? 'en' : 'es';
const langSwitch = `<a href="${switchHref}" hreflang="${other}">${g.UI[lang].switchLabel}</a>`;
process.stdout.write(JSON.stringify(g.chromeFor(lang, section, langSwitch, noiframe !== 'noiframe')));
