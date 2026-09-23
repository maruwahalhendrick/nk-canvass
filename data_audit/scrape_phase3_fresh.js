// Phase 3 Fresh Scraper for New Sukabumi Leads
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const CHROME_EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';
const OUT_FILE = '/home/marwhal/nk-canvass/data_audit/phase3_fresh_scraped.json';

// Target search queries to discover new prospects in Sukabumi
const QUERIES = [
  'Kafe Sukabumi',
  'Kedai Kopi Sukabumi',
  'Restoran Baru Sukabumi',
  'Toko Kue Sukabumi',
  'Klinik Perawatan Kulit Sukabumi',
  'Salon Kecantikan Sukabumi',
  'Barbershop Sukabumi',
  'Petshop Sukabumi',
  'Klinik Hewan Sukabumi',
  'Toko Bahan Bangunan Sukabumi',
  'Toko Komputer Sukabumi',
  'Servis HP Sukabumi',
  'Digital Printing Sukabumi',
  'Konveksi Sablon Sukabumi',
  'Laundry Sukabumi',
  'Cuci Sepatu Sukabumi',
  'Bimbel Sukabumi',
  'Toko Sepatu Sukabumi',
  'Toko Pakaian Sukabumi'
];

async function extractListResults(page) {
  return await page.evaluate(() => {
    const items = [];
    const feed = document.querySelector('[role="feed"]');
    if (!feed) return items;

    const cards = feed.querySelectorAll('div[role="article"], a[href*="/maps/place/"]');
    cards.forEach(card => {
      const anchor = card.tagName === 'A' ? card : card.querySelector('a[href*="/maps/place/"]');
      if (!anchor) return;

      const name = (anchor.getAttribute('aria-label') || card.innerText || '').split('\n')[0].trim();
      const mapsUrl = anchor.href;

      if (name && mapsUrl) {
        items.push({ name, mapsUrl });
      }
    });

    return items;
  });
}

(async () => {
  console.log(`Starting Phase 3 Scraper for ${QUERIES.length} target queries...`);
  
  const browser = await chromium.launch({ executablePath: CHROME_EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await context.newPage();

  let allScraped = [];
  if (fs.existsSync(OUT_FILE)) {
    try { allScraped = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch (e) {}
  }

  const existingMap = new Map(allScraped.map(item => [item.mapsUrl, item]));

  for (const q of QUERIES) {
    console.log(`Searching query: "${q}"...`);
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(q)}`;

    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      // Scroll feed to load more results
      const feed = await page.$('[role="feed"]');
      if (feed) {
        for (let i = 0; i < 5; i++) {
          await page.evaluate(f => f.scrollBy(0, 1000), feed);
          await page.waitForTimeout(1500);
        }
      }

      const results = await extractListResults(page);
      console.log(`Found ${results.length} items for "${q}"`);

      results.forEach(res => {
        if (!existingMap.has(res.mapsUrl)) {
          res.query = q;
          existingMap.set(res.mapsUrl, res);
        }
      });

      fs.writeFileSync(OUT_FILE, JSON.stringify(Array.from(existingMap.values()), null, 2));

    } catch (err) {
      console.error(`Error searching "${q}":`, err.message);
    }

    await page.waitForTimeout(2000);
  }

  await browser.close();
  console.log(`Phase 3 Scraper complete. Total unique raw prospects collected: ${existingMap.size}`);
  console.log(`Saved to ${OUT_FILE}`);
})();
