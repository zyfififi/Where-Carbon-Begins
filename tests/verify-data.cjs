// Portable layer: Node built-ins only. This does not claim to verify rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..'), context = { window: {} };
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function close(a, b, message) { check(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`); }
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
for (const file of ['data/history.js', 'theme.js', 'chart-policy.js', 'insights.js', 'analysis.js', 'carbon-3d.js', 'reading.js']) vm.runInNewContext(source(file), context, { filename: file });
for (const file of ['app.js', 'routes.js']) new vm.Script(source(file), { filename: file });
const w = context.window, data = w.CARBON_HISTORY, I = w.CarbonInsights, P = w.CarbonChartPolicy;
const years = data.meta.years.map(Number), sum = xs => xs.reduce((a, b) => a + b, 0);
check(data.meta.unit === 'Mt CO₂', 'source unit');
const indices = data.meta.groups.flatMap(g => g.indices).sort((a, b) => a - b);
check(JSON.stringify(indices) === JSON.stringify(Array.from({ length: 17 }, (_, i) => i)), 'fuel groups partition 17 fuels exactly');
for (const year of years) {
  check(data.series[year].provinces.length === 30, `${year}: province coverage`);
  for (const p of data.series[year].provinces) {
    for (const side of ['urban', 'rural']) {
      check(p[side].length === 17 && p[side].every(v => Number.isFinite(v) && v >= 0), `${p.name}/${year}: valid raw fuels`);
      close(sum(p[side]), p[side + 'Total'], 'raw side sum');
    }
    close(p.urbanTotal + p.ruralTotal, p.total, 'total');
    close(p.ruralTotal / p.total, p.ruralShare, 'rural share');
    const s = I.structure(p, data.meta.groups);
    close(s.d17, p.difference, 'D17 identity'); close(s.overlap + s.d6, 1, 'six-group overlap identity');
    check(s.d4 <= s.d6 + 1e-12 && s.d6 <= s.d17 + 1e-12, 'granularity cannot increase on aggregation');
    close(sum(s.shares.map(g => g.urban)), 1, 'complete urban denominator'); close(sum(s.shares.map(g => g.rural)), 1, 'complete rural denominator');
    const m = w.CarbonAnalysis.landscapeModel(data, year).find(x => x.name === p.name);
    if (year === 2015) check(m.urbanPC === null && m.ruralPC === null, '2015 NA preserved');
    else { close(m.urbanPC, p.urbanTotal * 100 / p.population.urban, 'urban population unit'); close(m.ruralPC, p.ruralTotal * 100 / p.population.rural, 'rural population unit'); }
    for (const [scene, modes] of [['split', ['total']], ['history', ['total', 'urban', 'rural']]]) for (const mode of modes) {
      const model = w.CarbonLab.buildScene(data, p.name, year, scene, mode);
      check(model.cells.length === (scene === 'split' ? 12 : 48), 'complete 3D matrix');
      check(model.cells.every(c => c.value[2] >= 0 && c.value[2] <= model.scaleMax), '3D fixed height covers all values');
      if (scene === 'split') close(sum(model.cells.map(c => c.value[2])), p.total, '3D total');
    }
  }
}
for (const p of data.series['2022'].provinces) for (let a = 0; a < years.length; a++) for (let b = a + 1; b < years.length; b++) {
  const m = w.CarbonAnalysis.changeModel(data, p.name, years[a], years[b]);
  close(sum(m.deltas.map(d => d.value)), m.net, '840 interval fuel delta');
  close(m.before.total + m.net, m.after.total, 'bridge balance');
}
check(P.hasPositive([0, 0]) === false && P.hasPositive([0, .00000001]) === true, 'exclude zero, preserve tiny positives');
check(P.hasDelta([0, 0]) === false && P.hasDelta([-1, 0]) === true, 'zero delta filtering');
// Fault injection proves chart rules reject broken options, not just valid data.
check(P.validate('stacked-area', { yAxis: [{ name: 'Mt CO₂' }], series: [{ data: [0, 0] }] }).includes('all-zero composition series'), 'reject empty legend series');
check(P.validate('sankey-chart', { series: [{ data: [{ name: 'a' }, { name: 'orphan' }], links: [{ source: 'a', target: 'b', value: 0 }] }] }).length === 2, 'reject zero links and orphan nodes');
check(P.validate('a-bars', { series: [{}], xAxis: [{ name: '' }] }).includes('absolute axes have no unit'), 'reject absent axis unit');
const rows = I.detailRows(data);
check(rows.length === 8161, '8160 export records');
check(rows.slice(1).filter(r => Number(r[0]) === 2015).every(r => r[7] === '' && r[8] === ''), 'CSV NA not zero');
close(sum(rows.slice(1).map(r => r[4])), sum(years.map(y => I.national(data, y).total)), 'export conservation');
const html = source('index.html'), app = source('app.js'), reading = source('reading.js'), lab = source('carbon-3d.js');
const ids = [...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]);
check(new Set(ids).size === ids.length, 'unique static HTML IDs');
for (const match of html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)) check(fs.existsSync(path.join(root, match[1])), `local asset ${match[1]}`);
const allMarkup = html + app + reading + lab;
for (const id of Object.keys(P.contracts)) check(allMarkup.includes(`id="${id}"`), `chart DOM contract: ${id}`);
for (const page of Object.values(w.CarbonReading.pages)) for (const [id] of page.zones) check(allMarkup.includes(`id="${id}"`) || app.includes(`zone('${id}'`) || reading.includes(`.id = '${id}'`), `anchor contract: ${id}`);
const steps = w.CarbonReading.tourSteps(data);
check(steps.length === 3 && steps[1].copy.includes('0.298 / 0.371'), 'guided story derives from actual population');
check(!html.includes('为什么有三个 D'), 'no competing D metrics in entry discovery');
console.log(`PASS: ${checks} dependency-free checks; 240 province-years, 840 intervals, 960 3D models, export/NA, chart-rule fault injection, assets and DOM/anchor contracts. Rendering is verified separately.`);
