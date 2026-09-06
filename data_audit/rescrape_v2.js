// Re-scrape v2: fresh ratings/reviews + multi-candidate matching for generic queries
// Special custom queries for broken entries. Resumable. Output: verify_results_v2.json
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/umkm_data.json', 'utf8'));
const OUT = '/home/marwhal/nk-canvass/data_audit/verify_results_v2.json';
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

// custom queries for known-broken entries
const CUSTOM_QUERY = {
  1: 'Waroeng Spesial Sambal SS Sukabumi',
  83: 'Apotek Utari Sukabumi',
  108: 'service mesin cuci Sukabumi',
};

const STOP = new Set(['sukabumi', 'kota', 'jalan', 'jl', 'the', 'dan', 'di', 'dan', '&', '-', 'no', 'cabang', 'terdekat', '24', 'jam']);
function tokens(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s&']/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t));
}
function score(query, candName) {
  const q = tokens(query), c = tokens(candName);
  if (!q.length) return 0;
  let hit = 0;
  q.forEach(t => { if (c.some(x => x.includes(t) || t.includes(x))) hit++; });
  return hit / q.length;
}

function parseAbbrev(s) {
  if (!s) return undefined;
  s = String(s).trim().toLowerCase();
  let mult = 1;
  if (/rb|ribu/.test(s)) mult = 1000;
  else if (/jt|juta/.test(s)) mult = 1000000;
  const num = parseFloat(s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? undefined : Math.round(num * mult);
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

  async function scrapeQuery(query) {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    return await page.evaluate(() => {
      const out = {};
      if (/unusual traffic|tidak biasa|bukan robot|not a robot/i.test(document.body.innerText.slice(0, 4000))) { out.captcha = true; return out; }
      const h1 = document.querySelector('h1');
      const star = document.querySelector('[role="img"][aria-label*="bintang"]');
      if (h1 && star && h1.innerText.trim() && !/^hasil$/i.test(h1.innerText.trim())) {
        out.mode = 'panel';
        out.name = h1.innerText.trim();
        const al = star.getAttribute('aria-label');
        const m = al.match(/([\d.,]+)\s*bintang/); if (m) out.rating = parseFloat(m[1].replace(',', '.'));
        const rm = al.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i); if (rm) out.reviewsRaw = rm[1];
        // text fallbacks (v1 parity)
        const txtAll = document.body.innerText;
        if (out.reviewsRaw === undefined) {
          let tm = txtAll.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i);
          if (!tm) tm = txtAll.match(/\(([\d.,]+)\)/);
          if (tm) out.reviewsRaw = tm[1];
        }
        if (out.rating === undefined) { const tm = txtAll.match(/([0-5],[0-9])/); if (tm) out.rating = parseFloat(tm[1].replace(',', '.')); }
        const addr = document.body.innerText.split('\n').find(l => l.length > 12 && /(Jl\.|Jalan\s|Kec\.|No\.\s?\d|Plus Code|^[0-9A-Z]{4}\+[0-9A-Z]{2})/.test(l) && !/ulasan|buka|tutup/i.test(l));
        if (addr) out.address = addr.trim();
        return out;
      }
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        out.mode = 'list';
        out.candidates = [];
        const blocks = feed.querySelectorAll(':scope > div');
        blocks.forEach(b => {
          const t = b.innerText.split('\n').map(s => s.trim()).filter(Boolean);
          if (!t.length) return;
          const ratingMatch = t.find(l => /^[0-5],[0-9]$/.test(l) || /^[0-5],[0-9]\s*\(/.test(l));
          if (!ratingMatch) return;
          const rating = parseFloat(ratingMatch.match(/^([0-5],[0-9])/)[1].replace(',', '.'));
          const rm = ratingMatch.match(/\(([^)]+)\)/) || t.map(l => l.match(/^\(([^)]+)\)$/)).find(Boolean);
          const reviewsRaw = rm ? rm[1] : undefined;
          // name = first line that is not the rating line and not a category-only line heuristic
          const name = t.find(l => l !== ratingMatch && !/^Tempat|Jasa|Toko|Apotek|Kursus|Layanan|Bengkel|Kedai|Klinik|Homestay|Hotel|Villa|Studio|Laundry|Barbershop|Waterpark|Kolam|Camping|Guest/.test(l) === false) || t[0];
          const addr = t.find(l => /(Jl\.|Jalan\s|Kec\.|No\.\s?\d|Gg\.)/.test(l));
          const link = b.querySelector('a[href*="/maps/place/"]');
          out.candidates.push({ name: (name || t[0]).slice(0, 80), rating, reviewsRaw, address: addr || '', href: link ? link.href.slice(0, 100) : '' });
        });
      }
      if (!out.mode) out.mode = 'unknown';
      return out;
    });
  }

  const subset = DATA.filter(d => !doneIds.has(d.id));
  console.log(`to process: ${subset.length} (skipped ${DATA.length - subset.length})`);

  for (const entry of subset) {
    if (captchaHit) break;
    const query = CUSTOM_QUERY[entry.id] || decodeURIComponent(entry.link.split('query=')[1]).replace(/\+/g, ' ');
    const r = { id: entry.id, name: entry.name, claimed: { rating: entry.rating, reviews: entry.reviews }, query, processed: false };
    try {
      const info = await scrapeQuery(query);
      if (info.captcha) { captchaHit = true; r.captcha = true; results.push(r); fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); break; }
      Object.assign(r, info);
      if (r.candidates) r.candidates = r.candidates.slice(0, 6).map(c => ({ ...c, reviews: parseAbbrev(c.reviewsRaw), reviewsRaw: undefined }));
      if (r.reviewsRaw) { r.reviews = parseAbbrev(r.reviewsRaw); delete r.reviewsRaw; }
      if (r.mode === 'list' && r.candidates && r.candidates.length) {
        // pick best candidate by fuzzy match
        let best = null, bestScore = 0;
        for (const c of r.candidates) { const s = score(query, c.name); if (s > bestScore) { bestScore = s; best = c; } }
        if (best) {
          r.picked = { ...best, matchScore: +bestScore.toFixed(2) };
          r.ambiguous = bestScore < 0.5;
        }
      }
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
    await page.waitForTimeout(1200 + Math.random() * 800);
  }

  await browser.close();
  const p = results.filter(r => r.processed).length;
  const modes = results.reduce((a, r) => (a[r.mode || 'none'] = (a[r.mode || 'none'] || 0) + 1, a), {});
  console.log(`DONE: ${p} processed, modes=${JSON.stringify(modes)}, captcha=${captchaHit}, errors=${results.filter(r => r.error).length}`);
})();
