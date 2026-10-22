(function (global) {
  'use strict';

  const T = global.CarbonTheme;
  const SIDES = [{ id: 'urban', name: '城镇', color: T.urban }, { id: 'rural', name: '农村', color: T.rural }];
  const FUEL_COLORS = T.fuel;
  const number = value => Number(value).toFixed(3);
  const sumGroup = (province, side, group) => group.indices.reduce((sum, index) => sum + province[side][index], 0);
  const modeName = mode => mode === 'urban' ? '城镇' : mode === 'rural' ? '农村' : '城乡合计';
  let dependency;
  function load3D() {
    if (global['echarts-gl']) return Promise.resolve();
    if (!dependency) dependency = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('vendor/echarts-gl.min.js', document.baseURI).href;
      const timer = setTimeout(() => reject(new Error('3D dependency timed out')), 12000);
      script.onload = () => { clearTimeout(timer); global['echarts-gl'] ? resolve() : reject(new Error('3D dependency unavailable')); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('3D dependency failed to load')); };
      document.head.append(script);
    });
    return dependency;
  }

  // The 3D view, 2D alternative and accessible table consume exactly the same cells.
  function buildScene(data, provinceName, year, scene, mode) {
    const groups = data.meta.groups;
    const years = data.meta.years.map(Number);
    const provinceAt = y => data.series[String(y)].provinces.find(p => p.name === provinceName);
    const valueAt = (p, group) => mode === 'total'
      ? sumGroup(p, 'urban', group) + sumGroup(p, 'rural', group)
      : sumGroup(p, mode, group);
    const p = provinceAt(year);
    const rows = scene === 'history' ? years.map(String) : SIDES.map(side => side.name);
    const cells = [];
    rows.forEach((row, rowIndex) => groups.forEach((group, groupIndex) => {
      const value = scene === 'history' ? valueAt(provinceAt(Number(row)), group) : sumGroup(p, SIDES[rowIndex].id, group);
      cells.push({
        value: [groupIndex, rowIndex, value], group: group.name, row,
        color: scene === 'history' ? FUEL_COLORS[groupIndex] : SIDES[rowIndex].color,
        selectedYear: scene === 'history' && Number(row) === year
      });
    }));
    // Lock the height scale across years of the same province, not across provinces.
    const scaleValues = years.flatMap(y => groups.flatMap(group => scene === 'history'
      ? [valueAt(provinceAt(y), group)]
      : SIDES.map(side => sumGroup(provinceAt(y), side.id, group))));
    const maximum = Math.max(...scaleValues, 0);
    const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum * 1.1)) : 1;
    const scaleMax = maximum > 0 ? Math.ceil(maximum * 1.1 / magnitude * 2) / 2 * magnitude : 1;
    return { provinceName, year, scene, mode, rows, cells, scaleMax, groups: groups.map(g => g.name) };
  }

  function markup() {
    return `<article class="viz-panel carbon-lab" id="carbon-lab" aria-labelledby="lab-heading">
      <header class="lab-header">
        <div><span class="lab-kicker">E / CARBON IN THREE DIMENSIONS</span><h3 id="lab-heading">把生活的碳，<em>立起来看。</em></h3></div>
        <div class="lab-focus"><label>聚焦省份<select id="lab-province" aria-label="三维图聚焦省份"></select></label><label>观察年份<select id="lab-year" aria-label="三维图观察年份"></select></label></div>
      </header>
      <div class="lab-toolbar">
        <div class="lab-scenes" role="group" aria-label="三维分析场景"><button type="button" data-scene="split" aria-pressed="true" class="active">01 城乡燃料剖面</button><button type="button" data-scene="history" aria-pressed="false">02 历年燃料地形</button></div>
        <div class="lab-views" role="group" aria-label="图表维度"><button type="button" data-view="3d" aria-pressed="true" class="active">3D 探索</button><button type="button" data-view="2d" aria-pressed="false">2D 精读</button></div>
      </div>
      <div class="lab-filter"><label>隔离燃料<select id="lab-fuel" aria-label="三维二维燃料隔离"></select></label><label><input type="checkbox" id="lab-slice"> 只看当前年份切片</label><label><input type="checkbox" id="lab-other"> 展开极小余量</label><span>仅筛选视图，不改变完整数据及高度尺度</span></div>
      <div class="lab-context"><span id="lab-context"></span><div id="lab-legend" class="lab-legend"></div></div>
      <div class="lab-stage">
        <div class="lab-axis-note" aria-hidden="true"><span id="lab-axis-caption">高度 / Mt CO₂</span><small>BASELINE = 0</small></div>
        <div id="profile-chart" class="profile-chart" role="img" aria-label="三维燃料排放柱状图"></div>
        <p id="lab-status" class="lab-status" role="status" aria-live="polite"></p>
        <div class="lab-camera" role="group" aria-label="三维镜头控制"><button type="button" data-camera="default">↺ 复位</button><button type="button" data-camera="top">俯视</button><button type="button" data-camera="front">正视</button><button type="button" id="lab-auto" aria-pressed="false">缓慢旋转</button></div>
      </div>
      <div class="lab-footer"><span id="lab-scale"></span></div>
      <div class="lab-reading"><span>读图线索</span><p id="lab-insight"></p></div>
      <details class="lab-data"><summary>展开数值表 <span>同一份数据 · Mt CO₂</span></summary><div class="lab-table-scroll"><table><caption id="lab-table-caption"></caption><thead id="lab-table-head"></thead><tbody id="lab-table-body"></tbody></table></div></details>
    </article>`;
  }

  function create({ data, echarts, root, onProvinceChange, onYearChange }) {
    const $ = selector => root.querySelector(selector);
    const all = selector => Array.from(root.querySelectorAll(selector));
    const names = data.series[String(data.meta.years.at(-1))].provinces.map(p => p.name);
    const yearRange = `${data.meta.years[0]}—${data.meta.years.at(-1)}`;
    $('#lab-province').innerHTML = names.map(name => `<option>${name}</option>`).join('');
    $('#lab-year').innerHTML = data.meta.years.map(year => `<option>${year}</option>`).join('');
    let chart = null;
    let current = null;
    let mounted = false;
    let view = '3d';
    let scene = 'split';
    let autoRotate = false;
    let smallViewport = root.clientWidth < 650;
    const defaultCamera = () => ({ alpha: scene === 'history' ? 32 : 26, beta: -24, distance: smallViewport ? (scene === 'history' ? 370 : 345) : (scene === 'history' ? 260 : 210) });
    let camera = defaultCamera();
    const watchedCanvases = new WeakSet();
    let glAvailable = null;
    let loading = false;
    let failureMessage = '';
    const groups = data.meta.groups;
    $('#lab-fuel').innerHTML = '<option value="all">全部主要燃料</option>' + groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    function restoreURL() {
      const q = global.CarbonInsights.params();
      scene = q.get('scene') === 'history' ? 'history' : 'split';
      view = ['2d', '3d'].includes(q.get('view')) ? q.get('view') : scene === 'history' ? '2d' : '3d';
      if (glAvailable === false) view = '2d';
      $('#lab-fuel').value = groups.some(g => g.id === q.get('labfuel')) ? q.get('labfuel') : 'all';
      $('#lab-slice').checked = q.get('slice') === '1'; $('#lab-other').checked = q.get('labother') === '1';
      camera = defaultCamera();
    }
    restoreURL();
    function projected(model) {
      const focus = $('#lab-fuel').value;
      const indices = groups.map((g, i) => i).filter(i => focus === 'all' ? groups[i].id !== 'other' || $('#lab-other').checked : groups[i].id === focus);
      const rows = scene === 'history' && $('#lab-slice').checked ? [String(model.year)] : model.rows;
      return { ...model, groups: indices.map(i => model.groups[i]), rows,
        cells: model.cells.filter(c => indices.includes(c.value[0]) && rows.includes(c.row)).map(c => ({ ...c, value: [indices.indexOf(c.value[0]), rows.indexOf(c.row), c.value[2]] })) };
    }

    const tooltip = {
      trigger: 'item', confine: true, backgroundColor: T.surface, borderColor: T.line,
      textStyle: { color: T.ink, fontSize: 12 }, extraCssText: 'box-shadow:0 6px 24px rgba(38,61,50,.12);',
      formatter: params => {
        const cell = params.data.cell;
        if (!cell) return '';
        const yearLabel = scene === 'history' ? cell.row : current.year;
        const scope = scene === 'history' ? modeName(current.mode) : cell.row;
        return `${current.provinceName} · ${yearLabel} · ${scope}<br>${cell.group}<br><b>${number(cell.value[2])}</b> Mt CO₂`;
      }
    };

    function make3D(model) {
      const small = root.clientWidth < 650;
      return {
        backgroundColor: 'transparent', animation: false, tooltip,
        xAxis3D: {
          type: 'category', name: '', data: model.groups,
          axisLabel: { interval: 0, margin: 10, textStyle: { color: T.ink, fontSize: small ? 10 : 12 }, formatter: name => name === '煤及煤制品' ? '煤及\n煤制品' : name },
          axisPointer: { label: { show: false } }
        },
        yAxis3D: {
          type: 'category', name: '', data: model.rows,
          axisLabel: { interval: 0, margin: 10, textStyle: { color: T.ink, fontSize: small ? 10 : 12 } },
          axisPointer: { label: { show: false } }
        },
        zAxis3D: {
          type: 'value', name: 'Mt CO₂', min: 0, max: model.scaleMax, splitNumber: 4,
          nameTextStyle: { color: T.urban, fontSize: 12 },
          axisLabel: { textStyle: { color: T.muted, fontSize: 11 }, formatter: value => Number(value.toFixed(1)).toString() }
        },
        grid3D: {
          left: 0, top: scene === 'history' ? '-8%' : '-12%', width: '100%', height: scene === 'history' ? '94%' : '100%',
          boxWidth: Math.max(65, model.groups.length * 30), boxDepth: scene === 'history' ? Math.max(45, model.rows.length * 17) : 65, boxHeight: 85,
          environment: '#f7f7ee',
          axisLine: { lineStyle: { color: '#93a486', width: 1 } },
          splitLine: { lineStyle: { color: '#d5deca', width: 1 } },
          axisPointer: { show: true, lineStyle: { color: T.urban, width: 1 }, label: { show: false } },
          viewControl: {
            ...camera, projection: 'perspective', minAlpha: 5, maxAlpha: 85,
            minDistance: 150, maxDistance: 480, rotateSensitivity: 1, zoomSensitivity: 1,
            panSensitivity: 0, damping: 0.7, autoRotate, autoRotateSpeed: 6, autoRotateAfterStill: 5
          },
          light: { main: { intensity: 1, alpha: 45, beta: -25, shadow: false }, ambient: { intensity: 0.55 } },
          postEffect: { enable: false }, temporalSuperSampling: { enable: false }
        },
        series: [{
          type: 'bar3D', name: '直接 CO₂ 排放', shading: 'lambert',
          barSize: scene === 'history' ? [15, 10] : [17, 16], bevelSize: 0,
          minHeight: 0, silent: false,
          data: model.cells.map(cell => ({ value: cell.value, cell, itemStyle: { color: cell.color, opacity: scene === 'history' && !cell.selectedYear ? 0.82 : 1 } })),
          label: { show: false }, emphasis: { label: { show: false }, itemStyle: { color: '#b6974e' } }
        }]
      };
    }

    function heatLabelColor(value, maximum) {
      const rgba = echarts.color.parse(echarts.color.lerp(Math.max(0, Math.min(1, value / maximum)), T.ramp));
      const linear = rgba.slice(0, 3).map(channel => {
        const s = channel / 255;
        return s <= .04045 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
      });
      const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      // Pick the higher-contrast text, including mid-tone cells (>= 4.5:1).
      return luminance > .179 ? '#000000' : '#ffffff';
    }

    function make2D(model) {
      const history = scene === 'history';
      const sharedAxis = { axisLine: { lineStyle: { color: '#adbea4' } }, axisLabel: { color: T.muted, fontSize: 11 }, splitLine: { lineStyle: { color: T.grid } } };
      if (history) {
        return {
          animation: false, tooltip,
          grid: { left: 16, right: 24, top: 58, bottom: 84, containLabel: true },
          xAxis: { ...sharedAxis, type: 'category', data: model.groups, axisLabel: { color: T.muted, fontSize: 11, interval: 0, rotate: root.clientWidth < 650 ? 28 : 0 } },
          yAxis: { ...sharedAxis, type: 'category', data: model.rows },
          visualMap: { type: 'continuous', min: 0, max: model.scaleMax, orient: 'horizontal', left: 'center', bottom: 6, itemHeight: 150, itemWidth: 9, text: ['高', '0'], textStyle: { color: T.muted }, inRange: { color: T.ramp } },
          series: [{ type: 'heatmap', data: model.cells.map(cell => ({ value: cell.value, cell, itemStyle: { borderColor: cell.selectedYear ? T.accent : '#f7f7ee', borderWidth: 2 }, label: { color: heatLabelColor(cell.value[2], model.scaleMax) } })), label: { show: root.clientWidth > 650, fontSize: 10, formatter: p => number(p.value[2]) } }]
        };
      }
      return {
        animation: false, tooltip: { ...tooltip, trigger: 'item' },
        grid: { left: 16, right: 24, top: 58, bottom: 42, containLabel: true },
        xAxis: { ...sharedAxis, type: 'category', data: model.groups, axisLabel: { color: T.muted, fontSize: 11, interval: 0, rotate: root.clientWidth < 650 ? 28 : 0 } },
        yAxis: { ...sharedAxis, type: 'value', min: 0, max: model.scaleMax, name: 'Mt CO₂', nameTextStyle: { color: T.muted } },
        series: SIDES.map((side, index) => ({ name: side.name, type: 'bar', barMaxWidth: 30, itemStyle: { color: side.color }, data: model.cells.filter(cell => cell.value[1] === index).map(cell => ({ value: cell.value[2], cell })) }))
      };
    }

    function updateControls() {
      all('[data-view]').forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = button.dataset.view === '3d' && glAvailable === false;
      });
      all('[data-scene]').forEach(button => {
        const active = button.dataset.scene === scene;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      $('.lab-camera').hidden = view !== '3d';
      $('#lab-status').textContent = failureMessage;
      root.dataset.view = view;
      root.dataset.scene = scene;
      $('#lab-slice').disabled = scene !== 'history';
    }

    function disposeChart() {
      if (chart) { chart.dispose(); chart = null; }
    }

    function draw() {
      if (!mounted || !current || !root.getClientRects().length) return;
      if (view === '3d' && glAvailable !== true) {
        if (loading) return;
        loading = true; $('#lab-status').textContent = '首次进入三维空间，正在加载本地 3D 引擎…';
        load3D().then(() => {
          const probe = document.createElement('canvas');
          const gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
          if (!gl) throw new Error('WebGL unavailable');
          gl.getExtension('WEBGL_lose_context')?.loseContext();
          glAvailable = true; loading = false; failureMessage = ''; updateControls(); draw();
        }).catch(() => { loading = false; fallback('当前设备 WebGL 或本地 3D 引擎不可用，已切到同数据的二维精读。'); });
        return;
      }
      if (!chart) {
        chart = echarts.init($('#profile-chart'), null, { devicePixelRatio: Math.min(global.devicePixelRatio || 1, 2) });
        chart.on('grid3dcamerachanged', () => {
          const control = chart?.getOption().grid3D?.[0]?.viewControl;
          if (control) camera = { alpha: control.alpha, beta: control.beta, distance: control.distance };
        });
      }
      try {
        const visible = projected(current);
        chart.setOption(T.chartOptions(view === '3d' ? make3D(visible) : make2D(visible)), { notMerge: true });
        if (view === '3d') {
          const canvas = Array.from($('#profile-chart').querySelectorAll('canvas')).find(c => c.getAttribute('data-engine')?.includes('claygl'));
          // Some drivers lose their context after initial detection. Keep all data readable.
          const canvases = canvas ? [canvas] : Array.from($('#profile-chart').querySelectorAll('canvas'));
          canvases.forEach(c => {
            if (watchedCanvases.has(c)) return;
            watchedCanvases.add(c);
            c.addEventListener('webglcontextlost', event => {
              event.preventDefault();
              fallback('三维渲染上下文已丢失，已切换为二维图；全部数值保持不变。');
            }, { once: true });
          });
        }
      } catch (error) {
        if (view !== '3d') throw error;
        console.warn('3D view unavailable; using 2D.', error);
        fallback('当前设备无法完成三维渲染，已切换为同数据的二维图。');
      }
    }

    function fallback(message) {
      glAvailable = false;
      failureMessage = message;
      view = '2d';
      autoRotate = false;
      $('#lab-auto').setAttribute('aria-pressed', 'false');
      disposeChart();
      updateControls();
      draw();
    }

    function render(provinceName, year, mode) {
      current = buildScene(data, provinceName, year, scene, mode);
      $('#lab-province').value = provinceName;
      $('#lab-year').value = String(year);
      $('#lab-context').textContent = `${provinceName} / ${scene === 'history' ? yearRange + ' / ' + modeName(mode) : year + ' / 城镇与农村'}`;
      $('#lab-scale').textContent = '高度从 0 起算 · 同省跨年同尺度 · 不同省份尺度不同';
      $('#lab-axis-caption').textContent = view === '3d' ? '高度 / Mt CO₂' : '排放量 / Mt CO₂';
      const visibleGroups = projected(current).groups;
      const legend = scene === 'history' ? current.groups.map((name, i) => ({ name, color: FUEL_COLORS[i] })).filter(g => visibleGroups.includes(g.name)) : SIDES;
      $('#lab-legend').innerHTML = legend.map(item => `<span><i style="background:${item.color}"></i>${item.name}</span>`).join('') + (scene === 'history' ? `<span class="lab-year-key">${view === '3d' ? '明亮排' : '描边行'} / 当前观察年份</span>` : '');
      const largest = current.cells.reduce((a, b) => a.value[2] >= b.value[2] ? a : b);
      $('#lab-insight').textContent = scene === 'history'
        ? `历年最高的一根柱：${largest.row} 年的${largest.group}，${number(largest.value[2])} Mt。沿年份方向比较同一种燃料；亮色标记 ${year} 年。这里只描述变化，不推断原因。`
        : `${year} 年，${largest.row}的${largest.group}最高：${number(largest.value[2])} Mt。沿纵深对照同一种燃料的城乡差别；零值没有柱高，极小值可在数值表中查看。`;
      const caption = `${provinceName} · ${scene === 'history' ? yearRange + ' ' + modeName(mode) : year + ' 城乡'}分燃料直接 CO₂ 排放（Mt）`;
      $('#profile-chart').setAttribute('aria-label', `${view === '3d' ? '可旋转三维' : '二维'}图：${caption}。完整数值见下方表格。`);
      $('#lab-table-caption').textContent = caption;
      $('#lab-table-head').innerHTML = `<tr><th scope="col">${scene === 'history' ? '年份' : '生活部门'}</th>${current.groups.map(name => `<th scope="col">${name}</th>`).join('')}</tr>`;
      $('#lab-table-body').innerHTML = current.rows.map((row, rowIndex) => `<tr${scene === 'history' && Number(row) === year ? ' class="current-year"' : ''}><th scope="row">${row}</th>${current.cells.filter(cell => cell.value[1] === rowIndex).map(cell => `<td>${number(cell.value[2])}</td>`).join('')}</tr>`).join('');
      $('#lab-insight').textContent += ' 主视图默认折叠其他油品；可展开余量或隔离单种燃料，完整六组始终保留在表中。';
      updateControls();
      draw();
    }

    $('#lab-province').addEventListener('change', event => onProvinceChange(event.target.value));
    $('#lab-year').addEventListener('change', event => onYearChange(Number(event.target.value)));
    all('[data-scene]').forEach(button => button.addEventListener('click', () => {
      if (scene === button.dataset.scene) return;
      scene = button.dataset.scene;
      view = scene === 'history' || glAvailable === false ? '2d' : '3d';
      disposeChart();
      camera = defaultCamera();
      render(current.provinceName, current.year, current.mode);
    }));
    ['lab-fuel', 'lab-slice', 'lab-other'].forEach(id => $( '#' + id).addEventListener('change', () => render(current.provinceName, current.year, current.mode)));
    all('[data-view]').forEach(button => button.addEventListener('click', () => {
      if (view === button.dataset.view) return;
      view = button.dataset.view;
      autoRotate = false;
      $('#lab-auto').setAttribute('aria-pressed', 'false');
      disposeChart();
      render(current.provinceName, current.year, current.mode);
    }));
    all('[data-camera]').forEach(button => button.addEventListener('click', () => {
      const preset = button.dataset.camera;
      autoRotate = false;
      $('#lab-auto').setAttribute('aria-pressed', 'false');
      camera = { ...defaultCamera(), alpha: preset === 'top' ? 80 : preset === 'front' ? 8 : scene === 'history' ? 32 : 26, beta: preset === 'default' ? -24 : 0 };
      if (chart) chart.setOption({ grid3D: { viewControl: { ...camera, autoRotate: false } } });
    }));
    $('#lab-auto').addEventListener('click', () => {
      autoRotate = !autoRotate;
      $('#lab-auto').setAttribute('aria-pressed', String(autoRotate));
      if (chart) chart.setOption({ grid3D: { viewControl: { autoRotate } } });
    });
    $('#profile-chart').addEventListener('keydown', event => {
      if (event.key === 'Escape') $('#lab-auto').focus();
    });
    if ('IntersectionObserver' in global) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { mounted = true; draw(); observer.disconnect(); }
      }, { rootMargin: '150px' });
      observer.observe(root);
    } else { mounted = true; }
    updateControls();
    return { render, restoreURL,
      getURLState() { return { scene, view, labfuel: $('#lab-fuel').value, slice: $('#lab-slice').checked ? '1' : '0', labother: $('#lab-other').checked ? '1' : '0' }; },
      resize() {
      if (!root.getClientRects().length) return;
      const nextSmallViewport = root.clientWidth < 650;
      if (nextSmallViewport !== smallViewport) {
        smallViewport = nextSmallViewport;
        camera = defaultCamera();
      }
      if (chart) { chart.resize(); if (view === '3d') draw(); }
    } };
  }

  global.CarbonLab = { markup, create, buildScene };
})(window);
