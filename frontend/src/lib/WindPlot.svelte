<script>
  import { onMount } from 'svelte';

  export let data; // forecast JSON from /api/forecast

  let containerEl;
  let width = 920;

  onMount(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) width = Math.max(480, e.contentRect.width);
    });
    obs.observe(containerEl);
    return () => obs.disconnect();
  });

  const H = 300;
  const pad = { top: 40, right: 30, bottom: 55, left: 56 };

  $: plotW = width - pad.left - pad.right;
  $: plotH = H - pad.top - pad.bottom;

  // ── Parse data ────────────────────────────────────────────────────────────
  $: points = data ? data.timestamps.map((t, i) => ({
    time:   new Date(t),
    speed:  data.wind_mph[i],
    dir:    data.wind_dir_deg?.[i] ?? null,
  })) : [];

  // ── Scales ────────────────────────────────────────────────────────────────
  $: xScale = (i) => pad.left + (i / Math.max(points.length - 1, 1)) * plotW;

  $: maxSpeed = points.length
    ? Math.ceil(Math.max(...points.map((p) => p.speed ?? 0), 5) / 5) * 5
    : 30;
  $: yScale = (v) => pad.top + plotH - (v / maxSpeed) * plotH;

  // ── Paths ─────────────────────────────────────────────────────────────────
  $: linePath = (() => {
    let d = '';
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const v = points[i].speed;
      if (v == null || isNaN(v)) { started = false; continue; }
      const x = xScale(i).toFixed(1), y = yScale(v).toFixed(1);
      if (!started) { d += `M${x},${y}`; started = true; }
      else           { d += ` L${x},${y}`; }
    }
    return d;
  })();

  $: areaPath = points.length
    ? linePath + ` L${xScale(points.length - 1).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`
    : '';

  // ── Ticks ─────────────────────────────────────────────────────────────────
  $: yTicks = (() => {
    const t = [];
    for (let v = 0; v <= maxSpeed; v += 5) t.push(v);
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

  // ── Arrow helper ──────────────────────────────────────────────────────────
  // Draws a solid arrow (shaft + head) representing the wind direction
  function arrowParts(cx, cy, dir) {
    const rad = ((dir + 180) * Math.PI) / 180;
    const len = 14 * 1.4;
    const headLen = 5, headW = 3.5, shaftW = 1.2;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    const px = -dy, py = dx;

    const tipX = cx + dx * len * 0.5, tipY = cy + dy * len * 0.5;
    const tailX = cx - dx * len * 0.5, tailY = cy - dy * len * 0.5;
    const hbX = tipX - dx * headLen, hbY = tipY - dy * headLen;

    const s1x = tailX + px * shaftW, s1y = tailY + py * shaftW;
    const s2x = hbX  + px * shaftW, s2y = hbY  + py * shaftW;
    const s3x = hbX  - px * shaftW, s3y = hbY  - py * shaftW;
    const s4x = tailX - px * shaftW, s4y = tailY - py * shaftW;

    const h1x = hbX + px * headW, h1y = hbY + py * headW;
    const h2x = hbX - px * headW, h2y = hbY - py * headW;

    return {
      shaft: `${s1x},${s1y} ${s2x},${s2y} ${s3x},${s3y} ${s4x},${s4y}`,
      head:  `${tipX},${tipY} ${h1x},${h1y} ${h2x},${h2y}`,
    };
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

  function dirLabel(deg) {
    if (deg == null) return '—';
    const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return d[Math.round(deg / 22.5) % 16];
  }
  function fmtHr(date) {
    const h = date.getHours();
    return `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`;
  }
  function fmtDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

<div class="chart-wrap">
  <div class="chart-header">
    <div class="chart-label">Forecast</div>
    <h2 class="chart-title">Wind Speed &amp; Direction</h2>
    <p class="chart-sub">Arrows point toward wind origin (S arrow = wind from south)</p>
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
      <defs>
        <linearGradient id="wp-areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7ee787" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#7ee787" stop-opacity="0.01" />
        </linearGradient>
        <linearGradient id="wp-lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7ee787" />
          <stop offset="100%" stop-color="#3fb950" />
        </linearGradient>
      </defs>

      <!-- Grid lines -->
      {#each yTicks as v}
        <g>
          <line x1={pad.left} x2={pad.left + plotW} y1={yScale(v)} y2={yScale(v)} stroke="#21262d" stroke-width="1" />
          <text x={pad.left - 10} y={yScale(v) + 4} text-anchor="end" fill="#484f58"
            font-size="11" font-family="'IBM Plex Mono',monospace">{v}</text>
        </g>
      {/each}

      <!-- Y-axis label -->
      <text
        transform={`translate(14,${pad.top + plotH / 2}) rotate(-90)`}
        text-anchor="middle" fill="#7d8590" font-size="11" font-family="'IBM Plex Mono',monospace" font-weight="300">mph</text>

      <!-- Day boundary lines -->
      {#each dayBounds.slice(1) as i}
        <line x1={xScale(i)} x2={xScale(i)} y1={pad.top} y2={pad.top + plotH} stroke="#30363d" stroke-width="1" stroke-dasharray="4,4" />
      {/each}

      <!-- X tick labels -->
      {#each xTicks as i}
        <text x={xScale(i)} y={pad.top + plotH + 18} text-anchor="middle" fill="#484f58"
          font-size="10" font-family="'IBM Plex Mono',monospace">{fmtHr(points[i].time)}</text>
      {/each}

      <!-- Date labels -->
      {#each dayBounds as startIdx, di}
        {@const endIdx = di < dayBounds.length - 1 ? dayBounds[di + 1] : points.length - 1}
        {@const midX = (xScale(startIdx) + xScale(endIdx)) / 2}
        <text x={midX} y={pad.top + plotH + 38} text-anchor="middle" fill="#7d8590"
          font-size="11" font-family="'IBM Plex Sans',sans-serif" font-weight="400">
          {fmtDate(points[startIdx].time)}
        </text>
      {/each}

      <!-- Area fill -->
      <path d={areaPath} fill="url(#wp-areaGrad)" />

      <!-- Speed line -->
      <path d={linePath} fill="none" stroke="url(#wp-lineGrad)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Direction arrows every 4 hours -->
      {#each points as p, i}
        {#if i % 4 === 0 && p.dir != null && p.speed != null}
          {@const a = arrowParts(xScale(i), yScale(p.speed), p.dir)}
          <g opacity="0.88">
            <polygon points={a.shaft} fill="#e6edf3" />
            <polygon points={a.head}  fill="#e6edf3" />
          </g>
        {/if}
      {/each}

      <!-- Hover crosshair -->
      {#if hoverIdx != null}
        <line x1={xScale(hoverIdx)} x2={xScale(hoverIdx)} y1={pad.top} y2={pad.top + plotH}
          stroke="#7ee787" stroke-width="1" opacity="0.4" />
        {#if points[hoverIdx].speed != null}
          <circle cx={xScale(hoverIdx)} cy={yScale(points[hoverIdx].speed)} r="5" fill="#0c1117" stroke="#7ee787" stroke-width="2" />
        {/if}
      {/if}
    </svg>

    <!-- Tooltip -->
    {#if hoverIdx != null}
      {@const p = points[hoverIdx]}
      <div
        class="tooltip"
        style={tipFlipLeft
          ? `right:${width - tipX + 14}px; top:${pad.top - 8}px;`
          : `left:${tipX + 14}px; top:${pad.top - 8}px;`}
      >
        <div class="tt-time">
          {p.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {p.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
        <div class="tt-speed">{p.speed != null ? p.speed + ' mph' : '—'}</div>
        <div class="tt-dir">{dirLabel(p.dir)}{p.dir != null ? ` (${p.dir}°)` : ''}</div>
      </div>
    {/if}
  </div>

  <!-- Legend -->
  <div class="legend">
    <span class="leg-item">
      <span class="leg-line"></span>
      <span class="leg-text">Wind speed</span>
    </span>
    {#if points.some((p) => p.dir != null)}
      <span class="leg-item">
        <svg width="18" height="14" viewBox="0 0 18 14">
          <rect x="2" y="5.5" width="9" height="3" rx="0.5" fill="#e6edf3" opacity="0.9" />
          <polygon points="16,7 11,3 11,11" fill="#e6edf3" opacity="0.9" />
        </svg>
        <span class="leg-text">Origin direction</span>
      </span>
    {/if}
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
    color: #7ee787;
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    font-weight: 500;
    font-family: 'IBM Plex Mono', monospace;
    margin-bottom: 4px;
  }

  .chart-title {
    color: #e6edf3;
    font-size: 18px;
    font-weight: 300;
    font-family: 'IBM Plex Sans', sans-serif;
    letter-spacing: -0.5px;
  }

  .chart-sub {
    color: #7d8590;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    margin-top: 2px;
  }

  .chart-panel {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    position: relative;
    overflow: visible;
  }

  .tooltip {
    position: absolute;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 8px 12px;
    pointer-events: none;
    z-index: 20;
    font-family: 'IBM Plex Mono', monospace;
  }

  .tt-time {
    color: #7d8590;
    font-size: 10px;
    margin-bottom: 4px;
  }

  .tt-speed {
    color: #7ee787;
    font-size: 16px;
    font-weight: 600;
  }

  .tt-dir {
    color: #e6edf3;
    font-size: 12px;
    margin-top: 2px;
  }

  .legend {
    display: flex;
    gap: 20px;
    padding: 0 8px;
    align-items: center;
    font-family: 'IBM Plex Mono', monospace;
  }

  .leg-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .leg-text {
    color: #7d8590;
    font-size: 11px;
  }

  .leg-line {
    width: 20px;
    height: 2px;
    background: #7ee787;
    border-radius: 1px;
    display: inline-block;
  }
</style>
