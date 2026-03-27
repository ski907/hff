<script>
  import { onMount, onDestroy } from 'svelte';

  export let lat = 41.1242;
  export let lon = -101.3644;

  let mapEl;
  let map;
  let marker;

  // Custom circle marker — avoids Leaflet default PNG icon issues in Vite
  function makeIcon(L) {
    return L.divIcon({
      className: '',
      html: `<svg width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="5.5" fill="#f47067" stroke="#e6edf3" stroke-width="2"/>
      </svg>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  onMount(async () => {
    const L = (await import('leaflet')).default;

    map = L.map(mapEl, { zoomControl: true }).setView([lat, lon], 6);

    // Dark tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    marker = L.marker([lat, lon], { icon: makeIcon(L) }).addTo(map);

    map.on('click', (e) => {
      lat = parseFloat(e.latlng.lat.toFixed(4));
      lon = parseFloat(e.latlng.lng.toFixed(4));
      marker.setLatLng([lat, lon]);
    });

    // Fix Leaflet layout inside flex containers
    setTimeout(() => map.invalidateSize(), 50);
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  // Keep marker in sync if lat/lon change externally (e.g. typed into input)
  $: if (marker) marker.setLatLng([lat, lon]);
</script>

<div bind:this={mapEl} class="map-container"></div>

<style>
  .map-container {
    height: 320px;
    width: 100%;
    border-radius: 6px;
    overflow: hidden;
    background: #0d1117;
  }

  /* Leaflet popup/control theme overrides */
  :global(.leaflet-control-zoom a) {
    background: #161b22 !important;
    color: #e6edf3 !important;
    border-color: #30363d !important;
  }

  :global(.leaflet-control-zoom a:hover) {
    background: #21262d !important;
  }

  :global(.leaflet-control-attribution) {
    background: rgba(13, 17, 23, 0.7) !important;
    color: #484f58 !important;
    font-size: 9px !important;
  }

  :global(.leaflet-control-attribution a) {
    color: #7d8590 !important;
  }
</style>
