// map.js — Tracts choropleth (mapdata.geojson) with legend + click-to-open info card
document.addEventListener('DOMContentLoaded', async () => {
  // Pym: create if available; otherwise stay null
  let pymChild = null;
  try { if (window.pym) pymChild = new pym.Child(); } catch {}

  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21oM21rM2RmMDg3bjJpcHg0MzRwa2NpZyJ9.drZktAF4o0TiL48lqEvD8g";

  // DOM
  const infoBox  = document.getElementById('info-box');
  const legendEl = document.getElementById('legend');

  // Make sure legend is visible even if CSS had display:none
  if (legendEl) legendEl.style.display = 'block';

  // Map (same style + layout as your template)
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mlnow/cm2tndow500co01pw3fho5d21',
    center: [-122.4243266, 37.7247071],
    zoom: 9.5
  });

  // ======================= Helpers =======================
  const key  = v => (v == null ? '' : String(v).trim());
  const safe = (p, k) => key(p?.[k]);

  const getTractId = (p = {}) =>
    safe(p, 'tract') ||
    safe(p, 'TRACT') ||
    safe(p, 'TRACTCE') ||
    safe(p, 'NAME') ||
    safe(p, 'GEOID') ||
    safe(p, 'geoid') ||
    'Unknown tract';

  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const fmtPct = (v, digits = 1) => (v == null ? '—' : `${v.toFixed(digits)}%`);
  const fmtInt = v => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US'));

  // Compute quantiles for a numeric array (p in [0,1])
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const w = idx - lo;
    return sorted[lo] * (1 - w) + sorted[hi] * w;
  }

  // Legend utils
  const fmtWholeOr1 = (v) => {
    if (v == null) return '—';
    const digits = Math.abs(v) < 10 ? 1 : 0; // 1 decimal if <10%
    return `${v.toFixed(digits)}%`;
  };

// Replace your buildLegend with this version (adds heading arg)
function buildLegend(el, breaks, colors, headingText = '') {
  if (!el) return;
  const [b0, b1, b2, b3] = breaks.map(v => Number.isFinite(v) ? v : null);
  const labels = [
    `≤ ${fmtWholeOr1(b0)}`,
    `${fmtWholeOr1(b0)} – ${fmtWholeOr1(b1)}`,
    `${fmtWholeOr1(b1)} – ${fmtWholeOr1(b2)}`,
    `${fmtWholeOr1(b2)} – ${fmtWholeOr1(b3)}`,
    `≥ ${fmtWholeOr1(b3)}`
  ];
  el.innerHTML = `
    ${headingText ? `<div class="heading">${headingText}</div>` : ``}
    <div class="title">% foreign-born</div>
    ${colors.map((c, i) => `
      <div class="row">
        <span class="swatch" style="background:${c}"></span>
        <span>${labels[i]}</span>
      </div>
    `).join('')}
  `;
}


  // Info box template (tract bold; % + count on the right; naturalized lines below)
  function tplInfo(p = {}, displayMult = 1) {
    const tract  = getTractId(p);

    const fbPct   = num(p.pct_foreign_born);
    const natPct  = num(p.pct_foreign_born_naturalized);
    const nNatPct = num(p.pct_foreign_born_not_naturalized);

    const fbCount = num(p.foreign_born);

    const fbDisp   = fbPct   == null ? null : fbPct   * displayMult;
    const natDisp  = natPct  == null ? null : natPct  * displayMult;
    const nNatDisp = nNatPct == null ? null : nNatPct * displayMult;

    const headlineRight = `${fmtPct(fbDisp)} foreign born (${fmtInt(fbCount)})`;

    return `
      <div class="info-title-row">
        <div class="event">Census <strong>${tract}</strong></div>
        <div class="when">${headlineRight}</div>
      </div>
      <div class="info-desc">
        Naturalized: ${fmtPct(natDisp)}<br/>
        Not naturalized: ${fmtPct(nNatDisp)}
      </div>
    `;
  }

  // Info-box show/hide (keeps your template behavior)
  const showInfoBox = () => {
    infoBox.style.display = 'block';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };
  const hideInfoBox = () => {
    infoBox.style.display = 'none';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };

  // Selection state
  let selectedUID = null;
  const clearSelection = () => {
    selectedUID = null;
    infoBox.innerHTML = '';
    hideInfoBox();
    try {
      map.setFilter('tracts-hover', ['==', ['get', '__uid'], '']);
    } catch {}
  };

  // ======================= Load data =======================
  const DATA_URL = 'mapdata.geojson';
  const gj = await fetch(DATA_URL).then(r => {
    if (!r.ok) throw new Error(`Failed to load ${DATA_URL}`);
    return r.json();
  });

  // Precompute: UID + collect values for quantiles, detect scale
  const vals = [];
  for (const f of (gj.features || [])) {
    if (!f.properties) f.properties = {};
    const uid = getTractId(f.properties);
    f.properties.__uid = uid;
    const v = num(f.properties.pct_foreign_born);
    if (v != null) vals.push(v);
  }

  // If data are fractions 0–1, max will be <= ~1. We’ll display in 0–100 and color with the same.
  const maxVal = vals.length ? Math.max(...vals) : 0;
  const dataIsFraction = maxVal > 0 && maxVal <= 1.2;
  const displayMult = dataIsFraction ? 100 : 1;

  // Compute quantile breaks (display scale)
  const sorted = vals.map(v => v * displayMult).sort((a, b) => a - b);
  const quantileBreaks = sorted.length
    ? [quantile(sorted, 0.2), quantile(sorted, 0.4), quantile(sorted, 0.6), quantile(sorted, 0.8)]
    : [10, 20, 30, 40]; // fallback

  // ========= Binning mode: fixed (recommended) or quantiles =========
  const USE_FIXED_BINS = true; // set false to use quantiles

  // Fixed bins (percent units)
  const FIXED_BREAKS = [10, 20, 30, 40];

  // Final breaks used for both coloring + legend
  const BIN_BREAKS = USE_FIXED_BINS ? FIXED_BREAKS : quantileBreaks;

  // Color ramp (light → dark). Adjust if you want different hues.
  const COLORS = ["#FFF1FA","#FFD9F6","#F67CF6","#E95AD7","#C83AB8"];


  // Expression helper to get the value on the same display scale used for breaks
  const FB_EXPR = dataIsFraction
    ? ['*', ['coalesce', ['get', 'pct_foreign_born'], 0], 100]
    : ['coalesce', ['get', 'pct_foreign_born'], 0];

  // Step expression: value < b1 → c0; < b2 → c1; ...
  const colorExpr = [
    'step', FB_EXPR,
    COLORS[0],
    BIN_BREAKS[0], COLORS[1],
    BIN_BREAKS[1], COLORS[2],
    BIN_BREAKS[2], COLORS[3],
    BIN_BREAKS[3], COLORS[4]
  ];

  // ======================= Map layers =======================
  map.on('load', () => {
    map.addSource('tracts', { type: 'geojson', data: gj });

    // Fill layer (choropleth)
    map.addLayer({
      id: 'tracts-fill',
      type: 'fill',
      source: 'tracts',
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': 0.82
      }
    });

    // Base outline
    map.addLayer({
      id: 'tracts-outline',
      type: 'line',
      source: 'tracts',
      paint: {
        'line-color': '#ffffff',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 0.2,
          12, 0.6
        ],
        'line-opacity': 0.8
      }
    });

    // Hover outline
    map.addLayer({
      id: 'tracts-hover',
      type: 'line',
      source: 'tracts',
      filter: ['==', ['get', '__uid'], ''],
      paint: {
        'line-color': '#ffffff',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          9, 1.2,
          12, 2.2
        ],
        'line-opacity': 0.9
      }
    });

    // Hover behavior
    map.on('mousemove', 'tracts-fill', (e) => {
      if (!e.features?.length) return;
      const uid = e.features[0].properties?.__uid || '';
      map.setFilter('tracts-hover', ['==', ['get', '__uid'], uid]);
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'tracts-fill', () => {
      if (!selectedUID) map.setFilter('tracts-hover', ['==', ['get', '__uid'], '']);
      map.getCanvas().style.cursor = '';
    });

    // Click → open info card
    map.on('click', 'tracts-fill', (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const props = f.properties || {};
      selectedUID = props.__uid || '';
      infoBox.innerHTML = tplInfo(props, displayMult);
      map.setFilter('tracts-hover', ['==', ['get', '__uid'], selectedUID]);
      showInfoBox();
      map.getCanvas().style.cursor = 'pointer';
    });

    // Click background → clear card
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['tracts-fill'] });
      if (!hit.length) clearSelection();
    });

    // ESC to clear
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSelection(); });

    // Keep labels above
    try {
      if (map.getLayer('road-label-navigation')) map.moveLayer('road-label-navigation');
      if (map.getLayer('settlement-subdivision-label')) map.moveLayer('settlement-subdivision-label');
      map.moveLayer('tracts-hover');
    } catch {}

    // Build legend now that breaks/colors are final
    buildLegend(legendEl, BIN_BREAKS, COLORS);

    // Pym height sync (robust)
    (function robustPym() {
      const sendBurst = (ms = 1800, every = 150) => {
        const end = performance.now() + ms;
        const tick = () => {
          try { pymChild?.sendHeight(); } catch {}
          if (performance.now() < end) setTimeout(tick, every);
        };
        requestAnimationFrame(tick);
      };

      Promise.all([
        new Promise(r => map.once('idle', r)),
        (document.fonts?.ready ?? Promise.resolve())
      ]).then(() => {
        requestAnimationFrame(() => {
          try { pymChild?.sendHeight(); } catch {}
          sendBurst();
        });
      });

      let tId = null;
      const throttled = () => {
        if (tId) return;
        tId = setTimeout(() => { tId = null; try { pymChild?.sendHeight(); } catch {} }, 100);
      };

      new ResizeObserver(throttled).observe(document.body);
      const mo = new MutationObserver(throttled);
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });

      window.addEventListener('orientationchange', () => {
        setTimeout(() => { map.resize(); sendBurst(1000, 150); }, 200);
      });
    })();
  });

  // Relayout on window resize
  window.addEventListener('resize', () => map.resize());
});