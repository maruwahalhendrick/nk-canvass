// Re-scrape nomor telepon untuk 217 entry niche yang phase2 gagal ekstrak.
// Sequential 1-per-1, resumable. Output: phone_rescrape_niche.json
// Strategi proven scrape_phones.js (170/189 dulu) + verifikasi nama panel
// (biar gak ke-contaminasi nomor toko lain/kota lain saat klik kandidat list).
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset_full.json', 'utf8'));
const OUT = '/home/marwhal/nk-canvass/data_audit/phone_rescrape_niche.json';
// nomor yang SUDAH ada: embedded di JSON atau dari phone_results.json (batch lama)
const PHONES = Object.fromEntries(JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/phone_results.json', 'utf8')).filter(r => r.phone).map(r => [r.id, r]));
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

const STOP = new Set(['sukabumi', 'kota', 'jalan', 'jl', 'the', 'dan', 'di', '&', '-', 'no', 'cabang', 'terdekat', '24', 'jam', 'toko', 'service']);
function tokens(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s&']/g, ' ').split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t));
}
function score(query, candName) {
  const q = tokens(query), c = tokens(candName || '');
  if (!q.length || !c.length) return 0;
  let hit = 0;
  q.forEach(t => { if (c.some(x => x.includes(t) || t.includes(x))) hit++; });
  return hit / q.length;
}

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

function extractFn() {
  const o = {};
  if (/unusual traffic|tidak biasa/i.test(document.body.innerText.slice(0, 3000))) { o.captcha = true; return o; }
  const h1 = document.querySelector('h1');
  o.panelName = h1 ? h1.innerText.trim() : null;
  const star = document.querySelector('[role="img"][aria-label*="bintang"], [role="img"][aria-label*="stars"]');
  o.isPanel = !!(h1 && star && !/^hasil$/i.test(h1.innerText.trim()));
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
  if (!o.isPanel) {
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      o.candidates = [...feed.querySelectorAll('a[href*="/maps/place/"]')].slice(0, 5).map(a => ({
        href: a.href,
        name: (a.getAttribute('aria-label') || a.innerText || '').split('\n')[0].slice(0, 80),
      }));
    }
  }
  return o;
}

let results = [];
if (fs.existsSync(OUT)) { try { results = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { results = []; } }
const doneIds = new Set(results.filter(r => r.processed).map(r => r.id));

const TARGET = DATA.filter(e => !e.phone && !PHONES[e.id]).filter(e => (e.mapsUrl || '').includes('/search/'));
console.log(`target: ${TARGET.length} entry tanpa nomor (done: ${doneIds.size})`);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let captchaHit = false;

  const subset = TARGET.filter(e => !doneIds.has(e.id));
  for (const entry of subset) {
    if (captchaHit) break;
    const r = { id: entry.id, name: entry.name, processed: false };
    try {
      await page.goto(entry.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4500);
      let info = await page.evaluate(extractFn);
      if (info.captcha) { captchaHit = true; r.captcha = true; break; }

      // list mode: pilih kandidat paling mirip nama (bukan buta no.1)
      if (!info.isPanel && info.candidates && info.candidates.length) {
        let best = info.candidates[0], bestS = -1;
        info.candidates.forEach(c => { const s = score(entry.name, c.name); if (s > bestS) { bestS = s; best = c; } });
        r.candName = best.name; r.candScore = Math.round(bestS * 100) / 100;
        await page.goto(best.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        info = await page.evaluate(extractFn);
        if (info.captcha) { captchaHit = true; r.captcha = true; break; }
        r.viaPlaceClick = true;
      }

      r.panelName = info.panelName || null;
      r.nameScore = Math.round(score(entry.name, info.panelName) * 100) / 100;
      const n = normalizePhone(info.phoneRaw);
      if (n) { r.phone = n.phone; r.phoneType = n.type; r.phoneRaw = n.raw; }
      else r.noPhone = true;
      r.processed = true;
    } catch (e) {
      r.error = e.message.slice(0, 120);
    }
    results = results.filter(x => x.id !== r.id);
    results.push(r);
    results.sort((a, b) => a.id - b.id);
    const done = results.filter(x => x.processed).length;
    if (done % 10 === 0) console.log(`[${done}/${TARGET.length}] ${Math.round((Date.now() - t0) / 1000)}s phone:${results.filter(x => x.phone).length}`);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    await page.waitForTimeout(1000 + Math.random() * 700);
  }

  await browser.close();
  const withPhone = results.filter(r => r.phone).length;
  console.log(`DONE: ${withPhone}/${results.length} punya nomor (${results.filter(r => r.phoneType === 'mobile').length} mobile), noPhone=${results.filter(r => r.noPhone).length}, err=${results.filter(r => r.error).length}, captcha=${captchaHit}`);
})();
