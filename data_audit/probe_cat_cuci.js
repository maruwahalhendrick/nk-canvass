// Mini-probe: verifikasi kategori Maps utk 6 entry ambigu cuci spesialis
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

const NAMES = [
  'karpet sukabumi',
  'Sukabumi Laundry Pusat Sukaraja',
  'Miki Waka Helm, Laundry & Store',
  'Millenium Helm Sukabumi',
  'Rumah Helm Sukabumi (RHS)',
  'TOKO HELM STAR BIKE MART SUKABUMI',
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  for (const name of NAMES) {
    try {
      await page.goto('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      let info = await page.evaluate(() => {
        const o = {};
        const h1 = document.querySelector('h1');
        const star = document.querySelector('[role="img"][aria-label*="bintang"]');
        o.isPanel = !!(h1 && star && !/^hasil$/i.test(h1.innerText.trim()));
        o.h1 = h1 ? h1.innerText.trim() : null;
        if (!o.isPanel) {
          const feed = document.querySelector('[role="feed"]');
          const first = feed && feed.querySelector('a[href*="/maps/place/"]');
          if (first) o.next = first.href;
        }
        return o;
      });
      if (!info.isPanel && info.next) {
        await page.goto(info.next, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3500);
        info = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          const cat = document.querySelector('button[jsaction*="category"]');
          return { h1: h1 ? h1.innerText.trim() : null, cat: cat ? cat.innerText.trim() : null };
        });
      } else if (info.isPanel) {
        info = await page.evaluate(() => {
          const cat = document.querySelector('button[jsaction*="category"]');
          return { h1: document.querySelector('h1')?.innerText.trim(), cat: cat ? cat.innerText.trim() : null };
        });
      }
      console.log(JSON.stringify({ q: name.slice(0, 35), panel: info.h1, cat: info.cat }));
    } catch (e) {
      console.log(JSON.stringify({ q: name.slice(0, 35), err: e.message.slice(0, 80) }));
    }
    await page.waitForTimeout(900 + Math.random() * 500);
  }
  await browser.close();
})();
