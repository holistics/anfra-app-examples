// ECharts helpers in Wealthfolio's light look. Every chart is render-safe (animation off).
(() => {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  // A sibling theme can restyle the charts from CSS; unset vars keep the Wealthfolio look.
  const opt = (v, fallback) => css(v) || fallback;
  const font = () => opt('--chart-font', 'JetBrains Mono, monospace');
  // Area fill end: 'transparent' (black at 0) greys the fade; --chart-area-fade: self fades to the line's own hue.
  const fadeTo = (c) => {
    if (css('--chart-area-fade') !== 'self') return 'transparent';
    if (/^#[0-9a-f]{6}$/i.test(c)) return `${c}00`;
    if (/^hsl\(/i.test(c)) return c.replace(/\)$/, ' / 0)');
    return 'transparent';
  };
  const inst = new Map();
  // 19 Oct: no draw-in animation (Nhi: "remove the animation when the chart appears, for performance"); charts render at once
  const chart = (el) => { if (!inst.has(el)) inst.set(el, echarts.init(el, null, { renderer: 'canvas' })); return inst.get(el); };
  window.addEventListener('resize', () => inst.forEach((c) => c.resize()));
  const base = () => ({
    animation: false,
    textStyle: { fontFamily: font(), color: css('--tx-2'), fontSize: 11 },
    tooltip: { trigger: 'axis', backgroundColor: css('--tx'), borderWidth: 0, textStyle: { color: css('--bg'), fontFamily: font() } },
  });
  // A Wealthfolio value curve: thin line, soft area, no axes.
  function area(el, points, { color = css('--gr'), fmt = WF.fmt.money } = {}) {
    chart(el).setOption({
      ...base(),
      grid: { left: 0, right: 0, top: 8, bottom: 8 },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: points.map((p) => p.x) },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { ...base().tooltip, valueFormatter: (v) => fmt(v), axisPointer: { type: 'line', lineStyle: { color: css('--ui-3') } } },
      series: [{ type: 'line', data: points.map((p) => p.y), showSymbol: false, smooth: 0.15, lineStyle: { width: +opt('--chart-line-width', 1.4), color },
        areaStyle: { opacity: +opt('--chart-area-opacity', 0.28), color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color }, { offset: 1, color: fadeTo(color) }]) } }],
    }, { replaceMerge: ['series'] });
  }
  // Bars with an optional dashed average line (a visual guide; the bars are governed).
  function bars(el, points, { color = css('--c1'), avg = true, fmt = WF.fmt.money } = {}) {
    const ys = points.map((p) => p.y);
    const mean = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    chart(el).setOption({
      ...base(),
      grid: { left: 8, right: 8, top: 8, bottom: 24 },
      xAxis: { type: 'category', data: points.map((p) => p.label), axisLine: { show: false }, axisTick: { show: false } },
      yAxis: { type: 'value', show: false },
      tooltip: { ...base().tooltip, valueFormatter: (v) => fmt(v) },
      series: [{ type: 'bar', data: ys, barMaxWidth: 28, itemStyle: { color, borderRadius: [4, 4, 0, 0] },
        markLine: avg ? { symbol: 'none', silent: true, label: { show: false }, lineStyle: { type: 'dashed', color: css('--tx-3') }, data: [{ yAxis: mean }] } : undefined }],
    }, { replaceMerge: ['series'] });
  }
  // Wealthfolio's half-donut gauge with gaps between segments.
  function halfDonut(el, items, colors) {
    chart(el).setOption({
      ...base(),
      tooltip: { trigger: 'item', backgroundColor: css('--tx'), borderWidth: 0, textStyle: { color: css('--bg') }, valueFormatter: (v) => WF.fmt.compact(v) },
      series: [{ type: 'pie', startAngle: 180, endAngle: 360, radius: ['72%', '96%'], center: ['50%', '78%'], padAngle: 3,
        itemStyle: { borderRadius: 6 }, label: { show: false },
        data: items.map((it, i) => ({ name: it.name, value: it.value, itemStyle: { color: colors[i % colors.length] } })) }],
    }, { replaceMerge: ['series'] });
  }
  function treemap(el, items, colorFor) {
    chart(el).setOption({
      ...base(),
      tooltip: { trigger: 'item', backgroundColor: css('--tx'), borderWidth: 0, textStyle: { color: css('--bg') }, valueFormatter: (v) => WF.fmt.compact(v) },
      series: [{ type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, left: 0, top: 0, right: 0, bottom: 0,
        itemStyle: { gapWidth: 4, borderRadius: 6 },
        label: { show: true, position: 'insideBottom', color: css('--tx'), fontFamily: font(), formatter: (p) => `${p.name}\n${p.data.caption ?? ''}` },
        data: items.map((it) => ({ name: it.name, value: it.value, caption: it.caption, itemStyle: { color: colorFor(it) } })) }],
    }, { replaceMerge: ['series'] });
  }
  function lines(el, xs, series, { fmt = (v) => WF.fmt.pct(v, true) } = {}) {
    // Daily points: past ~2 months, label each month once (at its first point); shorter, label days.
    const monthly = xs.length > 62;
    const axisLabel = monthly
      ? { interval: (i) => i === 0 || String(xs[i]).slice(0, 7) !== String(xs[i - 1]).slice(0, 7), formatter: (v) => WF.fmt.monthLabel(v) }
      : { formatter: (v) => WF.fmt.dayLabel(v) };
    chart(el).setOption({
      ...base(),
      grid: { left: 52, right: 12, top: 16, bottom: 52 },
      legend: { bottom: 0, textStyle: { color: css('--tx-2') } },
      xAxis: { type: 'category', data: xs, boundaryGap: false, axisLine: { lineStyle: { color: css('--ui-3') } }, axisLabel },
      yAxis: { type: 'value', axisLabel: { formatter: (v) => fmt(v) }, splitLine: { lineStyle: { color: css('--ui') } } },
      tooltip: { ...base().tooltip, valueFormatter: (v) => fmt(v) },
      // --chart-compare (unset in Wealthfolio) draws every series after the first as a dashed comparison line.
      series: series.map((s, i) => {
        const cmp = i > 0 && css('--chart-compare'), color = cmp || s.color;
        return { type: 'line', name: s.name, data: s.data, showSymbol: false, lineStyle: { width: +opt('--chart-line-width', 1.6), color, type: cmp ? 'dashed' : 'solid' }, itemStyle: { color } };
      }),
    }, { replaceMerge: ['series'] });
  }
  function stackedBars(el, xs, series, { line } = {}) {
    chart(el).setOption({
      ...base(),
      grid: { left: 52, right: 52, top: 16, bottom: series.length > 1 ? 52 : 28 },
      legend: series.length > 1 ? { bottom: 0, textStyle: { color: css('--tx-2') } } : undefined,
      xAxis: { type: 'category', data: xs.map(WF.fmt.monthLabel), axisLine: { lineStyle: { color: css('--ui-3') } } },
      yAxis: [{ type: 'value', axisLabel: { formatter: (v) => WF.fmt.compact(v) }, splitLine: { lineStyle: { color: css('--ui') } } },
              { type: 'value', axisLabel: { formatter: (v) => WF.fmt.compact(v) }, splitLine: { show: false } }],
      tooltip: { ...base().tooltip, valueFormatter: (v) => WF.fmt.money(v) },
      series: [
        ...series.map((s) => ({ type: 'bar', name: s.name, stack: 'x', data: s.data, barMaxWidth: 26, itemStyle: { color: s.color } })),
        ...(line ? [{ type: 'line', name: line.name, yAxisIndex: 1, data: line.data, showSymbol: false, lineStyle: { color: css('--tx-3') } }] : []),
      ],
    }, { replaceMerge: ['series', 'legend'] });
  }
  // An empty or failed query must not leave the previous result drawn beside its sentence.
  const clear = (el) => { if (inst.has(el)) inst.get(el).clear(); };
  const palette = () => ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9'].map(css);
  WF.charts = { css, chart, clear, area, bars, halfDonut, treemap, lines, stackedBars, palette };
})();
