/* Map core: MapLibre, locked to Homs governorate, 3D real-footprint buildings, network layers, icons. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const M = FT.map = {};
  const EMPTY = { type: 'FeatureCollection', features: [] };
  const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  let map, BOUND = null, tileCache = {}, tileLoading = {}, refreshTimer = 0;
  M.ready = false;
  M.tileBase = 'data/tiles/14/';

  // ---------------- boundary ----------------
  M.loadBoundary = async function () {
    BOUND = await (await fetch('data/homs_boundary.json')).json();
    FT.BOUND = BOUND; return BOUND;
  };
  M.insideGov = ll => !BOUND || BOUND.polygons.some(r => FT.pointInRing(ll, r));

  // ---------------- icons (own drawings, same colours/abbreviations as the unit names) ----------------
  function icon(type, size, onDark) {
    const EDGE = onDark ? '#ffffff' : '#07090d', BODY = onDark ? '#eef1f8' : '#171b25';
    const s = size || 64, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    const col = FT.NODE_TYPES[type] ? FT.NODE_TYPES[type].color : '#9aa1b6';
    g.translate(s / 2, s / 2); g.lineJoin = 'round'; g.lineCap = 'round';
    const ring = (r, fill, stroke, lw) => { g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); };
    const badge = txt => { ring(s * 0.42, col, EDGE, s * 0.06); g.fillStyle = '#07090d'; g.font = '800 ' + s * (txt.length > 3 ? 0.22 : txt.length > 2 ? 0.26 : 0.3) + 'px IBM Plex Sans Arabic, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, s * 0.02); };
    if (type === 'olt') { // rack unit: rounded box with 3 slots and LEDs
      g.fillStyle = col; g.strokeStyle = EDGE; g.lineWidth = s * 0.06; const w = s * 0.7, h = s * 0.74; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, s * 0.12); g.fill(); g.stroke();
      g.fillStyle = '#07090d'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.roundRect(-w * 0.36, i * h * 0.26 - h * 0.08, w * 0.72, h * 0.16, s * 0.03); g.fill(); }
      g.fillStyle = '#eafff4'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(w * 0.24, i * h * 0.26, s * 0.03, 0, 7); g.fill(); }
    } else if (type === 'sk') badge('FDC'); else if (type === 'dk') badge('iFDC'); else if (type === 'bk') badge('FDB');
    else if (type === 'mh') { ring(s * 0.36, BODY, col, s * 0.07); g.strokeStyle = onDark ? '#161b24' : col; g.lineWidth = onDark ? s * 0.09 : s * 0.06; g.beginPath(); g.moveTo(-s * 0.2, 0); g.lineTo(s * 0.2, 0); g.moveTo(0, -s * 0.2); g.lineTo(0, s * 0.2); g.stroke(); }
    else if (type === 'hh') { g.fillStyle = BODY; g.strokeStyle = col; g.lineWidth = s * 0.07; g.beginPath(); g.roundRect(-s * 0.27, -s * 0.27, s * 0.54, s * 0.54, s * 0.08); g.fill(); g.stroke(); if (onDark) g.strokeStyle = '#161b24'; g.beginPath(); g.moveTo(-s * 0.13, 0); g.lineTo(s * 0.13, 0); g.stroke(); }
    else if (type === 'edgeh' || type === 'moveh') { // edit handles: coral disc with arrows (pointing up; rotated on the map)
      ring(s * 0.4, type === 'edgeh' ? '#ff6a3d' : '#ffffff', '#07090d', s * 0.06); g.strokeStyle = type === 'edgeh' ? '#ffffff' : '#07090d'; g.fillStyle = g.strokeStyle; g.lineWidth = s * 0.07;
      const ar = (dx, dy) => { g.save(); g.rotate(Math.atan2(dx, -dy)); g.beginPath(); g.moveTo(0, -s * 0.27); g.lineTo(s * 0.11, -s * 0.12); g.lineTo(-s * 0.11, -s * 0.12); g.closePath(); g.fill(); g.restore(); };
      if (type === 'edgeh') { g.beginPath(); g.moveTo(0, -s * 0.18); g.lineTo(0, s * 0.18); g.stroke(); ar(0, -1); ar(0, 1); } else { g.beginPath(); g.moveTo(0, -s * 0.18); g.lineTo(0, s * 0.18); g.moveTo(-s * 0.18, 0); g.lineTo(s * 0.18, 0); g.stroke(); ar(0, -1); ar(0, 1); ar(1, 0); ar(-1, 0); }
    }
    else if (type === 'pole') { g.strokeStyle = EDGE; g.lineWidth = s * 0.2; g.beginPath(); g.moveTo(0, s * 0.4); g.lineTo(0, -s * 0.38); g.moveTo(-s * 0.3, -s * 0.22); g.lineTo(s * 0.3, -s * 0.22); g.stroke(); g.strokeStyle = col; g.lineWidth = s * 0.1; g.beginPath(); g.moveTo(0, s * 0.38); g.lineTo(0, -s * 0.36); g.moveTo(-s * 0.28, -s * 0.22); g.lineTo(s * 0.28, -s * 0.22); g.stroke(); }
    else if (type === 'splice') { ring(s * 0.3, '#ff6a3d', EDGE, s * 0.06); g.strokeStyle = '#07090d'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.16, -s * 0.16); g.lineTo(s * 0.16, s * 0.16); g.moveTo(s * 0.16, -s * 0.16); g.lineTo(-s * 0.16, s * 0.16); g.stroke(); }
    else if (type === 'sub') { ring(s * 0.28, '#7ad7ff', EDGE, s * 0.06); }
    else if (type === 'ap' || type === 'cpe' || type === 'ptp') { const wc = { ap: '#35e0c9', cpe: '#ffd24a', ptp: '#b57bff' }[type]; ring(s * 0.2, wc, EDGE, s * 0.06); g.strokeStyle = wc; g.lineWidth = s * 0.06; for (const r of [0.32, 0.44]) { g.beginPath(); g.arc(0, 0, s * r, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(0, 0, s * r, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); } }
    return g.getImageData(0, 0, s, s);
  }
  const iconCache = {};
  M.iconDataURL = function (type, size) { const k = type + '|' + (size || 64); if (iconCache[k]) return iconCache[k]; const d = icon(type, size || 64), c = document.createElement('canvas'); c.width = d.width; c.height = d.height; c.getContext('2d').putImageData(d, 0, 0); return (iconCache[k] = c.toDataURL()); };

  // on-screen size of each element icon, in pixels, and how many pixels its drawing covers at icon-size 1 (32 px image)
  function ratioPill() { const W = 24, H = 18, r = 2, c = document.createElement('canvas'); c.width = W * r; c.height = H * r; const g = c.getContext('2d'); g.scale(r, r); g.fillStyle = '#ff6a3d'; g.beginPath(); g.roundRect(0, 0, W, H, 5); g.fill(); g.fillStyle = '#0e1117'; g.beginPath(); g.roundRect(1.2, 1.2, W - 2.4, H - 2.4, 4); g.fill(); return g.getImageData(0, 0, c.width, c.height); }
  M.ratioText = n => { const k = n && n.ratio ? Math.max(1, parseInt(n.nsplit, 10) || 1) : 0; return k ? (k > 1 ? k + '×' : '') + n.ratio : ''; };
  // the splitter ratio is one small rectangle: above the house icon when the box is on a house, otherwise above the box itself
  const PILL_BASE = [0, -2.05]; // ems of 10 px above the middle of a box that has no house under it
  const ICON_ZOOM = [[16.5, 0.7], [17.6, 0.92], [19.5, 1.35]]; // the house icon's own size rule
  // 'hk' on a node: 0 = no house under it, 1..20 = floors of that house, +100 when the house carries a number (it is raised)
  const pillAt = k => {
    const m = ['match', ['get', 'hk']];
    [4, FT.houses.PLATE_LIFT].forEach((lift, numbered) => { for (let n = 1; n <= FT.houses.MAX_FLOORS; n++) { const h = FT.houses.metrics(n), top = (lift + h.roof + h.body + 3) * k; m.push(n + numbered * 100, ['literal', [0, -+((top + 10) / 10).toFixed(2)]]); } });
    m.push(['literal', PILL_BASE]); return m;
  };
  // a small grid of the house points (the ones on screen and the ones the project fixed), so finding the house under a box is instant
  const CELL_DEG = 1e-4; let grid = null, gridOf = null, gridBld = null;
  function nearHouses(ll) {
    if (!grid || gridOf !== M.houseFeats || gridBld !== FT.state.bld) {
      grid = new Map(); gridOf = M.houseFeats; gridBld = FT.state.bld;
      const put = (id, p) => { const k = Math.floor(p[0] / CELL_DEG) + ',' + Math.floor(p[1] / CELL_DEG); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push({ id, p }); };
      (M.houseFeats || []).forEach(f => put(f.properties.id, f.geometry.coordinates)); for (const id in FT.state.bld) { const o = FT.state.bld[id]; if (o.pt && !o.deleted) put(id, o.pt); }
    }
    const x = Math.floor(ll[0] / CELL_DEG), y = Math.floor(ll[1] / CELL_DEG), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grid.get((x + i) + ',' + (y + j)); if (l) out.push(...l); }
    return out;
  }
  M.dropHouseGrid = () => { grid = null; };
  M.onHouses = n => !!(n.ratio || n.type === 'bk'); // the elements whose labels have to know about a house under them
  M.pillKeys = () => Object.values(FT.state.nodes).filter(M.onHouses).map(n => M.houseKey(n)).join();
  M.houseUnder = function (n) {
    if (M.hideHouses) return null;
    let id = n.bld && !(FT.state.bld[n.bld] || {}).deleted ? n.bld : null, p = id ? M.housePoint(id) : null;
    if (!p || FT.dist(p, n.ll) > 4) { id = null; let best = 4; nearHouses(n.ll).forEach(h => { const d = FT.dist(h.p, n.ll); if (d < best) { best = d; id = h.id; } }); }
    return id;
  };
  M.houseKey = function (n) { const id = M.houseUnder(n); if (!id) return 0; const o = FT.state.bld[id] || {}; return FT.houses.floorsOf(o) + (FT.num && o.num ? 100 : 0); };
  M.shortName = n => n.name.replace(/^(F\d+)-(PS\d+)-(P\d+)-D\d+-FDB\d+$/, '$1·$2·$3');
  M.addRatioLayers = function () {
    if (!map.hasImage('ratio-pill')) map.addImage('ratio-pill', ratioPill(), { pixelRatio: 2, stretchX: [[12, 36]], stretchY: [[12, 24]], content: [8, 5, 40, 31] });
    const offset = ['interpolate', ['linear'], ['zoom'], 15.2, ['literal', PILL_BASE], 16.49, ['literal', PILL_BASE]];
    ICON_ZOOM.forEach(([z, k]) => offset.push(z, pillAt(k)));
    map.addLayer({ id: 'spl-lab', type: 'symbol', source: 'nodes', minzoom: 15.2, filter: ['!=', ['coalesce', ['get', 'rt'], ''], ''], layout: { 'icon-image': 'ratio-pill', 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 3, 1, 3], 'text-field': ['get', 'rt'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': offset, 'text-allow-overlap': true, 'icon-allow-overlap': true, 'text-ignore-placement': true, 'icon-ignore-placement': true }, paint: { 'text-color': '#ffffff' } });
  };
  M.SEL = '#ff6a3d';
  M.addSelectionLayers = function () {
    map.addSource('msel', { type: 'geojson', data: EMPTY });
    const under = map.getLayer('pipes-case') ? 'pipes-case' : undefined;
    map.addLayer({ id: 'msel-line', type: 'line', source: 'msel', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': M.SEL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 18, 12], 'line-opacity': 0.75 } }, under);
    const r = ['interpolate', ['linear'], ['zoom'], 9, 5, 13, 8, 15, 11.5, 20.5, 11.5];
    map.addLayer({ id: 'msel-back', type: 'circle', source: 'msel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': r, 'circle-color': '#07090d', 'circle-opacity': 0.9 } }, 'nodes');
    map.addLayer({ id: 'msel-ring', type: 'circle', source: 'msel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': r, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': M.SEL, 'circle-stroke-width': 2.6 } }, 'nodes');
  };
  M.setDone = function (ring, open) { // a finished area (closed) or a finished measured line (open)
    if (!map || !map.getSource('done')) return;
    const f = !ring || ring.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: open || ring.length < 3 ? { type: 'LineString', coordinates: ring } : { type: 'Polygon', coordinates: [ring.concat([ring[0]])] } }];
    M.doneRing = f.length ? ring : null; map.getSource('done').setData({ type: 'FeatureCollection', features: f });
  };
  M.setMulti = function (m) { // ring every selected node, glow every selected line (very large selections: the first 4000)
    if (!map || !map.getSource('msel')) return; const S = FT.state, f = [];
    if (m) {
      [...(m.nodes || [])].slice(0, 4000).forEach(id => { const n = S.nodes[id]; if (n) f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: n.ll } }); });
      [...(m.pipes || [])].slice(0, 4000).forEach(id => { const p = S.pipes[id]; if (p && p.pts.length > 1) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.pts } }); });
      [...(m.cables || [])].slice(0, 4000).forEach(id => { const c = S.cables[id]; if (!c) return; const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); if (pts.length > 1) f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }); });
    }
    map.getSource('msel').setData({ type: 'FeatureCollection', features: f });
  };
  M.ICON_PX = { olt: 22, sk: 15.5, dk: 15.5, bk: 15, mh: 15, hh: 14, pole: 16, splice: 13, sub: 12 };
  const DRAWN_PX = { olt: 25.6, sk: 28.8, dk: 28.8, bk: 28.8, mh: 25.3, hh: 19.5, pole: 29, splice: 21.1, sub: 19.8 };
  M.nodeIconSize = function () {
    const at = k => { const m = ['match', ['get', 'type']]; Object.keys(M.ICON_PX).forEach(t => m.push(t, +(k * M.ICON_PX[t] / DRAWN_PX[t]).toFixed(3))); m.push(+(k * 0.52).toFixed(3)); return m; };
    return ['interpolate', ['linear'], ['zoom'], 9, at(0.45), 13, at(0.65), 15, at(1), 20.5, at(1)];
  };

  // ---------------- init ----------------
  M.init = async function (container) {
    await M.loadBoundary();
    maplibregl.setRTLTextPlugin('vendor/mapbox-gl-rtl-text.js', false); // Arabic letters must connect
    const bb = BOUND.bbox, pad = 0.05;
    map = M.map = new maplibregl.Map({
      container, style: STYLE, center: [36.7137, 34.7324], zoom: 13.5, minZoom: 7.2, maxZoom: 20.5, pitch: 0,
      maxBounds: [[bb[0] - pad, bb[1] - pad], [bb[2] + pad, bb[3] + pad]], attributionControl: false, preserveDrawingBuffer: true, localIdeographFontFamily: false,
      dragRotate: true, pitchWithRotate: true, maxPitch: 75, doubleClickZoom: false,
    });
    map.boxZoom.disable(); // Shift+click is used by the planner (multi-select / remove number)
    map.setMaxPitch(0); // the street map is strictly 2D (the 3D map has its own button)
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Buildings © Microsoft (ODbL) · Map data © OpenStreetMap contributors · OpenFreeMap' }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    // the free base map asks for a few place icons it does not ship: give it a blank one instead of a console warning
    map.on('styleimagemissing', e => { if (e.id && !/^i-/.test(e.id) && !map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    await new Promise(res => map.on('load', res));
    const layers = map.getStyle().layers;
    if (map.getLayer('building-3d')) map.removeLayer('building-3d'); // OSM 3D replaced by our footprint layer
    M.baseLayerIds = map.getStyle().layers.map(l => l.id); // the base map's own layers (everything added after this is ours)
    const firstSymbol = (layers.find(l => l.type === 'symbol') || {}).id;
    // dim everything outside the governorate
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    map.addSource('mask', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [world].concat(BOUND.polygons.map(r => r.slice().reverse())) } } });
    map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#07090d', 'fill-opacity': 0.62 } }, firstSymbol);
    map.addSource('gov', { type: 'geojson', data: { type: 'FeatureCollection', features: BOUND.polygons.map(r => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: r }, properties: {} })) } });
    map.addLayer({ id: 'gov-line', type: 'line', source: 'gov', paint: { 'line-color': '#ff6a3d', 'line-width': 2, 'line-dasharray': [3, 2] } }, firstSymbol);
    // satellite (optional)
    map.addSource('sat', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 /* the official sharp imagery of Homs ends at level 18; level 19 is a soft or missing picture, so closer zoom stretches level 18 */, attribution: 'Imagery © Esri' });
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }, M.firstBaseLayerAbove());
    // buildings
    map.addSource('bld', { type: 'geojson', data: EMPTY, promoteId: 'id' });
    map.addLayer({ id: 'bld-3d', type: 'fill-extrusion', source: 'bld', minzoom: 14, paint: {
      'fill-extrusion-color': ['case', ['==', ['get', 'st'], 1], '#7ad7ff', '#d9d4cb'], // only a background drawing: numbers, hover and selection live on the house icon
      'fill-extrusion-height': ['get', 'eh'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.94, 'fill-extrusion-vertical-gradient': true } }, firstSymbol);
    // hide-the-drawing mode (satellite only): buildings invisible but still live (hover outline, click, numbers)
    map.addSource('hov', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'bld-out', type: 'line', source: 'bld', minzoom: 15, layout: { visibility: 'none' }, filter: ['==', ['get', 'st'], 1], paint: { 'line-color': '#ff8a62', 'line-width': 1.4, 'line-opacity': 0.9 } });
    map.addLayer({ id: 'hov-fill', type: 'fill', source: 'hov', paint: { 'fill-color': '#ff6a3d', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'hov-line', type: 'line', source: 'hov', paint: { 'line-color': '#ff6a3d', 'line-width': 2.2 } });
    // network
    ['pipes', 'cables', 'nodes', 'draw', 'sel', 'wd', 'wl', 'imp', 'impv', 'bh'].forEach(s => map.addSource(s, { type: 'geojson', data: EMPTY, promoteId: 'id' }));
    map.addLayer({ id: 'pipes-case', type: 'line', source: 'pipes', paint: { 'line-color': '#07090d', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 18, 8], 'line-opacity': 0.55 } });
    map.addLayer({ id: 'pipes', type: 'line', source: 'pipes', layout: { 'line-sort-key': ['coalesce', ['get', 'z'], 0] }, paint: { 'line-color': ['coalesce', ['get', 'color'], '#2aa8ff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 18, 5], 'line-dasharray': ['case', ['==', ['get', 'aerial'], 1], ['literal', [2, 1.5]], ['literal', [1, 0]]] } });
    map.addLayer({ id: 'cables', type: 'line', source: 'cables', minzoom: 17.5, layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['coalesce', ['get', 'z'], 0] }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 18, 3.6], 'line-offset': ['interpolate', ['linear'], ['zoom'], 10, 0, 18, 4] } });
    map.addLayer({ id: 'imp-fill', type: 'fill', source: 'imp', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3bd18b', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'imp-line', type: 'line', source: 'imp', filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']], paint: { 'line-color': '#7ad7ff', 'line-width': 2 } });
    map.addLayer({ id: 'imp-pt', type: 'circle', source: 'imp', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#7ad7ff', 'circle-stroke-color': '#07090d', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'wl-line', type: 'line', source: 'wl', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.2] } });
    map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ff6a3d', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 18, 11], 'line-opacity': 0.7, 'line-blur': 1 } });
    map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ffd24a', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ffc233', 'fill-opacity': 0.16 } });
    map.addLayer({ id: 'draw-poly-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#ffc233', 'line-width': 2.2 } });
    // finished area: green, without corner points
    map.addSource('done', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'done-fill', type: 'fill', source: 'done', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ff6a3d', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'done-line', type: 'line', source: 'done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff6a3d', 'line-width': 2.6 } });
    map.addLayer({ id: 'draw-pt', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#ffd24a', 'circle-stroke-color': '#07090d', 'circle-stroke-width': 2 } });
    ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole', 'splice', 'sub', 'ap', 'cpe', 'ptp', 'edgeh', 'moveh'].forEach(t => map.addImage('i-' + t, icon(t), { pixelRatio: 2 }));
    map.addLayer({ id: 'wdev', type: 'symbol', source: 'wd', layout: { 'icon-image': ['concat', 'i-', ['get', 'type']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.24, 14, 0.36, 17, 0.46, 19, 0.58], 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 15.5, ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-optional': true }, paint: { 'text-color': '#07090d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'nodes', type: 'symbol', source: 'nodes', layout: { 'symbol-sort-key': ['coalesce', ['get', 'z'], 0], 'icon-image': ['concat', 'i-', ['get', 'type']], 'icon-size': M.nodeIconSize(), 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'text-field': ['step', ['zoom'], '', 15.5, ['coalesce', ['get', 'lab'], ['get', 'name']]], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-optional': true }, paint: { 'text-color': '#07090d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'nodes-sel', type: 'circle', source: 'sel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 13, 'circle-color': 'rgba(255,255,255,0)', 'circle-stroke-color': '#ff6a3d', 'circle-stroke-width': 3 } });
    FT.houses.addImages(map); map.addSource('houses', { type: 'geojson', data: EMPTY, promoteId: 'id' });
    // the halo follows the icon's own rules (anchor, offset, size, upright on screen), so it is always centred on it
    map.addLayer({ id: 'house-sel', type: 'symbol', source: 'houses', minzoom: FT.houses.MINZ, layout: { 'icon-image': ['concat', 'halo-', ['to-string', ['get', 'fl']]], 'icon-anchor': 'bottom', 'icon-offset': ['case', ['!=', ['get', 'lab'], ''], ['literal', [0, FT.houses.HALO - FT.houses.PLATE_LIFT]], ['literal', [0, FT.houses.HALO - 4]]], 'icon-size': ['interpolate', ['linear'], ['zoom'], 16.5, 0.7, 17.6, 0.92, 19.5, 1.35], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ff6a3d', '#ffc4a3'], 'icon-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.85, ['boolean', ['feature-state', 'hover'], false], 0.55, 0] } }, 'nodes');
    map.addLayer({ id: 'house', type: 'symbol', source: 'houses', minzoom: FT.houses.MINZ, layout: { 'icon-image': ['concat', 'house-', ['to-string', ['get', 'fl']]], 'icon-anchor': 'bottom', 'icon-offset': ['case', ['!=', ['get', 'lab'], ''], ['literal', [0, -FT.houses.PLATE_LIFT]], ['literal', [0, -4]]], 'icon-size': ['interpolate', ['linear'], ['zoom'], 16.5, 0.7, 17.6, 0.92, 19.5, 1.35], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'y']] } }, 'nodes');
    M.addRatioLayers();
    M.addSelectionLayers();
    map.addSource('plates', { type: 'geojson', data: EMPTY, promoteId: 'id' });
    map.addLayer({ id: 'house-num', type: 'symbol', source: 'plates', minzoom: FT.houses.MINZ, filter: ['!=', ['coalesce', ['get', 'lab'], ''], ''], layout: { 'icon-image': 'house-plate', 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 3, 0, 3], 'text-field': ['get', 'lab'], 'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 16.5, 9.5, 17.6, 11, 19.5, 16], 'text-anchor': 'top', 'text-offset': [0, -1.45], 'icon-allow-overlap': true, 'text-allow-overlap': true, 'icon-ignore-placement': true, 'text-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'y']] }, paint: { 'text-color': '#07090d' } }, 'nodes');
    map.addLayer({ id: 'house-name', type: 'symbol', source: 'plates', minzoom: FT.houses.MINZ, filter: ['!=', ['coalesce', ['get', 'nm'], ''], ''], layout: { 'text-field': ['get', 'nm'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-anchor': 'top', 'text-offset': ['case', ['!=', ['get', 'lab'], ''], ['literal', [0, 3.3]], ['literal', [0, 0.5]]], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#07090d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } }, 'nodes');
    map.addSource('m3d', { type: 'geojson', data: EMPTY, promoteId: 'mid' });
    map.addLayer({ id: 'm3d', type: 'fill-extrusion', source: 'm3d', minzoom: FT.houses.MINZ, paint: { 'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ffffff', ['boolean', ['feature-state', 'hover'], false], '#ffc4a3', ['get', 'c']], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 1 } }, 'nodes');
    map.moveLayer('house-num', 'nodes'); map.moveLayer('house-name', 'nodes'); /* the number plates are drawn over the 3D models, never hidden behind them */
    map.addLayer({ id: 'impv-pt', type: 'circle', source: 'impv', minzoom: 17, paint: { 'circle-radius': 5.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#ff6a3d', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'bh-box', type: 'line', source: 'bh', minzoom: 17, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ffffff', 'line-width': 1.6, 'line-dasharray': [2, 2] } });
    map.addLayer({ id: 'bh-vtx', type: 'circle', source: 'bh', minzoom: 17, filter: ['==', ['get', 'k'], 'vtx'], paint: { 'circle-radius': 4.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#07090d', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'bh-pt', type: 'symbol', source: 'bh', minzoom: 17, filter: ['any', ['==', ['get', 'k'], 'edge'], ['==', ['get', 'k'], 'move']], layout: { 'icon-image': ['concat', 'i-', ['get', 'k'], 'h'], 'icon-size': 0.5, 'icon-rotate': ['coalesce', ['get', 'rot'], 0], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    map.on('moveend', M.scheduleBuildings); map.on('zoomend', M.scheduleBuildings);
    let plateRaf = 0; map.on('move', () => { if (M.base !== '3d' || plateRaf) return; plateRaf = requestAnimationFrame(() => { plateRaf = 0; M.renderPlates(); }); });
    // streets can arrive after the buildings: once the map is quiet, place the markers that were still waiting for a street (once per move)
    let retry = false; map.on('moveend', () => { retry = true; }); map.on('idle', () => { if (retry && M._housesWaiting && FT.roads) { retry = false; FT.roads.dirty = true; M.rebuildHouses(); } });
    M.ready = true; M.applyTheme(); M.scheduleBuildings(); M.renderNet();
    FT.onChange(why => M.renderNet(why));
    map.on('moveend', () => { // moved/zoomed out of the area that was built, or the cables just became visible: rebuild once
      if (M.netHidden || !M._builtBB) return; const b = map.getBounds(), bb = M._builtBB;
      if (b.getWest() < bb[0] || b.getEast() > bb[2] || b.getSouth() < bb[1] || b.getNorth() > bb[3] || (M._cablesDirty && map.getZoom() >= M.CABLE_MINZ)) M.renderNet(['lod']);
    });
    return map;
  };
  M.firstBaseLayerAbove = () => { const l = map.getStyle().layers.find(x => x.type === 'line' || x.type === 'symbol'); return l && l.id; };

  // ---------------- basemap switch ----------------
  M.hideBld = false; M.hideHouses = false; let hovId = null; // user wishes; both work on all three basemaps
  M.bldHiddenNow = () => M.hideBld;
  M.applyBldHidden = function () {
    const v = M.bldHiddenNow(); map.setPaintProperty('bld-3d', 'fill-extrusion-opacity', v ? 0 : 0.94); map.setLayoutProperty('bld-out', 'visibility', v ? 'visible' : 'none');
    if (!v) { hovId = null; map.getSource('hov').setData(EMPTY); }
    map.getStyle().layers.forEach(l => { if (l['source-layer'] === 'building') map.setLayoutProperty(l.id, 'visibility', v || M.base === 'sat' ? 'none' : 'visible'); });
    ['house', 'house-sel', 'house-num'].forEach(i => map.getLayer(i) && map.setLayoutProperty(i, 'visibility', M.hideHouses ? 'none' : 'visible'));
  };
  M.setHousesHidden = function (v) { M.hideHouses = !!v; M.applyBldHidden(); M.flatIcons(); M.render3d(); M.renderPlates(); M.renderNet('lod'); };
  M.setBldHidden = function (v) { M.hideBld = !!v; M.applyBldHidden(); M.render3d(); M.renderPlates(); if (FT.bedit) FT.bedit.refresh(); };
  let hoverB = null; // hover colour of a house: a feature-state (no data reload), only from zoom 15.5
  const hoverSet = id => { if (id === hoverB) return; if (hoverB != null) map.setFeatureState({ source: 'bld', id: hoverB }, { hover: false }); hoverB = id; if (id != null) map.setFeatureState({ source: 'bld', id }, { hover: true }); };
  let hoverH = null;
  const hoverHouse = id => { if (id === hoverH) return; const set = (i, v) => ['houses', 'm3d'].forEach(src => map.getSource(src) && map.setFeatureState({ source: src, id: i }, { hover: v })); if (hoverH != null) set(hoverH, false); hoverH = id; if (id != null) set(id, true); };
  M.hover = function (ll, pt) {
    if (!pt || !map.getLayer('house')) { hoverHouse(null); return; }
    const hs = map.queryRenderedFeatures([pt.x, pt.y], { layers: ['house', 'house-num', 'm3d'] }).filter(f => f.layer.id !== 'm3d' || f.properties.kind === 'house'); hoverHouse(hs.length ? hs[0].properties.id || hs[0].properties.mid : null);
  };
  // ---------------- grey map for the dark look ----------------
  const GREY = { ground: '#2c3038', land: '#31363f', green: '#30383a', water: '#1e242e', building: '#3d434e', road: '#6f7787', minor: '#575e6b', path: '#4b515d', casing: '#23272e', rail: '#565c68', border: '#8c93a4', other: '#474d58', text: '#d5d9e2', halo: '#1b1f26' };
  function greyFor(l) { // which grey a base layer gets, from what it draws
    const s = (l['source-layer'] || '') + ' ' + l.id;
    if (/water/.test(s)) return GREY.water; if (/building/.test(s)) return GREY.building; if (/park|landcover|wood|grass|forest|cemetery|pitch/.test(s)) return GREY.green;
    if (l.type === 'line') { if (/boundary/.test(s)) return GREY.border; if (/casing/.test(s)) return GREY.casing; if (/rail|transit/.test(s)) return GREY.rail; if (/path|track|pedestrian|footway/.test(s)) return GREY.path; if (/motorway|trunk|primary|secondary|tertiary|link/.test(s)) return GREY.road; if (/transportation|road|street|bridge|tunnel|minor|service/.test(s)) return GREY.minor; return GREY.other; }
    return GREY.land;
  }
  const baseOrig = {};
  M.applyTheme = function () {
    if (!map || !M.baseLayerIds) return; const dark = !FT.UI || FT.UI.theme() === 'dark';
    const set = (id, prop, value) => { const k = id + '|' + prop; if (!(k in baseOrig)) baseOrig[k] = map.getPaintProperty(id, prop); map.setPaintProperty(id, prop, dark ? value : baseOrig[k]); };
    M.baseLayerIds.forEach(id => {
      const l = map.getLayer(id) && map.getStyle().layers.find(x => x.id === id); if (!l) return;
      if (l.type === 'background') set(id, 'background-color', GREY.ground);
      else if (l.type === 'fill') { set(id, 'fill-color', greyFor(l)); const k = id + '|fill-pattern'; if (!(k in baseOrig)) baseOrig[k] = map.getPaintProperty(id, 'fill-pattern'); if (baseOrig[k]) set(id, 'fill-opacity', 0.08); set(id, 'fill-outline-color', greyFor(l)); }
      else if (l.type === 'line') set(id, 'line-color', greyFor(l));
      else if (l.type === 'symbol') { set(id, 'text-color', GREY.text); set(id, 'text-halo-color', GREY.halo); set(id, 'icon-opacity', 0.55); }
      else if (l.type === 'raster') { set(id, 'raster-saturation', -1); set(id, 'raster-brightness-max', 0.28); }
    });
    if (map.getLayer('bld-3d')) map.setPaintProperty('bld-3d', 'fill-extrusion-color', ['case', ['==', ['get', 'st'], 1], '#7ad7ff', dark ? '#3e444f' : '#d9d4cb']);
    if (map.getLayer('mask')) map.setPaintProperty('mask', 'fill-opacity', dark ? 0.62 : 0.45);
    M.theme = dark ? 'dark' : 'light';
    ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole', 'splice', 'sub', 'ap', 'cpe', 'ptp'].forEach(t => { if (map.hasImage('i-' + t)) map.updateImage('i-' + t, icon(t, undefined, dark)); });
    const paint = (id, prop, v) => { if (map.getLayer(id)) map.setPaintProperty(id, prop, v); };
    map.getStyle().layers.forEach(l => { if (M.baseLayerIds.includes(l.id) || l.type !== 'symbol' || l.id === 'house-num') return; const k = l.id + '|text-color'; if (!(k in baseOrig)) { baseOrig[k] = map.getPaintProperty(l.id, 'text-color'); baseOrig[l.id + '|text-halo-color'] = map.getPaintProperty(l.id, 'text-halo-color'); } if (baseOrig[k] !== '#07090d') return; paint(l.id, 'text-color', dark ? '#ffffff' : baseOrig[k]); paint(l.id, 'text-halo-color', dark ? '#11141b' : baseOrig[l.id + '|text-halo-color']); });
    paint('pipes-case', 'line-color', dark ? '#e9edf6' : '#07090d'); paint('pipes-case', 'line-opacity', dark ? 0.4 : 0.55);
    ['imp-pt', 'draw-pt', 'bh-vtx'].forEach(id => paint(id, 'circle-stroke-color', dark ? '#ffffff' : '#07090d'));
    if (M.base === '3d') M.render3d();
  };
  M.setBase = function (kind) {
    map.setLayoutProperty('sat', 'visibility', kind === 'sat' ? 'visible' : 'none');
    const vis = kind === 'sat' ? 'none' : 'visible';
    map.getStyle().layers.forEach(l => { if (l.id === 'sat' || /^(mask|gov-line|bld|hov|pipes|cables|nodes|sel|draw|imp|wl|wdev|bh|house|plates|peers|m3d)/.test(l.id)) return; if (l.type === 'background') return; if (l.type === 'symbol' && kind === 'sat') map.setLayoutProperty(l.id, 'visibility', 'visible'); else if (l.type !== 'symbol') map.setLayoutProperty(l.id, 'visibility', vis); });
    if (kind === 'map') { map.jumpTo({ pitch: 0 }); map.setMaxPitch(0); } else { map.setMaxPitch(75); map.easeTo({ pitch: kind === '3d' ? 58 : 0, duration: 600 }); }
    M.base = kind; M.applyBldHidden(); M.flatIcons(); M.render3d(); M.renderPlates(); M.scheduleBuildings();
  };

  // ---------------- buildings (static z14 tiles built by tools/build_tiles.py) ----------------
  const Z = 14;
  const tx = (lon) => Math.floor((lon + 180) / 360 * 2 ** Z);
  const ty = (lat) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** Z);
  M.scheduleBuildings = function () { clearTimeout(refreshTimer); refreshTimer = setTimeout(M.refreshBuildings, 120); };
  M.refreshBuildings = async function () {
    if (!map || map.getZoom() < 14) { M.bldVisible = []; map.getSource('bld').setData(EMPTY); return; }
    const b = map.getBounds(), x0 = tx(b.getWest()), x1 = tx(b.getEast()), y0 = ty(b.getNorth()), y1 = ty(b.getSouth());
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 36) return;
    const need = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + '/' + y; if (!(k in tileCache) && !tileLoading[k]) need.push([x, y, k]); }
    await Promise.all(need.map(async ([x, y, k]) => {
      if (G.FT_TRAIN) { tileCache[k] = []; return; } // the training quarter has its own houses only
      tileLoading[k] = 1;
      try { const r = await fetch(M.tileBase + x + '/' + y + '.json'); tileCache[k] = r.ok ? await r.json() : []; } catch (e) { tileCache[k] = []; }
      delete tileLoading[k];
    }));
    M.rebuildBuildingData(x0, x1, y0, y1);
  };
  M.rebuildBuildingData = function (x0, x1, y0, y1) {
    if (x0 == null) { const b = map.getBounds(); x0 = tx(b.getWest()); x1 = tx(b.getEast()); y0 = ty(b.getNorth()); y1 = ty(b.getSouth()); }
    const feats = [], over = FT.state.bld || {};
    const bb = map.getBounds(), W = bb.getWest() - 0.002, E = bb.getEast() + 0.002, S0 = bb.getSouth() - 0.002, N0 = bb.getNorth() + 0.002;
    const push = (id, h, ring) => {
      const o = over[id] || {}; if (o.deleted) return;
      const fl = o.floors || 0, eh = FT.houses.floorsOf(o) * 3.2;
      feats.push({ type: 'Feature', id: feats.length, properties: { id, eh, h, fl, num: o.num || 0, lab: FT.num ? FT.num.label(o) : '', st: o.st || 0 }, geometry: { type: 'Polygon', coordinates: [ring] } });
    };
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const t = tileCache[x + '/' + y]; if (!t) continue;
      for (const [id, h, flat] of t) {
        if (over[id] && over[id].fp) continue; // edited footprint: drawn from the override below
        const ring = []; for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 1e6, flat[i + 1] / 1e6]); ring.push(ring[0]);
        push(id, h, ring);
      }
    }
    Object.keys(over).forEach(id => { const o = over[id]; if (o.fp && !o.deleted && o.fp[0][0] > W && o.fp[0][0] < E && o.fp[0][1] > S0 && o.fp[0][1] < N0) push(id, 0, o.fp.concat([o.fp[0]])); }); // manually drawn buildings
    M.bldFeats = feats; map.getSource('bld').setData({ type: 'FeatureCollection', features: feats });
    M.rebuildHouses();
  };
  // one marker per building (near its street side) + the houses added by hand; only when zoomed in enough to see them
  M.rebuildHouses = function () {
    if (!map.getSource('houses')) return; const H = FT.houses, over = FT.state.bld || {}, list = []; M._housesWaiting = false;
    if (map.getZoom() >= H.MINZ - 0.2) {
      const bb = map.getBounds(), W = bb.getWest() - 0.002, E = bb.getEast() + 0.002, S0 = bb.getSouth() - 0.002, N0 = bb.getNorth() + 0.002, inView = p => p[0] > W && p[0] < E && p[1] > S0 && p[1] < N0;
      const add = (id, p) => { const o = over[id] || {}; list.push({ type: 'Feature', properties: { id, fl: H.floorsOf(o), lab: FT.num && o.num ? FT.num.label(o) : '', y: p[1] }, geometry: { type: 'Point', coordinates: p } }); };
      (M.bldFeats || []).forEach(f => { const id = f.properties.id, ring = f.geometry.coordinates[0], o = over[id] || {}; if (o.pt || !inView(ring[0])) return; const p = H.autoPoint(id, ring.slice(0, -1)); if (!H.cached(id)) M._housesWaiting = true; add(id, p); });
      for (const id in over) { const o = over[id]; if (!o.deleted && o.pt && inView(o.pt)) add(id, o.pt); }
    }
    M.houseFeats = list; map.getSource('houses').setData({ type: 'FeatureCollection', features: list }); M.render3d(); M.renderPlates();
    M.dropHouseGrid(); if (M._pillKeys != null && M.pillKeys() !== M._pillKeys) M.renderNet(['lod']); // houses arrived or changed under a box: move its ratio rectangle
    if (M._selIds && M._selIds.size) M._selIds.forEach(id => map.setFeatureState({ source: 'houses', id }, { sel: true }));
  };
  // number plates. Flat maps: at the house point. 3D: the plate must hang under the raised model, so its ground point is
  // pushed away from the camera until, on screen, it covers the height of the model's base (exact for the current view).
  M.renderPlates = function () {
    if (!map.getSource('plates')) return; const on3d = M.base === '3d', byId = on3d ? new Map((M.bldFeats || []).map(f => [f.properties.id, f])) : null;
    let cam = null, camH = 0; if (on3d) { const tr = map.transform; if (tr.getCameraLngLat) { cam = tr.getCameraLngLat(); camH = tr.getCameraAltitude(); } }
    const names = new Map(); // 3D only: house id -> the name of the box that stands on it
    if (on3d && !M.hideHouses && !M.netHidden) { const hid = (FT.T && FT.T.hidden) || new Set(); Object.values(FT.state.nodes).forEach(n => { if (!M.onHouses(n) || hid.has(n.id)) return; const id = M.houseUnder(n); if (id) names.set(id, (names.has(id) ? names.get(id) + ' / ' : '') + M.shortName(n)); }); }
    const feats = (M.houseFeats || []).filter(f => f.properties.lab || names.has(f.properties.id)).map(f => {
      let p = f.geometry.coordinates;
      if (on3d && cam) { const b = byId.get(f.properties.id), h = !M.hideBld && b ? b.properties.eh : 0; if (h > 0 && camH > h + 5) { const k = camH / (camH - h); p = [cam.lng + (p[0] - cam.lng) * k, cam.lat + (p[1] - cam.lat) * k]; } }
      return { type: 'Feature', properties: { id: f.properties.id, lab: f.properties.lab || '', nm: names.get(f.properties.id) || '', y: f.properties.y }, geometry: { type: 'Point', coordinates: p } };
    });
    map.getSource('plates').setData({ type: 'FeatureCollection', features: feats });
    map.setLayoutProperty('house-num', 'text-offset', on3d ? [0, 0.15] : [0, -1.45]);
  };
  // the 3D basemap shows real models instead of the flat icons (the number plates stay)
  M.render3d = function () {
    if (!map.getSource('m3d')) return; const on = M.base === '3d' && map.getZoom() >= FT.houses.MINZ - 0.2, out = [];
    if (on) {
      const H = FT.houses, byId = new Map((M.bldFeats || []).map(f => [f.properties.id, f]));
      if (!M.hideHouses) (M.houseFeats || []).forEach(f => { H.houseParts(out, f.properties.id, f.geometry.coordinates, f.properties.fl, H.baseOf(f.properties.id, byId)); }); // raised on top of the drawing while it is shown
      if (!M.netHidden) { const bb = map.getBounds(), W = bb.getWest() - 0.002, E = bb.getEast() + 0.002, S0 = bb.getSouth() - 0.002, N0 = bb.getNorth() + 0.002, hid = (FT.T && FT.T.hidden) || new Set(), hu = (FT.sync && FT.sync.active && FT.sync.hiddenUsers) || new Set();
        Object.values(FT.state.nodes).forEach(n => { const p = n.ll; if (p[0] < W || p[0] > E || p[1] < S0 || p[1] > N0 || hid.has(n.id) || (hu.size && hu.has(n.by || '-'))) return; const hp = n.bld && M.housePoint(n.bld), mine = hp && !M.hideHouses && FT.dist(hp, p) < 2.5; H.nodeParts(out, n, mine ? H.beside(p) : p, mine ? H.baseOf(n.bld, byId) : 0); }); }
    }
    if (!on && !M._had3d) return; M._had3d = on;
    map.getSource('m3d').setData({ type: 'FeatureCollection', features: out });
    if (FT.T && FT.T.sel && on) map.setFeatureState({ source: 'm3d', id: FT.T.sel.id }, { sel: true });
  };
  // where the element names stand: just under the element; in 3D, under the number plate of the house it stands on
  const nameFade = () => M.base === '3d' ? ['case', ['>', ['coalesce', ['get', 'hk'], 0], 0], 0, 1] : 1; // in 3D those names are written by the 'house-name' layer, with the house
  M.flatIcons = function () { if (map.getLayer('nodes')) map.setPaintProperty('nodes', 'text-opacity', nameFade()); const o = M.base === '3d' ? 0 : 1; ['spl-lab'].forEach(i => map.getLayer(i) && map.setLayoutProperty(i, 'visibility', M.base === '3d' ? 'none' : 'visible')); ['house', 'nodes'].forEach(i => map.getLayer(i) && map.setPaintProperty(i, 'icon-opacity', o)); if (map.getLayer('house-sel')) map.setLayoutProperty('house-sel', 'visibility', M.base === '3d' || M.hideHouses ? 'none' : 'visible'); };
  const ringIndex = new Map(); let indexed = new Set();
  M.ringAny = id => { // the drawing of a building, loaded tiles included (open ring)
    const o = (FT.state.bld || {})[id]; if (o && o.fp) return o.fp; const f = M.buildingRing(id); if (f) return f.slice(0, -1);
    for (const k in tileCache) { if (indexed.has(k)) continue; indexed.add(k); for (const t of tileCache[k]) ringIndex.set(t[0], t[2]); }
    const flat = ringIndex.get(id); if (!flat) return null; const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i] / 1e6, flat[i + 1] / 1e6]); return r;
  };
  // THE point of a house = the point of its icon. Numbering, design, exports, reports and checks all use this and nothing else.
  M.housePoint = id => { const o = (FT.state.bld || {})[id]; if (o && o.pt) return o.pt; const f = (M.houseFeats || []).find(f => f.properties.id === id); if (f) return f.geometry.coordinates; const r = M.ringAny(id); return r ? FT.houses.autoPoint(id, r) : ((o && o.ll) || null); };
  // every house the project knows something about, as icon points (for exports and checks)
  M.housesData = function () {
    const S = FT.state, out = [];
    for (const id in S.bld) { const o = S.bld[id]; if (o.deleted || !(o.num || o.fdb || o.house || o.floors || o.name || o.pt)) continue; const ll = M.housePoint(id) || o.ll; if (!ll) continue; out.push({ id, ll, num: o.num ? FT.num.label(o) : '', floors: FT.houses.floorsOf(o), name: o.name || '', fdb: (S.nodes[o.fdb] || {}).code || (S.nodes[o.fdb] || {}).name || '', o }); }
    return out;
  };
  M.buildingAt = function (ll) { // footprint under a lon/lat (from loaded tiles)
    const f = (M.bldFeats || []).find(f => FT.pointInRing(ll, f.geometry.coordinates[0])); return f ? f.properties.id : null;
  };
  M.buildingRing = id => { const f = (M.bldFeats || []).find(f => f.properties.id === id); return f ? f.geometry.coordinates[0] : null; };
  M.buildingsIn = ring => (M.bldFeats || []).filter(f => FT.pointInRing(FT.centroid(f.geometry.coordinates[0]), ring)).map(f => f.properties);
  // load every tile that touches a bbox (for numbering / export outside the current view)
  M.ensureTiles = async function (bb) {
    const x0 = tx(bb[0]), x1 = tx(bb[2]), y0 = ty(bb[3]), y1 = ty(bb[1]), need = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + '/' + y; if (!(k in tileCache)) need.push([x, y, k]); }
    await Promise.all(need.map(async ([x, y, k]) => { if (G.FT_TRAIN) { tileCache[k] = []; return; } try { const r = await fetch(M.tileBase + x + '/' + y + '.json'); tileCache[k] = r.ok ? await r.json() : []; } catch (e) { tileCache[k] = []; } }));
    return { x0, x1, y0, y1 };
  };
  // buildings (id, centroid, ring, props) whose centroid lies in a ring — works for any area, from cache + manual buildings
  M.buildingsInRing = function (ring) {
    const bb = FT.bboxOf(ring), out = [], over = FT.state.bld || {}, seen = new Set(), take = (id, c, r, h, o) => { if (!seen.has(id) && FT.pointInRing(c, ring)) { seen.add(id); out.push({ id, c, ring: r, h, o, house: c }); } };
    const x0 = tx(bb[0]), x1 = tx(bb[2]), y0 = ty(bb[3]), y1 = ty(bb[1]);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const t = tileCache[x + '/' + y]; if (!t) continue;
      for (const [id, h, flat] of t) {
        if ((over[id] || {}).deleted || (over[id] || {}).fp) continue;
        const o = over[id] || {}; if (!o.pt && (flat[0] / 1e6 < bb[0] - 0.002 || flat[0] / 1e6 > bb[2] + 0.002 || flat[1] / 1e6 < bb[1] - 0.002 || flat[1] / 1e6 > bb[3] + 0.002)) continue;
        const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i] / 1e6, flat[i + 1] / 1e6]);
        take(id, o.pt || FT.houses.autoPoint(id, r), r, h, o);
      }
    }
    Object.keys(over).forEach(id => { const o = over[id]; if (o.deleted) return; if (o.fp) take(id, o.pt || FT.houses.autoPoint(id, o.fp), o.fp, 0, o); else if (o.pt) take(id, o.pt, M.ringAny(id) || FT.houses.square(o.pt), 0, o); }); // drawn, hand-added and moved houses
    return out;
  };
  // selection is a feature-state: no GeoJSON reload when you click a building (that reload froze big projects)
  M.setBuildingSelection = set => {
    const prev = M._selIds || new Set(); set = new Set(set); if (!M.ready) { M._selIds = set; return; }
    if (map.getSource('m3d')) { prev.forEach(id => { if (!set.has(id)) map.setFeatureState({ source: 'm3d', id }, { sel: false }); }); set.forEach(id => map.setFeatureState({ source: 'm3d', id }, { sel: true })); }
    if (map.getSource('houses')) { prev.forEach(id => { if (!set.has(id)) map.setFeatureState({ source: 'houses', id }, { sel: false }); }); set.forEach(id => map.setFeatureState({ source: 'houses', id }, { sel: true })); }
    M._selIds = set; M.selB = set;
  };

  // ---------------- network render ----------------
  const CABLE_COL = { Backbone: '#b57bff', Feeder: '#b57bff', Distribution: '#35e0c9', Drop: '#d4ff4a' };
  const NO_BLD = new Set(['move', 'prop', 'add', 'delete', 'order', 'folder', 'import', 'prices', 'reconnect', 'codes', 'splice', 'lod', 'remote-net']); // changes that cannot alter the building layer
  M.renderNet = function (why) { // coalesced: many changes in one frame render once
    (M._why = M._why || []).push(why); if (M._raf) return;
    M._raf = (window.requestAnimationFrame || (f => setTimeout(f, 16)))(() => { M._raf = 0; const w = M._why; M._why = []; M.renderNetNow(w); });
  };
  M.CABLE_MINZ = 17.5; // the cable layer shows from this zoom: 100 px of scale bar <= 70 m. Cables run inside the pipes, so the blue pipe line still shows the route when zoomed out
  M.viewBB = function () { const b = map.getBounds(), w = b.getEast() - b.getWest(), h = b.getNorth() - b.getSouth(); return [b.getWest() - w, b.getSouth() - h, b.getEast() + w, b.getNorth() + h]; }; // the view plus one screen on every side
  const inBB = (p, bb) => p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3];
  const lineIn = (pts, bb) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return !(x1 < bb[0] || x0 > bb[2] || y1 < bb[1] || y0 > bb[3]); };
  M.renderNetNow = function (why) {
    if (!M.ready) return; const S = FT.state, needBld = !why || !why.length || why.some(x => !NO_BLD.has(x));
    // level of detail: pipes are drawn from zoom 15 only, and a hidden network is not rebuilt at all (it refreshes the moment it shows again)
    if (M.netHidden) { M._cablesDirty = M._netDirty = true; if (FT.wl) FT.wl.render(); if (FT.imp) FT.imp.render(); if (needBld && M.rebuildBuildingData && M.bldFeats) M.rebuildBuildingData(); return; }
    const zN = FT.zOrder('nodes'), zP = FT.zOrder('pipes'), zC = FT.zOrder('cables'), showCables = map.getZoom() >= M.CABLE_MINZ, bb = M.viewBB(); M._builtBB = bb;
    M._netDirty = false;
    M.dropHouseGrid(); M._pillKeys = M.pillKeys(); if (M.base === '3d') setTimeout(M.renderPlates, 0);
    const hid = (FT.T && FT.T.hidden) || new Set(), hu = (FT.sync && FT.sync.active && FT.sync.hiddenUsers) || new Set(), shown = o => !hid.has(o.id) && !(hu.size && hu.has(o.by || '-')), nodeList = Object.values(S.nodes).filter(n => shown(n) && inBB(n.ll, bb)), nodeIn = new Set(nodeList.map(n => n.id));
    map.getSource('nodes').setData({ type: 'FeatureCollection', features: nodeList.map(n => ({ type: 'Feature', id: n.id, properties: { id: n.id, type: n.type, name: n.name, rt: M.ratioText(n), hk: M.onHouses(n) ? M.houseKey(n) : 0, lab: M.shortName(n), z: zN[n.id] || 0 }, geometry: { type: 'Point', coordinates: n.ll } })).concat(Object.values(S.splices).filter(sp => nodeIn.has(sp.node) && shown(sp) && FT.isClosure(sp)).map(sp => { const n = S.nodes[sp.node]; return n ? { type: 'Feature', id: sp.id, properties: { id: sp.id, type: 'splice', name: sp.label || '' }, geometry: { type: 'Point', coordinates: [n.ll[0] + 0.00003, n.ll[1] + 0.00003] } } : null; }).filter(Boolean)) });
    map.getSource('pipes').setData({ type: 'FeatureCollection', features: Object.values(S.pipes).filter(p => shown(p) && lineIn(p.pts, bb)).map(p => ({ type: 'Feature', id: p.id, properties: { id: p.id, z: zP[p.id] || 0, color: p.color || null, aerial: p.ptype === 'aerial' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: p.pts } })) });
    if (showCables) { M._cablesDirty = false; map.getSource('cables').setData({ type: 'FeatureCollection', features: Object.values(S.cables).filter(c => shown(c) && ((c.pts && lineIn(c.pts, bb)) || [c.a, c.b].some(i => S.nodes[i] && inBB(S.nodes[i].ll, bb)))).map(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); const g = (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder'; return { type: 'Feature', id: c.id, properties: { id: c.id, z: zC[c.id] || 0, color: c.color || CABLE_COL[g] }, geometry: { type: 'LineString', coordinates: pts.length > 1 ? pts : (c.pts || []) } }; }) }); } else M._cablesDirty = true;
    if (FT.wl) FT.wl.render();
    if (FT.imp) FT.imp.render();
    if (needBld && M.rebuildBuildingData && M.bldFeats) M.rebuildBuildingData(); else M.render3d();
  };
  M.netLayers = () => map.getStyle().layers.filter(l => l.source === 'nodes' || l.source === 'pipes' || l.source === 'cables').map(l => l.id);
  M.setNetHidden = function (v) {
    M.netHidden = !!v; M.netLayers().forEach(id => map.setLayoutProperty(id, 'visibility', v ? 'none' : 'visible'));
    if (!v) { M.renderNetNow(['lod']); M.flatIcons(); } else M.render3d();
    M.renderPlates();
  };
  M.setSelection = function (kind, id) {
    if (map.getSource('m3d')) { if (M._sel3 && M._sel3 !== id) map.setFeatureState({ source: 'm3d', id: M._sel3 }, { sel: false }); M._sel3 = kind === 'node' ? id : null; if (M._sel3) map.setFeatureState({ source: 'm3d', id }, { sel: true }); }
    const S = FT.state; let f = [];
    if (kind === 'wdev' && S.wdev && S.wdev[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: S.wdev[id].ll } }];
    if (kind === 'wlink' && S.wlinks && S.wlinks[id]) { const l = S.wlinks[id], a = S.wdev[l.a], b = S.wdev[l.b]; if (a && b) f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a.ll, b.ll] } }]; }
    if (kind === 'node' && S.nodes[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: S.nodes[id].ll } }];
    if (kind === 'pipe' && S.pipes[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: S.pipes[id].pts } }];
    if (kind === 'cable' && S.cables[id]) { const pts = [].concat(...FT.cableSpans(S.cables[id]).map((s, i) => i ? s.pts.slice(1) : s.pts)); f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]; }
    map.getSource('sel').setData({ type: 'FeatureCollection', features: f });
  };
  M.setBH = function (features) { M.bhData = features || []; if (M.ready) map.getSource('bh').setData({ type: 'FeatureCollection', features: features || [] }); };
  M.setImpVerts = function (features) { M.impvData = features || []; if (M.ready) map.getSource('impv').setData({ type: 'FeatureCollection', features: features || [] }); };
  M.setDraw = function (features) { map.getSource('draw').setData({ type: 'FeatureCollection', features: features || [] }); };
  M.flyTo = (ll, z) => map.flyTo({ center: ll, zoom: z || Math.max(map.getZoom(), 17), duration: 700 });
  M.fitBBox = (bb, minZ) => {
    const o = { padding: 80, maxZoom: 18.5, duration: 700 };
    if (minZ) { const cam = map.cameraForBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 80, maxZoom: 18.5 }); if (cam && cam.zoom < minZ) { map.flyTo({ center: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], zoom: minZ, duration: 700 }); return; } }
    map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], o);
  };
})(window);
