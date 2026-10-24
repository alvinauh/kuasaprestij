const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const subpages = [
    ['pandai_teachers', 'https://my.pandai.org/teachers'],
    ['pandai_parents', 'https://my.pandai.org/parents'],
    ['pandai_about', 'https://my.pandai.org/about'],
    ['pandai_smart_revision', 'https://my.pandai.org/students/smartrevision'],
    ['pandai_live_tuition', 'https://my.pandai.org/live-tuition'],
    ['geniebook_plans', 'https://geniebook.com/plans'],
  ];

  for (const [name, url] of subpages) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
      const data = await page.evaluate(() => {
        const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean);
        const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean);
        const bodyText = document.body.innerText.slice(0, 2500);
        return { h1s, h2s, bodyText };
      });
      console.log(`\n=== ${name} ===`);
      console.log('H1:', data.h1s.slice(0,3));
      console.log('H2:', data.h2s.slice(0,6));
      console.log('TEXT:\n', data.bodyText);
    } catch(e) {
      console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log('\n✓ Done');
})();
