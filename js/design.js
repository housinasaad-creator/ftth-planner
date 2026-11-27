/* Auto design to the ST specification: FDB at the entrance of EVERY building, as many as its flats need (stage-2 splitters), FDC cabinets with stage-1 splitters,
   total split <= 1:16 in two stages, loss <= 28 dB. Routes follow the streets. A planning estimate: edit afterwards. One undo step. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const D = FT.design = {};
  const U = () => FT.UI, ar = () => FT.lang === 'ar';
  const pad = (n, w) => String(n).padStart(w || 2, '0');

  function morton(x, y) { let z = 0; for (let i = 0; i < 16; i++) z |= ((x >> i) & 1) << (2 * i) | ((y >> i) & 1) << (2 * i + 1); return z >>> 0; }
  const avg = arr => [arr.reduce((s, p) => s + p[0], 0) / arr.length, arr.reduce((s, p) => s + p[1], 0) / arr.length];
  // the point on the building wall that faces the nearest street (the FDB sits at the entrance)
  function entrance(ring, c, from, id) {
    const R = FT.roads; let best = null;
    for (let i = 0; i < ring.length && R.on; i++) { // middle of every wall: the one with the shortest street stub that crosses no other house
      const a = ring[i], b = ring[(i + 1) % ring.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], np = R.nearest(m, 60); if (!np) continue;
      let bad = R.inBuilding(m, id) ? 1 : 0; for (const t of [0.25, 0.5, 0.75]) if (R.inBuilding([np.ll[0] + (m[0] - np.ll[0]) * t, np.ll[1] + (m[1] - np.ll[1]) * t], id)) bad++;
      const score = FT.dist(np.ll, m) + bad * 500; if (!best || score < best.score) best = { score, m };
    }
    if (best) return best.m;
    const rn = R.nearest ? R.nearest(c, 80) : null, target = rn ? rn.ll : from, closed = ring.concat([ring[0]]);
    return FT.nearestOnPath(target, closed).pt;
  }
  D.SPLITS = [[4, 4], [2, 8], [8, 2]]; // stage 1 x stage 2 = 16
  D.MICRO = 'mf4'; // the small air-blown cable of a box (4 fibres)
  // the cable of one box: a fibre for each of its splitters and at least one spare (the specification asks for a spare fibre per building)
  D.distCat = splitters => { const need = splitters + 1; if (need <= 4) return D.MICRO; const c = FT.CABLE_CAT.filter(x => x.group === 'Distribution' && x.core >= need).sort((a, b) => a.core - b.core)[0]; return c ? c.id : D.MICRO; };
  // how many splitters and boxes a building needs: every flat gets its own splitter output
  D.boxesFor = (flats, s2, boxPorts) => { const splitters = Math.max(1, Math.ceil(flats / s2)), perBox = Math.max(1, Math.floor((boxPorts || 16) / s2)), n = Math.ceil(splitters / perBox), out = [];
    let left = splitters, homes = flats; for (let i = 0; i < n; i++) { const k = Math.ceil(left / (n - i)), h = Math.min(homes, k * s2); out.push({ nsplit: k, homes: h }); left -= k; homes -= h; } return out; };
  D.feederCat = fibres => { const need = fibres + Math.max(2, Math.ceil(fibres * 0.2)); const c = FT.CABLE_CAT.filter(x => x.group === 'Feeder').find(x => x.core >= need); return (c || FT.CABLE_CAT.filter(x => x.group === 'Feeder').pop()).id; };

  // a long route gets a handhole (HH) every <= 230 m, so the distance between MH/HH never exceeds the 250 m limit
  D.split = function (path, maxSeg) {
    const L = FT.pathLen(path), n = Math.max(1, Math.ceil(L / (maxSeg || 230))); if (n === 1) return [path];
    const step = L / n, out = []; let cur = [path[0]], pos = 0, k = 1, nextCut = step;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], sl = FT.dist(a, b);
      while (k < n && pos + sl >= nextCut - 1e-9) { const t = sl ? (nextCut - pos) / sl : 0, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; cur.push(q); out.push(cur); cur = [q]; k++; nextCut = step * k; }
      cur.push(b); pos += sl;
    }
    out.push(cur); return out;
  };
  // far enough apart to be told apart and picked on the map, in the direction of the middle of the building
  D.BOX_STEP_M = 3.5;
  function beside(at, centre, metres) {
    const kx = Math.cos(at[1] * Math.PI / 180) * 111320, ky = 110540; let x = (centre[0] - at[0]) * kx, y = (centre[1] - at[1]) * ky; const d = Math.hypot(x, y);
    if (d < 0.5) { x = 1; y = 0; } else { x /= d; y /= d; }
    return [+(at[0] + x * metres / kx).toFixed(7), +(at[1] + y * metres / ky).toFixed(7)];
  }
  D.plan = function (blds, olt, opt) {
    opt = opt || {}; const s1 = opt.s1 || 4, s2 = opt.s2 || 4, cap = Math.max(s1, opt.cab || 48), perFloor = opt.perFloor || FT.houses.setting().perFloor, boxPorts = opt.boxPorts || FT.houses.setting().boxPorts;
    const kx = Math.cos(olt.ll[1] * Math.PI / 180) * 111320, ky = 110540;
    const P = blds.map(b => ({ id: b.id, c: b.c, ring: b.ring, house: b.house || null, o: b.o || {}, m: morton(Math.floor((b.c[0] * kx) / 6) & 0xffff, Math.floor((b.c[1] * ky) / 6) & 0xffff) })).sort((a, b) => a.m - b.m);
    // the box stands exactly where the house marker is; a house whose marker was not computed yet gets it here, by the same rule
    const fdbs = []; let flats = 0;
    P.forEach(p => { const at = p.house ? p.house.slice() : FT.houses.inset(entrance(p.ring, p.c, olt.ll, p.id), p.c).map(v => +v.toFixed(7)), homes = FT.houses.homesOf(p.o, perFloor); flats += homes;
      D.boxesFor(homes, s2, boxPorts).forEach((x, i) => fdbs.push({ b: p, i, nsplit: x.nsplit, homes: x.homes, ll: i ? beside(at, p.c, i * D.BOX_STEP_M) : at })); }); // further boxes of one building stand in a row going into it
    // a cabinet is full when its distribution splitter outputs reach the chosen number (and never above 64 first-stage splitters)
    const room = Math.min(cap, 64 * s1), slotsOf = list => list.reduce((a, f) => a + f.nsplit, 0);
    const cabs = [], used = new Set();
    (opt.spare || []).forEach(sp => { // nearest new boxes first, within reach of that cabinet
      let free = sp.slots.length; const near = [];
      fdbs.filter(f => !used.has(f) && FT.dist(f.ll, sp.ll) <= (opt.reach || 700)).sort((a, b) => FT.dist(a.ll, sp.ll) - FT.dist(b.ll, sp.ll)).forEach(f => { if (f.nsplit <= free) { near.push(f); free -= f.nsplit; } });
      if (near.length) { near.forEach(f => used.add(f)); cabs.push({ ll: sp.ll, fdbs: near, existing: sp.id, f: sp.f, slots: sp.slots.slice(0, slotsOf(near)), feedM: sp.feedM, feedHoles: sp.feedHoles }); } });
    const rest = fdbs.filter(f => !used.has(f)), nCab = rest.length ? Math.max(1, Math.ceil(slotsOf(rest) / room)) : 0, size = nCab ? Math.ceil(slotsOf(rest) / nCab) : 0;
    let group = [];
    const close = () => { if (group.length) cabs.push({ ll: FT.roads.snapPoint(avg(group.map(f => f.ll)), 60), fdbs: group }); group = []; };
    rest.forEach(f => { const n = slotsOf(group); if (group.length && (n + f.nsplit > room || n >= size)) close(); group.push(f); }); close();
    cabs.sort((a, b) => morton(Math.floor(a.ll[0] * kx / 20) & 0xffff, Math.floor(a.ll[1] * ky / 20) & 0xffff) - morton(Math.floor(b.ll[0] * kx / 20) & 0xffff, Math.floor(b.ll[1] * ky / 20) & 0xffff));
    let feeder = 0, dist = 0, splitters = 0, ports = 0;
    let straight = 0; const cabPaths = FT.roads.pathsFrom(olt.ll, cabs.map(c => c.ll));
    cabs.forEach((cab, ci) => {
      cab.nsplit = cab.existing ? 0 : Math.ceil(slotsOf(cab.fdbs) / s1); splitters += cab.nsplit; ports += cab.nsplit;
      if (!cabPaths[ci] && !cab.existing) straight++; cab.path = cabPaths[ci] || [olt.ll, cab.ll]; cab.len = FT.pathLen(cab.path); if (!cab.existing) feeder += cab.len; cab.cat = D.feederCat(Math.max(1, cab.nsplit));
      const fp = FT.roads.pathsFrom(cab.ll, cab.fdbs.map(f => f.ll));
      cab.fdbs.forEach((f, fi) => {
        if (!fp[fi]) straight++; f.path = fp[fi] || [cab.ll, f.ll]; f.len = FT.pathLen(f.path); dist += f.len;
      });
    });
    // all routes of the design share trenches, duct bundles and handholes
    const odOf = id => (FT.CABLE_CAT.find(x => x.id === id) || {}).od || 11, routes = [], at = [];
    cabs.forEach((cab, ci) => { if (!cab.existing) { at.push([ci, -1]); routes.push({ layer: 'f', pts: cab.path, from: 'o', to: 'c:' + ci, od: odOf(cab.cat) }); }
      cab.fdbs.forEach((f, fi) => { at.push([ci, fi]); routes.push({ layer: 'd', pts: f.path, from: 'c:' + ci, to: 'f:' + ci + ':' + fi, od: odOf(D.distCat(f.nsplit)) }); }); });
    const tr = FT.trench.build(routes);
    tr.routes.forEach((r, i) => { const [ci, fi] = at[i]; (fi < 0 ? cabs[ci] : cabs[ci].fdbs[fi]).route = r; });
    const plan = { olt, cabs, s1, s2, straight, hhs: tr.hhs, pipes: tr.pipes, trenchM: tr.runM, homes: P.length, flats, perFloor, boxPorts, boxSplitters: slotsOf(fdbs), unknownFlats: P.filter(p => !(p.o && p.o.flats > 0)).length, fdbCount: fdbs.length, fdcCount: cabs.length, splitters, ports, feeder, dist, worstLoss: 0, over: 0, ok: true };
    if (FT.fiber) D.score(plan); // (the background worker has no fibre engine: the page scores its answer)
    return plan;
  };
  // the expected loss of every planned box, by the same rule as the finished network
  D.score = function (plan, aerial) {
    const C = FT.fiber.cfg(), chambers = r => aerial || !r ? 0 : r.nodes.filter(x => String(x).indexOf('h:') === 0).length;
    const metres = (r, fallback) => aerial || !r ? fallback : r.segs.reduce((a, s) => a + FT.pathLen(s), 0);
    let worst = 0, over = 0;
    plan.cabs.forEach(cab => cab.fdbs.forEach(f => {
      const built = cab.existing && cab.feedM != null;
      const b = FT.fiber.compose({ metres: (built ? cab.feedM : metres(cab.route, cab.len)) + metres(f.route, f.len), dropM: C.dropM, boxes: 2, holes: (built ? cab.feedHoles : chambers(cab.route)) + chambers(f.route), ratios: ['1:' + plan.s1, '1:' + plan.s2] });
      f.loss = b.worstLoss; worst = Math.max(worst, f.loss); if (f.loss > FT.LIMITS.maxLoss) over++;
    }));
    plan.worstLoss = worst; plan.over = over; plan.ok = over === 0; return plan;
  };
  // ---- the same planning, but on a background thread (the page keeps moving while it computes) ----
  let W; const wait = new Map(); let wid = 0; D.useWorker = true;
  function getWorker() {
    if (W !== undefined) return W;
    try {
      W = new Worker('js/worker.js');
      W.onmessage = e => { const m = e.data, p = wait.get(m.id); if (!p) return; wait.delete(m.id); m.err ? p.rej(new Error(m.err)) : p.res(m); };
      W.onerror = () => { const all = [...wait.values()]; wait.clear(); W = null; all.forEach(p => p.rej(new Error('worker'))); };
    } catch (e) { W = null; }
    return W;
  }
  const call = msg => new Promise((res, rej) => { const w = getWorker(); if (!w) return rej(new Error('noworker')); const id = ++wid; wait.set(id, { res, rej }); w.postMessage(Object.assign({ id }, msg)); });
  D.workerReset = () => { D._loaded = false; };
  D.planAsync = async function (blds, olt, opt) {
    if (!D.useWorker || !getWorker()) return D.plan(blds, olt, opt);
    try {
      if (!D._loaded) { await call(Object.assign({ t: 'load' }, FT.roads.snapshot())); D._loaded = true; }
      const r = await call({ t: 'plan', on: FT.roads.on, blds, olt: { id: olt.id, ll: olt.ll }, opt });
      r.plan.olt = olt; return D.score(r.plan);
    } catch (e) { return D.plan(blds, olt, opt); }
  };
  D.preview = function (plan) {
    const f = []; plan.cabs.forEach(c => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c.path } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c.ll } }); c.fdbs.forEach(x => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: x.path } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: x.ll } }); }); });
    FT.map.setDraw(f);
  };
  D.apply = function (plan, opt) {
    const S = FT.state; FT.commit(); S.seq.design = (S.seq.design || 0) + 1; const fid = FT.uid('f'), fname = 'Design-' + S.seq.design; (S.folders = S.folders || {})[fid] = { name: fname }; S.fmap = S.fmap || {};
    const tag = (k, id) => { S.fmap[k + ':' + id] = fid; };
    const ids = { o: plan.olt.id }, id = r => r ? ids[r] : null;
    const cables = []; // laid once every node exists
    const lay = (route, ccat, name, plain) => { const x = { route, ccat, name, plain }; cables.push(x); return x; };
    const aerial = !!(opt && opt.aerial);
    let maxF = 0; Object.values(S.nodes).forEach(n => { const m = /^F(\d+)-PS/.exec(n.code || ''); if (m) maxF = Math.max(maxF, +m[1]); });
    plan.cabs.forEach((cab, i) => {
      let fdc = cab.existing ? S.nodes[cab.existing] : null; if (cab.existing && !fdc) return;
      const F = fdc ? cab.f : ++maxF;
      if (!fdc) { fdc = FT.addNode('sk', cab.ll, { ratio: '1:' + plan.s1, nsplit: cab.nsplit, name: 'FDC-F' + pad(F), code: 'F' + pad(F) + '-PS01', cat: 'c_sk', place: aerial ? 'wall' : 'buried' }); tag('n', fdc.id); cab.feed = lay(cab.route, cab.cat, c => 'Feeder F' + pad(F) + ' · ' + c.core + 'C', cab.path); }
      ids['c:' + i] = fdc.id; cab.node = fdc;
      let taken = 0;
      cab.fdbs.forEach((f, k) => {
        f.slots = []; for (let j = 0; j < f.nsplit; j++, taken++) f.slots.push(cab.slots ? cab.slots[taken] : { ps: Math.floor(taken / plan.s1) + 1, p: taken % plan.s1 + 1 });
        const slot = f.slots[0], code = FT.spec.codeFor(F, slot.ps, slot.p, 1, f.i + 1), o = f.b.o || {};
        const fdb = FT.addNode('bk', f.ll, { ratio: '1:' + plan.s2, nsplit: f.nsplit, homes: f.homes, name: code, code, label: o.num ? FT.num.label(o) : '', cat: 'c_bk', place: 'wall', bld: f.b.id }); tag('n', fdb.id); ids['f:' + i + ':' + k] = fdb.id;
        f.cable = lay(f.route, D.distCat(f.nsplit), () => 'Distribution D01 · ' + code, f.path); f.node = fdb;
        const b = S.bld[f.b.id] = S.bld[f.b.id] || {}; if (!f.i) b.fdb = fdb.id; if (!f.i) { b.ll = f.ll.slice(); b.pt = f.ll.slice(); } // the marker stays at its first box
        if (opt && opt.homes && FT._designHomes < 900) { S.seq.sub++; FT._designHomes++; const sub = { id: FT.uid('s'), name: 'ONT-' + S.seq.sub, node: fdb.id, bld: f.b.id, ll: f.b.c, port: 1 }; S.subs[sub.id] = sub; sub.spl = 1; b.st = 1; const dr = FT.addCable([fdb.ll, f.b.c], fdb.id, fdb.id, 'dr2', 'free', [fdb.id, fdb.id], [[fdb.ll, f.b.c]]); dr.name = 'Drop ' + sub.name; dr.sub = sub.id; tag('c', dr.id); f.drop = dr; }
      });
    });
    if (!aerial) (plan.hhs || []).forEach((ll, i) => { const hh = FT.addNode('hh', ll, { cat: 'c_fm', place: 'buried' }); tag('n', hh.id); ids['h:' + i] = hh.id; }); // after the cabinets and boxes, so the tree lists those first
    // shared ducts: one run per stretch, sized to what is inside (a run may end at a street branch, without a chamber)
    if (!aerial) plan.pipes.forEach(r => { const d = FT.trench.duct(r.layer, r.load, r.od), pp = FT.addPipe(r.pts, id(r.a), id(r.b), d.ptype, d.cat); pp.load = r.load; pp.qty = d.qty; pp.od = r.od; tag('p', pp.id); });
    cables.forEach(x => {
      let nodeIds = x.route.nodes.map(id), segs = x.route.segs;
      if (aerial) { nodeIds = [nodeIds[0], nodeIds[nodeIds.length - 1]]; const line = x.plain && x.plain.length > 1 ? x.plain.map(q => q.slice()) : [S.nodes[nodeIds[0]].ll, S.nodes[nodeIds[1]].ll]; line[0] = S.nodes[nodeIds[0]].ll.slice(); line[line.length - 1] = S.nodes[nodeIds[1]].ll.slice(); segs = [line]; }
      const path = [].concat(...segs.map((s, i) => i ? s.slice(1) : s)); const c = FT.addCable(path, nodeIds[0], nodeIds[nodeIds.length - 1], x.ccat, aerial ? 'aerial' : 'duct', nodeIds, segs); c.name = x.name(c); if (!aerial) c.shared = 1; tag('c', c.id); x.made = c; });
    D.splicePlan(plan);
    FT.changed('design'); return fname;
  };

  // every fusion of the design: PON port -> feeder strand -> cabinet splitter -> distribution strand -> box splitter (-> drop)
  D.splicePlan = function (plan) {
    const F = FT.fiber, olt = plan.olt.id, by = {}, join = (node, a, b) => (by[node] = by[node] || []).push([a, b]);
    let pon = F.usedPon(olt).reduce((m, p) => Math.max(m, p), 0);
    plan.cabs.forEach(cab => {
      if (!cab.node) return;
      if (cab.feed && cab.feed.made) for (let j = 1; j <= cab.nsplit; j++) { join(olt, { o: ++pon }, { c: cab.feed.made.id, f: j }); join(cab.node.id, { c: cab.feed.made.id, f: j }, { s: cab.node.id + '#' + j, p: 0 }); }
      cab.fdbs.forEach(f => { if (!f.cable || !f.cable.made) return; f.slots.forEach((slot, j) => { join(cab.node.id, { s: cab.node.id + '#' + slot.ps, p: slot.p }, { c: f.cable.made.id, f: j + 1 }); join(f.node.id, { c: f.cable.made.id, f: j + 1 }, { s: f.node.id + '#' + (j + 1), p: 0 }); }); if (f.drop) join(f.node.id, { s: f.node.id + '#1', p: 1 }, { c: f.drop.id, f: 1 }); });
    });
    Object.keys(by).forEach(node => { const r = F.record(node, true); r.links = r.links.concat(by[node]); if (!r.label) r.label = 'E-' + ((FT.state.nodes[node] || {}).name || ''); });
  };
  // cabinets that still have free splitter outputs (used by an update instead of a new cabinet)
  D.spareCabinets = function (oltId, ratio) {
    const F = FT.fiber, S = FT.state, ix = F.index(), out = [];
    Object.values(S.nodes).forEach(n => {
      const m = /^F(\d+)-PS/.exec(n.code || ''); if (n.type !== 'sk' || !m || F.ratioN(n.ratio) !== ratio) return;
      const slots = []; let feedM = null, feedHoles = 0; F.splittersOf(n.id).forEach(sp => { const tr = F.traceSplitter(sp.key, ix); if (!tr.reached || tr.olt !== oltId) return; tr.tree.out.forEach(o => { if (o.state === 'free') slots.push({ ps: sp.i, p: o.port }); });
        if (feedM == null && tr.budget) { feedM = tr.budget.fibreM; feedHoles = tr.budget.holes; } }); // the way already built from the OLT to this cabinet
      if (slots.length) out.push({ id: n.id, ll: n.ll, f: +m[1], slots, feedM, feedHoles });
    });
    return out;
  };
  // buildings of the list that already have their box
  D.served = blds => blds.filter(b => { const o = FT.state.bld[b.id] || {}; return o.fdb && FT.state.nodes[o.fdb]; });

  // ---- dialog ----
  D.open = async function (ring) {
    const olts = Object.values(FT.state.nodes).filter(n => n.type === 'olt');
    if (!olts.length) { U().toast(ar() ? 'ضع OLT أولًا ثم أعد المحاولة' : 'Place an OLT first, then try again'); FT.T.setTool('select'); return; }
    await FT.map.ensureTiles(FT.bboxOf(ring)); const all = FT.map.buildingsInRing(ring);
    if (!all.length) { U().toast(FT.t('dxf_none')); FT.T.setTool('select'); return; }
    const done = D.served(all), fresh = all.filter(b => !done.includes(b));
    if (!fresh.length) { U().toast(ar() ? 'كل البيوت بهالمنطقة إلها علبة. ما في شي جديد للتصميم.' : 'Every building here already has its box. Nothing new to design.'); FT.T.setTool('select'); return; }
    const blds = fresh;
    let oltId = olts[0].id, homes = false, aerial = false, useSpare = done.length > 0, plan = null, sp = 0, cab = 48, busy = true, tok = 0, again = () => {}; D.workerReset();
    let perFloor = FT.houses.setting().perFloor, boxPorts = FT.houses.setting().boxPorts, cmp = '';
    const render = () => {
      if (plan) D.score(plan, aerial);
      return (done.length ? '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar() ? 'تحديث تصميم: ' + done.length + ' بيت إلهم علبة وما رح يتغيّر فيهم شي. التصميم للبيوت الجديدة بس (' + fresh.length + ').' : 'Update: ' + done.length + ' building(s) already have a box and stay untouched. Only the ' + fresh.length + ' new one(s) are designed.') + '</div><div class="fl"><input type="checkbox" id="dsSpare"' + (useSpare ? ' checked' : '') + '><span>' + (ar() ? 'استعمل المخارج الفاضية بالخزائن الموجودة أولاً' : 'Use the free outputs of existing cabinets first') + '</span></div>' : '') +
        '<div class="f"><label>' + (ar() ? 'طريقة التمديد' : 'Construction') + '</label><div class="seg" id="dsMedium"><button type="button" data-a="0" class="' + (!aerial ? 'on' : '') + '">' + (ar() ? 'تحت الأرض (خندق دقيق)' : 'Underground (micro-trench)') + '</button><button type="button" data-a="1" class="' + (aerial ? 'on' : '') + '">' + (ar() ? 'هوائي على الجدران' : 'Aerial on walls') + '</button></div>' + (aerial ? '<div class="warnbox" style="margin-top:6px">' + (ar() ? 'الهوائي بدو موافقة خطية من الاتصالات، وعلى الجدران فقط (بدون أعمدة).' : 'Aerial needs written ST approval and is on walls only (no poles).') + '</div>' : '') + '</div>' +
        '<div class="f"><label>OLT</label><select id="dsOlt">' + olts.map(o => '<option value="' + o.id + '"' + (o.id === oltId ? ' selected' : '') + '>' + o.name + '</option>').join('') + '</select></div>' +
        '<div class="two"><div class="f"><label>' + FT.t('ds_split') + '</label><select id="dsSplit">' + D.SPLITS.map((s, i) => '<option value="' + i + '"' + (i === sp ? ' selected' : '') + '>1:' + s[0] + ' (FDC) + 1:' + s[1] + ' (FDB) = 1:' + s[0] * s[1] + '</option>').join('') + '</select></div>' +
        '<div class="f"><label>' + FT.t('ds_cab') + '</label><input id="dsCab" type="text" inputmode="numeric" value="' + cab + '"></div></div>' +
        '<div class="two"><div class="f"><label>' + (ar() ? 'شقق بكل طابق (للمباني يلي ما انكتبت شققها)' : 'Flats per floor (buildings with no count)') + '</label><input id="dsPerFloor" type="text" inputmode="numeric" value="' + perFloor + '"></div>' +
        '<div class="f"><label>' + (ar() ? 'أكبر عدد منافذ بالعلبة الواحدة' : 'Most ports in one box') + '</label><select id="dsPorts">' + [4, 8, 16, 24, 32].map(v => '<option value="' + v + '"' + (v === boxPorts ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div></div>' +
        '<button type="button" class="btn full" id="dsCmp" style="margin-bottom:6px">' + (ar() ? 'قارن خطط التقسيم التلاتة' : 'Compare the three split plans') + '</button><div id="dsCmpOut">' + (cmp || '') + '</div>' +
        '<div class="fl"><input type="checkbox" id="dsHomes"' + (homes ? ' checked' : '') + '><span>' + (ar() ? 'ارسم كبل مشترك لكل مبنى (للتخطيط فقط — خارج نطاق المقاول)' : 'Draw a drop cable to each building (planning only — outside the contractor scope)') + '</span></div>' + (busy || !plan ? '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">⏳ ' + (ar() ? 'جاري حساب التصميم بالخلفية… الخريطة تضل شغالة.' : 'Computing the design in the background… the map stays usable.') + '</div>' : (
        '<div class="kv"><span>' + FT.t('buildings') + '</span><b>' + plan.homes + '</b></div><div class="kv"><span>' + (ar() ? 'الشقق (مشتركين محتملين)' : 'Flats (possible subscribers)') + '</span><b>' + plan.flats + (plan.unknownFlats ? ' <small style="color:var(--warn)">' + (ar() ? plan.unknownFlats + ' مبنى شققه مقدّرة' : plan.unknownFlats + ' building(s) estimated') + '</small>' : '') + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'علب FDB · مقسّمات داخلها' : 'FDB boxes · splitters inside') + '</span><b>' + plan.fdbCount + ' · ' + plan.boxSplitters + ' × 1:' + plan.s2 + '</b></div><div class="kv"><span>FDC</span><b>' + plan.fdcCount + ' · ' + plan.splitters + ' × 1:' + plan.s1 + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'منافذ PON في الـ OLT (ألياف التغذية)' : 'OLT PON ports (feeder fibres)') + '</span><b>' + plan.ports + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'طول مسارات الأنابيب المشتركة' : 'Shared duct runs') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.trenchM)) + '</b></div><div class="kv"><span>' + (ar() ? 'غرف تفتيش HH' : 'Handholes (HH)') + '</span><b>' + plan.hhs.length + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'كبلات التغذية (OLT→FDC)' : 'Feeder cables (OLT→FDC)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.feeder)) + '</b></div><div class="kv"><span>' + (ar() ? 'كبلات التوزيع (FDC→FDB)' : 'Distribution (FDC→FDB)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.dist)) + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'أسوأ فقد عند الـ ONT (الحد 28 dB)' : 'Worst loss at the ONT (limit 28 dB)') + '</span><b style="color:' + (plan.ok ? 'var(--ok)' : 'var(--bad)') + '">' + FT.lt(plan.worstLoss.toFixed(1) + ' dB') + '</b></div>' +
        (plan.straight ? '<div class="warnbox">' + (ar() ? plan.straight + ' مسار ما لقى شارعًا قريبًا فرُسم خطًا مستقيمًا — راجعه يدويًا (قد يمرّ فوق بيوت).' : plan.straight + ' route(s) found no street nearby and are straight lines — check them by hand (they may cross houses).') + '</div>' : '') + (plan.ok ? '' : '<div class="warnbox">' + (ar() ? plan.over + ' علبة FDB تتجاوز 28 dB — قرّب الـ OLT أو قلّل سعة الخزانة.' : plan.over + ' FDB exceed 28 dB — move the OLT closer or reduce the cabinet size.') + '</div>') +
        '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar() ? 'تقدير تخطيطي: علب FDB عند مدخل كل مبنى حسب عدد شققه، الأنابيب والكبلات تتبع الشوارع. عدّل بعد التطبيق. Ctrl+Z يتراجع.' : 'Planning estimate: FDB boxes at the entrance of each building, as many as its flats need; ducts and cables follow the streets. Edit after applying. Ctrl+Z undoes it.') + '</div>'));
    };
    const compute = () => { // the heavy part runs in the worker; stale answers are dropped
      const my = ++tok; busy = true; plan = null; cmp = ''; FT.map.setDraw([]); again();
      D.planAsync(blds, FT.state.nodes[oltId], { s1: D.SPLITS[sp][0], s2: D.SPLITS[sp][1], cab, perFloor, boxPorts, spare: useSpare ? D.spareCabinets(oltId, D.SPLITS[sp][0]) : [] }).then(p => { if (my !== tok) return; plan = p; busy = false; if (!document.getElementById('dsOlt')) return; D.preview(plan); again(); }).catch(() => { if (my !== tok) return; busy = false; plan = null; again(); });
    };
    U().modal(FT.t('t_design'), render(), [{ label: FT.t('close'), fn: () => { FT.map.setDraw([]); FT.T.setTool('select'); } }, { label: FT.t('an_apply'), cls: 'pri', fn: async () => { while (busy) await new Promise(r => setTimeout(r, 40)); FT.map.setDraw([]); if (!plan) return; FT._designHomes = 0; FT.state.cfg = FT.state.cfg || {}; FT.state.cfg.homes = { perFloor, boxPorts }; const n = D.apply(plan, { homes, aerial }); FT.T.setTool('select'); U().toast(n + ' ✓'); FT.designResults && setTimeout(() => FT.designResults.open(n), 300); } }], function wire(root) {
      again = () => { if (!document.getElementById('dsOlt')) return; root.innerHTML = render(); wire(root); };
      root.querySelectorAll('#dsMedium button').forEach(b => b.onclick = () => { aerial = b.dataset.a === '1'; again(); });
      const su = root.querySelector('#dsSpare'); if (su) su.onchange = e => { useSpare = e.target.checked; compute(); };
      root.querySelector('#dsOlt').onchange = e => { oltId = e.target.value; compute(); }; root.querySelector('#dsHomes').onchange = e => { homes = e.target.checked; };
      root.querySelector('#dsSplit').onchange = e => { sp = +e.target.value; compute(); };
      root.querySelector('#dsCmp').onclick = async () => { if (busy) return; const my = tok, btn = root.querySelector('#dsCmp'); btn.disabled = true; btn.textContent = '⏳'; const rows = await FT.plus.compare(blds, FT.state.nodes[oltId], { cab, perFloor, boxPorts }, useSpare ? s => D.spareCabinets(oltId, s) : null); if (my !== tok) return; cmp = FT.plus.compareHtml(rows); again(); };
      const ap = v => parseInt(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);
      root.querySelector('#dsPerFloor').onchange = e => { const v = ap(e.target.value); if (v >= 1) perFloor = Math.min(v, 20); compute(); }; root.querySelector('#dsPorts').onchange = e => { boxPorts = +e.target.value; compute(); };
      root.querySelector('#dsCab').onchange = e => { const v = parseInt(String(e.target.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v >= 4) cab = Math.min(v, 400); compute(); };
    }, () => { tok++; FT.map.setDraw([]); if (FT.T.tool === 'design') FT.T.setTool('select'); });
    compute();
  };
})(window);
