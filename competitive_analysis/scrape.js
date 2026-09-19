const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'screenshots');

async function capture(page, name, url) {
  console.log(`\n=== ${name}: ${url} ===`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log(`  networkidle timed out, continuing with domcontentloaded`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
    } catch (e2) {
      console.log(`  Failed: ${e2.message}`);
      return null;
    }
  }

  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  Screenshot saved: ${file}`);

  // Extract text content for analysis
  const data = await page.evaluate(() => {
    const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean);
    const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean);
    const ctaButtons = [...document.querySelectorAll('button, a[href]')]
      .map(e => e.innerText.trim())
      .filter(t => t.length > 0 && t.length < 60)
      .slice(0, 20);
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const title = document.title;
    const bodyText = document.body.innerText.slice(0, 3000);

    // Get computed background colors of main sections
    const mainEl = document.querySelector('main, [class*="hero"], [class*="banner"], header, body');
    const bgColor = mainEl ? window.getComputedStyle(mainEl).backgroundColor : 'unknown';

    return { title, metaDesc, h1s, h2s, ctaButtons, bgColor, bodyText };
  });

  console.log(`  Title: ${data.title}`);
  console.log(`  Meta: ${data.metaDesc.slice(0, 120)}`);
  console.log(`  H1s: ${JSON.stringify(data.h1s.slice(0, 3))}`);
  console.log(`  H2s: ${JSON.stringify(data.h2s.slice(0, 5))}`);
  console.log(`  CTAs: ${JSON.stringify(data.ctaButtons.slice(0, 10))}`);

  return data;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const results = {};

  results.pandai = await capture(page, 'pandai', 'https://www.pandai.org');
  results.delima = await capture(page, 'delima', 'https://delima.moe.gov.my');

  // Also try a couple of extra angles on delima
  await page.goto('https://delima.moe.gov.my', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'delima_top.png') }).catch(() => {});

  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'raw_data.json'), JSON.stringify(results, null, 2));
  console.log('\nDone. Raw data saved to raw_data.json');
})();
