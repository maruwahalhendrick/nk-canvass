// Probe Google Maps categories for "Pet & Hewan" leads
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const jsContent = fs.readFileSync('/home/marwhal/nk-canvass/js/data.js', 'utf8');
const tempWindow = { UMKM_DATA: [] };
eval(`(function(window){${jsContent}})(tempWindow)`);
const DATA = tempWindow.UMKM_DATA;
const OUT_FILE = '/home/marwhal/nk-canvass/data_audit/petshop_maps_categories.json';
const CHROME_EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

const TARGET_CATEGORY = 'Pet & Hewan';

const petLeads = DATA.filter(e => e.category === TARGET_CATEGORY);

console.log(`Probing ${petLeads.length} leads in category "${TARGET_CATEGORY}"...`);

async function extractCategory(page) {
  // Check for captcha
  const bodyText = await page.innerText('body').catch(() => '');
  if (/unusual traffic|tidak biasa/i.test(bodyText.slice(0, 3000))) {
    return { captcha: true };
  }

  const h1 = await page.$('h1');
  const panelName = h1 ? await h1.innerText() : null;

  const categoryButton = await page.$('button[jsaction*="category"]');
  const categoryLabel = categoryButton ? await categoryButton.innerText() : null;

  return { panelName, categoryLabel };
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
      console.warn('Could not parse existing results file, starting fresh.');
      results = [];
    }
  }

  const processedIds = new Set(results.map(r => r.id));

  for (const lead of petLeads) {
    if (processedIds.has(lead.name)) {
      // console.log(`Skipping already processed: ${lead.name}`);
      continue;
    }

    const result = { id: lead.name, originalCategory: lead.category, mapsUrl: lead.mapsUrl, newCategory: null, error: null };
    try {
      console.log(`Navigating to ${lead.name} (${lead.mapsUrl})`);
      await page.goto(lead.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000 + Math.random() * 2000); // Wait a bit for dynamic content

      let info = await extractCategory(page);

      if (info.captcha) {
        result.error = 'Captcha detected, stopping.';
        console.error('Captcha detected. Please run again later or manually verify.');
        results.push(result);
        fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
        break; // Stop on captcha
      }

      if (info.categoryLabel) {
        result.newCategory = info.categoryLabel;
      } else {
        // If no direct category button, it might be a search results page, try clicking first result
        const firstPlaceLink = await page.$('a[href*="/maps/place/"]');
        if (firstPlaceLink) {
          const href = await firstPlaceLink.getAttribute('href');
          console.log(`Clicking first result link: ${href}`);
          await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(4000 + Math.random() * 2000);
          info = await extractCategory(page);
          if (info.captcha) {
            result.error = 'Captcha detected after click, stopping.';
            results.push(result);
            fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
            break; // Stop on captcha
          }
          result.newCategory = info.categoryLabel;
        } else {
          result.error = 'No category button found and no place link to click.';
        }
      }
    } catch (e) {
      result.error = e.message.slice(0, 150);
    }
    results.push(result);
    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Processed: ${lead.name} -> ${result.newCategory || result.error}`);
    await page.waitForTimeout(1000 + Math.random() * 700); // Be gentle
  }

  await browser.close();
  console.log('Finished probing Pet & Hewan categories.');
  console.log(`Results saved to: ${OUT_FILE}`);
})().catch(e => {
  console.error('An error occurred during probing:', e);
});
