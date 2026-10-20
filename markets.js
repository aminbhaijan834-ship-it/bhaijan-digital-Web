// Live market data. All numbers come from public APIs (CoinGecko, CoinPaprika, Yahoo Finance chart, alternative.me); nothing is invented.
// Every refresh is independent: a failing provider only marks its own block as stale and never breaks news or other blocks.
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BhaijanDigital/1.0)', Accept: 'application/json' };

const STOCK_LIST = [
  ['^GSPC', 'S&P 500', 'index'], ['^IXIC', 'NASDAQ', 'index'], ['^DJI', 'Dow Jones', 'index'], ['^KSE', 'KSE-100 (PSX)', 'index'],
  ['GC=F', 'Gold', 'commodity'], ['SI=F', 'Silver', 'commodity'], ['CL=F', 'Crude Oil (WTI)', 'commodity'], ['USDPKR=X', 'USD / PKR', 'fx'],
  ['AMZN', 'Amazon', 'stock'], ['META', 'Meta (Facebook)', 'stock'], ['GOOGL', 'Google (Alphabet)', 'stock'], ['NVDA', 'NVIDIA', 'stock'],
  ['AAPL', 'Apple', 'stock'], ['MSFT', 'Microsoft', 'stock'], ['TSLA', 'Tesla', 'stock'], ['SHOP', 'Shopify', 'stock'], ['COIN', 'Coinbase', 'stock'],
];
const MOVE_THRESHOLD = { crypto: 1.5, index: 0.6, commodity: 0.8, fx: 0.4, stock: 1.2 }; // % change between consecutive hourly points

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
const round = (v, d = 4) => (v == null ? null : +v.toFixed(d));

// pts: [[unixSeconds, value], ...] ascending. Returns where the series peaked and bottomed.
function extremes(pts) {
  if (!pts.length) return { hi: null, lo: null };
  let hi = pts[0], lo = pts[0];
  for (const p of pts) { if (p[1] > hi[1]) hi = p; if (p[1] < lo[1]) lo = p; }
  return { hi: { t: hi[0], v: hi[1] }, lo: { t: lo[0], v: lo[1] } };
}
// Big hourly swings => timeline entries ("BTC jumped +3.2% at 14:00"). Newest first.
function detectMoves(sym, name, kind, pts, perAsset = 4) {
  const thr = MOVE_THRESHOLD[kind] || 1, out = [];
  for (let i = 1; i < pts.length; i++) {
    const [t0, v0] = pts[i - 1], [t, v] = pts[i];
    if (!v0 || t - t0 > 6 * 3600) continue; // ignore gaps (weekends / market closed)
    const pct = (v - v0) / v0 * 100;
    if (Math.abs(pct) >= thr) out.push({ sym, name, kind, t, pct: round(pct, 2), dir: pct > 0 ? 'up' : 'down', price: +v.toPrecision(7) });
  }
  return out.sort((a, b) => b.t - a.t).slice(0, perAsset);
}
function sample(pts, max = 90) {
  if (pts.length <= max) return pts.map(p => [p[0], round(p[1], 6)]);
  const step = (pts.length - 1) / (max - 1), out = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out.map(p => [p[0], round(p[1], 6)]);
}

// ---- CoinGecko ----
function parseGecko(list) {
  return list.map(c => {
    const end = Math.floor(Date.parse(c.last_updated) / 1000) || Math.floor(Date.now() / 1000);
    const prices = (c.sparkline_in_7d && c.sparkline_in_7d.price || []).filter(num);
    const pts = prices.map((v, i) => [end - (prices.length - 1 - i) * 3600, v]);
    const ex = extremes(pts);
    return { sym: String(c.symbol).toUpperCase(), name: c.name, kind: 'crypto', price: c.current_price, pct24: round(num(c.price_change_percentage_24h_in_currency) ?? num(c.price_change_percentage_24h), 2),
      pct1h: round(num(c.price_change_percentage_1h_in_currency), 2), pct7d: round(num(c.price_change_percentage_7d_in_currency), 2), hi24: c.high_24h, lo24: c.low_24h, cap: c.market_cap, rank: c.market_cap_rank,
      ath: c.ath, athPct: round(num(c.ath_change_percentage), 1), hi7: ex.hi, lo7: ex.lo, pts: sample(pts), _full: pts, updated: c.last_updated };
  }).filter(c => num(c.price) != null);
}
function parsePaprika(list) {
  return list.map(c => { const q = c.quotes && c.quotes.USD || {};
    return { sym: String(c.symbol).toUpperCase(), name: c.name, kind: 'crypto', price: q.price, pct24: round(num(q.percent_change_24h), 2), pct1h: round(num(q.percent_change_1h), 2), pct7d: round(num(q.percent_change_7d), 2),
      cap: q.market_cap, rank: c.rank, ath: q.ath_price, athPct: round(num(q.percent_from_price_ath), 1), hi7: null, lo7: null, pts: [], _full: [], updated: c.last_updated }; }).filter(c => num(c.price) != null);
}
// ---- Yahoo Finance chart ----
function parseYahoo(j, [sym, name, kind]) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.meta) return null;
  const ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const pts = []; ts.forEach((t, i) => { if (num(cl[i]) != null) pts.push([t, cl[i]]); });
  const price = num(r.meta.regularMarketPrice) ?? (pts.length ? pts[pts.length - 1][1] : null); if (price == null) return null;
  // previous close = last point of the previous exchange-local day (chartPreviousClose is the close BEFORE the whole 5-day window, so it is not used for daily change).
  const off = r.meta.gmtoffset || 0, day = t => Math.floor((t + off) / 86400);
  let prev = null; if (pts.length) { const lastDay = day(pts[pts.length - 1][0]); for (let i = pts.length - 1; i >= 0; i--) if (day(pts[i][0]) < lastDay) { prev = pts[i][1]; break; } }
  prev = prev ?? num(r.meta.previousClose) ?? num(r.meta.chartPreviousClose);
  const ex = extremes(pts);
  return { sym: sym.replace(/=X$|=F$/, '').replace('^', ''), ysym: sym, name, kind, price: round(price, price > 100 ? 2 : 4), prev: round(prev, 4), pct24: prev ? round((price - prev) / prev * 100, 2) : null,
    hi7: ex.hi, lo7: ex.lo, pts: sample(pts), _full: pts, currency: r.meta.currency || 'USD', updated: new Date((r.meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString() };
}

function createMarkets(f = fetch) {
  const state = { crypto: { items: [], at: null, source: null, error: 'loading' }, stocks: { items: [], at: null, error: 'loading', failed: [] }, fng: null, global: null, events: [] };
  const get = async (url, ms = 9000) => { const r = await f(url, { signal: AbortSignal.timeout(ms), headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

  async function refreshCrypto() {
    try {
      const data = await get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d');
      const items = parseGecko(data); if (!items.length) throw new Error('empty');
      state.crypto = { items, at: new Date().toISOString(), source: 'CoinGecko', error: null };
    } catch (e1) {
      try {
        const items = parsePaprika(await get('https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=20')); if (!items.length) throw new Error('empty');
        state.crypto = { items, at: new Date().toISOString(), source: 'CoinPaprika', error: null };
      } catch (e2) { state.crypto.error = String(e1.message || e1) + ' / ' + String(e2.message || e2); } // keep last good items (stale)
    }
    try { const g = (await get('https://api.coingecko.com/api/v3/global')).data; state.global = { cap: g.total_market_cap.usd, capPct24: round(g.market_cap_change_percentage_24h_usd, 2), btcDom: round(g.market_cap_percentage.btc, 1), ethDom: round(g.market_cap_percentage.eth, 1) }; } catch {}
    rebuildEvents();
  }
  async function refreshStocks() {
    const items = [], failed = [];
    await Promise.all(STOCK_LIST.map(async def => {
      try { const p = parseYahoo(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def[0])}?range=5d&interval=60m`), def); if (p) items.push(p); else failed.push(def[0]); } catch { failed.push(def[0]); }
    }));
    items.sort((a, b) => STOCK_LIST.findIndex(s => s[0] === a.ysym) - STOCK_LIST.findIndex(s => s[0] === b.ysym));
    if (items.length) state.stocks = { items, at: new Date().toISOString(), error: failed.length ? 'partial' : null, failed };
    else state.stocks.error = 'all symbols failed';
    rebuildEvents();
  }
  async function refreshFng() {
    try { const d = (await get('https://api.alternative.me/fng/?limit=1')).data[0]; state.fng = { value: +d.value, label: d.value_classification, at: new Date(+d.timestamp * 1000).toISOString() }; } catch {}
  }
  function rebuildEvents() {
    const all = [...state.crypto.items, ...state.stocks.items].flatMap(a => detectMoves(a.sym, a.name, a.kind, a._full || []));
    state.events = all.sort((a, b) => b.t - a.t).slice(0, 60);
  }
  const strip = a => { const { _full, ...rest } = a; return rest; };
  const snapshot = () => ({ crypto: { ...state.crypto, items: state.crypto.items.map(strip) }, stocks: { ...state.stocks, items: state.stocks.items.map(strip) }, fng: state.fng, global: state.global, events: state.events, now: new Date().toISOString() });
  // Compact strip for the header ticker.
  const ticker = () => {
    const pick = (arr, syms) => syms.map(s => arr.find(x => x.sym === s)).filter(Boolean);
    return [...pick(state.crypto.items, ['BTC', 'ETH', 'SOL']), ...pick(state.stocks.items, ['GSPC', 'IXIC', 'KSE', 'GC', 'USDPKR'])]
      .filter(x => x.pct24 != null).map(x => ({ sym: x.sym, name: x.name, price: x.price, pct24: x.pct24, kind: x.kind }));
  };
  function start(cryptoMs = 120000, stockMs = 300000, fngMs = 1800000) {
    const run = (fn, ms) => { fn().catch(() => {}); return setInterval(() => fn().catch(() => {}), ms).unref(); };
    return [run(refreshCrypto, cryptoMs), run(refreshStocks, stockMs), run(refreshFng, fngMs)];
  }
  return { state, refreshCrypto, refreshStocks, refreshFng, snapshot, ticker, start };
}
module.exports = { createMarkets, parseGecko, parsePaprika, parseYahoo, extremes, detectMoves, STOCK_LIST };
