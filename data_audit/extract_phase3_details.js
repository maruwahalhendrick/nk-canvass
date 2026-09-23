// Phase 3 Detail Extractor & Deduplicator
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const fs = require('fs');

const CHROME_EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';
const RAW_FILE = '/home/marwhal/nk-canvass/data_audit/phase3_fresh_scraped.json';
const FINAL_OUT = '/home/marwhal/nk-canvass/data_audit/phase3_processed_leads.json';

const jsContent = fs.readFileSync('/home/marwhal/nk-canvass/js/data.js', 'utf8');
const tempWindow = { UMKM_DATA: [] };
eval(`(function(window){${jsContent}})(tempWindow)`);
const existingData = tempWindow.UMKM_DATA;

const existingNames = new Set(existingData.map(e => e.name.toLowerCase().trim()));

function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, '');
  if (p.startsWith('+62')) p = '0' + p.slice(3);
  else if (p.startsWith('62') && p.length >= 10) p = '0' + p.slice(2);
  if (p.startsWith('0')) {
    const isMobile = /^08[1-9]/.test(p);
    return { raw: String(raw).trim(), phone: p, type: isMobile ? 'mobile' : 'landline' };
  }
  return null;
}

function getZone(name, address) {
  const text = (name + ' ' + address).toLowerCase();
  if (/baros|cipanengah|jalur|pelabuhan ii|nyomplong|citamiang/.test(text)) return "Zona 1 (Baros/Jalur)";
  if (/cisaat|cibadak|cibolang/.test(text)) return "Zona 2 (Cisaat/Cibadak)";
  if (/sudirman|bhayangkara|sriwidari|karamat|gunungpuyuh/.test(text)) return "Zona 3 (Pusat Selatan)";
  if (/ciaul|martadinata|ahmad yani|nako|yume|cikole|kebonjati|gudang/.test(text)) return "Zona 4 (Jantung Kota)";
  if (/kosasih|cibeureum|selabintana|subangjaya|ciandam/.test(text)) return "Zona 5 (Timur/Utara)";
  if (/cidahu|situgunung|tanakita|santasea|batutapak|sukaraja/.test(text)) return "Zona 6 (Ekspedisi Wisata)";
  return "Zona 4 (Jantung Kota)";
}

async function extractDetails(page) {
  const o = {};
  const bodyText = await page.innerText('body').catch(() => '');
  if (/unusual traffic|tidak biasa/i.test(bodyText.slice(0, 3000))) {
    o.captcha = true;
    return o;
  }

  const h1 = await page.$('h1');
  o.panelName = h1 ? await h1.innerText() : null;

  const star = await page.$('[role="img"][aria-label*="bintang"], [role="img"][aria-label*="stars"]');
  if (star) {
    const aria = await star.getAttribute('aria-label');
    const m = aria.match(/([\d,\.]+)/);
    if (m) o.rating = parseFloat(m[1].replace(',', '.'));
  }

  const revEl = await page.$('[role="img"][aria-label*="ulasan"], [role="img"][aria-label*="reviews"]');
  if (revEl) {
    const aria = await revEl.getAttribute('aria-label');
    const m = aria.replace(/\./g, '').match(/([\d]+)/);
    if (m) o.reviews = parseInt(m[1], 10);
  }

  const catBtn = await page.$('button[jsaction*="category"]');
  if (catBtn) o.category = await catBtn.innerText();

  const addrBtn = await page.$('button[data-item-id="address"]');
  if (addrBtn) o.address = await addrBtn.getAttribute('aria-label') || await addrBtn.innerText();

  const tel = await page.$('a[href^="tel:"]');
  if (tel) {
    o.phoneRaw = decodeURIComponent((await tel.getAttribute('href')).replace('tel:', ''));
  } else {
    const phoneBtn = await page.$('button[data-item-id^="phone"]');
    if (phoneBtn) o.phoneRaw = await phoneBtn.getAttribute('aria-label') || await phoneBtn.innerText();
  }

  return o;
}

(async () => {
  const rawList = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
  // Filter out already existing names
  const newLeads = rawList.filter(item => !existingNames.has(item.name.toLowerCase().trim()));
  console.log(`Total raw collected: ${rawList.length}`);
  console.log(`Already in master DB: ${rawList.length - newLeads.length}`);
  console.log(`Brand new unique leads to process: ${newLeads.length}`);

  const browser = await chromium.launch({ executablePath: CHROME_EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await context.newPage();

  let processed = [];
  if (fs.existsSync(FINAL_OUT)) {
    try { processed = JSON.parse(fs.readFileSync(FINAL_OUT, 'utf8')); } catch (e) {}
  }
  const processedNames = new Set(processed.map(p => p.name.toLowerCase().trim()));

  let count = 0;
  for (const lead of newLeads) {
    if (processedNames.has(lead.name.toLowerCase().trim())) continue;

    const entry = {
      name: lead.name,
      category: 'Retail',
      rating: 4.5,
      reviews: 10,
      strategy: 'UNDER_5',
      zone: 'Zona 4 (Jantung Kota)',
      address: '',
      phone: '',
      phoneType: '',
      mapsUrl: lead.mapsUrl
    };

    try {
      await page.goto(lead.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3500 + Math.random() * 1000);

      const info = await extractDetails(page);
      if (info.captcha) {
        console.error('CAPTCHA hit. Stopping extractor.');
        break;
      }

      if (info.panelName) entry.name = info.panelName;
      if (info.rating) entry.rating = info.rating;
      if (info.reviews !== undefined) entry.reviews = info.reviews;
      if (info.category) entry.category = info.category.replace(/^Kategori:\s*/i, '').trim();
      if (info.address) entry.address = info.address.replace(/^Alamat:\s*/i, '').trim();
      
      const phoneNorm = normalizePhone(info.phoneRaw);
      if (phoneNorm) {
        entry.phone = phoneNorm.phone;
        entry.phoneType = phoneNorm.type;
      }

      entry.zone = getZone(entry.name, entry.address);
      entry.strategy = (entry.rating === 5.0 && entry.reviews < 100) ? 'HIGH_LOW_REV' : 'UNDER_5';

      processed.push(entry);
      fs.writeFileSync(FINAL_OUT, JSON.stringify(processed, null, 2));

      count++;
      if (count % 10 === 0) console.log(`Processed ${count}/${newLeads.length} new leads...`);

    } catch (e) {
      // ignore individual failure
    }

    await page.waitForTimeout(800 + Math.random() * 500);
  }

  await browser.close();
  console.log(`Extractor complete. Successfully processed ${processed.length} new unique leads.`);
  console.log(`Saved to ${FINAL_OUT}`);
})();
