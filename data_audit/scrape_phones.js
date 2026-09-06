// Scrape phone numbers from Google Maps panels for all 189 entries
// Resumable. Output: phone_results.json
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset.json', 'utf8'));
const OUT = '/home/marwhal/nk-canvass/data_audit/phone_results.json';
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+62')) p = '0' + p.slice(3);
  else if (p.startsWith('62') && p.length >= 10) p = '0' + p.slice(2);
  if (p.startsWith('0')) {
    const isMobile = /^08[1-9]/.test(p);
    return { raw: String(raw).trim(), phone: p, type: isMobile ? 'mobile' : 'landline' };
  }
  return null;
}

let results = [];
if (fs.existsSync(OUT)) { try { results = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { results = []; } }
const doneIds = new Set(results.filter(r => r.processed).map(r => r.id));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let captchaHit = false;

  const subset = DATA.filter(d => !doneIds.has(d.id));
  console.log(`to process: ${subset.length} (skipped ${DATA.length - subset.length})`);

  for (const entry of subset) {
    if (captchaHit) break;
    const r = { id: entry.id, name: entry.name, processed: false };
    try {
      await page.goto(entry.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4500);
      let info = await page.evaluate(() => {
        const o = {};
        if (/unusual traffic|tidak biasa/i.test(document.body.innerText.slice(0, 3000))) { o.captcha = true; return o; }
        // strategy 1: tel: links
        const tel = document.querySelector('a[href^="tel:"]');
        if (tel) o.phoneRaw = decodeURIComponent(tel.getAttribute('href').replace('tel:', ''));
        // strategy 2: data-item-id phone button
        if (!o.phoneRaw) {
          const btn = document.querySelector('button[data-item-id^="phone"]') || document.querySelector('a[data-item-id^="phone"]');
          if (btn) { const m = (btn.getAttribute('aria-label') || btn.innerText || '').match(/[\d][\d\s\-()+]{6,}/); if (m) o.phoneRaw = m[0]; }
        }
        // strategy 3: text patterns in panel text
        if (!o.phoneRaw) {
          const txt = document.body.innerText;
          const m = txt.match(/(\+62[\d\s\-()]{8,}|0\s?8\d{1,3}[\s\-]?\d{3,4}[\s\-]?\d{3,5}|0\d{2,3}\s?\d{6,8})/);
          if (m) o.phoneRaw = m[0];
        }
        // panel mode confirm + candidate list fallback
        const h1 = document.querySelector('h1');
        const star = document.querySelector('[role="img"][aria-label*="bintang"]');
        o.panel = !!(h1 && star && !/^hasil$/i.test(h1.innerText.trim()));
        if (!o.panel) {
          const feed = document.querySelector('[role="feed"]');
          if (feed) {
            const first = feed.querySelector('a[href*="/maps/place/"]');
            if (first) o.placeHref = first.href;
          }
        }
        return o;
      });
      if (info.captcha) { captchaHit = true; r.captcha = true; break; }
      // if list mode: click the first candidate place link then re-extract
      if (!info.panel && info.placeHref) {
        await page.goto(info.placeHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        info = await page.evaluate(() => {
          const o = {};
          const tel = document.querySelector('a[href^="tel:"]');
          if (tel) o.phoneRaw = decodeURIComponent(tel.getAttribute('href').replace('tel:', ''));
          if (!o.phoneRaw) {
            const btn = document.querySelector('button[data-item-id^="phone"]') || document.querySelector('a[data-item-id^="phone"]');
            if (btn) { const m = (btn.getAttribute('aria-label') || btn.innerText || '').match(/[\d][\d\s\-()+]{6,}/); if (m) o.phoneRaw = m[0]; }
          }
          if (!o.phoneRaw) {
            const txt = document.body.innerText;
            const m = txt.match(/(\+62[\d\s\-()]{8,}|0\s?8\d{1,3}[\s\-]?\d{3,4}[\s\-]?\d{3,5}|0\d{2,3}\s?\d{6,8})/);
            if (m) o.phoneRaw = m[0];
          }
          return o;
        });
        r.viaPlaceClick = true;
      }
      const n = normalizePhone(info.phoneRaw);
      if (n) { r.phone = n.phone; r.phoneType = n.type; r.phoneRaw = n.raw; }
      else r.noPhone = true;
      r.processed = true;
    } catch (e) {
      r.error = e.message.slice(0, 150);
    }
    results = results.filter(x => x.id !== r.id);
    results.push(r);
    results.sort((a, b) => a.id - b.id);
    const done = results.filter(x => x.processed).length;
    if (done % 10 === 0) console.log(`[${done}/${DATA.length}] ${Math.round((Date.now() - t0) / 1000)}s`);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    await page.waitForTimeout(1000 + Math.random() * 700);
  }

  await browser.close();
  const withPhone = results.filter(r => r.phone).length;
  const mobile = results.filter(r => r.phoneType === 'mobile').length;
  console.log(`DONE: ${withPhone}/${results.length} punya nomor (${mobile} mobile/WA-able), ${results.filter(r => r.noPhone).length} tanpa nomor, errors=${results.filter(r => r.error).length}, captcha=${captchaHit}`);
})();
