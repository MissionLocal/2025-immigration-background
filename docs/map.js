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
    style: 'mapbox://styles/mlnow/cmcl3p51v003g01sqav9fa920',
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

  // --- BREAKS & COLORS ---
  // Added a new break at 50 so that 40–50 and ≥50 are distinct buckets.
  const BIN_BREAKS = [10, 20, 30, 40, 50]; // ← now 5 breaks → 6 bins

  // Lighter pink ramp (light → dark) — added one deeper shade at the end
  const COLORS = ["#FFF1FA", "#FFD9F6", "#FFBFF3", "#FF9AEE", "#F67CF6", "#E95AD7"];

  // ======================= Helpers =======================
  const key  = v => (v == null ? '' : String(v).trim());
  const safe = (p, k) => key(p?.[k]);
  const num  = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const fmtPct = (v, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`);
  const fmtInt = v => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US'));
  const fmtWholeOr1 = v => (v == null ? '—' : `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`);

  function buildLegend(el, breaks, colors, headingText='') {
    if (!el) return;

    // Build labels from an arbitrary number of breaks (N) → N+1 labels
    const labels = [];
    for (let i = 0; i <= breaks.length; i++) {
      if (i === 0) {
        labels.push(`≤ ${fmtWholeOr1(breaks[0])}`);
      } else if (i === breaks.length) {
        labels.push(`≥ ${fmtWholeOr1(breaks[breaks.length - 1])}`);
      } else {
        labels.push(`${fmtWholeOr1(breaks[i - 1])} – ${fmtWholeOr1(breaks[i])}`);
      }
    }

    el.innerHTML = `
      ${headingText ? `<div class="heading">${headingText}</div>` : ``}
      <div class="title">Foreign-born</div>
      ${colors.map((c, i) => `
        <div class="row">
          <span class="swatch" style="background:${c}"></span>
          <span>${labels[i]}</span>
        </div>
      `).join('')}
    `;
  }

  function buildStepColor(valueExpr, breaks, colors) {
    // Mapbox 'step' expects: ['step', value, color0, break0, color1, break1, color2, ...]
    const step = ['step', valueExpr, colors[0]];
    for (let i = 0; i < breaks.length; i++) {
      step.push(breaks[i], colors[i + 1]);
    }
    return step;
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

    // Value expression on display scale
    const FB_EXPR = DATA_IS_FRACTION
      ? ['*', ['to-number', ['coalesce', ['get', VALUE_FIELD], 0]], 100]
      : ['to-number', ['coalesce', ['get', VALUE_FIELD], 0]];

    // Dynamic step expression (now supports the extra 50% break)
    const colorExpr = buildStepColor(FB_EXPR, BIN_BREAKS, COLORS);

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

    // Legend (auto-builds from the breaks)
    buildLegend(legendEl, BIN_BREAKS, COLORS); // no heading string

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
