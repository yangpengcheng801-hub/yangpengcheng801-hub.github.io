const { chromium } = require('C:/Users/Yang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8765', { waitUntil: 'networkidle' });
  await page.click('#sampleBtn');
  await page.click('#analyzeBtn');
  await page.waitForSelector('#results:not(.hidden)', { timeout: 15000 });
  await page.fill('#question', 'What evidence hit rate did the system achieve?');
  await page.click('#askBtn');
  await page.waitForSelector('#answer:not(.hidden)', { timeout: 10000 });
  await page.screenshot({ path: 'docs/assets/paperpilot-ui.png', fullPage: true });
  await page.locator('.result-panel').screenshot({ path: 'docs/assets/paperpilot-result-panel.png' });
  await page.evaluate(() => window.scrollTo(0, 520));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/assets/paperpilot-demo-viewport.png', fullPage: false });
  console.log(await page.locator('#title').innerText());
  console.log(await page.locator('#answer').innerText());
  await browser.close();
})();
