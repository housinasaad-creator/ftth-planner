/* Shared micro-trench: all the street routes of a design are merged into ONE network.
   Routes that use the same street share one trench, one duct bundle (sized to what runs inside, with a spare way) and the same handholes.
   Pure geometry (runs in the background worker too). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const TR = FT.trench = {};
  const MERGE_M = 0.4, CELL = 12;
  TR.MAX_SPAN = 230; // a chamber is planned every <= 230 m (the limit is 250 m)
  const PRUNE_SPAN = 245, JUNCTION_WINDOW = 70;

  // routes: [{ pts: [[lon,lat]...], layer: 'f' (feeder) | 'd' (distribution), from: ref, to: ref, od: cable outer diameter }]
  TR.build = function (routes) {
    const lat0 = routes.length ? routes[0].pts[0][1] : 34.73, KX = Math.cos(lat0 * Math.PI / 180) * 111320, KY = 110540;
    const V = [], XY = [], grid = new Map();
    const cellOf = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL);
    function vid(ll) { // one vertex for points closer than MERGE_M
      const x = ll[0] * KX, y = ll[1] * KY, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = grid.get((cx + dx) + ',' + (cy + dy)); if (a) for (const i of a) if (Math.hypot(XY[i][0] - x, XY[i][1] - y) <= MERGE_M) return i; }
      const i = V.length; V.push(ll); XY.push([x, y]); const k = cellOf(x, y); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); return i;
    }
    const raw = routes.map(r => { const s = []; r.pts.forEach(p => { const i = vid(p); if (s[s.length - 1] !== i) s.push(i); }); return s; });
    // noding: a vertex that lies on another route's segment cuts that segment, so overlapping stretches become identical edges
    const cut = new Map();
    function between(u, v) {
      const key = u + '>' + v; let out = cut.get(key); if (out) return out;
      const [ax, ay] = XY[u], [bx, by] = XY[v], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, found = [];
      const x0 = Math.floor((Math.min(ax, bx) - 1) / CELL), x1 = Math.floor((Math.max(ax, bx) + 1) / CELL), y0 = Math.floor((Math.min(ay, by) - 1) / CELL), y1 = Math.floor((Math.max(ay, by) + 1) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const a = grid.get(cx + ',' + cy); if (!a) continue; for (const i of a) { if (i === u || i === v || !L2) continue; const t = ((XY[i][0] - ax) * dx + (XY[i][1] - ay) * dy) / L2; if (t <= 0 || t >= 1) continue; if (Math.hypot(ax + t * dx - XY[i][0], ay + t * dy - XY[i][1]) <= MERGE_M) found.push([t, i]); } }
      out = found.sort((p, q) => p[0] - q[0]).map(f => f[1]); cut.set(key, out); return out;
    }
    const seqs = raw.map(s => { const o = [s[0]]; for (let i = 1; i < s.length; i++) { between(s[i - 1], s[i]).forEach(m => { if (o[o.length - 1] !== m) o.push(m); }); if (o[o.length - 1] !== s[i]) o.push(s[i]); }
      // a route never needs to go somewhere and come straight back
      for (let i = 1; i + 1 < o.length;) { if (o[i - 1] === o[i + 1]) { o.splice(i, 2); if (i > 1) i--; } else i++; } return o; });

    const ek = (a, b) => a < b ? a + '-' + b : b + '-' + a;
    const nb = new Map(); const link = (a, b) => { let s = nb.get(a); if (!s) nb.set(a, s = new Set()); s.add(b); };
    seqs.forEach(s => { for (let i = 1; i < s.length; i++) { link(s[i - 1], s[i]); link(s[i], s[i - 1]); } });
    const degree = v => (nb.get(v) || new Set()).size;
    const dist = (a, b) => Math.hypot(XY[a][0] - XY[b][0], XY[a][1] - XY[b][1]);

    // fixed points: where routes start (OLT, cabinets) and end (boxes)
    const ref = new Map(); seqs.forEach((s, i) => { if (!ref.has(s[0])) ref.set(s[0], routes[i].from); });
    seqs.forEach((s, i) => { const e = s[s.length - 1]; if (!ref.has(e)) ref.set(e, routes[i].to); });
    // only handholes count as chambers along a route: another cabinet that a cable merely passes does not
    const chamber = new Set(), hh = new Set();

    // ---- handholes: walk every route, longest first, so the shorter ones reuse what is already there ----
    const split = new Map(); // edge -> the chamber inserted into it
    function expand(u, v, out) { const w = split.get(ek(u, v)); if (w === undefined) out.push(v); else { expand(u, w, out); expand(w, v, out); } }
    const full = s => { const o = [s[0]]; for (let i = 1; i < s.length; i++) expand(s[i - 1], s[i], o); return o; };
    const lengthOf = s => { let l = 0; for (let i = 1; i < s.length; i++) l += dist(s[i - 1], s[i]); return l; };
    const byLength = seqs.map((s, i) => [lengthOf(s), i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    byLength.forEach(ri => {
      let s = full(seqs[ri]), since = 0, passed = [];
      for (let i = 1, guard = 0; i < s.length && guard < 20000; guard++) {
        const u = s[i - 1], v = s[i], d = dist(u, v);
        if (since + d <= TR.MAX_SPAN + 0.5) { /* half a metre of slack: a freshly cut piece measures 230.0000001 */ since += d; i++; if (i < s.length) { if (chamber.has(v)) { since = 0; passed = []; } else passed.push([v, since]); } continue; }
        // a street junction shortly before the limit is the best place: every branch can use that chamber
        let best = null; for (const [x, at] of passed) if (degree(x) >= 3 && at >= TR.MAX_SPAN - JUNCTION_WINDOW && at <= TR.MAX_SPAN) best = [x, at];
        if (best) { chamber.add(best[0]); hh.add(best[0]); since -= best[1]; passed = passed.filter(p => p[1] > best[1]).map(p => [p[0], p[1] - best[1]]); continue; }
        const room = TR.MAX_SPAN - since;
        if (room < 1) { chamber.add(u); hh.add(u); since = 0; passed = []; continue; }
        const t = room / d, q = [V[u][0] + (V[v][0] - V[u][0]) * t, V[u][1] + (V[v][1] - V[u][1]) * t];
        const w = V.length; V.push(q); XY.push([q[0] * KX, q[1] * KY]); split.set(ek(u, v), w); chamber.add(w); hh.add(w);
        link(w, u); link(w, v); if (nb.get(u)) { nb.get(u).delete(v); nb.get(u).add(w); } if (nb.get(v)) { nb.get(v).delete(u); nb.get(v).add(w); }
        s.splice(i, 0, w);
      }
    });
    const done = seqs.map(full);
    // ---- remove every handhole that no route really needs ----
    const through = new Map(); done.forEach((s, ri) => s.forEach((v, i) => { if (hh.has(v) && i > 0 && i < s.length - 1) { let a = through.get(v); if (!a) through.set(v, a = []); a.push([ri, i]); } }));
    const cums = done.map(s => { const c = [0]; for (let i = 1; i < s.length; i++) c.push(c[i - 1] + dist(s[i - 1], s[i])); return c; });
    [...hh].sort((a, b) => (through.get(a) || []).length - (through.get(b) || []).length).forEach(h => {
      const needed = (through.get(h) || []).some(([ri, i]) => { const s = done[ri], c = cums[ri]; let p = i - 1; while (p > 0 && !chamber.has(s[p])) p--; let n = i + 1; while (n < s.length - 1 && !chamber.has(s[n])) n++; return c[n] - c[p] > PRUNE_SPAN; });
      if (!needed) { hh.delete(h); chamber.delete(h); }
    });
    // a handhole that no route passes through is of no use
    [...hh].forEach(h => { if (!(through.get(h) || []).length) { hh.delete(h); chamber.delete(h); } });
    const hhList = [...hh], hhIndex = new Map(hhList.map((v, i) => [v, i]));
    const refOf = v => hhIndex.has(v) ? 'h:' + hhIndex.get(v) : (ref.get(v) || null);

    // ---- each cable: the chambers it passes and its geometry between them ----
    const out = done.map((s, ri) => { const nodes = [routes[ri].from], segs = []; let cur = [V[s[0]]];
      for (let i = 1; i < s.length; i++) { cur.push(V[s[i]]); if (i < s.length - 1 && hhIndex.has(s[i])) { nodes.push('h:' + hhIndex.get(s[i])); segs.push(cur); cur = [V[s[i]]]; } }
      if (cur.length < 2) cur.push(V[s[s.length - 1]]); nodes.push(routes[ri].to); segs.push(cur); return { nodes, segs }; });

    // ---- ducts: one run per stretch with the same content, feeder and distribution kept apart ----
    const pipes = [];
    ['f', 'd'].forEach(layer => {
      const edges = new Map(), adj = new Map(), stops = new Set();
      done.forEach((s, ri) => { if (routes[ri].layer !== layer) return; stops.add(s[0]); stops.add(s[s.length - 1]); const mine = new Set();
        for (let i = 1; i < s.length; i++) { const k = ek(s[i - 1], s[i]); if (mine.has(k)) continue; mine.add(k); let e = edges.get(k); if (!e) { e = { u: s[i - 1], v: s[i], load: 0, od: 0, used: false }; edges.set(k, e); [e.u, e.v].forEach(x => { let a = adj.get(x); if (!a) adj.set(x, a = []); a.push(e); }); } e.load++; e.od = Math.max(e.od, routes[ri].od || 4); } });
      const isBreak = x => { const a = adj.get(x); return !a || a.length !== 2 || chamber.has(x) || stops.has(x) || a[0].load !== a[1].load; };
      const walk = (start, e) => { let x = start, pts = [V[start]], load = e.load, od = e.od; for (;;) { e.used = true; const y = e.u === x ? e.v : e.u; pts.push(V[y]); od = Math.max(od, e.od); x = y; if (isBreak(x)) break; const next = adj.get(x).find(z => !z.used); if (!next) break; e = next; }
        pipes.push({ layer, pts, load, od, a: refOf(start), b: refOf(x) }); };
      adj.forEach((a, x) => { if (isBreak(x)) a.forEach(e => { if (!e.used) walk(x, e); }); });
      edges.forEach(e => { if (!e.used) walk(e.u, e); });
    });
    let runM = 0; pipes.forEach(p => { p.len = FT.pathLen(p.pts); runM += p.len; });
    return { routes: out, hhs: hhList.map(v => V[v]), pipes, runM };
  };

  // which duct for what runs inside: always at least one spare way
  TR.duct = function (layer, load, od) {
    if (layer === 'f') { const cat = FT.PIPE_CAT.find(x => x.id === 'h40'), fit = Math.max(1, Math.floor(Math.pow(0.7 * cat.idmm / (od || 11), 2))); return { ptype: 'hdpe', cat: 'h40', qty: Math.ceil(load / fit) }; }
    if (load <= 1) return { ptype: 'microduct', cat: 'md2', qty: 1 };
    if (load <= 6) return { ptype: 'microduct', cat: 'mc7', qty: 1 };
    return { ptype: 'microduct', cat: 'mc12', qty: Math.ceil(load / 11) };
  };
})(window);
