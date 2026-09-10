const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Try alternate delima URLs
  const urls = [
    'https://delima.moe.gov.my',
    'http://delima.moe.gov.my',
    'https://www.delima.moe.gov.my',
    'https://delima.moe.edu.my',
  ];

  for (const url of urls) {
    try {
      console.log(`Trying: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      console.log(`  SUCCESS: ${page.url()}`);
      console.log(`  Title: ${await page.title()}`);
      await page.screenshot({ path: `screenshots/delima_found.png`, fullPage: true });
      break;
    } catch (e) {
      console.log(`  FAILED: ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
})();
