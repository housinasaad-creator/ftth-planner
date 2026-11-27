/* Deliverables required by the ST specification: GeoPackage (QGIS) with one layer per element, KML/KMZ 2.2, LLD / BOM CSV,
   100 m trench cross-sections, OTDR test template, and a printable delivery pack (SOC + HLD + LLD + BOM). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const DV = FT.deliver = {};
  const U = () => FT.UI, ar = () => FT.lang === 'ar';
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const stamp = () => new Date().toISOString().slice(0, 10);
  const pname = () => (FT.state.meta.name || 'FTTH').replace(/[^\w؀-ۿ-]+/g, '_');
  const group = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder';
  const GCOL = { Feeder: '#b57bff', Distribution: '#35e0c9', Drop: '#d4ff4a' };
  const cablePts = c => [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts));
  const SHORT = { olt: 'OLT', sk: 'FDC', dk: 'iFDC', bk: 'FDB', mh: 'MH', hh: 'HH', pole: 'WA' };

  // ---------------- ZIP with several files (stored) ----------------
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  DV.zip = function (files) { // [{name, bytes}]
    const parts = [], cen = []; let off = 0;
    files.forEach(f => {
      const nm = new TextEncoder().encode(f.name), crc = crc32(f.bytes), n = f.bytes.length;
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nm.length, true);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      parts.push(lh, nm, f.bytes); cen.push(ch, nm); off += 30 + nm.length + n;
    });
    let cl = 0; cen.forEach(p => { cl += p.byteLength != null ? p.byteLength : p.length; });
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cl, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [end]), { type: 'application/zip' });
  };
  const utf8 = s => new TextEncoder().encode(s);
  const csv = rows => '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  function openHtml(title, body) {
    const dir = ar() ? 'rtl' : 'ltr', html = '<!doctype html><html dir="' + dir + '" lang="' + FT.lang + '"><meta charset="utf-8"><title>' + esc(title) + '</title><style>.card svg{width:170px;max-width:100%;display:block;margin:auto}@page{size:A4;margin:14mm}body{font:13px "Segoe UI",Tahoma,Arial;color:#111;margin:22px}h1{font-size:21px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 6px;border-bottom:2px solid #ff6a3d;padding-bottom:3px}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #bbb;padding:4px 7px;text-align:start;vertical-align:top}th{background:#eee}.ok{color:#0a7a4b;font-weight:700}.bad{color:#c4163b;font-weight:700}.warn{color:#a86b00;font-weight:700}.mu{color:#666}.no-print{margin-bottom:10px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}.card{border:1px solid #bbb;border-radius:6px;padding:5px;font-size:11px;break-inside:avoid}@media print{.no-print{display:none}}</style><div class="no-print"><button onclick="window.print()" style="padding:8px 16px;font-size:14px">' + (ar() ? 'طباعة / حفظ PDF' : 'Print / Save as PDF') + '</button></div>' + body;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), w = window.open(url, '_blank'); if (!w) U().toast(ar() ? 'اسمح بالنوافذ المنبثقة' : 'Allow pop-ups'); return url;
  }
  DV.lastHtml = null;

  // ---------------- KML / KMZ 2.2 ----------------
  const kc = hex => 'ff' + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);
  DV.kml = function () {
    const S = FT.state, ln = pts => pts.map(p => p[0] + ',' + p[1] + ',0').join(' ');
    const data = o => '<ExtendedData>' + Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => '<Data name="' + k + '"><value>' + esc(v) + '</value></Data>').join('') + '</ExtendedData>';
    let k = '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + esc(S.meta.name || 'FTTH') + '</name>';
    Object.entries(GCOL).forEach(([g, c]) => { k += '<Style id="cab_' + g + '"><LineStyle><color>' + kc(c) + '</color><width>' + (g === 'Drop' ? 2 : 3.5) + '</width></LineStyle></Style>'; });
    k += '<Style id="pipe_u"><LineStyle><color>' + kc('#2aa8ff') + '</color><width>2.5</width></LineStyle></Style><Style id="pipe_a"><LineStyle><color>' + kc('#ffc233') + '</color><width>2.5</width></LineStyle></Style>';
    Object.entries(FT.NODE_TYPES).forEach(([t, d]) => { k += '<Style id="pt_' + t + '"><IconStyle><color>' + kc(d.color) + '</color><scale>0.75</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>'; });
    Object.keys(FT.NODE_TYPES).forEach(t => { const arr = Object.values(S.nodes).filter(n => n.type === t); if (!arr.length) return;
      k += '<Folder><name>' + SHORT[t] + ' (' + arr.length + ')</name>' + arr.map(n => '<Placemark><name>' + esc(n.code || n.name) + '</name><styleUrl>#pt_' + t + '</styleUrl>' + data({ type: SHORT[t], name: n.name, code: n.code, ratio: n.ratio, place: n.place, label: n.label }) + '<Point><coordinates>' + n.ll[0] + ',' + n.ll[1] + ',0</coordinates></Point></Placemark>').join('') + '</Folder>'; });
    [['Feeder', 'Cables · Feeder'], ['Distribution', 'Cables · Distribution'], ['Drop', 'Cables · Drop']].forEach(([g, title]) => { const arr = Object.values(S.cables).filter(c => group(c) === g); if (!arr.length) return;
      k += '<Folder><name>' + title + ' (' + arr.length + ')</name>' + arr.map(c => '<Placemark><name>' + esc(c.name) + '</name><styleUrl>#cab_' + g + '</styleUrl>' + data({ cores: c.core, fibre: c.std, length_m: FT.cableLength(c).toFixed(1) }) + '<LineString><tessellate>1</tessellate><coordinates>' + ln(cablePts(c)) + '</coordinates></LineString></Placemark>').join('') + '</Folder>'; });
    [['u', 'Pipes · underground', p => p.ptype !== 'aerial'], ['a', 'Pipes · aerial (walls)', p => p.ptype === 'aerial']].forEach(([id, title, fn]) => { const arr = Object.values(S.pipes).filter(fn); if (!arr.length) return;
      k += '<Folder><name>' + title + ' (' + arr.length + ')</name>' + arr.map(p => '<Placemark><name>' + esc(p.name) + '</name><styleUrl>#pipe_' + id + '</styleUrl>' + data({ cat: p.cat, length_m: FT.pathLen(p.pts).toFixed(1), depth_cm: p.depth, width_cm: p.width }) + '<LineString><tessellate>1</tessellate><coordinates>' + ln(p.pts) + '</coordinates></LineString></Placemark>').join('') + '</Folder>'; });
    const hs = FT.map.housesData();
    if (hs.length) k += '<Folder><name>Houses (' + hs.length + ')</name>' + hs.map(h => '<Placemark><name>' + esc(h.num || h.name || 'house') + '</name>' + data({ number: h.num, floors: h.floors, fdb: h.fdb, name: h.name }) + '<Point><coordinates>' + h.ll[0] + ',' + h.ll[1] + ',0</coordinates></Point></Placemark>').join('') + '</Folder>';
    const bl = Object.entries(S.bld).filter(([, o]) => o.fp && !o.deleted);
    if (bl.length) k += '<Folder><name>Building drawings (' + bl.length + ')</name>' + bl.map(([id, o]) => '<Placemark><name>' + esc(id) + '</name><Polygon><outerBoundaryIs><LinearRing><coordinates>' + ln(o.fp.concat([o.fp[0]])) + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>').join('') + '</Folder>';
    return k + '</Document></kml>';
  };
  DV.kmz = function () { FT.exp.download('ftth_' + pname() + '_' + stamp() + '.kmz', FT.exp.zipOne('doc.kml', utf8(DV.kml()))); };

  // ---------------- GeoPackage ----------------
  DV.layers = function () {
    const S = FT.state, L = [];
    const nodeCols = [['code', 'TEXT'], ['name', 'TEXT'], ['label', 'TEXT'], ['ratio', 'TEXT'], ['place', 'TEXT'], ['cat', 'TEXT'], ['color', 'TEXT']];
    const NAME = { olt: 'OLT', sk: 'FDC', dk: 'iFDC', bk: 'FDB', mh: 'MH', hh: 'HH', pole: 'WA_wall_anchor' };
    Object.keys(NAME).forEach(t => { const arr = Object.values(S.nodes).filter(n => n.type === t); if (arr.length) L.push({ name: NAME[t], type: 'POINT', cols: nodeCols, rows: arr.map(n => ({ g: { t: 'Point', c: n.ll }, v: [n.code || '', n.name, n.label || '', n.ratio || '', n.place || '', n.cat || '', FT.NODE_TYPES[t].color] })) }); });
    const cabCols = [['name', 'TEXT'], ['cores', 'INTEGER'], ['fibre', 'TEXT'], ['length_m', 'REAL'], ['color', 'TEXT']];
    ['Feeder', 'Distribution', 'Drop'].forEach(g => { const arr = Object.values(S.cables).filter(c => group(c) === g); if (arr.length) L.push({ name: 'cable_' + g.toLowerCase(), type: 'LINESTRING', cols: cabCols, rows: arr.map(c => ({ g: { t: 'LineString', c: cablePts(c) }, v: [c.name, c.core, c.std, +FT.cableLength(c).toFixed(2), c.color || GCOL[g]] })) }); });
    const pipeCols = [['name', 'TEXT'], ['cat', 'TEXT'], ['length_m', 'REAL'], ['depth_cm', 'REAL'], ['width_cm', 'REAL'], ['cover_cm', 'REAL'], ['color', 'TEXT']];
    [['pipe_underground', p => p.ptype !== 'aerial', '#2aa8ff'], ['pipe_aerial_wall', p => p.ptype === 'aerial', '#ffc233']].forEach(([n, fn, col]) => { const arr = Object.values(S.pipes).filter(fn); if (arr.length) L.push({ name: n, type: 'LINESTRING', cols: pipeCols, rows: arr.map(p => ({ g: { t: 'LineString', c: p.pts }, v: [p.name, p.cat, +FT.pathLen(p.pts).toFixed(2), p.depth == null ? 30 : p.depth, p.width == null ? 6 : p.width, p.cover == null ? 24 : p.cover, p.color || col] })) }); });
    const bl = Object.entries(S.bld).filter(([, o]) => o.fp && !o.deleted && o.fp.length > 2);
    if (bl.length) L.push({ name: 'buildings', type: 'POLYGON', cols: [['number', 'TEXT'], ['floors', 'INTEGER'], ['name', 'TEXT'], ['fdb', 'TEXT']], rows: bl.map(([id, o]) => ({ g: { t: 'Polygon', c: [o.fp.concat([o.fp[0]])] }, v: [FT.num.label(o), o.floors || 0, o.name || '', (S.nodes[o.fdb] || {}).code || ''] })) });
    const hn = FT.map.housesData();
    if (hn.length) L.push({ name: 'house_numbers', type: 'POINT', cols: [['number', 'TEXT'], ['floors', 'INTEGER'], ['fdb', 'TEXT'], ['name', 'TEXT']], rows: hn.map(h => ({ g: { t: 'Point', c: h.ll }, v: [h.num, h.floors, h.fdb, h.name] })) });
    return L;
  };
  function wkb(g) {
    const b = []; const u8 = v => b.push(v), u32 = v => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, v, true); for (let i = 0; i < 4; i++) b.push(d.getUint8(i)); }, f64 = v => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v, true); for (let i = 0; i < 8; i++) b.push(d.getUint8(i)); };
    u8(1);
    if (g.t === 'Point') { u32(1); f64(g.c[0]); f64(g.c[1]); }
    else if (g.t === 'LineString') { u32(2); u32(g.c.length); g.c.forEach(p => { f64(p[0]); f64(p[1]); }); }
    else { u32(3); u32(g.c.length); g.c.forEach(r => { u32(r.length); r.forEach(p => { f64(p[0]); f64(p[1]); }); }); }
    const head = new Uint8Array(8), dv = new DataView(head.buffer); head[0] = 0x47; head[1] = 0x50; head[2] = 0; head[3] = 1; dv.setInt32(4, 4326, true); // GP, version 0, little-endian, no envelope, EPSG:4326
    const out = new Uint8Array(8 + b.length); out.set(head); out.set(b, 8); return out;
  }
  const bboxOfGeom = g => (g.t === 'Point' ? [g.c] : g.t === 'LineString' ? g.c : g.c[0]);
  function loadSql() {
    if (G.__SQL) return Promise.resolve(G.__SQL);
    return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'vendor/sql-wasm.js'; sc.onload = () => G.initSqlJs({ locateFile: f => 'vendor/' + f }).then(S => { G.__SQL = S; res(S); }, rej); sc.onerror = () => rej(new Error('sql.js not found')); document.head.appendChild(sc); });
  }
  DV.gpkgBytes = async function () {
    const SQL = await loadSql(), db = new SQL.Database(), L = DV.layers();
    db.run("PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;");
    db.run("CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);");
    const WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES ('WGS 84 geodetic', 4326, 'EPSG', 4326, ?, 'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid'), ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'), ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system');", [WKT]);
    db.run("CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));");
    db.run("CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));");
    L.forEach(l => {
      db.run('CREATE TABLE "' + l.name + '" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom ' + l.type + ', ' + l.cols.map(c => '"' + c[0] + '" ' + c[1]).join(', ') + ');');
      const st = db.prepare('INSERT INTO "' + l.name + '" (geom, ' + l.cols.map(c => '"' + c[0] + '"').join(', ') + ') VALUES (?' + ', ?'.repeat(l.cols.length) + ')'); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      l.rows.forEach(r => { bboxOfGeom(r.g).forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }); st.run([wkb(r.g)].concat(r.v)); }); st.free();
      db.run("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?, 'features', ?, ?, ?, ?, ?, ?, 4326)", [l.name, l.name, 'FTTH Planner · ' + (FT.state.meta.name || ''), x0, y0, x1, y1]);
      db.run("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, 4326, 0, 0)", [l.name, l.type]);
    });
    const out = db.export(); db.close(); return out;
  };
  DV.gpkg = async function () {
    try { if (!DV.layers().length) { U().toast(FT.t('dxf_none')); return; } const b = await DV.gpkgBytes(); FT.exp.download('ftth_' + pname() + '_' + stamp() + '.gpkg', new Blob([b], { type: 'application/geopackage+sqlite3' })); U().toast('GeoPackage ✓ · ' + DV.layers().length + ' ' + (ar() ? 'طبقة' : 'layers')); }
    catch (e) { U().toast('GeoPackage: ' + e.message); }
  };

  // ---------------- LLD: boxes + fibre (core) allocation ----------------
  // every joint of the network, the side that comes from the exchange first
  DV.coreRows = function () {
    const S = FT.state, F = FT.fiber, adj = FT.spec.graph(), trees = Object.values(S.nodes).filter(n => n.type === 'olt').map(o => FT.spec.tree(o.id, adj));
    const far = id => Math.min(Infinity, ...trees.map(t => t.dist[id] == null ? Infinity : t.dist[id]));
    const rank = (e, node) => {
      if (e.o != null) return 0;
      if (e.s != null) return e.p > 0 ? 1 : 3;
      if (e.t) return 5;
      const c = S.cables[e.c], here = far(node); // a cable that leads closer to the exchange is the feeding side
      return c && (c.nodes || []).some(n => n !== node && far(n) < here) ? 2 : 4;
    };
    const side = e => {
      if (e.o != null) return ['OLT PON port', String(e.o), ''];
      if (e.t) return ['TERMINATED', '', ''];
      if (e.s != null) { const sp = F.splitter(e.s); return ['splitter ' + (sp ? sp.ratio : '?') + ' #' + String(e.s).split('#').pop(), e.p ? 'OUT ' + e.p : 'IN', '']; }
      const c = S.cables[e.c]; return [c ? c.name : '?', c ? F.strandName(c, e.f) : String(e.f), String(e.f)];
    };
    const rows = [];
    Object.values(S.nodes).sort((p, q) => String(p.code || p.name).localeCompare(String(q.code || q.name), undefined, { numeric: true })).forEach(n => {
      F.links(n.id).map(l => rank(l.a, n.id) <= rank(l.b, n.id) ? [l.a, l.b] : [l.b, l.a]).forEach(([x, y]) => {
        const i = side(x), o = side(y); rows.push([n.code || n.name, SHORT[n.type], i[0], i[1], i[2], o[0], o[1], o[2]]);
      });
    });
    return [['node', 'node_type', 'from', 'from_core', 'from_core_no', 'to', 'to_core', 'to_core_no']].concat(rows);
  };

  DV.lldFiles = function () {
    const S = FT.state, rows = FT.spec.analyze(), nm = id => (S.nodes[id] || {}).code || (S.nodes[id] || {}).name || '';
    const boxes = [['code', 'name', 'building', 'lat', 'lon', 'splitter', 'from_OLT', 'path_km', 'split_1:N', 'stages', 'loss_dB', 'rx_dBm']].concat(rows.map(r => { const n = r.node; return [n.code, n.name, n.label, n.ll[1].toFixed(6), n.ll[0].toFixed(6), n.ratio, r.fed ? r.olt.name : 'NOT CONNECTED', r.fed ? r.km.toFixed(3) : '', r.fed ? r.split : '', r.fed ? r.stages : '', r.fed ? r.loss.toFixed(2) : '', r.fed ? r.rx.toFixed(1) : '']; }));
    const cores = DV.coreRows();
    return [{ name: 'LLD_boxes_FDB.csv', bytes: utf8(csv(boxes)) }, { name: 'LLD_core_allocation.csv', bytes: utf8(csv(cores)) }];
  };
  DV.lldCsv = function () { FT.exp.download('ftth_LLD_' + pname() + '_' + stamp() + '.zip', DV.zip(DV.lldFiles())); U().toast('LLD ✓'); };

  // ---------------- 100 m trench cross-sections ----------------
  DV.sectionSvg = function (depth, width, cover, nWays, px) {
    const k = px || 4, D = Math.max(12, depth), Wd = Math.max(3, width), W = 60 * k * 0.5 + Wd * k, Hh = D * k + 26, tx = (W - Wd * k) / 2, ok = cover >= FT.LIMITS.minCover && depth <= FT.LIMITS.trenchDepth && width <= FT.LIMITS.trenchWidth;
    const y = c => 6 + c * k; let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff">';
    s += '<rect x="0" y="6" width="' + W + '" height="' + (D * k + 6) + '" fill="#e9e3d6"/>'; // ground
    s += '<rect x="0" y="6" width="' + W + '" height="' + 10 * k + '" fill="#444"/>'; // road asphalt
    s += '<rect x="' + tx + '" y="' + y(0) + '" width="' + Wd * k + '" height="' + 10 * k + '" fill="#2b2b2b"/>'; // trench asphalt cap 10 cm
    const dTop = cover, dh = 4, sand2 = D - (dTop + dh);
    s += '<rect x="' + tx + '" y="' + y(10) + '" width="' + Wd * k + '" height="' + Math.max(0, (dTop - 7) - 10) * k + '" fill="#a9a9a9"/>'; // fluid concrete
    s += '<rect x="' + tx + '" y="' + y(Math.max(10, dTop - 7)) + '" width="' + Wd * k + '" height="' + (7 - 0) * k + '" fill="#e8c77a"/>'; // sand 70 mm
    s += '<rect x="' + tx + '" y="' + y(dTop - 1) + '" width="' + Wd * k + '" height="' + 0.5 * k + '" fill="#ff7a00"/>'; // orange warning tape
    s += '<rect x="' + tx + '" y="' + y(dTop) + '" width="' + Wd * k + '" height="' + dh * k + '" rx="3" fill="#2a8bd8"/>'; // microduct bundle
    for (let i = 0; i < Math.min(nWays, 4); i++) s += '<circle cx="' + (tx + (i + 0.5) * Wd * k / Math.max(1, Math.min(nWays, 4))) + '" cy="' + (y(dTop) + dh * k / 2) + '" r="' + Math.min(dh * k / 2 - 1, Wd * k / 8) + '" fill="#fff" opacity=".8"/>';
    s += '<rect x="' + tx + '" y="' + y(dTop + dh) + '" width="' + Wd * k + '" height="' + Math.max(0, sand2) * k + '" fill="#e8c77a"/>'; // sand 20 mm
    s += '<rect x="' + tx + '" y="' + y(0) + '" width="' + Wd * k + '" height="' + D * k + '" fill="none" stroke="' + (ok ? '#0a7a4b' : '#c4163b') + '" stroke-width="1.6"/>';
    s += '<text x="' + (tx - 3) + '" y="' + (y(D / 2)) + '" font-size="9" text-anchor="end" fill="#111">' + D + '</text><text x="' + (tx + Wd * k / 2) + '" y="' + (y(D) + 11) + '" font-size="9" text-anchor="middle" fill="#111">' + Wd + ' cm</text>';
    return s + '</svg>';
  };
  DV.sections = function () {
    const S = FT.state, pipes = Object.values(S.pipes).filter(p => p.ptype !== 'aerial'), use = {}; Object.values(S.cables).forEach(c => FT.cableSpans(c).forEach(s => { if (s.pipe) (use[s.pipe] = use[s.pipe] || []).push(c); }));
    if (!pipes.length) { U().toast(ar() ? 'لا أنابيب مدفونة في المشروع' : 'No buried pipes in the project'); return; }
    let h = '<h1>' + esc(S.meta.name || 'FTTH') + '</h1><div class="mu">' + (ar() ? 'مقاطع عرضية للخندق كل 100 م — ' : 'Trench cross-sections every 100 m — ') + stamp() + '</div>';
    h += '<h2>' + (ar() ? 'المقطع النموذجي (من أسفل إلى أعلى)' : 'Typical section (bottom to top)') + '</h2><div style="display:flex;gap:18px;align-items:center"><div style="width:190px">' + DV.sectionSvg(30, 6, 24, 4, 5) + '</div><ol style="margin:0"><li>' + (ar() ? 'رمل 20 مم' : 'Sand 20 mm') + '</li><li>' + (ar() ? 'حزمة الأنابيب الدقيقة (حتى 12 مسارًا + مسار احتياطي)' : 'Microduct bundle (max 12 ways + 1 spare)') + '</li><li>' + (ar() ? 'شريط تحذير برتقالي مكتوب عليه «السورية للاتصالات»' : 'Orange warning tape marked “Syrian Telecom”') + '</li><li>' + (ar() ? 'رمل علوي 70 مم' : 'Sand 70 mm') + '</li><li>' + (ar() ? 'خرسانة سائلة' : 'Fluid concrete') + '</li><li>' + (ar() ? 'إسفلت 10 سم' : 'Asphalt 10 cm') + '</li></ol></div>';
    pipes.forEach(p => { const len = FT.pathLen(p.pts), n = Math.floor(len / 100), A = S.nodes[p.a], B = S.nodes[p.b], cs = use[p.id] || [];
      h += '<h2>' + esc(p.name) + ' — ' + esc((A || {}).name || '?') + ' → ' + esc((B || {}).name || '?') + ' · ' + FT.fmtLenShort(len) + '</h2><div class="grid">';
      for (let i = 0; i <= n + (len - n * 100 > 5 ? 1 : 0); i++) { const d = Math.min(len, i * 100), pt = FT.nearestOnPath(p.pts[0], p.pts); let q = p.pts[0], acc = 0; for (let j = 1; j < p.pts.length; j++) { const sl = FT.dist(p.pts[j - 1], p.pts[j]); if (acc + sl >= d) { const t = sl ? (d - acc) / sl : 0; q = [p.pts[j - 1][0] + (p.pts[j][0] - p.pts[j - 1][0]) * t, p.pts[j - 1][1] + (p.pts[j][1] - p.pts[j - 1][1]) * t]; break; } acc += sl; q = p.pts[j]; }
        h += '<div class="card"><b>KP ' + Math.floor(d / 1000) + '+' + String(Math.round(d % 1000)).padStart(3, '0') + '</b>' + DV.sectionSvg(p.depth == null ? 30 : p.depth, p.width == null ? 6 : p.width, p.cover == null ? 24 : p.cover, Math.min(12, p.load || cs.length || 1), 4) + '<div class="mu">' + q[1].toFixed(5) + ', ' + q[0].toFixed(5) + '<br>' + (p.load || cs.length || 0) + ' ' + (ar() ? 'كبل' : 'cable(s)') + ' · ' + esc((FT.PIPE_CAT.find(x => x.id === p.cat) || {}).short || p.cat) + '</div></div>'; }
      h += '</div>'; });
    openHtml('Cross-sections', h);
  };

  // ---------------- OTDR test template (random 20 %) ----------------
  function seeded(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  DV.otdr = function () {
    const rows = FT.spec.analyze().filter(r => r.fed); if (!rows.length) { U().toast(ar() ? 'لا علب FDB موصولة بعد' : 'No connected FDB yet'); return; }
    const rnd = seeded((FT.state.meta.name || 'x') + rows.length), idx = rows.map((r, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).slice(0, Math.max(1, Math.ceil(rows.length * 0.2))).map(x => x[1]), pick = new Set(idx), T = FT.t;
    let h = '<h1>' + esc(FT.state.meta.name || 'FTTH') + ' — OTDR</h1><div class="mu">' + (ar() ? 'اختبار OTDR من طرف إلى طرف (1310 / 1550 نانومتر). العينة العشوائية ≥ 20% من مسارات الألياف معلَّمة ★. الحد الأقصى للفقد 28 dB.' : 'End-to-end OTDR test (1310 / 1550 nm). Random sample ≥ 20 % of the fibre paths is marked ★. Maximum loss 28 dB.') + '</div>';
    h += '<table><tr><th>★</th><th>#</th><th>FDB</th><th>' + (ar() ? 'مبنى' : 'Building') + '</th><th>OLT</th><th>km (' + (ar() ? 'مصمَّم' : 'design') + ')</th><th>dB (' + (ar() ? 'متوقع' : 'expected') + ')</th><th>1310 nm km / dB</th><th>1550 nm km / dB</th><th>' + (ar() ? 'أحداث' : 'Events') + '</th><th>' + (ar() ? 'نتيجة' : 'Result') + '</th></tr>';
    rows.forEach((r, i) => { h += '<tr' + (pick.has(i) ? ' style="background:#fff4d6"' : '') + '><td>' + (pick.has(i) ? '★' : '') + '</td><td>' + (i + 1) + '</td><td>' + esc(r.node.code || r.node.name) + '</td><td>' + esc(r.node.label || '') + '</td><td>' + esc(r.olt.name) + '</td><td>' + r.km.toFixed(2) + '</td><td>' + r.loss.toFixed(1) + '</td><td></td><td></td><td></td><td>☐ PASS ☐ FAIL</td></tr>'; });
    openHtml('OTDR', h + '</table><p class="mu">' + (ar() ? 'التاريخ: ______ · الفني: ______ · جهاز OTDR: ______' : 'Date: ______ · Technician: ______ · OTDR unit: ______') + '</p>');
  };

  // ---------------- delivery pack ----------------
  DV.pack = function () {
    const S = FT.state, soc = FT.spec.soc(), c = FT.cost(null), TT = {}; Object.values(S.nodes).forEach(n => { TT[n.type] = (TT[n.type] || 0) + 1; });
    const len = fn => Object.values(S.cables).filter(fn).reduce((a, k) => a + FT.cableLength(k), 0), plen = fn => Object.values(S.pipes).filter(fn).reduce((a, p) => a + FT.pathLen(p.pts), 0);
    const cls = { ok: 'ok', bad: 'bad', warn: 'warn', na: 'mu' }, T = FT.t;
    let h = '<h1>' + esc(S.meta.name || 'FTTH Planner') + '</h1><div class="mu">' + (ar() ? 'حزمة التسليم وفق مواصفات الشركة السورية للاتصالات — ' : 'Delivery pack to the Syrian Telecom specification — ') + stamp() + '</div>';
    h += '<h2>1 · SOC ' + (ar() ? 'جدول بيان الامتثال' : 'Statement of compliance') + '</h2><table>' + soc.items.map(i => '<tr><td class="' + cls[i.status] + '" style="width:90px">' + esc({ ok: 'Compliant', bad: 'Not Compliant', warn: 'Warning', na: 'Not assessed' }[i.status]) + '</td><td><b>' + esc(ar() ? i.ar : i.en) + '</b><br><span class="mu">' + esc(i.detail) + '</span></td></tr>').join('') + '</table>';
    h += '<h2>2 · HLD ' + (ar() ? 'التصميم عالي المستوى' : 'High-level design') + '</h2><table><tr><th>' + (ar() ? 'العنصر' : 'Item') + '</th><th>' + (ar() ? 'العدد / الطول' : 'Count / length') + '</th></tr>' +
      Object.keys(FT.NODE_TYPES).filter(k => TT[k]).map(k => '<tr><td>' + esc(FT.nodeTypeName(k)) + '</td><td>' + TT[k] + '</td></tr>').join('') +
      ['Feeder', 'Distribution', 'Drop'].map(g => '<tr><td>' + g + ' cables</td><td>' + FT.fmtLenShort(len(k => group(k) === g)) + '</td></tr>').join('') +
      '<tr><td>' + (ar() ? 'أنابيب مدفونة' : 'Buried pipes') + '</td><td>' + FT.fmtLenShort(plen(p => p.ptype !== 'aerial')) + '</td></tr><tr><td>' + (ar() ? 'تعليق جداري' : 'Aerial (walls)') + '</td><td>' + FT.fmtLenShort(plen(p => p.ptype === 'aerial')) + '</td></tr></table>';
    const fed = soc.rows.filter(r => r.fed); if (fed.length) h += '<p>' + (ar() ? 'أسوأ فقد: ' : 'Worst loss: ') + Math.max(...fed.map(r => r.loss)).toFixed(1) + ' dB · ' + (ar() ? 'أسوأ تقسيم: 1:' : 'worst split: 1:') + Math.max(...fed.map(r => r.split)) + '</p>';
    h += '<h2>3 · LLD ' + (ar() ? 'التصميم التفصيلي — العلب' : 'Detailed design — boxes') + '</h2><table><tr><th>' + (ar() ? 'الترميز' : 'Code') + '</th><th>' + (ar() ? 'مبنى' : 'Building') + '</th><th>Lat, Lon</th><th>' + (ar() ? 'مقسّم' : 'Splitter') + '</th><th>km</th><th>1:N</th><th>dB</th></tr>' + soc.rows.map(r => '<tr><td>' + esc(r.node.code || r.node.name) + '</td><td>' + esc(r.node.label || '') + '</td><td>' + r.node.ll[1].toFixed(5) + ', ' + r.node.ll[0].toFixed(5) + '</td><td>' + esc(r.node.ratio || '') + '</td><td>' + (r.fed ? r.km.toFixed(2) : '—') + '</td><td>' + (r.fed ? '1:' + r.split : '—') + '</td><td>' + (r.fed ? r.loss.toFixed(1) : '—') + '</td></tr>').join('') + '</table>';
    h += '<h2>4 · BOM ' + (ar() ? 'جدول الكميات' : 'Bill of materials') + '</h2><table><tr><th>' + T('qty') + '</th><th></th></tr>' + c.lines.map(r => '<tr><td style="white-space:nowrap">' + (r.unit === 'm' ? r.qty.toFixed(1) + ' m' : r.qty) + '</td><td>' + esc(r.name) + '</td></tr>').join('') + '</table>';
    const C = FT.fiber.cfg(), loss = ['1:2', '1:4', '1:8', '1:16'].map(r => r + ' = ' + FT.fiber.splitterLoss(r)).join(ar() ? '، ' : ', ');
    h += '<h2>5 · ' + (ar() ? 'ملاحظات وافتراضات' : 'Notes and assumptions') + '</h2><ul><li>' + (ar()
      ? 'الفقد = ألياف ' + C.att1490 + ' dB/كم نزولاً و ' + C.att1310 + ' صعوداً (يُعتمد الاتجاه الأسوأ) + موصلات SC/APC ' + C.connector + ' dB (' + C.connectors + ' في الطرفين و ' + C.boxConn + ' داخل كل علبة) + لحامات ' + C.fusion + ' dB (' + C.boxSplice + ' بكل علبة و ' + C.holeSplice + ' بكل منهل أو غرفة، أو العدد المرسوم إن كان أكبر) + المقسّمات (' + loss + ' dB) + ' + C.dropM + ' م كبل مشترك مفترض إن لم يكن مرسوماً. طول الليف = المسار المرسوم + ' + C.waste + '% هالك + ' + C.slackEnd + ' م لفّة عند طرفي كل كبل + ' + C.slackHole + ' م بكل غرفة، وكميات الكابلات في جدول الكميات تشمل هذا الاحتياط. قدرة إرسال OLT المعتمدة ' + C.oltTx + ' dBm. (قيم تخطيطية يجب تأكيدها.)'
      : 'Loss = fibre ' + C.att1490 + ' dB/km down and ' + C.att1310 + ' up (the worse direction counts) + SC/APC connectors ' + C.connector + ' dB (' + C.connectors + ' at the ends and ' + C.boxConn + ' in every box) + splices ' + C.fusion + ' dB (' + C.boxSplice + ' per box and ' + C.holeSplice + ' per manhole or handhole, or the drawn number when higher) + splitters (' + loss + ' dB) + ' + C.dropM + ' m of assumed drop when none is drawn. Fibre length = drawn route + ' + C.waste + '% waste + ' + C.slackEnd + ' m loop at both ends of every cable + ' + C.slackHole + ' m per chamber; the cable quantities include this. OLT transmit power used: ' + C.oltTx + ' dBm. (Planning values to be confirmed.)') + '</li><li>' + (ar() ? 'مسارات الكبلات من تخطيط على الخريطة ولم تُقِس موقعيًا؛ المخرجات النهائية (As-Built، OTDR، UDM) تُسلَّم بعد التنفيذ.' : 'Routes come from planning on the map, not from a site survey; final deliverables (As-Built, OTDR, UDM) are produced after construction.') + '</li></ul>';
    openHtml('Delivery pack', h);
  };
})(window);
