const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // ─── 1. Pandai - click through the homepage nav links ───
  console.log('\n=== PANDAI: Homepage nav exploration ===');
  await page.goto('https://my.pandai.org/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/pandai_home_full.png', fullPage: true });

  const navLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('nav a, header a')]
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(l => l.text && l.href && !l.href.includes('#'));
  });
  console.log('Nav links:', JSON.stringify(navLinks.slice(0, 20), null, 2));

  // Scroll down to capture hero stats & feature sections
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/pandai_features_scroll.png' });

  await page.evaluate(() => window.scrollTo(0, 1400));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/pandai_testimonials.png' });

  // ─── 2. Pandai schools / B2B page if any ───
  const schoolsUrl = navLinks.find(l => l.text.toLowerCase().includes('school') || l.text.toLowerCase().includes('teacher'));
  if (schoolsUrl) {
    console.log(`\nFound: ${schoolsUrl.text} → ${schoolsUrl.href}`);
    await page.goto(schoolsUrl.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.screenshot({ path: 'screenshots/pandai_school_page.png', fullPage: true });
  }

  // ─── 3. Competitors that are reachable ───
  const competitors = [
    ['quipper_my', 'https://www.quipper.com/id/'],   // Indonesia-based but active in MY
    ['geniebook', 'https://geniebook.com'],
    ['exam_time', 'https://www.goconqr.com/en/exam/'],
    ['mypf', 'https://mypf.my'],
    ['toppr', 'https://www.toppr.com'],
    ['classpoint', 'https://www.classpoint.io'],
  ];

  for (const [name, url] of competitors) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
      const data = await page.evaluate(() => {
        const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean);
        const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean);
        const btns = [...document.querySelectorAll('button, .btn, [class*="cta"]')]
          .map(e => e.innerText.trim()).filter(t => t && t.length < 60).slice(0, 10);
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        return { h1s: h1s.slice(0,4), h2s: h2s.slice(0,6), btns, metaDesc };
      });
      console.log(`\n=== ${name} ===`);
      console.log('H1:', data.h1s);
      console.log('H2:', data.h2s);
      console.log('BTN:', data.btns);
      console.log('Meta:', data.metaDesc.slice(0,150));
    } catch(e) {
      console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log('\n✓ Deep scrape done');
})();
