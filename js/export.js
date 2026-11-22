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
    if (opt && (opt.bld || opt.nums)) { await FT.map.ensureTiles(FT.bboxOf(ring)); out.blds = FT.map.buildingsInRing(ring); if (out.blds.length > 60000) out.blds = out.blds.slice(0, 60000); }
    return out;
  };

  // ---------------- DXF ----------------
  const LAYERS = [
    { name: 'FTTH_CABLE_BACKBONE', color: 6 }, { name: 'FTTH_CABLE_DISTRIBUTION', color: 4 }, { name: 'FTTH_CABLE_DROP', color: 3 },
    { name: 'FTTH_PIPE', color: 5 }, { name: 'FTTH_PIPE_AERIAL', color: 5, ltype: 'DASHED' },
    { name: 'FTTH_OLT', color: 3 }, { name: 'FTTH_SK', color: 30 }, { name: 'FTTH_DK', color: 2 }, { name: 'FTTH_BK', color: 1 }, { name: 'FTTH_MANHOLE', color: 8 }, { name: 'FTTH_POLE', color: 34 },
    { name: 'FTTH_SPLICE', color: 6 }, { name: 'FTTH_LABELS', color: 7 }, { name: 'BUILDINGS', color: 8 }, { name: 'ROADS', color: 9 }, { name: 'ROAD_NAMES', color: 8 }, { name: 'HOUSE_NUMBERS', color: 2 }, { name: 'AREA_FRAME', color: 1 },
  ];
  X.buildDxf = function (data, ring, opt) {
    const P = ll => FT.dxf.utm(ll[1], ll[0], 37), ents = [];
    const add = e => ents.push(e);
    const lay = { olt: 'FTTH_OLT', sk: 'FTTH_SK', dk: 'FTTH_DK', bk: 'FTTH_BK', mh: 'FTTH_MANHOLE', pole: 'FTTH_POLE' };
    if (opt.frame) add({ layer: 'AREA_FRAME', kind: 'poly', closed: true, pts: ring.map(P) });
    if (opt.bld) data.blds.forEach(b => add({ layer: 'BUILDINGS', kind: 'poly', closed: true, pts: b.ring.map(P) }));
    if (data.roads) data.roads.forEach(r => { add({ layer: 'ROADS', kind: 'poly', pts: r.pts.map(P) }); if (opt.rname && r.name) { const m = P(r.pts[Math.floor(r.pts.length / 2)]); add({ layer: 'ROAD_NAMES', kind: 'text', pts: [m], h: 2.5, text: r.name }); } });
    if (opt.nums) data.blds.forEach(b => { const o = b.o || {}; if (o.num) { const c = P(b.c); add({ layer: 'HOUSE_NUMBERS', kind: 'text', pts: [[c[0] - 1.2, c[1] - 1]], h: 2, text: FT.num.label(o) }); } });
    if (opt.pipes) data.pipes.forEach(p => add({ layer: p.ptype === 'aerial' ? 'FTTH_PIPE_AERIAL' : 'FTTH_PIPE', kind: 'poly', pts: p.pts.map(P) }));
    if (opt.cables) data.cables.forEach(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); if (pts.length < 2) return; const g = (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Backbone'; add({ layer: g === 'Backbone' ? 'FTTH_CABLE_BACKBONE' : g === 'Drop' ? 'FTTH_CABLE_DROP' : 'FTTH_CABLE_DISTRIBUTION', kind: 'poly', pts: pts.map(P) }); if (opt.text && pts.length > 1) { const m = P(pts[Math.floor(pts.length / 2)]); add({ layer: 'FTTH_LABELS', kind: 'text', pts: [[m[0] + 2, m[1] + 2]], h: 2.2, text: c.name + ' ' + FT.fmtLenShort(FT.cableLength(c)) }); } });
    if (opt.nodes) data.nodes.forEach(n => {
      const c = P(n.ll), l = lay[n.type] || 'FTTH_LABELS';
      if (n.type === 'olt') add({ layer: l, kind: 'poly', closed: true, pts: [[c[0] - 4, c[1] - 4], [c[0] + 4, c[1] - 4], [c[0] + 4, c[1] + 4], [c[0] - 4, c[1] + 4]] });
      else if (n.type === 'pole') { add({ layer: l, kind: 'line', pts: [[c[0] - 2, c[1]], [c[0] + 2, c[1]]] }); add({ layer: l, kind: 'line', pts: [[c[0], c[1] - 2], [c[0], c[1] + 2]] }); }
      else { add({ layer: l, kind: 'circle', pts: [c], r: n.type === 'mh' ? 1.6 : 3 }); if (n.type === 'mh') { add({ layer: l, kind: 'line', pts: [[c[0] - 1.6, c[1]], [c[0] + 1.6, c[1]]] }); add({ layer: l, kind: 'line', pts: [[c[0], c[1] - 1.6], [c[0], c[1] + 1.6]] }); } }
      if (opt.text) add({ layer: 'FTTH_LABELS', kind: 'text', pts: [[c[0] + 4.5, c[1] + 1]], h: 3, text: n.name + (n.ratio ? ' ' + n.ratio : '') + (n.label ? ' ' + n.label : '') });
    });
    if (opt.splices) data.splices.forEach(s => { const n = FT.state.nodes[s.node]; if (!n) return; const c = P(n.ll); add({ layer: 'FTTH_SPLICE', kind: 'poly', closed: true, pts: [[c[0] - 2, c[1] - 6], [c[0] + 2, c[1] - 6], [c[0] + 2, c[1] - 2], [c[0] - 2, c[1] - 2]] }); if (opt.text) add({ layer: 'FTTH_LABELS', kind: 'text', pts: [[c[0] + 3, c[1] - 6]], h: 2.2, text: 'EK ' + (s.label || '') }); });
    return FT.dxf.build(ents, LAYERS);
  };

  // roads for the "drawing + map" option (OpenStreetMap via Overpass, only for the chosen area)
  X.fetchRoads = async function (bb) {
    const q = '[out:json][timeout:60];way["highway"](' + bb[1] + ',' + bb[0] + ',' + bb[3] + ',' + bb[2] + ');out geom;';
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
    if (!r.ok) throw new Error('overpass ' + r.status);
    const j = await r.json();
    return (j.elements || []).filter(e => e.geometry && e.geometry.length > 1).map(e => ({ pts: e.geometry.map(p => [p.lon, p.lat]), name: (e.tags && (e.tags['name:ar'] || e.tags.name)) || '', hw: e.tags && e.tags.highway }));
  };

  X.openDxf = function () {
    const t = FT.t, st = X.dxfOpt = X.dxfOpt || { content: 'drawing', cables: 1, pipes: 1, nodes: 1, splices: 1, text: 1, frame: 1, bld: 1, roads: 1, rname: 0, nums: 1 };
    const ready = () => !!currentRing();
    const areaOn = k => (k === 'rect' ? X.area.mode === 'draw' && X.area.rect : k === 'draw' ? X.area.mode === 'draw' && !X.area.rect : X.area.mode === k);
    const body = () => {
      const withMap = st.content === 'map';
      const chk = (k, l, dis) => '<div class="fl"><input type="checkbox" data-k="' + k + '" ' + (st[k] ? 'checked' : '') + (dis ? ' disabled' : '') + '><span' + (dis ? ' style="opacity:.4"' : '') + '>' + t(l) + '</span></div>';
      return '<div class="f"><label>1 · ' + t('dxf_area') + '</label><div class="seg" id="dxArea">' +
        [['draw', 'dxf_poly'], ['rect', 'dxf_rect'], ['view', 'dxf_view'], ['all', 'dxf_all']].map(([k, l]) => '<button data-m="' + k + '" class="' + (areaOn(k) ? 'on' : '') + '">' + t(l) + '</button>').join('') + '</div>' +
        '<div class="d" style="margin-top:6px" id="dxCnt">' + (ready() ? '' : '⚠ ' + t('dxf_hint')) + '</div></div>' +
        '<div class="f"><label>2 · ' + t('dxf_content') + '</label><div class="seg" id="dxContent"><button data-c="drawing" class="' + (!withMap ? 'on' : '') + '">' + t('dxf_only') + '</button><button data-c="map" class="' + (withMap ? 'on' : '') + '">' + t('dxf_withmap') + '</button></div></div>' +
        '<div class="two"><div class="f"><label>' + t('dxf_layers') + '</label>' + chk('cables', 'dxf_cables') + chk('pipes', 'dxf_pipes') + chk('nodes', 'dxf_nodes') + chk('splices', 'dxf_splices') + chk('text', 'dxf_text') + chk('frame', 'dxf_frame') + '</div>' +
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
        const withMap = st.content === 'map', d = await X.collect(ring, { bld: withMap && st.bld, nums: st.nums });
        if (withMap && st.roads) { try { d.roads = (await X.fetchRoads(FT.bboxOf(ring))).filter(r => r.pts.some(p => FT.pointInRing(p, ring))); } catch (e) { U().toast('Roads unavailable (offline?) - exported without roads'); d.roads = []; } }
        if (!(d.nodes.length + d.pipes.length + d.cables.length + (d.blds || []).length + (d.roads || []).length)) { U().toast(t('dxf_none')); return; }
        const dxf = X.buildDxf(d, ring, Object.assign({}, st, { bld: withMap && st.bld })); download('ftth_homs_' + stamp() + '.dxf', dxf, 'application/dxf'); U().toast(t('toast_saved'));
      } finally { btn.disabled = false; btn.textContent = old; }
    }
  };

  // ---------------- GeoJSON ----------------
  X.geojson = function () {
    const S = FT.state, f = [];
    Object.values(S.nodes).forEach(n => f.push({ type: 'Feature', properties: { kind: 'node', type: n.type, name: n.name, ratio: n.ratio, label: n.label }, geometry: { type: 'Point', coordinates: n.ll } }));
    Object.values(S.pipes).forEach(p => f.push({ type: 'Feature', properties: { kind: 'pipe', name: p.name, length_m: +FT.pathLen(p.pts).toFixed(2), cat: p.cat }, geometry: { type: 'LineString', coordinates: p.pts } }));
    Object.values(S.cables).forEach(c => { const pts = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); f.push({ type: 'Feature', properties: { kind: 'cable', name: c.name, core: c.core, std: c.std, length_m: +FT.cableLength(c).toFixed(2) }, geometry: { type: 'LineString', coordinates: pts } }); });
    Object.entries(S.bld).forEach(([id, o]) => { if (o.num || o.fp) f.push({ type: 'Feature', properties: { kind: 'building', id, number: FT.num.label(o), floors: o.floors || null }, geometry: o.fp ? { type: 'Polygon', coordinates: [o.fp.concat([o.fp[0]])] } : { type: 'Point', coordinates: [0, 0] } }); });
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
    k += '<Folder><name>Numbered buildings</name>' + Object.entries(S.bld).filter(([, o]) => o.num && o.fp).map(([id, o]) => '<Placemark><name>' + esc(FT.num.label(o)) + '</name><Polygon><outerBoundaryIs><LinearRing><coordinates>' + ln(o.fp.concat([o.fp[0]])) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>').join('') + '</Folder>';
    return k + '</Document></kml>';
  };
  X.kmz = function () { download('ftth_' + stamp() + '.kmz', zipOne('doc.kml', new TextEncoder().encode(X.kml()))); };

  // ---------------- CSV / JSON / print ----------------
  X.csv = function (rows) { return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); };
  X.reportCsv = function (scope) { const c = FT.cost(scope), hp = FT.hasPrices(), rows = [hp ? ['type', 'item', 'qty', 'unit', 'unit_price_usd', 'total_usd'] : ['type', 'item', 'qty', 'unit']].concat(c.lines.map(r => hp ? [r.kind, r.name, r.unit === 'm' ? r.qty.toFixed(2) : r.qty, r.unit, r.price, r.total.toFixed(2)] : [r.kind, r.name, r.unit === 'm' ? r.qty.toFixed(2) : r.qty, r.unit])).concat(hp ? [['', 'TOTAL', '', '', '', c.total.toFixed(2)]] : []); download('ftth_report_' + stamp() + '.csv', X.csv(rows), 'text/csv;charset=utf-8'); };
  X.saveJson = function () { download('ftth_project_' + stamp() + '.json', JSON.stringify(FT.state), 'application/json'); };
  X.print = function (scope) {
    const c = FT.cost(scope), w = window.open('', '_blank'); if (!w) { U().toast('Allow pop-ups'); return; }
    const m = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    w.document.write('<!doctype html><meta charset="utf-8"><title>FTTH report</title><style>body{font:14px Segoe UI,Arial;padding:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px 9px;text-align:left}th{background:#eee}td.r{text-align:right}</style><h1>' + esc(FT.state.meta.name || 'FTTH Planner') + ' — ' + stamp() + '</h1><table><tr><th>Item</th><th>Qty</th>' + (FT.hasPrices() ? '<th>Unit price</th><th>Total (USD)</th>' : '') + '</tr>' + c.lines.map(r => '<tr><td>' + esc(r.name) + '</td><td class="r">' + (r.unit === 'm' ? r.qty.toFixed(1) + ' m' : r.qty) + '</td>' + (FT.hasPrices() ? '<td class="r">' + m(r.price) + (r.unit === 'm' ? '/m' : '') + '</td><td class="r">' + m(r.total) + '</td>' : '') + '</tr>').join('') + (FT.hasPrices() ? '<tr><th colspan="3" style="text-align:right">TOTAL</th><th class="r">' + m(c.total) + '</th></tr>' : '') + '</table>');
    w.document.close(); setTimeout(() => w.print(), 400);
  };
})(window);
