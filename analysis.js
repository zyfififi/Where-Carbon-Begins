(function (global) {
  'use strict';
  const T = global.CarbonTheme;
  const I = global.CarbonInsights;
  const P = global.CarbonChartPolicy;
  const C = { ...T, a: T.urban, b: T.blue };
  const fuelColors = T.fuel;
  const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const signed = value => `${value > 0 ? '+' : ''}${fmt(value)}`;
  const niceMax = value => {
    if (!(value > 0)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    return Math.ceil(value / magnitude * 2) / 2 * magnitude;
  };
  const groupValue = (p, group, side) => group.indices.reduce((sum, index) => sum + p[side][index], 0);
  const totalGroup = (p, group) => groupValue(p, group, 'urban') + groupValue(p, group, 'rural');
  const perCapita = (p, side) => p.population?.[side] > 0 ? p[side + 'Total'] * 100 / p.population[side] : null;
  const province = (data, year, name) => data.series[String(year)].provinces.find(p => p.name === name);

  function dualModel(data, year, a, b) {
    const entries = [a, b].map(name => {
      const p = province(data, year, name);
      return { ...p, groups: data.meta.groups.map(g => ({ name: g.name, id: g.id, urban: groupValue(p, g, 'urban'), rural: groupValue(p, g, 'rural'), share: p.total > 0 ? totalGroup(p, g) / p.total : 0 })), perCapita: { urban: perCapita(p, 'urban'), rural: perCapita(p, 'rural') } };
    });
    return { entries, max: niceMax(Math.max(...entries.flatMap(p => p.groups.map(g => g.urban + g.rural)), 1) * 1.12) };
  }

  function landscapeModel(data, year) {
    return data.series[String(year)].provinces.map(p => ({ ...p, urbanPC: perCapita(p, 'urban'), ruralPC: perCapita(p, 'rural'), shares: data.meta.groups.map(g => p.total > 0 ? totalGroup(p, g) / p.total : 0) }));
  }

  function changeModel(data, name, start, end) {
    const before = province(data, start, name), after = province(data, end, name);
    const deltas = data.meta.groups.map(g => ({ id: g.id, name: g.name, urban: groupValue(after, g, 'urban') - groupValue(before, g, 'urban'), rural: groupValue(after, g, 'rural') - groupValue(before, g, 'rural'), value: totalGroup(after, g) - totalGroup(before, g) }));
    let running = before.total;
    const bridge = [{ name: String(start), low: 0, high: before.total, value: before.total, endpoint: true }];
    deltas.forEach(d => { const next = running + d.value; bridge.push({ ...d, low: Math.min(running, next), high: Math.max(running, next), endpoint: false }); running = next; });
    bridge.push({ name: String(end), low: 0, high: after.total, value: after.total, endpoint: true });
    return { name, start, end, before, after, deltas, bridge, net: after.total - before.total };
  }

  function create({ data, echarts, getState, onSelect }) {
    const $ = s => document.querySelector(s);
    const registry = new Map();
    let fuelFocus = 'all', landscapeMode = 'percapita';
    let start = Number(data.meta.years[0]), end = Number(data.meta.years.at(-1));
    const populationYears = data.meta.populationYears || data.meta.years.filter(y => data.series[String(y)].provinces.every(p => p.population));
    const populationRange = populationYears.length ? `${populationYears[0]}—${populationYears.at(-1)}` : '当前数据中有可用人口的年份';
    const tooltip = { confine: true, backgroundColor: T.surface, borderColor: T.line, textStyle: { color: C.ink, fontSize: 11 }, extraCssText: 'box-shadow:0 6px 24px rgba(38,61,50,.12);' };
    const axis = { axisLine: { lineStyle: { color: '#adbea4' } }, axisTick: { show: false }, axisLabel: { color: C.muted, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } };
    const groups = data.meta.groups;
    function restoreURL() {
      const q = I.params();
      landscapeMode = q.get('coord') === 'total' ? 'total' : 'percapita';
      fuelFocus = groups.some(g => g.id === q.get('fuel')) ? q.get('fuel') : 'all';
      const years = data.meta.years.map(Number), a = Number(q.get('from')), b = Number(q.get('to'));
      start = years.includes(a) ? a : years[0]; end = years.includes(b) && b > start ? b : years.at(-1);
      if (start >= end) start = years[0];
      $('#change-start').value = start; $('#change-end').value = end;
      $('#fingerprint-sort').value = ['total', 'difference', 'coal', 'gas'].includes(q.get('sort')) ? q.get('sort') : 'difference';
      $('#fingerprint-focus').value = groups.some(g => g.id === q.get('matrix')) ? q.get('matrix') : 'all';
      $('#fingerprint-values').checked = q.get('values') === '1'; $('#fingerprint-other').checked = q.get('other') === '1';
      $('#dual-other').checked = q.get('dualother') === '1';
      document.querySelectorAll('[data-landscape]').forEach(b => { const active = b.dataset.landscape === landscapeMode; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
      $('#fuel-focus').querySelectorAll('[data-fuel]').forEach(b => { const active = b.dataset.fuel === fuelFocus; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    }
    $('#fingerprint-focus').innerHTML = '<option value="all">全部燃料</option>' + groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    const shortName = name => name === '煤及煤制品' ? '煤及煤制品' : name;
    function chart(id) {
      const el = document.getElementById(id);
      if (!el.getClientRects().length) return null;
      if (!registry.has(id)) registry.set(id, echarts.init(el, null, { devicePixelRatio: Math.min(global.devicePixelRatio || 1, 2) }));
      return registry.get(id);
    }
    function set(id, options) {
      const instance = chart(id);
      if (instance) instance.setOption(T.chartOptions({ animationDuration: 350, ...options }), { notMerge: true });
      return instance;
    }
    function linkProvince(instance) {
      if (!instance) return;
      instance.off('click');
      instance.on('click', event => { const name = event.data?.provinceName || event.data?.name; if (name && data.series[String(getState().year)].provinces.some(p => p.name === name)) onSelect(name); });
    }
    $('#fuel-focus').innerHTML = `<span>同步聚焦</span><button type="button" data-fuel="all" class="active" aria-pressed="true">全部燃料</button>` + groups.filter(g => g.id !== 'other').map((g, i) => `<button type="button" data-fuel="${g.id}" aria-pressed="false"><i style="background:${fuelColors[i]}"></i>${g.name}</button>`).join('') + '<label class="show-other"><input id="dual-other" type="checkbox"> 展开极小余量</label>';
    $('#dual-other').addEventListener('change', renderDuality);
    $('#fuel-focus').addEventListener('click', event => {
      const button = event.target.closest('[data-fuel]');
      if (!button) return;
      fuelFocus = button.dataset.fuel;
      $('#fuel-focus').querySelectorAll('button').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      renderDuality();
    });

    function renderDuality() {
      const state = getState(), model = dualModel(data, state.year, state.a, state.b);
      const visible = groups.map((g, i) => i).filter(i => (groups[i].id !== 'other' || $('#dual-other').checked) && P.hasPositive(model.entries.flatMap(p => [p.groups[i].urban, p.groups[i].rural])));
      const visibleGroups = visible.map(i => groups[i]);
      const width = $('#duality').clientWidth;
      model.entries.forEach((p, index) => {
        const key = index ? 'b' : 'a';
        $('#' + key + '-name').textContent = p.name;
        $('#' + key + '-total').textContent = fmt(p.total);
        $('#' + key + '-shares').innerHTML = `<div><i class="urban-dot"></i>城镇<strong>${fmt(p.urbanTotal)}<small>Mt</small></strong><span>${fmt(p.total ? p.urbanTotal / p.total * 100 : 0, 1)}%</span></div><div><i class="rural-dot"></i>农村<strong>${fmt(p.ruralTotal)}<small>Mt</small></strong><span>${fmt(p.total ? p.ruralTotal / p.total * 100 : 0, 1)}%</span></div>`;
        set(key + '-ring', {
          tooltip: { ...tooltip, trigger: 'item', formatter: params => `${p.name} · ${params.name}<br>${fmt(params.value, 3)} Mt CO₂ · ${fmt(params.percent, 1)}%` },
          title: { text: `${fmt(p.total ? p.ruralTotal / p.total * 100 : 0, 1)}%`, subtext: '农村排放占比', left: 'center', top: '34%', itemGap: 7, textStyle: { fontSize: 23, fontWeight: 400, color: C.rural }, subtextStyle: { color: C.muted, fontSize: 9 } },
          series: [{ type: 'pie', radius: ['69%', '86%'], center: ['50%', '50%'], startAngle: 90, label: { show: false }, emphasis: { scale: false }, itemStyle: { borderColor: T.surface, borderWidth: 3 }, data: [{ name: '城镇', value: p.urbanTotal, itemStyle: { color: C.urban } }, { name: '农村', value: p.ruralTotal, itemStyle: { color: C.rural } }] }]
        });
        set(key + '-bars', {
          grid: { left: 8, right: 20, top: 18, bottom: 20, containLabel: true },
          tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: params => { const g = p.groups[visible[params[0].dataIndex]]; return `${p.name} · ${g.name}<br>城镇 ${fmt(g.urban, 6)} Mt<br>农村 ${fmt(g.rural, 6)} Mt<br>合计 ${fmt(g.urban + g.rural, 6)} Mt`; } },
          xAxis: { ...axis, type: 'value', min: 0, max: model.max, splitNumber: 3, name: 'Mt CO₂', nameLocation: 'middle', nameGap: 30 },
          yAxis: { ...axis, type: 'category', inverse: true, data: visible.map(i => p.groups[i].name), splitLine: { show: false } },
          series: ['urban', 'rural'].map(side => ({ name: side === 'urban' ? '城镇' : '农村', type: 'bar', stack: 'fuel', barWidth: 12, itemStyle: { color: C[side] }, data: visible.map(i => p.groups[i]).map(g => ({ value: g[side], itemStyle: { opacity: fuelFocus === 'all' || fuelFocus === g.id ? 1 : .15 } })) }))
        });
        const leading = [...p.groups].sort((a, b) => b.share - a.share)[0];
        const other = p.groups.find(g => g.id === 'other');
        $('#' + key + '-copy').textContent = `${p.name} · ${state.year}：${leading.name}占城乡合计的 ${fmt(leading.share * 100, 1)}%；D₁₇ = ${fmt(p.difference, 3)}。其他油品 ${fmt(other.urban + other.rural, 6)} Mt（${fmt(other.share * 100, 4)}%），总量与比例始终计入。`;
      });
      const [a, b] = model.entries;
      const lines = visible.map((i, row) => [Math.min(a.groups[i].share, b.groups[i].share) * 100, row, Math.max(a.groups[i].share, b.groups[i].share) * 100]);
      set('dual-fingerprint', {
        grid: { left: 8, right: 24, top: 60, bottom: 18, containLabel: true },
        tooltip: { ...tooltip, trigger: 'item', formatter: params => { const i = visible[params.value[1]]; return `${groups[i].name}<br>${a.name} ${fmt(a.groups[i].share * 100, 1)}%<br>${b.name} ${fmt(b.groups[i].share * 100, 1)}%`; } },
        legend: { top: 5, right: 12, data: [a.name + ' A', b.name + ' B'], textStyle: { color: C.muted, fontSize: 10 } },
        xAxis: { ...axis, type: 'value', min: 0, max: 100, axisLabel: { color: C.muted, fontSize: 10, formatter: '{value}%' } },
        yAxis: { ...axis, type: 'category', inverse: true, data: visibleGroups.map(g => g.name), splitLine: { show: false } },
        series: [{ type: 'custom', silent: true, data: lines, renderItem: (params, api) => { const p1 = api.coord([api.value(0), api.value(1)]), p2 = api.coord([api.value(2), api.value(1)]); return { type: 'line', shape: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, style: { stroke: '#a5b79b', lineWidth: 2 } }; } }, ...[a, b].map((p, pi) => ({ name: p.name + (pi ? ' B' : ' A'), type: 'scatter', symbol: pi ? 'diamond' : 'circle', symbolSize: 11, itemStyle: { color: pi ? C.b : C.a }, data: visible.map(i => p.groups[i]).map((g, i) => ({ value: [g.share * 100, i], itemStyle: { opacity: fuelFocus === 'all' || fuelFocus === g.id ? 1 : .2 } })) }))]
      });
      const hasPopulation = model.entries.every(p => Number.isFinite(p.perCapita.urban) && Number.isFinite(p.perCapita.rural));
      $('#dual-pop-note').textContent = hasPopulation ? 'Mt × 100 ÷ 人口（万人）＝t CO₂ / 人；按年末人口近似归一，不是完整生活碳足迹。' : `${state.year} 年人口缺失：不填零、不插值。可切到 ${populationRange} 年查看。`;
      set('dual-percapita', {
        grid: { left: 12, right: 24, top: 64, bottom: 20, containLabel: true },
        legend: { top: 5, right: 12, textStyle: { color: C.muted, fontSize: 10 } },
        tooltip: { ...tooltip, trigger: 'axis', valueFormatter: value => Number.isFinite(value) ? `${fmt(value, 3)} t / 人` : '人口缺失' },
        graphic: hasPopulation ? [] : [{ type: 'text', left: 'center', top: '45%', style: { text: '这一年，人口数据暂缺', fill: C.muted, fontSize: 13 } }],
        xAxis: { ...axis, type: 'category', data: [a.name + ' A', b.name + ' B'] },
        yAxis: { ...axis, type: 'value', min: 0, name: 't CO₂ / 人', nameTextStyle: { color: C.muted, fontSize: 10 } },
        series: ['urban', 'rural'].map(side => ({ name: side === 'urban' ? '城镇' : '农村', type: 'bar', barMaxWidth: width < 600 ? 22 : 35, itemStyle: { color: C[side] }, data: model.entries.map(p => p.perCapita[side] ?? null) }))
      });
      $('#duality-takeaway').textContent = `${state.year} · ${a.name} / ${b.name}`;
    }

    function renderLandscape() {
      const state = getState(), entries = landscapeModel(data, state.year);
      const available = entries.every(p => Number.isFinite(p.urbanPC) && Number.isFinite(p.ruralPC));
      const usePC = landscapeMode === 'percapita' && available;
      const unit = usePC ? 't CO₂ / 人' : 'Mt CO₂';
      $('#landscape-context').textContent = `${state.year} / 30 省 / 当前聚焦 ${state.selected}`;
      $('#landscape-note').textContent = landscapeMode === 'percapita' && !available ? `${state.year} 年人口缺失，当前暂显示总量坐标；切至 ${populationRange} 年即可查看人均坐标，不使用估计人口。` : (usePC ? '人均值按年末城镇／乡村常住人口近似归一，仅含燃料直接排放。' : '当前为城乡排放绝对量；人口规模差异尚未剔除。');
      const points = entries.map(p => ({ name: p.name, provinceName: p.name, value: [usePC ? p.urbanPC : p.urbanTotal, usePC ? p.ruralPC : p.ruralTotal, p.total], itemStyle: { color: p.name === state.selected ? T.ochre : p.ruralShare >= .5 ? C.rural : C.urban, opacity: p.name === state.selected ? 1 : .75, borderWidth: p.name === state.selected ? 2 : 0, borderColor: T.surface }, label: { show: p.name === state.selected, formatter: p.name, color: T.ochre, position: 'top' } }));
      const max = niceMax(Math.max(...points.flatMap(p => p.value.slice(0, 2)), 1) * 1.12);
      const maxTotal = Math.max(...entries.map(p => p.total), 1);
      const scatter = set('province-scatter', {
        grid: { left: 12, right: 30, top: 52, bottom: 62, containLabel: true },
        tooltip: { ...tooltip, formatter: p => p.seriesType === 'scatter' ? `<b>${p.name}</b> · ${state.year}<br>城镇 ${fmt(p.value[0], 3)} ${unit}<br>农村 ${fmt(p.value[1], 3)} ${unit}<br>城乡总量 ${fmt(p.value[2])} Mt` : '城乡相等参考线' },
        xAxis: { ...axis, type: 'value', min: 0, max, name: `城镇 / ${unit}`, nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: C.muted, fontSize: 10 } },
        yAxis: { ...axis, type: 'value', min: 0, max, name: `农村 / ${unit}`, nameTextStyle: { color: C.muted, fontSize: 10, align: 'left' } },
        series: [{ type: 'line', silent: true, data: [[0, 0], [max, max]], showSymbol: false, lineStyle: { type: 'dashed', width: 1, color: '#a5b59b' }, tooltip: { show: false } }, { type: 'scatter', symbolSize: value => 7 + Math.sqrt(value[2] / maxTotal) * 25, data: points }]
      });
      linkProvince(scatter);
      const ranked = [...entries].sort((a, b) => b.total - a.total);
      const ranking = set('province-ranking', {
        grid: { left: 8, right: 45, top: 20, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, trigger: 'axis', formatter: params => { const p = ranked[params[0].dataIndex]; return `${p.name}<br>城镇 ${fmt(p.urbanTotal)} Mt<br>农村 ${fmt(p.ruralTotal)} Mt<br>合计 ${fmt(p.total)} Mt`; } },
        xAxis: { ...axis, type: 'value', name: 'Mt', nameTextStyle: { color: C.muted, fontSize: 10 } },
        yAxis: { ...axis, type: 'category', inverse: true, data: ranked.map(p => p.name), axisLabel: { color: C.muted, fontSize: 10, interval: 0 }, splitLine: { show: false } },
        series: ['urban', 'rural'].map(side => ({ name: side === 'urban' ? '城镇' : '农村', type: 'bar', stack: 'total', barWidth: 10, itemStyle: { color: C[side] }, data: ranked.map(p => ({ value: p[side + 'Total'], provinceName: p.name, itemStyle: { opacity: p.name === state.selected ? 1 : .65 } })) }))
      });
      linkProvince(ranking);
      const sort = $('#fingerprint-sort').value;
      const sortIndex = groups.findIndex(g => g.id === sort);
      const gap = p => Math.abs(groupValue(p, groups[sortIndex], 'urban') / p.urbanTotal - groupValue(p, groups[sortIndex], 'rural') / p.ruralTotal);
      const rows = [...entries].sort((a, b) => sort === 'difference' ? b.difference - a.difference : sortIndex < 0 ? b.total - a.total : gap(b) - gap(a));
      const showOther = $('#fingerprint-other').checked, showValues = $('#fingerprint-values').checked;
      const focus = $('#fingerprint-focus').value;
      const visible = groups.map((g, i) => i).filter(i => groups[i].id !== 'other' || showOther || focus === 'other');
      const columns = ['urban', 'rural'].flatMap(side => visible.map(i => ({ side, i, name: (side === 'urban' ? '城镇' : '农村') + '|' + groups[i].name })));
      const cells = rows.flatMap((p, row) => columns.map((col, x) => {
        const v = groupValue(p, groups[col.i], col.side) / p[col.side + 'Total'] * 100;
        return { value: [x, row, v], provinceName: p.name, fuelId: groups[col.i].id,
          itemStyle: { borderWidth: p.name === state.selected ? 2 : 1, borderColor: p.name === state.selected ? T.accent : T.surface, opacity: focus === 'all' || focus === groups[col.i].id ? 1 : .18 },
          label: { color: I.labelColor(echarts, v / 100) } };
      }));
      const other = groups.find(g => g.id === 'other');
      const otherTotal = entries.reduce((s, p) => s + totalGroup(p, other), 0), total = entries.reduce((s, p) => s + p.total, 0);
      $('#fingerprint-note').textContent = `${state.year} 年其他油品合计 ${fmt(otherTotal, 6)} Mt，占 30 省城乡总量 ${fmt(otherTotal / total * 100, 4)}%。${showOther || focus === 'other' ? '余量列已展开' : '主图折叠其他油品列'}；所有比例始终以完整部门总量为分母，未重新归一。点行可聚焦省份。`;
      $('#fingerprint-table').innerHTML = I.tableHTML(['省份', '城乡', ...groups.map(g => g.name + ' %')], rows.flatMap(p => ['urban', 'rural'].map(side => [p.name, side === 'urban' ? '城镇' : '农村', ...groups.map(g => fmt(groupValue(p, g, side) / p[side + 'Total'] * 100, 6))])), `${state.year} · 六组完整占比，各部门合计 100%`);
      $('#landscape-table').innerHTML = I.tableHTML(['省份', '城镇 Mt', '农村 Mt', '城镇 t/人', '农村 t/人', 'D₁₇'], ranked.map(p => [p.name, fmt(p.urbanTotal, 6), fmt(p.ruralTotal, 6), fmt(p.urbanPC, 6), fmt(p.ruralPC, 6), fmt(p.difference, 6)]), `${state.year} · 人口缺失显示 —`);
      const matrix = set('fuel-fingerprint', {
        graphic: [{ type: 'text', left: '25%', top: 6, style: { text: '城镇 / URBAN', fill: T.urban, fontSize: 18, fontWeight: 700 } }, { type: 'text', left: '73%', top: 6, style: { text: '农村 / RURAL', fill: T.rural, fontSize: 18, fontWeight: 700 } }],
        grid: { left: 8, right: 20, top: 72, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, formatter: p => { const c = columns[p.value[0]]; return `${p.data.provinceName} · ${c.side === 'urban' ? '城镇' : '农村'} · ${groups[c.i].name}<br>占本部门排放 ${fmt(p.value[2], 4)}%`; } },
        xAxis: { ...axis, type: 'category', position: 'top', data: columns.map(c => c.name), axisLabel: { color: C.muted, fontSize: 10, interval: 0, formatter: v => v.split('|')[1].replace('煤及煤制品', '煤炭') } },
        yAxis: { ...axis, type: 'category', inverse: true, data: rows.map(p => p.name), axisLabel: { color: C.muted, fontSize: 10, interval: 0 }, splitLine: { show: false } },
        visualMap: { show: false, min: 0, max: 100, inRange: { color: T.ramp } },
        series: [{ type: 'heatmap', data: cells, label: { show: showValues, fontSize: 14, formatter: p => p.value[2] > 0 && p.value[2] < .1 ? '<0.1' : fmt(p.value[2], 1) }, emphasis: { itemStyle: { borderColor: T.accent, borderWidth: 2 } } }]
      });
      linkProvince(matrix);
    }
    document.querySelectorAll('[data-landscape]').forEach(button => button.addEventListener('click', () => {
      landscapeMode = button.dataset.landscape;
      document.querySelectorAll('[data-landscape]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      renderLandscape();
    }));
    $('#fingerprint-sort').addEventListener('change', renderLandscape);
    ['fingerprint-focus', 'fingerprint-values', 'fingerprint-other'].forEach(id => $('#' + id).addEventListener('change', renderLandscape));

    function renderChange() {
      const state = getState(), m = changeModel(data, state.selected, start, end);
      const bridge = m.bridge.filter(d => d.endpoint || P.hasDelta([d.value]));
      const deltas = m.deltas.filter(d => P.hasDelta([d.urban, d.rural]));
      $('#change-context').textContent = `${state.selected} / 城乡合计 / ${start}—${end}`;
      $('#change-before').textContent = fmt(m.before.total);
      $('#change-after').textContent = fmt(m.after.total);
      $('#change-net').textContent = signed(m.net);
      $('#change-rate').textContent = m.before.total > 0 ? `${signed(m.net / m.before.total * 100)}% · Mt CO₂ 差额` : '起点为零，不计算变化率';
      const max = Math.max(...m.bridge.map(d => d.high), 1);
      set('change-waterfall', {
        grid: { left: 12, right: 20, top: 48, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, trigger: 'item', formatter: params => { const d = bridge[params.dataIndex]; return d.endpoint ? `${d.name} 年总量<br>${fmt(d.value, 6)} Mt CO₂` : `${d.name}<br>期间变化 ${signed(d.value)} Mt<br>城镇 ${signed(d.urban)} Mt<br>农村 ${signed(d.rural)} Mt`; } },
        xAxis: { ...axis, type: 'category', data: bridge.map(d => d.name), axisLabel: { color: C.muted, fontSize: 10, interval: 0, rotate: $('#change-waterfall').clientWidth < 600 ? 30 : 0 } },
        yAxis: { ...axis, type: 'value', min: 0, max: niceMax(max * 1.15), name: 'Mt CO₂', nameTextStyle: { color: C.muted, fontSize: 10 } },
        series: [{ type: 'custom', data: bridge.map((d, i) => [i, d.low, d.high, d.value]), renderItem: (params, api) => {
          const index = api.value(0), d = bridge[index], low = api.coord([index, api.value(1)]), high = api.coord([index, api.value(2)]), size = api.size([1, 0])[0] * .52;
          const color = d.endpoint ? T.blue : d.value >= 0 ? C.up : C.down;
          const label = d.endpoint ? fmt(d.value, 1) : `${d.value > 0 ? '+' : ''}${fmt(d.value, 1)}`;
          return { type: 'group', children: [{ type: 'rect', shape: { x: high[0] - size / 2, y: high[1], width: size, height: Math.max(low[1] - high[1], .8) }, style: { fill: color, opacity: .88 } }, { type: 'text', style: { x: high[0], y: high[1] - 10, text: label, textAlign: 'center', textVerticalAlign: 'bottom', fill: C.ink, fontSize: 14, fontWeight: 600 } }] };
        } }]
      });
      set('change-fuels', {
        grid: { left: 8, right: 24, top: 62, bottom: 20, containLabel: true },
        tooltip: { ...tooltip, trigger: 'axis', valueFormatter: value => `${signed(value)} Mt CO₂` },
        legend: { top: 4, right: 12, textStyle: { color: C.muted, fontSize: 10 } },
        xAxis: { ...axis, type: 'value', name: 'Mt', nameTextStyle: { color: C.muted, fontSize: 10 } },
        yAxis: { ...axis, type: 'category', inverse: true, data: deltas.map(d => d.name), splitLine: { show: false } },
        series: ['urban', 'rural'].map(side => ({ name: side === 'urban' ? '城镇' : '农村', type: 'bar', barMaxWidth: 9, itemStyle: { color: C[side] }, data: deltas.map(d => d[side]), markLine: { silent: true, symbol: 'none', label: { show: false }, data: [{ xAxis: 0 }], lineStyle: { color: '#92a387', width: 1 } } }))
      });
      set('change-slope', {
        grid: { left: 12, right: 70, top: 62, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, trigger: 'axis', valueFormatter: value => `${fmt(value, 3)} Mt CO₂` },
        legend: { top: 4, right: 12, textStyle: { color: C.muted, fontSize: 10 } },
        xAxis: { ...axis, type: 'category', data: [String(start), String(end)], boundaryGap: ['20%', '20%'] },
        yAxis: { ...axis, type: 'value', min: 0, name: 'Mt CO₂', nameTextStyle: { color: C.muted, fontSize: 10 } },
        series: ['urban', 'rural'].map(side => ({ name: side === 'urban' ? '城镇' : '农村', type: 'line', symbol: 'circle', symbolSize: 9, lineStyle: { width: 3, color: C[side] }, itemStyle: { color: C[side] }, endLabel: { show: true, color: C[side], fontSize: 10, formatter: params => fmt(params.value) }, data: [m.before[side + 'Total'], m.after[side + 'Total']] }))
      });
      const dominant = [...m.deltas].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
      const positive = [...m.deltas].sort((a, b) => b.value - a.value)[0], negative = [...m.deltas].sort((a, b) => a.value - b.value)[0];
      $('#change-insight').textContent = `${state.selected} · ${start} → ${end} · 净变化 ${signed(m.net)} Mt；${negative.value < 0 ? negative.name + ' ' + signed(negative.value) + ' Mt' : ''}${negative.value < 0 && positive.value > 0 ? '；' : ''}${positive.value > 0 ? positive.name + ' ' + signed(positive.value) + ' Mt' : ''}`;
      $('#change-table').innerHTML = I.tableHTML(['燃料组', '起点 Mt', '终点 Mt', '差额 Mt', '城镇差额 Mt', '农村差额 Mt'], m.deltas.map((d, i) => [d.name, fmt(totalGroup(m.before, groups[i]), 6), fmt(totalGroup(m.after, groups[i]), 6), fmt(d.value, 6), fmt(d.urban, 6), fmt(d.rural, 6)]), `${state.selected} ${start}—${end} · 零差额也完整保留`);
    }
    for (const [id, value] of [['change-start', start], ['change-end', end]]) {
      $('#' + id).innerHTML = data.meta.years.map(year => `<option${Number(year) === value ? ' selected' : ''}>${year}</option>`).join('');
      $('#' + id).addEventListener('change', () => {
        const years = data.meta.years.map(Number);
        start = Number($('#change-start').value); end = Number($('#change-end').value);
        if (start >= end) {
          if (id === 'change-start') { end = years.find(y => y > start); if (!end) { end = years.at(-1); start = years.at(-2); } }
          else { start = [...years].reverse().find(y => y < end); if (!start) { start = years[0]; end = years[1]; } }
          $('#change-start').value = start; $('#change-end').value = end;
        }
        renderChange();
      });
    }
    restoreURL();
    return { renderDuality, renderLandscape, renderChange, restoreURL,
      getURLState() { return { coord: landscapeMode, fuel: fuelFocus, from: start, to: end, sort: $('#fingerprint-sort').value, matrix: $('#fingerprint-focus').value, values: $('#fingerprint-values').checked ? '1' : '0', other: $('#fingerprint-other').checked ? '1' : '0', dualother: $('#dual-other').checked ? '1' : '0' }; },
      configure({ coordinate, from, to }) { if (coordinate) { landscapeMode = coordinate; document.querySelectorAll('[data-landscape]').forEach(b => { const active = b.dataset.landscape === coordinate; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); }); } if (from) { start = from; $('#change-start').value = start; } if (to) { end = to; $('#change-end').value = end; } },
      resize() { registry.forEach(instance => { if (instance.getDom().getClientRects().length) instance.resize(); }); } };
  }
  global.CarbonAnalysis = { create, dualModel, landscapeModel, changeModel };
})(window);
