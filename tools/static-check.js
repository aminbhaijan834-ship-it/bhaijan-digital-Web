// Opens the BUILT static site (served from a sub-folder, like GitHub Pages) in a real browser and checks the main flows.
const { chromium } = require('playwright'); const base = process.argv[2], shots = process.argv[3];
(async () => {
  const b = await chromium.launch(); const errs = [], bad = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  // pretend CoinGecko is reachable and CORS-enabled, with a price different from the build-time one
  await ctx.route('https://api.coingecko.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify([{ symbol: 'btc', current_price: 99999, price_change_percentage_24h: 3.21, price_change_percentage_1h_in_currency: 0.5, price_change_percentage_7d_in_currency: 8.8, high_24h: 100500, low_24h: 97000, market_cap: 2e12 }]) }));
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
  await p.goto(base); await p.waitForSelector('.card', { timeout: 15000 }); await p.waitForTimeout(1500);
  const n = await p.$$eval('.card', e => e.length), first = await p.$eval('.feat h3', e => e.innerText);
  console.log('1) home cards:', n, '| top story:', first);
  const tk = await p.$$eval('#ticker .tk', e => e.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log('2) ticker:', tk.slice(0, 3).join(' | '), tk.some(x => x.includes('99,999')) ? '=> live BTC overlay OK' : '=> NO LIVE OVERLAY');
  await p.click('[data-a="cat"][data-v="youtube"]'); await p.waitForTimeout(500); console.log('3) YouTube chip ->', await p.$$eval('.card h3', e => e.map(x => x.innerText)));
  await p.click('nav.bot [data-v="markets"]'); await p.waitForSelector('.mrow'); await p.waitForTimeout(400);
  console.log('4) markets rows:', await p.$$eval('.mrow', e => e.length), '| first:', await p.$eval('.mrow', e => e.innerText.replace(/\s+/g, ' ')));
  await p.click('.mrow >> nth=0'); await p.waitForTimeout(500); await p.screenshot({ path: shots + '/s-sheet.png' }); await p.click('[data-a="closeSheet"]');
  await p.click('nav.bot [data-v="explore"]'); await p.fill('input[name=q]', 'nasdaq'); await p.press('input[name=q]', 'Enter'); await p.waitForSelector('.card'); console.log('5) search "nasdaq" ->', await p.$$eval('.card h3', e => e.map(x => x.innerText)));
  await p.click('nav.bot [data-v="settings"]'); console.log('6) translate toggle hidden in static mode:', (await p.$$('[data-a="tr"]')).length === 0);
  await p.goto(base + 'status/'); console.log('7) status page:', (await p.innerText('body')).split('\n').filter(Boolean).slice(0, 2).join(' | '));
  await p.goto(base); await p.waitForSelector('.card'); await p.waitForTimeout(1200); const sw = await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
  console.log('8) service worker scope:', sw);
  await p.screenshot({ path: shots + '/s-mobile.png' });
  const tv = await b.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' }); const t = await tv.newPage(); await t.goto(base); await t.waitForSelector('.card'); await t.waitForTimeout(1500); await t.screenshot({ path: shots + '/s-tv.png' });
  const lap = await b.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: 'light' }); const l = await lap.newPage(); await l.goto(base + '?tab=markets'); await l.waitForSelector('.mrow'); await l.waitForTimeout(800); await l.screenshot({ path: shots + '/s-laptop-light.png' });
  console.log('HTTP>=400:', bad.length ? bad : 'none', '| JS errors:', errs.length ? errs : 'none'); await b.close();
})();
