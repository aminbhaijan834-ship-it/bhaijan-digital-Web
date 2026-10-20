const { chromium } = require('playwright'); const out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', locale: 'ur-PK' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text()));
  await p.goto('http://localhost:3100/'); await p.waitForSelector('.card', { timeout: 15000 }); await p.waitForTimeout(1800);
  await p.screenshot({ path: out + '/1-home-ur.png' });
  await p.click('[data-a="cat"][data-v="moves"]'); await p.waitForTimeout(900); await p.screenshot({ path: out + '/2-moves.png' });
  await p.click('nav.bot [data-v="markets"]'); await p.waitForSelector('.mrow', { timeout: 10000 }); await p.waitForTimeout(500); await p.screenshot({ path: out + '/3-markets.png' });
  await p.click('.mrow >> nth=0'); await p.waitForTimeout(600); await p.screenshot({ path: out + '/4-sheet.png' });
  await p.click('[data-a="closeSheet"]'); await p.click('[data-a="seg"][data-v="stocks"]'); await p.waitForTimeout(300); await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(300); await p.screenshot({ path: out + '/5-stocks-timeline.png' });
  await p.click('nav.bot [data-v="settings"]'); await p.click('[data-a="ui"][data-v="en"]'); await p.waitForTimeout(500); await p.screenshot({ path: out + '/6-settings-en.png' });
  await p.click('nav.bot [data-v="home"]'); await p.waitForSelector('.card'); await p.waitForTimeout(500);
  const light = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' }); const q = await light.newPage(); await q.goto('http://localhost:3100/?tab=markets'); await q.waitForSelector('.mrow'); await q.waitForTimeout(600); await q.screenshot({ path: out + '/7-light-markets.png' });
  console.log('JS errors:', errs.length ? errs : 'none'); await b.close();
})();
