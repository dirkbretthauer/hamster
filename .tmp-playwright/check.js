const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.log(`[pageerror] ${err.message}`);
  });

  await page.goto('http://localhost:4173/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
