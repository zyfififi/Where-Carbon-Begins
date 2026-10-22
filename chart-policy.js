/* Shared display rules: filter drawings, never change the underlying denominator. */
(function (global) {
  'use strict';
  const hasPositive = values => values.some(value => Number.isFinite(value) && value > 0);
  const hasDelta = values => values.some(value => Number.isFinite(value) && Math.abs(value) > 1e-12);
  const contracts = {
    map: { unit: 'Mt CO₂ / % / 差异度', kind: 'map' },
    trend: { unit: 'Mt CO₂', kind: 'absolute' },
    heatmap: { unit: 'Mt CO₂', kind: 'heat' },
    'stacked-area': { unit: 'Mt CO₂', kind: 'absolute' },
    'sankey-chart': { unit: 'Mt CO₂', kind: 'flow' },
    'profile-chart': { unit: 'Mt CO₂', kind: 'spatial' },
    'overlap-bars': { unit: '%', kind: 'composition' },
    'a-ring': { unit: 'Mt CO₂ / %', kind: 'pie' }, 'b-ring': { unit: 'Mt CO₂ / %', kind: 'pie' },
    'a-bars': { unit: 'Mt CO₂', kind: 'absolute' }, 'b-bars': { unit: 'Mt CO₂', kind: 'absolute' },
    'dual-fingerprint': { unit: '%', kind: 'composition' },
    'dual-percapita': { unit: 't CO₂ / 人', kind: 'absolute' },
    'province-scatter': { unit: 'Mt CO₂ / t CO₂ / 人', kind: 'absolute' },
    'province-ranking': { unit: 'Mt CO₂', kind: 'absolute' },
    'fuel-fingerprint': { unit: '%', kind: 'heat' },
    'change-waterfall': { unit: 'Mt CO₂', kind: 'absolute' },
    'change-fuels': { unit: 'Mt CO₂', kind: 'absolute' },
    'change-slope': { unit: 'Mt CO₂', kind: 'absolute' },
    'grain-chart': { unit: 'D（0—1）', kind: 'index' },
    'retrieval-preview-chart': { unit: 'Mt CO₂', kind: 'absolute' },
    'retrieval-preview-ring': { unit: 'Mt CO₂ / %', kind: 'pie' }
  };
  function validate(id, option) {
    const errors = [], contract = contracts[id];
    if (!contract) return ['missing chart contract'];
    const series = option.series || [], axes = [...(option.xAxis || []), ...(option.yAxis || [])];
    if (!series.length) errors.push('no series');
    if (contract.kind === 'absolute' && !axes.some(a => /Mt|CO₂|t.*人/.test(a.name || ''))) errors.push('absolute axes have no unit');
    if (contract.kind === 'composition' && !axes.some(a => /%/.test(a.name || '') || /%/.test(String(a.axisLabel?.formatter || '')))) errors.push('composition has no percent scale');
    if (contract.kind === 'heat' || contract.kind === 'map') {
      const scale = option.visualMap?.[0];
      if (!scale || scale.min !== 0 || !(scale.max > 0)) errors.push('missing nonnegative color scale');
    }
    if (contract.kind === 'index' && !axes.some(a => a.min === 0 && a.max === 1 && /D/.test(a.name || ''))) errors.push('index is not bounded 0–1');
    if (id === 'stacked-area' || id === 'overlap-bars') {
      if (series.some(s => !hasPositive((s.data || []).map(d => typeof d === 'number' ? d : d.value)))) errors.push('all-zero composition series');
    }
    if (contract.kind === 'flow') {
      const flow = series[0], links = flow.links || flow.edges || [];
      if (links.some(l => !(l.value > 0))) errors.push('nonpositive flow link');
      const used = new Set(links.flatMap(l => [l.source, l.target]));
      if ((flow.data || []).some(n => !used.has(n.name))) errors.push('unused flow node');
    }
    if (contract.kind === 'spatial') {
      const axis = option.zAxis3D?.[0];
      if (series[0]?.type === 'bar3D' && (!axis || axis.min !== 0 || !/Mt/.test(axis.name || ''))) errors.push('3D height has no zero baseline or unit');
      // 2D historical view encodes the very same Mt values in a color scale.
      if (series[0]?.type === 'heatmap' && !option.visualMap?.length) errors.push('2D history has no color scale');
    }
    return errors;
  }
  global.CarbonChartPolicy = { hasPositive, hasDelta, contracts, validate };
})(window);
