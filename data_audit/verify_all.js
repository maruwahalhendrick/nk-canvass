// Batch verify all 189 UMKM entries against live Google Maps
// v2: aria-label based parsing, rb/jt handling, city mismatch detection, captcha guard, resumable
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const DATA = JSON.parse(fs.readFileSync('/home/marwhal/nk-canvass/data_audit/umkm_data.json', 'utf8'));
const OUT = '/home/marwhal/nk-canvass/data_audit/verify_results.json';
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

// resumable: load existing results
let results = [];
if (fs.existsSync(OUT)) {
  try { results = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { results = []; }
}
const doneIds = new Set(results.filter(r => r.verified || r.cityMismatch || r.noResults).map(r => r.id));

function parseAbbrev(s) {
  // "3,2 rb" -> 3200 ; "1,1 jt" -> 1100000 ; "2.380" -> 2380 ; "2380" -> 2380
  if (!s) return undefined;
  s = s.trim().toLowerCase();
  let mult = 1;
  if (/rb|ribu/.test(s)) mult = 1000;
  else if (/jt|juta/.test(s)) mult = 1000000;
  const num = parseFloat(s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
  if (isNaN(num)) return undefined;
  return Math.round(num * mult);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'id-ID',
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let captchaHit = false;

  const subset = DATA.filter(d => !doneIds.has(d.id));
  console.log(`to verify: ${subset.length} (skipped ${DATA.length - subset.length})`);

  for (const entry of subset) {
    if (captchaHit) break;
    const r = { id: entry.id, name: entry.name, claimed: { rating: entry.rating, reviews: entry.reviews } };
    try {
      await page.goto(entry.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4500);
      const url = page.url();
      r.resolvedUrl = url.slice(0, 120);
      const info = await page.evaluate(() => {
        const out = {};
        const txt = document.body.innerText;
        // captcha detection
        if (/unusual traffic|tidak biasa|bukan robot|not a robot/i.test(txt.slice(0, 4000))) { out.captcha = true; return out; }
        // rating via aria-label "X,X bintang"
        const star = document.querySelector('[role="img"][aria-label*="bintang"]');
        if (star) {
          const al = star.getAttribute('aria-label');
          const m = al.match(/([\d.,]+)\s*bintang/);
          if (m) out.rating = parseFloat(m[1].replace(',', '.'));
          const rm = al.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i);
          if (rm) out.reviewsRaw = rm[1];
        }
        // fallback via text
        if (out.rating === undefined) { const m = txt.match(/([0-5],[0-9])/); if (m) out.rating = parseFloat(m[1].replace(',', '.')); }
        if (out.reviewsRaw === undefined) {
          let m = txt.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i);
          if (!m) m = txt.match(/\(([\d.,]+)\)/);
          if (m) out.reviewsRaw = m[1];
        }
        const addr = txt.split('\n').find(l => /(Jl\.|Jalan\s|Kec\.|Kota Sukabumi|Kabupaten Sukabumi|Cisaat|Cibadak|Cidahu|No\.\s?\d)/.test(l) && l.length > 10);
        if (addr) out.address = addr.trim();
        out.pageTitle = document.title.replace(/ - Google Maps$/, '').trim();
        out.noResults = /tidak dapat menemukan|no results|cocok untuk/i.test(txt.slice(0, 3000)) && !out.rating;
        return out;
      });
      if (info.captcha) { captchaHit = true; r.captcha = true; results.push(r); fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); break; }
      Object.assign(r, info);
      if (r.reviewsRaw) r.reviews = parseAbbrev(r.reviewsRaw);
      delete r.reviewsRaw;
      // city check from address
      if (r.address) {
        const a = r.address.toLowerCase();
        if (a.includes('sukabumi')) r.city = 'Sukabumi';
        else if (a.includes('bandung')) { r.city = 'Bandung'; r.cityMismatch = true; }
        else if (a.includes('bogor')) { r.city = 'Bogor'; r.cityMismatch = true; }
        else if (a.includes('cianjur')) { r.city = 'Cianjur'; r.cityMismatch = true; }
        else if (a.includes('garut')) { r.city = 'Garut'; r.cityMismatch = true; }
        else r.city = 'other/unclear';
      }
      r.verified = r.rating !== undefined && r.reviews !== undefined;
    } catch (e) {
      r.error = e.message.slice(0, 150);
    }
    // remove existing unverified entry for same id, then push
    results = results.filter(x => x.id !== r.id);
    results.push(r);
    results.sort((a, b) => a.id - b.id);
    const done = results.filter(x => x.verified || x.cityMismatch || x.noResults).length;
    if (done % 10 === 0) console.log(`[${done}/${DATA.length}] ${Math.round((Date.now() - t0) / 1000)}s`);
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    await page.waitForTimeout(1200 + Math.random() * 800);
  }

  await browser.close();
  const v = results.filter(r => r.verified).length;
  const cm = results.filter(r => r.cityMismatch).length;
  console.log(`DONE: ${v} verified, ${cm} city-mismatch, ${results.filter(r => r.noResults).length} no-results, ${results.filter(r => r.error).length} errors, captcha=${captchaHit}`);
})();
