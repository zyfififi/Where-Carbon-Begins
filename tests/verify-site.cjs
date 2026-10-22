const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
for (const file of ['data/history.js', 'theme.js', 'chart-policy.js', 'insights.js', 'analysis.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const data = context.window.CARBON_HISTORY;
const models = context.window.CarbonAnalysis;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const years = data.meta.years.map(Number);
let changes = 0;
for (const year of years) {
  const landscape = models.landscapeModel(data, year);
  assert.equal(landscape.length, 30);
  landscape.forEach(p => {
    close(p.shares.reduce((a, b) => a + b, 0), 1);
    if (year === 2015) { assert.equal(p.urbanPC, null); assert.equal(p.ruralPC, null); }
    else { close(p.urbanPC, p.urbanTotal * 100 / p.population.urban); close(p.ruralPC, p.ruralTotal * 100 / p.population.rural); }
    const dual = models.dualModel(data, year, p.name, '浙江');
    close(dual.entries[0].groups.reduce((s, g) => s + g.urban + g.rural, 0), p.total);
    assert.ok(dual.max >= Math.max(...dual.entries.flatMap(x => x.groups.map(g => g.urban + g.rural))));
  });
}
for (const p of data.series['2022'].provinces) {
  for (let i = 0; i < years.length; i++) for (let j = i + 1; j < years.length; j++) {
    const m = models.changeModel(data, p.name, years[i], years[j]);
    close(m.deltas.reduce((s, d) => s + d.value, m.before.total), m.after.total);
    close(m.deltas.reduce((s, d) => s + d.urban + d.rural, 0), m.net);
    m.bridge.forEach(d => assert.ok(d.low >= -1e-8 && d.high >= d.low));
    changes++;
  }
}
console.log(`PASS: 240 province-year shares / per-capita / dual totals, ${changes} complete interval bridges`);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.TEST_URL || 'http://127.0.0.1:8766/';
  const output = path.join(__dirname, 'artifacts');
  fs.mkdirSync(output, { recursive: true });
  const option = id => page.evaluate(id => echarts.getInstanceByDom(document.getElementById(id))?.getOption(), id);
  const go = async id => {
    await page.locator(`.chapters a[href="#${id}"]`).click();
    await page.waitForFunction(expected => document.body.dataset.page === expected, id);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('main > section:not([hidden])').count(), 1);
    assert.equal(await page.locator('.chapters [aria-current="page"]').getAttribute('href'), '#' + id);
  };
  try {
    await page.goto(url + '#cover');
    const motion1 = await page.locator('.cover-sculpture').evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(500);
    const motion2 = await page.locator('.cover-sculpture').evaluate(el => getComputedStyle(el).transform);
    assert.notEqual(motion1, motion2);
    await page.screenshot({ path: path.join(output, 'site-cover.png') });
    await go('duality');
    const a = await option('a-ring'), b = await option('b-ring');
    close(a.series[0].data.reduce((s, d) => s + d.value, 0), data.series['2022'].provinces.find(p => p.name === '河北').total);
    close(b.series[0].data.reduce((s, d) => s + d.value, 0), data.series['2022'].provinces.find(p => p.name === '浙江').total);
    close((await option('a-bars')).xAxis[0].max, (await option('b-bars')).xAxis[0].max);
    await page.locator('[data-fuel="gas"]').click();
    assert.equal((await option('a-bars')).series[0].data[0].itemStyle.opacity, .15);
    assert.equal((await option('b-bars')).series[1].data[4].itemStyle.opacity, 1);
    await page.locator('[data-fuel="all"]').click();
    await page.screenshot({ path: path.join(output, 'site-duality.png'), fullPage: true });
    await page.selectOption('#province-a', '北京');
    await page.locator('#swap').click();
    assert.equal(await page.inputValue('#province-b'), '北京');
    await page.selectOption('#global-year', '2015');
    assert.match(await page.locator('#dual-pop-note').textContent(), /人口缺失/);
    assert.ok((await option('dual-percapita')).series.every(s => s.data.every(d => d === null)));
    await go('landscape');
    assert.match(await page.locator('#landscape-note').textContent(), /暂显示总量坐标/);
    await page.selectOption('#global-year', '2022');
    const scatter = await option('province-scatter');
    assert.equal(scatter.series[1].data.length, 30);
    assert.equal((await option('province-ranking')).series[0].data.length, 30);
    assert.equal((await option('fuel-fingerprint')).series[0].data.length, 300);
    await page.selectOption('#fingerprint-sort', 'gas');
    const rowOrder = (await option('fuel-fingerprint')).yAxis[0].data;
    const gas = data.meta.groups.find(g => g.id === 'gas');
    const gap = p => Math.abs(gas.indices.reduce((s, i) => s + p.urban[i], 0) / p.urbanTotal - gas.indices.reduce((s, i) => s + p.rural[i], 0) / p.ruralTotal);
    const ordered = models.landscapeModel(data, 2022).sort((a, b) => gap(b) - gap(a));
    assert.equal(rowOrder[0], ordered[0].name);
    await page.evaluate(() => echarts.getInstanceByDom(document.querySelector('#province-scatter')).trigger('click', { data: { provinceName: '江苏' } }));
    assert.equal(await page.inputValue('#global-province'), '江苏');
    await page.screenshot({ path: path.join(output, 'site-landscape.png'), fullPage: true });
    await go('change');
    assert.match(await page.locator('#change-context').textContent(), /江苏/);
    await page.selectOption('#change-start', '2022');
    assert.ok(Number(await page.inputValue('#change-start')) < Number(await page.inputValue('#change-end')));
    await page.selectOption('#change-end', '2015');
    assert.equal(await page.inputValue('#change-start'), '2015');
    assert.equal(await page.inputValue('#change-end'), '2016');
    await page.selectOption('#change-end', '2022');
    const expected = models.changeModel(data, '江苏', 2015, 2022);
    close((await option('change-waterfall')).series[0].data[0][3], expected.before.total);
    close((await option('change-waterfall')).series[0].data.at(-1)[3], expected.after.total);
    assert.equal(await page.locator('#change-net').textContent(), `${expected.net > 0 ? '+' : ''}${expected.net.toFixed(2)}`);
    await page.screenshot({ path: path.join(output, 'site-change.png'), fullPage: true });
    await page.reload();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'change');
    await go('atlas');
    await go('timeline');
    await page.goBack();
    await page.waitForFunction(() => document.body.dataset.page === 'atlas');
    await page.goForward();
    await page.waitForFunction(() => document.body.dataset.page === 'timeline');
    assert.equal(await page.locator('.timeline-zone').count(), 3);
    await page.locator('.reading-nav a[href="#timeline-lab"]').click();
    await page.waitForFunction(() => echarts.getInstanceByDom(document.querySelector('#profile-chart'))?.getOption().series[0]?.type === 'bar3D');
    assert.equal(await page.locator('.chapters [aria-current="page"]').getAttribute('href'), '#timeline');
    await page.screenshot({ path: path.join(output, 'site-lab.png') });
    // All routes must fit a narrow viewport, with a usable left-side drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['cover', 'atlas', 'timeline', 'retrieval', 'duality', 'landscape', 'change', 'passport']) {
      await page.locator('.nav-toggle').click();
      assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'true');
      await go(id);
      assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id} horizontal overflow`);
    }
    await page.locator('.nav-toggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.nav-toggle').getAttribute('aria-expanded'), 'false');
    await page.goto(url + '#duality');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(output, 'site-mobile-duality.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url + '#cover');
    assert.equal(await page.locator('.cover-sculpture').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.goto('file:///' + root.replace(/\\/g, '/') + '/index.html#change');
    assert.equal(await page.locator('body').getAttribute('data-page'), 'change');
    assert.equal((await option('change-waterfall')).series[0].data.length, models.changeModel(data, '河北', 2015, 2022).bridge.filter(d => d.endpoint || Math.abs(d.value) > 1e-12).length);
    assert.deepEqual(errors, []);
    console.log('PASS: 8 routes, refresh/back/forward, 3 time zones, real donut values, shared scales, fuel focus, 2015 missing-data handling, 30-province charts, interval controls, map focus sync, 390px drawer, reduced motion, file://');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
