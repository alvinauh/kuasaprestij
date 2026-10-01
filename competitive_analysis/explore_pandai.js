const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Deep dive Pandai: homepage sections + teacher/student pages
  const pages = [
    ['pandai_home', 'https://www.pandai.org'],
    ['pandai_features', 'https://www.pandai.org/features'],
    ['pandai_teacher', 'https://www.pandai.org/teacher'],
    ['pandai_schools', 'https://www.pandai.org/schools'],
    ['pandai_pricing', 'https://www.pandai.org/pricing'],
    ['pandai_about', 'https://www.pandai.org/about'],
  ];

  for (const [name, url] of pages) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    } catch {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
      } catch(e) {
        console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`);
        continue;
      }
    }

    const file = `screenshots/${name}.png`;
    await page.screenshot({ path: file, fullPage: true });

    const data = await page.evaluate(() => {
      const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean);
      const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean);
      const ps  = [...document.querySelectorAll('p')].map(e => e.innerText.trim()).filter(t => t.length > 40).slice(0, 8);
      const btns = [...document.querySelectorAll('button, a[class*="btn"], a[class*="cta"]')]
        .map(e => e.innerText.trim()).filter(t => t.length > 0 && t.length < 60).slice(0, 15);
      return { h1s, h2s, ps, btns, url: location.href };
    });

    console.log(`\n=== ${name} (${data.url}) ===`);
    console.log('H1:', JSON.stringify(data.h1s));
    console.log('H2:', JSON.stringify(data.h2s.slice(0,6)));
    console.log('P:', JSON.stringify(data.ps.slice(0,4)));
    console.log('BTN:', JSON.stringify(data.btns));
  }

  // Also try edumate / lms alternatives common in Malaysia
  const competitors = [
    ['cikgu_tv', 'https://www.cikgu.tv'],
    ['getmarks', 'https://www.getmarks.app'],
    ['afterschool', 'https://www.afterschool.my'],
    ['mytutor', 'https://www.mytutor.com.my'],
  ];

  for (const [name, url] of competitors) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const file = `screenshots/${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const title = await page.title();
      const data = await page.evaluate(() => {
        const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean);
        const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean);
        const btns = [...document.querySelectorAll('button, a[class*="btn"], a[class*="cta"]')]
          .map(e => e.innerText.trim()).filter(t => t.length > 0 && t.length < 60).slice(0, 10);
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
        return { h1s, h2s, btns, metaDesc };
      });
      console.log(`\n=== ${name} (${url}) ===`);
      console.log('Title:', title);
      console.log('Meta:', data.metaDesc.slice(0,120));
      console.log('H1:', JSON.stringify(data.h1s));
      console.log('H2:', JSON.stringify(data.h2s.slice(0,5)));
      console.log('BTN:', JSON.stringify(data.btns));
    } catch(e) {
      console.log(`SKIP ${name}: ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log('\n✓ Done');
})();
