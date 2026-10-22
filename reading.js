/* Reading hierarchy and optional guided journey. No alternate copy of the data. */
(function (global) {
  'use strict';
  const pages = {
    atlas: { title: '省域地图', zones: [['atlas-map', '地图', '总量 / 占比 / 结构'], ['atlas-discoveries', '发现卡', '三个对照入口']] },
    timeline: { title: '年度变化', zones: [['timeline-comparison', '多省趋势', '趋势 / 矩阵'], ['timeline-composition', '燃料结构', '燃料层 / 城乡流'], ['timeline-lab', '三维探索', '3D / 2D']] },
    retrieval: { title: '碳源检索', zones: [['carbon-retrieval', '条件与结果', '省份 / 年份 / 燃料'], ['retrieval-visuals', '图表预览', '燃料 / 城乡']] },
    duality: { title: '城乡切面', zones: [['structure-overlap', '同省城乡', '燃料占比'], ['duality-pair', '两省并置', '份额 / 绝对量'], ['duality-normalized', '归一比较', '构成 / 人均']] },
    landscape: { title: '省际坐标', zones: [['landscape-scale', '规模与人均', '星图 / 排名'], ['landscape-structure', '燃料指纹', '城乡并置']] },
    change: { title: '变化拆解', zones: [['change-bridge', '燃料变化桥', '两个年份 / 六组燃料'], ['change-sides', '城乡变化', '差额 / 端点']] },
    passport: { title: '数据护照', zones: [['passport-overview', '来源与下载', '清单 / 人口 / CSV'], ['granularity', '计算口径', '分类粒度 / 差异度'], ['passport-boundary', '边界与出处', '范围 / 限制']] }
  };
  function tourSteps(data) {
    const I = global.CarbonInsights, firstYear = data.meta.years[0], lastYear = data.meta.years.at(-1), n = I.national(data, lastYear);
    const a = data.series[String(firstYear)].provinces.find(p => p.name === '河北');
    const b = data.series[String(lastYear)].provinces.find(p => p.name === '河北');
    const delta = id => { const g = data.meta.groups.find(g => g.id === id); return g.indices.reduce((s, i) => s + b.urban[i] + b.rural[i] - a.urban[i] - a.rural[i], 0); };
    return [
      { target: 'atlas-map', title: '01 先看：碳排放在哪里？', label: '看规模',
        copy: `${lastYear} 年，河北居民生活直接排放 ${b.total.toFixed(2)} Mt。点击地图看其他省份；历年共用固定色阶，灰色未覆盖不代表零。` },
      { target: 'landscape-scale', title: '02 换个分母：总量高，人均也高吗？', label: '换分母',
        copy: `30 省合计：城镇 ${n.urbanTotal.toFixed(1)} Mt，高于农村 ${n.ruralTotal.toFixed(1)} Mt；按各自人口归一后为 ${(n.urbanTotal * 100 / n.population.urban).toFixed(3)} / ${(n.ruralTotal * 100 / n.population.rural).toFixed(3)} t/人，次序反转。切换总量／人均坐标，观察各省位置。` },
      { target: 'change-bridge', title: '03 拆开：总量接近，构成就没变吗？', label: '追来源',
        copy: `河北 ${firstYear}—${lastYear} 年净增 ${(b.total - a.total).toFixed(2)} Mt；煤及煤制品减少 ${Math.abs(delta('coal')).toFixed(2)} Mt，天然气增加 ${delta('gas').toFixed(2)} Mt。增减相互抵消，不等于没有变化，也不能据此推断替换原因。` }
    ];
  }
  function install({ data, getState, go, onStep }) {
    const $ = s => document.querySelector(s);
    const passport = $('#passport'), copy = $('.passport-copy'), cards = $('.passport-grid');
    const heading = document.createElement('div'); heading.className = 'chapter-intro passport-heading';
    const headingCopy = document.createElement('div'); headingCopy.append(copy.querySelector('h2')); heading.append(headingCopy);
    passport.prepend(heading);
    const overview = document.createElement('div'); overview.id = 'passport-overview'; overview.className = 'passport-overview';
    heading.after(overview); overview.append(copy, cards);
    $('#change-fuels').closest('article').insertAdjacentHTML('beforebegin', '<div class="reading-zone full-panel" id="change-sides"><span>02</span><div><h3>城乡变化</h3></div></div>');
    const navs = new Map();
    for (const [id, page] of Object.entries(pages)) {
      const section = document.getElementById(id), nav = document.createElement('nav');
      nav.className = 'reading-nav';
      nav.setAttribute('aria-label', `${page.title}页内导航`);
      nav.innerHTML = `<div class="reading-nav-meta"><span>${page.title}</span><b class="reading-context"></b></div><div class="reading-nav-links">${page.zones.map(([target, title], i) => `<a href="#${target}"><b>${String(i + 1).padStart(2, '0')}</b><span>${title}</span></a>`).join('')}</div>`;
      const heading = section.querySelector('.chapter-intro,.timeline-head,.duality-head,.passport-heading');
      if (!heading) continue;
      heading.after(nav); navs.set(id, nav);
      nav.addEventListener('click', event => {
        const anchor = event.target.closest('a');
        if (!anchor || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        go(anchor.hash.slice(1));
        schedule();
      });
      for (const [target] of page.zones) document.getElementById(target).classList.add('reading-target');
    }
    // Consistent emphasis: one primary view and a clearly related supporting view.
    ['.viz-line-panel', '.viz-stream-panel', '#structure-overlap', '#province-scatter', '#change-waterfall'].forEach(selector => {
      const el = $(selector); (el?.matches('.viz-panel') ? el : el?.closest('.viz-panel'))?.classList.add('primary-viz');
    });
    $('.landscape-grid').classList.add('reading-landscape-grid');
    const guide = document.createElement('aside');
    guide.className = 'guided-reading'; guide.hidden = true; guide.setAttribute('aria-label', '三分钟数据导览');
    guide.innerHTML = '<div class="guide-top"><div class="guide-progress" role="group" aria-label="导览步骤"></div><button class="guide-minimize" type="button" aria-expanded="false">展开读图提示</button><button class="guide-exit" type="button">退出 ×</button></div><div class="guide-body"><div aria-live="polite"><strong id="guide-title"></strong><p id="guide-copy"></p></div><div class="guide-actions"><button type="button" id="guide-prev">← 上一步</button><button type="button" id="guide-next">下一问 →</button></div></div><small class="guide-boundary">仅居民生活燃料直接 CO₂ · 不含购电、购热与隐含排放 · 可随时退出，自由探索</small>';
    document.body.append(guide);
    const steps = tourSteps(data); let index = -1, activePage = document.body.dataset.page || 'cover', frame;
    $('.guide-progress').innerHTML = steps.map((s, i) => `<button type="button" data-guide-step="${i}">${i + 1} ${s.label}</button>`).join('');
    function exit() { index = -1; guide.hidden = true; document.body.classList.remove('guide-active'); }
    function showStep(i) {
      index = Math.max(0, Math.min(steps.length - 1, i));
      const step = steps[index];
      onStep(index); guide.hidden = false; document.body.classList.add('guide-active');
      // Start compact so the tour does not cover the visualization it introduces.
      guide.classList.add('is-compact'); $('.guide-minimize').setAttribute('aria-expanded', 'false'); $('.guide-minimize').textContent = '展开读图提示';
      $('#guide-title').textContent = step.title; $('#guide-copy').textContent = step.copy;
      $('#guide-prev').disabled = index === 0; $('#guide-next').textContent = index === steps.length - 1 ? '完成，继续自由探索 ✓' : '下一问 →';
      guide.querySelectorAll('[data-guide-step]').forEach(b => { const current = Number(b.dataset.guideStep) === index; b.setAttribute('aria-pressed', String(current)); b.classList.toggle('active', current); });
      go(step.target);
    }
    guide.addEventListener('click', e => {
      const step = e.target.closest('[data-guide-step]');
      if (step) showStep(Number(step.dataset.guideStep));
    });
    $('.guide-exit').addEventListener('click', exit);
    $('.guide-minimize').addEventListener('click', e => { const compact = guide.classList.toggle('is-compact'); e.currentTarget.setAttribute('aria-expanded', String(!compact)); e.currentTarget.textContent = compact ? '展开读图提示' : '收起读图提示'; });
    $('#guide-prev').addEventListener('click', () => showStep(index - 1));
    $('#guide-next').addEventListener('click', () => index === steps.length - 1 ? exit() : showStep(index + 1));
    // Reading a different chapter is an explicit return to free exploration.
    document.querySelectorAll('.chapters a,.logo,.side-brand').forEach(a => a.addEventListener('click', exit));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && index >= 0 && !$('#chart-dialog').open) exit(); });
    function update() {
      frame = null;
      const page = pages[activePage], nav = navs.get(activePage);
      if (!page || !nav) return;
      const threshold = nav.getBoundingClientRect().bottom + 32;
      let current = page.zones[0][0];
      for (const [id] of page.zones) {
        const marker = document.getElementById(id);
        if (marker && marker.getBoundingClientRect().top <= threshold) current = id;
      }
      // A short last section cannot always reach the top before the document ends.
      const last = page.zones.at(-1)[0];
      const lastMarker = document.getElementById(last);
      if (lastMarker && global.scrollY + global.innerHeight >= document.documentElement.scrollHeight - 3 && lastMarker.getBoundingClientRect().top < global.innerHeight) current = last;
      nav.querySelectorAll('a').forEach(a => {
        const active = a.hash === '#' + current; a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function refresh() {
      const s = getState();
      navs.forEach((nav, id) => {
        const context = id === 'duality' ? `${s.selected} · ${s.year} / ${s.a} × ${s.b}` : id === 'retrieval' ? '省份 · 年份 · 燃料 · 城乡' : id === 'timeline' ? `${s.timelineProvinces.length} 省 · ${s.timelineProvince} · ${s.year}` : id === 'change' ? `${s.selected} · ${$('#change-start').value} → ${$('#change-end').value}` : id === 'passport' ? '30 省 · 2015—2022' : `${s.selected} · ${s.year}`;
        nav.querySelector('.reading-context').textContent = context;
      });
      schedule();
    }
    global.addEventListener('scroll', schedule, { passive: true }); global.addEventListener('readingupdate', schedule); global.addEventListener('resize', schedule);
    document.addEventListener('change', refresh); document.addEventListener('input', refresh);
    // Runs after the existing model/control listeners, including SVG/canvas clicks.
    document.addEventListener('click', () => { queueMicrotask(refresh); });
    refresh();
    return { start: () => showStep(0), refresh, navigate(id) { activePage = id; refresh(); } };
  }
  global.CarbonReading = { pages, tourSteps, install };
})(window);
