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
    const m = FT.map && FT.map.map; if (!m) return null;
    const nodes = [], idx = {}, adj = [], segs = [], seen = new Set();
    const nid = p => { const k = key(p); let i = idx[k]; if (i == null) { i = idx[k] = nodes.length; nodes.push(p); adj.push([]); } return i; };
    const feats = m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' }) || [];
    feats.forEach(f => {
      if (!f.geometry || SKIP[f.properties.class]) return;
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      lines.forEach(c => { for (let i = 1; i < c.length; i++) { const a = nid(c[i - 1]), b = nid(c[i]); if (a === b) continue; const e = a < b ? a + '-' + b : b + '-' + a; if (seen.has(e)) continue; seen.add(e); const w = FT.dist(nodes[a], nodes[b]); adj[a].push([b, w]); adj[b].push([a, w]); segs.push([a, b]); } });
    });
    R.g = { nodes, adj, segs }; R.dirty = false; return R.g;
  };
  R.graph = function () { return (R.dirty || !R.g) ? R.build() : R.g; };
  R.init = function () { const m = FT.map.map; const d = () => { R.dirty = true; }; m.on('sourcedata', e => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) d(); }); m.on('moveend', d); };

  // nearest point on any street segment: { ll, a, b, t, d }
  R.nearest = function (ll, maxM) {
    const g = R.graph(); if (!g || !g.segs.length) return null; const X = kx(ll[1]), Y = ky; let best = null, bd = (maxM || 40);
    for (const [a, b] of g.segs) {
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
    const na = R.nearest(A, 45), nb = R.nearest(B, 45); if (!na || !nb) return null;
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
  };
  R.pathLen = p => p ? FT.pathLen(p) : 0;
})(window);
