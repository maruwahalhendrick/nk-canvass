// Smoke test the refactored app
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  await page.goto('file:///home/marwhal/nk-canvass/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const res = await page.evaluate(() => {
    const cards = document.querySelectorAll('#leadsContainer > *').length;
    const dataCount = document.getElementById('dataCount')?.innerText || '';
    // count zone texts across cards
    const zones = {};
    document.querySelectorAll('#leadsContainer [class*="text-[#a8ccb6]"]').forEach(el => {
      const t = el.textContent.trim();
      if (/^Zona \d/.test(t)) zones[t] = (zones[t] || 0) + 1;
    });
    return { cards, dataCount, zones };
  });
  console.log('cards rendered:', res.cards);
  console.log('dataCount:', res.dataCount);
  console.log('zones in UI:', JSON.stringify(res.zones));
  console.log('JS errors:', errors.length ? errors : 'NONE');

  // check replaced entries + fresh data via exported globals
  const checks = await page.evaluate(() => {
    const out = {};
    out.dataLen = window.UMKM_DATA.length;
    const nako = window.UMKM_DATA.find(d => /Kopi Nako/.test(d.name));
    out.nako = nako && nako.rating + '/' + nako.reviews + '/' + nako.zone;
    const agss = window.UMKM_DATA[0];
    out.first = agss.name + ' ' + agss.rating + '/' + agss.reviews;
    const apotek = window.UMKM_DATA.find(d => /AFIAT/.test(d.name));
    out.apotek = apotek ? apotek.rating + '/' + apotek.reviews : 'NOT FOUND';
    // strategy mismatch check
    out.strategyMismatch = window.UMKM_DATA.filter(d => d.strategy === 'HIGH_LOW_REV' && d.rating !== 5.0).length;
    // null guard: any rating/review non-number?
    out.badNumbers = window.UMKM_DATA.filter(d => typeof d.rating !== 'number' || typeof d.reviews !== 'number').length;
    // zone fallback count (data zone empty)
    out.emptyZone = window.UMKM_DATA.filter(d => !d.zone).length;
    return out;
  });
  console.log('data checks:', JSON.stringify(checks, null, 2));

  // zone filter interaction test
  const zoneBtn = await page.$('button[data-zone="Zona 6 (Ekspedisi Wisata)"]');
  if (zoneBtn) { await zoneBtn.click(); await page.waitForTimeout(800); }
  const afterFilter = await page.evaluate(() => document.querySelectorAll('#leadsContainer > *').length);
  console.log('cards after Zona 6 filter:', afterFilter, '(expect 18)');

  await browser.close();
})();
