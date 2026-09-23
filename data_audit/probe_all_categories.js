// Probe official Google Maps categories for ALL leads
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const jsContent = fs.readFileSync('/home/marwhal/nk-canvass/js/data.js', 'utf8');
const tempWindow = { UMKM_DATA: [] };
eval(`(function(window){${jsContent}})(tempWindow)`);
const DATA = tempWindow.UMKM_DATA;

const OUT_FILE = '/home/marwhal/nk-canvass/data_audit/all_maps_categories.json';
const CHROME_EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

// Categories we ALREADY precisely mapped in the previous step (pet shop sub-cats)
const PRECISE_PET_CATS = new Set([
  'Toko Hewan Peliharaan', 'Toko Akuarium', 'Dokter Hewan', 'Toko Pakan Hewan', 
  'Toko Burung', 'Toko Perlengkapan Hewan Peliharaan', 'Toko Ikan', 
  'Toko Ikan Tropis', 'Perawatan Hewan', 'Salon Hewan Peliharaan', 'Pasar'
]);

// Target entries that haven't been mapped precisely yet
const TARGETS = DATA.filter(e => !PRECISE_PET_CATS.has(e.category));

console.log(`Master Database: ${DATA.length} entries.`);
console.log(`Remaining targets to probe: ${TARGETS.length} entries.`);

async function extractCategory(page) {
  const bodyText = await page.innerText('body').catch(() => '');
  if (/unusual traffic|tidak biasa/i.test(bodyText.slice(0, 3000))) {
    return { captcha: true };
  }
  const h1 = await page.$('h1');
  const categoryButton = await page.$('button[jsaction*="category"]');
  const categoryLabel = categoryButton ? await categoryButton.innerText() : null;
  return { categoryLabel };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await context.newPage();

  let results = [];
  if (fs.existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch (e) {
      results = [];
    }
  }

  const doneNames = new Set(results.map(r => r.name));
  const todo = TARGETS.filter(e => !doneNames.has(e.name));

  console.log(`Start probing ${todo.length} new entries...`);

  let count = 0;
  for (const lead of todo) {
    const res = { name: lead.name, originalCategory: lead.category, mapsUrl: lead.mapsUrl, newCategory: null, error: null };
    try {
      await page.goto(lead.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500 + Math.random() * 1500);

      let info = await extractCategory(page);
      if (info.captcha) {
        console.error('CAPTCHA DETECTED. Stopping.');
        break;
      }

      if (info.categoryLabel) {
        res.newCategory = info.categoryLabel;
      } else {
        // Search results logic
        const firstLink = await page.$('a[href*="/maps/place/"]');
        if (firstLink) {
          const href = await firstLink.getAttribute('href');
          await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(3500 + Math.random() * 1500);
          info = await extractCategory(page);
          if (info.captcha) break;
          res.newCategory = info.categoryLabel;
        } else {
          res.error = 'Category button/link not found';
        }
      }
    } catch (e) {
      res.error = e.message.slice(0, 100);
    }
    results.push(res);
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    count++;
    if (count % 10 === 0) console.log(`Progress: ${count}/${todo.length} done.`);
    await page.waitForTimeout(1000 + Math.random() * 500);
  }

  await browser.close();
  console.log(`Done. Total probed this session: ${count}. Results in ${OUT_FILE}`);
})();
