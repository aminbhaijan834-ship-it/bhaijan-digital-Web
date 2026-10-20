const test = require('node:test'), assert = require('node:assert');
const { parseFeed } = require('../parser'); const { createApp } = require('../server'); const fx = require('./fixtures');
const rssItem = (title, link, minsAgo, extra = '') => `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(Date.now() - minsAgo * 6e4).toUTCString()}</pubDate>${extra}</item>`;
const wrap = items => `<rss><channel>${items.join('')}</channel></rss>`;

test('Google News items: real publisher from <source>, " - Publisher" suffix removed, no junk summary/image', () => {
  const src = { id: 'gn', name: 'Google News', gnews: true, cats: ['youtube'], lang: 'en' };
  const a = parseFeed(wrap([rssItem('YouTube lowers Partner Program limits - TechCrunch', 'https://news.google.com/rss/articles/abc?oc=5', 3, '<description>&lt;a href="x"&gt;YouTube lowers&lt;/a&gt; TechCrunch</description><source url="https://techcrunch.com">TechCrunch</source>')]), src);
  assert.equal(a.length, 1); assert.equal(a[0].title, 'YouTube lowers Partner Program limits'); assert.equal(a[0].publisher, 'TechCrunch'); assert.equal(a[0].summary, ''); assert.equal(a[0].image, null);
});

test('live updates: new story shows up on the next poll; fresh=1 forces a refresh; /status and /api/health explain every category', async () => {
  const items = Array.from({ length: 30 }, (_, i) => rssItem(`Bitcoin rallies story number ${i}`, `https://live.test/${i}`, 10 + i));
  const feed = { xml: wrap(items) }; let hits = 0;
  const f = async url => String(url) === 'https://live.test/rss' ? (hits++, { ok: true, status: 200, text: async () => feed.xml }) : fx.fakeFetch(url);
  const src = [{ id: 'live', name: 'LivePub', url: 'https://live.test/rss', cats: ['crypto'], lang: 'en' }];
  const app = createApp({ sources: src, fetch: f, cacheFile: null, quiet: true, directGapMs: 0, gnGapMs: 0, freshMs: 0 });
  await new Promise(r => app.server.listen(0, r)); const b = 'http://localhost:' + app.server.address().port, J = async p => (await fetch(b + p)).json();
  try {
    const cold = await J('/api/news'); assert.equal(cold.warming, true); assert.equal(cold.articles.length, 0); // before the first refresh finished: server says "warming up"
    const first = await J('/api/news?fresh=1&limit=5'); assert.equal(first.warming, false); assert.equal(first.articles.length, 5); assert.ok(hits >= 1, 'fresh=1 triggered the first refresh');
    feed.xml = wrap([rssItem('Bitcoin breaking: brand new story just published', 'https://live.test/new', 0), ...items]);
    const before = hits, again = await J('/api/news?fresh=1&limit=5');
    assert.ok(hits > before, 'fresh=1 re-polled the source'); assert.equal(again.articles[0].title, 'Bitcoin breaking: brand new story just published');
    const cursorPage = await J('/api/news?limit=5&cursor=' + encodeURIComponent(again.nextCursor)); assert.equal(cursorPage.articles.length, 5);
    const h = await J('/api/health'); assert.equal(h.byCategory.crypto >= 31, true); assert.equal(h.byCategory.youtube, 0);
    const page = await (await fetch(b + '/status')).text(); assert.match(page, /Stories per category/); assert.match(page, /LivePub/); assert.match(page, /crypto: <b>3\d<\/b>/);
  } finally { app.close(); }
});

test('polite polling: sources are not re-fetched before their gap, and a 304 keeps the old stories', async () => {
  let hits = 0, mode = 200;
  const f = async (url, o) => { if (String(url) !== 'https://p.test/rss') return fx.fakeFetch(url); hits++;
    if (mode === 304) { assert.equal(o.headers['If-None-Match'], '"v1"'); return { ok: false, status: 304, headers: { get: () => null }, text: async () => '' }; }
    return { ok: true, status: 200, headers: { get: n => (n.toLowerCase() === 'etag' ? '"v1"' : null) }, text: async () => wrap([rssItem('Ethereum surges to a new high', 'https://p.test/1', 5)]) }; };
  const app = createApp({ sources: [{ id: 'p', name: 'P', url: 'https://p.test/rss', cats: ['crypto'], lang: 'en' }], fetch: f, cacheFile: null, quiet: true, directGapMs: 60000 });
  await app.refresh(); await app.refresh(); assert.equal(hits, 1, 'second refresh inside the gap does not hit the publisher');
  app.state.sources.p.lastTry -= 120000; mode = 304; await app.refresh(); assert.equal(hits, 2); assert.equal(app.state.sources.p.ok, true); assert.equal(app.state.articles.length, 1, '304 keeps previous stories');
});
