const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // ─── 1. Pandai — proper deep dive ───
  console.log('\n=== PANDAI FULL HOMEPAGE ===');
  await page.goto('https://my.pandai.org/', { waitUntil: 'load', timeout: 25000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'screenshots/pandai_01_hero.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/pandai_02_stats.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await page.evaluate(() => window.scrollTo(0, 2200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/pandai_03_features.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await page.evaluate(() => window.scrollTo(0, 3500));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/pandai_04_testimonials.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  
  const pandaiAll = await page.evaluate(() => {
    const all = document.body.innerText;
    const colors = [];
    document.querySelectorAll('[class*="bg-"], [style*="background"], [style*="color"]').forEach(el => {
      const s = window.getComputedStyle(el);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
        colors.push(s.backgroundColor);
      }
    });
    return {
      text: all.slice(0, 5000),
      colors: [...new Set(colors)].slice(0, 20)
    };
  });
  console.log('Page text (first 3000):', pandaiAll.text.slice(0, 3000));
  console.log('\nColors found:', pandaiAll.colors);

  // Pandai's app store page / pricing via my.pandai.org
  await page.goto('https://my.pandai.org/plans', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/pandai_plans.png', fullPage: true });

  // ─── 2. Geniebook deep dive (Singapore but relevant) ───
  console.log('\n=== GENIEBOOK ===');
  await page.goto('https://geniebook.com', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/geniebook_hero.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/geniebook_features.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });

  const geniebook = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log('Geniebook text:', geniebook);

  // ─── 3. Try Delima via Google cache ───
  console.log('\n=== DELIMA (via web search) ===');
  await page.goto('https://webcache.googleusercontent.com/search?q=cache:delima.moe.gov.my', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/delima_cache.png' });

  // ─── 4. Try Pandai teacher portal ───
  console.log('\n=== PANDAI - looking for teacher / school info ===');
  await page.goto('https://my.pandai.org/', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3000);
  
  // scroll to bottom to see footer links
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/pandai_footer.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
  
  const footerLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('footer a, [class*="footer"] a')]
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(l => l.text);
  });
  console.log('Footer links:', JSON.stringify(footerLinks, null, 2));

  // ─── 5. Pandai's school/teacher dashboard page ───
  const schoolPages = [
    'https://schools.pandai.org',
    'https://teacher.pandai.org',
    'https://my.pandai.org/school',
    'https://my.pandai.org/for-schools',
    'https://my.pandai.org/solutions/schools',
  ];
  for (const u of schoolPages) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      const t = await page.title();
      const h1 = await page.evaluate(() => document.querySelector('h1')?.innerText);
      if (!t.includes('404') && !t.includes('Error')) {
        console.log(`Found: ${u} → "${t}" | H1: ${h1}`);
        await page.screenshot({ path: `screenshots/pandai_schools_page.png`, fullPage: true });
      }
    } catch {}
  }

  await browser.close();
  console.log('\n✓ Final scrape done');
})();
