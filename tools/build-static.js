// Builds the complete static website into ./dist (or $OUT): app files + fresh data/news.json + data/markets.json + status page.
// Run by the GitHub Actions workflow every few minutes:  node tools/build-static.js
// Safety: if this run collects (almost) nothing, the previous published data is reused, and if even that is unavailable the build FAILS
// so the old working site is never replaced by an empty one.
const fs = require('fs'), path = require('path');
const { createApp } = require('../server');
const ROOT = path.join(__dirname, '..'), OUT = path.resolve(process.env.OUT || path.join(ROOT, 'dist'));
const FAKE = process.env.BUILD_FAKE === '1';            // offline fixtures, used by the tests
const PREV = (process.env.PREV_SITE || '').replace(/\/$/, ''); // e.g. https://user.github.io/bhaijan-digital (current live site)
const MIN_ARTICLES = +process.env.MIN_ARTICLES || 15;

async function prev(file) {
  if (!PREV) return null;
  try { const r = await fetch(`${PREV}/data/${file}`, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.json() : null; } catch { return null; }
}
const slim = a => ({ id: a.id, title: a.title, url: a.url, summary: a.summary || '', image: a.image || null, publisher: a.publisher, publishers: a.publishers, sourceCount: a.sourceCount || 1,
  lang: a.lang, categories: a.categories, dir: a.dir, publishedAt: a.publishedAt });

(async () => {
  const fx = FAKE ? require('../test/fixtures') : null;
  const app = createApp({ sources: FAKE ? fx.SOURCES : undefined, fetch: FAKE ? fx.fakeFetch : undefined, cacheFile: null, quiet: true, directGapMs: 0, gnGapMs: 0, timeoutMs: 15000, noMarkets: true });
  console.log('Collecting news ...'); await app.refresh();
  console.log('Collecting markets ...'); await Promise.allSettled([app.markets.refreshCrypto(), app.markets.refreshStocks(), app.markets.refreshFng()]);

  const srcs = Object.values(app.state.sources), okN = srcs.filter(s => s.ok).length;
  console.log(`Sources OK: ${okN}/${srcs.length}; articles: ${app.state.articles.length}`);
  let news = { lastRefresh: app.state.lastRun, articles: app.state.articles.slice(0, 1500).map(slim) };
  if (news.articles.length < MIN_ARTICLES) {
    const old = await prev('news.json');
    if (old && old.articles && old.articles.length > news.articles.length) { console.warn(`!! Only ${news.articles.length} articles collected; keeping previous ${old.articles.length} (stale).`); news = old; }
    else if (news.articles.length === 0) { console.error('!! No articles and no previous data: refusing to publish an empty site.'); process.exit(1); }
  }
  let mk = app.markets.snapshot();
  if (!mk.crypto.items.length || !mk.stocks.items.length) {
    const old = await prev('markets.json');
    if (old) { if (!mk.crypto.items.length && old.crypto) { mk.crypto = old.crypto; mk.global = old.global; } if (!mk.stocks.items.length && old.stocks) mk.stocks = old.stocks; if (!mk.fng && old.fng) mk.fng = old.fng; mk.events = mk.events.length ? mk.events : (old.events || []); console.warn('!! Some market blocks reused from previous build (stale).'); }
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'status'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'config.js'), "window.BD_CONFIG = { API_BASE: '', STATIC: true, DATA_BASE: 'data/' };\n");
  fs.writeFileSync(path.join(OUT, 'data', 'news.json'), JSON.stringify(news));
  fs.writeFileSync(path.join(OUT, 'data', 'markets.json'), JSON.stringify(mk));
  const status = app.statusPage().replace('<script>setTimeout(()=>location.reload(),60000)</script>', '');
  fs.writeFileSync(path.join(OUT, 'status.html'), status); fs.writeFileSync(path.join(OUT, 'status', 'index.html'), status);
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  const kb = f => Math.round(fs.statSync(path.join(OUT, 'data', f)).size / 1024) + ' KB';
  console.log(`Built ${OUT}: news.json ${kb('news.json')} (${news.articles.length} stories), markets.json ${kb('markets.json')} (${mk.crypto.items.length} coins, ${mk.stocks.items.length} stocks/fx)`);
  process.exit(0);
})().catch(e => { console.error('BUILD FAILED', e); process.exit(1); });
