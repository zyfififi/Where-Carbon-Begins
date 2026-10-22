const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const luminance = rgb => {
  const c = rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = process.env.TEST_URL || 'http://127.0.0.1:8766/';
  const opt = id => page.evaluate(id => echarts.getInstanceByDom(document.getElementById(id)).getOption(), id);
  try {
    await page.goto(url + '#cover');
    const theme = await page.evaluate(() => window.CarbonTheme);
    const rgb = hex => hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
    assert.ok(contrast(rgb(theme.ink), rgb(theme.paper)) >= 4.5);
    assert.ok(contrast(rgb(theme.muted), rgb(theme.paper)) >= 4.5);
    assert.ok(contrast(rgb(theme.surface), rgb(theme.urban)) >= 4.5);
    assert.ok(contrast(rgb(theme.rural), rgb(theme.paper)) >= 4.5);
    for (const route of ['cover', 'atlas', 'timeline', 'duality', 'landscape', 'change', 'passport']) {
      await page.locator(`.chapters a[href="#${route}"]`).click();
      const dark = await page.evaluate(route => {
        const elements = [document.querySelector('.side-nav'), document.querySelector('.site-header'), ...document.querySelectorAll(`#${route} .viz-panel, #${route} .atlas-detail, #${route} .duality-card, #${route} select`)];
        return elements.filter(el => el.getClientRects().length).filter(el => {
          const color = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);
          return color && (color[3] ?? 1) > .9 && Math.max(...color.slice(0, 3)) < 120;
        }).map(el => el.className || el.id);
      }, route);
      assert.deepEqual(dark, [], `${route}: leftover dark surfaces`);
    }
    await page.locator('.chapters a[href="#atlas"]').click();
    assert.deepEqual((await opt('map')).visualMap[0].inRange.color, theme.ramp);
    assert.equal((await opt('map')).series[0].itemStyle.areaColor, theme.missing);
    await page.locator('.chapters a[href="#timeline"]').click();
    assert.deepEqual((await opt('stacked-area')).series.map(s => s.itemStyle.color), theme.fuel.slice(0, 5));
    assert.deepEqual((await opt('heatmap')).visualMap[0].inRange.color, theme.ramp);
    assert.match(await page.locator('.viz-heat-panel small').textContent(), /越深/);
    await page.locator('.reading-nav a[href="#timeline-lab"]').click();
    await page.waitForFunction(() => echarts.getInstanceByDom(document.getElementById('profile-chart'))?.getOption().series[0].type === 'bar3D');
    assert.equal((await opt('profile-chart')).grid3D[0].environment, '#f7f7ee');
    await page.locator('[data-scene="history"]').click();
    await page.locator('#lab-other').check();
    await page.locator('[data-view="3d"]').click();
    await page.waitForTimeout(350);
    assert.deepEqual((await opt('profile-chart')).series[0].data.slice(0, 6).map(d => d.itemStyle.color), theme.fuel);
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'theme-history-3d.png') });
    await page.locator('[data-view="2d"]').click();
    const heat = await opt('profile-chart');
    const cells = await page.evaluate(() => {
      const o = echarts.getInstanceByDom(document.getElementById('profile-chart')).getOption();
      return o.series[0].data.map(d => ({ text: echarts.color.parse(d.label.color), fill: echarts.color.parse(echarts.color.lerp(d.value[2] / o.visualMap[0].max, window.CarbonTheme.ramp)) }));
    });
    cells.forEach(c => assert.ok(contrast(c.text, c.fill) >= 4.5));
    assert.equal(heat.series[0].data.length, 48);
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'theme-history-2d.png') });
    await page.locator('.chapters a[href="#duality"]').click();
    assert.deepEqual((await opt('a-ring')).series[0].data.map(d => d.itemStyle.color), [theme.urban, theme.rural]);
    assert.equal((await opt('a-ring')).tooltip[0].backgroundColor, theme.surface);
    await page.locator('#a-ring').hover({ position: { x: 30, y: 90 } });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(__dirname, 'artifacts', 'theme-duality-tooltip.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: 8 light-theme routes, semantic chart colors, consistent fuel palettes, light WebGL, tooltip styling, 48 adaptive heat labels >= 4.5:1');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
