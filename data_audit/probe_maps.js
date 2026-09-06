// Probe: can chrome-headless-shell + playwright render Google Maps search?
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
  });
  const url = 'https://www.google.com/maps/search/?api=1&query=Kopi+Nako+Sukabumi';
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    console.log('final URL:', page.url());
    const title = await page.title();
    console.log('title:', title);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
    console.log('---body---');
    console.log(bodyText);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  await browser.close();
})();
