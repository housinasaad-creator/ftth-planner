/* Exports: DXF (AutoCAD) with area selection, KMZ, GeoJSON, CSV, JSON, print report. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const X = FT.exp = {};
  const U = () => FT.UI;
  const download = (name, data, mime) => { const b = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  X.download = download;
  const stamp = () => new Date().toISOString().slice(0, 10);

  // ---------------- area ----------------
  X.area = { mode: null, ring: null }; // the area must be chosen every time (never the whole governorate)
  const netBBox = () => { const pts = []; const S = FT.state; Object.values(S.nodes).forEach(n => pts.push(n.ll)); Object.values(S.pipes).forEach(p => p.pts.forEach(q => pts.push(q))); Object.values(S.cables).forEach(c => (c.pts || []).forEach(q => pts.push(q))); return pts.length ? FT.bboxOf(pts) : null; };
  const rectRing = b => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  function currentRing() {
    const a = X.area, S = FT.state;
    if (a.mode === 'view') { const b = FT.map.map.getBounds(); return rectRing([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); }
    if (a.mode === 'draw') return a.ring;
    if (a.mode !== 'all') return null; // nothing chosen yet
    const b = netBBox(); if (!b) return null; const pad = 0.0006; return rectRing([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]);
  }
  X.collect = async function (ring, opt) {
    const S = FT.state, out = { nodes: [], pipes: [], cables: [], splices: [], blds: [] };
    if (!ring) return out;
    const inN = id => { const n = S.nodes[id]; return n && FT.pointInRing(n.ll, ring); };
    Object.values(S.nodes).forEach(n => { if (FT.pointInRing(n.ll, ring)) out.nodes.push(n); });
    Object.values(S.pipes).forEach(p => { if (p.pts.some(q => FT.pointInRing(q, ring)) || inN(p.a) || inN(p.b)) out.pipes.push(p); });
    Object.values(S.cables).forEach(c => { if ((c.nodes || []).some(inN)) out.cables.push(c); });
    Object.values(S.splices).forEach(s => { if (inN(s.node)) out.splices.push(s); });
    if (opt && (opt.bld || opt.nums || opt.houses)) { await FT.map.ensureTiles(FT.bboxOf(ring)); out.blds = FT.map.buildingsInRing(ring); if (out.blds.length > 60000) out.blds = out.blds.slice(0, 60000); }
    return out;
  };

  // ---------------- DXF ----------------
  const BLOCK = { olt: 'FTTH_OLT', sk: 'FTTH_FDC', dk: 'FTTH_IFDC', bk: 'FTTH_FDB', mh: 'FTTH_MH', hh: 'FTTH_HH', pole: 'FTTH_WALL_ANCHOR' };
  const groupOf = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder';
  const cableLayer = c => { const g = groupOf(c); return g === 'Feeder' ? 'FTTH_CABLE_FEEDER' : g === 'Drop' ? 'FTTH_CABLE_DROP' : 'FTTH_CABLE_DISTRIBUTION'; };
  const nm = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '-'; };
  // a label on the longest segment of a line, turned along it and never upside down
  function along(pts, off) {
    let best = 0, len = -1; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (d > len) { len = d; best = i; } }
    const p = pts[best - 1], q = pts[best]; let ang = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const r = ang * Math.PI / 180; return { at: [(p[0] + q[0]) / 2 - Math.sin(r) * off, (p[1] + q[1]) / 2 + Math.cos(r) * off], rot: ang, len };
  }
  function table(add, x, top, u, title, cols, rows) { // a ruled table made of real lines and text (editable); returns its size
    const rh = 5 * u, W = cols.reduce((t, c) => t + c[1] * u, 0), n = rows.length + 1;
    add({ layer: 'SHEET_TEXT', kind: 'text', pts: [[x, top + 2.5 * u]], h: 3.2 * u, text: title });
    for (let i = 0; i <= n; i++) add({ layer: 'SCHEDULES', kind: 'line', pts: [[x, top - i * rh], [x + W, top - i * rh]] });
    let cx = x; cols.concat([['', 0]]).forEach(c => { add({ layer: 'SCHEDULES', kind: 'line', pts: [[cx, top], [cx, top - n * rh]] }); cx += c[1] * u; });
    [cols.map(c => c[0])].concat(rows).forEach((row, i) => { let tx = x; row.forEach((v, k) => { add({ layer: 'SCHEDULES', kind: 'text', pts: [[tx + 1.2 * u, top - i * rh - 3.5 * u]], h: (i ? 2 : 2.2) * u, text: String(v == null ? '' : v) }); tx += cols[k][1] * u; }); });
    return { w: W, h: n * rh };
  }
  function sheet(add, ents, data, opt, ring) {
    const S = FT.state; let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    ents.forEach(e => (e.pts || []).forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    if (x0 > x1) return;
    const u = Math.max(0.8, Math.min(8, Math.max(x1 - x0, y1 - y0) / 360)), m = 12 * u, px = x1 + m, PW = 120 * u;
    const text = (x, y, h, str, layer) => add({ layer: layer || 'SHEET_TEXT', kind: 'text', pts: [[x, y]], h: h * u, text: str });
    const box = (ax, ay, bx, by, layer) => add({ layer: layer || 'SHEET', kind: 'poly', closed: true, pts: [[ax, ay], [bx, ay], [bx, by], [ax, by]] });
    let y = y1;
    // title block
    box(px, y - 34 * u, px + PW, y);
    text(px + 3 * u, y - 7 * u, 4.6, 'FTTH NETWORK PLAN');
    text(px + 3 * u, y - 13.5 * u, 3.4, S.meta.name || 'Project');
    [['Date', stamp()], ['Coordinates', 'WGS 84 / UTM zone 37N (EPSG:32637)'], ['Units', 'metres, 1:1 model space'], ['Drawn with', 'FTTH Planner']].forEach((r, i) => { text(px + 3 * u, y - (19 + i * 4.2) * u, 2.1, r[0]); text(px + 34 * u, y - (19 + i * 4.2) * u, 2.1, r[1]); });
    y -= 40 * u;
    // legend: real symbols and real line layers
    const syms = [['FTTH_OLT', 'FTTH_OLT', 'OLT - central office', 0.8], ['FTTH_FDC', 'FTTH_FDC', 'FDC - distribution cabinet (stage 1)', 1], ['FTTH_IFDC', 'FTTH_IFDC', 'iFDC - intermediate cabinet', 1], ['FTTH_FDB', 'FTTH_FDB', 'FDB - building box (stage 2)', 1.5], ['FTTH_MH', 'FTTH_MH', 'MH - manhole', 1.5], ['FTTH_HH', 'FTTH_HH', 'HH - handhole', 2], ['FTTH_WALL_ANCHOR', 'FTTH_WALL_ANCHOR', 'WA - wall anchor (aerial)', 1.6], ['FTTH_SPLICE', 'FTTH_SPLICE', 'Splice closure', 1.6], ['FTTH_SUBSCRIBER', 'FTTH_SUBSCRIBER', 'Subscriber (ONU)', 2.4], ['FTTH_HOUSE', 'HOUSES', 'House (attributes: number, floors, FDB)', 1.1]];
    const lines = [['FTTH_CABLE_FEEDER', 'Feeder cable'], ['FTTH_CABLE_DISTRIBUTION', 'Distribution cable'], ['FTTH_CABLE_DROP', 'Drop cable'], ['FTTH_DUCT', 'Buried duct / micro-trench'], ['FTTH_DUCT_AERIAL', 'Aerial route on walls'], ['BUILDINGS', 'Building footprint'], ['ROADS', 'Road']];
    const lh = 6.6 * u, legendH = (syms.length + lines.length) * lh + 10 * u;
    box(px, y - legendH, px + PW, y); text(px + 3 * u, y - 6 * u, 3.2, 'LEGEND'); let ly = y - 12.5 * u;
    syms.forEach(v => { add({ layer: v[1], kind: 'insert', name: v[0], pts: [[px + 10 * u, ly]], scale: v[3] * u * 0.62, noAttrs: true }); text(px + 22 * u, ly - 1.1 * u, 2.3, v[2]); ly -= lh; });
    lines.forEach(v => { add({ layer: v[0], kind: 'line', pts: [[px + 4 * u, ly], [px + 17 * u, ly]] }); text(px + 22 * u, ly - 1.1 * u, 2.3, v[1]); ly -= lh; });
    y -= legendH + 8 * u;
    // quantities
    const inA = new Set(data.nodes.map(n => n.id)), len = c => FT.cableLength(c), sum = a => a.reduce((t, v) => t + v, 0), count = t => data.nodes.filter(n => n.type === t).length;
    const spl = {}; data.nodes.forEach(n => { if (n.ratio) spl[n.ratio] = (spl[n.ratio] || 0) + (n.nsplit || 1); });
    const q = [['Houses in the drawing', opt.houses ? data.blds.length : '-'], ['OLT', count('olt')], ['FDC cabinets', count('sk')], ['iFDC cabinets', count('dk')], ['FDB boxes', count('bk')], ['Manholes / handholes', count('mh') + ' / ' + count('hh')], ['Wall anchors', count('pole')]]
      .concat(Object.keys(spl).sort().map(r => ['Splitters ' + r, spl[r]]))
      .concat(['Feeder', 'Distribution', 'Drop'].map(g => [g + ' cable (m)', sum(data.cables.filter(c => groupOf(c) === g).map(len)).toFixed(0)]))
      .concat([['Duct / trench route (m)', sum(data.pipes.map(p => FT.pathLen(p.pts))).toFixed(0)], ['Fusion splices', sum([...inA].map(id => FT.fiber.links(id).filter(l => !l.b.t && l.a.o == null && l.b.o == null).length))], ['Subscribers', Object.values(S.subs).filter(s => inA.has(s.node)).length]]);
    const t = table(add, px, y - 6 * u, u, 'QUANTITIES', [['Item', 78], ['Quantity', 42]], q); y -= t.h + 14 * u;
    // north arrow and scale bar
    add({ layer: 'SHEET', kind: 'insert', name: 'NORTH_ARROW', pts: [[px + 16 * u, y - 20 * u]], scale: u });
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000], L = nice.filter(v => v <= Math.max(10, 70 * u)).pop() || 10, sx = px + 38 * u, sy = y - 22 * u;
    for (let i = 0; i < 4; i++) { box(sx + i * L / 4, sy, sx + (i + 1) * L / 4, sy + (i % 2 ? 1.2 : 2.4) * u); }
    text(sx, sy - 4 * u, 2.2, '0'); text(sx + L - 4 * u, sy - 4 * u, 2.2, L + ' m'); text(sx, sy + 5 * u, 2.2, 'SCALE BAR');
    const panelBottom = y - 36 * u;
    // schedules under the drawing
    let top = Math.min(y0, panelBottom) - m, sheetRight = px + PW, bottom = top;
    const A = FT.fiber.analyze(), boxes = A.boxes.filter(r => r.node.type === 'bk' && inA.has(r.node.id)).sort((p, r) => nm(p.node.id).localeCompare(nm(r.node.id), undefined, { numeric: true }));
    const wide = Math.max(px + PW - x0, 620 * u);
    const blocks = (title, cols, rows, per) => { if (!rows.length) return; const tw = cols.reduce((t, c) => t + c[1] * u, 0); let cx = x0, tallest = 0; for (let i = 0; i < rows.length; i += per) { if (cx > x0 && cx + tw > x0 + wide) { top -= tallest + 14 * u; cx = x0; tallest = 0; } const r = table(add, cx, top - 6 * u, u, title + (rows.length > per ? ' (' + (i / per + 1) + ')' : ''), cols, rows.slice(i, i + per)); cx += r.w + 10 * u; tallest = Math.max(tallest, r.h); sheetRight = Math.max(sheetRight, cx); } top -= tallest + 18 * u; bottom = top; };
    blocks('FDB SCHEDULE', [['Code', 58], ['Splitter', 18], ['Building', 24], ['OLT', 20], ['PON', 12], ['Path (m)', 20], ['Loss (dB)', 20], ['Rx down (dBm)', 28], ['Rx up (dBm)', 26], ['Status', 18]],
      boxes.map(r => [nm(r.node.id), r.splitter.ratio, r.node.label || '', r.reached ? nm(r.olt) : '-', r.reached ? r.port : '-', r.budget ? r.budget.fibreM.toFixed(0) : '-', r.budget ? r.budget.down.total.toFixed(2) : '-', r.budget ? r.budget.down.rx.toFixed(2) : '-', r.budget ? r.budget.up.rx.toFixed(2) : '-', !r.reached ? 'BROKEN' : r.budget.status === 'bad' ? 'OVER' : r.issues.length ? 'CHECK' : 'OK']), 60);
    blocks('CABLE SCHEDULE', [['Cable', 76], ['Type', 28], ['Fibres', 16], ['Used', 14], ['From', 52], ['To', 52], ['Length (m)', 24]],
      data.cables.slice().sort((p, r) => String(p.name).localeCompare(String(r.name), undefined, { numeric: true })).map(c => { let used = 0; for (let f = 1; f <= c.core; f++) if (A.ix.used[c.id + ':' + f]) used++; return [c.name, groupOf(c), c.core, used, nm(c.a), c.sub && S.subs[c.sub] ? S.subs[c.sub].name : nm(c.b), len(c).toFixed(0)]; }), 60);
    const joins = []; data.nodes.slice().sort((p, r) => nm(p.id).localeCompare(nm(r.id), undefined, { numeric: true })).forEach(n => { FT.fiber.links(n.id).forEach(l => { const end = e => !e ? '' : e.t ? 'terminated' : e.o != null ? 'PON ' + e.o : e.s != null ? 'splitter ' + (FT.fiber.splitter(e.s) || { ratio: '?', i: '?' }).ratio + ' #' + String(e.s).split('#').pop() + (e.p ? ' out ' + e.p : ' in') : ((S.cables[e.c] || {}).name || '?') + ' / ' + FT.fiber.strandName(S.cables[e.c], e.f); joins.push([nm(n.id), end(l.a), end(l.b)]); }); });
    blocks('SPLICE PLAN', [['Node', 58], ['From', 100], ['To', 100]], joins, 90);
    box(x0 - m, bottom, Math.max(sheetRight, px + PW) + m, y1 + m); box(x0 - m - 2 * u, bottom - 2 * u, Math.max(sheetRight, px + PW) + m + 2 * u, y1 + m + 2 * u);
  }
  X.buildDxf = function (data, ring, opt) {
    const S = FT.state, P = ll => FT.dxf.utm(ll[1], ll[0], 37), ents = [], add = e => ents.push(e);
    const A = FT.fiber.analyze(), boxRow = {}; A.boxes.forEach(r => { if (!boxRow[r.node.id]) boxRow[r.node.id] = r; });
    if (opt.frame) add({ layer: 'AREA_FRAME', kind: 'poly', closed: true, pts: ring.map(P) });
    if (opt.bld) data.blds.forEach(b => { if (b.ring && b.ring.length > 2) add({ layer: 'BUILDINGS', kind: 'poly', closed: true, pts: b.ring.map(P) }); });
    if (data.roads) data.roads.forEach(r => { const pts = r.pts.map(P); add({ layer: 'ROADS', kind: 'poly', pts }); if (opt.rname && r.name && pts.length > 1) { const w = along(pts, 1); add({ layer: 'ROAD_NAMES', kind: 'text', pts: [w.at], rot: w.rot, h: 2.5, text: r.name, centred: true }); } });
    // houses: one editable block each (number, floors, name and serving box travel as attributes)
    if (opt.houses) data.blds.forEach(b => { const o = b.o || {}, at = b.house || FT.map.housePoint(b.id) || b.c; if (!at) return; let hp = P(at); if (data.nodes.some(n => n.type === 'bk' && FT.dist(n.ll, at) < 3)) hp = [hp[0], hp[1] + 4.6]; add({ layer: 'HOUSES', kind: 'insert', name: 'FTTH_HOUSE', pts: [hp], attrs: { NUM: opt.nums && o.num ? FT.num.label(o) : '', FLOORS: FT.houses.floorsOf(o), NAME: o.name || '', FDB: o.fdb && S.nodes[o.fdb] ? nm(o.fdb) : '' }, attrLayers: { NUM: 'HOUSE_NUMBERS' } }); });
    else if (opt.nums) data.blds.forEach(b => { const o = b.o || {}; if (o.num) add({ layer: 'HOUSE_NUMBERS', kind: 'text', pts: [P(b.house || b.c)], h: 2, text: FT.num.label(o), centred: true }); });
    if (opt.pipes) data.pipes.forEach(p => { const pts = p.pts.map(P), aerial = p.ptype === 'aerial'; add({ layer: aerial ? 'FTTH_DUCT_AERIAL' : 'FTTH_DUCT', kind: 'poly', pts }); if (opt.text && pts.length > 1) { const w = along(pts, -2.4); if (w.len > 14) { const cat = FT.PIPE_CAT.find(x => x.id === p.cat); add({ layer: 'LABELS_DUCTS', kind: 'text', pts: [w.at], rot: w.rot, h: 1.5, centred: true, text: ((p.qty || 1) > 1 ? p.qty + 'x ' : '') + (({ h32: 'HDPE 32', h40: 'HDPE 40', h50: 'HDPE 50', aer: 'AERIAL', mc12: 'MD 12w', mc7: 'MD 7w', md2: 'MD 2w' })[p.cat] || p.ptype) + ' - ' + FT.pathLen(p.pts).toFixed(0) + ' m' }); } } });
    if (opt.cables) data.cables.forEach(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)).map(P); if (pts.length < 2) return; add({ layer: cableLayer(c), kind: 'poly', pts }); if (opt.text && groupOf(c) !== 'Drop') { const feeder = groupOf(c) === 'Feeder'; let tail = pts; if (!feeder) { let k = pts.length - 1, run = 0; while (k > 0 && run < 22) { run += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); k--; } tail = pts.slice(k); } const w = along(tail, 1.5); add({ layer: 'LABELS_CABLES', kind: 'text', pts: [w.at], rot: w.rot, h: feeder ? 2 : 1.1, centred: true, text: (feeder ? 'FEEDER ' : '') + c.core + 'F  ' + FT.cableLength(c).toFixed(0) + ' m' }); } });
    if (opt.nodes) data.nodes.forEach(n => {
      const name = BLOCK[n.type]; if (!name) return;
      const r = boxRow[n.id], at = { CODE: opt.text ? (n.code || n.name) : '', NOTE: n.note || n.label || '' };
      if (n.type === 'olt') at.PON_USED = 'PON used: ' + FT.fiber.usedPon(n.id).length;
      if (n.ratio) at.SPLITTER = opt.text ? ((n.nsplit || 1) > 1 ? (n.nsplit + ' x ') : '') + n.ratio : '';
      if (n.type === 'sk' || n.type === 'dk') { let used = 0, all = 0; FT.fiber.splittersOf(n.id).forEach(sp => { all += sp.n; for (let p = 1; p <= sp.n; p++) if (FT.fiber.busy(n.id, { s: sp.key, p })) used++; }); at.OUTPUTS = used + ' / ' + all; }
      if (n.type === 'bk') { at.BUILDING = n.label || ''; if (r && r.budget) { at.LOSS_DB = r.budget.down.total.toFixed(2); at.RX_DBM = r.budget.down.rx.toFixed(2); at.PON = r.port; } }
      add({ layer: name, kind: 'insert', name, pts: [P(n.ll)], attrs: at });
    });
    if (opt.splices) data.splices.forEach(s => { const n = S.nodes[s.node]; if (!n || !FT.isClosure(s)) return; const c = P(n.ll); add({ layer: 'FTTH_SPLICE', kind: 'insert', name: 'FTTH_SPLICE', pts: [[c[0], c[1] - 5]], attrs: { LABEL: s.label || ('EK ' + nm(n.id)), FUSIONS: FT.fiber.recordLinks(s).length } }); });
    if (opt.nodes) { const inA = new Set(data.nodes.map(n => n.id)); Object.values(S.subs).forEach(sub => { if (!inA.has(sub.node) || !sub.ll) return; const c = P(sub.ll); add({ layer: 'FTTH_SUBSCRIBER', kind: 'insert', name: 'FTTH_SUBSCRIBER', pts: [[c[0] + 3.4, c[1] - 1]], attrs: { NAME: sub.name, PORT: sub.port, ADDRESS: sub.addr || '', SUB_NO: sub.subno || '' } }); }); }
    if (opt.sheet) sheet(add, ents.slice(), data, opt, ring);
    return FT.dxf.build(ents);
  };

  // roads for the "drawing + map" option (OpenStreetMap via Overpass, only for the chosen area)
  X.OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  X.fetchRoads = async function (bb) {
    const q = '[out:json][timeout:40];way["highway"](' + bb[1] + ',' + bb[0] + ',' + bb[3] + ',' + bb[2] + ');out geom;';
    for (const url of X.OVERPASS) {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 15000);
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ac.signal }); if (!r.ok) continue;
        const j = await r.json(); return { source: 'osm', roads: (j.elements || []).filter(e => e.geometry && e.geometry.length > 1).map(e => ({ pts: e.geometry.map(p => [p.lon, p.lat]), name: (e.tags && (e.tags['name:ar'] || e.tags.name)) || '', hw: e.tags && e.tags.highway })) };
      } catch (err) { /* try the next mirror */ } finally { clearTimeout(tm); }
    }
    // all mirrors down: use the road lines of the map tiles already loaded (same OpenStreetMap data, limited to what the map has drawn)
    const out = [], seen = new Set();
    (FT.map.map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }) || []).forEach(f => {
      if (!f.geometry || f.properties.class === 'rail' || f.properties.class === 'ferry') return;
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      lines.forEach(c => { if (c.length < 2) return; const key = c[0].join(',') + '|' + c[c.length - 1].join(','); if (seen.has(key)) return; seen.add(key); out.push({ pts: c, name: f.properties['name:ar'] || f.properties.name || '', hw: f.properties.class }); });
    });
    return { source: 'tiles', roads: out };
  };

  X.openDxf = function () {
    const t = FT.t, st = X.dxfOpt = X.dxfOpt || { content: 'drawing', cables: 1, pipes: 1, nodes: 1, splices: 1, text: 1, frame: 1, houses: 1, sheet: 1, bld: 1, roads: 1, rname: 0, nums: 1 };
    const ready = () => !!currentRing();
    const areaOn = k => (k === 'rect' ? X.area.mode === 'draw' && X.area.rect : k === 'draw' ? X.area.mode === 'draw' && !X.area.rect : X.area.mode === k);
    const body = () => {
      const withMap = st.content === 'map';
      const chk = (k, l, dis) => '<div class="fl"><input type="checkbox" data-k="' + k + '" ' + (st[k] ? 'checked' : '') + (dis ? ' disabled' : '') + '><span' + (dis ? ' style="opacity:.4"' : '') + '>' + t(l) + '</span></div>';
      return '<div class="f"><label>1 · ' + t('dxf_area') + '</label><div class="seg" id="dxArea">' +
        [['draw', 'dxf_poly'], ['rect', 'dxf_rect'], ['view', 'dxf_view'], ['all', 'dxf_all']].map(([k, l]) => '<button data-m="' + k + '" class="' + (areaOn(k) ? 'on' : '') + '">' + t(l) + '</button>').join('') + '</div>' +
        '<div class="d" style="margin-top:6px" id="dxCnt">' + (ready() ? '' : '⚠ ' + t('dxf_hint')) + '</div></div>' +
        '<div class="f"><label>2 · ' + t('dxf_content') + '</label><div class="seg" id="dxContent"><button data-c="drawing" class="' + (!withMap ? 'on' : '') + '">' + t('dxf_only') + '</button><button data-c="map" class="' + (withMap ? 'on' : '') + '">' + t('dxf_withmap') + '</button></div></div>' +
        '<div class="two"><div class="f"><label>' + t('dxf_layers') + '</label>' + chk('cables', 'dxf_cables') + chk('pipes', 'dxf_pipes') + chk('nodes', 'dxf_nodes') + chk('splices', 'dxf_splices') + chk('text', 'dxf_text') + chk('frame', 'dxf_frame') + chk('houses', 'dxf_houses') + chk('sheet', 'dxf_sheet') + '</div>' +
        '<div class="f"><label>' + t('dxf_mapitems') + '</label>' + chk('bld', 'dxf_bld', !withMap) + chk('roads', 'dxf_roads', !withMap) + chk('rname', 'dxf_rname', !withMap) + '<label style="margin-top:8px">' + t('dxf_numbers') + '</label>' + chk('nums', 'dxf_nums') + '</div></div>' +
        '<div class="kv"><span>' + t('dxf_crs') + '</span><b>' + t('dxf_crs_d') + '</b></div>';
    };
    const redraw = () => { U().modal(t('dxf_title'), body(), [{ label: t('close') }, { label: t('dxf_go'), cls: 'pri', id: 'dxGo', keep: true, fn: go }], wire); };
    redraw();
    async function refresh() {
      const ring = currentRing(), box = document.getElementById('dxCnt'), btn = document.getElementById('dxGo'); if (!box) return;
      if (btn) btn.disabled = !ring;
      if (!ring) { box.textContent = '⚠ ' + t('dxf_hint'); return; }
      const km2 = FT.ringArea(ring) / 1e6, d = await X.collect(ring, { bld: st.content === 'map' && st.bld, nums: st.nums });
      box.innerHTML = '<b>' + (d.nodes.length + d.pipes.length + d.cables.length + d.splices.length) + '</b> ' + t('dxf_count') + ((st.content === 'map' && st.bld) || st.nums ? ' · ' + d.blds.length + ' ' + t('bld_n') : '') + ' · ' + FT.lt(km2.toFixed(2) + ' km²') + (km2 > 25 && st.content === 'map' && st.roads ? ' <span style="color:var(--warn)">· ' + t('dxf_big') + '</span>' : '');
    }
    function wire(root) {
      root.querySelectorAll('#dxArea button').forEach(b => b.onclick = () => {
        const m = b.dataset.m;
        if (m === 'draw' || m === 'rect') { U().closeModal(); FT.T.setTool('dxfarea', { rect: m === 'rect' }); FT.T.shapeCB = ring => { X.area = { mode: 'draw', ring, rect: m === 'rect' }; X.openDxf(); }; U().hint(t('dxf_hint')); return; }
        X.area = { mode: m, ring: null }; redraw();
      });
      root.querySelectorAll('#dxContent button').forEach(b => b.onclick = () => { st.content = b.dataset.c; redraw(); });
      root.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { st[i.dataset.k] = i.checked ? 1 : 0; refresh(); });
      refresh();
    }
    async function go() {
      const ring = currentRing(); if (!ring) { U().toast(t('dxf_hint')); return; }
      const btn = document.getElementById('dxGo'), old = btn.textContent; btn.disabled = true; btn.textContent = '...';
      try {
        const withMap = st.content === 'map', d = await X.collect(ring, { bld: withMap && st.bld, nums: st.nums, houses: st.houses });
        if (withMap && st.roads) { try { const rr = await X.fetchRoads(FT.bboxOf(ring)); d.roads = rr.roads.filter(r => r.pts.some(p => FT.pointInRing(p, ring))); if (rr.source === 'tiles') U().toast(FT.lang === 'ar' ? 'خدمة الطرق مشغولة — صُدّرت الطرق الظاهرة على الخريطة فقط' : 'Roads service busy — exported the roads currently loaded on the map'); } catch (e) { U().toast('Roads unavailable - exported without roads'); d.roads = []; } }
        if (!(d.nodes.length + d.pipes.length + d.cables.length + (d.blds || []).length + (d.roads || []).length)) { U().toast(t('dxf_none')); return; }
        const dxf = X.buildDxf(d, ring, Object.assign({}, st, { bld: withMap && st.bld })); download('ftth_homs_' + stamp() + '.dxf', dxf, 'application/dxf'); U().toast(t('toast_saved'));
      } finally { btn.disabled = false; btn.textContent = old; }
    }
  };

  // ---------------- GeoJSON ----------------
  X.geojson = function () {
    const S = FT.state, f = [];
    Object.values(S.nodes).forEach(n => f.push({ type: 'Feature', properties: { kind: 'node', type: n.type, name: n.name, code: n.code || '', ratio: n.ratio, label: n.label }, geometry: { type: 'Point', coordinates: n.ll } }));
    Object.values(S.pipes).forEach(p => f.push({ type: 'Feature', properties: { kind: 'pipe', name: p.name, length_m: +FT.pathLen(p.pts).toFixed(2), cat: p.cat }, geometry: { type: 'LineString', coordinates: p.pts } }));
    Object.values(S.cables).forEach(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); f.push({ type: 'Feature', properties: { kind: 'cable', name: c.name, core: c.core, std: c.std, length_m: +FT.cableLength(c).toFixed(2) }, geometry: { type: 'LineString', coordinates: pts } }); });
    FT.map.housesData().forEach(h => f.push({ type: 'Feature', properties: { kind: 'house', id: h.id, number: h.num, floors: h.floors, fdb: h.fdb, name: h.name }, geometry: { type: 'Point', coordinates: h.ll } }));
    Object.entries(S.bld).forEach(([id, o]) => { if (o.fp && !o.deleted) f.push({ type: 'Feature', properties: { kind: 'building_drawing', id }, geometry: { type: 'Polygon', coordinates: [o.fp.concat([o.fp[0]])] } }); });
    download('ftth_network_' + stamp() + '.geojson', JSON.stringify({ type: 'FeatureCollection', features: f }), 'application/geo+json');
  };

  // ---------------- KMZ (own minimal ZIP writer, stored) ----------------
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zipOne(name, bytes) {
    const nm = new TextEncoder().encode(name), crc = crc32(bytes), n = bytes.length;
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, nm.length, true);
    const off = 30 + nm.length + n, end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, 46 + nm.length, true); end.setUint32(16, off, true);
    return new Blob([lh, nm, bytes, ch, nm, end], { type: 'application/vnd.google-earth.kmz' });
  }
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  X.kml = function () {
    const S = FT.state, ln = pts => pts.map(p => p[0] + ',' + p[1] + ',0').join(' ');
    let k = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(S.meta.name || 'FTTH') + '</name>' +
      '<Style id="p"><LineStyle><color>ffffa82a</color><width>3</width></LineStyle></Style><Style id="c"><LineStyle><color>ffffd035</color><width>3</width></LineStyle></Style>';
    k += '<Folder><name>Nodes</name>' + Object.values(S.nodes).map(n => '<Placemark><name>' + esc(n.name) + '</name><description>' + esc(n.type.toUpperCase() + (n.ratio ? ' ' + n.ratio : '')) + '</description><Point><coordinates>' + n.ll[0] + ',' + n.ll[1] + ',0</coordinates></Point></Placemark>').join('') + '</Folder>';
    k += '<Folder><name>Pipes</name>' + Object.values(S.pipes).map(p => '<Placemark><name>' + esc(p.name) + '</name><styleUrl>#p</styleUrl><LineString><coordinates>' + ln(p.pts) + '</coordinates></LineString></Placemark>').join('') + '</Folder>';
    k += '<Folder><name>Cables</name>' + Object.values(S.cables).map(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); return '<Placemark><name>' + esc(c.name) + '</name><description>' + esc(c.core + 'C ' + c.std + ' · ' + FT.fmtLen(FT.cableLength(c))) + '</description><styleUrl>#c</styleUrl><LineString><coordinates>' + ln(pts) + '</coordinates></LineString></Placemark>'; }).join('') + '</Folder>';
    k += '<Folder><name>Numbered houses</name>' + FT.map.housesData().filter(h => h.num).map(h => '<Placemark><name>' + esc(h.num) + '</name><Point><coordinates>' + h.ll[0] + ',' + h.ll[1] + ',0</coordinates></Point></Placemark>').join('') + '</Folder>';
    return k + '</Document></kml>';
  };
  X.zipOne = zipOne; X.kmz = function () { if (FT.kmzPro) FT.kmzPro.open(); else FT.deliver.kmz(); };

  // ---------------- CSV / JSON / print ----------------
  X.csv = function (rows) { return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); };
  X.reportCsv = function (scope) { const c = FT.cost(scope), hp = FT.hasPrices(), rows = [hp ? ['type', 'item', 'qty', 'unit', 'unit_price_' + FT.cur().toLowerCase(), 'total_' + FT.cur().toLowerCase()] : ['type', 'item', 'qty', 'unit']].concat(c.lines.map(r => hp ? [r.kind, r.name, r.unit === 'm' ? r.qty.toFixed(2) : r.qty, r.unit, r.price, r.total.toFixed(2)] : [r.kind, r.name, r.unit === 'm' ? r.qty.toFixed(2) : r.qty, r.unit])).concat(hp ? [['', 'TOTAL', '', '', '', c.total.toFixed(2)]] : []); download('ftth_report_' + stamp() + '.csv', X.csv(rows), 'text/csv;charset=utf-8'); };
  X.saveJson = function () { download('ftth_project_' + stamp() + '.json', JSON.stringify(FT.state), 'application/json'); };
  X.print = function (scope) { if (FT.rep) return FT.rep.open(scope, null);
    const c = FT.cost(scope), w = window.open('', '_blank'); if (!w) { U().toast('Allow pop-ups'); return; }
    const m = v => FT.moneyPlain(v);
    w.document.write('<!doctype html><meta charset="utf-8"><title>FTTH report</title><style>body{font:14px Segoe UI,Arial;padding:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px 9px;text-align:left}th{background:#eee}td.r{text-align:right}</style><h1>' + esc(FT.state.meta.name || 'FTTH Planner') + ' — ' + stamp() + '</h1><table><tr><th>Item</th><th>Qty</th>' + (FT.hasPrices() ? '<th>Unit price</th><th>Total (' + FT.cur() + ')</th>' : '') + '</tr>' + c.lines.map(r => '<tr><td>' + esc(r.name) + '</td><td class="r">' + (r.unit === 'm' ? r.qty.toFixed(1) + ' m' : r.qty) + '</td>' + (FT.hasPrices() ? '<td class="r">' + m(r.price) + (r.unit === 'm' ? '/m' : '') + '</td><td class="r">' + m(r.total) + '</td>' : '') + '</tr>').join('') + (FT.hasPrices() ? '<tr><th colspan="3" style="text-align:right">TOTAL</th><th class="r">' + m(c.total) + '</th></tr>' : '') + '</table>');
    w.document.close(); setTimeout(() => w.print(), 400);
  };
})(window);
