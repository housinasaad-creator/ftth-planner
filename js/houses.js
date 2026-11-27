/* House markers. Every building is represented by ONE house icon that stands near the street side of the building.
   Numbering, auto design and editing work on these house points, not on the footprint drawing.
   The icon shows the number of floors by drawing them (1..20), no digits; a wider gap every 5 floors makes tall ones readable. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const H = FT.houses = {};
  H.DEFAULT_FLOORS = 2; // no real floor data exists for Homs: every house starts the same, the engineer sets the real count
  H.MAX_FLOORS = 20;
  H.MINZ = 16.5;
  H.INSET_M = 2.5; // how far inside the street-side wall the house point sits
  H.floorsOf = o => Math.max(1, Math.min(H.MAX_FLOORS, (o && o.floors) || H.DEFAULT_FLOORS));

  // ---------------- the icon (design 7: stacked floors under a coral roof) ----------------
  H.metrics = n => { const fh = n <= 6 ? 4.6 : n <= 12 ? 3.7 : 3.0, gaps = Math.floor((n - 1) / 5); return { fh, gaps, w: 26, roof: 9, gap: 1.8, body: n * fh + gaps * 1.8 }; }; // css pixels
  H.draw = function (n, ratio) {
    const M = H.metrics(n), pad = 3, W = M.w + 2 * pad, Hh = M.roof + M.body + 2 * pad, cv = document.createElement('canvas'); cv.width = Math.ceil(W * ratio); cv.height = Math.ceil(Hh * ratio);
    const c = cv.getContext('2d'); c.scale(ratio, ratio); c.lineJoin = 'round';
    const x = pad + 2, w = M.w - 4, bottom = Hh - pad; let y = bottom;
    // white halo so the icon reads on the satellite picture and on the street map
    c.beginPath(); c.moveTo(pad - 1.6, pad + M.roof); c.lineTo(W / 2, pad - 1.6); c.lineTo(W - pad + 1.6, pad + M.roof); c.lineTo(x + w + 1.6, pad + M.roof); c.lineTo(x + w + 1.6, bottom + 1.6); c.lineTo(x - 1.6, bottom + 1.6); c.lineTo(x - 1.6, pad + M.roof); c.closePath(); c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 3; c.fill(); c.shadowColor = 'transparent';
    for (let i = 0; i < n; i++) {
      if (i && i % 5 === 0) y -= M.gap; // the white band that marks every 5 floors
      y -= M.fh; c.fillStyle = Math.floor(i / 5) % 2 ? '#3b5580' : '#222d4a'; c.fillRect(x, y, w, M.fh - 0.9);
      c.fillStyle = '#ffd24a'; const ww = (w - 10) / 4; for (let q = 0; q < 4; q++) c.fillRect(x + 2 + q * (ww + 2), y + (M.fh - 0.9) * 0.24, ww, Math.max(1.2, (M.fh - 0.9) * 0.5));
    }
    c.beginPath(); c.moveTo(pad, pad + M.roof); c.lineTo(W / 2, pad); c.lineTo(W - pad, pad + M.roof); c.closePath(); c.fillStyle = '#ff6a3d'; c.fill();
    return cv;
  };
  // the number plate: a stretchable white rectangle that hangs under the house, part of the same sign
  H.plate = function (ratio) {
    const W = 20, Hh = 16, cv = document.createElement('canvas'); cv.width = W * ratio; cv.height = Hh * ratio; const c = cv.getContext('2d'); c.scale(ratio, ratio);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#222d4a'; c.fillRect(1, 1, W - 2, Hh - 2); c.fillStyle = '#ffffff'; c.fillRect(2.4, 2.4, W - 4.8, Hh - 4.8); c.fillStyle = '#ff6a3d'; c.fillRect(2.4, 2.4, W - 4.8, 1.6);
    return cv;
  };
  H.PLATE_LIFT = 17; // css px (at icon size 1) the house is raised when it carries a number
  H.HALO = 7; // css px the halo reaches beyond the icon on every side
  // an oval around the icon of n floors; its own centre is the icon's centre (coloured by the map layer)
  H.halo = function (n, ratio) {
    const M = H.metrics(n), pad = 3, g = H.HALO, W = M.w + 2 * pad + 2 * g, Hh = M.roof + M.body + 2 * pad + 2 * g, cv = document.createElement('canvas'); cv.width = Math.ceil(W * ratio); cv.height = Math.ceil(Hh * ratio);
    const c = cv.getContext('2d'); c.scale(ratio, ratio); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(W / 2, Hh / 2, W / 2 - 1, Hh / 2 - 1, 0, 0, Math.PI * 2); c.fill();
    return cv;
  };
  H.addImages = function (map) {
    if (!map.hasImage('house-plate')) { const r = 3, cv = H.plate(r); map.addImage('house-plate', cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), { pixelRatio: r, stretchX: [[6 * r, 14 * r]], stretchY: [[6 * r, 10 * r]], content: [3 * r, 4 * r, 17 * r, 13 * r] }); }
    for (let n = 1; n <= H.MAX_FLOORS; n++) { if (!map.hasImage('halo-' + n)) { const hv = H.halo(n, 3); map.addImage('halo-' + n, hv.getContext('2d').getImageData(0, 0, hv.width, hv.height), { pixelRatio: 3, sdf: true }); } if (map.hasImage('house-' + n)) continue; const cv = H.draw(n, 3); map.addImage('house-' + n, cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), { pixelRatio: 3 }); }
  };

  // ---------------- where the house stands ----------------
  const cache = new Map(); // footprint id -> automatic point (only kept when a street was found next to it)
  H.forget = id => id == null ? cache.clear() : cache.delete(id);
  const inset = (m, c) => { const d = FT.dist(m, c); if (d < 0.5) return m; const t = Math.min(0.45, H.INSET_M / d); return [m[0] + (c[0] - m[0]) * t, m[1] + (c[1] - m[1]) * t]; };
  H.inset = inset; H.cached = id => cache.get(id) || null;
  H.autoPoint = function (id, ring) {
    const hit = cache.get(id); if (hit) return hit;
    const R = FT.roads, c = FT.centroid(ring); let best = null;
    if (R && R.on) for (let i = 0; i < ring.length; i++) { // the middle of the wall that looks at the nearest street without crossing another building
      const a = ring[i], b = ring[(i + 1) % ring.length]; if (a[0] === b[0] && a[1] === b[1]) continue; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], np = R.nearest(m, 60); if (!np) continue;
      let bad = R.inBuilding(m, id) ? 1 : 0; for (const t of [0.25, 0.5, 0.75]) if (R.inBuilding([np.ll[0] + (m[0] - np.ll[0]) * t, np.ll[1] + (m[1] - np.ll[1]) * t], id)) bad++;
      const score = FT.dist(np.ll, m) + bad * 500; if (!best || score < best.score) best = { score, m };
    }
    if (!best) return c; // no street loaded near it yet: stay in the middle for now and try again later
    const p = inset(best.m, c).map(v => +v.toFixed(7)); cache.set(id, p); return p;
  };
  // the point of any building: the one the engineer set, otherwise the automatic one
  H.point = function (id, ring) { const o = (FT.state.bld || {})[id]; if (o && o.pt) return o.pt; return ring ? H.autoPoint(id, ring) : null; };
  // a tiny square around a house that has no footprint (added with the house tool)
  H.square = (p, m) => { const dy = (m || 3) / 110540, dx = (m || 3) / (111320 * Math.cos(p[1] * Math.PI / 180)); return [[p[0] - dx, p[1] - dy], [p[0] + dx, p[1] - dy], [p[0] + dx, p[1] + dy], [p[0] - dx, p[1] + dy]]; };

  // ---------------- 3D models (real geometry, they turn with the camera) ----------------
  const square = (p, half) => { const dy = half / 110540, dx = half / (111320 * Math.cos(p[1] * Math.PI / 180)); return [[p[0] - dx, p[1] - dy], [p[0] + dx, p[1] - dy], [p[0] + dx, p[1] + dy], [p[0] - dx, p[1] + dy], [p[0] - dx, p[1] - dy]]; };
  const slab = (out, kind, id, p, half, base, top, color) => out.push({ type: 'Feature', properties: { kind, mid: id, b: +base.toFixed(2), h: +top.toFixed(2), c: color }, geometry: { type: 'Polygon', coordinates: [square(p, half)] } });
  // design 7 in 3D: one slab per floor, a white band every 5 floors, a stepped coral roof
  H.houseParts = function (out, id, p, floors, base) {
    const FH = 1.5; let y = base + 0.05;
    for (let i = 0; i < floors; i++) {
      if (i && i % 5 === 0) { slab(out, 'house', id, p, 2.75, y, y + 0.4, '#ffffff'); y += 0.4; }
      slab(out, 'house', id, p, 2.6, y, y + FH * 0.72, Math.floor(i / 5) % 2 ? '#3b5580' : '#222d4a'); slab(out, 'house', id, p, 2.45, y + FH * 0.72, y + FH, '#ffd24a'); y += FH;
    }
    [3.0, 2.2, 1.4, 0.65].forEach(h => { slab(out, 'house', id, p, h, y, y + 0.55, '#ff6a3d'); y += 0.55; });
  };
  // cabinets and boxes stand raised off the ground; chambers stay at ground level (they are underground in reality)
  H.nodeParts = function (out, n, p, base) {
    const lift = base || 0, first = out.length, col = (FT.NODE_TYPES[n.type] || {}).color || '#9aa1b6', post = (to, half) => slab(out, 'node', n.id, p, half || 0.22, 0, to, '#5a6072'), box = (half, from, to, c) => { slab(out, 'node', n.id, p, half, from, to, c || col); slab(out, 'node', n.id, p, half * 1.12, to, to + 0.28, '#ffffff'); };
    if (n.type === 'olt') { box(3.4, 0.3, 6.2); slab(out, 'node', n.id, p, 3.45, 2.1, 2.5, '#0f3d2e'); slab(out, 'node', n.id, p, 3.45, 4.1, 4.5, '#0f3d2e'); slab(out, 'node', n.id, p, 0.18, 6.4, 10, '#5a6072'); slab(out, 'node', n.id, p, 0.7, 10, 10.7, col); }
    else if (n.type === 'sk') { post(3.2, 0.35); box(1.7, 3.2, 6.2); slab(out, 'node', n.id, p, 1.74, 4.5, 4.9, '#7a3b12'); }
    else if (n.type === 'dk') { post(2.8, 0.3); box(1.35, 2.8, 5.0); }
    else if (n.type === 'bk') { post(2.4); box(0.95, 2.4, 3.9); }
    else if (n.type === 'pole') { post(3.4); box(0.55, 3.4, 4.2); }
    else if (n.type === 'mh') { const dk = FT.map && FT.map.theme === 'dark'; slab(out, 'node', n.id, p, 1.3, 0, 0.35, dk ? '#eef1f8' : '#6b7280'); slab(out, 'node', n.id, p, 0.75, 0.35, 0.5, dk ? '#aab3c5' : '#2f3545'); }
    else { const dk = FT.map && FT.map.theme === 'dark'; slab(out, 'node', n.id, p, 0.8, 0, 0.28, dk ? '#ffffff' : '#cfd6ea'); slab(out, 'node', n.id, p, 0.45, 0.28, 0.38, dk ? '#aab3c5' : '#2f3545'); }
    if (lift) for (let i = first; i < out.length; i++) { out[i].properties.b = +(out[i].properties.b + lift).toFixed(2); out[i].properties.h = +(out[i].properties.h + lift).toFixed(2); }
  };
  // the box of a house is drawn just beside the house icon (3.8 m south of it), so the two read as one thing
  H.beside = p => [p[0], p[1] - 3.8 / 110540];
  // what a house model stands on: the top of the grey drawing while drawings are shown (its height = the icon's floors), else the ground
  H.baseOf = (id, byId) => { const f = byId && byId.get(id); return f && !FT.map.hideBld ? f.properties.eh : 0; };

  // ---------------- add / move ----------------
  // once a house gets data (number, floors, subscriber, an edited drawing) its icon is fixed where it is: it can only move when the engineer moves it
  H.pin = function (id) { const S = FT.state, o = S.bld[id] = S.bld[id] || {}; if (!o.pt) { const p = FT.map.housePoint(id); if (p && (H.cached(id) || o.house)) o.pt = p.slice(); } return o; };
  H.add = function (p) {
    const S = FT.state; FT.commit(); const id = 'h' + FT.uid('').slice(0, 8);
    S.bld[id] = { house: 1, custom: 1, pt: [+p[0].toFixed(7), +p[1].toFixed(7)], floors: (FT.UI && FT.UI.floorsValue()) || H.DEFAULT_FLOORS };
    FT.changed('bld'); return id;
  };
  // moving a house takes the box that stands at its door (and that box's ducts and cables) with it
  H.moveTo = function (id, p) {
    const S = FT.state, was = FT.map.housePoint(id), o = S.bld[id] = S.bld[id] || {};
    o.pt = [+p[0].toFixed(7), +p[1].toFixed(7)]; if (o.ll) o.ll = o.pt.slice();
    const box = o.fdb && S.nodes[o.fdb]; if (box && was && FT.dist(box.ll, was) < 1.5) FT.T.moveNode(box.id, o.pt.slice());
  };
})(window);
