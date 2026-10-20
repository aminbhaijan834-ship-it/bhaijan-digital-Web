# Bhaijan Digital — ڈیجیٹل دنیا کی ہر خبر

Crypto • Stock market • PSX/Rupee • Facebook/Instagram/TikTok • WhatsApp • YouTube • AdSense & Google Ads • SEO • Amazon • Dropshipping/E-commerce • AI & Tech.
**Koi politics, crime, gossip ya sports nahi** (server par keyword filter laga hai: `classify.js`).

Node.js (zero npm dependencies, $0 hosting) + Urdu/English installable mobile app (PWA).

## Kya kya hai
- **News feed**: ~60 publishers ki RSS feeds + 26 Google News topic-searches (`feeds.js`; YouTube/WhatsApp/AdSense jaise topics isi se bharte hain), duplicate khabrein merge, "NEW" tag (1 ghante se kam purani), Trending (jo story 2+ publishers ne di), search, bookmarks, share, offline cache.
- **Market Moves** category: sirf wo khabrein jin mein market upar/neeche gayi (▲ / ▼ arrow ke saath).
- **Markets tab (live)**: Top-20 crypto (CoinGecko, fallback CoinPaprika), S&P 500, NASDAQ, Dow, **KSE-100**, Gold, Silver, Oil, **USD/PKR**, Amazon/Meta/Google/NVIDIA/Apple/Microsoft/Tesla/Shopify/Coinbase (Yahoo Finance), Fear & Greed index, crypto market cap, BTC dominance.
  - Har asset par tap karo → chart, **hafte ki sab se unchi/neechi qeemat aur uska waqt**, 24h high/low, ATH.
  - **Market Timeline**: "kab upar gayi, kab neeche" — pichle dino ki bari ghanta-war harkatein, time ke saath.
- Header mein live ticker (BTC, ETH, SOL, S&P, NASDAQ, KSE-100, Gold, USD/PKR).
- Urdu (RTL) / English, Dark / Light / Auto, headlines ka Urdu machine-translation (MyMemory free quota; khatam ho to English dikhta hai).

## Freshness (kitni jaldi update hota hai)
- Server har **60 second** mein check karta hai; Google News searches har ~1 min, publishers ki apni feeds har 5 min (zyada poochne par site block kar deti hai). 304/ETag use hota hai taake bandwidth bachay.
- App **kholte hi** server se fresh data mangti hai (`fresh=1`), purani list foran dikha kar.
- App khuli ho to har **1 minute** khud update hoti hai; agar aap neeche padh rahe ho to list nahi hilti, balkay "↑ N new stories" ka button aata hai. Background se wapas aao to bhi foran refresh. Pull-down ya ⟳ se manual refresh.
- Har page par "Updated: X min ago" likha hota hai.
- Diagnosis: `/status` kholo (phone par bhi) — har category mein kitni khabrein hain aur kaun sa source fail hai, sab saaf dikhta hai.

## Local chalana
    node server.js            # Node 20+, internet zaroori
    open http://localhost:3000
    npm test                  # 9 tests, internet ki zaroorat nahi
    npm run demo              # FAKE data ke saath UI preview: http://localhost:3100

## ⚠️ Pehli baar deploy ke baad ye zaroor karo
Feed URLs is build ke waqt live verify nahi ho sake (build machine ka internet band tha). Deploy ke baad kholo:

    https://YOUR-SITE/api/health

Har source ke saamne `ok:true` ya `error` likha hoga. Jo fail ho (404/403) usay `feeds.js` mein theek karo ya delete kar do — app bagair us ke chalti rehti hai (har source alag hai, ek kharab source kuch nahi bigarta). Market APIs ka haal bhi usi page par `markets` mein dikhta hai.

## $0 mein online (Render)
1. Folder GitHub par push karo.
2. render.com → New Web Service → repo choose karo (`render.yaml` khud use ho jati hai, plan: free).
3. Free plan idle hone par so jata hai; pehla load 20–30 sec le sakta hai. Hamesha jaga rakhne ke liye UptimeRobot se `/api/health` har 5 min ping karwa do.

## Android APK ($0)
1. Deployed https link Chrome (Android) mein kholo → ⋮ menu → **Install app** (foran kaam karta hai).
2. APK chahiye to pwabuilder.com → apna URL → Package for Android → download → sideload.
   Play Store ke liye $25 developer fee lagti hai.

## Customize
- **Naye sources**: `feeds.js` mein ek line (`S(id, name, url, [categories], {gate:true})`). `gate:true` = general publisher, sirf wohi stories rakho jo hamare topics se match karein.
- **Politics/ghair-mutaliq filter**: `classify.js` ka `BLOCK` regex. **Topic keywords**: `TOPICS`.
- **Coins / stocks ki list**: `markets.js` (`STOCK_LIST`; crypto top-20 market cap se aati hai).
- **Logo**: `public/logo.svg` edit karo, phir `npm run icons` (Playwright chahiye) ya PNG icons khud replace karo.
- Env (optional): `PORT`, `REFRESH_SECONDS` (60), `MYMEMORY_EMAIL` (translation quota barhane ke liye), `TRANSLATE_DAILY_CHARS`.
- Frontend alag host par ho to `public/config.js` mein `API_BASE` set karo (CORS on hai).

## Zaroori baatein
- Headlines/summaries publishers ki public RSS se aati hain; har khabar asal publisher ke link par khulti hai. Content ke haqooq unke paas hain.
- Qeemten free public APIs se aati hain, late ho sakti hain; yeh **mali mashwara nahi**. Free APIs (CoinGecko/Yahoo) ki rate-limits hoti hain — server cache karta hai (crypto 2 min, stocks 5 min).
- Push notifications abhi nahi hain.
