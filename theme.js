(function (global) {
  'use strict';
  // Presentation only: never change the source inventory or its numeric values.
  const fuel = ['#64796f', '#b56f4b', '#c4a77d', '#ad923c', '#408c70', '#8e83a4'];
  // Keep text inside canvas/WebGL as readable as the surrounding HTML.
  // Copy presentation options only; callbacks and all numeric data stay intact.
  function chartOptions(options) {
    const textKeys = new Set(['textStyle', 'subtextStyle', 'nameTextStyle', 'axisLabel', 'label', 'endLabel']);
    function visit(value, key) {
      if (Array.isArray(value)) return value.map(item => visit(item, key));
      if (!value || typeof value !== 'object') return value;
      const copy = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, k)]));
      if (typeof copy.fontSize === 'number') copy.fontSize = Math.max(14, Math.round(copy.fontSize * 1.25));
      if (textKeys.has(key) || typeof copy.fontSize === 'number') {
        copy.fontSize ??= 14;
        copy.fontWeight = Math.max(600, Number(copy.fontWeight) || 0);
      }
      return copy;
    }
    return { ...visit(options), textStyle: { fontFamily: 'system-ui, sans-serif', fontSize: 14, fontWeight: 600, ...visit(options.textStyle, 'textStyle') } };
  }
  global.CarbonTheme = Object.freeze({
    paper: '#f5f3ec', surface: '#fcfbf7', soft: '#e9eee2',
    ink: '#263d32', muted: '#657264', grid: '#dce2d4', line: '#cad4c3',
    urban: '#2d6656', rural: '#995032', blue: '#527b87', ochre: '#8c681d',
    accent: '#8b5d20', up: '#995032', down: '#2d6656',
    missing: '#e2e0d6', fuel: Object.freeze(fuel), chartOptions,
    ramp: Object.freeze(['#edf0dc', '#c2d3b0', '#739e79', '#285f4a']),
    comparison: Object.freeze(['#2d6656', '#995032', '#527b87', '#8e7740'])
  });
})(window);
