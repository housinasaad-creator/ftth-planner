/* Import: KML / KMZ / GeoJSON / DXF (small areas; the DXF needs its coordinate system: UTM 36N/37N or lon/lat). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const I = FT.imp = {};
  const U = () => FT.UI;

  // ---- inverse UTM (Krüger) is in dxf.js: FT.dxf.fromUtm
  const kmlCoords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0])).map(a => [a[0], a[1]]);
  I.parseKml = function (text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml'), feats = [];
    doc.querySelectorAll('Placemark').forEach(pm => {
      const name = (pm.querySelector('name') || {}).textContent || '', props = { name };
      pm.querySelectorAll('Point > coordinates').forEach(c => { const a = kmlCoords(c.textContent)[0]; if (a) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: a } }); });
      pm.querySelectorAll('LineString > coordinates').forEach(c => { const a = kmlCoords(c.textContent); if (a.length > 1) feats.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: a } }); });
      pm.querySelectorAll('Polygon').forEach(pg => { const rings = [...pg.querySelectorAll('coordinates')].map(c => kmlCoords(c.textContent)).filter(r => r.length > 2); if (rings.length) feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } }); });
    });
    return feats;
  };
  async function unzipFirst(buf, ext) { // minimal ZIP reader (central directory) + DecompressionStream
    const v = new DataView(buf), u8 = new Uint8Array(buf); let e = u8.length - 22; while (e > 0 && v.getUint32(e, true) !== 0x06054b50) e--; if (e <= 0) throw new Error('not a zip');
    const n = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.slice(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (name.toLowerCase().endsWith(ext)) { const ln = v.getUint16(off + 26, true), lx = v.getUint16(off + 28, true), data = u8.slice(off + 30 + ln + lx, off + 30 + ln + lx + csize); if (method === 0) return new TextDecoder().decode(data); const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(data); w.close(); return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()); }
    }
    throw new Error('no ' + ext + ' in zip');
  }

  // ---- DXF
  I.parseDxf = function (text, crs) {
    const L = text.split(/\r?\n/), feats = []; const cv = (x, y) => crs === 'll' ? [x, y] : FT.dxf.fromUtm(x, y, crs === 'utm36' ? 36 : 37);
    let i = 0; const pair = () => { const c = parseInt(L[i], 10), v = (L[i + 1] || '').trim(); i += 2; return [c, v]; };
    while (i < L.length && L[i].trim() !== 'ENTITIES') i++; i++;
    let cur = null, layer = '0', poly = null;
    const flush = () => {
      if (!cur) return; const e = cur; cur = null;
      if (e.t === 'LINE' && e.x1 != null) feats.push({ type: 'Feature', properties: { layer: e.layer }, geometry: { type: 'LineString', coordinates: [cv(e.x1, e.y1), cv(e.x2, e.y2)] } });
      else if (e.t === 'LWPOLYLINE' && e.pts.length > 1) { const pts = e.pts.map(p => cv(p[0], p[1])); feats.push({ type: 'Feature', properties: { layer: e.layer }, geometry: e.closed ? { type: 'Polygon', coordinates: [pts.concat([pts[0]])] } : { type: 'LineString', coordinates: pts } }); }
      else if ((e.t === 'TEXT' || e.t === 'MTEXT') && e.x1 != null) feats.push({ type: 'Feature', properties: { layer: e.layer, text: e.text }, geometry: { type: 'Point', coordinates: cv(e.x1, e.y1) } });
      else if ((e.t === 'POINT' || e.t === 'CIRCLE') && e.x1 != null) feats.push({ type: 'Feature', properties: { layer: e.layer }, geometry: { type: 'Point', coordinates: cv(e.x1, e.y1) } });
    };
    while (i < L.length) {
      const [c, v] = pair();
      if (c === 0) { if (v === 'ENDSEC') break; flush(); cur = (['LINE', 'LWPOLYLINE', 'TEXT', 'MTEXT', 'POINT', 'CIRCLE'].includes(v)) ? { t: v, layer: '0', pts: [], closed: false } : null; continue; }
      if (!cur) continue;
      if (c === 8) cur.layer = v; else if (c === 70 && cur.t === 'LWPOLYLINE') cur.closed = (parseInt(v, 10) & 1) === 1;
      else if (cur.t === 'LWPOLYLINE') { if (c === 10) cur.pts.push([parseFloat(v), 0]); else if (c === 20 && cur.pts.length) cur.pts[cur.pts.length - 1][1] = parseFloat(v); }
      else { if (c === 10) cur.x1 = parseFloat(v); else if (c === 20) cur.y1 = parseFloat(v); else if (c === 11) cur.x2 = parseFloat(v); else if (c === 21) cur.y2 = parseFloat(v); else if (c === 1) cur.text = v; }
    }
    flush(); return feats;
  };

  I.add = function (name, feats) {
    if (!feats.length) { U().toast('Nothing to import'); return; } const S = FT.state; S.imports = S.imports || {}; FT.commit();
    const id = FT.uid('i'); feats.forEach((f, k) => { f.properties = Object.assign({}, f.properties, { imp: id }); }); S.imports[id] = { id, name, features: feats.slice(0, 40000) };
    FT.changed('import'); FT.map.fitBBox(FT.bboxOf([].concat(...feats.slice(0, 2000).map(f => f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0])))); U().toast(name + ' · ' + feats.length);
  };
  I.render = function () { const M = FT.map; if (!M.ready) return; const all = []; Object.values(FT.state.imports || {}).forEach(g => { if (!FT.T.hidden.has(g.id)) g.features.forEach(f => all.push(f)); }); M.map.getSource('imp').setData({ type: 'FeatureCollection', features: all }); };
  I.file = async function (f, crs) {
    const n = f.name.toLowerCase();
    try {
      if (n.endsWith('.kmz')) I.add(f.name, I.parseKml(await unzipFirst(await f.arrayBuffer(), '.kml')));
      else if (n.endsWith('.kml')) I.add(f.name, I.parseKml(await f.text()));
      else if (n.endsWith('.dxf')) I.add(f.name, I.parseDxf(await f.text(), crs || 'utm37'));
      else { const j = JSON.parse(await f.text()); if (j.nodes && j.pipes) { FT.commit(); FT.setState(j); U().toast(FT.t('toast_saved')); return; } const fs = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : []; I.add(f.name, fs.filter(x => x.geometry)); }
    } catch (e) { U().toast('Import failed: ' + e.message); }
  };
})(window);
