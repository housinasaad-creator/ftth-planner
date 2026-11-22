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
    s = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
    let o = '';
    for (const ch of s) { const c = ch.codePointAt(0); o += c < 128 ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); }
    return o;
  }
  const num = v => (Math.round(v * 1000) / 1000).toString();
  // AutoCAD Color Index for our layers
  const ACI = { red: 1, yellow: 2, green: 3, cyan: 4, blue: 5, magenta: 6, white: 7, grey: 8, orange: 30, lime: 80, brown: 34 };

  function build(ents, layers, opt) {
    opt = opt || {};
    let h = 0x30; const H = () => (++h).toString(16).toUpperCase();
    const out = []; const g = (c, v) => out.push(String(c), String(v));
    // collect extents
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    ents.forEach(e => (e.pts || []).forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    if (x0 > x1) { x0 = y0 = 0; x1 = y1 = 100; }
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1015');
    g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
    g(9, '$EXTMIN'); g(10, num(x0)); g(20, num(y0)); g(30, 0);
    g(9, '$EXTMAX'); g(10, num(x1)); g(20, num(y1)); g(30, 0);
    g(9, '$INSUNITS'); g(70, 6); // metres
    g(9, '$MEASUREMENT'); g(70, 1);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(5, '5'); g(100, 'AcDbSymbolTable'); g(70, 2);
    g(0, 'LTYPE'); g(5, '14'); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbLinetypeTableRecord'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
    g(0, 'LTYPE'); g(5, '15'); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbLinetypeTableRecord'); g(2, 'DASHED'); g(70, 0); g(3, 'Dashed __ __ __'); g(72, 65); g(73, 2); g(40, 1.0); g(49, 0.6); g(74, 0); g(49, -0.4); g(74, 0);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(5, '2'); g(100, 'AcDbSymbolTable'); g(70, layers.length + 1);
    const allL = [{ name: '0', color: 7 }].concat(layers);
    allL.forEach(l => { g(0, 'LAYER'); g(5, H()); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbLayerTableRecord'); g(2, esc(l.name)); g(70, 0); g(62, l.color || 7); g(6, l.ltype || 'CONTINUOUS'); });
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(5, '3'); g(100, 'AcDbSymbolTable'); g(70, 1);
    g(0, 'STYLE'); g(5, H()); g(100, 'AcDbSymbolTableRecord'); g(100, 'AcDbTextStyleTableRecord'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    ents.forEach(e => {
      const base = () => { g(0, e.k); g(5, H()); g(100, 'AcDbEntity'); g(8, esc(e.layer || '0')); if (e.color) g(62, e.color); };
      if (e.kind === 'line' && e.pts.length === 2) {
        e.k = 'LINE'; base(); g(100, 'AcDbLine'); g(10, num(e.pts[0][0])); g(20, num(e.pts[0][1])); g(30, 0); g(11, num(e.pts[1][0])); g(21, num(e.pts[1][1])); g(31, 0);
      } else if (e.kind === 'poly' || e.kind === 'line') {
        if (e.pts.length < 2) return;
        e.k = 'LWPOLYLINE'; base(); g(100, 'AcDbPolyline'); g(90, e.pts.length); g(70, e.closed ? 1 : 0);
        e.pts.forEach(p => { g(10, num(p[0])); g(20, num(p[1])); });
      } else if (e.kind === 'circle') {
        e.k = 'CIRCLE'; base(); g(100, 'AcDbCircle'); g(10, num(e.pts[0][0])); g(20, num(e.pts[0][1])); g(30, 0); g(40, num(e.r || 1));
      } else if (e.kind === 'point') {
        e.k = 'POINT'; base(); g(100, 'AcDbPoint'); g(10, num(e.pts[0][0])); g(20, num(e.pts[0][1])); g(30, 0);
      } else if (e.kind === 'text') {
        e.k = 'TEXT'; base(); g(100, 'AcDbText'); g(10, num(e.pts[0][0])); g(20, num(e.pts[0][1])); g(30, 0); g(40, num(e.h || 2.5)); g(1, esc(e.text)); g(50, num(e.rot || 0)); g(7, 'STANDARD'); g(100, 'AcDbText');
      }
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
  FT.dxf = { build, utm, fromUtm, zoneOf, ACI, esc };
})(typeof window !== 'undefined' ? window : globalThis);
