(function(){
  'use strict';
  const DATA=window.CARBON_HISTORY;
  const MAP=window.CARBON_MAP;
  const YEARS=DATA.meta.years.map(Number);
  const FIRST_YEAR=YEARS[0], LAST_YEAR=YEARS[YEARS.length-1];
  const T=window.CarbonTheme;
  const I=window.CarbonInsights;
  const P=window.CarbonChartPolicy;
  const GROUPS=DATA.meta.groups.map((g,i)=>({...g,color:T.fuel[i]}));
  const provinces=DATA.series[String(YEARS[YEARS.length-1])].provinces;
  const provinceNames=provinces.map(p=>p.name);
  const byName=Object.fromEntries(provinces.map(p=>[p.name,p]));
  const state={...I.readAppState(DATA),playing:false};
  const $=(s)=>document.querySelector(s); const $$=(s)=>Array.from(document.querySelectorAll(s));
  const fmt=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—';
  const pct=(n)=>Number.isFinite(n)?`${(n*100).toFixed(1)}%`:'—';
  const yearData=()=>DATA.series[String(state.year)];
  const getProvince=(name=state.selected)=>yearData().provinces.find(p=>p.name===name)||provinces.find(p=>p.name===name);
  function groupTotal(p,side,g){return g.indices.reduce((s,i)=>s+(p[side]?.[i]||0),0)}
  function dominantGroups(p){const vals=GROUPS.map(g=>({name:g.name,value:groupTotal(p,'urban',g)+groupTotal(p,'rural',g),color:g.color})).sort((a,b)=>b.value-a.value);return vals.slice(0,3)}
  function fillSelect(el, selected){if(!el)return;el.innerHTML=provinceNames.map(n=>`<option value="${n}" ${n===selected?'selected':''}>${n}</option>`).join('')}
  const rawFuelNames=DATA.meta.fuels.map(f=>f.name);
  const retrievalState={query:'',province:'',year:'',fuel:'',side:'all'};
  let retrievalLimit=4;
  let retrievalPreview=null;
  const esc=(value)=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function retrievalFuelInfo(value){
    if(!value)return null;
    if(value.startsWith('raw:')){const index=Number(value.slice(4));return {label:rawFuelNames[index],indices:[index]};}
    const group=GROUPS.find(g=>`group:${g.id}`===value); return group?{label:group.name,indices:group.indices}:null;
  }
  function retrievalValue(p,side,info){
    if(!info)return side==='urban'?p.urbanTotal:side==='rural'?p.ruralTotal:p.total;
    return ['urban','rural'].reduce((sum,key)=>sum+(side==='all'||side===key?info.indices.reduce((v,i)=>v+(p[key]?.[i]||0),0):0),0);
  }
  function retrievalTotal(p,side){return side==='urban'?p.urbanTotal:side==='rural'?p.ruralTotal:p.total}
  function retrievalShare(p,side,value){const total=retrievalTotal(p,side);return total>0?value/total:null}
  function retrievalTermsMatch(p,year,query){
    const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean); if(!terms.length)return true;
    return terms.every(term=>{
      if(String(year).includes(term)||p.name.toLowerCase().includes(term))return true;
      if(rawFuelNames.some((name,i)=>name.toLowerCase().includes(term)&&((p.urban[i]||0)+(p.rural[i]||0)>0)))return true;
      return GROUPS.some(g=>g.name.toLowerCase().includes(term)&&groupTotal(p,'urban',g)+groupTotal(p,'rural',g)>0);
    });
  }
  function retrievalMatches(p,year){
    const provinceOk=!retrievalState.province||p.name===retrievalState.province;
    const yearOk=!retrievalState.year||Number(retrievalState.year)===year;
    const info=retrievalFuelInfo(retrievalState.fuel);
    const fuelOk=!info||retrievalValue(p,retrievalState.side,info)>0;
    const query=retrievalState.query.trim();
    const queryOk=!query||retrievalTermsMatch(p,year,query);
    return provinceOk&&yearOk&&fuelOk&&queryOk;
  }
  function retrievalSources(p,side,info){
    if(info){const value=retrievalValue(p,side,info);return value>0?[{name:info.label,value,share:retrievalShare(p,side,value)}]:[];}
    return GROUPS.map(g=>({name:g.name,value:retrievalValue(p,side,{indices:g.indices}),share:null})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,3).map(x=>({...x,share:retrievalShare(p,side,x.value)}));
  }
  function retrievalRows(){
    const rows=[]; for(const year of YEARS.slice().reverse()){for(const p of DATA.series[String(year)].provinces){if(retrievalMatches(p,year))rows.push({year,p});}}
    return rows.sort((a,b)=>b.year-a.year||b.p.total-a.p.total);
  }
  function renderRetrieval(){
    const summary=$('#retrieval-summary'),results=$('#retrieval-results'); if(!summary||!results)return;
    const rows=retrievalRows(), shown=rows.slice(0,retrievalLimit), info=retrievalFuelInfo(retrievalState.fuel), sideLabel=retrievalState.side==='urban'?'城镇':retrievalState.side==='rural'?'农村':'城乡合计';
    if(rows.length && (!retrievalPreview || !rows.some(row=>row.year===retrievalPreview.year&&row.p.name===retrievalPreview.province))) retrievalPreview={year:rows[0].year,province:rows[0].p.name};
    const filterText=[retrievalState.province,retrievalState.year,info?.label,sideLabel].filter(Boolean).join(' · ');
    summary.innerHTML=`<strong>${rows.length}</strong> 条记录${filterText?` · ${esc(filterText)}`:''}${rows.length>shown.length?` · 已显示前 ${shown.length} 条`:''}`;
    results.innerHTML=shown.length?shown.map(({year,p})=>{const total=retrievalTotal(p,retrievalState.side),value=info?retrievalValue(p,retrievalState.side,info):total,sources=retrievalSources(p,retrievalState.side,info),selected=year===retrievalPreview.year&&p.name===retrievalPreview.province;return `<button type="button" class="retrieval-result${selected?' is-selected':''}" data-retrieval-province="${esc(p.name)}" data-retrieval-year="${year}"><span class="retrieval-result-head"><strong>${esc(p.name)} · ${year}</strong><b>${fmt(total)} Mt CO₂</b></span><span class="retrieval-result-metrics"><span>城镇 ${fmt(p.urbanTotal)}</span><span>农村 ${fmt(p.ruralTotal)}</span><span>农村占比 ${pct(p.ruralShare)}</span><span>D₁₇ ${fmt(p.difference,3)}</span></span><span class="retrieval-result-source">${info?`${esc(info.label)}：${fmt(value)} Mt · ${pct(retrievalShare(p,retrievalState.side,value))}`:`主要来源：${sources.map(x=>`${esc(x.name)} ${fmt(x.value)} Mt`).join(' · ')}`}</span></button>`}).join('')+(rows.length>shown.length?'<button type="button" id="retrieval-more" class="quiet-button retrieval-more">显示更多</button>':''):'<p class="retrieval-empty">没有符合条件的记录。试试省份、年份或燃料名称。</p>';
    const previewRow=rows.find(row=>row.year===retrievalPreview?.year&&row.p.name===retrievalPreview?.province)||rows[0];
    const empty=$('#retrieval-preview-empty'), visuals=$('#retrieval-visuals');
    if(previewRow) { empty.hidden=true; visuals?.classList.remove('is-empty'); renderRetrievalPreview(previewRow); }
    else { empty.hidden=false; visuals?.classList.add('is-empty'); $('#retrieval-preview-context').textContent='没有匹配记录'; retrievalPreviewChart?.clear(); retrievalPreviewRing?.clear(); }
  }
  let retrievalPreviewChart=null, retrievalPreviewRing=null;
  function renderRetrievalPreview(row){
    const p=row.p, groups=GROUPS.map(g=>({name:g.name,urban:groupTotal(p,'urban',g),rural:groupTotal(p,'rural',g),color:g.color}));
    const chart=$('#retrieval-preview-chart'), ring=$('#retrieval-preview-ring'); if(!chart||!ring||!retrievalPreviewChart||!retrievalPreviewRing)return;
    $('#retrieval-preview-context').textContent=`${p.name} · ${row.year} · Mt CO₂`;
    retrievalPreviewChart.setOption(T.chartOptions({grid:{left:36,right:18,top:24,bottom:54,containLabel:true},tooltip:{...tooltipStyle,trigger:'axis'},legend:{bottom:4,left:0,right:0,itemWidth:12,itemHeight:8,textStyle:{color:palette.muted,fontSize:10}},xAxis:{type:'category',data:groups.map(g=>g.name),axisLabel:{color:palette.muted,fontSize:10,interval:0,rotate:groups.length>4?22:0}},yAxis:{type:'value',min:0,name:'Mt CO₂',nameTextStyle:{color:palette.muted,fontSize:10},axisLabel:{color:palette.muted,fontSize:10},splitLine:{lineStyle:{color:palette.grid}}},series:[{name:'城镇',type:'bar',barMaxWidth:24,itemStyle:{color:palette.teal},data:groups.map(g=>g.urban)},{name:'农村',type:'bar',barMaxWidth:24,itemStyle:{color:palette.orange},data:groups.map(g=>g.rural)}]}),{notMerge:true});
    retrievalPreviewRing.setOption(T.chartOptions({tooltip:{...tooltipStyle,trigger:'item'},legend:{bottom:6,left:'center',itemWidth:12,itemHeight:8,textStyle:{color:palette.muted,fontSize:10}},series:[{type:'pie',radius:['45%','70%'],center:['50%','46%'],label:{show:true,color:palette.ink,fontSize:12,formatter:p=>`${p.name}\n${(p.percent||0).toFixed(1)}%`},data:[{name:'城镇',value:p.urbanTotal,itemStyle:{color:palette.teal}},{name:'农村',value:p.ruralTotal,itemStyle:{color:palette.orange}}]}]}),{notMerge:true});
  }
  function installRetrieval(){
    const province=$('#retrieval-province'),year=$('#retrieval-year'),fuel=$('#retrieval-fuel'); if(!province||!year||!fuel)return;
    province.innerHTML='<option value="">全部省份</option>'+provinceNames.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    year.innerHTML='<option value="">全部年份</option>'+YEARS.map(y=>`<option value="${y}">${y}</option>`).join('');
    fuel.innerHTML='<option value="">全部燃料</option>'+GROUPS.map(g=>`<option value="group:${g.id}">${esc(g.name)}（展示组）</option>`).join('')+rawFuelNames.map((n,i)=>`<option value="raw:${i}">${esc(n)}</option>`).join('');
    const sync=()=>{retrievalState.query=$('#retrieval-query').value;retrievalState.province=province.value;retrievalState.year=year.value;retrievalState.fuel=fuel.value;retrievalState.side=$('#retrieval-side').value;retrievalLimit=4;renderRetrieval()};
    $('#retrieval-query').addEventListener('input',sync); province.addEventListener('change',sync);year.addEventListener('change',sync);fuel.addEventListener('change',sync);$('#retrieval-side').addEventListener('change',sync);
    $('#retrieval-reset').addEventListener('click',()=>{$('#retrieval-query').value='';province.value='';year.value='';fuel.value='';$('#retrieval-side').value='all';sync()});
    $('#retrieval-results').addEventListener('click',event=>{if(event.target.closest('#retrieval-more')){retrievalLimit+=4;renderRetrieval();return}const result=event.target.closest('.retrieval-result');if(!result)return;retrievalPreview={province:result.dataset.retrievalProvince,year:Number(result.dataset.retrievalYear)};renderRetrieval();state.selected=result.dataset.retrievalProvince;state.timelineProvince=state.selected;state.year=Number(result.dataset.retrievalYear);syncControls();renderProvincePool();renderYear();router.go('duality');toast(`已定位 ${state.selected} · ${state.year}`)});
    renderRetrieval();
  }
  let insights, reading;
  function upgradeTimelineMarkup(){
    const controls=$('.timeline-controls');
    controls.innerHTML='<div class="timeline-select-block"><span>比较省份 <b id="selection-count">3 / 4</b></span><div id="province-pool" class="province-pool" aria-label="多选比较省份"></div></div><div class="timeline-switch" role="group" aria-label="趋势口径"><button type="button" class="active" data-trend-mode="total">城乡合计</button><button type="button" data-trend-mode="urban">城镇</button><button type="button" data-trend-mode="rural">农村</button></div>';
    const grid=$('.timeline-grid');
    grid.innerHTML='<article class="viz-panel viz-line-panel"><div class="viz-panel-head"><div><span class="viz-index">A</span><h3>多省趋势轨道</h3></div><small>历年 · Mt CO₂</small></div><div id="trend" class="trend" role="img" aria-label="多省年度排放趋势图"></div></article><article class="viz-panel viz-heat-panel"><div class="viz-panel-head"><div><span class="viz-index">B</span><h3>省份 × 年份热力矩阵</h3></div><small>颜色越亮，排放越高</small></div><div id="heatmap" class="heatmap" role="img" aria-label="省份年份排放热力矩阵"></div></article><article class="viz-panel viz-stream-panel"><div class="viz-panel-head"><div><span class="viz-index">C</span><h3><span id="timeline-title">河北</span>的燃料层</h3></div><label class="focus-select">聚焦<select id="timeline-province" aria-label="燃料层聚焦省份"></select></label></div><div id="stacked-area" class="stacked-area" role="img" aria-label="所选省份燃料构成堆叠面积图"></div><p class="viz-caption" id="timeline-copy">拖动或点选省份，观察燃料结构如何换挡。</p></article><article class="viz-panel viz-ring-panel"><div class="viz-panel-head"><div><span class="viz-index">D</span><h3>城乡 → 燃料流</h3></div><small>排放从哪里来</small></div><div id="sankey-chart" class="sankey-chart" role="img" aria-label="城乡到燃料的碳排放桑基图"></div><div class="ring-readout"><strong id="timeline-change">—</strong><span id="timeline-range-readout">历年变化</span></div></article><article class="viz-panel viz-profile-panel"><div class="viz-panel-head"><div><span class="viz-index">E</span><h3><span id="profile-title">河北</span>城乡燃料立体剖面</h3></div><small>柱体高度 = Mt CO₂</small></div><div id="profile-chart" class="profile-chart" role="img" aria-label="城乡燃料立体柱状剖面图"></div></article>';
    grid.classList.add('visual-dashboard');
    grid.querySelector('.viz-profile-panel').outerHTML=CarbonLab.markup();
    grid.querySelector('.viz-heat-panel').append($('#timeline > .data-details'));
    const zone=(id,index,title)=>`<div class="timeline-zone" id="${id}"><span>${index}</span><div><h3>${title}</h3></div></div>`;
    grid.querySelector('.viz-line-panel').insertAdjacentHTML('beforebegin',zone('timeline-comparison','01','多省趋势'));
    grid.querySelector('.viz-stream-panel').insertAdjacentHTML('beforebegin',zone('timeline-composition','02','燃料结构'));
    grid.querySelector('#carbon-lab').insertAdjacentHTML('beforebegin',zone('timeline-lab','03','三维探索'));
    fillSelect($('#timeline-province'),state.timelineProvince);
    fillSelect($('#province-a'),state.a);
    fillSelect($('#province-b'),state.b);
  }
  upgradeTimelineMarkup();
  const yearSlider=$('#year-slider');
  if(yearSlider){yearSlider.min=FIRST_YEAR;yearSlider.max=LAST_YEAR;yearSlider.value=LAST_YEAR;const ticks=$('.year-ticks');if(ticks)ticks.innerHTML=YEARS.map(year=>`<span>${year}</span>`).join('');}
  const mapChart=echarts.init($('#map')); const trendChart=echarts.init($('#trend')); const heatmapChart=echarts.init($('#heatmap')); const stackedChart=echarts.init($('#stacked-area')); const sankeyChart=echarts.init($('#sankey-chart')); retrievalPreviewChart=echarts.init($('#retrieval-preview-chart')); retrievalPreviewRing=echarts.init($('#retrieval-preview-ring'));
  echarts.registerMap('china',MAP);
  const palette={teal:T.urban,mint:T.urban,orange:T.rural,yellow:T.ochre,ink:T.ink,muted:T.muted,grid:T.grid};
  const tooltipStyle={confine:true,backgroundColor:T.surface,borderColor:T.line,textStyle:{color:T.ink,fontSize:11},extraCssText:'box-shadow:0 6px 24px rgba(38,61,50,.12);'};
  $('.viz-heat-panel .viz-panel-head small').textContent='颜色越深，排放越高';
  const analysis=CarbonAnalysis.create({data:DATA,echarts,getState:()=>state,onSelect:selectProvince});
  fillSelect($('#global-province'),state.selected);
  $('#global-year').innerHTML=YEARS.map(year=>`<option${year===state.year?' selected':''}>${year}</option>`).join('');
  const carbonLab=CarbonLab.create({
    data:DATA,echarts,root:$('#carbon-lab'),
    onProvinceChange:selectProvince,
    onYearChange:year=>{$('#year-slider').value=year;renderYear()}
  });
  function syncControls(){
    $('#global-province').value=state.selected;$('#global-year').value=state.year;
    $('#year-slider').value=state.year;$('#timeline-province').value=state.timelineProvince;
    $('#province-a').value=state.a;$('#province-b').value=state.b;
    $$('#atlas [data-metric]').forEach(b=>b.classList.toggle('active',b.dataset.metric===state.metric));
    $$('.timeline-switch [data-trend-mode]').forEach(b=>b.classList.toggle('active',b.dataset.trendMode===state.timelineMode));
  }
  function selectProvince(name){
    state.selected=name;state.timelineProvince=name;
    fillSelect($('#timeline-province'),name);
    if(!state.timelineProvinces.includes(name)){
      if(state.timelineProvinces.length>=4)state.timelineProvinces.pop();
      state.timelineProvinces.unshift(name);renderProvincePool();
    }
    renderDetail();renderMap();renderTrend();analysis.renderLandscape();analysis.renderChange();insights?.render();insights?.syncURL();reading?.refresh();
  }
  function metricValue(p){if(state.metric==='ruralShare')return p.ruralShare;if(state.metric==='difference')return p.difference;return p.total}
  function renderMap(){
    const items=yearData().provinces.map(p=>({name:p.name,selected:p.name===state.selected,value:metricValue(p),total:p.total,ruralShare:p.ruralShare,difference:p.difference,urban:p.urbanTotal,rural:p.ruralTotal}));
    const {min,max}=I.mapScale(DATA,state.metric);
    // ECharts' default selected map fill is gold even when areaColor is null.
    // Pin each region's selected/hover fill to its numeric visual-map color.
    items.forEach(d=>{const color=echarts.color.lerp(Math.max(0,Math.min(1,(d.value-min)/(max-min))),T.ramp);d.select={itemStyle:{areaColor:color}};d.emphasis={itemStyle:{areaColor:color}}});
    const label=state.metric==='total'?'总排放（Mt CO₂）':state.metric==='ruralShare'?'农村占比（%）':'结构差异 D';
    $('#legend-title').textContent=label;$('#legend-min').textContent=state.metric==='total'?fmt(min,0):state.metric==='ruralShare'?pct(min):fmt(min);$('#legend-max').textContent=state.metric==='total'?fmt(max,0):state.metric==='ruralShare'?pct(max):fmt(max);
    mapChart.setOption(T.chartOptions({backgroundColor:'transparent',tooltip:{...tooltipStyle,trigger:'item',formatter:(p)=>{const d=p.data||{};return Number.isFinite(d.total)?`<b>${p.name} · ${state.year}</b><br/>总量 ${fmt(d.total)} Mt<br/>农村占比 ${pct(d.ruralShare)}<br/>结构差异 D₁₇ ${fmt(d.difference,3)}`:`<b>${p.name}</b><br/>本清单未覆盖，不代表零排放。`}},visualMap:{show:false,min,max,inRange:{color:T.ramp}},series:[{type:'map',map:'china',roam:false,selectedMode:'single',layoutCenter:['50%','50%'],layoutSize:'100%',zoom:1,label:{show:false},itemStyle:{areaColor:T.missing,borderColor:'#fcfbf7',borderWidth:1,shadowColor:'rgba(45,75,40,.13)',shadowBlur:8,shadowOffsetY:4},select:{label:{show:true,color:T.ink,fontSize:12,backgroundColor:'rgba(252,251,247,.92)',padding:[4,6],borderRadius:2},itemStyle:{areaColor:null,borderColor:T.accent,borderWidth:2.5,shadowColor:'rgba(45,102,86,.35)',shadowBlur:16}},emphasis:{label:{show:true,color:T.ink,fontSize:12,backgroundColor:'rgba(252,251,247,.92)',padding:[4,6]},itemStyle:{areaColor:null,borderColor:T.accent,borderWidth:2,shadowColor:'rgba(45,102,86,.3)',shadowBlur:15}},data:items}]}),{notMerge:true});
    mapChart.off('click');mapChart.on('click',p=>{if(p.name&&byName[p.name])selectProvince(p.name)});
  }
  function insight(p){const dom=dominantGroups(p)[0];return `${p.year} 年，农村排放占城乡合计的 ${pct(p.ruralShare)}；${dom.name}是主要燃料组，城乡结构差异 D₁₇ 为 ${fmt(p.difference,3)}。`}
  function renderDetail(){const p=getProvince();$('#global-province').value=state.selected;const rank=[...yearData().provinces].sort((a,b)=>b.total-a.total).findIndex(x=>x.name===p.name)+1;$('#detail-location').textContent=`当前省份 · ${p.name}`;$('#detail-rank').textContent=`NO.${String(rank).padStart(2,'0')}`;$('#detail-name').textContent=p.name;$('#detail-copy').textContent=insight(p);$('#detail-total').textContent=fmt(p.total);$('#detail-urban').textContent=fmt(p.urbanTotal);$('#detail-rural').textContent=fmt(p.ruralTotal);$('#detail-share').textContent=pct(p.ruralShare);$('#detail-diff').textContent=fmt(p.difference);$('#detail-percapita').textContent=p.population?`${fmt(p.urbanPerCapita,2)} / ${fmt(p.ruralPerCapita,2)}`:'—';const denom=Math.max(p.urbanTotal,p.ruralTotal,1);$('#urban-fill').style.width=`${p.urbanTotal/denom*100}%`;$('#rural-fill').style.width=`${p.ruralTotal/denom*100}%`;$('#detail-fuels').innerHTML=dominantGroups(p).map(g=>`<span class="fuel-chip" style="border-color:${g.color}55">${g.name} · ${fmt(g.value)} Mt</span>`).join('');}
  function renderTrend(){
    const selected=state.timelineProvinces; const mode=state.timelineMode;
    const getVal=(p)=>mode==='urban'?p?.urbanTotal:mode==='rural'?p?.ruralTotal:p?.total;
    const colors=T.comparison;
    trendChart.setOption(T.chartOptions({animationDuration:650,grid:{left:12,right:20,top:66,bottom:18,containLabel:true},tooltip:{...tooltipStyle,trigger:'axis'},legend:{type:'scroll',top:3,right:0,left:0,textStyle:{color:palette.muted,fontSize:10},pageTextStyle:{color:palette.muted,fontSize:14,fontWeight:600}},xAxis:{type:'category',data:YEARS,axisLine:{lineStyle:{color:palette.grid}},axisLabel:{color:palette.muted,fontSize:10}},yAxis:{type:'value',name:'Mt CO₂',nameTextStyle:{color:palette.muted,fontSize:9},splitLine:{lineStyle:{color:palette.grid}},axisLabel:{color:palette.muted,fontSize:9}},series:selected.map((name,i)=>({name,type:'line',smooth:false,symbol:'circle',symbolSize:7,lineStyle:{width:i===0?3:2,color:colors[i]},itemStyle:{color:colors[i]},data:YEARS.map(y=>getVal(DATA.series[String(y)].provinces.find(p=>p.name===name)))}))}),{notMerge:true});
    renderHeatmap(selected,mode); renderStacked(state.timelineProvince); renderSankey(state.timelineProvince); renderProfile(state.timelineProvince);
    const firstYear=YEARS[0],lastYear=YEARS[YEARS.length-1]; const pFirst=DATA.series[String(firstYear)].provinces.find(p=>p.name===state.timelineProvince),pLast=DATA.series[String(lastYear)].provinces.find(p=>p.name===state.timelineProvince);$('#timeline-title').textContent=state.timelineProvince;$('#timeline-copy').textContent='城乡合计 · Mt CO₂';$('#timeline-change').textContent=pFirst&&pLast?`${pLast.total-pFirst.total>=0?'+':''}${fmt(pLast.total-pFirst.total)} Mt`:'—';
    const rangeEl=$('#timeline-range'); if(rangeEl)rangeEl.textContent=`${firstYear} → ${lastYear}`; const rangeReadout=$('#timeline-range-readout'); if(rangeReadout)rangeReadout.innerHTML=`${firstYear} → ${lastYear}<br>城乡合计变化`;
    $('#selection-count').textContent=`${selected.length} / 4`;
  }
  function renderHeatmap(selected,mode){
    const getVal=(p)=>mode==='urban'?p?.urbanTotal:mode==='rural'?p?.ruralTotal:p?.total;
    const vals=[];selected.forEach((name,ri)=>YEARS.forEach((y,yi)=>{const p=DATA.series[String(y)].provinces.find(x=>x.name===name);vals.push([yi,ri,getVal(p)||0])}));
    const max=Math.max(...vals.map(v=>v[2]));
    $('.viz-heat-panel .viz-panel-head small').textContent=`越深越高 · 0—${fmt(max,1)} Mt`;
    heatmapChart.setOption(T.chartOptions({grid:{left:8,right:12,top:14,bottom:16,containLabel:true},tooltip:{...tooltipStyle,position:'top',formatter:(p)=>`${selected[p.value[1]]} · ${YEARS[p.value[0]]}<br/><b>${fmt(p.value[2])} Mt</b>`},xAxis:{type:'category',data:YEARS,axisLine:{lineStyle:{color:palette.grid}},axisLabel:{color:palette.muted,fontSize:9}},yAxis:{type:'category',data:selected,axisLine:{show:false},axisLabel:{color:palette.mint,fontSize:10}},visualMap:{min:0,max,show:false,inRange:{color:T.ramp}},series:[{type:'heatmap',data:vals.map(v=>({value:v,label:{color:I.labelColor(echarts,v[2]/max)}})),label:{show:$('#heatmap').clientWidth>=430,fontSize:14,formatter:p=>fmt(p.value[2],1)},itemStyle:{borderColor:T.surface,borderWidth:2}}]}));
  }
  function renderStacked(name){
    const series=GROUPS.map(g=>({name:g.name,type:'line',stack:'total',smooth:false,showSymbol:false,areaStyle:{opacity:.78},lineStyle:{width:1},itemStyle:{color:g.color},data:YEARS.map(y=>{const p=DATA.series[String(y)].provinces.find(x=>x.name===name);return groupTotal(p,'urban',g)+groupTotal(p,'rural',g)})})).filter(s=>P.hasPositive(s.data));
    stackedChart.setOption(T.chartOptions({grid:{left:12,right:18,top:36,bottom:64,containLabel:true},tooltip:{...tooltipStyle,trigger:'axis'},legend:{type:'scroll',bottom:4,left:0,right:0,itemWidth:13,itemHeight:9,textStyle:{color:palette.muted,fontSize:9},pageTextStyle:{color:palette.muted,fontSize:14,fontWeight:600}},xAxis:{type:'category',data:YEARS,axisLine:{lineStyle:{color:palette.grid}},axisLabel:{color:palette.muted,fontSize:9}},yAxis:{type:'value',name:'Mt CO₂',nameTextStyle:{color:palette.muted,fontSize:9},splitLine:{lineStyle:{color:palette.grid}},axisLabel:{color:palette.muted,fontSize:9}},series}),{notMerge:true});
  }
  function renderSankey(name){
    const p=DATA.series[String(state.year)].provinces.find(x=>x.name===name);if(!p)return;
    const active=GROUPS.filter(g=>P.hasPositive([groupTotal(p,'urban',g),groupTotal(p,'rural',g)]));
    const nodes=[{name:'城镇',itemStyle:{color:palette.teal}},{name:'农村',itemStyle:{color:palette.orange}},...active.map(g=>({name:g.name,itemStyle:{color:g.color}}))];
    const links=[];active.forEach(g=>{for(const side of ['urban','rural']){const value=groupTotal(p,side,g);if(value>0)links.push({source:side==='urban'?'城镇':'农村',target:g.name,value})}});
    sankeyChart.setOption(T.chartOptions({tooltip:{...tooltipStyle,trigger:'item',formatter:(x)=>x.dataType==='edge'?`${x.data.source} → ${x.data.target}<br/><b>${fmt(x.data.value,6)} Mt</b>`:`${x.name}`},series:[{type:'sankey',left:42,right:98,top:20,bottom:18,nodeWidth:14,nodeGap:18,draggable:true,layoutIterations:32,emphasis:{focus:'adjacency'},data:nodes,links,lineStyle:{color:'gradient',opacity:.42,curveness:.5},label:{color:palette.ink,fontSize:9,formatter:p=>p.name==='煤及煤制品'?'煤及\n煤制品':p.name},levels:[{depth:0,label:{position:'left'}},{depth:1,label:{position:'right'}}],itemStyle:{borderColor:'transparent'}}]}),{notMerge:true});
  }
  function renderProfile(name){carbonLab.render(name,state.year,state.timelineMode)}
  function renderDuality(){analysis.renderDuality()}
  function renderYear(){state.year=Number($('#year-slider').value);$('#global-year').value=state.year;$('#year-label').textContent=state.year;renderMap();renderDetail();renderTrend();renderDuality();analysis.renderLandscape();analysis.renderChange();insights?.render();insights?.syncURL();reading?.refresh()}
  $('#global-province').addEventListener('change',e=>selectProvince(e.target.value));
  $('#global-year').addEventListener('change',e=>{$('#year-slider').value=e.target.value;renderYear()});
  $$('#atlas .atlas-mode button').forEach(b=>b.addEventListener('click',()=>{$$('#atlas .atlas-mode button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.metric=b.dataset.metric;renderMap()}));
  function renderProvincePool(){const pool=$('#province-pool');pool.innerHTML=provinceNames.map(name=>`<button type="button" class="province-pill ${state.timelineProvinces.includes(name)?'active':''}" data-province="${name}" aria-pressed="${state.timelineProvinces.includes(name)}">${name}</button>`).join('');$$('#province-pool .province-pill').forEach(btn=>btn.addEventListener('click',()=>{const name=btn.dataset.province;if(state.timelineProvinces.includes(name)){if(state.timelineProvinces.length<=1){toast('至少保留一个省份');return}state.timelineProvinces=state.timelineProvinces.filter(x=>x!==name)}else if(state.timelineProvinces.length<4)state.timelineProvinces.push(name);else toast('最多同时比较 4 个省份');renderProvincePool();renderTrend() }))}
  $('#year-slider').addEventListener('input',renderYear);$('#timeline-province').addEventListener('change',e=>selectProvince(e.target.value));$('#province-a').addEventListener('change',e=>{state.a=e.target.value;renderDuality()});$('#province-b').addEventListener('change',e=>{state.b=e.target.value;renderDuality()});
  $$('.timeline-switch button').forEach(btn=>btn.addEventListener('click',()=>{$$('.timeline-switch button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.timelineMode=btn.dataset.trendMode;renderTrend()}));
  $('#next-province').addEventListener('click',()=>{const i=provinceNames.indexOf(state.selected);selectProvince(provinceNames[(i+1)%provinceNames.length])});$('#swap').addEventListener('click',()=>{[state.a,state.b]=[state.b,state.a];fillSelect($('#province-a'),state.a);fillSelect($('#province-b'),state.b);renderDuality()});$('#random-pair').addEventListener('click',()=>{const a=provinceNames[Math.floor(Math.random()*provinceNames.length)];let b=provinceNames[Math.floor(Math.random()*provinceNames.length)];while(b===a)b=provinceNames[Math.floor(Math.random()*provinceNames.length)];state.a=a;state.b=b;fillSelect($('#province-a'),a);fillSelect($('#province-b'),b);renderDuality();toast(`已换成 ${a} × ${b}`)});
  let playTimer;$('#play').addEventListener('click',()=>{state.playing=!state.playing;$('#play').textContent=state.playing?'Ⅱ':'▶';if(state.playing){playTimer=setInterval(()=>{const n=Number($('#year-slider').value);$('#year-slider').value=n>=LAST_YEAR?FIRST_YEAR:n+1;renderYear()},1100)}else clearInterval(playTimer)});
  let router;
  $('#start-story').addEventListener('click',()=>reading.start());$('#cover-enter').addEventListener('click',()=>router.go('atlas'));
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
  renderProvincePool();
  function resizeCharts(){[mapChart,trendChart,heatmapChart,stackedChart,sankeyChart,retrievalPreviewChart,retrievalPreviewRing].forEach(c=>{if(c.getDom().getClientRects().length)c.resize()});carbonLab.resize();analysis.resize();insights?.resize()}
  window.addEventListener('resize',resizeCharts);
  // Font, sidebar and breakpoint changes can resize a canvas without a window event.
  if('ResizeObserver' in window){
    let resizeFrame;
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resizeCharts)});
    $$('#map,#trend,#heatmap,#stacked-area,#sankey-chart,.analysis-chart,.ranking-chart,.fingerprint-chart,.dual-ring,.dual-bars').forEach(el=>observer.observe(el));
  }
  syncControls();renderYear();
  installRetrieval();
  insights=I.install({data:DATA,getState:()=>state,getExtras:()=>({...analysis.getURLState(),...carbonLab.getURLState()}),onDiscover:kind=>{
    state.year=LAST_YEAR;
    if(kind==='hebei'||kind==='structure'){state.selected='河北';state.timelineProvince='河北';analysis.configure({from:FIRST_YEAR,to:LAST_YEAR});}
    if(kind==='denominator')analysis.configure({coordinate:'percapita'});
    syncControls();renderYear();
    router.go(kind==='hebei'?'change':kind==='denominator'?'landscape':kind==='structure'?'structure-overlap':'granularity');
    insights.render();insights.syncURL();
  }});
  insights.render();
  reading=CarbonReading.install({data:DATA,getState:()=>state,go:id=>router.go(id),onStep:index=>{
    if(state.playing){state.playing=false;clearInterval(playTimer);$('#play').textContent='▶'}
    state.year=LAST_YEAR;
    if(index===0||index===2){state.selected='河北';state.timelineProvince='河北';}
    if(index===1)analysis.configure({coordinate:'total'});
    if(index===2)analysis.configure({from:FIRST_YEAR,to:LAST_YEAR});
    syncControls();renderProvincePool();renderYear();insights.syncURL();
  }});
  // Install all generated anchors before resolving an incoming hash/deep link.
  router=CarbonRoutes.create({onNavigate:page=>{
    if(page==='duality')renderDuality();
    if(page==='landscape')analysis.renderLandscape();
    if(page==='change')analysis.renderChange();
    insights.render();reading.navigate(page);
    if(page!=='atlas'&&state.playing){state.playing=false;clearInterval(playTimer);$('#play').textContent='▶'}
    requestAnimationFrame(resizeCharts);
  }});
  window.addEventListener('popstate',()=>{
    Object.assign(state,I.readAppState(DATA));analysis.restoreURL();carbonLab.restoreURL();insights.restoreURL();syncControls();renderProvincePool();renderYear();
  });
})();
