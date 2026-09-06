// Find replacement candidates for broken entries
const { chromium } = require('/home/marwhal/.nvm/versions/node/v22.20.0/lib/node_modules/playwright');
const EXE = '/home/marwhal/chrome-headless-shell/linux-150.0.7868.0/chrome-headless-shell-linux64/chrome-headless-shell';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=id-ID'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', viewport: { width: 1366, height: 900 }, locale: 'id-ID' });
  const page = await ctx.newPage();
  for (const q of ['apotek sukabumi', 'apotek ciaul sukabumi']) {
    try {
      await page.goto(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      const cands = await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (!feed) return null;
        const out = [];
        feed.querySelectorAll(':scope > div').forEach(b => {
          const t = b.innerText.split('\n').map(s => s.trim()).filter(Boolean);
          const rm = t.find(l => /^[0-5],[0-9]/.test(l));
          if (!rm) return;
          const name = t[0] && !/^[0-5],[0-9]/.test(t[0]) ? t[0] : (t[1] || '');
          const link = b.querySelector('a[href*="/maps/place/"]');
          out.push({ name: name.slice(0, 70), rating: rm.match(/^([0-5],[0-9])/)[1], revs: (rm.match(/\(([^)]+)\)/) || [])[1] || '', addr: (t.find(l => /(Jl\.|Kec\.|Gg\.|No\.\s?\d)/.test(l)) || '').slice(0, 70), href: link ? link.href.slice(0, 90) : '' });
        });
        return out.slice(0, 8);
      });
      console.log('QUERY:', q, '->', cands ? cands.length + ' candidates' : 'no feed');
      (cands || []).forEach(c => console.log('  ', c.name, '|', c.rating, '(', c.revs, ') |', c.addr));
    } catch (e) { console.log(q, 'ERROR', e.message.slice(0, 100)); }
    await page.waitForTimeout(1500);
  }
  await browser.close();
})();
