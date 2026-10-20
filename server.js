const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const { parseFeed, dedupe, clusterStories } = require('./parser');
const { classify } = require('./classify');
const { translateArticles } = require('./translator');
const { createMarkets } = require('./markets');

const CATEGORIES = ['all', 'moves', 'crypto', 'stocks', 'psx', 'social', 'whatsapp', 'youtube', 'adsense', 'seo', 'amazon', 'dropship', 'ai', 'trending'];
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const UA = 'Mozilla/5.0 (compatible; BhaijanDigital/1.0; RSS reader)';

function createApp(opts = {}) {
  const sources = opts.sources || require('./feeds');
  const f = opts.fetch || fetch;
  const refreshMs = opts.refreshMs || (+process.env.REFRESH_SECONDS * 1000) || 60000;
  const cacheFile = opts.cacheFile === undefined ? path.join(os.tmpdir(), 'bhaijan-digital-cache.json') : opts.cacheFile;
  const state = { articles: [], sources: {}, lastRun: null, lastRunMs: 0 };
  const markets = createMarkets(opts.marketsFetch || f);
  const items = new Map(); // sourceId -> last good items (kept when a source fails or answers 304)
  // Direct publisher feeds are polled politely (default every 5 min); Google News topic searches every minute.
  const gap = s => s.gnews ? (opts.gnGapMs ?? 55000) : (opts.directGapMs ?? 5 * 60000);
  try { if (cacheFile) { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (c.articles && c.articles.length) { items.set('__disk', c.articles); state.articles = c.articles; state.lastRun = c.lastRun || null; } } } catch {}

  async function fetchSource(s) {
    const prev = state.sources[s.id] || {};
    const st = state.sources[s.id] = { name: s.name, url: s.url, ok: false, fetched: 0, kept: 0, error: null, at: null, fails: prev.fails || 0, lastTry: Date.now(), etag: prev.etag, lastMod: prev.lastMod };
    try {
      const h = { 'User-Agent': UA, Accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.5' };
      if (prev.etag && items.has(s.id)) h['If-None-Match'] = prev.etag; if (prev.lastMod && items.has(s.id)) h['If-Modified-Since'] = prev.lastMod;
      const r = await f(s.url, { signal: AbortSignal.timeout(opts.timeoutMs || 9000), headers: h, redirect: 'follow' });
      if (r.status === 304 && items.has(s.id)) { Object.assign(st, { ok: true, at: new Date().toISOString(), fails: 0, notModified: true, fetched: prev.fetched, kept: prev.kept }); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const raw = parseFeed(await r.text(), s);
      if (!raw.length) throw new Error('no items parsed (not a feed?)');
      const list = raw.map(classify).filter(Boolean);
      items.set(s.id, list);
      Object.assign(st, { ok: true, fetched: raw.length, kept: list.length, at: new Date().toISOString(), fails: 0, etag: r.headers && r.headers.get && r.headers.get('etag') || undefined, lastMod: r.headers && r.headers.get && r.headers.get('last-modified') || undefined });
    } catch (e) { st.error = String(e.message || e); st.at = new Date().toISOString(); st.fails++; } // one bad source never breaks the run
  }
  async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; await fn(list[k]); } })); }

  let inflight = null;
  // Single-flight: concurrent callers share one run. Only sources that are due (see gap) are fetched; the rest reuse their last good items.
  function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      const now = Date.now(), due = sources.filter(s => { const st = state.sources[s.id]; return !st || now - st.lastTry >= gap(s); });
      await pool(due, 16, fetchSource);
      if (due.some(s => state.sources[s.id].ok) && items.has('__disk')) items.delete('__disk'); // fresh data replaces the boot-time disk cache
      const cutoff = Date.now() - 7 * 864e5, all = [];
      for (const [id, list] of items) all.push(...list.filter(a => !a.publishedAt || Date.parse(a.publishedAt) > cutoff).map(a => ({ ...a, categories: [...a.categories], publishers: undefined, sourceCount: undefined })));
      // direct publishers first so that, for the same story, their link/image win over the Google News copy
      all.sort((x, y) => (x.gnews ? 1 : 0) - (y.gnews ? 1 : 0));
      const merged = dedupe(all).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 2000);
      if (merged.length || !state.articles.length) state.articles = clusterStories(merged);
      state.lastRun = new Date().toISOString(); state.lastRunMs = Date.now();
      try { if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify({ articles: state.articles, lastRun: state.lastRun })); } catch {}
      if (!opts.quiet) console.log(`[refresh] ${state.articles.length} articles; fetched ${due.length} sources, ${sources.filter(s => state.sources[s.id] && state.sources[s.id].ok).length}/${sources.length} ok`);
    })().finally(() => { inflight = null; });
    return inflight;
  }
  // Used by the app on open / pull-to-refresh: make sure data is at most ~45 s old before answering (never waits more than 9 s).
  async function ensureFresh() {
    if (Date.now() - state.lastRunMs < (opts.freshMs ?? 45000)) return;
    await Promise.race([refresh().catch(() => {}), new Promise(r => setTimeout(r, opts.freshWaitMs ?? 9000).unref())]);
  }

  const byCategory = () => { const c = {}; CATEGORIES.forEach(k => { c[k] = 0; }); for (const a of state.articles) { for (const k of a.categories) if (k in c) c[k]++; if (a.sourceCount >= 2) c.trending++; } c.all = state.articles.length; return c; };
  const escH = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function statusPage() {
    const src = Object.entries(state.sources).sort((a, b) => (a[1].ok - b[1].ok) || a[0].localeCompare(b[0])), okN = src.filter(([, v]) => v.ok).length, cat = byCategory(), m = markets.state;
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Status - Bhaijan Digital</title>
<style>body{font:14px/1.5 system-ui,sans-serif;background:#070B1A;color:#E8EEFF;margin:0;padding:16px;max-width:900px;margin:auto}h1{font-size:20px}h2{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%}td,th{padding:5px 8px;border-bottom:1px solid #1C2850;text-align:left;vertical-align:top;word-break:break-word}.ok{color:#19D38A}.bad{color:#FF5C70}.chip{display:inline-block;background:#121C3C;border-radius:99px;padding:2px 12px;margin:3px}small{color:#8A9AC0}</style>
<h1>Bhaijan Digital — Status</h1><p>Articles: <b>${state.articles.length}</b> · Sources OK: <b class="${okN === src.length ? 'ok' : ''}">${okN}/${src.length}</b> · Last refresh: ${escH(state.lastRun || 'not yet')} <small>(opens fresh every minute; page auto-reloads)</small></p>
<h2>Stories per category</h2><p>${CATEGORIES.map(k => `<span class="chip">${k}: <b>${cat[k]}</b></span>`).join('')}</p>
<h2>Markets</h2><p>Crypto: <b class="${m.crypto.items.length ? 'ok' : 'bad'}">${m.crypto.items.length} coins</b> (${escH(m.crypto.source || m.crypto.error || '-')}) · Stocks/FX: <b class="${m.stocks.items.length ? 'ok' : 'bad'}">${m.stocks.items.length}</b>${m.stocks.failed && m.stocks.failed.length ? ' · failed: ' + escH(m.stocks.failed.join(', ')) : ''} · Fear&amp;Greed: ${m.fng ? m.fng.value : '-'}</p>
<h2>Sources (failing first)</h2><table><tr><th>Source</th><th>Status</th><th>Items (kept/fetched)</th></tr>${src.map(([id, v]) => `<tr><td>${escH(id)}<br><small>${escH(v.name)}</small></td><td class="${v.ok ? 'ok' : 'bad'}">${v.ok ? 'OK' : escH(v.error || 'error')}</td><td>${v.kept ?? 0}/${v.fetched ?? 0}</td></tr>`).join('')}</table>
<script>setTimeout(()=>location.reload(),60000)</script>`;
  }

  function query(u) {
    const cat = u.searchParams.get('category'), q = (u.searchParams.get('q') || '').toLowerCase().trim().slice(0, 100);
    const lang = u.searchParams.get('lang'), pub = u.searchParams.get('publisher');
    const limit = Math.min(Math.max(+u.searchParams.get('limit') || 20, 1), 50);
    let list = state.articles;
    if (cat === 'trending') list = list.filter(a => a.sourceCount >= 2); // same story covered by 2+ publishers (derived, not invented)
    else if (cat && cat !== 'all' && cat !== 'top') list = list.filter(a => a.categories.includes(cat));
    if (lang) list = list.filter(a => a.lang === lang);
    if (pub) list = list.filter(a => a.publisher === pub);
    if (q) list = list.filter(a => (a.title + ' ' + a.summary).toLowerCase().includes(q));
    const cur = u.searchParams.get('cursor'); // "<publishedAt>|<id>" of the last item seen
    if (cur) { const i = list.findIndex(a => (a.publishedAt || '') + '|' + a.id === cur); list = i >= 0 ? list.slice(i + 1) : []; }
    const page = list.slice(0, limit), last = page[page.length - 1];
    return { articles: page, nextCursor: list.length > limit && last ? (last.publishedAt || '') + '|' + last.id : null, lastRefresh: state.lastRun, warming: !state.articles.length };
  }

  const hits = new Map(); // tiny per-IP rate limit for /api
  const limited = ip => { const now = Date.now(), h = hits.get(ip); if (!h || h[1] < now) { hits.set(ip, [1, now + 60000]); if (hits.size > 5000) hits.clear(); return false; } return ++h[0] > 240; };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json', extra = {}) => {
      const isJson = type === 'application/json';
      let buf = Buffer.from(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
      const h = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Content-Type': type + (/^(image\/(?!svg)|font)/.test(type) ? '' : '; charset=utf-8'), 'Cache-Control': isJson ? 'public, max-age=30' : 'no-cache', ...extra };
      if (/gzip/.test(req.headers['accept-encoding'] || '') && buf.length > 1024 && /json|text|javascript|svg/.test(type)) { buf = zlib.gzipSync(buf); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
      res.writeHead(code, h); res.end(buf);
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'method not allowed' });
    if (u.pathname.startsWith('/api/')) {
      if (limited((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim())) return send(429, { error: 'too many requests' });
      if (u.pathname === '/api/categories') return send(200, { categories: CATEGORIES });
      if (u.pathname === '/api/news') {
        const fresh = u.searchParams.get('fresh') === '1' && !u.searchParams.get('cursor');
        return (fresh ? ensureFresh() : Promise.resolve()).then(() => {
          const r = query(u), noStore = { 'Cache-Control': 'no-store' }; if (u.searchParams.get('translate') !== 'ur') return send(200, r, 'application/json', noStore);
          return translateArticles(r.articles).then(a => send(200, { ...r, articles: a, translation: 'machine (MyMemory)' }, 'application/json', noStore)).catch(() => send(200, r, 'application/json', noStore));
        });
      }
      if (u.pathname === '/api/markets') return send(200, markets.snapshot(), 'application/json', { 'Cache-Control': 'public, max-age=20' });
      if (u.pathname === '/api/ticker') return send(200, { items: markets.ticker(), at: markets.state.crypto.at || markets.state.stocks.at }, 'application/json', { 'Cache-Control': 'public, max-age=20' });
      if (u.pathname === '/api/health') return send(200, { ok: state.articles.length > 0, articles: state.articles.length, lastRefresh: state.lastRun, byCategory: byCategory(), sources: state.sources, markets: { crypto: { n: markets.state.crypto.items.length, source: markets.state.crypto.source, error: markets.state.crypto.error }, stocks: { n: markets.state.stocks.items.length, error: markets.state.stocks.error, failed: markets.state.stocks.failed }, fearGreed: !!markets.state.fng } }, 'application/json', { 'Cache-Control': 'no-store' });
      return send(404, { error: 'not found' });
    }
    if (u.pathname === '/status') return send(200, statusPage(), 'text/html', { 'Cache-Control': 'no-store' });
    let rel; try { rel = decodeURIComponent(u.pathname); } catch { return send(400, { error: 'bad request' }); }
    const file = path.resolve(PUB, '.' + path.sep + (rel === '/' ? 'index.html' : rel));
    if (file !== PUB && !file.startsWith(PUB + path.sep)) return send(404, { error: 'not found' });
    fs.readFile(file, (e, d) => {
      if (e) return send(404, { error: 'not found' });
      const ext = path.extname(file), isImg = ['.png', '.ico'].includes(ext);
      send(200, d, MIME[ext] || 'application/octet-stream', isImg ? { 'Cache-Control': 'public, max-age=86400' } : {});
    });
  });

  let timer = null;
  const start = (port) => new Promise(r => {
    refresh().catch(e => console.error('[refresh] failed', e)); timer = setInterval(() => refresh().catch(() => {}), refreshMs); timer.unref();
    if (!opts.noMarkets) markets.start(60000, 90000, 1800000);
    server.listen(port, () => { if (!opts.quiet) console.log('Bhaijan Digital on http://localhost:' + port); r(); });
  });
  return { server, state, refresh, query, markets, start, statusPage, byCategory, close: () => { clearInterval(timer); server.close(); } };
}

if (require.main === module) createApp().start(+process.env.PORT || 3000);
module.exports = { createApp, CATEGORIES };
