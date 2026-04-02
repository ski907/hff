<script>
  import MapPicker from '$lib/MapPicker.svelte';
  import WeatherSummary from '$lib/WeatherSummary.svelte';
  import HeatFluxChart from '$lib/HeatFluxChart.svelte';
  import WindPlot from '$lib/WindPlot.svelte';

  let lat = 41.1242;
  let lon = -101.3644;
  let waterTemp = 2;
  let depth = 2;

  let forecastData = null;
  let heatfluxData = null;
  let loading = false;
  let error = null;

  async function compute() {
    loading = true;
    error = null;
    forecastData = null;
    heatfluxData = null;

    try {
      const [fRes, hRes] = await Promise.all([
        fetch(`/api/forecast?lat=${lat}&lon=${lon}`),
        fetch(`/api/heatflux?lat=${lat}&lon=${lon}&water_temp=${waterTemp}&depth=${depth}`)
      ]);

      if (!fRes.ok) {
        const detail = await fRes.json().catch(() => ({ detail: fRes.statusText }));
        throw new Error(detail.detail || fRes.statusText);
      }
      if (!hRes.ok) {
        const detail = await hRes.json().catch(() => ({ detail: hRes.statusText }));
        throw new Error(detail.detail || hRes.statusText);
      }

      [forecastData, heatfluxData] = await Promise.all([fRes.json(), hRes.json()]);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="page">
  <!-- ── Header ── -->
  <header>
    <div class="label">Heat Flux Forecast</div>
    <h1>6.5-Day Heat Flux Forecast</h1>
    <p class="subtitle">
      NOAA hourly forecast · Heat flux from HEC-RAS Water Quality Module
    </p>
  </header>

  <!-- ── Map ── -->
  <section class="card">
    <div class="section-label">Location</div>
    <MapPicker bind:lat bind:lon />
    <div class="coord-display">
      {lat.toFixed(4)}°N, {lon.toFixed(4)}°E — click map to move point
    </div>
  </section>

  <!-- ── Controls ── -->
  <section class="card controls-card">
    <div class="controls">
      <div class="control-group">
        <label for="water-temp">Water Temperature (°C)</label>
        <input id="water-temp" type="number" bind:value={waterTemp} step="0.5" min="-5" max="40" />
      </div>
      <div class="control-group">
        <label for="depth">Characteristic Depth (m)</label>
        <input id="depth" type="number" bind:value={depth} step="0.5" min="0.1" max="100" />
      </div>
      <div class="control-group btn-group">
        <button class="compute-btn" on:click={compute} disabled={loading}>
          {loading ? 'Fetching…' : 'Compute Heat Fluxes'}
        </button>
      </div>
    </div>
  </section>

  <!-- ── Error ── -->
  {#if error}
    <div class="error-box">
      <span class="error-icon">⚠</span>
      <span>{error}</span>
    </div>
  {/if}

  <!-- ── Results ── -->
  {#if forecastData}
    <WeatherSummary data={forecastData} />
  {/if}

  {#if heatfluxData}
    <HeatFluxChart data={heatfluxData} />
  {/if}
<!-- 
  {#if forecastData}
    <WindPlot data={forecastData} />
  {/if} -->

  <!-- ── Footer ── -->
  <footer>
    <p>Chandler Engel · US Army Corps of Engineers · CRREL</p>
    <p>Physics based on HEC-RAS 5.0 Water Quality Module · Forecast from NOAA NWS</p>
  </footer>
</div>

<style>
  .page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 28px 16px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  header {
    padding: 0 4px;
  }

  .label {
    color: #f0883e;
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
    margin-bottom: 6px;
  }

  h1 {
    color: #e6edf3;
    font-size: 22px;
    font-weight: 400;
    font-family: 'IBM Plex Sans', sans-serif;
    letter-spacing: -0.3px;
    margin-bottom: 4px;
  }

  .subtitle {
    color: #7d8590;
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
  }

  .card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 10px;
    padding: 16px;
  }

  .section-label {
    font-size: 10px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #7d8590;
    font-family: 'IBM Plex Mono', monospace;
    margin-bottom: 10px;
  }

  .coord-display {
    margin-top: 8px;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    color: #484f58;
  }

  .controls-card {
    padding: 16px 20px;
  }

  .controls {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    min-width: 160px;
  }

  .btn-group {
    min-width: unset;
  }

  .compute-btn {
    background: #238636;
    border: 1px solid #2ea043;
    color: #ffffff;
    padding: 8px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
    white-space: nowrap;
  }

  .compute-btn:hover:not(:disabled) {
    background: #2ea043;
  }

  .compute-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error-box {
    background: #160b0b;
    border: 1px solid #6e1a1a;
    border-radius: 8px;
    padding: 12px 16px;
    color: #f47067;
    font-size: 13px;
    font-family: 'IBM Plex Mono', monospace;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .error-icon {
    flex-shrink: 0;
  }

  footer {
    margin-top: 20px;
    padding: 0 4px;
    border-top: 1px solid #21262d;
    padding-top: 16px;
    color: #484f58;
    font-size: 11px;
    font-family: 'IBM Plex Mono', monospace;
    line-height: 1.8;
  }
</style>
