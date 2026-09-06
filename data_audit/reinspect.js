// Re-inspect suspicious entries: capture resolved URL (has place id + coords), full info panel
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

const TARGETS = [
  { id: 1,  q: 'Waroeng+Spesial+Sambal+SS+Bandung+JL+Sukabumi' },
  { id: 21, q: 'Catering+Murah+Sukabumi' },
  { id: 37, q: 'Pixel+Barbershop+Cipanengah+Sukabumi' },
  { id: 87, q: 'Kimia+Farma+Sukabumi' },
  { id: 107, q: 'SERVICE+KULKAS+SUKABUMI' },
  { id: 108, q: 'Service+mesin+cuci+Sukabumi' },
  { id: 119, q: 'Servis+elektronik+sukabumi' },
  { id: 143, q: 'Kelana+Oleh-oleh+Sukabumi' },
  { id: 165, q: 'Khei+Wedding+Organizer+Sukabumi' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  for (const t of TARGETS) {
    try {
      await page.goto(`https://www.google.com/maps/search/?api=1&query=${t.q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      const info = await page.evaluate(() => {
        const txt = document.body.innerText;
        const out = {};
        const star = document.querySelector('[role="img"][aria-label*="bintang"]');
        if (star) out.aria = star.getAttribute('aria-label');
        const h1 = document.querySelector('h1'); if (h1) out.h1 = h1.innerText.trim();
        out.title = document.title.replace(/ - Google Maps$/, '');
        return out;
      });
      console.log(`#${t.id} [${t.q}]`);
      console.log('   nama resmi:', info.h1 || info.title, '| aria:', info.aria || '-');
      await page.waitForTimeout(1000);
    } catch (e) { console.log(`#${t.id} ERROR ${e.message.slice(0, 80)}`); }
  }
  await browser.close();
})();
