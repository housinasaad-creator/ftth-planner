/* Auto design to the ST specification: one FDB at the entrance of EVERY building (stage-2 splitter), FDC cabinets with stage-1 splitters,
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
  D.MICRO = 'mf4'; // one small air-blown cable per box: 1 fibre in use, the rest spare (the specification asks for a spare fibre per building)
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
  D.plan = function (blds, olt, opt) {
    opt = opt || {}; const s1 = opt.s1 || 4, s2 = opt.s2 || 4, cap = Math.max(s1, opt.cab || 48), B = FT.BASE_LOSS;
    const kx = Math.cos(olt.ll[1] * Math.PI / 180) * 111320, ky = 110540;
    const P = blds.map(b => ({ id: b.id, c: b.c, ring: b.ring, house: b.house || null, o: b.o || {}, m: morton(Math.floor((b.c[0] * kx) / 6) & 0xffff, Math.floor((b.c[1] * ky) / 6) & 0xffff) })).sort((a, b) => a.m - b.m);
    // the box stands exactly where the house marker is; a house whose marker was not computed yet gets it here, by the same rule
    const fdbs = P.map(p => ({ b: p, ll: p.house ? p.house.slice() : FT.houses.inset(entrance(p.ring, p.c, olt.ll, p.id), p.c).map(v => +v.toFixed(7)) }));
    const cabs = [], used = new Set();
    (opt.spare || []).forEach(sp => { // nearest new boxes first, within reach of that cabinet
      const near = fdbs.filter(f => !used.has(f) && FT.dist(f.ll, sp.ll) <= (opt.reach || 700)).sort((a, b) => FT.dist(a.ll, sp.ll) - FT.dist(b.ll, sp.ll)).slice(0, sp.slots.length);
      if (near.length) { near.forEach(f => used.add(f)); cabs.push({ ll: sp.ll, fdbs: near, existing: sp.id, f: sp.f, slots: sp.slots.slice(0, near.length) }); } });
    const rest = fdbs.filter(f => !used.has(f)), nCab = rest.length ? Math.max(1, Math.ceil(rest.length / cap)) : 0, size = nCab ? Math.ceil(rest.length / nCab) : 0;
    for (let i = 0; i < nCab; i++) { const g = rest.slice(i * size, (i + 1) * size); if (!g.length) break; cabs.push({ ll: FT.roads.snapPoint(avg(g.map(f => f.ll)), 60), fdbs: g }); }
    cabs.sort((a, b) => morton(Math.floor(a.ll[0] * kx / 20) & 0xffff, Math.floor(a.ll[1] * ky / 20) & 0xffff) - morton(Math.floor(b.ll[0] * kx / 20) & 0xffff, Math.floor(b.ll[1] * ky / 20) & 0xffff));
    let worstLoss = 0, feeder = 0, dist = 0, over = 0, splitters = 0, ports = 0;
    let straight = 0; const cabPaths = FT.roads.pathsFrom(olt.ll, cabs.map(c => c.ll));
    cabs.forEach((cab, ci) => {
      cab.nsplit = cab.existing ? 0 : Math.ceil(cab.fdbs.length / s1); splitters += cab.nsplit; ports += cab.nsplit;
      if (!cabPaths[ci] && !cab.existing) straight++; cab.path = cabPaths[ci] || [olt.ll, cab.ll]; cab.len = FT.pathLen(cab.path); if (!cab.existing) feeder += cab.len; cab.cat = D.feederCat(Math.max(1, cab.nsplit));
      const fp = FT.roads.pathsFrom(cab.ll, cab.fdbs.map(f => f.ll));
      cab.fdbs.forEach((f, fi) => {
        if (!fp[fi]) straight++; f.path = fp[fi] || [cab.ll, f.ll]; f.len = FT.pathLen(f.path); dist += f.len;
        const km = (cab.len + f.len + 100) / 1000; f.loss = FT.SPLITTER_LOSS['1:' + s1] + FT.SPLITTER_LOSS['1:' + s2] + km * B.fiber1490 + 6 * B.connector + 4 * B.splice; worstLoss = Math.max(worstLoss, f.loss); if (f.loss > FT.LIMITS.maxLoss) over++;
      });
    });
    // all routes of the design share trenches, duct bundles and handholes
    const odOf = id => (FT.CABLE_CAT.find(x => x.id === id) || {}).od || 11, routes = [], at = [];
    cabs.forEach((cab, ci) => { if (!cab.existing) { at.push([ci, -1]); routes.push({ layer: 'f', pts: cab.path, from: 'o', to: 'c:' + ci, od: odOf(cab.cat) }); }
      cab.fdbs.forEach((f, fi) => { at.push([ci, fi]); routes.push({ layer: 'd', pts: f.path, from: 'c:' + ci, to: 'f:' + ci + ':' + fi, od: odOf(D.MICRO) }); }); });
    const tr = FT.trench.build(routes);
    tr.routes.forEach((r, i) => { const [ci, fi] = at[i]; (fi < 0 ? cabs[ci] : cabs[ci].fdbs[fi]).route = r; });
    return { olt, cabs, s1, s2, straight, hhs: tr.hhs, pipes: tr.pipes, trenchM: tr.runM, homes: P.length, fdbCount: P.length, fdcCount: cabs.length, splitters, ports, feeder, dist, worstLoss, over, ok: over === 0 };
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
      r.plan.olt = olt; return r.plan;
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
      cab.fdbs.forEach((f, k) => {
        const slot = cab.slots ? cab.slots[k] : { ps: Math.floor(k / plan.s1) + 1, p: k % plan.s1 + 1 }, ps = slot.ps, p = slot.p, code = FT.spec.codeFor(F, ps, p, 1, 1), o = f.b.o || {};
        f.slot = slot;
        const fdb = FT.addNode('bk', f.ll, { ratio: '1:' + plan.s2, name: code, code, label: o.num ? FT.num.label(o) : '', cat: 'c_bk', place: 'wall', bld: f.b.id }); tag('n', fdb.id); ids['f:' + i + ':' + k] = fdb.id;
        f.cable = lay(f.route, D.MICRO, () => 'Distribution D01 · ' + code, f.path); f.node = fdb;
        const b = S.bld[f.b.id] = S.bld[f.b.id] || {}; b.fdb = fdb.id; b.ll = f.ll.slice(); b.pt = f.ll.slice(); // the marker stays at its box
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
      cab.fdbs.forEach(f => { if (!f.cable || !f.cable.made) return; join(cab.node.id, { s: cab.node.id + '#' + f.slot.ps, p: f.slot.p }, { c: f.cable.made.id, f: 1 }); join(f.node.id, { c: f.cable.made.id, f: 1 }, { s: f.node.id + '#1', p: 0 }); if (f.drop) join(f.node.id, { s: f.node.id + '#1', p: 1 }, { c: f.drop.id, f: 1 }); });
    });
    Object.keys(by).forEach(node => { const r = F.record(node, true); r.links = r.links.concat(by[node]); if (!r.label) r.label = 'E-' + ((FT.state.nodes[node] || {}).name || ''); });
  };
  // cabinets that still have free splitter outputs (used by an update instead of a new cabinet)
  D.spareCabinets = function (oltId, ratio) {
    const F = FT.fiber, S = FT.state, ix = F.index(), out = [];
    Object.values(S.nodes).forEach(n => {
      const m = /^F(\d+)-PS/.exec(n.code || ''); if (n.type !== 'sk' || !m || F.ratioN(n.ratio) !== ratio) return;
      const slots = []; F.splittersOf(n.id).forEach(sp => { const tr = F.traceSplitter(sp.key, ix); if (!tr.reached || tr.olt !== oltId) return; tr.tree.out.forEach(o => { if (o.state === 'free') slots.push({ ps: sp.i, p: o.port }); }); });
      if (slots.length) out.push({ id: n.id, ll: n.ll, f: +m[1], slots });
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
    const render = () => {
      return (done.length ? '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar() ? 'تحديث تصميم: ' + done.length + ' بيت إلهم علبة وما رح يتغيّر فيهم شي. التصميم للبيوت الجديدة بس (' + fresh.length + ').' : 'Update: ' + done.length + ' building(s) already have a box and stay untouched. Only the ' + fresh.length + ' new one(s) are designed.') + '</div><div class="fl"><input type="checkbox" id="dsSpare"' + (useSpare ? ' checked' : '') + '><span>' + (ar() ? 'استعمل المخارج الفاضية بالخزائن الموجودة أولاً' : 'Use the free outputs of existing cabinets first') + '</span></div>' : '') +
        '<div class="f"><label>' + (ar() ? 'طريقة التمديد' : 'Construction') + '</label><div class="seg" id="dsMedium"><button type="button" data-a="0" class="' + (!aerial ? 'on' : '') + '">' + (ar() ? 'تحت الأرض (خندق دقيق)' : 'Underground (micro-trench)') + '</button><button type="button" data-a="1" class="' + (aerial ? 'on' : '') + '">' + (ar() ? 'هوائي على الجدران' : 'Aerial on walls') + '</button></div>' + (aerial ? '<div class="warnbox" style="margin-top:6px">' + (ar() ? 'الهوائي بدو موافقة خطية من الاتصالات، وعلى الجدران فقط (بدون أعمدة).' : 'Aerial needs written ST approval and is on walls only (no poles).') + '</div>' : '') + '</div>' +
        '<div class="f"><label>OLT</label><select id="dsOlt">' + olts.map(o => '<option value="' + o.id + '"' + (o.id === oltId ? ' selected' : '') + '>' + o.name + '</option>').join('') + '</select></div>' +
        '<div class="two"><div class="f"><label>' + FT.t('ds_split') + '</label><select id="dsSplit">' + D.SPLITS.map((s, i) => '<option value="' + i + '"' + (i === sp ? ' selected' : '') + '>1:' + s[0] + ' (FDC) + 1:' + s[1] + ' (FDB) = 1:' + s[0] * s[1] + '</option>').join('') + '</select></div>' +
        '<div class="f"><label>' + FT.t('ds_cab') + '</label><input id="dsCab" type="text" inputmode="numeric" value="' + cab + '"></div></div>' +
        '<div class="fl"><input type="checkbox" id="dsHomes"' + (homes ? ' checked' : '') + '><span>' + (ar() ? 'ارسم كبل مشترك لكل مبنى (للتخطيط فقط — خارج نطاق المقاول)' : 'Draw a drop cable to each building (planning only — outside the contractor scope)') + '</span></div>' + (busy || !plan ? '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">⏳ ' + (ar() ? 'جاري حساب التصميم بالخلفية… الخريطة تضل شغالة.' : 'Computing the design in the background… the map stays usable.') + '</div>' : (
        '<div class="kv"><span>' + FT.t('buildings') + ' = FDB</span><b>' + plan.fdbCount + '</b></div><div class="kv"><span>FDC</span><b>' + plan.fdcCount + ' · ' + plan.splitters + ' × 1:' + plan.s1 + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'منافذ PON في الـ OLT (ألياف التغذية)' : 'OLT PON ports (feeder fibres)') + '</span><b>' + plan.ports + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'طول مسارات الأنابيب المشتركة' : 'Shared duct runs') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.trenchM)) + '</b></div><div class="kv"><span>' + (ar() ? 'غرف تفتيش HH' : 'Handholes (HH)') + '</span><b>' + plan.hhs.length + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'كبلات التغذية (OLT→FDC)' : 'Feeder cables (OLT→FDC)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.feeder)) + '</b></div><div class="kv"><span>' + (ar() ? 'كبلات التوزيع (FDC→FDB)' : 'Distribution (FDC→FDB)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.dist)) + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'أسوأ فقد عند الـ ONT (الحد 28 dB)' : 'Worst loss at the ONT (limit 28 dB)') + '</span><b style="color:' + (plan.ok ? 'var(--ok)' : 'var(--bad)') + '">' + FT.lt(plan.worstLoss.toFixed(1) + ' dB') + '</b></div>' +
        (plan.straight ? '<div class="warnbox">' + (ar() ? plan.straight + ' مسار ما لقى شارعًا قريبًا فرُسم خطًا مستقيمًا — راجعه يدويًا (قد يمرّ فوق بيوت).' : plan.straight + ' route(s) found no street nearby and are straight lines — check them by hand (they may cross houses).') + '</div>' : '') + (plan.ok ? '' : '<div class="warnbox">' + (ar() ? plan.over + ' علبة FDB تتجاوز 28 dB — قرّب الـ OLT أو قلّل سعة الخزانة.' : plan.over + ' FDB exceed 28 dB — move the OLT closer or reduce the cabinet size.') + '</div>') +
        '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar() ? 'تقدير تخطيطي: علبة FDB عند مدخل كل مبنى، الأنابيب والكبلات تتبع الشوارع. عدّل بعد التطبيق. Ctrl+Z يتراجع.' : 'Planning estimate: one FDB at the entrance of each building; pipes and cables follow the streets. Edit after applying. Ctrl+Z undoes it.') + '</div>'));
    };
    const compute = () => { // the heavy part runs in the worker; stale answers are dropped
      const my = ++tok; busy = true; plan = null; FT.map.setDraw([]); again();
      D.planAsync(blds, FT.state.nodes[oltId], { s1: D.SPLITS[sp][0], s2: D.SPLITS[sp][1], cab, spare: useSpare ? D.spareCabinets(oltId, D.SPLITS[sp][0]) : [] }).then(p => { if (my !== tok) return; plan = p; busy = false; if (!document.getElementById('dsOlt')) return; D.preview(plan); again(); }).catch(() => { if (my !== tok) return; busy = false; plan = null; again(); });
    };
    U().modal(FT.t('t_design'), render(), [{ label: FT.t('close'), fn: () => { FT.map.setDraw([]); FT.T.setTool('select'); } }, { label: FT.t('an_apply'), cls: 'pri', fn: async () => { while (busy) await new Promise(r => setTimeout(r, 40)); FT.map.setDraw([]); if (!plan) return; FT._designHomes = 0; const n = D.apply(plan, { homes, aerial }); FT.T.setTool('select'); U().toast(n + ' ✓'); FT.designResults && setTimeout(() => FT.designResults.open(n), 300); } }], function wire(root) {
      again = () => { if (!document.getElementById('dsOlt')) return; root.innerHTML = render(); wire(root); };
      root.querySelectorAll('#dsMedium button').forEach(b => b.onclick = () => { aerial = b.dataset.a === '1'; again(); });
      const su = root.querySelector('#dsSpare'); if (su) su.onchange = e => { useSpare = e.target.checked; compute(); };
      root.querySelector('#dsOlt').onchange = e => { oltId = e.target.value; compute(); }; root.querySelector('#dsHomes').onchange = e => { homes = e.target.checked; };
      root.querySelector('#dsSplit').onchange = e => { sp = +e.target.value; compute(); };
      root.querySelector('#dsCab').onchange = e => { const v = parseInt(String(e.target.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v >= 4) cab = Math.min(v, 400); compute(); };
    }, () => { tok++; FT.map.setDraw([]); if (FT.T.tool === 'design') FT.T.setTool('select'); });
    compute();
  };
})(window);
