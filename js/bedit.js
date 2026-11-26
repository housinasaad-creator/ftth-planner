/* Building editing: 4-direction stretch handles, move, vertex edit, delete (with automatic renumbering), merge. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const B = FT.bedit = { drag: null };
  const U = () => FT.UI, MIN = 2, KY = 110540;
  const kxOf = lat => Math.cos(lat * Math.PI / 180) * 111320;
  const isOpen = r => !(r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]);
  const open = ring => { const r = ring.map(p => [p[0], p[1]]); if (!isOpen(r)) r.pop(); return r; };

  // footprint of any building (own override, otherwise the map footprint), open ring [[lon,lat],…]
  B.ringOf = id => { const o = FT.state.bld[id]; if (o && o.fp) return open(o.fp); const r = FT.map.buildingRing(id); return r ? open(r) : null; };
  function ensureFp(id) { const o = FT.houses.pin(id); if (!o.fp) { const r = B.ringOf(id); if (r) o.fp = r; } o.edited = 1; return o; }

  // ---- geometry: local metric frame and minimum-area oriented rectangle ----
  function hull(P) {
    const A = P.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
    A.forEach(p => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (let i = A.length - 1; i >= 0; i--) { const p = A[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  B.frame = function (ring) {
    const c = FT.centroid(ring), kx = kxOf(c[1]), P = ring.map(p => ({ x: (p[0] - c[0]) * kx, y: (p[1] - c[1]) * KY })), H = hull(P);
    let best = null;
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length], ang = Math.atan2(b.y - a.y, b.x - a.x), ux = Math.cos(ang), uy = Math.sin(ang), wx = -uy, wy = ux;
      let u0 = 1e18, u1 = -1e18, w0 = 1e18, w1 = -1e18;
      H.forEach(p => { const u = p.x * ux + p.y * uy, w = p.x * wx + p.y * wy; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; });
      const area = (u1 - u0) * (w1 - w0); if (!best || area < best.area) best = { area, ux, uy, wx, wy, umin: u0, umax: u1, wmin: w0, wmax: w1 };
    }
    if (!best) best = { ux: 1, uy: 0, wx: 0, wy: 1, umin: -1, umax: 1, wmin: -1, wmax: 1 };
    return Object.assign({ c, kx, P }, best);
  };
  const toLL = (f, u, w) => [f.c[0] + (u * f.ux + w * f.wx) / f.kx, f.c[1] + (u * f.uy + w * f.wy) / KY];

  // ---- handles drawn on the map for the selected building ----
  B.handles = function (id) {
    const ring = B.ringOf(id); if (!ring || ring.length < 3) return [];
    const f = B.frame(ring), mu = (f.umin + f.umax) / 2, mw = (f.wmin + f.wmax) / 2, F = [];
    F.push({ type: 'Feature', properties: { k: 'box' }, geometry: { type: 'LineString', coordinates: [toLL(f, f.umin, f.wmin), toLL(f, f.umax, f.wmin), toLL(f, f.umax, f.wmax), toLL(f, f.umin, f.wmax), toLL(f, f.umin, f.wmin)] } });
    [[0, f.umax, mw, f.ux, f.uy], [1, f.umin, mw, -f.ux, -f.uy], [2, mu, f.wmax, f.wx, f.wy], [3, mu, f.wmin, -f.wx, -f.wy]].forEach(([d, u, w, dx, dy]) => F.push({ type: 'Feature', id: 'e' + d, properties: { id: 'e' + d, k: 'edge', d, rot: Math.atan2(dx, dy) * 180 / Math.PI }, geometry: { type: 'Point', coordinates: toLL(f, u, w) } }));
    F.push({ type: 'Feature', id: 'm', properties: { id: 'm', k: 'move' }, geometry: { type: 'Point', coordinates: toLL(f, mu, mw) } });
    if (ring.length <= 40) ring.forEach((p, i) => F.push({ type: 'Feature', id: 'v' + i, properties: { id: 'v' + i, k: 'vtx', i }, geometry: { type: 'Point', coordinates: p } }));
    return F;
  };
  B.editing = null; // id of the building whose DRAWING is being edited (a button in the house card): clicking a house edits the house, not the drawing
  B.refresh = function () {
    const T = FT.T, M = FT.map; if (!M || !M.ready) return;
    if (B.editing && !(T && T.sel && T.sel.kind === 'bld' && T.sel.id === B.editing)) B.editing = null;
    const ok = T && T.sel && T.sel.kind === 'bld' && B.editing === T.sel.id && T.tool === 'select' && !(FT.store && FT.store.mode === 'view') && !(T.bsel && T.bsel.size > 1);
    M.setBH(ok && !M.hideBld ? B.handles(T.sel.id) : []); // no footprint handles while the drawing is hidden
  };

  // ---- dragging a handle ----
  B.begin = function (id, k, d, startLL) {
    const ring = B.ringOf(id); if (!ring) return false; const f = B.frame(ring);
    B.drag = { id, k, d, ring, f, start: startLL, Q: f.P.map(p => ({ u: p.x * f.ux + p.y * f.uy, w: p.x * f.wx + p.y * f.wy })), moved: false }; return true;
  };
  B.update = function (ll) {
    const D = B.drag; if (!D) return; const f = D.f; if (!D.moved) { FT.commit(); ensureFp(D.id); D.moved = true; }
    let ring;
    if (D.k === 'move') { const dx = ll[0] - D.start[0], dy = ll[1] - D.start[1]; ring = D.ring.map(p => [p[0] + dx, p[1] + dy]); }
    else if (D.k === 'vtx') ring = D.ring.map((p, i) => i === D.d ? ll : p);
    else {
      const x = (ll[0] - f.c[0]) * f.kx, y = (ll[1] - f.c[1]) * KY, aU = x * f.ux + y * f.uy, aW = x * f.wx + y * f.wy;
      let u0 = f.umin, u1 = f.umax, w0 = f.wmin, w1 = f.wmax;
      if (D.d === 0) u1 = Math.max(aU, f.umin + MIN); else if (D.d === 1) u0 = Math.min(aU, f.umax - MIN); else if (D.d === 2) w1 = Math.max(aW, f.wmin + MIN); else w0 = Math.min(aW, f.wmax - MIN);
      const su = (u1 - u0) / ((f.umax - f.umin) || 1), sw = (w1 - w0) / ((f.wmax - f.wmin) || 1);
      ring = D.Q.map(q => toLL(f, u0 + (q.u - f.umin) * su, w0 + (q.w - f.wmin) * sw));
    }
    FT.state.bld[D.id].fp = ring; FT.map.rebuildBuildingData(); B.refreshLive(ring);
  };
  B.refreshLive = function () { B.refresh(); };
  B.end = function () { const D = B.drag; B.drag = null; if (D && D.moved) FT.changed('bld'); return !!(D && D.moved); };

  // ---- delete (and renumber everything after the removed numbers) ----
  B.compact = function (pfx, num) {
    let n = 0; Object.values(FT.state.bld).forEach(o => { if (o.num && (o.pfx || '') === (pfx || '') && o.num > num) { o.num--; n++; } });
    const t = FT.T.num; if (t.next > num && (t.prefix || '') === (pfx || '')) t.next--; return n;
  };
  B.remove = function (ids, noCommit) {
    const S = FT.state; ids = ids.filter(id => id); if (!ids.length) return { del: 0, re: 0, subs: 0 }; if (!noCommit) FT.commit();
    const nums = ids.map(id => S.bld[id]).filter(o => o && o.num).map(o => ({ num: o.num, pfx: o.pfx || '' })).sort((a, b) => b.num - a.num); let subs = 0;
    ids.forEach(id => {
      Object.values(S.subs || {}).filter(s => s.bld === id).forEach(s => { delete S.subs[s.id]; Object.values(S.cables).filter(c => c.sub === s.id || c.drop === s.id).forEach(c => delete S.cables[c.id]); subs++; });
      const o = S.bld[id]; if (o && o.custom) delete S.bld[id]; else S.bld[id] = { deleted: 1 };
    });
    let re = 0; nums.forEach(x => { re += B.compact(x.pfx, x.num); });
    if (!noCommit) { FT.T.clearBuildingSel(); FT.changed('bld'); FT.UI.numChanged(); }
    return { del: ids.length, re, subs };
  };
  B.removeSelected = function () {
    const T = FT.T, ids = T.bsel && T.bsel.size ? [...T.bsel] : (T.sel && T.sel.kind === 'bld' ? [T.sel.id] : []); if (!ids.length) return;
    const r = B.remove(ids), ar = FT.lang === 'ar';
    U().toast(ar ? 'حُذف ' + r.del + ' بيت' + (r.re ? ' · أُعيد ترقيم ' + r.re + ' بيت بعده' : '') + (r.subs ? ' · وحُذف ' + r.subs + ' مشترك' : '') : r.del + ' house(s) deleted' + (r.re ? ' · ' + r.re + ' renumbered' : '') + (r.subs ? ' · ' + r.subs + ' subscriber(s) removed' : ''));
  };
  // remove only the number of one building and close the gap
  B.unnumber = function (id) {
    const o = FT.state.bld[id]; if (!o || !o.num) return 0; FT.commit(); const num = o.num, pfx = o.pfx || ''; delete o.num; delete o.pfx; const re = B.compact(pfx, num); FT.changed('num'); FT.UI.numChanged(); return re;
  };

  // ---- merge ----
  B.merge = function (ids) {
    const S = FT.state; ids = ids.filter(id => B.ringOf(id)); if (ids.length < 2) { U().toast(FT.lang === 'ar' ? 'اختر بيتين على الأقل (Shift + نقرة)' : 'Select at least two houses (Shift+click)'); return false; }
    const rings = ids.map(id => B.ringOf(id)); let ring = null, mode = 'union';
    try { const res = G.polygonClipping.union(...rings.map(r => [r.concat([r[0]])])); if (res.length === 1) ring = res[0][0].slice(0, -1); } catch (e) { ring = null; }
    if (!ring) { // pieces do not touch: convex hull of all of them
      mode = 'hull'; const c = FT.centroid([].concat(...rings)), kx = kxOf(c[1]); const H = hull([].concat(...rings).map(p => ({ x: (p[0] - c[0]) * kx, y: (p[1] - c[1]) * KY, p }))); ring = H.map(h => h.p);
    }
    FT.commit();
    const withNum = ids.filter(id => (S.bld[id] || {}).num).sort((a, b) => S.bld[a].num - S.bld[b].num), keep = withNum[0] || ids[0], others = ids.filter(id => id !== keep);
    const fl = Math.max(0, ...ids.map(id => (S.bld[id] || {}).floors || 0)), nm = (S.bld[keep] || {}).name;
    // the kept building has the smallest number, so removing the other numbers (and closing their gaps) never moves it
    const o0 = FT.houses.pin(keep); void o0; B.remove(others, true);
    const o = S.bld[keep] = S.bld[keep] || {}; o.fp = ring; o.edited = 1; o.merged = 1; delete o.deleted; if (fl) o.floors = fl; if (nm) o.name = nm;
    FT.T.clearBuildingSel(); FT.changed('bld'); FT.UI.numChanged(); FT.T.select('bld', keep);
    U().toast(FT.lang === 'ar' ? 'تم دمج ' + ids.length + ' بيوت' + (mode === 'hull' ? ' (غير متلامسة: دمج محدّب)' : '') : ids.length + ' houses merged' + (mode === 'hull' ? ' (not touching: convex hull)' : ''));
    return true;
  };
})(window);
