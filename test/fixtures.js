// Offline fixtures: fake publishers + fake market APIs, so the whole pipeline can be tested without internet.
const rnd = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const rfc = m => new Date(Date.now() - m * 6e4).toUTCString();
const item = (title, link, mins, desc = '', img = '') => `<item><title><![CDATA[${title}]]></title><link>${link}</link><description><![CDATA[${desc}${img ? `<img src="${img}">` : ''}]]></description><pubDate>${rfc(mins)}</pubDate></item>`;
const rss = items => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join('')}</channel></rss>`;

const FEEDS = {
  'https://crypto.test/rss': rss([
    item('Bitcoin surges past $120,000 as spot ETF inflows jump', 'https://crypto.test/a1', 5, 'BTC rallies on record ETF demand.', 'https://crypto.test/a1.jpg'),
    item('Ethereum falls 6% as traders take profits', 'https://crypto.test/a2', 40, 'ETH slides after a sharp rally.'),
    item('Trump promises new crypto executive order', 'https://crypto.test/a3', 50, 'The president said on Monday...'),
    item('Solana network upgrade goes live', 'https://crypto.test/a4', 300, 'Developers shipped the upgrade.'),
  ]),
  'https://stocks.test/rss': rss([
    item('Nasdaq tumbles 2% as Nvidia earnings disappoint', 'https://stocks.test/s1', 20, 'Tech stocks sold off on Wall Street.'),
    item('Bitcoin surges past $120,000 as spot ETF inflows jump', 'https://other.test/dup', 8, 'Same story, another publisher.'),
    item('Gold hits record high on rate cut bets', 'https://stocks.test/s2', 90, 'Gold prices climbed.'),
  ]),
  'https://general.test/rss': rss([ // gated publisher: only on-topic stories survive
    item('YouTube updates Partner Program monetization rules', 'https://general.test/g1', 15, 'Creators need fewer subscribers.'),
    item('Celebrity couple announce divorce', 'https://general.test/g2', 10, 'Hollywood gossip.'),
    item('Ten tips for a greener garden', 'https://general.test/g3', 12, 'Gardening advice.'),
    item('WhatsApp rolls out usernames to everyone', 'https://general.test/g4', 25, 'Meta messaging update.'),
    item('Amazon FBA fee changes hit sellers in 2027', 'https://general.test/g5', 35, 'Seller fees go up.'),
    item('Shopify dropshipping apps see record Temu competition', 'https://general.test/g6', 55, 'Ecommerce is changing.'),
    item('Google AdSense updates payment thresholds for publishers', 'https://general.test/g7', 65, 'Earnings.'),
  ]),
  'https://atom.test/feed': `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>KSE-100 plunges 1,200 points on profit taking</title><link rel="self" href="https://atom.test/self"/><link rel="alternate" href="https://atom.test/psx1"/><updated>${new Date(Date.now() - 3e5).toISOString()}</updated><summary>PSX falls.</summary></entry></feed>`,
};
const SOURCES = [
  { id: 'c', name: 'CryptoPub', url: 'https://crypto.test/rss', cats: ['crypto'], lang: 'en' },
  { id: 's', name: 'StockPub', url: 'https://stocks.test/rss', cats: ['stocks'], lang: 'en' },
  { id: 'g', name: 'GeneralPub', url: 'https://general.test/rss', cats: ['ai'], lang: 'en', gate: true },
  { id: 'a', name: 'AtomPub', url: 'https://atom.test/feed', cats: ['psx'], lang: 'en', gate: true },
  { id: 'bad', name: 'BrokenPub', url: 'https://broken.test/rss', cats: ['crypto'], lang: 'en' },
  { id: 'html', name: 'NotAFeed', url: 'https://html.test/', cats: ['crypto'], lang: 'en' },
];

function gecko() {
  const R = rnd(7), now = Date.now(), mk = (id, sym, name, p, n) => {
    let v = p * 0.95; const sp = Array.from({ length: 168 }, (_, i) => (v *= 1 + (R() - 0.46) * 0.012, i === 100 ? (v *= 1.04) : 0, i === 140 ? (v *= 0.96) : 0, v));
    return { id, symbol: sym, name, current_price: sp[167], market_cap: sp[167] * 1e7, market_cap_rank: n, high_24h: sp[167] * 1.02, low_24h: sp[167] * 0.97, ath: sp[167] * 1.3, ath_change_percentage: -23.5,
      price_change_percentage_24h: 2.34, price_change_percentage_1h_in_currency: 0.4, price_change_percentage_24h_in_currency: 2.34, price_change_percentage_7d_in_currency: -3.1, last_updated: new Date(now).toISOString(), sparkline_in_7d: { price: sp } };
  };
  return [mk('bitcoin', 'btc', 'Bitcoin', 64000, 1), mk('ethereum', 'eth', 'Ethereum', 3100, 2), mk('solana', 'sol', 'Solana', 150, 5), mk('ripple', 'xrp', 'XRP', 0.52, 6), mk('shiba', 'shib', 'Shiba Inu', 0.000021, 15)];
}
function yahoo(sym) {
  const R = rnd(sym.length * 31 + sym.charCodeAt(1)), base = { '^GSPC': 5800, '^IXIC': 18500, '^DJI': 42000, '^KSE': 115000, 'GC=F': 2650, 'SI=F': 31, 'CL=F': 71, 'USDPKR=X': 278.4, AMZN: 190 }[sym] || 120;
  const ts = [], cl = [], end = Math.floor(Date.now() / 1000); let v = base;
  for (let i = 5 * 24; i >= 0; i--) { const t = end - i * 3600, h = new Date(t * 1000).getUTCHours(); if (h < 9 || h > 20) continue; ts.push(t); v *= 1 + (R() - 0.48) * 0.006; cl.push(+v.toFixed(2)); }
  if (sym === 'FAIL') return null;
  return { chart: { result: [{ meta: { regularMarketPrice: cl[cl.length - 1], chartPreviousClose: base, currency: 'USD', gmtoffset: 0, regularMarketTime: ts[ts.length - 1] }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } };
}
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
const fakeFetch = async (url) => {
  url = String(url);
  if (FEEDS[url]) return { ok: true, status: 200, text: async () => FEEDS[url] };
  if (url === 'https://broken.test/rss') return { ok: false, status: 503, text: async () => '' };
  if (url === 'https://html.test/') return { ok: true, status: 200, text: async () => '<html><body>hello</body></html>' };
  if (url.startsWith('https://api.coingecko.com/api/v3/coins/markets')) return json(gecko());
  if (url.startsWith('https://api.coingecko.com/api/v3/global')) return json({ data: { total_market_cap: { usd: 2.31e12 }, market_cap_change_percentage_24h_usd: 1.2, market_cap_percentage: { btc: 54.3, eth: 12.9 } } });
  if (url.startsWith('https://api.alternative.me/fng')) return json({ data: [{ value: '67', value_classification: 'Greed', timestamp: String(Math.floor(Date.now() / 1000)) }] });
  const m = url.match(/finance\/chart\/([^?]+)/);
  if (m) { const y = yahoo(decodeURIComponent(m[1])); return y ? json(y) : json({}, false, 404); }
  return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
};
module.exports = { FEEDS, SOURCES, fakeFetch, gecko, yahoo };
