<script>
  import { onMount } from 'svelte';

  export let data; // forecast JSON from /api/forecast

  // ── Responsive width ──────────────────────────────────────────────────────
  let containerEl;
  let width = 920;

  onMount(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) width = Math.max(480, e.contentRect.width);
    });
    obs.observe(containerEl);
    return () => obs.disconnect();
  });

  // ── Layout constants ──────────────────────────────────────────────────────
  const H = 530;
  const pad = { top: 30, right: 28, bottom: 92, left: 52 };

  $: plotW = width - pad.left - pad.right;
  $: plotH = H - pad.top - pad.bottom;

  $: tempH = plotH * 0.54;
  $: windH = plotH * 0.17;
  $: popH  = plotH * 0.15;
  $: skyH  = plotH * 0.07;
  const gap = 6;

  $: tempY0 = pad.top;
  $: windY0 = tempY0 + tempH + gap * 2;
  $: popY0  = windY0 + windH + gap * 2;
  $: skyY0  = popY0 + popH + gap;

  // ── Parse incoming data ───────────────────────────────────────────────────
  function parseData(d) {
    return d.timestamps.map((t, i) => ({
      time:     new Date(t),
      temp:     d.temperature_f[i],
      dewpoint: d.dewpoint_f[i],
      wind:     d.wind_mph[i],
      windDir:  d.wind_dir_deg?.[i] ?? null,
      sky:      d.sky_pct[i],
      pop:      d.pop_pct?.[i] ?? 0,
      isDay:    d.is_day?.[i] ?? (new Date(t).getHours() >= 7 && new Date(t).getHours() < 19),
    }));
  }

  $: points = data ? parseData(data) : [];

  // ── Scales ────────────────────────────────────────────────────────────────
  $: xScale = (i) => pad.left + (i / Math.max(points.length - 1, 1)) * plotW;

  $: tempMin = points.length
    ? Math.floor(Math.min(...points.map((p) => Math.min(p.temp ?? 999, p.dewpoint ?? 999))) / 5) * 5 - 3
    : 0;
  $: tempMax = points.length
    ? Math.ceil(Math.max(...points.map((p) => p.temp ?? -999)) / 5) * 5 + 3
    : 100;
  $: yTemp = (v) => tempY0 + tempH * (1 - (v - tempMin) / (tempMax - tempMin));

  $: windMax = points.length
    ? Math.ceil(Math.max(...points.map((p) => p.wind ?? 0), 5) / 5) * 5 + 2
    : 30;
  $: yWind = (v) => windY0 + windH * (1 - v / windMax);

  $: yPop = (v) => popY0 + popH * (1 - v / 100);

  // ── Path builders ─────────────────────────────────────────────────────────
  function linePath(pts, xFn, yFn) {
    let d = '';
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const y = yFn(pts[i]);
      if (y == null || isNaN(y)) { started = false; continue; }
      const x = xFn(i).toFixed(1);
      if (!started) { d += `M${x},${y.toFixed(1)}`; started = true; }
      else           { d += ` L${x},${y.toFixed(1)}`; }
    }
    return d;
  }

  $: tempLine = linePath(points, xScale, (p) => p.temp    != null ? yTemp(p.temp)    : null);
  $: dewLine  = linePath(points, xScale, (p) => p.dewpoint != null ? yTemp(p.dewpoint) : null);

  $: spreadPath = (() => {
    if (!points.length) return '';
    const fwd = points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yTemp(p.temp ?? tempMin).toFixed(1)}`
    ).join(' ');
    const rev = points.slice().reverse().map((p, i) =>
      `L${xScale(points.length - 1 - i).toFixed(1)},${yTemp(p.dewpoint ?? tempMin).toFixed(1)}`
    ).join(' ');
    return fwd + ' ' + rev + ' Z';
  })();

  $: windLine = linePath(points, xScale, (p) => p.wind != null ? yWind(p.wind) : null);
  $: windArea = points.length
    ? windLine + ` L${xScale(points.length - 1).toFixed(1)},${yWind(0).toFixed(1)} L${xScale(0).toFixed(1)},${yWind(0).toFixed(1)} Z`
    : '';

  // ── Day/night bands ───────────────────────────────────────────────────────
  $: dayNightBands = (() => {
    if (!points.length) return [];
    const bands = [];
    let start = 0, wasDay = points[0].isDay;
    for (let i = 1; i < points.length; i++) {
      if (points[i].isDay !== wasDay || i === points.length - 1) {
        bands.push({ from: start, to: i, isDay: wasDay });
        start = i;
        wasDay = points[i].isDay;
      }
    }
    return bands;
  })();

  // ── Day boundary indices (for date labels & vertical lines) ───────────────
  $: dayBounds = (() => {
    const b = [0];
    for (let i = 1; i < points.length; i++) {
      if (points[i]?.time.getDate() !== points[i - 1]?.time.getDate()) b.push(i);
    }
    return b;
  })();

  // ── Ticks ─────────────────────────────────────────────────────────────────
  $: xTicks = (() => {
    const t = [];
    for (let i = 0; i < points.length; i++) {
      if (points[i].time.getHours() % 6 === 0) t.push(i);
    }
    return t;
  })();
  $: tempTicks = (() => {
    const t = [];
    for (let v = Math.ceil(tempMin / 5) * 5; v <= tempMax; v += 5) t.push(v);
    return t;
  })();
  $: windTicks = (() => {
    const t = [];
    for (let v = 0; v <= windMax; v += 5) t.push(v);
    return t;
  })();

  // ── Hover ─────────────────────────────────────────────────────────────────
  let hoverIdx = null;

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left - pad.left;
    if (relX < 0 || relX > plotW || !points.length) { hoverIdx = null; return; }
    hoverIdx = Math.max(0, Math.min(points.length - 1, Math.round((relX / plotW) * (points.length - 1))));
  }

  // ── Arrow helper ──────────────────────────────────────────────────────────
  function windArrow(cx, cy, dir) {
    const rad = ((dir + 180) * Math.PI) / 180;
    const len = 14, headLen = 4, headW = 2.5;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    const px = -dy, py = dx;
    const tipX = cx + dx * len, tipY = cy + dy * len;
    const tailX = cx,           tailY = cy;
    const hbX = tipX - dx * headLen, hbY = tipY - dy * headLen;
    return {
      x1: tailX, y1: tailY, x2: hbX, y2: hbY,
      head: `${tipX},${tipY} ${hbX + px * headW},${hbY + py * headW} ${hbX - px * headW},${hbY - py * headW}`
    };
  }

  // ── Formatters ────────────────────────────────────────────────────────────
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
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // ── Tooltip positioning ───────────────────────────────────────────────────
  $: tipX = hoverIdx != null ? xScale(hoverIdx) : 0;
  $: tipFlipLeft = tipX > pad.left + plotW * 0.68;
</script>

<div class="chart-wrap">
  <div class="chart-header">
    <div class="chart-label">6.5-Day Outlook</div>
    <h2 class="chart-title">Weather Forecast Summary</h2>
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
        <linearGradient id="ws-tGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f47067" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#f47067" stop-opacity="0.02" />
        </linearGradient>
        <linearGradient id="ws-wGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#79c0ff" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#79c0ff" stop-opacity="0.01" />
        </linearGradient>
      </defs>

      <!-- ── Day/night bands ── -->
      {#each dayNightBands as b}
        <rect
          x={xScale(b.from)} y={tempY0}
          width={xScale(b.to) - xScale(b.from)} height={tempH}
          fill={b.isDay ? '#e3b34112' : '#0d111708'}
        />
      {/each}

      <!-- ── Temperature section ── -->
      {#each tempTicks as v}
        <line x1={pad.left} x2={pad.left + plotW} y1={yTemp(v)} y2={yTemp(v)} stroke="#21262d" stroke-width="0.7" />
        <text x={pad.left - 8} y={yTemp(v) + 3.5} text-anchor="end" fill="#484f58" font-size="9.5" font-family="'IBM Plex Mono',monospace">{v}°</text>
      {/each}
      <text
        transform={`translate(13,${tempY0 + tempH / 2}) rotate(-90)`}
        text-anchor="middle" fill="#7d8590" font-size="9" font-family="'IBM Plex Mono',monospace">°F</text>

      <!-- Spread fill between temp and dewpoint -->
      <path d={spreadPath} fill="#f4706710" />

      <!-- Dewpoint dashed line -->
      <path d={dewLine} fill="none" stroke="#8b949e" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6" />

      <!-- Temperature line -->
      <path d={tempLine} fill="none" stroke="#f47067" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Section labels -->
      <text x={pad.left + 6} y={tempY0 + 14} fill="#f47067" font-size="9.5" font-family="'IBM Plex Mono',monospace" font-weight="500" opacity="0.85">TEMP</text>
      <text x={pad.left + 48} y={tempY0 + 14} fill="#8b949e" font-size="9.5" font-family="'IBM Plex Mono',monospace" opacity="0.6">DEW</text>

      <!-- 32°F freezing line -->
      {#if tempMin <= 32 && tempMax >= 32}
        <line x1={pad.left} x2={pad.left + plotW} y1={yTemp(32)} y2={yTemp(32)} stroke="#79c0ff" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.35" />
        <text x={pad.left + plotW + 4} y={yTemp(32) + 3} fill="#79c0ff" font-size="8" opacity="0.5" font-family="'IBM Plex Mono',monospace">32°</text>
      {/if}

      <!-- ── Wind section ── -->
      <rect x={pad.left} y={windY0} width={plotW} height={windH} fill="#0d111706" rx="2" />
      {#each windTicks as v}
        <line x1={pad.left} x2={pad.left + plotW} y1={yWind(v)} y2={yWind(v)} stroke="#21262d" stroke-width="0.5" />
      {/each}
      <text x={pad.left - 8} y={yWind(windMax) + 3.5} text-anchor="end" fill="#484f58" font-size="9" font-family="'IBM Plex Mono',monospace">{windMax}</text>
      <text x={pad.left - 8} y={yWind(0) + 3.5} text-anchor="end" fill="#484f58" font-size="9" font-family="'IBM Plex Mono',monospace">0</text>

      <path d={windArea} fill="url(#ws-wGrad)" />
      <path d={windLine} fill="none" stroke="#79c0ff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />

      <!-- Wind direction arrows every 6 hours -->
      {#each points as p, i}
        {#if i % 6 === 0 && p.windDir != null && p.wind != null}
          {@const arr = windArrow(xScale(i), yWind(p.wind), p.windDir)}
          <g opacity="0.75">
            <line x1={arr.x1} y1={arr.y1} x2={arr.x2} y2={arr.y2} stroke="#c9d1d9" stroke-width="1.6" stroke-linecap="round" />
            <polygon points={arr.head} fill="#c9d1d9" />
          </g>
        {/if}
      {/each}

      <text x={pad.left + 6} y={windY0 + 12} fill="#79c0ff" font-size="9.5" font-family="'IBM Plex Mono',monospace" font-weight="500" opacity="0.85">WIND mph</text>

      <!-- ── Precip probability bars ── -->
      <rect x={pad.left} y={popY0} width={plotW} height={popH} fill="#0d111706" rx="2" />
      {#each points as p, i}
        {#if (p.pop ?? 0) > 0}
          {@const bw = Math.max(1.5, plotW / points.length - 0.5)}
          {@const bh = (p.pop / 100) * popH}
          {@const alpha = 0.25 + (p.pop / 100) * 0.55}
          <rect
            x={xScale(i) - bw / 2} y={popY0 + popH - bh}
            width={bw} height={bh}
            fill={`rgba(56,173,169,${alpha})`} rx="0.5"
          />
        {/if}
      {/each}
      <line x1={pad.left} x2={pad.left + plotW} y1={popY0 + popH} y2={popY0 + popH} stroke="#21262d" stroke-width="0.5" />
      <text x={pad.left + 6} y={popY0 + 12} fill="#38ada9" font-size="9.5" font-family="'IBM Plex Mono',monospace" font-weight="500" opacity="0.85">PRECIP %</text>
      <text x={pad.left - 8} y={popY0 + 4} text-anchor="end" fill="#484f58" font-size="8.5" font-family="'IBM Plex Mono',monospace">100</text>
      <text x={pad.left - 8} y={popY0 + popH + 3} text-anchor="end" fill="#484f58" font-size="8.5" font-family="'IBM Plex Mono',monospace">0</text>

      <!-- ── Sky cover strip ── -->
      {#each points as p, i}
        {@const bw = Math.max(2, plotW / points.length)}
        {@const grey = Math.round(((p.sky ?? 0) / 100) * 200)}
        <rect
          x={xScale(i) - bw / 2} y={skyY0}
          width={bw + 0.5} height={skyH}
          fill={`rgb(${grey},${grey + 5},${grey + 12})`}
          opacity="0.7"
        />
      {/each}
      <rect x={pad.left} y={skyY0} width={plotW} height={skyH} fill="none" stroke="#30363d" stroke-width="0.5" rx="2" />
      <text x={pad.left + 6} y={skyY0 + skyH + 12} fill="#7d8590" font-size="8.5" font-family="'IBM Plex Mono',monospace">
        SKY ◻ clear → ◼ overcast
      </text>

      <!-- ── X axis: hour labels ── -->
      {#each xTicks as i}
        <text x={xScale(i)} y={skyY0 + skyH + 28} text-anchor="middle" fill="#484f58" font-size="9" font-family="'IBM Plex Mono',monospace">
          {fmtHr(points[i].time)}
        </text>
      {/each}

      <!-- Date labels centred between day boundaries -->
      {#each dayBounds as startIdx, di}
        {@const endIdx = di < dayBounds.length - 1 ? dayBounds[di + 1] : points.length - 1}
        {@const midX = (xScale(startIdx) + xScale(endIdx)) / 2}
        <text x={midX} y={skyY0 + skyH + 44} text-anchor="middle" fill="#8b949e" font-size="10" font-family="'IBM Plex Sans',sans-serif" font-weight="500">
          {fmtDate(points[startIdx].time)}
        </text>
      {/each}

      <!-- Day boundary vertical lines -->
      {#each dayBounds.slice(1) as i}
        <line x1={xScale(i)} x2={xScale(i)} y1={pad.top} y2={skyY0 + skyH} stroke="#30363d" stroke-width="0.8" stroke-dasharray="3,4" />
      {/each}

      <!-- ── Hover crosshair ── -->
      {#if hoverIdx != null}
        <line x1={xScale(hoverIdx)} x2={xScale(hoverIdx)} y1={tempY0} y2={skyY0 + skyH} stroke="#e6edf3" stroke-width="0.7" opacity="0.22" />
        {#if points[hoverIdx].temp != null}
          <circle cx={xScale(hoverIdx)} cy={yTemp(points[hoverIdx].temp)} r="4" fill="#0f1318" stroke="#f47067" stroke-width="2" />
        {/if}
        {#if points[hoverIdx].dewpoint != null}
          <circle cx={xScale(hoverIdx)} cy={yTemp(points[hoverIdx].dewpoint)} r="3" fill="#0f1318" stroke="#8b949e" stroke-width="1.5" />
        {/if}
        {#if points[hoverIdx].wind != null}
          <circle cx={xScale(hoverIdx)} cy={yWind(points[hoverIdx].wind)} r="3" fill="#0f1318" stroke="#79c0ff" stroke-width="1.5" />
        {/if}
      {/if}
    </svg>

    <!-- ── Tooltip ── -->
    {#if hoverIdx != null}
      {@const p = points[hoverIdx]}
      <div
        class="tooltip"
        style={tipFlipLeft
          ? `right:${width - tipX + 14}px; top:${tempY0 + 8}px;`
          : `left:${tipX + 14}px; top:${tempY0 + 8}px;`}
      >
        <div class="tt-time">{fmtDate(p.time)} {p.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        <div class="tt-grid">
          <span class="tt-label" style="color:#f47067">Temp</span>
          <span class="tt-val">{p.temp != null ? p.temp + '°F' : '—'}</span>
          <span class="tt-label" style="color:#8b949e">Dew</span>
          <span class="tt-val">{p.dewpoint != null ? p.dewpoint + '°F' : '—'}</span>
          <span class="tt-label" style="color:#79c0ff">Wind</span>
          <span class="tt-val">{p.wind != null ? p.wind + ' mph' : '—'} {dirLabel(p.windDir)}</span>
          <span class="tt-label" style="color:#7d8590">Sky</span>
          <span class="tt-val">{p.sky != null ? p.sky + '%' : '—'}</span>
          <span class="tt-label" style="color:#38ada9">Precip</span>
          <span class="tt-val">{p.pop != null ? p.pop + '%' : '—'}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- ── Legend ── -->
  <div class="legend">
    <span class="leg-item"><span class="leg-line" style="background:#f47067"></span><span class="leg-text">Temperature</span></span>
    <span class="leg-item"><span class="leg-dash"></span><span class="leg-text">Dewpoint</span></span>
    <span class="leg-item"><span class="leg-line" style="background:#79c0ff"></span><span class="leg-text">Wind speed</span></span>
    <span class="leg-item"><span class="leg-bar" style="background:#38ada9"></span><span class="leg-text">Precip prob</span></span>
    <span class="leg-item"><span class="leg-strip"></span><span class="leg-text">Sky cover</span></span>
    <span class="leg-item"><span class="leg-day"></span><span class="leg-text">Daylight</span></span>
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
    color: #f0883e;
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
    min-width: 148px;
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
    font-size: 12px;
  }

  .tt-label {
    font-weight: 400;
  }

  .tt-val {
    color: #c9d1d9;
    font-weight: 600;
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
    color: #7d8590;
    font-size: 10.5px;
  }

  .leg-line {
    width: 16px;
    height: 2.5px;
    border-radius: 1px;
    display: inline-block;
  }

  .leg-dash {
    width: 16px;
    height: 0;
    border-top: 2px dashed #8b949e;
    display: inline-block;
  }

  .leg-bar {
    width: 8px;
    height: 10px;
    border-radius: 1px;
    opacity: 0.65;
    display: inline-block;
  }

  .leg-strip {
    width: 16px;
    height: 6px;
    background: linear-gradient(to right, #f0f0f0, #333);
    border-radius: 1px;
    display: inline-block;
  }

  .leg-day {
    width: 16px;
    height: 10px;
    background: #e3b34118;
    border: 1px solid #e3b34130;
    border-radius: 1px;
    display: inline-block;
  }
</style>
