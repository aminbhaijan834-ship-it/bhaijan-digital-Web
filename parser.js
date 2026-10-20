const crypto = require('crypto');
const NAMED = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', rsquo:'’', lsquo:'‘', rdquo:'”', ldquo:'“', ndash:'–', mdash:'—', hellip:'…' };
const ent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  try { if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch { return m; }
  return NAMED[e.toLowerCase()] ?? m; });
const unCdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
// Decode entities once; a second pass only if double-encoded text (&amp;#8217;) is left over.
const dec = s => { const a = ent(unCdata(s)); return /&(#\d+|#x[0-9a-f]+|amp|quot|nbsp|rsquo|lsquo|ndash|mdash);/i.test(a) ? ent(a) : a; };
const strip = s => dec(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); return m ? m[1] : ''; };
const attr = (x, n, a) => { const m = x.match(new RegExp(`<${n}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? dec(m[1]) : ''; };
const safeUrl = u => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : ''; } catch { return ''; } };

function extractImage(item) {
  const c = [attr(item, 'media:content', 'url'), attr(item, 'media:thumbnail', 'url')];
  const enc = item.match(/<enclosure\b[^>]*>/i); if (enc && /image/i.test(enc[0])) c.push(attr(enc[0], 'enclosure', 'url'));
  const body = dec(tag(item, 'content:encoded') + tag(item, 'description') + tag(item, 'content') + tag(item, 'summary'));
  c.push((body.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '');
  return c.map(x => safeUrl(x)).find(Boolean) || null;
}
// Atom: prefer rel="alternate" (or no rel) link, never rel="self"/"replies".
function atomLink(b) {
  const links = b.match(/<link\b[^>]*>/gi) || [];
  const pick = links.find(l => /rel=["']alternate["']/i.test(l)) || links.find(l => !/rel=/i.test(l)) || links[0];
  return pick ? (pick.match(/href=["']([^"']+)["']/i) || [])[1] || '' : '';
}

// Parses RSS 2.0 and Atom. Returns articles with the publisher's real pubDate (null if absent/invalid; future dates are clamped to now).
function parseFeed(xml, source) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const link = safeUrl(strip(tag(b, 'link')) || dec(atomLink(b)) || strip(tag(b, 'guid')));
    let title = strip(tag(b, 'title'));
    if (!link || !title) return null;
    let publisher = source.name, summary = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded')).slice(0, 280);
    if (source.gnews) { // Google News search feeds: real publisher is in <source>, title ends with " - Publisher", description is just links
      const pub = strip(tag(b, 'source')); if (pub) { publisher = pub; if (title.endsWith(' - ' + pub)) title = title.slice(0, -(pub.length + 3)); }
      summary = '';
    }
    let d = new Date(strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    if (!isNaN(d) && d.getTime() > Date.now()) d = new Date();
    return {
      id: crypto.createHash('sha1').update(link).digest('base64url').slice(0, 16),
      title, url: link, summary,
      image: extractImage(b), publisher, gnews: !!source.gnews, lang: source.lang || 'en', categories: [...(source.cats || [])], gate: !!source.gate,
      author: strip(tag(b, 'dc:creator') || tag(b, 'author')) || null,
      publishedAt: isNaN(d) ? null : d.toISOString(),
    };
  }).filter(Boolean);
}

const STOP = new Set('the a an and or of to in on for with at by from is are was be as it its this that new says say how what why after over into amid more than up down vs'.split(' '));
const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = t => new Set(norm(t).split(' ').filter(w => w.length > 2 && !STOP.has(w)));

// Dedupe by URL (sans query/fragment) and by normalized title; merge categories/publishers.
function dedupe(list) {
  const seen = new Map(), out = [];
  for (const a of list) {
    const u = new URL(a.url); const keys = [u.origin + u.pathname, 't:' + norm(a.title)];
    const hit = keys.map(k => seen.get(k)).find(Boolean);
    if (hit) { hit.categories = [...new Set([...hit.categories, ...a.categories])]; hit.image ||= a.image; hit.publishers = [...new Set([...hit.publishers, a.publisher])]; hit.sourceCount = hit.publishers.length; continue; }
    a.publishers = [a.publisher]; a.sourceCount = 1;
    keys.forEach(k => seen.set(k, a)); out.push(a);
  }
  return out;
}
// Marks the same story reported by different publishers (title word overlap >= 0.6) so "trending" is derived from real coverage.
function clusterStories(list, max = 600) {
  const recent = list.slice(0, max), tk = recent.map(a => tokens(a.title));
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
    const A = recent[i], B = recent[j];
    if (A.publisher === B.publisher || tk[i].size < 3 || tk[j].size < 3) continue;
    let inter = 0; for (const w of tk[i]) if (tk[j].has(w)) inter++;
    if (inter / (tk[i].size + tk[j].size - inter) >= 0.6) {
      const pubs = [...new Set([...A.publishers, ...B.publishers])];
      A.publishers = B.publishers = pubs; A.sourceCount = B.sourceCount = pubs.length;
    }
  }
  return list;
}
module.exports = { parseFeed, dedupe, clusterStories, strip };
