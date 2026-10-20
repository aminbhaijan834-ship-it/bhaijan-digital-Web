// Machine translation to Urdu via MyMemory's free API (https://mymemory.translated.net).
// Free anonymous quota is small (~5,000 chars/day; more with MYMEMORY_EMAIL). Over quota/failure => returns null
// and callers show the ORIGINAL text. Output is machine translation and is always labelled as such in the UI.
const cache = new Map(); // text -> urdu
const budget = { day:'', used:0 };
const DAILY = +process.env.TRANSLATE_DAILY_CHARS || (process.env.MYMEMORY_EMAIL ? 45000 : 4500);
function spend(n){ const d=new Date().toISOString().slice(0,10); if(budget.day!==d){budget.day=d;budget.used=0} if(budget.used+n>DAILY) return false; budget.used+=n; return true; }

async function translateText(text, f = fetch) {
  const t = String(text||'').trim().slice(0,400); if (!t) return null;
  if (cache.has(t)) return cache.get(t);
  if (!spend(t.length)) return null;
  try {
    const u = new URL('https://api.mymemory.translated.net/get');
    u.searchParams.set('q',t); u.searchParams.set('langpair','en|ur');
    if (process.env.MYMEMORY_EMAIL) u.searchParams.set('de',process.env.MYMEMORY_EMAIL);
    const r = await f(u, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json(); const out = j?.responseData?.translatedText;
    if (+j.responseStatus!==200 || !out || /MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(out)) return null;
    if (!/[\u0600-\u06FF]/.test(out)) return null; // must actually contain Urdu/Arabic script
    cache.set(t,out); if (cache.size>5000) cache.delete(cache.keys().next().value);
    return out;
  } catch { return null; }
}
// Returns clones of English articles with titleUr/summaryUr when translation succeeded. Never mutates stored articles.
async function translateArticles(list, f = fetch) {
  const out = list.map(a => ({...a}));
  const todo = out.filter(a => a.lang==='en'); let i = 0;
  await Promise.all(Array.from({length:4},async()=>{ while(i<todo.length){ const a=todo[i++];
    const t = await translateText(a.title,f); if (t) { a.titleUr=t; a.summaryUr = a.summary ? await translateText(a.summary.slice(0,200),f) : null; } } }));
  return out;
}
module.exports = { translateText, translateArticles, _budget:budget };
