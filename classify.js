// Topic tagging + content filter. Bhaijan Digital covers markets / crypto / social media / ads / e-commerce ONLY:
//  - BLOCK drops politics, war/crime/violence, adult and celebrity-gossip stories everywhere.
//  - TOPICS adds categories by keyword; sources flagged `gate` must match at least one topic or the story is dropped.
const BLOCK = new RegExp('\\b(' + [
  'election\\w*', 'elector\\w*', 'ballot\\w*', 'parliament\\w*', 'senate', 'senator\\w*', 'congress(?:man|woman|ional)?', 'politic\\w*', 'prime minister', 'chief minister',
  'president(?:ial)?', 'white house', 'trump\\w*', 'biden', 'harris', 'putin', 'zelensk\\w*', 'netanyahu', 'modi', 'imran khan', 'nawaz', 'shehbaz', 'zardari', 'bilawal', 'pti', 'pml-?n', 'ppp',
  'democrats?', 'republicans?', 'gop', 'lawmakers?', 'legislat\\w*', 'opposition', 'coalition', 'impeach\\w*', 'diplomat\\w*', 'sanctions?', 'ceasefire', 'gaza', 'hamas', 'hezbollah', 'israel\\w*', 'palestin\\w*', 'ukrain\\w*', 'kremlin',
  'airstrikes?', 'missiles?', 'bomb\\w*', 'terror\\w*', 'militants?', 'massacre', 'genocide', 'invasion', 'troops', 'war crimes?', 'murder\\w*', 'homicide', 'rape\\w*', 'stabb\\w*', 'shooting', 'kidnap\\w*', 'abduct\\w*', 'assassinat\\w*',
  'killed', 'dead body', 'death toll', 'earthquake', 'protesters?', 'riots?', 'porn\\w*', 'nude', 'onlyfans', 'sex tape', 'affair', 'divorce', 'celebrity', 'bollywood', 'hollywood', 'kardashian', 'royal family', 'horoscope', 'cricket', 'football', 'nba', 'nfl',
].join('|') + ')\\b', 'i');

const TOPICS = {
  crypto:   /\b(bitcoin|btc|ethereum|ether|eth|crypto\w*|blockchain|solana|xrp|ripple|dogecoin|doge|binance|coinbase|stablecoins?|altcoins?|defi|memecoins?|web3|tether|usdt|usdc|cardano|bnb|toncoin|shiba|litecoin|kraken|bitcoin etf|spot etf|halving|airdrop|ledger|metamask|digital assets?)\b/i,
  stocks:   /\b(stocks?|shares|nasdaq|s&p|s&p 500|dow jones|dow|wall street|earnings|ipo|nyse|equit(?:y|ies)|sensex|nifty|ftse|nikkei|federal reserve|the fed|fed rate|rate cut|rate hike|interest rates?|inflation|treasur(?:y|ies)|bond yields?|oil prices?|crude|brent|gold|silver|forex|dollar|etfs?|bull market|bear market|sell-?off|market cap|dividends?|hedge fund|investors?|trading|traders?|commodit(?:y|ies)|recession|gdp|tariffs?)\b/i,
  psx:      /\b(psx|kse-?100|kse|karachi stock|pakistan stock|stock exchange|rupee|pkr|state bank of pakistan|sbp|imf|policy rate|fbr|petrol price|gold rate|dollar rate|open market|interbank)\b/i,
  social:   /\b(facebook|instagram|meta|tiktok|snapchat|twitter|x\.com|threads|linkedin|pinterest|telegram|social media|reels|influencers?|creators?|followers|messenger|bluesky|reddit|discord|social network|content creators?)\b/i,
  whatsapp: /\b(whatsapp|wabetainfo|whatsapp business|whatsapp channels?|whatsapp status)\b/i,
  youtube:  /\b(youtube|youtubers?|yt|shorts|youtube shorts|youtube premium|youtube studio|watch time|subscribers?|channel monetization|youtube partner program|ypp|vidiq|tubebuddy)\b/i,
  adsense:  /\b(adsense|admob|google ads|adwords|ad revenue|ad income|cpm|rpm|cpc|monetiz\w*|ad network|ad manager|ads manager|performance max|pmax|ad policy|ad policies|advertis\w*|affiliate|sponsor\w*|ad blockers?|meta ads|facebook ads|tiktok ads|programmatic|publishers?|mediavine|ezoic|taboola|outbrain)\b/i,
  seo:      /\b(seo|search engines?|google search|core update|spam update|helpful content|serp|search console|ai overviews?|search rankings?|backlinks?|keyword research|google algorithm|bing|chrome|google discover|google analytics|ga4)\b/i,
  amazon:   /\b(amazon|fba|seller central|prime day|kindle|aws|alexa|amazon prime|amazon sellers?|amazon fees|amazon ads|buy box|helium 10|jungle scout|amazon fresh|amazon pay|amazon fba)\b/i,
  dropship: /\b(dropship\w*|aliexpress|alibaba|temu|shein|shopify|e-?commerce|print on demand|tiktok shop|woocommerce|etsy|ebay|daraz|walmart marketplace|private label|fulfil?lment|online sellers?|online store|marketplace|cart abandonment|dtc|direct-to-consumer|cj dropshipping|spocket|zendrop|winning products?|retail sales|shipping rates?|customs duty|de minimis)\b/i,
  ai:       /\b(artificial intelligence|ai|chatgpt|openai|gemini|claude|anthropic|copilot|llm|chatbots?|generative|midjourney|sora|deepseek|grok|perplexity|nvidia|apple|iphone|android|samsung|microsoft|google|app store|play store|cyber ?security|data breach|hack\w*|scam\w*|phishing|startups?|fintech|digital payments?|paypal|stripe|payoneer|wise|easypaisa|jazzcash|raast)\b/i,
};
const UP = /\b(surg\w*|soar\w*|jump\w*|rall(?:y|ies|ied|ying)|climb\w*|rebound\w*|recover\w*|gain\w*|rise[sn]?|rising|rose|spike[sd]?|record high|all-time high|ath|bullish|hits? \$?\d|breaks? \$?\d|tops?|boost\w*|advance[sd]?|higher|upside|breakout)\b/i;
const DOWN = /\b(plung\w*|plummet\w*|crash\w*|tumbl\w*|slump\w*|drop(?:s|ped|ping)?|fall(?:s|en|ing)?|fell|sink\w*|slid(?:e|es|ing)|sell-?off|liquidat\w*|loses|lost|losses|decline[sd]?|dips?|dipped|bearish|slips?|slipped|lower|downturn|rout|wipes? out|bloodbath)\b/i;
const MARKET_TOPICS = ['crypto', 'stocks', 'psx'];

// Returns the annotated article, or null if it must be dropped.
function classify(a) {
  const text = a.title + ' ' + (a.summary || '');
  if (BLOCK.test(text)) return null;
  const hits = new Set();
  for (const [k, re] of Object.entries(TOPICS)) if (re.test(text)) hits.add(k);
  // General publishers (gate) must match at least one of our topics, otherwise the story is off-topic for this app;
  // their categories come ONLY from what the story is about (never from the publisher's default).
  if (a.gate && !hits.size) return null;
  const cats = a.gate ? hits : new Set([...a.categories, ...hits]);
  const up = UP.test(a.title), down = DOWN.test(a.title);
  if (up !== down && MARKET_TOPICS.some(c => cats.has(c))) { cats.add('moves'); a.dir = up ? 'up' : 'down'; }
  a.categories = [...cats];
  return a;
}
module.exports = { classify, BLOCK, TOPICS, MARKET_TOPICS };
