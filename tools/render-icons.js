// Renders public/logo.svg into PNG icons with Playwright's bundled Chromium. Usage: node tools/render-icons.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const pub = path.join(__dirname, '..', 'public'); const svg = fs.readFileSync(path.join(pub, 'logo.svg'), 'utf8');
const page = (size, inner, pad) => `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${pad ? '#0A1226' : 'transparent'}"><div style="width:${size * (pad ? 0.72 : 1)}px;height:${size * (pad ? 0.72 : 1)}px">${inner}</div></div></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const jobs = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, true], ['icon-maskable-512.png', 512, true]];
  for (const [file, size, pad] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size, svg.replace('<svg ', '<svg width="100%" height="100%" '), pad));
    await p.screenshot({ path: path.join(pub, file), omitBackground: !pad }); await p.close();
  }
  await b.close(); console.log('icons ok');
})();
