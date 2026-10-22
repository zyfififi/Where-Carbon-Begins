const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const context = { window: {} };
for (const file of ['data/history.js', 'theme.js', 'chart-policy.js', 'insights.js', 'analysis.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const data = context.window.CARBON_HISTORY, I = context.window.CarbonInsights;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const totalRange = I.mapScale(data, 'total');
assert.equal(totalRange.min, 0);
for (const y of data.meta.years) for (const p of data.series[y].provinces) {
  const m = I.structure(p, data.meta.groups);
  close(m.d17, p.difference); close(1 - m.overlap, m.d6);
  close(m.shares.reduce((s, g) => s + g.urban, 0), 1);
  close(m.shares.reduce((s, g) => s + g.rural, 0), 1);
  assert.ok(m.d4 <= m.d6 + 1e-12 && m.d6 <= m.d17 + 1e-12);
  assert.ok(p.total <= totalRange.max);
}
const nat = I.structure(I.national(data, 2022), data.meta.groups);
close(nat.d17, .41061958258941494); close(nat.d6, .40099154958183214); close(nat.d4, .36023173000365116);
const exported = I.detailRows(data);
assert.equal(exported.length, 8161);
close(exported.slice(1).reduce((s, r) => s + r[4], 0), data.meta.years.reduce((s, y) => s + I.national(data, y).total, 0));
assert.ok(exported.slice(1).filter(r => r[0] === 2015).every(r => r[7] === '' && r[8] === ''));
assert.match(I.csv([['a,b', '"quote"', '中文']]), /^\ufeff"a,b","""quote""","中文"$/);
console.log('PASS: 240 structure identities, granularity inequalities, fixed map scale, 8160 exported records, missing population preserved');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  const base = process.env.TEST_URL || 'file:///' + root.replace(/\\/g, '/') + '/index.html';
  const option = id => page.evaluate(id => echarts.getInstanceByDom(document.getElementById(id)).getOption(), id);
  const ready = async () => { await page.waitForTimeout(100); };
  const go = async route => { await page.locator(`.chapters a[href="#${route}"]`).click(); await ready(); };
  try {
    await page.goto(base + '#atlas');
    assert.ok(!requests.some(s => s.includes('echarts-gl')), 'cover/map must not load 3D engine');
    for (const metric of ['total', 'ruralShare', 'difference']) {
      await page.locator(`[data-metric="${metric}"]`).click();
      const first = (await option('map')).visualMap[0];
      for (const y of ['2015', '2018', '2022']) {
        await page.selectOption('#global-year', y);
        const next = (await option('map')).visualMap[0];
        assert.equal(next.min, first.min); assert.equal(next.max, first.max);
      }
    }
    const map = await option('map');
    assert.equal(map.visualMap[0].max, 1); assert.equal(map.visualMap[0].min, 0);
    assert.ok(await page.evaluate(() => {
      const series = echarts.getInstanceByDom(document.getElementById('map')).getModel().getSeriesByIndex(0), d = series.getData();
      const region = d.getItemGraphicEl(d.indexOfName('河北')).children()[0];
      return region.states.select.style.fill === d.getItemVisual(d.indexOfName('河北'), 'style').fill;
    }), 'selection must preserve the actual rendered numeric map fill');
    assert.match(await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('map')).getOption().tooltip[0].formatter({ name: '西藏' })), /不代表零/);
    await page.locator('[data-discover="hebei"]').click(); await ready();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'change');
    assert.equal(await page.inputValue('#global-province'), '河北');
    assert.match(await page.locator('#change-insight').textContent(), /煤及煤制品.*天然气/);
    const waterfall = await option('change-waterfall');
    assert.ok(!waterfall.xAxis[0].data.includes('其他油品'));
    close(waterfall.series[0].data.slice(1, -1).reduce((s, d) => s + d[3], waterfall.series[0].data[0][3]), waterfall.series[0].data.at(-1)[3]);
    await go('duality');
    await page.selectOption('#province-a', '北京'); await page.selectOption('#province-b', '江苏'); await ready();
    await page.reload();
    assert.equal(await page.inputValue('#province-a'), '北京'); assert.equal(await page.inputValue('#province-b'), '江苏');
    const bars = await option('overlap-bars');
    for (let side = 0; side < 2; side++) close(bars.series.reduce((s, serie) => s + serie.data[side], 0), 100);
    await page.locator('[data-overlap="gas"]').click(); await ready();
    assert.equal((await option('overlap-bars')).series[0].itemStyle.opacity, .16);
    assert.equal((await option('overlap-bars')).series[4].itemStyle.opacity, 1);
    await page.locator('#structure-overlap .chart-expand').click();
    assert.ok(await page.locator('#chart-dialog').isVisible());
    assert.ok(await page.locator('#chart-dialog #overlap-bars').isVisible());
    assert.ok((await page.locator('#overlap-bars').boundingBox()).height > 500);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#duality #overlap-bars');
    assert.equal(await page.locator('#duality #overlap-bars').count(), 1);
    await go('landscape');
    let matrix = await option('fuel-fingerprint');
    assert.equal(matrix.series[0].data.length, 300);
    assert.ok(matrix.xAxis[0].data.every(v => !v.includes('其他油品')));
    await page.locator('#fingerprint-other').check(); await ready();
    await page.locator('#fingerprint-values').check(); await ready();
    matrix = await option('fuel-fingerprint');
    assert.equal(matrix.series[0].data.length, 360); assert.equal(matrix.series[0].label.show, true);
    for (let row = 0; row < 30; row++) for (let side = 0; side < 2; side++) close(matrix.series[0].data.filter(d => d.value[1] === row && Math.floor(d.value[0] / 6) === side).reduce((s, d) => s + d.value[2], 0), 100);
    await page.selectOption('#fingerprint-focus', 'gas'); await ready();
    assert.ok((await option('fuel-fingerprint')).series[0].data.some(d => d.itemStyle.opacity === .18));
    await page.evaluate(() => { echarts.getInstanceByDom(document.getElementById('fuel-fingerprint')).trigger('click', { data: { provinceName: '湖北' } }); });
    assert.equal(await page.inputValue('#global-province'), '湖北');
    await page.selectOption('#global-year', '2018');
    await page.selectOption('#fingerprint-sort', 'gas'); await ready();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sort') === 'gas');
    const stateURL = page.url();
    await page.reload();
    assert.equal(await page.inputValue('#global-province'), '湖北'); assert.equal(await page.inputValue('#global-year'), '2018');
    assert.equal(await page.inputValue('#fingerprint-sort'), 'gas'); assert.ok(await page.locator('#fingerprint-values').isChecked());
    assert.ok(await page.locator('#fingerprint-other').isChecked()); assert.equal(await page.inputValue('#fingerprint-focus'), 'gas');
    assert.equal(page.url(), stateURL);
    await go('change');
    await page.selectOption('#change-start', '2016'); await page.selectOption('#change-end', '2020'); await ready();
    await page.reload();
    assert.equal(await page.inputValue('#change-start'), '2016'); assert.equal(await page.inputValue('#change-end'), '2020');
    await go('atlas'); await page.locator('[data-discover="denominator"]').click(); await ready();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'landscape');
    assert.equal(await page.inputValue('#global-year'), '2022');
    await go('atlas'); await page.locator('[data-discover="structure"]').click(); await ready();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'duality');
    await page.locator('.calculation-note a[href="#granularity"]').evaluate(el => el.closest('details').open = true);
    await page.locator('.calculation-note a[href="#granularity"]').click(); await ready();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'passport');
    const grain = await option('grain-chart');
    assert.equal(grain.series.length, 3); assert.equal(grain.yAxis[0].max, 1);
    await page.locator('#export-all').evaluate(el => el.scrollIntoView());
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-all').click()]);
    assert.match(download.suggestedFilename(), /17类燃料明细\.csv$/);
    const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk); const content = Buffer.concat(chunks).toString('utf8');
    assert.equal(content.split('\r\n').length, 8161); assert.match(content, /原煤/);
    await page.locator('#share-state').click();
    assert.ok(await page.locator('#share-url').isVisible()); assert.match(await page.inputValue('#share-url'), /p=.*y=2022/);
    await page.goto(base + '#timeline-lab'); await page.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => echarts.getInstanceByDom(document.getElementById('profile-chart'))?.getOption().series?.[0]?.type === 'bar3D');
    assert.ok(requests.some(s => s.includes('echarts-gl')));
    await page.locator('[data-scene="history"]').click();
    assert.equal(await page.locator('#carbon-lab').getAttribute('data-view'), '2d');
    assert.equal((await option('profile-chart')).series[0].data.length, 40);
    await page.selectOption('#lab-fuel', 'gas');
    assert.equal((await option('profile-chart')).series[0].data.length, 8);
    const scale = (await option('profile-chart')).visualMap[0].max;
    await page.locator('#lab-slice').check();
    assert.equal((await option('profile-chart')).series[0].data.length, 1);
    assert.equal((await option('profile-chart')).visualMap[0].max, scale);
    await page.locator('[data-view="3d"]').click();
    assert.equal((await option('profile-chart')).series[0].data.length, 1);
    await ready(); await page.reload(); await page.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => echarts.getInstanceByDom(document.getElementById('profile-chart'))?.getOption().series?.[0]?.type === 'bar3D');
    assert.equal(await page.inputValue('#lab-fuel'), 'gas'); assert.ok(await page.locator('#lab-slice').isChecked());
    assert.equal((await option('profile-chart')).series[0].data.length, 1);
    // Actual browser drawing, not only a stubbed setOption call.
    const drawn = await page.evaluate(() => ['map', 'trend', 'heatmap', 'stacked-area', 'sankey-chart'].every(id => {
      const c = echarts.getInstanceByDom(document.getElementById(id)); return c?.getZr().storage.getDisplayList().length > 0;
    }));
    assert.ok(drawn);
    const routes = {
      duality: ['overlap-bars', 'a-ring', 'b-ring', 'a-bars', 'b-bars', 'dual-fingerprint', 'dual-percapita'],
      landscape: ['province-scatter', 'province-ranking', 'fuel-fingerprint'], change: ['change-waterfall', 'change-fuels', 'change-slope'], passport: ['grain-chart']
    };
    for (const [route, ids] of Object.entries(routes)) {
      await go(route);
      const visibleDrawing = await page.evaluate(ids => ids.every(id => {
        const el = document.getElementById(id), c = echarts.getInstanceByDom(el);
        return el.getClientRects().length && c?.getOption().series?.length && c.getZr().storage.getDisplayList().length > 0;
      }), ids);
      assert.ok(visibleDrawing, `${route}: actual canvas display objects required for every chart`);
    }
    const blocked = await browser.newPage();
    await blocked.route('**/vendor/echarts-gl.min.js', route => route.abort());
    await blocked.goto(base + '#carbon-lab'); await blocked.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await blocked.waitForFunction(() => document.getElementById('carbon-lab').dataset.view === '2d');
    assert.ok(await blocked.locator('[data-view="3d"]').isDisabled()); await blocked.close();
    assert.deepEqual(errors, []);
    console.log('PASS: fixed scales across 8 years, visual discoveries, overlap arithmetic, 300/360-cell matrix, values/focus, zoom/Escape, state reload, 8160-row CSV, lazy WebGL, 2D default, fuel/year isolation, dependency failure fallback');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
