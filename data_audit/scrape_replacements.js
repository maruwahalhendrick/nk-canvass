// Scrape 3 replacement entries + 2 manual re-checks
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

const QUERIES = [
  { id: 1, q: 'Ayam Goreng SS Super Sambal Sukabumi' },
  { id: 83, q: 'Apotek Afiat Farma Sukabumi' },
  { id: 108, q: 'servis mesin cuci sukabumi', list: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  const out = [];
  for (const t of QUERIES) {
    await page.goto(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5500);
    const info = await page.evaluate(() => {
      const o = {};
      if (/unusual traffic|tidak biasa/i.test(document.body.innerText.slice(0, 3000))) { o.captcha = true; return o; }
      const h1 = document.querySelector('h1');
      const star = document.querySelector('[role="img"][aria-label*="bintang"]');
      if (h1 && star && !/^hasil$/i.test(h1.innerText.trim())) {
        o.mode = 'panel';
        o.name = h1.innerText.trim();
        const al = star.getAttribute('aria-label');
        const m = al.match(/([\d.,]+)\s*bintang/); if (m) o.rating = parseFloat(m[1].replace(',', '.'));
        const rm = al.match(/([\d.,]+\s*(?:rb|ribu|jt|juta)?)\s*(?:ulasan|review)/i); if (rm) o.reviewsRaw = rm[1];
        const txt = document.body.innerText;
        if (o.reviewsRaw === undefined) { let tm = txt.match(/([\d.,]+)\s*ulasan/i) || txt.match(/\(([\d.,]+)\)/); if (tm) o.reviewsRaw = tm[1]; }
        const addr = txt.split('\n').find(l => l.length > 12 && /(Jl\.|Jalan\s|Kec\.|No\.\s?\d|Gg\.)/.test(l) && !/ulasan|buka|tutup/i.test(l));
        if (addr) o.address = addr.trim();
        return o;
      }
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        o.mode = 'list'; o.candidates = [];
        feed.querySelectorAll(':scope > div').forEach(b => {
          const t = b.innerText.split('\n').map(s => s.trim()).filter(Boolean);
          const rm = t.find(l => /^[0-5],[0-9]/.test(l));
          if (!rm) return;
          const link = b.querySelector('a[href*="/maps/place/"]');
          // name = first line before rating line that isn't a category word
          const ri = t.indexOf(rm);
          const nameCand = t.slice(0, ri).reverse().find(l => !/^(Tempat|Jasa|Toko|Apotek|Bengkel|Kedai|Layanan|Klinik|Restoran|Pemasok)/.test(l) && l.length > 3) || t[0];
          o.candidates.push({ name: nameCand.slice(0, 80), ratingLine: rm, addr: (t.find(l => /(Jl\.|Kec\.|Gg\.|No\.\s?\d)/.test(l)) || '').slice(0, 80), href: link ? link.href.slice(0, 100) : '' });
        });
      }
      return o;
    });
    console.log('=== #' + t.id, t.q, '->', info.mode || (info.captcha ? 'CAPTCHA' : 'none'));
    if (info.mode === 'panel') console.log('   ', info.name, '|', info.rating, '/', info.reviewsRaw, '|', info.address);
    if (info.candidates) info.candidates.slice(0, 8).forEach(c => console.log('    CAND:', c.name, '|', c.ratingLine, '|', c.addr));
    out.push({ id: t.id, q: t.q, ...info });
    await page.waitForTimeout(1500);
  }
  require('fs').writeFileSync('/home/marwhal/nk-canvass/data_audit/replacements_raw.json', JSON.stringify(out, null, 2));
  await browser.close();
})();
