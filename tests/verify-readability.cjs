const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = process.env.TEST_URL || 'http://127.0.0.1:8766/';
  const routes = ['cover', 'atlas', 'timeline', 'retrieval', 'duality', 'landscape', 'change', 'passport'];
  try {
    await page.goto(url + '#cover');
    assert.equal((await page.locator('h1').textContent()).replace(/\s/g, ''), '碳从哪里来');
    assert.match(await page.title(), /碳从哪里来/);
    assert.equal(await page.getByRole('link', { name: '碳从哪里来首页', exact: true }).count(), 1);
    assert.equal(await page.locator('body').textContent().then(s => s.includes('碳迹')), false);
    const signatures = await page.evaluate(() => {
      const options = { tooltip: { textStyle: { fontSize: 11 } }, series: [{ data: [1.1234567, 0, 2] }] };
      const result = window.CarbonTheme.chartOptions(options);
      return { inputFont: options.tooltip.textStyle.fontSize, outputFont: result.tooltip.textStyle.fontSize, data: result.series[0].data };
    });
    assert.equal(signatures.inputFont, 11);
    assert.equal(signatures.outputFont, 14);
    assert.deepEqual(signatures.data, [1.1234567, 0, 2]);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(url + '#' + route);
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: Array.from(document.querySelectorAll('body *')).filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(el => el.className || el.tagName) }));
        assert.ok(overflow.scroll <= overflow.width, `${width}/${route}: overflow ${JSON.stringify(overflow)}`);
        assert.match(await page.title(), /碳从哪里来/);
        const fontSize = await page.locator(`#${route} h1, #${route} h2`).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        const expected = route === 'cover' ? (width <= 760 ? Math.min(96, Math.max(64, width * .128)) : width <= 1280 ? Math.min(124, Math.max(78, width * .088)) : Math.min(144, Math.max(84, width * .094))) : route === 'passport' ? (width <= 760 ? 47 : Math.min(70, Math.max(45, width * .05))) : width <= 760 ? 45 : Math.min(67, Math.max(38, width * .047));
        assert.ok(Math.abs(fontSize - expected) < .02, `${width}/${route}: major heading size changed`);
        const tooThin = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getClientRects().length && !el.closest('svg,script,style') && Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())).filter(el => parseInt(getComputedStyle(el).fontWeight) < 600).map(el => el.textContent.trim().slice(0, 40)));
        assert.deepEqual(tooThin, [], `${width}/${route}: thin visible text`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url + '#atlas');
    await page.waitForFunction(() => {
      const chart = echarts.getInstanceByDom(document.getElementById('map'));
      return chart && chart.getWidth() > 0 && chart.getModel().getSeriesByIndex(0).coordinateSystem.getViewRect().width > 0;
    });
    const map = await page.evaluate(() => {
      const chart = echarts.getInstanceByDom(document.getElementById('map'));
      const rect = chart.getModel().getSeriesByIndex(0).coordinateSystem.getViewRect();
      return { rect, width: chart.getWidth(), height: chart.getHeight(), font: chart.getOption().series[0].select.label.fontSize };
    });
    assert.ok(map.rect.width > 353.6 * 1.55);
    assert.ok(map.rect.x >= 0 && map.rect.y >= 0);
    assert.ok(map.rect.x + map.rect.width <= map.width + 1 && map.rect.y + map.rect.height <= map.height + 1);
    assert.ok(map.font >= 14);
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'edition1-atlas.png'), fullPage: true });
    await page.goto(url + '#timeline');
    const chartText = await page.evaluate(() => ['trend', 'heatmap', 'stacked-area', 'sankey-chart'].map(id => {
      const o = echarts.getInstanceByDom(document.getElementById(id)).getOption();
      return { id, font: o.tooltip[0].textStyle.fontSize, weight: o.tooltip[0].textStyle.fontWeight, axis: o.xAxis?.[0]?.axisLabel?.fontSize, label: o.series[0].label?.fontSize };
    }));
    chartText.forEach(c => { assert.ok(c.font >= 14 && c.weight >= 600); assert.ok((c.axis || c.label) >= 14); });
    await page.goto(url + '#cover');
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'edition1-cover.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url + '#duality');
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'edition1-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: renamed identity, enlarged responsive cover, unchanged analysis heading sizes, semibold visible text, 40 route/viewport layouts (320–1440px), 1.6x country map within canvas, larger chart text, unmodified numeric data');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
