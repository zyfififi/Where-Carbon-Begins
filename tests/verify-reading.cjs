const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(__dirname, 'artifacts');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = process.env.TEST_URL || 'file:///' + root.replace(/\\/g, '/') + '/index.html';
  const wait = () => page.waitForTimeout(150);
  const go = async id => { await page.evaluate(id => document.querySelector(`.chapters a[href="#${id}"]`).click(), id); await wait(); };
  const unitCheck = async ids => {
    const results = await page.evaluate(ids => ids.map(id => {
      const el = document.getElementById(id), chart = echarts.getInstanceByDom(el);
      const gl = chart?.getOption().series?.[0]?.type === 'bar3D' && [...el.querySelectorAll('canvas')].some(c => !!(c.getContext('webgl') || c.getContext('experimental-webgl')));
      return { id, visible: !!el?.getClientRects().length, drawn: gl || chart?.getZr().storage.getDisplayList().length > 0, errors: chart ? CarbonChartPolicy.validate(id, chart.getOption()) : ['no actual instance'] };
    }), ids);
    results.forEach(result => { assert.ok(result.visible && result.drawn, JSON.stringify(result)); assert.deepEqual(result.errors, [], result.id); });
  };
  try {
    await page.goto(url + '#cover');
    // Both entry paths exist, without removing the original free exploration.
    await page.locator('#start-story').click(); await wait();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'atlas');
    assert.equal(await page.inputValue('#global-province'), '河北');
    assert.equal(await page.inputValue('#global-year'), '2022');
    assert.match(await page.locator('#guide-copy').textContent(), /40\.01 Mt/);
    await page.locator('#guide-next').click(); await wait();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'landscape');
    assert.equal(await page.locator('[data-landscape="total"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#guide-copy').textContent(), /0\.298 \/ 0\.371/);
    const totals = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('province-scatter')).getOption().series[1].data.map(p => p.value.slice(0, 2)));
    await page.locator('[data-landscape="percapita"]').click(); await wait();
    const pc = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('province-scatter')).getOption().series[1].data.map(p => p.value.slice(0, 2)));
    assert.notDeepEqual(totals, pc);
    await page.locator('#guide-next').click(); await wait();
    assert.equal(await page.locator('body').getAttribute('data-page'), 'change');
    assert.equal(await page.inputValue('#change-start'), '2015'); assert.equal(await page.inputValue('#change-end'), '2022');
    assert.match(await page.locator('#guide-copy').textContent(), /17\.93.*17\.37/);
    await page.locator('.guide-minimize').click(); assert.equal(await page.locator('.guide-minimize').getAttribute('aria-expanded'), 'true');
    await page.locator('.guide-minimize').click();
    await page.locator('#guide-next').click(); assert.ok(await page.locator('.guided-reading').isHidden());
    await page.locator('#start-story').click(); await go('retrieval'); assert.ok(await page.locator('.guided-reading').isHidden());
    assert.equal(await page.locator('#carbon-retrieval').isVisible(), true);
    assert.equal(await page.locator('.retrieval-result').count(), 4);
    await page.locator('#retrieval-more').click(); assert.equal(await page.locator('.retrieval-result').count(), 8);
    assert.ok(await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('retrieval-preview-chart'))?.getZr().storage.getDisplayList().length > 0));
    assert.ok(await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('retrieval-preview-ring'))?.getZr().storage.getDisplayList().length > 0));
    await page.fill('#retrieval-query', '河北'); await page.selectOption('#retrieval-year', '2022'); await page.selectOption('#retrieval-fuel', 'group:gas'); await page.selectOption('#retrieval-side', 'rural');
    assert.equal(await page.locator('.retrieval-result').count(), 1);
    assert.match(await page.locator('.retrieval-result-source').textContent(), /天然气.*Mt/);
    await page.locator('.retrieval-result').click(); await wait();
    assert.equal(await page.inputValue('#global-province'), '河北'); assert.equal(await page.inputValue('#global-year'), '2022');
    assert.equal(await page.locator('body').getAttribute('data-page'), 'duality');
    assert.ok((await page.locator('#structure-overlap').boundingBox()).y >= 0);
    await go('retrieval');
    await page.locator('#retrieval-reset').click();

    const routes = {
      atlas: ['map'], timeline: ['trend', 'heatmap', 'stacked-area', 'sankey-chart'], retrieval: ['retrieval-preview-chart', 'retrieval-preview-ring'],
      duality: ['overlap-bars', 'a-ring', 'b-ring', 'a-bars', 'b-bars', 'dual-fingerprint', 'dual-percapita'],
      landscape: ['province-scatter', 'province-ranking', 'fuel-fingerprint'],
      change: ['change-waterfall', 'change-fuels', 'change-slope'], passport: ['grain-chart']
    };
    for (const [route, ids] of Object.entries(routes)) {
      await go(route); await unitCheck(ids);
      const links = await page.locator(`#${route} .reading-nav a`).evaluateAll(as => as.map(a => a.hash));
      for (const hash of links) {
        await page.locator(`#${route} .reading-nav a[href="${hash}"]`).click(); await page.waitForTimeout(1000);
        const measured = await page.evaluate(hash => {
          const nav = document.querySelector('main>section:not([hidden]) .reading-nav'), target = document.querySelector(hash);
          return { hash: location.hash, y: scrollY, page: document.body.dataset.page, navTop: nav.getBoundingClientRect().top, navBottom: nav.getBoundingClientRect().bottom, target: target.getBoundingClientRect().top, active: nav.querySelector('[aria-current="location"]')?.hash, viewport: innerHeight };
        }, hash);
        assert.equal(measured.active, hash, `${route}: current marker ${JSON.stringify(measured)}`);
        assert.ok(measured.target >= measured.navBottom - 3, `${route}: anchor hidden by sticky bar ${JSON.stringify(measured)}`);
      }
    }
    // Reload deep links that are generated, not present in static HTML.
    for (const hash of ['#passport-overview', '#change-sides']) {
      await page.goto(url + hash); await wait();
      assert.equal(await page.locator('body').getAttribute('data-page'), hash === '#change-sides' ? 'change' : 'passport');
    }
    await go('duality');
    assert.ok(await page.locator('#overlap-d6').isHidden(), 'secondary coefficient stays behind calculation details');
    await page.selectOption('#global-province', '山西'); await page.selectOption('#global-year', '2020'); await wait();
    assert.match(await page.locator('#duality .reading-context').textContent(), /山西.*2020/);
    await go('timeline');
    assert.match(await page.locator('#timeline .reading-context').textContent(), /山西.*2020/);
    // Exact-zero categories must disappear from composition legends/flow, tiny ones remain.
    for (const name of ['北京', '河北', '海南']) for (const year of ['2015', '2022']) {
      await page.selectOption('#global-province', name); await page.selectOption('#global-year', year); await wait();
      await unitCheck(['stacked-area', 'sankey-chart']);
    }
    await page.locator('#timeline .reading-nav a[href="#timeline-lab"]').click();
    await page.locator('#carbon-lab').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => echarts.getInstanceByDom(document.querySelector('#profile-chart'))?.getOption().series[0]?.type === 'bar3D');
    await unitCheck(['profile-chart']);
    await page.locator('[data-scene="history"]').click(); await unitCheck(['profile-chart']);
    await go('landscape'); await page.locator('#landscape .reading-nav a[href="#landscape-structure"]').click(); await wait();
    await page.locator('#fuel-fingerprint').locator('xpath=ancestor::article[1]').locator('.chart-expand').click();
    assert.ok(await page.locator('#chart-dialog').isVisible()); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#landscape .reading-nav a[aria-current="location"]').getAttribute('href'), '#landscape-structure');
    await go('timeline'); await page.locator('#timeline .reading-nav a[href="#timeline-composition"]').click(); await wait();
    await page.screenshot({ path: path.join(output, 'edition3-timeline.png') });
    await go('landscape'); await page.screenshot({ path: path.join(output, 'edition3-landscape.png'), fullPage: true });
    await go('cover'); await page.locator('#start-story').click(); await page.locator('#guide-next').click(); await wait();
    await page.screenshot({ path: path.join(output, 'edition3-guide.png') });
    // On small screens the guide can be collapsed, links scroll within their bar.
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await go('cover'); await page.locator('#start-story').click(); await wait();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `guide overflow at ${width}`);
      const dock = await page.locator('.guided-reading').boundingBox(); assert.ok(dock.height <= 844 * .5, 'guide must not occupy over half screen');
      await page.locator('.guide-minimize').click(); await page.locator('.guide-exit').click();
      for (const route of Object.keys(routes)) {
        await go(route);
        const last = page.locator(`#${route} .reading-nav a`).last(); await last.click(); await page.waitForTimeout(1000);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`);
        assert.equal(await last.getAttribute('aria-current'), 'location');
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await go('cover'); await page.locator('#start-story').click(); await page.locator('#guide-next').click(); await wait();
    await page.screenshot({ path: path.join(output, 'edition3-mobile-guide.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: 3-step data-driven guide, carbon retrieval and state handoff, exit/minimize, 7 sticky page navigations and generated deep links, same-state context, actual chart units/scales/zero filtering, real 3D/2D, zoom restoration, 320/390/768px guide and navigation.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
