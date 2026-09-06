// Phase 2 (Gaming): dedupe candidates vs 358 lama + internal, lalu visit each unique place
// for full details (rating, reviews, phone, address, city check)
// Output: gaming_final.json
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';
const CANDS = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/gaming_candidates.json', 'utf8'));
const OUT = '/home/marwhal/nk-canvass/data_audit/gaming_final.json';
const OLD = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/final_dataset_full.json', 'utf8'));

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['sukabumi', 'kota', 'the', 'dan', 'di', 'no', 'cabang', 'terdekat', '24', 'jam', 'toko', 'service', 'servis', 'jasa', 'rental', 'game', 'games', 'ps', 'playstation']);
function tokens(s) { return norm(s).split(' ').filter(t => t && t.length >= 2 && !STOP.has(t)); }
function sim(a, b) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let hit = 0; ta.forEach(t => { if (tb.some(x => x.includes(t) || t.includes(x))) hit++; });
  return hit / Math.max(ta.length, tb.length);
}

// ---- dedupe ----
const oldNames = OLD.map(o => o.name);
const seen = [];
const uniques = [];
const dupLog = [];
for (const group of CANDS) {
  if (!group.candidates) continue;
  for (const c of group.candidates) {
    if (!c.name || !c.rating) continue;
    const vsOld = oldNames.find(o => sim(o, c.name) >= 0.75);
    if (vsOld) { dupLog.push(`OLD-DUP: "${c.name}" ~ "${vsOld}"`); continue; }
    const dupe = seen.find(s => sim(s, c.name) >= 0.75);
    if (dupe) { dupLog.push(`INT-DUP: "${c.name}" ~ "${dupe}"`); continue; }
    seen.push(c.name);
    uniques.push({ ...c, category: group.category, queries: [group.query] });
  }
}
for (const u of uniques) {
  for (const group of CANDS) {
    if (!group.candidates) continue;
    if (group.candidates.some(c => norm(c.name) === norm(u.name)) && !u.queries.includes(group.query)) u.queries.push(group.query);
  }
}
console.log(`unique new places: ${uniques.length} (dupes dropped: ${dupLog.length})`);
dupLog.forEach(d => console.log('  ' + d));

function parseAbbrev(s) {
  if (!s) return undefined;
  s = String(s).trim().toLowerCase();
  let mult = 1;
  if (/rb|ribu/.test(s)) mult = 1000;
  else if (/jt|juta/.test(s)) mult = 1000000;
  const num = parseFloat(s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? undefined : Math.round(num * mult);
}
function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\\d+]/g, '');
  if (p.startsWith('+62')) p = '0' + p.slice(3);
  else if (p.startsWith('62') && p.length >= 10) p = '0' + p.slice(2);
  if (p.startsWith('0')) return { phone: p, type: /^08[1-9]/.test(p) ? 'mobile' : 'landline' };
  return null;
}

let results = [];
if (fs.existsSync(OUT)) { try { results = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {} }
const doneNames = new Set(results.map(r => r.name));

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let captchaHit = false;

  for (const u of uniques) {
    if (captchaHit) break;
    if (doneNames.has(u.name)) continue;
    const r = { name: u.name, category: u.category, queries: u.queries, listedRating: u.rating, listedReviews: u.reviews, listedAddress: u.address };
    try {
      const q = /sukabumi/i.test(u.name) ? u.name : u.name + ' sukabumi';
      await page.goto(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4500);
      let info = await page.evaluate(() => {
        const o = {};
        if (/unusual traffic|tidak biasa/i.test(document.body.innerText.slice(0, 3000))) { o.captcha = true; return o; }
        const h1 = document.querySelector('h1');
        const star = document.querySelector('[role="img"][aria-label*="bintang"]');
        const txt = document.body.innerText;
        if (h1 && star && !/^hasil$/i.test(h1.innerText.trim())) {
          o.mode = 'panel'; o.name = h1.innerText.trim();
          const al = star.getAttribute('aria-label');
          const m = al.match(/([\d.,]+)\s*bintang/); if (m) o.rating = parseFloat(m[1].replace(',', '.'));
          const rm = al.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i); if (rm) o.reviewsRaw = rm[1];
          if (o.reviewsRaw === undefined) { let tm = txt.match(/([\d.,]+)\s*ulasan/i) || txt.match(/\(([\d.,]+)\)/); if (tm) o.reviewsRaw = tm[1]; }
          const tel = document.querySelector('a[href^="tel:"]');
          if (tel) o.phoneRaw = decodeURIComponent(tel.getAttribute('href').replace('tel:', ''));
          if (!o.phoneRaw) {
            const btn = document.querySelector('button[data-item-id^="phone"]') || document.querySelector('a[data-item-id^="phone"]');
            if (btn) { const pm = (btn.getAttribute('aria-label') || btn.innerText || '').match(/[\d][\d\s\-()+]{6,}/); if (pm) o.phoneRaw = pm[0]; }
          }
          if (!o.phoneRaw) { const pm = txt.match(/(\+62[\d\s\-()]{8,}|0\s?8\d{1,3}[\s\-]?\d{3,4}[\s\-]?\d{3,5}|0\d{2,3}\s?\d{6,8})/); if (pm) o.phoneRaw = pm[0]; }
          const addr = txt.split('\n').find(l => l.length > 12 && /(Jl\.|Jalan\s|Kec\.|No\.\s?\d|Gg\.)/.test(l) && !/ulasan|buka|tutup/i.test(l));
          if (addr) o.address = addr.trim();
          return o;
        }
        o.mode = 'list';
        const feed = document.querySelector('[role="feed"]');
        if (feed) {
          const blocks = [...feed.querySelectorAll(':scope > div')];
          for (const b of blocks) {
            const t = b.innerText.split('\n').map(s => s.trim()).filter(Boolean);
            const rm = t.find(l => /^[0-5],[0-9]/.test(l));
            if (!rm) continue;
            const ri = t.indexOf(rm);
            const name = t.slice(0, ri).reverse().find(l => !/^(Tempat|Jasa|Toko|Bengkel|Kedai|Layanan|Kantor|Dealer|Cabang|Rental)/.test(l) && l.length > 2) || t[0];
            o.name = name.slice(0, 90);
            o.rating = parseFloat(rm.match(/^([0-5],[0-9])/)[1].replace(',', '.'));
            o.reviewsRaw = (rm.match(/\(([^)]+)\)/) || [])[1] || '';
            const addr = (t.find(l => /(Jl\.|Kec\.|Gg\.|No\.\s?\d)/.test(l)) || '');
            if (addr) o.address = addr.slice(0, 90);
            const link = b.querySelector('a[href*="/maps/place/"]');
            if (link) o.href = link.href;
            break;
          }
        }
        return o;
      });
      if (info.captcha) { captchaHit = true; break; }
      if (info.mode === 'list' && info.href) {
        await page.goto(info.href.slice(0, 300), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        const detail = await page.evaluate(() => {
          const o = {};
          const h1 = document.querySelector('h1');
          const star = document.querySelector('[role="img"][aria-label*="bintang"]');
          if (h1) o.name = h1.innerText.trim();
          if (star) { const m = star.getAttribute('aria-label').match(/([\d.,]+)\s*bintang/); if (m) o.rating = parseFloat(m[1].replace(',', '.')); const rm = star.getAttribute('aria-label').match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i); if (rm) o.reviewsRaw = rm[1]; }
          const txt = document.body.innerText;
          const tel = document.querySelector('a[href^="tel:"]');
          if (tel) o.phoneRaw = decodeURIComponent(tel.getAttribute('href').replace('tel:', ''));
          if (!o.phoneRaw) { const btn = document.querySelector('button[data-item-id^="phone"]') || document.querySelector('a[data-item-id^="phone"]'); if (btn) { const pm = (btn.getAttribute('aria-label') || btn.innerText || '').match(/[\d][\d\s\-()+]{6,}/); if (pm) o.phoneRaw = pm[0]; } }
          if (!o.phoneRaw) { const pm = txt.match(/(\+62[\d\s\-()]{8,}|0\s?8\d{1,3}[\s\-]?\d{3,4}[\s\-]?\d{3,5}|0\d{2,3}\s?\d{6,8})/); if (pm) o.phoneRaw = pm[0]; }
          const addr = txt.split('\n').find(l => l.length > 12 && /(Jl\.|Jalan\s|Kec\.|No\.\s?\d|Gg\.)/.test(l) && !/ulasan|buka|tutup/i.test(l));
          if (addr) o.address = addr.trim();
          return o;
        });
        Object.assign(info, detail, { mode: 'panel-via-click' });
      }
      Object.assign(r, info);
      if (r.reviewsRaw) { r.reviews = parseAbbrev(r.reviewsRaw); delete r.reviewsRaw; }
      const n = normalizePhone(r.phoneRaw); delete r.phoneRaw;
      if (n) { r.phone = n.phone; r.phoneType = n.type; }
      const a = (r.address || '').toLowerCase();
      r.city = /kota sukabumi|kabupaten sukabumi|kec\.?\s+\w+, kota sukabumi/.test(a) ? 'Sukabumi' : (/sukabumi/.test(a) ? 'Sukabumi?' : (a ? 'BUKAN-SUKABUMI' : 'unknown'));
    } catch (e) {
      r.error = e.message.slice(0, 150);
    }
    results.push(r);
    const done = results.length;
    if (done % 5 === 0) console.log(`[${done}/${uniques.length}] ${Math.round((Date.now() - t0) / 1000)}s`);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    await page.waitForTimeout(1100 + Math.random() * 700);
  }

  await browser.close();
  const ok = results.filter(r => r.rating !== undefined).length;
  const phone = results.filter(r => r.phone).length;
  const wrongCity = results.filter(r => r.city === 'BUKAN-SUKABUMI').length;
  console.log(`DONE: ${results.length}/${uniques.length} processed, ${ok} with data, ${phone} with phone, ${wrongCity} non-Sukabumi, captcha=${captchaHit}`);
})();
