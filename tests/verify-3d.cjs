const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/history.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'theme.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'carbon-3d.js'), 'utf8'), context);
const data = context.window.CARBON_HISTORY;
const { buildScene } = context.window.CarbonLab;
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);
let matrices = 0;
for (const year of data.meta.years) {
  for (const province of data.series[String(year)].provinces) {
    const split = buildScene(data, province.name, year, 'split', 'total');
    assert.equal(split.cells.length, 12);
    close(split.cells.reduce((sum, cell) => sum + cell.value[2], 0), province.total);
    for (const mode of ['total', 'urban', 'rural']) {
      const history = buildScene(data, province.name, year, 'history', mode);
      assert.equal(history.cells.length, 48);
      const slice = history.cells.filter(cell => Number(cell.row) === Number(year));
      close(slice.reduce((sum, cell) => sum + cell.value[2], 0), mode === 'total' ? province.total : province[mode + 'Total']);
      assert.ok(history.cells.every(cell => Number.isFinite(cell.value[2]) && cell.value[2] >= 0 && cell.value[2] <= history.scaleMax));
      matrices++;
    }
    assert.ok(split.cells.every(cell => cell.value[2] <= split.scaleMax));
    close(split.scaleMax, buildScene(data, province.name, 2015, 'split', 'total').scaleMax);
    matrices++;
  }
}
console.log(`PASS: ${matrices} scene/mode/year/province matrices and original totals`);

(async () => {
  const output = path.join(__dirname, 'artifacts');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER:', msg.text()); });
  // Test disconnected operation as well as file:// support.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const url = (process.env.TEST_URL || 'http://127.0.0.1:8766/').split('#')[0] + '#carbon-lab';
  const lab = page.locator('#carbon-lab');
  const option = () => page.evaluate(() => echarts.getInstanceByDom(document.querySelector('#profile-chart')).getOption());
  const waitForChart = async type => {
    await page.waitForFunction(expected => {
      const el = document.querySelector('#profile-chart');
      return el && echarts.getInstanceByDom(el)?.getOption().series?.[0]?.type === expected;
    }, type);
    await page.waitForTimeout(700);
  };
  try {
    await page.goto(url);
    await lab.scrollIntoViewIfNeeded();
    await waitForChart('bar3D');
    assert.equal((await option()).series[0].data.length, 10);
    await lab.locator('#lab-other').check();
    assert.equal((await option()).series[0].data.length, 12);
    assert.equal((await option()).grid3D[0].viewControl.autoRotate, false);
    assert.equal(await page.locator('#province-a option').count(), 30);
    const glCanvases = await page.locator('#profile-chart canvas').evaluateAll(canvases => canvases.filter(canvas => {
      try { return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl')); } catch { return false; }
    }).length);
    assert.ok(glCanvases > 0, 'a real WebGL context is required');
    await lab.screenshot({ path: path.join(output, '01-urban-rural-3d.png') });
    const canvas = page.locator('#profile-chart');
    const bounds = await canvas.boundingBox();
    const original = (await option()).grid3D[0].viewControl;
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .6, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const rotated = (await option()).grid3D[0].viewControl;
    assert.ok(Math.abs(original.beta - rotated.beta) > 1, 'mouse drag must rotate the camera');
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(700);
    assert.notEqual((await option()).grid3D[0].viewControl.distance, rotated.distance);
    await lab.locator('[data-camera="default"]').click();
    await page.waitForTimeout(300);
    close((await option()).grid3D[0].viewControl.beta, -24);
    await lab.locator('[data-camera="top"]').click();
    close((await option()).grid3D[0].viewControl.alpha, 80);
    await lab.locator('[data-camera="front"]').click();
    close((await option()).grid3D[0].viewControl.alpha, 8);
    await lab.locator('#lab-auto').click();
    assert.equal((await option()).grid3D[0].viewControl.autoRotate, true);
    await lab.locator('#lab-auto').click();
    await lab.locator('[data-scene="history"]').click();
    await waitForChart('heatmap');
    await lab.locator('[data-view="3d"]').click();
    await waitForChart('bar3D');
    assert.equal((await option()).series[0].data.length, 48);
    await lab.screenshot({ path: path.join(output, '02-eight-year-3d.png') });
    await page.selectOption('#lab-year', '2018');
    assert.equal(await page.inputValue('#year-slider'), '2018');
    const current = (await option()).series[0].data.filter(d => d.cell.selectedYear);
    assert.equal(current.length, 6);
    await page.selectOption('#lab-province', '浙江');
    assert.match(await page.locator('#detail-name').textContent(), /浙江/);
    assert.equal(await page.inputValue('#timeline-province'), '浙江');
    // Removing a province must also remove its series, not leave a merged ghost line.
    await page.locator('[data-province="广东"]').click();
    assert.equal(await page.evaluate(() => echarts.getInstanceByDom(document.querySelector('#trend')).getOption().series.length), 2);
    await page.locator('[data-trend-mode="rural"]').click();
    const rural2018 = (await option()).series[0].data.filter(d => d.cell.row === '2018');
    close(rural2018.reduce((sum, d) => sum + d.value[2], 0), data.series['2018'].provinces.find(p => p.name === '浙江').ruralTotal);
    await lab.locator('[data-view="2d"]').click();
    await waitForChart('heatmap');
    await lab.screenshot({ path: path.join(output, '03-eight-year-2d.png') });
    await lab.locator('[data-scene="split"]').click();
    await lab.locator('[data-view="2d"]').click();
    await waitForChart('bar');
    await lab.locator('summary').click();
    assert.equal(await lab.locator('tbody tr').count(), 2);
    await lab.locator('[data-view="3d"]').click();
    await waitForChart('bar3D');
    await page.setViewportSize({ width: 390, height: 844 });
    await lab.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await lab.screenshot({ path: path.join(output, '04-mobile-3d.png') });
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return /webgl/.test(kind) ? null : originalGetContext.call(this, kind, ...args);
      };
    });
    await fallback.goto(url);
    await fallback.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await fallback.waitForFunction(() => document.querySelector('#carbon-lab')?.dataset.view === '2d');
    assert.ok(await fallback.locator('[data-view="3d"]').isDisabled());
    assert.match(await fallback.locator('#lab-status').textContent(), /WebGL/);
    await fallback.close();
    const contextLoss = await browser.newPage();
    await contextLoss.goto(url);
    await contextLoss.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await contextLoss.waitForFunction(() => echarts.getInstanceByDom(document.querySelector('#profile-chart'))?.getOption().series[0]?.type === 'bar3D');
    await contextLoss.evaluate(() => {
      for (const canvas of document.querySelectorAll('#profile-chart canvas')) {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) { gl.getExtension('WEBGL_lose_context').loseContext(); break; }
      }
    });
    await contextLoss.waitForFunction(() => document.querySelector('#carbon-lab').dataset.view === '2d');
    assert.match(await contextLoss.locator('#lab-status').textContent(), /上下文已丢失/);
    await contextLoss.close();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('file:///' + root.replace(/\\/g, '/') + '/index.html#carbon-lab');
    await lab.scrollIntoViewIfNeeded();
    await waitForChart('bar3D');
    assert.deepEqual(errors, []);
    console.log('PASS: real WebGL, drag, zoom, camera presets, auto-rotation toggle, 12/48 bars, year/province/mode sync, series removal, 2D, table, mobile, no-WebGL/context-loss fallbacks, offline file://');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
