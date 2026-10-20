// Runs the full app on http://localhost:3100 with FAKE publishers + FAKE market data (no internet needed). For UI preview only.
const { createApp } = require('../server'); const fx = require('../test/fixtures');
const app = createApp({ sources: fx.SOURCES, fetch: fx.fakeFetch, cacheFile: null, quiet: true });
app.start(+process.env.PORT || 3100).then(() => console.log('DEMO (fake data) on http://localhost:' + (+process.env.PORT || 3100)));
