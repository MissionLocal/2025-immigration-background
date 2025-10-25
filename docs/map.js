// map.js — Tracts choropleth via Mapbox vector tileset (mlnow.6yvrkqc4 / mapdata)
document.addEventListener('DOMContentLoaded', () => {
  // Optional Pym
  let pymChild = null;
  try { if (window.pym) pymChild = new pym.Child(); } catch {}

  mapboxgl.accessToken = "pk.eyJ1IjoibWxub3ciLCJhIjoiY21ncjMxM2QwMnhjajJvb3ZobnllcDdmOSJ9.dskkEmEIuRIhKPkTh5o_Iw";

  // ---- DOM
  const infoBox  = document.getElementById('info-box');
  const legendEl = document.getElementById('legend');
  if (legendEl) legendEl.style.display = 'block';

  // ---- Map
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mlnow/cm2tndow500co01pw3fho5d21',
    center: [-122.4243266, 37.7247071],
    zoom: 9.5
  });

  // ======================= CONFIG =======================
  const TILESET_URL  = "mapbox://mlnow.2mf63gi6";
  const SOURCE_LAYER = "mapdata";

  // Use your single, consistent id field here:
  const UID_FIELD = "GEOID"; // change to "TRACTCE" if that's your id

  // If tiles store pct_foreign_born as 0–1, keep true; if 0–100, set false.
  const DATA_IS_FRACTION = false;

  // Field names (same as your GeoJSON)
  const VALUE_FIELD = "pct_foreign_born";
  const NAT_FIELD   = "pct_foreign_born_naturalized";
  const NNAT_FIELD  = "pct_foreign_born_not_naturalized";
  const COUNT_FIELD = "foreign_born";

  // 4 breaks → 5 colors
  const BIN_BREAKS = [10, 20, 30, 40];

  // Lighter pink ramp (light → dark)
  const COLORS = ["#FFF1FA", "#FFD9F6", "#FFBFF3", "#FF9AEE", "#F67CF6"];

  // ======================= Helpers =======================
  const key  = v => (v == null ? '' : String(v).trim());
  const safe = (p, k) => key(p?.[k]);
  const num  = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const fmtPct = (v, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`);
  const fmtInt = v => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US'));
  const fmtWholeOr1 = v => (v == null ? '—' : `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`);

  function buildLegend(el, breaks, colors,headingText='') {
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

  function tplInfo(p = {}) {
    const tract = safe(p, 'tract') || safe(p, 'TRACT') || safe(p, 'TRACTCE') ||
                  safe(p, 'NAME')  || safe(p, 'GEOID') || safe(p, 'geoid') || "Unknown tract";

    const raw     = num(p[VALUE_FIELD]);
    const natRaw  = num(p[NAT_FIELD]);
    const nNatRaw = num(p[NNAT_FIELD]);
    const count   = num(p[COUNT_FIELD]);

    const fbDisp   = raw     == null ? null : (DATA_IS_FRACTION ? raw * 100 : raw);
    const natDisp  = natRaw  == null ? null : (DATA_IS_FRACTION ? natRaw * 100 : natRaw);
    const nNatDisp = nNatRaw == null ? null : (DATA_IS_FRACTION ? nNatRaw * 100 : nNatRaw);

    const headlineRight = `${fmtPct(fbDisp)} foreign born ${count != null ? `(${fmtInt(count)})` : ""}`;

    return `
      <div class="info-title-row">
        <div class="event"><strong>${tract}</strong></div>
        <div class="when">${headlineRight}</div>
      </div>
      <div class="info-desc">
        ${NAT_FIELD ? `Naturalized: ${fmtPct(natDisp)}<br/>` : ``}
        ${NNAT_FIELD ? `Not naturalized: ${fmtPct(nNatDisp)}` : ``}
      </div>
    `;
  }

  const showInfoBox = () => {
    infoBox.style.display = 'block';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };
  const hideInfoBox = () => {
    infoBox.style.display = 'none';
    requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
  };

  // ======================= Map layers =======================
  map.on('load', () => {
    // Vector source (promoteId enables fast hover/feature-state)
    map.addSource('tracts', {
      type: 'vector',
      url: TILESET_URL,
      promoteId: UID_FIELD
    });

    // Color expression on display scale
    const FB_EXPR = DATA_IS_FRACTION
      ? ['*', ['to-number', ['coalesce', ['get', VALUE_FIELD], 0]], 100]
      : ['to-number', ['coalesce', ['get', VALUE_FIELD], 0]];

    const colorExpr = [
      'step', FB_EXPR,
      COLORS[0],
      BIN_BREAKS[0], COLORS[1],
      BIN_BREAKS[1], COLORS[2],
      BIN_BREAKS[2], COLORS[3],
      BIN_BREAKS[3], COLORS[4]
    ];

    // Fill
    map.addLayer({
      id: 'tracts-fill',
      type: 'fill',
      source: 'tracts',
      'source-layer': SOURCE_LAYER,
      paint: {
        'fill-color': colorExpr,
        'fill-opacity': 0.88
      }
    });

    // Outline
    map.addLayer({
      id: 'tracts-outline',
      type: 'line',
      source: 'tracts',
      'source-layer': SOURCE_LAYER,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.2, 12, 0.6],
        'line-opacity': 0.8
      }
    });

    // Hover outline — filter by the single, consistent UID field
    map.addLayer({
      id: 'tracts-hover',
      type: 'line',
      source: 'tracts',
      'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', UID_FIELD], ''], // start empty
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 12, 2.2],
        'line-opacity': 0.9
      }
    });

    // Hover behavior
    map.on('mousemove', 'tracts-fill', (e) => {
      if (!e.features?.length) return;
      const uid = e.features[0].properties?.[UID_FIELD] ?? '';
      map.setFilter('tracts-hover', ['==', ['get', UID_FIELD], uid]);
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'tracts-fill', () => {
      map.setFilter('tracts-hover', ['==', ['get', UID_FIELD], '']);
      map.getCanvas().style.cursor = '';
    });

    // Click → info card
    map.on('click', 'tracts-fill', (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties || {};
      infoBox.innerHTML = tplInfo(props);
      showInfoBox();
    });

    // Click background → clear
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['tracts-fill'] });
      if (!hit.length) {
        hideInfoBox();
        map.setFilter('tracts-hover', ['==', ['get', UID_FIELD], '']);
      }
    });

    // Labels above + hover on top
    try {
      if (map.getLayer('road-label-navigation')) map.moveLayer('road-label-navigation');
      if (map.getLayer('settlement-subdivision-label')) map.moveLayer('settlement-subdivision-label');
      map.moveLayer('tracts-hover');
    } catch {}

    // Legend
    buildLegend(legendEl, BIN_BREAKS, COLORS);

    // Pym sync (simple)
    Promise.all([
      new Promise(r => map.once('idle', r)),
      (document.fonts?.ready ?? Promise.resolve())
    ]).then(() => {
      requestAnimationFrame(() => { try { pymChild?.sendHeight(); } catch {} });
    });
  });

  // Resize
  window.addEventListener('resize', () => map.resize());
});
