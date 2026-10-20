const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { parseFeed, dedupe, clusterStories } = require('../parser');
const { classify, TOPICS } = require('../classify');
const { createApp, CATEGORIES } = require('../server');
const { parseGecko, parsePaprika, parseYahoo, detectMoves, extremes, STOCK_LIST } = require('../markets');
const SOURCES = require('../feeds'), I18N = require('../public/i18n');
const fx = require('./fixtures');
const pub = f => path.join(__dirname, '../public', f);

test('feed registry: unique ids, https, valid default categories, covers every required topic', () => {
  assert.equal(new Set(SOURCES.map(s => s.id)).size, SOURCES.length);
  SOURCES.forEach(s => { assert.match(s.url, /^https:\/\//); assert.ok(s.name); s.cats.forEach(c => assert.ok(c in TOPICS && CATEGORIES.includes(c), s.id + ' bad cat ' + c)); });
  ['crypto', 'stocks', 'psx', 'social', 'whatsapp', 'youtube', 'adsense', 'seo', 'amazon', 'dropship', 'ai'].forEach(c => assert.ok(SOURCES.some(s => s.cats.includes(c)), 'no source for ' + c));
});
test('parser: RSS (CDATA, entities, images, bad dates/links) and Atom (rel=alternate)', () => {
  const src = { id: 'x', name: 'P', lang: 'en', cats: ['crypto'] };
  const a = parseFeed(`<rss><channel><item><title><![CDATA[Fees &amp; rates &amp;#8217;s]]></title><link>https://e.com/a?x=1</link><description>&lt;p&gt;Hi &lt;img src="https://e.com/i.jpg"&gt;&lt;/p&gt;</description><pubDate>garbage</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>`, src);
  assert.equal(a.length, 1); assert.equal(a[0].title, 'Fees & rates ’s'); assert.equal(a[0].image, 'https://e.com/i.jpg'); assert.equal(a[0].publishedAt, null); assert.equal(a[0].summary, 'Hi');
  const b = parseFeed(`<feed><entry><title>T</title><link rel="self" href="https://e.com/self"/><link rel="alternate" href="https://e.com/real"/><updated>2026-01-02T03:04:05Z</updated></entry></feed>`, src);
  assert.equal(b[0].url, 'https://e.com/real'); assert.equal(b[0].publishedAt, '2026-01-02T03:04:05.000Z');
  const f = parseFeed(`<rss><channel><item><title>Future</title><link>https://e.com/f</link><pubDate>Wed, 01 Jan 2200 00:00:00 GMT</pubDate></item></channel></rss>`, src);
  assert.ok(Date.parse(f[0].publishedAt) <= Date.now());
});
test('dedupe merges by URL/title; clusterStories links same story across publishers (trending)', () => {
  const mk = (p, u, title) => ({ title, url: u, categories: ['crypto'], publisher: p, image: null });
  const d = dedupe([mk('A', 'https://a.com/1?x', 'Big story today'), mk('B', 'https://b.com/2', 'BIG story today!'), mk('A', 'https://a.com/1?y', 'Other')]);
  assert.equal(d.length, 1); assert.equal(d[0].sourceCount, 2);
  const c = clusterStories(dedupe([mk('A', 'https://a.com/1', 'Bitcoin surges past 120000 as spot ETF inflows jump'), mk('B', 'https://b.com/2', 'Bitcoin surges past 120000 as ETF inflows jump sharply')]));
  assert.equal(c[0].sourceCount, 2);
});
test('classify: politics/crime/gossip/sports dropped; topics + direction tagged; gate drops off-topic', () => {
  const c = (title, cats = [], gate = false) => classify({ title, summary: '', categories: cats, gate });
  assert.equal(c('Trump signs new crypto order'), null); assert.equal(c('Senate votes on stablecoin bill'), null); assert.equal(c('Celebrity divorce shocks Hollywood'), null);
  assert.equal(c('Man murdered in Karachi'), null); assert.equal(c('Cricket world cup final result'), null); assert.equal(c('Gardening tips for spring', [], true), null);
  const btc = c('Bitcoin surges past $120,000'); assert.ok(btc.categories.includes('crypto') && btc.categories.includes('moves')); assert.equal(btc.dir, 'up');
  const kse = c('KSE-100 plunges 1,200 points'); assert.ok(kse.categories.includes('psx')); assert.equal(kse.dir, 'down');
  assert.ok(c('YouTube Partner Program monetization update', [], true).categories.includes('youtube')); assert.ok(c('YouTube Partner Program monetization update', [], true).categories.includes('adsense'));
  assert.ok(c('WhatsApp launches usernames').categories.includes('whatsapp')); assert.ok(c('Amazon FBA fees rise').categories.includes('amazon')); assert.ok(c('Shopify dropshipping boom').categories.includes('dropship'));
  assert.equal(c('Bitcoin rises as ether falls').dir, undefined); // mixed direction => no arrow
});
test('i18n: ur/en same keys, RTL flag, all category labels exist', () => {
  assert.deepEqual(Object.keys(I18N.ur).sort(), Object.keys(I18N.en).sort()); assert.equal(I18N.ur.dir, 'rtl'); assert.equal(I18N.en.dir, 'ltr');
  CATEGORIES.forEach(c => assert.ok(I18N.ur[c] && I18N.en[c], 'label ' + c));
  assert.deepEqual(Object.keys(I18N.ur.fngL), Object.keys(I18N.en.fngL));
  const src = fs.readFileSync(pub('app.js'), 'utf8'); [...src.matchAll(/\bT\.(\w+)/g)].forEach(m => assert.ok(m[1] in I18N.ur, 'app.js uses missing i18n key T.' + m[1]));
});
test('static app: manifest, icons, service worker shell, index wiring, no politics category', () => {
  const m = JSON.parse(fs.readFileSync(pub('manifest.json'), 'utf8')); assert.equal(m.name, 'Bhaijan Digital'); assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some(i => i.purpose === 'maskable')); m.icons.forEach(i => assert.ok(fs.existsSync(pub(i.src.replace(/^\.?\//,''))), i.src));
  assert.equal(fs.readFileSync(pub('icon-512.png')).readUInt32BE(16), 512); assert.equal(fs.readFileSync(pub('icon-192.png')).readUInt32BE(16), 192);
  const sw = fs.readFileSync(pub('sw.js'), 'utf8'), shell = eval(sw.match(/SHELL = (\[.*?\])/)[1]); shell.filter(f => f !== './').forEach(f => assert.ok(fs.existsSync(pub(f)), f));
  const h = fs.readFileSync(pub('index.html'), 'utf8'); ['style.css', 'app.js', 'config.js', 'i18n.js'].forEach(s => assert.ok(h.includes(s))); assert.match(h, /lang="ur" dir="rtl"/); assert.ok(!/localhost|127\.0\.0\.1/.test(h));
  assert.ok(!CATEGORIES.includes('politics')); assert.ok(!/Mudassir/i.test(fs.readdirSync(pub('')).filter(f => /\.(js|html|css|json|svg)$/.test(f)).map(f => fs.readFileSync(pub(f), 'latin1')).join('')) , 'old brand name left in public/');
});
test('markets: CoinGecko/Paprika/Yahoo parsing, extremes and hourly-move detection', () => {
  const coins = parseGecko(fx.gecko()); assert.equal(coins[0].sym, 'BTC'); assert.equal(coins[0]._full.length, 168); assert.ok(coins[0].hi7.t > coins[0].lo7.t - 7 * 864e2 && coins[0].hi7.v >= coins[0].lo7.v); assert.ok(coins[0].pts.length <= 90);
  const pp = parsePaprika([{ symbol: 'btc', name: 'Bitcoin', rank: 1, quotes: { USD: { price: 100, percent_change_24h: -2, percent_change_7d: 3, market_cap: 5 } } }, { symbol: 'bad', name: 'x', quotes: { USD: {} } }]); assert.equal(pp.length, 1); assert.equal(pp[0].pct24, -2);
  const y = parseYahoo(fx.yahoo('^GSPC'), STOCK_LIST[0]); assert.equal(y.sym, 'GSPC'); assert.ok(y.prev && y.pct24 != null); assert.equal(parseYahoo({}, STOCK_LIST[0]), null);
  const pts = [[0, 100], [3600, 103], [7200, 101], [10800, 98], [100000, 50]]; assert.deepEqual(extremes(pts).hi, { t: 3600, v: 103 });
  const ev = detectMoves('X', 'X', 'crypto', pts); assert.deepEqual(ev.map(e => e.dir), ['down', 'down', 'up']); assert.ok(!ev.some(e => e.t === 100000), 'gaps >6h ignored');
});
test('END-TO-END: fake publishers + fake market APIs -> filtered news, moves, trending, markets, health, static, safety', async () => {
  const app = createApp({ sources: fx.SOURCES, fetch: fx.fakeFetch, cacheFile: null, quiet: true });
  await app.refresh(); await Promise.all([app.markets.refreshCrypto(), app.markets.refreshStocks(), app.markets.refreshFng()]);
  await new Promise(r => app.server.listen(0, r)); try { const b = 'http://localhost:' + app.server.address().port, J = async p => (await fetch(b + p)).json();
  const all = (await J('/api/news?category=all&limit=50')).articles, titles = all.map(a => a.title);
  assert.ok(!titles.some(t => /Trump|divorce|garden/i.test(t)), 'politics/gossip/off-topic must be filtered: ' + titles.join(' | '));
  assert.equal(all.filter(a => /Bitcoin surges past/.test(a.title)).length, 1, 'cross-publisher duplicate merged');
  assert.ok(titles.includes('KSE-100 plunges 1,200 points on profit taking'), 'atom feed with rel=self handled');
  assert.deepEqual(all.map(a => Date.parse(a.publishedAt)), all.map(a => Date.parse(a.publishedAt)).sort((x, y) => y - x), 'newest first');
  const cat = async c => (await J('/api/news?category=' + c)).articles.map(a => a.title);
  assert.ok((await cat('youtube')).some(t => /Partner Program/.test(t))); assert.ok((await cat('adsense')).some(t => /AdSense/.test(t)) && (await cat('adsense')).some(t => /Partner Program/.test(t)));
  assert.ok((await cat('whatsapp')).some(t => /WhatsApp/.test(t))); assert.ok((await cat('amazon')).some(t => /FBA/.test(t))); assert.ok((await cat('dropship')).some(t => /Shopify/.test(t)));
  assert.ok((await cat('psx')).some(t => /KSE-100/.test(t))); assert.ok((await cat('crypto')).some(t => /Solana/.test(t)));
  const mv = (await J('/api/news?category=moves')).articles; assert.ok(mv.length >= 4 && mv.every(a => a.dir)); assert.ok(mv.some(a => a.dir === 'up') && mv.some(a => a.dir === 'down'));
  assert.equal((await J('/api/news?category=trending')).articles.length, 1);
  assert.equal((await J('/api/news?q=nasdaq')).articles.length, 1);
  const page1 = await J('/api/news?limit=3'), page2 = await J('/api/news?limit=3&cursor=' + encodeURIComponent(page1.nextCursor)); assert.ok(!page2.articles.some(a => page1.articles.some(x => x.id === a.id)));
  const h = await J('/api/health'); assert.equal(h.ok, true); assert.equal(h.sources.bad.ok, false); assert.match(h.sources.bad.error, /503/); assert.equal(h.sources.html.ok, false); assert.equal(h.sources.c.ok, true); assert.ok(h.sources.g.kept < h.sources.g.fetched);
  const m = await J('/api/markets'); assert.equal(m.crypto.source, 'CoinGecko'); assert.equal(m.crypto.items.length, 5); assert.equal(m.fng.value, 67); assert.equal(m.global.btcDom, 54.3);
  assert.ok(m.stocks.items.some(s => s.sym === 'GSPC') && m.stocks.items.every(s => s.pct24 != null)); assert.ok(m.stocks.items.length >= 8); assert.ok(m.events.length > 0 && m.events[0].t >= m.events[m.events.length - 1].t);
  assert.ok(!JSON.stringify(m).includes('_full'), 'internal series not leaked');
  const tk = await J('/api/ticker'); assert.ok(tk.items.some(i => i.sym === 'BTC') && tk.items.some(i => i.sym === 'KSE'));
  assert.equal((await fetch(b + '/')).status, 200); assert.match(await (await fetch(b + '/')).text(), /Bhaijan Digital/); assert.equal((await fetch(b + '/app.js')).status, 200);
  assert.equal((await fetch(b + '/..%2fserver.js')).status, 404); assert.equal((await fetch(b + '/%2e%2e/package.json')).status, 404); assert.equal((await fetch(b + '/api/nope')).status, 404); assert.equal((await fetch(b + '/', { method: 'POST' })).status, 405);
  const gz = await fetch(b + '/api/news?limit=50', { headers: { 'accept-encoding': 'gzip' } }); assert.equal((await gz.json()).articles.length > 0, true);
  } finally { app.close(); }
});
test('resilience: all publishers down keeps previous articles; markets fallback to CoinPaprika; total market failure is reported, not thrown', async () => {
  let down = false; const f = async u => (down && !/coingecko|paprika|yahoo|alternative/.test(String(u))) ? { ok: false, status: 500, text: async () => '' } : fx.fakeFetch(u);
  const app = createApp({ sources: fx.SOURCES, fetch: f, cacheFile: null, quiet: true }); await app.refresh(); const n = app.state.articles.length; assert.ok(n > 5);
  down = true; await app.refresh(); assert.equal(app.state.articles.length, n, 'stories of failed sources are kept');
  const pf = async u => String(u).includes('coingecko.com/api/v3/coins') ? { ok: false, status: 429, json: async () => ({}) } : String(u).includes('paprika') ? { ok: true, status: 200, json: async () => [{ symbol: 'btc', name: 'Bitcoin', rank: 1, quotes: { USD: { price: 64000, percent_change_24h: 1.5, percent_change_7d: 2 } } }] } : { ok: false, status: 500, json: async () => ({}) };
  const a2 = createApp({ sources: [], fetch: pf, cacheFile: null, quiet: true }); await a2.markets.refreshCrypto(); await a2.markets.refreshStocks();
  assert.equal(a2.markets.snapshot().crypto.source, 'CoinPaprika'); assert.equal(a2.markets.snapshot().crypto.items[0].sym, 'BTC'); assert.match(a2.markets.snapshot().stocks.error, /failed/);
});

test('static build: produces site with data files (offline fixtures)', () => {
  const { execFileSync } = require('child_process'), os = require('os');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-'));
  execFileSync('node', [path.join(__dirname, '..', 'tools', 'build-static.js')], { env: { ...process.env, BUILD_FAKE: '1', OUT: out } });
  ['index.html', 'data/news.json', 'data/markets.json', 'sw.js', 'config.js'].forEach(f => assert.ok(fs.existsSync(path.join(out, f)), f));
  assert.match(fs.readFileSync(path.join(out, 'config.js'), 'utf8'), /STATIC:\s*true/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, 'data/news.json'), 'utf8')).articles.length > 0);
});
