const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.TEST_URL || 'http://127.0.0.1:8766/';
  try {
    for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [768, 844], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url + '#cover');
      await page.waitForFunction(() => document.body.dataset.page === 'cover');
      const layout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        const font = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
        return {
          width: innerWidth, scroll: document.documentElement.scrollWidth,
          title: rect('.cover h1 span'), cover: rect('#cover'), lede: rect('.cover .lede'), prompts: rect('.cover-prompts'),
          titleFont: font('.cover h1'), ledeFont: font('.cover .lede'),
          buttonFont: font('#cover-enter'), promptFont: font('.cover-prompts a'),
          buttonWeight: Number(getComputedStyle(document.querySelector('#cover-enter')).fontWeight),
          buttonPadding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map(key => parseFloat(getComputedStyle(document.querySelector('#cover-enter'))[key])),
          titleDisplay: getComputedStyle(document.querySelector('.cover h1 span')).display,
          ledeWhiteSpace: getComputedStyle(document.querySelector('.cover .lede')).whiteSpace,
          questions: [...document.querySelectorAll('.cover-prompts a')].map(a => a.textContent.trim())
        };
      });
      assert.ok(layout.scroll <= width, `${width}: horizontal overflow`);
      assert.ok(layout.title.right <= width, `${width}: title clipped`);
      assert.equal(layout.titleDisplay, 'inline-block', 'title offset must actually apply');
      const expectedTitle = width <= 760 ? Math.min(96, Math.max(64, width * .128)) : width <= 1280 ? Math.min(124, Math.max(78, width * .088)) : Math.min(144, Math.max(84, width * .094));
      const expectedLede = width < 360 ? 12.8 : width < 380 ? 14 : width <= 760 ? 15 : width <= 800 ? 21 : Math.min(26, Math.max(22, width * .015));
      const expectedPrompt = width <= 760 ? 18 : Math.min(22, Math.max(18, width * .012));
      assert.ok(Math.abs(layout.titleFont - expectedTitle) < .02, `${width}: refined title size`);
      assert.ok(Math.abs(layout.ledeFont - expectedLede) < .02, `${width}: refined description size`);
      assert.equal(layout.ledeWhiteSpace, 'nowrap', 'cover description stays on one line');
      assert.ok(layout.lede.height < layout.ledeFont * 2, `${width}: cover description wrapped`);
      assert.ok(layout.lede.right <= width, `${width}: cover description clipped`);
      assert.ok(Math.abs(layout.promptFont - expectedPrompt) < .02, `${width}: refined question size`);
      assert.ok(layout.buttonFont > layout.promptFont, 'exploration stays the primary action');
      assert.equal(layout.buttonWeight, 900, 'exploration label is extra bold');
      assert.ok(Math.abs(layout.buttonFont - (width <= 760 ? 24 : Math.min(31, Math.max(27, width * .018)))) < .02, 'exploration font size unchanged');
      assert.deepEqual(layout.buttonPadding, width <= 760 ? [20, 28, 20, 28] : height <= 800 ? [16, 32, 16, 32] : [24, 36, 24, 36], 'button box padding unchanged');
      assert.deepEqual(layout.questions, ['看各省碳排放如何分布', '看历年排放如何变化', '看城乡如何不同']);
      assert.ok(layout.prompts.bottom <= layout.cover.bottom, 'questions fit within cover');
      if (width === 1280) {
        assert.ok(layout.prompts.bottom <= height, 'short desktop shows all three questions');
        await page.screenshot({ path: path.join(__dirname, 'artifacts', 'cover-refined-desktop.png'), animations: 'disabled' });
      }
      if (width === 390) await page.screenshot({ path: path.join(__dirname, 'artifacts', 'cover-refined-mobile.png'), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url + '#cover');
    await page.locator('#cover-enter').click();
    await page.waitForFunction(() => document.body.dataset.page === 'atlas');
    for (const [index, hash, route] of [[0, '#atlas-map', 'atlas'], [1, '#timeline-comparison', 'timeline'], [2, '#duality', 'duality']]) {
      await page.locator('.side-brand').click();
      await page.locator('.cover-prompts a').nth(index).click();
      await page.waitForFunction(({ hash, route }) => location.hash === hash && document.body.dataset.page === route, { hash, route });
      if (index < 2) {
        await page.waitForFunction(hash => {
          const target = document.querySelector(hash).getBoundingClientRect();
          const navBottom = document.querySelector('main>section:not([hidden]) .reading-nav').getBoundingClientRect().bottom;
          return target.top >= navBottom - 3 && target.top < innerHeight;
        }, hash);
      }
    }
    await page.locator('.side-brand').click();
    await page.locator('#start-story').click();
    await page.waitForFunction(() => document.body.dataset.page === 'atlas');
    assert.ok(await page.locator('.guided-reading').isVisible(), 'header guide still starts');
    assert.deepEqual(errors, [], 'fresh loads have no JavaScript errors');
    console.log('PASS: 7 responsive cover layouts, applied title offset, primary CTA hierarchy, 4 exploration links, header guide, no page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
