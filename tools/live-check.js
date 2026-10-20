// Browser check of "fresh on open" + "auto update every minute" + "no jumping while reading". Takes ~70 s. Uses fake publishers.
const { chromium } = require('playwright'); const { createApp } = require('../server'); const fx = require('../test/fixtures');
const item = (t, l, m) => `<item><title>${t}</title><link>${l}</link><pubDate>${new Date(Date.now() - m * 6e4).toUTCString()}</pubDate></item>`;
const wrap = a => `<rss><channel>${a.join('')}</channel></rss>`;
const base = Array.from({ length: 45 }, (_, i) => item(`Bitcoin rallies story number ${i}`, `https://live.test/${i}`, 10 + i));
const feed = { xml: wrap(base) };
const f = async u => String(u) === 'https://live.test/rss' ? { ok: true, status: 200, text: async () => feed.xml } : fx.fakeFetch(u);
(async () => {
  const app = createApp({ sources: [{ id: 'live', name: 'LivePub', url: 'https://live.test/rss', cats: ['crypto'], lang: 'en' }], fetch: f, cacheFile: null, quiet: true, directGapMs: 0, gnGapMs: 0, freshMs: 0 });
  await app.start(3200); const b = await chromium.launch(); const errs = [];
  const mk = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.addInitScript(() => localStorage.setItem('ui', '"en"')); return p; };
  const top = await mk(), reading = await mk();
  for (const p of [top, reading]) { await p.goto('http://localhost:3200/'); await p.waitForSelector('.card'); }
  await reading.evaluate(() => scrollTo(0, 1500)); await reading.waitForTimeout(300);
  const t0 = await top.$eval('.feat h3', e => e.innerText); const y0 = await reading.evaluate(() => scrollY);
  console.log('1) on open, newest story :', t0);
  feed.xml = wrap([item('Bitcoin BREAKING brand new story', 'https://live.test/new1', 0), ...base]);
  console.log('2) new story published on server; waiting for the 60 s poll ...'); await top.waitForTimeout(66000);
  const t1 = await top.$eval('.feat h3', e => e.innerText); const pill = await reading.$('.newpill'); const y1 = await reading.evaluate(() => scrollY);
  console.log('3) page at top now shows  :', t1, t1.includes('BREAKING') ? 'OK (auto-updated)' : 'FAIL');
  console.log('4) page being read        :', pill ? 'pill "' + (await pill.innerText()) + '"' : 'NO PILL', '| scroll kept', y0 === y1 ? 'OK' : 'FAIL (' + y0 + '->' + y1 + ')');
  await pill.click(); await reading.waitForTimeout(800); console.log('5) after tapping pill     :', await reading.$eval('.feat h3', e => e.innerText));
  const s = await b.newPage(); await s.goto('http://localhost:3200/status'); console.log('6) /status page           :', (await s.innerText('body')).split('\n').slice(0, 3).join(' | '));
  console.log('JS errors:', errs.length ? errs : 'none'); await b.close(); app.close(); process.exit(0);
})();
