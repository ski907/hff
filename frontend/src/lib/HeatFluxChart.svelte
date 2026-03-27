<script>
  import { onMount } from 'svelte';

  export let data; // heatflux JSON from /api/heatflux

  let containerEl;
  let width = 920;

  onMount(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) width = Math.max(480, e.contentRect.width);
    });
    obs.observe(containerEl);
    return () => obs.disconnect();
  });

  const H = 320;
  const pad = { top: 32, right: 28, bottom: 60, left: 68 };

  $: plotW = width - pad.left - pad.right;
  $: plotH = H - pad.top - pad.bottom;

  // ── Series definitions ────────────────────────────────────────────────────
  const SERIES = [
    { key: 'sw_down',  label: 'Downwelling SW',  color: '#f0883e', width: 1.8 },
    { key: 'lw_down',  label: 'Downwelling LW',  color: '#e3b341', width: 1.8 },
    { key: 'lw_up',    label: 'Upwelling LW',    color: '#3fb950', width: 1.8 },
    { key: 'sensible', label: 'Sensible Heat',   color: '#f47067', width: 1.8 },
    { key: 'latent',   label: 'Latent Heat',     color: '#a371f7', width: 1.8 },
    { key: 'net',      label: 'Net Flux',        color: '#e6edf3', width: 2.8 },
  ];

  // ── Parse data ────────────────────────────────────────────────────────────
  $: points = data ? data.timestamps.map((t, i) => ({
    time: new Date(t),
    sw_down:  data.sw_down[i],
    lw_down:  data.lw_down[i],
    lw_up:    data.lw_up[i],
    sensible: data.sensible[i],
    latent:   data.latent[i],
    net:      data.net[i],
  })) : [];

  // ── Scales ────────────────────────────────────────────────────────────────
  $: xScale = (i) => pad.left + (i / Math.max(points.length - 1, 1)) * plotW;

  $: allVals = points.flatMap((p) =>
    SERIES.map((s) => p[s.key]).filter((v) => v != null && !isNaN(v))
  );
  $: valMin = allVals.length ? Math.floor(Math.min(...allVals) / 50) * 50 - 25 : -200;
  $: valMax = allVals.length ? Math.ceil(Math.max(...allVals) / 50) * 50 + 25 : 800;
  $: yScale = (v) => pad.top + plotH * (1 - (v - valMin) / (valMax - valMin));

  $: yZero = yScale(0);

  // ── Ticks ─────────────────────────────────────────────────────────────────
  $: yTicks = (() => {
    const range = valMax - valMin;
    const step = range > 1000 ? 200 : range > 400 ? 100 : 50;
    const t = [];
    for (let v = Math.ceil(valMin / step) * step; v <= valMax; v += step) t.push(v);
    return t;
  })();

  $: dayBounds = (() => {
    const b = [0];
    for (let i = 1; i < points.length; i++) {
      if (points[i]?.time.getDate() !== points[i - 1]?.time.getDate()) b.push(i);
    }
    return b;
  })();

  $: xTicks = (() => {
    const t = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].time.getHours() % 12 === 0) t.push(i);
    }
    return t;
  })();

  // ── Path builder ──────────────────────────────────────────────────────────
  function buildPath(key) {
    let d = '';
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const v = points[i][key];
      if (v == null || isNaN(v)) { started = false; continue; }
      const x = xScale(i).toFixed(1);
      const y = yScale(v).toFixed(1);
      if (!started) { d += `M${x},${y}`; started = true; }
      else           { d += ` L${x},${y}`; }
    }
    return d;
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  let hoverIdx = null;

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left - pad.left;
    if (relX < 0 || relX > plotW || !points.length) { hoverIdx = null; return; }
    hoverIdx = Math.max(0, Math.min(points.length - 1, Math.round((relX / plotW) * (points.length - 1))));
  }

  $: tipX = hoverIdx != null ? xScale(hoverIdx) : 0;
  $: tipFlipLeft = tipX > pad.left + plotW * 0.65;

  function fmtHr(date) {
    const h = date.getHours();
    return `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
  }
  function fmtDate(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmt1(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1);
  }
</script>

<div class="chart-wrap">
  <div class="chart-header">
    <div class="chart-label">Energy Balance</div>
    <h2 class="chart-title">Heat Flux Components</h2>
  </div>

  <div class="chart-panel" bind:this={containerEl}>
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      on:mousemove={handleMouseMove}
      on:mouseleave={() => (hoverIdx = null)}
      style="display:block; cursor:crosshair;"
    >
      <!-- Grid lines -->
      {#each yTicks as v}
        <line x1={pad.left} x2={pad.left + plotW} y1={yScale(v)} y2={yScale(v)}
          stroke={v === 0 ? '#484f58' : '#21262d'}
          stroke-width={v === 0 ? 1 : 0.6}
          stroke-dasharray={v === 0 ? 'none' : '3,4'}
        />
        <text x={pad.left - 10} y={yScale(v) + 4} text-anchor="end" fill="#484f58"
          font-size="9.5" font-family="'IBM Plex Mono',monospace">{v}</text>
      {/each}

      <!-- Y-axis label -->
      <text
        transform={`translate(14,${pad.top + plotH / 2}) rotate(-90)`}
        text-anchor="middle" fill="#7d8590" font-size="9" font-family="'IBM Plex Mono',monospace">W/m²</text>

      <!-- Day boundary lines -->
      {#each dayBounds.slice(1) as i}
        <line x1={xScale(i)} x2={xScale(i)} y1={pad.top} y2={pad.top + plotH} stroke="#30363d" stroke-width="0.8" stroke-dasharray="3,4" />
      {/each}

      <!-- X ticks -->
      {#each xTicks as i}
        <text x={xScale(i)} y={pad.top + plotH + 18} text-anchor="middle" fill="#484f58"
          font-size="9" font-family="'IBM Plex Mono',monospace">{fmtHr(points[i].time)}</text>
      {/each}

      <!-- Date labels -->
      {#each dayBounds as startIdx, di}
        {@const endIdx = di < dayBounds.length - 1 ? dayBounds[di + 1] : points.length - 1}
        {@const midX = (xScale(startIdx) + xScale(endIdx)) / 2}
        <text x={midX} y={pad.top + plotH + 36} text-anchor="middle" fill="#8b949e"
          font-size="10" font-family="'IBM Plex Sans',sans-serif" font-weight="500">
          {fmtDate(points[startIdx].time)}
        </text>
      {/each}

      <!-- Series lines (draw net last so it's on top) -->
      {#each SERIES as s}
        <path d={buildPath(s.key)} fill="none" stroke={s.color}
          stroke-width={s.width} stroke-linejoin="round" stroke-linecap="round"
          opacity={s.key === 'net' ? 1 : 0.85}
        />
      {/each}

      <!-- Hover crosshair -->
      {#if hoverIdx != null}
        <line x1={xScale(hoverIdx)} x2={xScale(hoverIdx)} y1={pad.top} y2={pad.top + plotH}
          stroke="#e6edf3" stroke-width="0.7" opacity="0.2" />
        {#each SERIES as s}
          {#if points[hoverIdx][s.key] != null}
            <circle cx={xScale(hoverIdx)} cy={yScale(points[hoverIdx][s.key])}
              r={s.key === 'net' ? 4.5 : 3} fill="#0f1318" stroke={s.color}
              stroke-width={s.key === 'net' ? 2 : 1.5} />
          {/if}
        {/each}
      {/if}
    </svg>

    <!-- Tooltip -->
    {#if hoverIdx != null}
      {@const p = points[hoverIdx]}
      <div
        class="tooltip"
        style={tipFlipLeft
          ? `right:${width - tipX + 14}px; top:${pad.top}px;`
          : `left:${tipX + 14}px; top:${pad.top}px;`}
      >
        <div class="tt-time">{fmtDate(p.time)} {p.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        <div class="tt-grid">
          {#each SERIES as s}
            <span class="tt-label" style="color:{s.color}">{s.label}</span>
            <span class="tt-val">{fmt1(p[s.key])} W/m²</span>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="legend">
    {#each SERIES as s}
      <span class="leg-item">
        <span class="leg-line" style="background:{s.color}; height:{s.key === 'net' ? '3px' : '2px'}"></span>
        <span class="leg-text" style="color:{s.key === 'net' ? '#c9d1d9' : '#7d8590'}">{s.label}</span>
      </span>
    {/each}
  </div>
</div>

<style>
  .chart-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .chart-header {
    padding: 0 4px;
  }

  .chart-label {
    color: #58a6ff;
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    margin-bottom: 4px;
  }

  .chart-title {
    color: #e6edf3;
    font-size: 18px;
    font-weight: 400;
    font-family: 'IBM Plex Sans', sans-serif;
    letter-spacing: -0.3px;
  }

  .chart-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    position: relative;
    overflow: visible;
  }

  .tooltip {
    position: absolute;
    background: rgba(13, 17, 23, 0.93);
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 10px 14px;
    pointer-events: none;
    z-index: 20;
    min-width: 170px;
    font-family: 'IBM Plex Mono', monospace;
    backdrop-filter: blur(8px);
  }

  .tt-time {
    color: #7d8590;
    font-size: 10px;
    margin-bottom: 7px;
  }

  .tt-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 3px 10px;
    font-size: 11px;
  }

  .tt-label {
    font-weight: 400;
  }

  .tt-val {
    color: #c9d1d9;
    text-align: right;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    padding: 0 6px;
    align-items: center;
    font-family: 'IBM Plex Mono', monospace;
  }

  .leg-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .leg-text {
    font-size: 10.5px;
  }

  .leg-line {
    width: 18px;
    border-radius: 1px;
    display: inline-block;
  }
</style>
