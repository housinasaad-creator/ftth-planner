/* DXF (AutoCAD R2000 / AC1015) writer + WGS84 -> UTM projection. Own code, no dependencies.
   Entities: {layer, kind:'line'|'poly'|'circle'|'text'|'point', pts:[[x,y]...], closed, r, text, h, rot}
   Coordinates are metres (UTM). Usage: FT.dxf.build(entities, layers) -> string */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  // ---- WGS84 -> UTM (Krüger series, accurate to mm in-zone) ----
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, n = f / (2 - f);
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
  const be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
  function zoneOf(lon) { return Math.floor((lon + 180) / 6) + 1; }
  function utm(lat, lon, zone) {
    zone = zone || zoneOf(lon);
    const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180, ph = lat * Math.PI / 180, la = lon * Math.PI / 180 - lam0;
    const e = Math.sqrt(f * (2 - f));
    const t = Math.sinh(Math.atanh(Math.sin(ph)) - e * Math.atanh(e * Math.sin(ph)));
    const xi = Math.atan2(t, Math.cos(la)), eta = Math.atanh(Math.sin(la) / Math.sqrt(1 + t * t));
    let X = eta, Y = xi;
    for (let j = 1; j <= 3; j++) { X += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); Y += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
    return [500000 + k0 * A * X, (lat < 0 ? 10000000 : 0) + k0 * A * Y];
  }

  // inverse: UTM (E,N) -> [lon, lat]
  const dl = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];
  function fromUtm(E, N, zone) {
    const xi = N / (k0 * A), eta = (E - 500000) / (k0 * A); let xp = xi, ep = eta;
    for (let j = 1; j <= 3; j++) { xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)); let phi = chi; for (let j = 1; j <= 3; j++) phi += dl[j - 1] * Math.sin(2 * j * chi);
    const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180, lam = lam0 + Math.atan2(Math.sinh(ep), Math.cos(xp));
    return [lam * 180 / Math.PI, phi * 180 / Math.PI];
  }
  // ---- DXF text helpers ----
  // R2000 has no UTF-8: non-ASCII becomes \U+XXXX (AutoCAD and ezdxf both read this).
  function esc(s) {
    s = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/[\u00B7\u2013\u2014]/g, '-').replace(/\u00D7/g, 'x').replace(/\u2192/g, '->').replace(/[\u2066-\u2069]/g, '');
    let o = '';
    for (const ch of s) { const c = ch.codePointAt(0); o += c < 128 ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); }
    return o;
  }
  const num = v => (Math.round(v * 1000) / 1000).toString();
  // AutoCAD Color Index for our layers
  const ACI = { red: 1, yellow: 2, green: 3, cyan: 4, blue: 5, magenta: 6, white: 7, grey: 8, orange: 30, lime: 80, brown: 34 };

  // Entities: {layer, kind:'line'|'poly'|'circle'|'text'|'point'|'insert', pts:[[x,y]...], closed, r, text, h, rot, centred,
  //            name, scale, attrs:{TAG: value}}. Everything is appended to the complete AutoCAD skeleton, so the file opens
  //            and edits like a drawing made in AutoCAD: real layers, symbol blocks with attributes, polylines and text.
  function build(ents) {
    const T = FT.DXF_TEMPLATE; if (!T) throw new Error('DXF template missing');
    let h = T.seed + 16; const H = () => (++h).toString(16).toUpperCase();
    const known = new Set(T.layers.concat(['0']));
    const out = []; const g = (c, v) => out.push(String(c).padStart(3, ' '), String(v));
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    ents.forEach(e => (e.pts || []).forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    if (x0 > x1) { x0 = y0 = 0; x1 = y1 = 100; }
    const begin = (type, owner, layer, color) => { const id = H(); g(0, type); g(5, id); g(330, owner); g(100, 'AcDbEntity'); g(8, known.has(layer) ? layer : '0'); if (color) g(62, color); return id; };
    const xyz = (p, c) => { g(c || 10, num(p[0])); g((c || 10) + 10, num(p[1])); g((c || 10) + 20, 0); };
    const textBody = (e, str) => { g(100, 'AcDbText'); xyz(e.pts[0]); g(40, num(e.h || 2.5)); g(1, esc(str)); if (e.rot) g(50, num(e.rot)); g(7, 'FTTH'); if (e.centred) { g(72, 1); xyz(e.pts[0], 11); } };
    ents.forEach(e => {
      const L = e.layer || '0';
      if (e.kind === 'insert') {
        const defs = T.blocks[e.name]; if (!defs) return;
        const k = e.scale || 1, rot = (e.rot || 0) * Math.PI / 180, attrs = defs.filter(d => !(e.noAttrs));
        const id = begin('INSERT', T.owner, L, e.color); g(100, 'AcDbBlockReference'); if (attrs.length) g(66, 1); g(2, e.name); xyz(e.pts[0]); if (k !== 1) { g(41, num(k)); g(42, num(k)); g(43, num(k)); } if (e.rot) g(50, num(e.rot));
        if (!attrs.length) return;
        attrs.forEach(d => {
          const p = [e.pts[0][0] + k * (d.x * Math.cos(rot) - d.y * Math.sin(rot)), e.pts[0][1] + k * (d.x * Math.sin(rot) + d.y * Math.cos(rot))];
          const val = e.attrs && e.attrs[d.tag] != null ? e.attrs[d.tag] : '';
          const AL = (e.attrLayers && e.attrLayers[d.tag]) || L; begin('ATTRIB', id, AL); g(100, 'AcDbText'); xyz(p); g(40, num(d.h * k)); g(1, esc(val)); if (e.rot) g(50, num(e.rot)); g(7, 'FTTH'); if (d.centred) { g(72, 1); xyz(p, 11); }
          g(100, 'AcDbAttribute'); g(2, d.tag); g(70, d.hidden ? 1 : 0); if (d.centred) g(74, 2);
        });
        begin('SEQEND', id, L);
      } else if (e.kind === 'line' && e.pts.length === 2) {
        begin('LINE', T.owner, L, e.color); g(100, 'AcDbLine'); xyz(e.pts[0]); xyz(e.pts[1], 11);
      } else if (e.kind === 'poly' || e.kind === 'line') {
        if (e.pts.length < 2) return;
        begin('LWPOLYLINE', T.owner, L, e.color); g(100, 'AcDbPolyline'); g(90, e.pts.length); g(70, e.closed ? 1 : 0); if (e.width) g(43, num(e.width));
        e.pts.forEach(p => { g(10, num(p[0])); g(20, num(p[1])); });
      } else if (e.kind === 'circle') {
        begin('CIRCLE', T.owner, L, e.color); g(100, 'AcDbCircle'); xyz(e.pts[0]); g(40, num(e.r || 1));
      } else if (e.kind === 'point') {
        begin('POINT', T.owner, L, e.color); g(100, 'AcDbPoint'); xyz(e.pts[0]);
      } else if (e.kind === 'text') {
        if (!String(e.text == null ? '' : e.text).length) return;
        begin('TEXT', T.owner, L, e.color); textBody(e, e.text); g(100, 'AcDbText'); if (e.centred) g(73, 2);
      }
    });
    const fill = str => str.split('{{SEED}}').join((h + 32).toString(16).toUpperCase())
      .split('{{X0}}').join(num(x0)).split('{{Y0}}').join(num(y0)).split('{{X1}}').join(num(x1)).split('{{Y1}}').join(num(y1))
      .split('{{VX}}').join(num((x0 + x1) / 2)).split('{{VY}}').join(num((y0 + y1) / 2)).split('{{VH}}').join(num(Math.max(y1 - y0, (x1 - x0) * 0.6, 50) * 1.08));
    const text = fill(T.head) + (out.length ? out.join('\n') + '\n' : '') + fill(T.tail);
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  }
  FT.dxf = { build, utm, fromUtm, zoneOf, ACI, esc };
})(typeof window !== 'undefined' ? window : globalThis);
