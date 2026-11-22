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
  function icon(type, size) {
    const s = size || 64, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    const col = FT.NODE_TYPES[type] ? FT.NODE_TYPES[type].color : '#9aa1b6';
    g.translate(s / 2, s / 2); g.lineJoin = 'round'; g.lineCap = 'round';
    const ring = (r, fill, stroke, lw) => { g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); };
    const badge = txt => { ring(s * 0.4, col, '#07090d', s * 0.06); g.fillStyle = '#07090d'; g.font = '800 ' + s * 0.3 + 'px IBM Plex Sans Arabic, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, s * 0.02); };
    if (type === 'olt') { // rack unit: rounded box with 3 slots and LEDs
      g.fillStyle = col; g.strokeStyle = '#07090d'; g.lineWidth = s * 0.06; const w = s * 0.7, h = s * 0.74; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, s * 0.12); g.fill(); g.stroke();
      g.fillStyle = '#07090d'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.roundRect(-w * 0.36, i * h * 0.26 - h * 0.08, w * 0.72, h * 0.16, s * 0.03); g.fill(); }
      g.fillStyle = '#eafff4'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(w * 0.24, i * h * 0.26, s * 0.03, 0, 7); g.fill(); }
    } else if (type === 'sk') badge('SK'); else if (type === 'dk') badge('DK'); else if (type === 'bk') badge('BK');
    else if (type === 'mh') { ring(s * 0.36, '#171b25', col, s * 0.07); g.strokeStyle = col; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.2, 0); g.lineTo(s * 0.2, 0); g.moveTo(0, -s * 0.2); g.lineTo(0, s * 0.2); g.stroke(); }
    else if (type === 'pole') { g.strokeStyle = '#07090d'; g.lineWidth = s * 0.2; g.beginPath(); g.moveTo(0, s * 0.4); g.lineTo(0, -s * 0.38); g.moveTo(-s * 0.3, -s * 0.22); g.lineTo(s * 0.3, -s * 0.22); g.stroke(); g.strokeStyle = col; g.lineWidth = s * 0.1; g.beginPath(); g.moveTo(0, s * 0.38); g.lineTo(0, -s * 0.36); g.moveTo(-s * 0.28, -s * 0.22); g.lineTo(s * 0.28, -s * 0.22); g.stroke(); }
    else if (type === 'splice') { ring(s * 0.3, '#ff6a3d', '#07090d', s * 0.06); g.strokeStyle = '#07090d'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.16, -s * 0.16); g.lineTo(s * 0.16, s * 0.16); g.moveTo(s * 0.16, -s * 0.16); g.lineTo(-s * 0.16, s * 0.16); g.stroke(); }
    else if (type === 'sub') { ring(s * 0.28, '#7ad7ff', '#07090d', s * 0.06); }
    else if (type === 'ap' || type === 'cpe' || type === 'ptp') { const wc = { ap: '#35e0c9', cpe: '#ffd24a', ptp: '#b57bff' }[type]; ring(s * 0.2, wc, '#07090d', s * 0.06); g.strokeStyle = wc; g.lineWidth = s * 0.06; for (const r of [0.32, 0.44]) { g.beginPath(); g.arc(0, 0, s * r, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(0, 0, s * r, Math.PI - 0.9, Math.PI + 0.9); g.stroke(); } }
    return g.getImageData(0, 0, s, s);
  }
  M.iconDataURL = function (type, size) { const d = icon(type, size || 64), c = document.createElement('canvas'); c.width = d.width; c.height = d.height; c.getContext('2d').putImageData(d, 0, 0); return c.toDataURL(); };

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
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Buildings © Microsoft (ODbL) · Map data © OpenStreetMap contributors · OpenFreeMap' }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    await new Promise(res => map.on('load', res));
    const layers = map.getStyle().layers;
    if (map.getLayer('building-3d')) map.removeLayer('building-3d'); // OSM 3D replaced by our footprint layer
    const firstSymbol = (layers.find(l => l.type === 'symbol') || {}).id;
    // dim everything outside the governorate
    const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    map.addSource('mask', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [world].concat(BOUND.polygons.map(r => r.slice().reverse())) } } });
    map.addLayer({ id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#07090d', 'fill-opacity': 0.62 } }, firstSymbol);
    map.addSource('gov', { type: 'geojson', data: { type: 'FeatureCollection', features: BOUND.polygons.map(r => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: r }, properties: {} })) } });
    map.addLayer({ id: 'gov-line', type: 'line', source: 'gov', paint: { 'line-color': '#ff6a3d', 'line-width': 2, 'line-dasharray': [3, 2] } }, firstSymbol);
    // satellite (optional)
    map.addSource('sat', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri' });
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } }, M.firstBaseLayerAbove());
    // buildings
    map.addSource('bld', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'bld-3d', type: 'fill-extrusion', source: 'bld', minzoom: 14, paint: {
      'fill-extrusion-color': ['case', ['==', ['get', 'sel'], 1], '#ff8a62', ['>', ['get', 'num'], 0], '#f2b28c', ['==', ['get', 'st'], 1], '#7ad7ff', '#d9d4cb'],
      'fill-extrusion-height': ['get', 'eh'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.94, 'fill-extrusion-vertical-gradient': true } }, firstSymbol);
    map.addLayer({ id: 'bld-num', type: 'symbol', source: 'bld', minzoom: 15.5, filter: ['>', ['get', 'num'], 0],
      layout: { 'text-field': ['get', 'lab'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 15.5, 10, 19, 18], 'text-allow-overlap': true, 'text-pitch-alignment': 'viewport' },
      paint: { 'text-color': '#07090d', 'text-halo-color': '#fff6ee', 'text-halo-width': 2 } });
    // network
    ['pipes', 'cables', 'nodes', 'draw', 'sel', 'wd', 'wl', 'imp'].forEach(s => map.addSource(s, { type: 'geojson', data: EMPTY, promoteId: 'id' }));
    map.addLayer({ id: 'pipes-case', type: 'line', source: 'pipes', paint: { 'line-color': '#07090d', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 18, 8], 'line-opacity': 0.55 } });
    map.addLayer({ id: 'pipes', type: 'line', source: 'pipes', paint: { 'line-color': ['coalesce', ['get', 'color'], '#2aa8ff'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 18, 5], 'line-dasharray': ['case', ['==', ['get', 'aerial'], 1], ['literal', [2, 1.5]], ['literal', [1, 0]]] } });
    map.addLayer({ id: 'cables', type: 'line', source: 'cables', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 18, 3.6], 'line-offset': ['interpolate', ['linear'], ['zoom'], 10, 0, 18, 4] } });
    map.addLayer({ id: 'imp-fill', type: 'fill', source: 'imp', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3bd18b', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'imp-line', type: 'line', source: 'imp', filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']], paint: { 'line-color': '#7ad7ff', 'line-width': 2 } });
    map.addLayer({ id: 'imp-pt', type: 'circle', source: 'imp', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#7ad7ff', 'circle-stroke-color': '#07090d', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'wl-line', type: 'line', source: 'wl', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.2] } });
    map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 18, 11], 'line-opacity': 0.45, 'line-blur': 1.5 } });
    map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#ffd24a', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ff6a3d', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'draw-poly-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#ff8a62', 'line-width': 2.5, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'draw-pt', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#ffd24a', 'circle-stroke-color': '#07090d', 'circle-stroke-width': 2 } });
    ['olt', 'sk', 'dk', 'bk', 'mh', 'pole', 'splice', 'sub', 'ap', 'cpe', 'ptp'].forEach(t => map.addImage('i-' + t, icon(t), { pixelRatio: 2 }));
    map.addLayer({ id: 'wdev', type: 'symbol', source: 'wd', layout: { 'icon-image': ['concat', 'i-', ['get', 'type']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 0.8, 19, 1.15], 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 15.5, ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-optional': true }, paint: { 'text-color': '#07090d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'nodes', type: 'symbol', source: 'nodes', layout: { 'icon-image': ['concat', 'i-', ['get', 'type']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 0.8, 19, 1.15], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'text-field': ['step', ['zoom'], '', 15.5, ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.5], 'text-optional': true }, paint: { 'text-color': '#07090d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'nodes-sel', type: 'circle', source: 'sel', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 20, 'circle-color': 'rgba(255,255,255,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
    map.on('moveend', M.scheduleBuildings); map.on('zoomend', M.scheduleBuildings);
    M.ready = true; M.scheduleBuildings(); M.renderNet();
    FT.onChange(() => M.renderNet());
    return map;
  };
  M.firstBaseLayerAbove = () => { const l = map.getStyle().layers.find(x => x.type === 'line' || x.type === 'symbol'); return l && l.id; };

  // ---------------- basemap switch ----------------
  M.setBase = function (kind) {
    map.setLayoutProperty('sat', 'visibility', kind === 'sat' ? 'visible' : 'none');
    const vis = kind === 'sat' ? 'none' : 'visible';
    map.getStyle().layers.forEach(l => { if (l.id === 'sat' || /^(mask|gov-line|bld|pipes|cables|nodes|sel|draw)/.test(l.id)) return; if (l.type === 'background') return; if (l.type === 'symbol' && kind === 'sat') map.setLayoutProperty(l.id, 'visibility', 'visible'); else if (l.type !== 'symbol') map.setLayoutProperty(l.id, 'visibility', vis); });
    map.easeTo({ pitch: kind === '3d' ? 58 : 0, duration: 600 });
    M.base = kind;
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
      tileLoading[k] = 1;
      try { const r = await fetch(M.tileBase + x + '/' + y + '.json'); tileCache[k] = r.ok ? await r.json() : []; } catch (e) { tileCache[k] = []; }
      delete tileLoading[k];
    }));
    M.rebuildBuildingData(x0, x1, y0, y1);
  };
  M.rebuildBuildingData = function (x0, x1, y0, y1) {
    if (x0 == null) { const b = map.getBounds(); x0 = tx(b.getWest()); x1 = tx(b.getEast()); y0 = ty(b.getNorth()); y1 = ty(b.getSouth()); }
    const feats = [], over = FT.state.bld || {}, selSet = M.selB || new Set();
    const bb = map.getBounds(), W = bb.getWest() - 0.002, E = bb.getEast() + 0.002, S0 = bb.getSouth() - 0.002, N0 = bb.getNorth() + 0.002;
    const push = (id, h, ring) => {
      const o = over[id] || {}; if (o.deleted) return;
      const fl = o.floors || 0, eh = fl ? fl * 3.2 : (h > 0 ? h : 6.4);
      feats.push({ type: 'Feature', id: feats.length, properties: { id, eh, h, fl, num: o.num || 0, lab: FT.num ? FT.num.label(o) : '', st: o.st || 0, sel: selSet.has(id) ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [ring] } });
    };
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const t = tileCache[x + '/' + y]; if (!t) continue;
      for (const [id, h, flat] of t) {
        const ring = []; for (let i = 0; i < flat.length; i += 2) ring.push([flat[i] / 1e6, flat[i + 1] / 1e6]); ring.push(ring[0]);
        push(id, h, ring);
      }
    }
    Object.keys(over).forEach(id => { const o = over[id]; if (o.fp && o.fp[0][0] > W && o.fp[0][0] < E && o.fp[0][1] > S0 && o.fp[0][1] < N0) push(id, 0, o.fp.concat([o.fp[0]])); }); // manually drawn buildings
    M.bldFeats = feats; map.getSource('bld').setData({ type: 'FeatureCollection', features: feats });
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
    await Promise.all(need.map(async ([x, y, k]) => { try { const r = await fetch(M.tileBase + x + '/' + y + '.json'); tileCache[k] = r.ok ? await r.json() : []; } catch (e) { tileCache[k] = []; } }));
    return { x0, x1, y0, y1 };
  };
  // buildings (id, centroid, ring, props) whose centroid lies in a ring — works for any area, from cache + manual buildings
  M.buildingsInRing = function (ring) {
    const bb = FT.bboxOf(ring), out = [], over = FT.state.bld || {};
    const x0 = tx(bb[0]), x1 = tx(bb[2]), y0 = ty(bb[3]), y1 = ty(bb[1]);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const t = tileCache[x + '/' + y]; if (!t) continue;
      for (const [id, h, flat] of t) {
        if ((over[id] || {}).deleted) continue;
        const r = []; for (let i = 0; i < flat.length; i += 2) r.push([flat[i] / 1e6, flat[i + 1] / 1e6]); const c = FT.centroid(r);
        if (FT.pointInRing(c, ring)) out.push({ id, c, ring: r, h, o: over[id] || {} });
      }
    }
    Object.keys(over).forEach(id => { const o = over[id]; if (o.fp) { const c = FT.centroid(o.fp); if (FT.pointInRing(c, ring)) out.push({ id, c, ring: o.fp, h: 0, o }); } });
    return out;
  };
  M.setBuildingSelection = set => { M.selB = set; M.rebuildBuildingData(); };

  // ---------------- network render ----------------
  const CABLE_COL = { Backbone: '#b57bff', Distribution: '#35e0c9', Drop: '#d4ff4a' };
  M.renderNet = function () {
    if (!M.ready) return; const S = FT.state;
    map.getSource('nodes').setData({ type: 'FeatureCollection', features: Object.values(S.nodes).map(n => ({ type: 'Feature', id: n.id, properties: { id: n.id, type: n.type, name: n.name }, geometry: { type: 'Point', coordinates: n.ll } })).concat(Object.values(S.splices).map(sp => { const n = S.nodes[sp.node]; return n ? { type: 'Feature', id: sp.id, properties: { id: sp.id, type: 'splice', name: sp.label || '' }, geometry: { type: 'Point', coordinates: [n.ll[0] + 0.00003, n.ll[1] + 0.00003] } } : null; }).filter(Boolean)) });
    map.getSource('pipes').setData({ type: 'FeatureCollection', features: Object.values(S.pipes).map(p => ({ type: 'Feature', id: p.id, properties: { id: p.id, color: p.color || null, aerial: p.ptype === 'aerial' ? 1 : 0 }, geometry: { type: 'LineString', coordinates: p.pts } })) });
    map.getSource('cables').setData({ type: 'FeatureCollection', features: Object.values(S.cables).map(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); const g = (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Backbone'; return { type: 'Feature', id: c.id, properties: { id: c.id, color: c.color || CABLE_COL[g] }, geometry: { type: 'LineString', coordinates: pts.length > 1 ? pts : (c.pts || []) } }; }) });
    if (FT.wl) FT.wl.render();
    if (FT.imp) FT.imp.render();
    M.rebuildBuildingData && M.bldFeats && M.rebuildBuildingData();
  };
  M.setSelection = function (kind, id) {
    const S = FT.state; let f = [];
    if (kind === 'wdev' && S.wdev && S.wdev[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: S.wdev[id].ll } }];
    if (kind === 'wlink' && S.wlinks && S.wlinks[id]) { const l = S.wlinks[id], a = S.wdev[l.a], b = S.wdev[l.b]; if (a && b) f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a.ll, b.ll] } }]; }
    if (kind === 'node' && S.nodes[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: S.nodes[id].ll } }];
    if (kind === 'pipe' && S.pipes[id]) f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: S.pipes[id].pts } }];
    if (kind === 'cable' && S.cables[id]) { const pts = [].concat(...FT.cableSpans(S.cables[id]).map((s, i) => i ? s.pts.slice(1) : s.pts)); f = [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]; }
    map.getSource('sel').setData({ type: 'FeatureCollection', features: f });
  };
  M.setDraw = function (features) { map.getSource('draw').setData({ type: 'FeatureCollection', features: features || [] }); };
  M.flyTo = (ll, z) => map.flyTo({ center: ll, zoom: z || Math.max(map.getZoom(), 17), duration: 700 });
  M.fitBBox = bb => map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 80, maxZoom: 18.5, duration: 700 });
})(window);
