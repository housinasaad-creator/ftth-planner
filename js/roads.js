/* Street-following routing: pipes and cables run along the streets of the map (never across buildings).
   Graph = road lines of the vector tiles already loaded on the map (OpenStreetMap data). Pure geometry, no network call. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const R = FT.roads = { on: true, dirty: true, g: null };
  const SKIP = { rail: 1, ferry: 1, aerialway: 1, transit: 1, path: 1, track: 1, pier: 1, bus_guideway: 1 };
  const K = 1e5, key = p => Math.round(p[0] * K) + '_' + Math.round(p[1] * K);
  const kx = lat => Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;

  R.build = function () {
    const m = FT.map && FT.map.map; if (!m && !R._lines) return null;
    const nodes = [], idx = {}, adj = [], segs = [], seen = new Set();
    const nid = p => { const k = key(p); let i = idx[k]; if (i == null) { i = idx[k] = nodes.length; nodes.push(p); adj.push([]); } return i; };
    const feats = R._lines || m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }) || [];
    feats.forEach(f => {
      if (!f.geometry || SKIP[f.properties.class]) return;
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      lines.forEach(c => { for (let i = 1; i < c.length; i++) { const a = nid(c[i - 1]), b = nid(c[i]); if (a === b) continue; const e = a < b ? a + '-' + b : b + '-' + a; if (seen.has(e)) continue; seen.add(e); const w = FT.dist(nodes[a], nodes[b]); adj[a].push([b, w]); adj[b].push([a, w]); segs.push([a, b]); } });
    });
    const comp = stitch(nodes, adj);
    R.buildBuildings();
    const g = R.g = { nodes, adj, segs, comp: comp.id, main: comp.main, grid: new Map(), KX: kx(34.73) };
    segs.forEach(([a, b], i) => { const A = nodes[a], B = nodes[b], x0 = Math.floor(Math.min(A[0], B[0]) * g.KX / CELL), x1 = Math.floor(Math.max(A[0], B[0]) * g.KX / CELL), y0 = Math.floor(Math.min(A[1], B[1]) * ky / CELL), y1 = Math.floor(Math.max(A[1], B[1]) * ky / CELL); for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = cx + ',' + cy; let l = g.grid.get(k); if (!l) g.grid.set(k, l = []); l.push(i); } });
    // a street that runs through a house footprint is "expensive": it is used only when there is no other way
    segs.forEach(([a, b]) => { const A = nodes[a], B = nodes[b]; if (R.inBuilding([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2])) { const e1 = adj[a].find(e => e[0] === b), e2 = adj[b].find(e => e[0] === a); if (e1) e1[1] *= 25; if (e2) e2[1] *= 25; } });
    R.dirty = false; return R.g;
  };
  const CELL = 25;
  // footprints of the buildings loaded on the map (grid of bounding boxes)
  R.buildBuildings = function () {
    const KX = kx(34.73), grid = new Map(); (R._blds || (FT.map && FT.map.bldFeats) || []).forEach(f => { const ring = f.geometry.coordinates[0]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; ring.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      const it = { id: f.properties.id, ring, bb: [x0, y0, x1, y1] }; for (let cx = Math.floor(x0 * KX / CELL); cx <= Math.floor(x1 * KX / CELL); cx++) for (let cy = Math.floor(y0 * ky / CELL); cy <= Math.floor(y1 * ky / CELL); cy++) { const k = cx + ',' + cy; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(it); } });
    R.bgrid = { grid, KX };
  };
  R.inBuilding = function (ll, excludeId) {
    const B = R.bgrid; if (!B) return null; const l = B.grid.get(Math.floor(ll[0] * B.KX / CELL) + ',' + Math.floor(ll[1] * ky / CELL)); if (!l) return null;
    for (const it of l) { if (it.id === excludeId) continue; const b = it.bb; if (ll[0] >= b[0] && ll[0] <= b[2] && ll[1] >= b[1] && ll[1] <= b[3] && FT.pointInRing(ll, it.ring)) return it.id; } return null;
  };
  // The vector tiles cut every street at their borders, so the graph came out in hundreds of loose pieces and routes between
  // pieces failed (a straight line across the houses). Join points that coincide (<= 2 m) and bridge dead ends to a neighbour (<= 10 m).
  function stitch(nodes, adj) {
    const KX = nodes.length ? kx(nodes[0][1]) : 111320, KY = ky, cell = 4, hash = new Map(), kk = (x, y) => x + ',' + y;
    nodes.forEach((p, i) => { const k = kk(Math.floor(p[0] * KX / cell), Math.floor(p[1] * KY / cell)); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(i); });
    const near = (i, rad) => { const p = nodes[i], cx = Math.floor(p[0] * KX / cell), cy = Math.floor(p[1] * KY / cell), r = Math.ceil(rad / cell), out = [];
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const a = hash.get(kk(cx + dx, cy + dy)); if (!a) continue; for (const j of a) { if (j === i) continue; const d = Math.hypot((nodes[j][0] - p[0]) * KX, (nodes[j][1] - p[1]) * KY); if (d <= rad) out.push([j, d]); } }
      return out; };
    const link = (i, j, d) => { if (adj[i].some(e => e[0] === j)) return; adj[i].push([j, Math.max(d, 0.1)]); adj[j].push([i, Math.max(d, 0.1)]); };
    const label = () => { const id = new Array(nodes.length).fill(-1), sz = []; let n = 0; for (let i = 0; i < nodes.length; i++) { if (id[i] >= 0) continue; const st = [i]; id[i] = n; let c = 0; while (st.length) { const u = st.pop(); c++; for (const e of adj[u]) if (id[e[0]] < 0) { id[e[0]] = n; st.push(e[0]); } } sz.push(c); n++; } return { id, sz }; };
    for (let i = 0; i < nodes.length; i++) near(i, 2).forEach(([j, d]) => { if (j > i) link(i, j, d); });
    let c = label();
    for (let i = 0; i < nodes.length; i++) { if (adj[i].length > 1) continue; let best = null; near(i, 10).forEach(([j, d]) => { if (c.id[j] !== c.id[i] && (!best || d < best[1])) best = [j, d]; }); if (best) link(i, best[0], best[1]); }
    c = label(); let main = 0; c.sz.forEach((v, k) => { if (v > c.sz[main]) main = k; });
    return { id: c.id, main };
  }
  // plain copy of what the worker needs (street lines + building rings)
  R.snapshot = function () {
    const m = FT.map.map, lines = (m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }) || []).filter(f => f.geometry && !SKIP[f.properties.class] && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')).map(f => ({ geometry: { type: f.geometry.type, coordinates: f.geometry.coordinates }, properties: { class: f.properties.class } }));
    const blds = ((FT.map && FT.map.bldFeats) || []).map(f => ({ geometry: { coordinates: [f.geometry.coordinates[0]] }, properties: { id: f.properties.id } }));
    return { lines, blds, on: R.on };
  };
  R.graph = function () { return (R.dirty || !R.g) ? R.build() : R.g; };
  R.init = function () { const m = FT.map.map; const d = () => { R.dirty = true; }; m.on('sourcedata', e => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) d(); }); m.on('moveend', d); };

  // nearest point on any street segment: { ll, a, b, t, d }
  R.nearest = function (ll, maxM, onlyMain) {
    const g = R.graph(); if (!g || !g.segs.length) return null; const X = kx(ll[1]), Y = ky; let best = null, bd = (maxM || 40);
    const rr = Math.ceil(bd / CELL), cx0 = Math.floor(ll[0] * g.KX / CELL), cy0 = Math.floor(ll[1] * ky / CELL), seen = new Set(), cand = [];
    for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++) { const l = g.grid.get((cx0 + dx) + ',' + (cy0 + dy)); if (l) for (const i of l) if (!seen.has(i)) { seen.add(i); cand.push(g.segs[i]); } }
    for (const [a, b] of cand) {
      if (onlyMain && g.comp[a] !== g.main) continue;
      const A = g.nodes[a], B = g.nodes[b], ax = (A[0] - ll[0]) * X, ay = (A[1] - ll[1]) * Y, bx = (B[0] - ll[0]) * X, by = (B[1] - ll[1]) * Y, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
      if (d < bd) { bd = d; best = { a, b, t, d, ll: [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t] }; }
    }
    return best;
  };
  R.snapPoint = function (ll, maxM) { if (!R.on) return ll; const n = R.nearest(ll, maxM || 30); return n ? n.ll : ll; };

  // shortest path along streets between two points -> polyline [a ... b] or null
  R.path = function (A, B) {
    if (!R.on) return null; const g = R.graph(); if (!g) return null;
    const na = R.nearest(A, 45), nb = R.nearest(B, 45); let r = na && nb ? pathVia(g, A, B, na, nb) : null;
    if (!r) { const ma = R.nearest(A, 120, true), mb = R.nearest(B, 120, true); if (ma && mb) r = pathVia(g, A, B, ma, mb); }
    return r;
  };
  function pathVia(g, A, B, na, nb) {
    const N = g.nodes.length, VA = N, VB = N + 1, nodes = g.nodes.concat([na.ll, nb.ll]);
    const extra = { [VA]: [[na.a, FT.dist(na.ll, g.nodes[na.a])], [na.b, FT.dist(na.ll, g.nodes[na.b])]], [VB]: [[nb.a, FT.dist(nb.ll, g.nodes[nb.a])], [nb.b, FT.dist(nb.ll, g.nodes[nb.b])]] };
    const nbrs = u => { if (u >= N) return extra[u]; let r = g.adj[u]; const add = []; [[VA, na], [VB, nb]].forEach(([v, q]) => { if (q.a === u) add.push([v, FT.dist(q.ll, g.nodes[u])]); else if (q.b === u) add.push([v, FT.dist(q.ll, g.nodes[u])]); }); return add.length ? r.concat(add) : r; };
    // same segment: direct
    if (na.a === nb.a && na.b === nb.b || na.a === nb.b && na.b === nb.a) return [A, na.ll, nb.ll, B];
    const dist = new Map([[VA, 0]]), prev = new Map(), heap = [[0, VA]], push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } }, pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[i][0] <= heap[c][0]) break; [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; } } return t; };
    const done = new Set();
    while (heap.length) { const [d, u] = pop(); if (done.has(u)) continue; done.add(u); if (u === VB) break; for (const [v, w] of nbrs(u)) { const nd = d + w; if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); push([nd, v]); } } }
    if (!dist.has(VB)) return null;
    const out = []; let c = VB; while (c != null) { out.unshift(nodes[c]); c = prev.get(c); }
    out.unshift(A); out.push(B);
    // drop zero-length repeats and collinear noise
    return out.filter((p, i) => i === 0 || FT.dist(p, out[i - 1]) > 0.05);
  }
  // one Dijkstra from A, then a street path to each point of Bs (much cheaper than one search per target)
  R.pathsFrom = function (A, Bs) {
    const none = () => Bs.map(() => null); if (!R.on) return none(); const g = R.graph(); if (!g) return none();
    const na = R.nearest(A, 45) || R.nearest(A, 120, true); if (!na) return none();
    const N = g.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), h = [];
    const push = x => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
    const pop = () => { const t = h[0], l = h.pop(); if (h.length) { h[0] = l; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= h.length) break; if (c + 1 < h.length && h[c + 1][0] < h[c][0]) c++; if (h[i][0] <= h[c][0]) break; [h[i], h[c]] = [h[c], h[i]]; i = c; } } return t; };
    dist[na.a] = FT.dist(na.ll, g.nodes[na.a]); dist[na.b] = Math.min(dist[na.b], FT.dist(na.ll, g.nodes[na.b])); push([dist[na.a], na.a]); push([dist[na.b], na.b]);
    while (h.length) { const [d, u] = pop(); if (d > dist[u]) continue; for (const [v, w] of g.adj[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); } } }
    return Bs.map(B => {
      const nb = R.nearest(B, 45) || R.nearest(B, 120, true); if (!nb) return null;
      if ((na.a === nb.a && na.b === nb.b) || (na.a === nb.b && na.b === nb.a)) return [A, na.ll, nb.ll, B];
      const da = dist[nb.a] + FT.dist(g.nodes[nb.a], nb.ll), db = dist[nb.b] + FT.dist(g.nodes[nb.b], nb.ll), m = Math.min(da, db); if (!isFinite(m)) return R.path(A, B);
      const list = []; let c = da <= db ? nb.a : nb.b; while (c !== -1) { list.unshift(g.nodes[c]); c = prev[c]; }
      const out = [A, na.ll].concat(list, [nb.ll, B]); return out.filter((p, i) => i === 0 || FT.dist(p, out[i - 1]) > 0.05);
    });
  };
  R.pathLen = p => p ? FT.pathLen(p) : 0;
})(window);
