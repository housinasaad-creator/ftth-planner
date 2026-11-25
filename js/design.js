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
    const P = blds.map(b => ({ id: b.id, c: b.c, ring: b.ring, o: b.o || {}, m: morton(Math.floor((b.c[0] * kx) / 6) & 0xffff, Math.floor((b.c[1] * ky) / 6) & 0xffff) })).sort((a, b) => a.m - b.m);
    const fdbs = P.map(p => ({ b: p, ll: entrance(p.ring, p.c, olt.ll, p.id) }));
    const nCab = Math.max(1, Math.ceil(fdbs.length / cap)), size = Math.ceil(fdbs.length / nCab), cabs = [];
    for (let i = 0; i < nCab; i++) { const g = fdbs.slice(i * size, (i + 1) * size); if (!g.length) break; cabs.push({ ll: FT.roads.snapPoint(avg(g.map(f => f.ll)), 60), fdbs: g }); }
    cabs.sort((a, b) => morton(Math.floor(a.ll[0] * kx / 20) & 0xffff, Math.floor(a.ll[1] * ky / 20) & 0xffff) - morton(Math.floor(b.ll[0] * kx / 20) & 0xffff, Math.floor(b.ll[1] * ky / 20) & 0xffff));
    let worstLoss = 0, feeder = 0, dist = 0, over = 0, splitters = 0, ports = 0;
    let straight = 0; const cabPaths = FT.roads.pathsFrom(olt.ll, cabs.map(c => c.ll));
    cabs.forEach((cab, ci) => {
      cab.nsplit = Math.ceil(cab.fdbs.length / s1); splitters += cab.nsplit; ports += cab.nsplit;
      if (!cabPaths[ci]) straight++; cab.path = cabPaths[ci] || [olt.ll, cab.ll]; cab.len = FT.pathLen(cab.path); feeder += cab.len; cab.cat = D.feederCat(cab.nsplit);
      const fp = FT.roads.pathsFrom(cab.ll, cab.fdbs.map(f => f.ll));
      cab.fdbs.forEach((f, fi) => {
        if (!fp[fi]) straight++; f.path = fp[fi] || [cab.ll, f.ll]; f.len = FT.pathLen(f.path); dist += f.len;
        const km = (cab.len + f.len + 100) / 1000; f.loss = FT.SPLITTER_LOSS['1:' + s1] + FT.SPLITTER_LOSS['1:' + s2] + km * B.fiber1490 + 6 * B.connector + 4 * B.splice; worstLoss = Math.max(worstLoss, f.loss); if (f.loss > FT.LIMITS.maxLoss) over++;
      });
    });
    return { olt, cabs, s1, s2, straight, homes: P.length, fdbCount: P.length, fdcCount: cabs.length, splitters, ports, feeder, dist, worstLoss, over, ok: over === 0 };
  };
  D.preview = function (plan) {
    const f = []; plan.cabs.forEach(c => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c.path } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c.ll } }); c.fdbs.forEach(x => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: x.path } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: x.ll } }); }); });
    FT.map.setDraw(f);
  };
  D.apply = function (plan, opt) {
    const S = FT.state; FT.commit(); S.seq.design = (S.seq.design || 0) + 1; const fid = FT.uid('f'), fname = 'Design-' + S.seq.design; (S.folders = S.folders || {})[fid] = { name: fname }; S.fmap = S.fmap || {};
    const tag = (k, id) => { S.fmap[k + ':' + id] = fid; };
    const link = (a, b, path, ptype, pcat, ccat) => { // pipes + one cable through handholes
      const segs = D.split(path), ids = [a];
      segs.forEach((sg, i) => { if (i < segs.length - 1) { const hh = FT.addNode('hh', sg[sg.length - 1], { cat: 'c_fm', place: 'buried' }); tag('n', hh.id); ids.push(hh.id); } }); ids.push(b);
      segs.forEach((sg, i) => { const pp = FT.addPipe(sg, ids[i], ids[i + 1], ptype, pcat); tag('p', pp.id); });
      const c = FT.addCable(path, a, b, ccat, 'free', ids, segs); tag('c', c.id); return c;
    };
    let maxF = 0; Object.values(S.nodes).forEach(n => { const m = /^F(\d+)-PS/.exec(n.code || ''); if (m) maxF = Math.max(maxF, +m[1]); });
    plan.cabs.forEach((cab, i) => {
      const F = ++maxF, fdc = FT.addNode('sk', cab.ll, { ratio: '1:' + plan.s1, nsplit: cab.nsplit, name: 'FDC-F' + pad(F), code: 'F' + pad(F) + '-PS01', cat: 'c_sk', place: 'buried' }); tag('n', fdc.id);
      const fc = link(plan.olt.id, fdc.id, cab.path, 'hdpe', 'h40', cab.cat); fc.name = 'Feeder F' + pad(F) + ' · ' + fc.core + 'C';
      cab.fdbs.forEach((f, k) => {
        const ps = Math.floor(k / plan.s1) + 1, p = k % plan.s1 + 1, code = FT.spec.codeFor(F, ps, p, 1, 1), o = f.b.o || {};
        const fdb = FT.addNode('bk', f.ll, { ratio: '1:' + plan.s2, name: code, code, label: o.num ? FT.num.label(o) : '', cat: 'c_bk', place: 'wall', bld: f.b.id }); tag('n', fdb.id);
        const dc = link(fdc.id, fdb.id, f.path, 'microduct', 'mc12', 'ds24'); dc.name = 'Distribution D01 · ' + code;
        const b = S.bld[f.b.id] = S.bld[f.b.id] || {}; b.fdb = fdb.id; b.ll = f.b.c;
        if (opt && opt.homes && FT._designHomes < 900) { S.seq.sub++; FT._designHomes++; const sub = { id: FT.uid('s'), name: 'ONT-' + S.seq.sub, node: fdb.id, bld: f.b.id, ll: f.b.c, port: 1 }; S.subs[sub.id] = sub; b.st = 1; const dr = FT.addCable([fdb.ll, f.b.c], fdb.id, fdb.id, 'dr2', 'free', [fdb.id, fdb.id], [[fdb.ll, f.b.c]]); dr.name = 'Drop ' + sub.name; dr.sub = sub.id; tag('c', dr.id); }
      });
    });
    FT.changed('design'); return fname;
  };

  // ---- dialog ----
  D.open = async function (ring) {
    const olts = Object.values(FT.state.nodes).filter(n => n.type === 'olt');
    if (!olts.length) { U().toast(ar() ? 'ضع OLT أولًا ثم أعد المحاولة' : 'Place an OLT first, then try again'); FT.T.setTool('select'); return; }
    await FT.map.ensureTiles(FT.bboxOf(ring)); const blds = FT.map.buildingsInRing(ring);
    if (!blds.length) { U().toast(FT.t('dxf_none')); FT.T.setTool('select'); return; }
    let oltId = olts[0].id, homes = false, plan = null, sp = 0, cab = 48;
    const render = () => {
      plan = D.plan(blds, FT.state.nodes[oltId], { s1: D.SPLITS[sp][0], s2: D.SPLITS[sp][1], cab }); D.preview(plan);
      return '<div class="f"><label>OLT</label><select id="dsOlt">' + olts.map(o => '<option value="' + o.id + '"' + (o.id === oltId ? ' selected' : '') + '>' + o.name + '</option>').join('') + '</select></div>' +
        '<div class="two"><div class="f"><label>' + FT.t('ds_split') + '</label><select id="dsSplit">' + D.SPLITS.map((s, i) => '<option value="' + i + '"' + (i === sp ? ' selected' : '') + '>1:' + s[0] + ' (FDC) + 1:' + s[1] + ' (FDB) = 1:' + s[0] * s[1] + '</option>').join('') + '</select></div>' +
        '<div class="f"><label>' + FT.t('ds_cab') + '</label><input id="dsCab" type="text" inputmode="numeric" value="' + cab + '"></div></div>' +
        '<div class="fl"><input type="checkbox" id="dsHomes"' + (homes ? ' checked' : '') + '><span>' + (ar() ? 'ارسم كبل مشترك لكل مبنى (للتخطيط فقط — خارج نطاق المقاول)' : 'Draw a drop cable to each building (planning only — outside the contractor scope)') + '</span></div>' +
        '<div class="kv"><span>' + FT.t('buildings') + ' = FDB</span><b>' + plan.fdbCount + '</b></div><div class="kv"><span>FDC</span><b>' + plan.fdcCount + ' · ' + plan.splitters + ' × 1:' + plan.s1 + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'منافذ PON في الـ OLT (ألياف التغذية)' : 'OLT PON ports (feeder fibres)') + '</span><b>' + plan.ports + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'كبلات التغذية (OLT→FDC)' : 'Feeder cables (OLT→FDC)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.feeder)) + '</b></div><div class="kv"><span>' + (ar() ? 'كبلات التوزيع (FDC→FDB)' : 'Distribution (FDC→FDB)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.dist)) + '</b></div>' +
        '<div class="kv"><span>' + (ar() ? 'أسوأ فقد عند الـ ONT (الحد 28 dB)' : 'Worst loss at the ONT (limit 28 dB)') + '</span><b style="color:' + (plan.ok ? 'var(--ok)' : 'var(--bad)') + '">' + FT.lt(plan.worstLoss.toFixed(1) + ' dB') + '</b></div>' +
        (plan.straight ? '<div class="warnbox">' + (ar() ? plan.straight + ' مسار ما لقى شارعًا قريبًا فرُسم خطًا مستقيمًا — راجعه يدويًا (قد يمرّ فوق بيوت).' : plan.straight + ' route(s) found no street nearby and are straight lines — check them by hand (they may cross houses).') + '</div>' : '') + (plan.ok ? '' : '<div class="warnbox">' + (ar() ? plan.over + ' علبة FDB تتجاوز 28 dB — قرّب الـ OLT أو قلّل سعة الخزانة.' : plan.over + ' FDB exceed 28 dB — move the OLT closer or reduce the cabinet size.') + '</div>') +
        '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar() ? 'تقدير تخطيطي: علبة FDB عند مدخل كل مبنى، الأنابيب والكبلات تتبع الشوارع. عدّل بعد التطبيق. Ctrl+Z يتراجع.' : 'Planning estimate: one FDB at the entrance of each building; pipes and cables follow the streets. Edit after applying. Ctrl+Z undoes it.') + '</div>';
    };
    U().modal(FT.t('t_design'), render(), [{ label: FT.t('close'), fn: () => { FT.map.setDraw([]); FT.T.setTool('select'); } }, { label: FT.t('an_apply'), cls: 'pri', fn: () => { FT.map.setDraw([]); FT._designHomes = 0; const n = D.apply(plan, { homes }); FT.T.setTool('select'); U().toast(n + ' ✓'); } }], function wire(root) {
      const again = () => { root.innerHTML = render(); wire(root); };
      root.querySelector('#dsOlt').onchange = e => { oltId = e.target.value; again(); }; root.querySelector('#dsHomes').onchange = e => { homes = e.target.checked; };
      root.querySelector('#dsSplit').onchange = e => { sp = +e.target.value; again(); };
      root.querySelector('#dsCab').onchange = e => { const v = parseInt(String(e.target.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v >= 4) cab = Math.min(v, 400); again(); };
    });
  };
})(window);
