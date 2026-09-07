// Phase 1: scrape Maps niche HOBI & KOLEKSI (diecast, model kit, RC, TCG, lego, board game)
// Output: hobi_candidates.json
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';
const OUT = '/home/marwhal/nk-canvass/data_audit/hobi_candidates.json';

const PLAN = [
  { category: 'Hobi & Koleksi', queries: [
    'toko diecast sukabumi',
    'toko mainan sukabumi',
    'toko gundam model kit sukabumi',
    'toko rc mobil sukabumi',
    'toko kartu pokemon yugioh sukabumi',
    'toko lego sukabumi',
    'board game cafe sukabumi',
    'toko alat sulap sukabumi',
  ]},
];

function parseAbbrev(s) {
  if (!s) return undefined;
  s = String(s).trim().toLowerCase();
  let mult = 1;
  if (/rb|ribu/.test(s)) mult = 1000;
  else if (/jt|juta/.test(s)) mult = 1000000;
  const num = parseFloat(s.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? undefined : Math.round(num * mult);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  const all = [];
  let captchaHit = false;
  const t0 = Date.now();

  for (const group of PLAN) {
    if (captchaHit) break;
    for (const q of group.queries) {
      if (captchaHit) break;
      try {
        await page.goto(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        const data = await page.evaluate(() => {
          const o = { query: '' };
          if (/unusual traffic|tidak biasa/i.test(document.body.innerText.slice(0, 3000))) { o.captcha = true; return o; }
          const h1 = document.querySelector('h1');
          const star = document.querySelector('[role="img"][aria-label*="bintang"]');
          if (h1 && star && !/^hasil$/i.test(h1.innerText.trim())) { o.mode = 'panel'; return o; }
          const feed = document.querySelector('[role="feed"]');
          if (!feed) { o.mode = 'none'; return o; }
          o.mode = 'list'; o.candidates = [];
          feed.querySelectorAll(':scope > div').forEach(b => {
            const t = b.innerText.split('\n').map(s => s.trim()).filter(Boolean);
            const rm = t.find(l => /^[0-5],[0-9]/.test(l));
            if (!rm) return;
            const ri = t.indexOf(rm);
            const name = t.slice(0, ri).reverse().find(l => !/^(Tempat|Jasa|Toko|Kedai|Layanan|Kantor|Cabang|Dealer|Kafe|Cafe)/.test(l) && l.length > 2) || t[0];
            const addr = (t.find(l => /(Jl\.|Jalan\s|Kec\.|Gg\.|No\.\s?\d)/.test(l)) || '').slice(0, 90);
            const link = b.querySelector('a[href*="/maps/place/"]');
            o.candidates.push({ name: name.slice(0, 90), rating: parseFloat(rm.match(/^([0-5],[0-9])/)[1].replace(',', '.')), reviewsRaw: (rm.match(/\(([^)]+)\)/) || [])[1] || '', address: addr, href: link ? link.href : '' });
          });
          return o;
        });
        if (data.captcha) { captchaHit = true; break; }
        data.query = q;
        data.category = group.category;
        if (data.candidates) data.candidates = data.candidates.slice(0, 14).map(c => ({ ...c, reviews: parseAbbrev(c.reviewsRaw), reviewsRaw: undefined, href: c.href.slice(0, 160) }));
        all.push(data);
        const n = (data.candidates || []).length;
        console.log(`"${q}" -> ${data.mode}${n ? ' (' + n + ')' : ''}`);
      } catch (e) {
        console.log(`"${q}" ERROR ${e.message.slice(0, 100)}`);
        all.push({ query: q, category: group.category, mode: 'error', error: e.message.slice(0, 100) });
      }
      fs.writeFileSync(OUT, JSON.stringify(all, null, 2));
      await page.waitForTimeout(1200 + Math.random() * 700);
    }
  }

  await browser.close();
  const total = all.reduce((s, d) => s + (d.candidates ? d.candidates.length : 0), 0);
  console.log(`DONE: ${all.length} queries, ${total} raw candidates, captcha=${captchaHit}, ${Math.round((Date.now() - t0) / 1000)}s`);
})();
