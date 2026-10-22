(function (global) {
  'use strict';
  const T = global.CarbonTheme;
  const sum = values => values.reduce((a, b) => a + b, 0);
  const value = (p, side, group) => sum(group.indices.map(i => p[side][i]));
  const group4 = [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 14, 15], [13], [16]];
  const distance = (u, r) => {
    const su = sum(u), sr = sum(r);
    return su > 0 && sr > 0 ? .5 * sum(u.map((v, i) => Math.abs(v / su - r[i] / sr))) : null;
  };
  function structure(p, groups) {
    const u = groups.map(g => value(p, 'urban', g)), r = groups.map(g => value(p, 'rural', g));
    const shares = groups.map((g, i) => ({ ...g, urban: u[i] / p.urbanTotal, rural: r[i] / p.ruralTotal,
      shared: Math.min(u[i] / p.urbanTotal, r[i] / p.ruralTotal) }));
    return { shares, d17: distance(p.urban, p.rural), d6: distance(u, r),
      d4: distance(group4.map(indices => sum(indices.map(i => p.urban[i]))), group4.map(indices => sum(indices.map(i => p.rural[i])))),
      overlap: sum(shares.map(g => g.shared)) };
  }
  function national(data, year) {
    const provinces = data.series[String(year)].provinces;
    const urban = Array(17).fill(0), rural = Array(17).fill(0);
    for (const p of provinces) for (let i = 0; i < 17; i++) { urban[i] += p.urban[i]; rural[i] += p.rural[i]; }
    return { urban, rural, urbanTotal: sum(urban), ruralTotal: sum(rural), total: sum(urban) + sum(rural),
      population: provinces.every(p => p.population) ? { urban: sum(provinces.map(p => p.population.urban)), rural: sum(provinces.map(p => p.population.rural)) } : null };
  }
  function mapScale(data, metric) {
    if (metric !== 'total') return { min: 0, max: 1 };
    const max = Math.max(...data.meta.years.flatMap(y => data.series[String(y)].provinces.map(p => p.total)));
    return { min: 0, max: Math.ceil(max / 5) * 5 };
  }
  function labelColor(echarts, fraction) {
    const rgb = echarts.color.parse(echarts.color.lerp(Math.max(0, Math.min(1, fraction)), T.ramp));
    const linear = rgb.slice(0, 3).map(c => c / 255 <= .04045 ? c / 255 / 12.92 : ((c / 255 + .055) / 1.055) ** 2.4);
    return sum(linear.map((c, i) => c * [.2126, .7152, .0722][i])) > .179 ? '#000000' : '#ffffff';
  }
  const params = () => new URLSearchParams(global.location.search);
  function readAppState(data) {
    const q = params(), lastYear = data.meta.years.at(-1), names = data.series[String(lastYear)].provinces.map(p => p.name);
    const name = (key, fallback) => names.includes(q.get(key)) ? q.get(key) : fallback;
    const years = data.meta.years.map(Number), y = Number(q.get('y'));
    const metric = ['total', 'ruralShare', 'difference'].includes(q.get('m')) ? q.get('m') : 'total';
    const compare = (q.get('compare') || '河北,浙江,广东').split(',').filter((n, i, a) => names.includes(n) && a.indexOf(n) === i).slice(0, 4);
    const selected = name('p', '河北');
    return { selected, timelineProvince: selected, year: years.includes(y) ? y : lastYear, metric,
      a: name('a', '河北'), b: name('b', '浙江'), timelineProvinces: compare.length ? compare : [selected],
      timelineMode: ['total', 'urban', 'rural'].includes(q.get('trend')) ? q.get('trend') : 'total' };
  }
  function csv(rows) {
    const escape = cell => '"' + String(cell ?? '').replace(/"/g, '""') + '"';
    return '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n');
  }
  function download(name, rows) {
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function detailRows(data, years = data.meta.years) {
    const fuelNames = data.meta.fuels || data.meta.fuelNames;
    const names = Array.isArray(fuelNames) ? fuelNames.map(f => typeof f === 'string' ? f : f.name) : '原煤 洗精煤 其他洗煤 型煤 焦炭 焦炉煤气 其他煤气 其他焦化产品 原油 汽油 煤油 柴油 燃料油 液化石油气 炼厂干气 其他石油制品 天然气'.split(' ');
    const rows = [['年份', '省份', '生活部门', '原始燃料', '直接CO2排放_Mt', '部门总量_Mt', '部门燃料占比', '年末人口_万人', '部门人均_tCO2每人', '城乡差异D_17类']];
    for (const y of years) for (const p of data.series[String(y)].provinces) for (const side of ['urban', 'rural'])
      p[side].forEach((v, i) => rows.push([y, p.name, side === 'urban' ? '城镇' : '农村', names[i], v, p[side + 'Total'], v / p[side + 'Total'], p.population?.[side] ?? '', p.population?.[side] > 0 ? p[side + 'Total'] * 100 / p.population[side] : '', p.difference]));
    return rows;
  }
  function tableHTML(headers, rows, caption) {
    return `<table><caption>${caption}</caption><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((v, i) => i ? `<td>${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function install({ data, getState, getExtras, onDiscover }) {
    const $ = s => document.querySelector(s), fmt = (v, n = 2) => Number.isFinite(v) ? v.toFixed(n) : '—';
    const groups = data.meta.groups, ec = global.echarts;
    const svg = content => `<svg viewBox="0 0 320 125" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
    const firstYear = data.meta.years[0], lastYear = data.meta.years.at(-1);
    const before = data.series[String(firstYear)].provinces.find(p => p.name === '河北'), after = data.series[String(lastYear)].provinces.find(p => p.name === '河北');
    const hebei = [before, after].map((p, row) => {
      let x = 55;
      return `<text x="0" y="${34 + row * 48}">${p.year || (row ? lastYear : firstYear)}</text>` + groups.map((g, i) => {
        const width = (value(p, 'urban', g) + value(p, 'rural', g)) / 45 * 225;
        const rect = `<rect x="${x}" y="${20 + row * 48}" width="${width}" height="23" fill="${T.fuel[i]}"/>`; x += width; return rect;
      }).join('') + `<text x="${x + 6}" y="${36 + row * 48}">${fmt(p.total, 1)}</text>`;
    }).join('');
    $('#discover-hebei').innerHTML = svg(hebei + '<text x="55" y="119">同一标尺 · Mt CO₂</text>');
    const n = national(data, lastYear), pc = [n.urbanTotal * 100 / n.population.urban, n.ruralTotal * 100 / n.population.rural];
    $('#discover-population').innerHTML = svg([['总量 Mt', n.urbanTotal, n.ruralTotal, 300], ['人均 t/人', pc[0], pc[1], .4]].map((r, i) => `<text x="0" y="${20 + i * 60}">${r[0]}</text>` + [r[1], r[2]].map((v, side) => `<rect x="93" y="${7 + i * 60 + side * 22}" width="${v / r[3] * 170}" height="14" fill="${side ? T.rural : T.urban}"/><text x="${99 + v / r[3] * 170}" y="${20 + i * 60 + side * 22}">${fmt(v, i ? 3 : 0)}</text>`).join('')).join(''));
    const sample = structure(after, groups);
    $('#discover-grain').innerHTML = svg(['urban', 'rural'].map((side, row) => {
      let x = 55;
      return `<text x="0" y="${34 + row * 48}">${row ? '农村' : '城镇'}</text>` + sample.shares.map((g, i) => {
        const width = g[side] * 250, rect = `<rect x="${x}" y="${20 + row * 48}" width="${width}" height="23" fill="${T.fuel[i]}"/>`; x += width; return rect;
      }).join('');
    }).join('') + '<text x="55" y="119">各自 100% · 六组燃料</text>');
    const q = params(); let overlapFuel = groups.some(g => g.id === q.get('overlap')) ? q.get('overlap') : 'all';
    let overlapChart = null, grainChart = null;
    $('#overlap-fuels').innerHTML = '<button type="button" data-overlap="all">全部燃料</button>' + groups.filter(g => g.id !== 'other').map((g, i) => `<button type="button" data-overlap="${g.id}"><i style="background:${T.fuel[i]}"></i>${g.name}</button>`).join('');
    $('#overlap-fuels').addEventListener('click', e => { const b = e.target.closest('[data-overlap]'); if (b) { overlapFuel = b.dataset.overlap; renderOverlap(); } });
    document.querySelectorAll('[data-discover]').forEach(b => b.addEventListener('click', () => onDiscover(b.dataset.discover)));
    $('#export-all').addEventListener('click', () => download(`碳从哪里来_${data.meta.years[0]}-${data.meta.years.at(-1)}_17类燃料明细.csv`, detailRows(data)));
    $('#export-matrix').addEventListener('click', () => download(`城乡燃料明细_${getState().year}.csv`, detailRows(data, [getState().year])));
    $('#export-trend').addEventListener('click', () => {
      const s = getState(), rows = [['年份', '省份', '口径', '直接CO2排放_Mt']];
      for (const y of data.meta.years) for (const name of s.timelineProvinces) { const p = data.series[String(y)].provinces.find(p => p.name === name); rows.push([y, name, s.timelineMode, s.timelineMode === 'total' ? p.total : p[s.timelineMode + 'Total']]); }
      download('多省历年趋势.csv', rows);
    });
    function renderOverlap() {
      const s = getState(), p = data.series[String(s.year)].provinces.find(p => p.name === s.selected), m = structure(p, groups);
      $('#overlap-context').textContent = `${p.name} · ${s.year}`;
      $('#overlap-d17').textContent = fmt(m.d17, 3); $('#overlap-d6').textContent = fmt(m.d6, 3);
      $('#overlap-common').textContent = `${fmt(m.overlap * 100, 1)}%`;
      $('#overlap-meter-shared').style.width = `${m.overlap * 100}%`;
      $('#overlap-meter-gap').style.width = `${m.d6 * 100}%`;
      document.querySelectorAll('[data-overlap]').forEach(b => { b.classList.toggle('active', b.dataset.overlap === overlapFuel); b.setAttribute('aria-pressed', String(b.dataset.overlap === overlapFuel)); });
      const focus = m.shares.find(g => g.id === overlapFuel) || [...m.shares].sort((a, b) => Math.abs(b.urban - b.rural) - Math.abs(a.urban - a.rural))[0];
      $('#overlap-readout').textContent = `${focus.name}：城镇 ${fmt(focus.urban * 100, 1)}% / 农村 ${fmt(focus.rural * 100, 1)}%，${focus.urban >= focus.rural ? '城镇' : '农村'}高 ${fmt(Math.abs(focus.urban - focus.rural) * 100, 1)} 个百分点。`;
      if (!$('#overlap-bars').getClientRects().length) return;
      overlapChart ||= ec.init($('#overlap-bars'));
      overlapChart.setOption(T.chartOptions({ animationDuration: 300, grid: { left: 8, right: 12, top: 22, bottom: 44, containLabel: true },
        tooltip: { confine: true, backgroundColor: T.surface, textStyle: { color: T.ink }, trigger: 'item', formatter: p => `${p.name} · ${p.seriesName}<br>${fmt(p.value, 3)}%` },
        xAxis: { type: 'value', min: 0, max: 100, name: '%', axisLabel: { color: T.muted, formatter: '{value}%' }, splitLine: { lineStyle: { color: T.grid } } },
        yAxis: { type: 'category', inverse: true, data: ['城镇', '农村'], axisLabel: { color: T.ink }, axisLine: { show: false }, axisTick: { show: false } },
        series: m.shares.map((g, i) => ({ ...g, color: T.fuel[i] })).filter(g => global.CarbonChartPolicy.hasPositive([g.urban, g.rural])).map(g => ({ name: g.name, type: 'bar', stack: 'composition', barWidth: 40,
          itemStyle: { color: g.color, opacity: overlapFuel === 'all' || overlapFuel === g.id ? 1 : .16 },
          label: { show: false }, data: [g.urban * 100, g.rural * 100] })) }), { notMerge: true });
      $('#overlap-detail').innerHTML = tableHTML(['燃料组', '城镇占比', '农村占比', '共同部分（较小占比）'], m.shares.map(g => [g.name, fmt(g.urban * 100, 4) + '%', fmt(g.rural * 100, 4) + '%', fmt(g.shared * 100, 4) + '%']), `${p.name} ${s.year}；全部六组与极小余量均计入，未重新归一`);
    }
    function renderPassport() {
      const rows = data.meta.years.map(y => { const p = national(data, y), m = structure(p, groups); return [Number(y), m.d4, m.d6, m.d17]; });
      $('#grain-table').innerHTML = tableHTML(['年份', '4 类 D', '6 组 D', '17 类 D'], rows.map(r => [r[0], ...r.slice(1).map(v => fmt(v, 6))]), '先合计 30 省各燃料排放，再计算汇总城乡结构差异；不是各省 D 的平均');
      if (!$('#grain-chart').getClientRects().length) return;
      grainChart ||= ec.init($('#grain-chart'));
      grainChart.setOption(T.chartOptions({ grid: { left: 12, right: 24, top: 55, bottom: 20, containLabel: true },
        legend: { top: 0, data: ['4 类', '6 组', '17 类'], textStyle: { color: T.ink } },
        tooltip: { trigger: 'axis', confine: true, backgroundColor: T.surface, textStyle: { color: T.ink }, valueFormatter: v => fmt(v, 6) },
        xAxis: { type: 'category', data: rows.map(r => r[0]), axisLabel: { color: T.muted } },
        yAxis: { type: 'value', min: 0, max: 1, name: 'D（0—1）', splitLine: { lineStyle: { color: T.grid } }, axisLabel: { color: T.muted } },
        series: ['4 类', '6 组', '17 类'].map((name, i) => ({ name, type: 'line', smooth: false, symbolSize: 7, itemStyle: { color: [T.blue, T.ochre, T.urban][i] }, data: rows.map(r => r[i + 1]) })) }), { notMerge: true });
    }
    function render() {
      renderOverlap(); renderPassport();
      const s = getState(), rows = data.meta.years.map(y => [y, ...s.timelineProvinces.map(name => { const p = data.series[String(y)].provinces.find(p => p.name === name); return fmt(s.timelineMode === 'total' ? p.total : p[s.timelineMode + 'Total'], 6); })]);
      $('#trend-table').innerHTML = tableHTML(['年份', ...s.timelineProvinces], rows, `当前多省比较 · ${s.timelineMode === 'total' ? '城乡合计' : s.timelineMode === 'urban' ? '城镇' : '农村'} · Mt CO₂`);
    }
    function syncURL() {
      const s = getState(), extra = { ...getExtras(), overlap: overlapFuel };
      const q = new URLSearchParams({ p: s.selected, y: s.year, m: s.metric, a: s.a, b: s.b, compare: s.timelineProvinces.join(','), trend: s.timelineMode, ...extra });
      history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
    }
    let syncTimer;
    const schedule = () => { clearTimeout(syncTimer); syncTimer = setTimeout(() => { render(); syncURL(); }, 0); };
    document.addEventListener('change', schedule); document.addEventListener('click', schedule);
    // Controls inside a hidden route can fire before their page is re-rendered;
    // sync the state again after the browser has applied the control value.
    document.addEventListener('input', schedule);
    $('#share-state').addEventListener('click', async () => {
      syncURL(); const field = $('#share-url'); field.value = location.href; field.hidden = false; field.select();
      try { await navigator.clipboard.writeText(location.href); $('#share-status').textContent = '链接已复制，打开可恢复省份、年份、对照与视图。'; }
      catch (_) { $('#share-status').textContent = '链接已生成，请复制下方地址。file:// 链接仅适用于同一路径的本机；部署后可跨设备分享。'; }
    });
    function installZoom() {
      const dialog = $('#chart-dialog'); let active = null, marker = null, trigger = null;
      function restore() { if (active) { active.classList.remove('is-expanded'); marker.replaceWith(active); active = marker = null; global.dispatchEvent(new Event('resize')); trigger?.focus({ preventScroll: true }); } }
      $('#close-chart').addEventListener('click', () => { dialog.close(); restore(); }); dialog.addEventListener('close', restore);
      dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.close(); restore(); });
      document.querySelectorAll('.viz-panel, .duality-card').forEach(panel => {
        const head = panel.querySelector('.viz-panel-head, .duality-card-head, .lab-header'); if (!head) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chart-expand'; b.textContent = '⤢ 放大'; b.setAttribute('aria-label', `放大：${head.textContent.trim()}`);
        b.addEventListener('click', () => { trigger = b; marker = document.createElement('div'); panel.before(marker); active = panel; $('#chart-dialog-body').append(panel); panel.classList.add('is-expanded'); dialog.showModal(); global.dispatchEvent(new Event('resize')); }); head.append(b);
      });
      global.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });
    }
    installZoom();
    return { render, syncURL, restoreURL() { const q = params(); overlapFuel = groups.some(g => g.id === q.get('overlap')) ? q.get('overlap') : 'all'; }, resize() { [overlapChart, grainChart].forEach(c => { if (c?.getDom().getClientRects().length) c.resize(); }); } };
  }
  global.CarbonInsights = { structure, national, distance, mapScale, labelColor, readAppState, params, csv, detailRows, download, tableHTML, install };
})(window);
