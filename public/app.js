(() => {
'use strict';
const API = ((window.BD_CONFIG || {}).API_BASE || '').replace(/\/$/, '');
const STATIC = !!(window.BD_CONFIG || {}).STATIC, DATA = (window.BD_CONFIG || {}).DATA_BASE || 'data/';
const CATS = ['all','moves','crypto','stocks','psx','social','whatsapp','youtube','adsense','seo','amazon','dropship','ai','trending'];
const ICON = {all:'📰',moves:'📊',crypto:'₿',stocks:'📈',psx:'🏦',social:'💬',whatsapp:'🟢',youtube:'▶️',adsense:'💰',seo:'🔎',amazon:'📦',dropship:'🛒',ai:'🤖',trending:'🔥'};
const IN_APP = /BhaijanDigitalApp/.test(navigator.userAgent); // inside the Android wrapper app: dark by default (brand look)
const $ = s => document.querySelector(s);
const LS = { get:(k,d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }, set:(k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const qs = new URLSearchParams(location.search);
const S = { tab: qs.get('tab') === 'markets' ? 'markets' : 'home', cat: CATS.includes(qs.get('cat')) ? qs.get('cat') : 'all', cursor:null, items:[], loading:false, err:null, q:'',
  ui: LS.get('ui','ur'), tr: STATIC ? false : LS.get('tr', true), saved: LS.get('saved',[]), theme: LS.get('theme','auto'), last:null, ticker: LS.get('ticker',[]), inst:null,
  mk: { d: LS.get('mk', null), loading:false, err:null, seg:'crypto', evf:'all' }, sheet:null, pending:0, softBusy:false, warm:0, warming:false, lastOk:0 };
const t = () => I18N[S.ui];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ---------- data source: live Node server (/api/...) or static hosting (data/*.json rebuilt every few minutes by GitHub Actions) ---------- */
const api = async p => STATIC ? staticApi(p) : liveApi(p);
const liveApi = async p => { const r = await fetch(API + p, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const jget = async f => { const r = await fetch(DATA + f + '?v=' + Math.floor(Date.now() / 6e4), { cache: 'no-store', signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + f); return r.json(); };
const r2 = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null);
let MK = null, MKAT = 0;
function sQuery(n, sp) { // same filtering/paging rules as the server's query()
  const cat = sp.get('category'), q = (sp.get('q') || '').toLowerCase().trim().slice(0, 100), limit = Math.min(Math.max(+sp.get('limit') || 20, 1), 50);
  let l = n.articles || [];
  if (cat === 'trending') l = l.filter(a => a.sourceCount >= 2); else if (cat && cat !== 'all') l = l.filter(a => a.categories.includes(cat));
  if (q) l = l.filter(a => (a.title + ' ' + a.summary).toLowerCase().includes(q));
  const cur = sp.get('cursor'); if (cur) { const i = l.findIndex(a => (a.publishedAt || '') + '|' + a.id === cur); l = i >= 0 ? l.slice(i + 1) : []; }
  const page = l.slice(0, limit), last = page[page.length - 1];
  return { articles: page, nextCursor: l.length > limit && last ? (last.publishedAt || '') + '|' + last.id : null, lastRefresh: n.lastRefresh, warming: false };
}
async function overlayLiveCrypto(m) { // prices straight from CoinGecko in the visitor's browser (CORS-enabled); any failure just keeps the build-time numbers
  const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return; const list = await r.json(); let n = 0;
  for (const c of list) {
    const a = m.crypto.items.find(x => x.sym === String(c.symbol).toUpperCase()); if (!a || typeof c.current_price !== 'number') continue;
    a.price = c.current_price; a.pct24 = r2(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h); a.pct1h = r2(c.price_change_percentage_1h_in_currency); a.pct7d = r2(c.price_change_percentage_7d_in_currency);
    a.hi24 = c.high_24h; a.lo24 = c.low_24h; a.cap = c.market_cap; n++;
  }
  if (n) { m.crypto.at = new Date().toISOString(); m.crypto.source = 'CoinGecko (live)'; m.crypto.error = null; }
}
async function staticMarkets() {
  if (MK && Date.now() - MKAT < 20000) return MK;
  const m = await jget('markets.json'); try { await overlayLiveCrypto(m); } catch {}
  MK = m; MKAT = Date.now(); return m;
}
function tickerOf(m) {
  const pick = (arr, syms) => syms.map(x => arr.find(i => i.sym === x)).filter(Boolean);
  return [...pick(m.crypto.items, ['BTC', 'ETH', 'SOL']), ...pick(m.stocks.items, ['GSPC', 'IXIC', 'KSE', 'GC', 'USDPKR'])].filter(x => x.pct24 != null).map(x => ({ sym: x.sym, name: x.name, price: x.price, pct24: x.pct24, kind: x.kind }));
}
async function staticApi(p) {
  const u = new URL(p, location.origin);
  if (u.pathname === '/api/news') return sQuery(await jget('news.json'), u.searchParams);
  if (u.pathname === '/api/markets') return staticMarkets();
  if (u.pathname === '/api/ticker') { const m = await staticMarkets(); return { items: tickerOf(m), at: m.crypto.at || m.stocks.at }; }
  throw new Error('unknown endpoint ' + u.pathname);
}

/* ---------- formatting ---------- */
const nf = (v, d) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
function money(a, v = a.price) {
  if (v == null) return '—';
  const big = Math.abs(v) >= 1000, d = Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.01 ? 4 : Math.abs(v) >= 0.0001 ? 6 : 8, s = nf(v, big ? (a.kind === 'crypto' ? 0 : 2) : d);
  return a.sym === 'KSE' || a.kind === 'index' ? s : a.sym === 'USDPKR' ? 'Rs ' + s : '$' + s;
}
const pill = p => p == null ? '<span class="pill fl">—</span>' : `<span class="pill ${p > 0 ? 'up' : p < 0 ? 'dn' : 'fl'}">${p > 0 ? '▲' : p < 0 ? '▼' : '•'} ${Math.abs(p).toFixed(2)}%</span>`;
const dirCls = p => p == null ? '' : p >= 0 ? 'up' : 'dn';
function ago(iso) { if (!iso) return t().unknownTime; const m = Math.round((Date.now() - Date.parse(iso)) / 6e4), a = t().ago; return m < 1 ? a.now : m < 60 ? a.m(m) : m < 1440 ? a.h(Math.round(m / 60)) : a.d(Math.round(m / 1440)); }
const fmtT = ts => { try { return new Date(ts * 1000).toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true }); } catch { return new Date(ts * 1000).toString(); } }; // Latin digits keep the time readable inside RTL text
function toast(x) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = x; document.body.append(e); setTimeout(() => e.remove(), 1700); }

/* ---------- svg charts ---------- */
function spark(pts) {
  const v = (pts || []).map(p => p[1]); if (v.length < 2) return '<span class="spark"></span>';
  const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1, w = 64, h = 28;
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * w).toFixed(1)} ${(h - 2 - (x - mn) / r * (h - 4)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${v[v.length - 1] >= v[0] ? 'var(--up)' : 'var(--dn)'}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function bigChart(a) {
  const pts = a.pts || []; if (pts.length < 2) return '';
  const W = 320, H = 150, P = 14, vs = pts.map(p => p[1]), t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const mn = Math.min(...vs, a.lo7 ? a.lo7.v : Infinity), mx = Math.max(...vs, a.hi7 ? a.hi7.v : -Infinity), r = mx - mn || 1;
  const X = ts => P + (ts - t0) / ((t1 - t0) || 1) * (W - 2 * P), Y = v => H - P - (v - mn) / r * (H - 2 * P);
  const up = vs[vs.length - 1] >= vs[0], c = up ? 'var(--up)' : 'var(--dn)';
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  const area = `${line}L${X(t1).toFixed(1)} ${H - P}L${X(t0).toFixed(1)} ${H - P}Z`;
  const mark = (m, col, lbl) => m ? `<circle cx="${X(m.t).toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="4.5" fill="${col}" stroke="var(--card)" stroke-width="2"/><text x="${Math.min(W - 6, Math.max(6, X(m.t))).toFixed(1)}" y="${(lbl === 'H' ? Math.max(11, Y(m.v) - 9) : (Y(m.v) + 17 > H - 2 ? Y(m.v) - 9 : Y(m.v) + 17)).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${col}" font-family="Inter,sans-serif">${lbl === 'H' ? 'HIGH' : 'LOW'}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
  <path d="${area}" fill="url(#ga)"/><path d="${line}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${mark(a.hi7, 'var(--up)', 'H')}${mark(a.lo7, 'var(--dn)', 'L')}</svg>`;
}

/* ---------- news ---------- */
const isSaved = u => S.saved.some(a => a.url === u), list = fs => fs ? S.saved : S.items;
function toggleSave(i, fs) { const a = list(fs)[i]; if (!a) return; if (isSaved(a.url)) { S.saved = S.saved.filter(x => x.url !== a.url); toast(t().unsaveToast); } else { S.saved.unshift(a); toast(t().saveToast); } LS.set('saved', S.saved); render(); }
async function share(i, fs) { const a = list(fs)[i]; if (!a) return; if (window.AndroidApp && window.AndroidApp.share) { try { window.AndroidApp.share(a.title, a.url); return; } catch {} } try { if (navigator.share) await navigator.share({ title: a.title, url: a.url }); else { await navigator.clipboard.writeText(a.url); toast(t().copied); } } catch {} }
function card(a, i, kind, fs) {
  const T = t(), tr = S.ui === 'ur' && S.tr && a.titleUr, title = tr ? a.titleUr : a.title, sum = tr && a.summaryUr ? a.summaryUr : a.summary;
  const rtl = (tr || a.lang === 'ur') ? 'dir="rtl"' : 'dir="ltr"', fresh = a.publishedAt && Date.now() - Date.parse(a.publishedAt) < 36e5;
  const cat = a.categories.find(c => c !== 'moves' && c !== 'trending') || a.categories[0];
  const img = a.image ? `<img loading="lazy" src="${esc(a.image)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=ph></div>'">` : '<div class="ph"></div>';
  const mv = a.dir ? `<span class="mv ${a.dir === 'up' ? 'up' : 'dn'}">${a.dir === 'up' ? '▲' : '▼'}</span>` : '';
  return `<article class="card ${kind}"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${img}<div class="b"><div class="meta">${mv}<span class="cat">${esc(T[cat] || cat)}</span>· <span dir="auto">${esc(a.publisher)}</span> · ${ago(a.publishedAt)}${fresh ? ` <span class="nw">${T.newTag}</span>` : ''}${tr ? ` <span class="mt">${T.mt}</span>` : ''}</div>
  <h3 ${rtl}>${esc(title)}</h3>${tr ? `<div class="orig">${esc(a.title)}</div>` : ''}${kind === 'row' ? '' : `<p ${rtl}>${esc(sum)}</p>`}</div></a>
  <div class="act"><span class="sp"></span><button data-a="save" data-i="${i}" data-fs="${fs ? 1 : 0}" aria-label="Bookmark">${isSaved(a.url) ? '🔖' : '🏷️'}</button><button data-a="share" data-i="${i}" data-fs="${fs ? 1 : 0}" aria-label="Share">↗</button></div></article>`;
}
const cacheKey = () => 'cache:' + S.cat + S.ui + S.tr;
// a search looks through ALL stories, not just the selected chip
function newsParams(cursor) { const p = new URLSearchParams({ category: S.q ? 'all' : S.cat, limit: 20 }); if (cursor) p.set('cursor', cursor); else p.set('fresh', '1'); if (S.q) p.set('q', S.q); if (S.ui === 'ur' && S.tr) p.set('translate', 'ur'); return p; }
async function load(reset) {
  if (S.loading) return; S.loading = true; if (reset) { S.items = []; S.cursor = null; S.err = null; S.pending = 0; } render();
  const key = cacheKey();
  try { const d = await api('/api/news?' + newsParams(S.cursor)); S.items = S.items.concat(d.articles); S.cursor = d.nextCursor; S.last = d.lastRefresh; S.err = null; S.lastOk = Date.now(); S.warming = !!d.warming && !S.items.length; if (!S.q && S.items.length) LS.set(key, S.items.slice(0, 40));
    if (S.warming && S.warm < 10) { S.warm++; setTimeout(() => { if (!S.items.length) load(true); }, 4000); } }
  catch (e) { const c = !S.q && LS.get(key, []); if (reset && c.length) { S.items = c; S.err = 'offline'; } else S.err = e.message; }
  S.loading = false; render(); hideSplash();
}
// Silent background refresh: keeps the list on screen, never shows a skeleton, and never makes the page jump while you are reading.
async function softRefresh(force) {
  if (S.softBusy || S.loading || S.tab !== 'home' || S.q) return; S.softBusy = true;
  try {
    const d = await api('/api/news?' + newsParams(null)); S.last = d.lastRefresh; S.lastOk = Date.now(); S.warming = !!d.warming && !d.articles.length;
    const sig = x => x.map(i => i.id).join(), old = S.items[0] && S.items[0].id;
    if (S.err === 'offline') { S.err = null; }
    if (sig(d.articles) !== sig(S.items.slice(0, d.articles.length)) || S.err) {
      if (!S.items.length || force || scrollY < 120) { S.items = d.articles; S.cursor = d.nextCursor; S.pending = 0; if (d.articles.length) LS.set(cacheKey(), d.articles.slice(0, 40)); render(); }
      else { const i = d.articles.findIndex(x => x.id === old), n = i < 0 ? d.articles.length : i; if (n !== S.pending) { S.pending = n; render(); } }
    } else updTxt();
  } catch { if (S.items.length && S.err !== 'offline') { S.err = 'offline'; render(); } }
  S.softBusy = false; hideSplash();
}
const updTxt = () => { const e = $('#upd'); if (e) e.textContent = '🔄 ' + t().updated + ': ' + (S.last ? ago(S.last) : '—'); };
function feedView() {
  const T = t();
  if (S.loading && !S.items.length) return '<div class="sk"></div><div class="sk"></div><div class="sk"></div>';
  if (S.err && !S.items.length) return `<div class="state"><div class="em">⚠️</div><h3>${T.errTitle}</h3><small dir="ltr">${esc(S.err)}</small><br><button data-a="retry">${T.retry}</button></div>`;
  if (!S.items.length && S.warming) return `<div class="state"><div class="em">⏳</div><h3>${T.warming}</h3></div><div class="sk"></div><div class="sk"></div>`;
  if (!S.items.length) return `<div class="state"><div class="em">📭</div><h3>${S.q ? T.noResults + ' “' + esc(S.q) + '”' : T.emptyTitle}</h3><p>${S.q ? '' : T.emptyHint}</p><button data-a="retry">${T.refresh}</button></div>`;
  const off = (S.err === 'offline' ? `<div class="warn">📴 ${T.offline}</div>` : '') + (S.pending ? `<button class="newpill" data-a="shownew">↑ ${T.newStories(S.pending)}</button>` : '') + (S.q ? '' : `<div class="upd" id="upd">🔄 ${T.updated}: ${S.last ? ago(S.last) : '—'}</div>`), f = S.q ? '' : card(S.items[0], 0, 'feat'),
    rest = S.items.slice(S.q ? 0 : 1).map((a, i) => card(a, i + (S.q ? 0 : 1), i % 6 === 0 && !S.q ? '' : 'row')).join('');
  return off + f + '<div class="feed-grid">' + rest + '</div>' + (S.cursor ? `<div class="state" style="padding:8px"><button data-a="more">${S.loading ? T.loading : T.loadMore}</button></div>` : '');
}

/* ---------- markets ---------- */
async function loadMarkets() {
  if (S.mk.loading) return; S.mk.loading = true; if (S.tab === 'markets' && !S.mk.d) render();
  try { S.mk.d = await api('/api/markets'); S.mk.err = null; LS.set('mk', S.mk.d); }
  catch (e) { S.mk.err = e.message; }
  S.mk.loading = false; if (S.tab === 'markets') render(); if (S.sheet) renderSheet(); hideSplash();
}
async function loadTicker() { try { const d = await api('/api/ticker'); S.ticker = d.items; LS.set('ticker', d.items); } catch {} drawTicker(); }
function drawTicker() {
  const el = $('#ticker'), show = S.tab === 'home' && S.ticker.length; el.hidden = !show; if (!show) return;
  el.innerHTML = S.ticker.map(x => `<button class="tk ${dirCls(x.pct24)}" data-a="tab" data-v="markets"><i>${esc(x.sym)}</i>${esc(money(x))}<em>${x.pct24 >= 0 ? '▲' : '▼'} ${Math.abs(x.pct24).toFixed(2)}%</em></button>`).join('');
}
function assetRow(a) {
  return `<button class="mrow" data-a="asset" data-v="${esc(a.sym)}"><span class="coin">${esc(a.sym.slice(0, 4))}</span><span class="nm"><b>${esc(a.name)}</b><small>${esc(a.sym)}${a.rank ? ' · #' + a.rank : ''}</small></span>${spark(a.pts)}<span class="pr">${esc(money(a))}<br>${pill(a.pct24)}</span></button>`;
}
function marketsView() {
  const T = t(), m = S.mk.d;
  if (!m) return S.mk.loading ? '<div class="sk"></div><div class="sk"></div>' : `<div class="state"><div class="em">📉</div><h3>${T.mUnavail}</h3>${S.mk.err ? `<small dir="ltr">${esc(S.mk.err)}</small><br>` : ''}<button data-a="retry">${T.retry}</button></div>`;
  const fng = m.fng, g = m.global, items = S.mk.seg === 'crypto' ? m.crypto.items : m.stocks.items;
  const blk = S.mk.seg === 'crypto' ? m.crypto : m.stocks, stale = S.mk.err || (blk.error && blk.error !== 'partial');
  const ev = m.events.filter(e => S.mk.evf === 'all' || (S.mk.evf === 'crypto') === (e.kind === 'crypto'));
  return `${stale ? `<div class="warn">⚠️ ${T.mStale}</div>` : ''}
  <div class="kpis">
   <div class="kpi"><small>${T.fng}</small><b>${fng ? fng.value : '—'}</b><span>${fng ? esc(T.fngL[fng.label] || fng.label) : ''}</span>${fng ? `<div class="gauge"><i style="inset-inline-start:${fng.value}%"></i></div>` : ''}</div>
   <div class="kpi"><small>${T.cap}</small><b>${g ? '$' + nf(g.cap / 1e12, 2) + 'T' : '—'}</b>${g ? pill(g.capPct24) : ''}</div>
   <div class="kpi"><small>${T.dom}</small><b>${g ? g.btcDom + '%' : '—'}</b><span>${g ? 'ETH ' + g.ethDom + '%' : ''}</span></div></div>
  <div class="seg" style="margin:6px 0 10px">${[['crypto', T.mCrypto], ['stocks', T.mStocks]].map(([k, l]) => `<button class="${S.mk.seg === k ? 'on' : ''}" data-a="seg" data-v="${k}">${l}</button>`).join('')}</div>
  ${items.length ? items.map(assetRow).join('') : `<div class="state">${T.mUnavail}</div>`}
  <div class="src" dir="auto">${T.mSource}: ${S.mk.seg === 'crypto' ? esc(m.crypto.source || '—') : 'Yahoo Finance'} · ${T.mUpdated}: ${blk.at ? ago(blk.at) : '—'}</div>
  <h2 class="t">${T.timeline}</h2><div class="src" style="margin-top:-4px">${T.timelineHint}</div>
  <div class="seg" style="margin:6px 0 10px">${[['all', T.allf], ['crypto', T.mCrypto], ['stocks', T.stocks]].map(([k, l]) => `<button class="${S.mk.evf === k ? 'on' : ''}" data-a="evf" data-v="${k}">${l}</button>`).join('')}</div>
  ${ev.length ? ev.slice(0, 25).map(evRow).join('') : `<div class="state" style="padding:16px">${T.noEvents}</div>`}
  <p class="src" style="margin-top:16px">${T.disclaimer}</p>`;
}
const evRow = e => `<div class="ev"><span class="ar ${e.dir === 'up' ? 'up' : 'dn'}">${e.dir === 'up' ? '▲' : '▼'}</span><div><b dir="ltr">${esc(e.name)} ${e.pct > 0 ? '+' : ''}${e.pct}%</b><small><bdi dir="ltr">${fmtT(e.t)}</bdi> · ${ago(new Date(e.t * 1000).toISOString())}</small></div><span dir="ltr" style="font:600 13px Inter,sans-serif">${esc(money(e, e.price))}</span></div>`;
function renderSheet() {
  const T = t(), m = S.mk.d, el = $('#sheet'); if (!S.sheet || !m) { el.classList.remove('on'); $('#scrim').classList.toggle('on', $('#drawer').classList.contains('on')); return; }
  const a = [...m.crypto.items, ...m.stocks.items].find(x => x.sym === S.sheet); if (!a) { S.sheet = null; return renderSheet(); }
  const row = (l, v, sub) => v == null ? '' : `<div><small>${l}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  el.innerHTML = `<div class="grab"></div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div><b style="font-size:18px">${esc(a.name)}</b> <small style="color:var(--mu)" dir="ltr">${esc(a.sym)}</small></div><button data-a="closeSheet" aria-label="${T.close}" style="font-size:22px;padding:0 8px">✕</button></div>
  <div class="big">${esc(money(a))}</div><div style="margin-top:4px">${pill(a.pct24)} <small style="color:var(--mu)">${T.h24}</small></div>${bigChart(a)}
  <div class="stats">${row(T.h1, a.pct1h == null ? null : pill(a.pct1h))}${row(T.d7, a.pct7d == null ? null : pill(a.pct7d))}
  ${row(T.hi7, a.hi7 ? esc(money(a, a.hi7.v)) : null, a.hi7 ? fmtT(a.hi7.t) : '')}${row(T.lo7, a.lo7 ? esc(money(a, a.lo7.v)) : null, a.lo7 ? fmtT(a.lo7.t) : '')}
  ${row(T.hi24, a.hi24 ? esc(money(a, a.hi24)) : null)}${row(T.lo24, a.lo24 ? esc(money(a, a.lo24)) : null)}${row(T.ath, a.ath ? esc(money(a, a.ath)) : null, a.athPct != null ? a.athPct + '%' : '')}${row(T.mcap, a.cap ? '$' + nf(a.cap / 1e9, 2) + 'B' : null)}</div>
  ${(() => { const ev = m.events.filter(e => e.sym === a.sym); return ev.length ? `<h2 class="t" style="margin-top:6px">${T.recentMoves}</h2>${ev.map(evRow).join('')}` : ''; })()}
  <p class="src">${T.disclaimer}</p>`;
  el.classList.add('on'); $('#scrim').classList.add('on');
}

/* ---------- chrome / views ---------- */
function chrome() {
  const d = S.theme === 'dark' || (S.theme === 'auto' && (IN_APP || matchMedia('(prefers-color-scheme:dark)').matches));
  document.documentElement.dataset.theme = d ? 'dark' : 'light'; document.documentElement.lang = S.ui; document.documentElement.dir = t().dir;
  $('#tag').textContent = t().tagline; const sp = $('#spt'); if (sp) sp.textContent = t().tagline; $('#sbtn').ariaLabel = t().search; $('#rbtn').ariaLabel = t().refresh;
}
const NAV = { home:'<path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2zM8 9h7M8 13h7"/>', markets:'<path d="M3 17l5-5 4 4 8-9M15 7h5v5"/>', explore:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.5-4.5"/>', saved:'<path d="M6 4h12v17l-6-4-6 4z"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>' };
function render() {
  const T = t(), a = $('#app');
  $('#chips').style.display = S.tab === 'home' ? 'flex' : 'none';
  $('#chips').innerHTML = CATS.map(k => `<button class="chip ${k === 'all' ? 'all' : ''} ${S.cat === k ? 'on' : ''}" data-a="cat" data-v="${k}">${ICON[k]} ${T[k]}</button>`).join('');
  $('#bot').innerHTML = ['home', 'markets', 'explore', 'saved', 'settings'].map(k => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}"><svg viewBox="0 0 24 24">${NAV[k]}</svg>${T[k]}</button>`).join('');
  drawTicker();
  if (S.tab === 'home') a.innerHTML = feedView();
  else if (S.tab === 'markets') a.innerHTML = marketsView();
  else if (S.tab === 'explore') a.innerHTML = `<form class="search" id="sf"><input name="q" type="search" placeholder="${T.search}" value="${esc(S.q)}" enterkeyhint="search"><button>${T.searchBtn}</button></form>` + (S.q ? feedView() : `<h2 class="t">${T.browse}</h2><div style="display:flex;flex-wrap:wrap;gap:8px">${CATS.slice(1).map(k => `<button class="chip" data-a="cat" data-v="${k}">${ICON[k]} ${T[k]}</button>`).join('')}</div>`);
  else if (S.tab === 'saved') a.innerHTML = S.saved.length ? `<h2 class="t">${T.bookmarks}</h2>` + S.saved.map((x, i) => card(x, i, 'row', true)).join('') : `<div class="state"><div class="em">🔖</div><h3>${T.noSaved}</h3><p>${T.noSavedHint}</p></div>`;
  else a.innerHTML = `<h2 class="t">${T.settings}</h2><div class="set">
    <div>${T.language}<div class="seg">${['ur', 'en'].map(l => `<button class="${S.ui === l ? 'on' : ''}" data-a="ui" data-v="${l}">${l === 'ur' ? 'اردو' : 'English'}</button>`).join('')}</div></div>
    <div>${T.theme}<div class="seg">${[['auto', T.themeAuto], ['light', T.themeLight], ['dark', T.themeDark]].map(([k, l]) => `<button class="${S.theme === k ? 'on' : ''}" data-a="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${STATIC ? '' : `<div>${T.translate}<button class="sw ${S.tr ? 'on' : ''}" data-a="tr" role="switch" aria-checked="${S.tr}" aria-label="${T.translate}"></button></div>`}
    <div>${T.lastRefresh}<span>${S.last ? ago(S.last) : '—'}</span></div>
    <div>${T.bookmarks}<button class="chip" data-a="clear">${T.clear}</button></div>
    <div>${T.install}<button class="chip" data-a="install">⬇</button></div></div>
    <div class="set"><div style="display:block"><b>${T.about}</b><p style="color:var(--mu);font-size:14px">${T.aboutText}</p><p style="color:var(--mu);font-size:13px">${T.disclaimer}</p></div></div>`;
  drawer();
}
function drawer() {
  const T = t();
  $('#drawer').innerHTML = `<div class="hd"><img src="icon-192.png" alt=""><b>Bhaijan Digital</b><small>${T.tagline}</small></div>` +
    `<button data-a="tab" data-v="markets"><span>📈</span>${T.markets}</button><hr>` + CATS.map(k => `<button class="${S.tab === 'home' && S.cat === k ? 'on' : ''}" data-a="cat" data-v="${k}"><span>${ICON[k]}</span>${T[k]}</button>`).join('') +
    `<hr><button data-a="tab" data-v="saved"><span>🔖</span>${T.bookmarks}</button><button data-a="tab" data-v="settings"><span>⚙️</span>${T.settings}</button>`;
}
const openDrawer = () => { $('#drawer').classList.add('on'); $('#scrim').classList.add('on'); };
const closeDrawer = () => { $('#drawer').classList.remove('on'); if (!S.sheet) $('#scrim').classList.remove('on'); };
function setCat(c) { S.cat = c; S.q = ''; S.tab = 'home'; closeDrawer(); load(true); scrollTo(0, 0); setTimeout(() => document.querySelector('.chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 60); }
function go(k) { S.tab = k; S.sheet = null; renderSheet(); closeDrawer(); if (k === 'home') { S.q = ''; load(true); } else { render(); if (k === 'markets') loadMarkets(); } scrollTo(0, 0); }
const refreshCurrent = () => { if (S.tab === 'markets') { loadMarkets(); loadTicker(); } else if (S.tab === 'home' || S.q) load(true); else go('home'); loadTicker(); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, v = b.dataset.v, i = +b.dataset.i, fs = b.dataset.fs === '1';
  if (a === 'cat') setCat(v); else if (a === 'tab') go(v); else if (a === 'save') toggleSave(i, fs); else if (a === 'share') share(i, fs);
  else if (a === 'more') load(); else if (a === 'shownew') { S.pending = 0; scrollTo(0, 0); softRefresh(true); } else if (a === 'retry') (S.tab === 'markets' ? loadMarkets() : load(true));
  else if (a === 'seg') { S.mk.seg = v; render(); } else if (a === 'evf') { S.mk.evf = v; render(); }
  else if (a === 'asset') { S.sheet = v; renderSheet(); } else if (a === 'closeSheet') { S.sheet = null; renderSheet(); }
  else if (a === 'ui') { S.ui = v; LS.set('ui', v); chrome(); S.tab === 'home' || S.q ? load(true) : render(); }
  else if (a === 'theme') { S.theme = v; LS.set('theme', v); chrome(); render(); }
  else if (a === 'tr') { S.tr = !S.tr; LS.set('tr', S.tr); render(); }
  else if (a === 'clear') { S.saved = []; LS.set('saved', []); render(); }
  else if (a === 'install') { if (S.inst) { S.inst.prompt(); S.inst = null; } else toast(t().installed); }
});
document.addEventListener('submit', e => { if (e.target.id !== 'sf') return; e.preventDefault(); S.q = e.target.q.value.trim().slice(0, 100); S.q ? load(true) : render(); });
$('#menu').onclick = openDrawer; $('#sbtn').onclick = () => go('explore'); $('#rbtn').onclick = refreshCurrent;
$('#scrim').onclick = () => { S.sheet = null; renderSheet(); closeDrawer(); $('#scrim').classList.remove('on'); };
addEventListener('keydown', e => { if (e.key === 'Escape') $('#scrim').click(); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.inst = e; });
let y0 = null; addEventListener('touchstart', e => { y0 = scrollY === 0 ? e.touches[0].clientY : null; }, { passive: true });
addEventListener('touchend', e => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 90 && (S.tab === 'home' || S.tab === 'markets')) refreshCurrent(); y0 = null; });
const tick = () => { softRefresh(); loadTicker(); if (S.tab === 'markets' || S.sheet) loadMarkets(); };
setInterval(() => { if (!document.hidden) tick(); }, 6e4);          // every minute while the app is open
setInterval(() => { if (!document.hidden) updTxt(); }, 15e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.lastOk > 30000) { tick(); } }); // coming back to the app => fresh news right away
addEventListener('online', () => { tick(); if (S.tab === 'home' && !S.items.length) load(true); });
const splashT = Date.now(); let splashGone = false;
function hideSplash() { if (splashGone) return; splashGone = true; setTimeout(() => { $('#splash').classList.add('off'); setTimeout(() => $('#splash').remove(), 600); }, Math.max(0, 1000 - (Date.now() - splashT))); }
setTimeout(hideSplash, 6000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
chrome(); render(); loadTicker();
if (S.tab === 'markets') loadMarkets(); else { const c = LS.get(cacheKey(), []); if (c.length) { S.items = c; render(); hideSplash(); softRefresh(true); } else load(true); }
if (S.tab !== 'markets') loadMarkets(); // warm the markets cache in the background
})();
