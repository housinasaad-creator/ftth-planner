/* Auto design (infrastructure planner): buildings in an area -> BK (1:8) -> DK (1:4) -> OLT, with optical budget.
   Straight-line routing (does not follow roads) -> an ESTIMATE for planning, edit afterwards. One undo step. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const D = FT.design = {};
  const U = () => FT.UI;

  function morton(x, y) { let z = 0; for (let i = 0; i < 16; i++) z |= ((x >> i) & 1) << (2 * i) | ((y >> i) & 1) << (2 * i + 1); return z >>> 0; }
  D.plan = function (blds, olt, opt) {
    const kx = Math.cos(olt.ll[1] * Math.PI / 180) * 111320, ky = 110540, bkN = opt.bkN || 8, dkN = opt.dkN || 4;
    const P = blds.map(b => ({ id: b.id, ll: b.c, m: morton(Math.floor((b.c[0] * kx) / 6) & 0xffff, Math.floor((b.c[1] * ky) / 6) & 0xffff) })).sort((a, b) => a.m - b.m);
    const avg = arr => [arr.reduce((s, p) => s + p.ll[0], 0) / arr.length, arr.reduce((s, p) => s + p.ll[1], 0) / arr.length];
    const bks = []; for (let i = 0; i < P.length; i += bkN) { const g = P.slice(i, i + bkN); bks.push({ ll: avg(g), homes: g }); }
    bks.sort((a, b) => morton(Math.floor(a.ll[0] * kx / 20) & 0xffff, Math.floor(a.ll[1] * ky / 20) & 0xffff) - morton(Math.floor(b.ll[0] * kx / 20) & 0xffff, Math.floor(b.ll[1] * ky / 20) & 0xffff));
    const dks = []; for (let i = 0; i < bks.length; i += dkN) { const g = bks.slice(i, i + dkN); dks.push({ ll: avg(g.map(b => ({ ll: b.ll }))), bks: g }); }
    const B = FT.BASE_LOSS; let worst = 99, worstRx = 99, feeder = 0, dist = 0, over = 0;
    dks.forEach(dk => { dk.len = FT.dist(olt.ll, dk.ll); feeder += dk.len; dk.bks.forEach(bk => { bk.len = FT.dist(dk.ll, bk.ll); dist += bk.len; const km = (dk.len + bk.len) / 1000, loss = km * B.fiber1490 + 4 * B.connector + 4 * B.splice + FT.SPLITTER_LOSS['1:4'] + FT.SPLITTER_LOSS['1:8'], rx = B.txDbm - loss; bk.rx = rx; bk.loss = loss; worstRx = Math.min(worstRx, rx); if (rx < B.rxSens) over++; }); });
    return { olt, bks, dks, homes: P.length, feeder, dist, worstRx, over, ok: over === 0 };
  };
  D.preview = function (plan) {
    const f = []; plan.dks.forEach(dk => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [plan.olt.ll, dk.ll] } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: dk.ll } }); dk.bks.forEach(bk => { f.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [dk.ll, bk.ll] } }); f.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: bk.ll } }); }); });
    FT.map.setDraw(f);
  };
  D.apply = function (plan, opt) {
    const S = FT.state; FT.commit(); S.seq.design = (S.seq.design || 0) + 1; const fid = FT.uid('f'), fname = 'Design-' + S.seq.design; (S.folders = S.folders || {})[fid] = { name: fname }; S.fmap = S.fmap || {};
    const tag = (k, id) => { S.fmap[k + ':' + id] = fid; };
    plan.dks.forEach((dk, i) => {
      const dn = FT.addNode('dk', dk.ll, { ratio: '1:4', name: 'DK-' + fname.slice(7) + '.' + (i + 1) }); tag('n', dn.id);
      const p = FT.addPipe([plan.olt.ll, dk.ll], plan.olt.id, dn.id, 'hdpe', 'h40'); tag('p', p.id); const c = FT.addCable([plan.olt.ll, dk.ll], plan.olt.id, dn.id, 'bb96', 'free', [plan.olt.id, dn.id], null); tag('c', c.id);
      dk.bks.forEach((bk, j) => {
        const bn = FT.addNode('bk', bk.ll, { ratio: '1:8', name: 'BK-' + fname.slice(7) + '.' + (i + 1) + '.' + (j + 1) }); tag('n', bn.id);
        const p2 = FT.addPipe([dk.ll, bk.ll], dn.id, bn.id, 'hdpe', 'h32'); tag('p', p2.id); const c2 = FT.addCable([dk.ll, bk.ll], dn.id, bn.id, 'ds24', 'free', [dn.id, bn.id], null); tag('c', c2.id);
        if (opt && opt.homes && FT._designHomes < 900) bk.homes.forEach((h, k) => { S.seq.sub++; FT._designHomes++; const sub = { id: FT.uid('s'), name: 'SUB-' + S.seq.sub, node: bn.id, bld: h.id, ll: h.ll, port: k + 1 }; S.subs[sub.id] = sub; (S.bld[h.id] = S.bld[h.id] || {}).st = 1; const dr = FT.addCable([bn.ll, h.ll], bn.id, bn.id, 'dr2', 'free', [bn.id, bn.id], [[bn.ll, h.ll]]); dr.name = 'Drop ' + sub.name; dr.sub = sub.id; tag('c', dr.id); });
      });
    });
    FT.changed('design'); return fname;
  };

  // ---- dialog ----
  D.open = async function (ring) {
    const olts = Object.values(FT.state.nodes).filter(n => n.type === 'olt'), ar = FT.lang === 'ar';
    if (!olts.length) { U().toast(ar ? 'ضع OLT أولًا ثم أعد المحاولة' : 'Place an OLT first, then try again'); FT.T.setTool('select'); return; }
    await FT.map.ensureTiles(FT.bboxOf(ring)); const blds = FT.map.buildingsInRing(ring);
    if (!blds.length) { U().toast(FT.t('dxf_none')); FT.T.setTool('select'); return; }
    let oltId = olts[0].id, homes = false, plan = null;
    const render = () => {
      plan = D.plan(blds, FT.state.nodes[oltId], {}); D.preview(plan);
      return '<div class="f"><label>OLT</label><select id="dsOlt">' + olts.map(o => '<option value="' + o.id + '"' + (o.id === oltId ? ' selected' : '') + '>' + o.name + '</option>').join('') + '</select></div>' +
        '<div class="fl"><input type="checkbox" id="dsHomes"' + (homes ? ' checked' : '') + '><span>' + (ar ? 'ربط كل بيت بكبل مشترك (حتى 900 بيت)' : 'Connect every home with a drop cable (up to 900)') + '</span></div>' +
        '<div class="kv"><span>' + FT.t('buildings') + '</span><b>' + plan.homes + '</b></div><div class="kv"><span>BK 1:8</span><b>' + plan.bks.length + '</b></div><div class="kv"><span>DK 1:4</span><b>' + plan.dks.length + '</b></div>' +
        '<div class="kv"><span>' + (ar ? 'كبلات التغذية (OLT→DK)' : 'Feeder cables (OLT→DK)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.feeder)) + '</b></div><div class="kv"><span>' + (ar ? 'كبلات التوزيع (DK→BK)' : 'Distribution (DK→BK)') + '</span><b>' + FT.lt(FT.fmtLenShort(plan.dist)) + '</b></div>' +
        '<div class="kv"><span>' + (ar ? 'أسوأ مستوى استقبال' : 'Worst RX level') + '</span><b style="color:' + (plan.ok ? 'var(--ok)' : 'var(--bad)') + '">' + FT.lt(plan.worstRx.toFixed(1) + ' dBm') + '</b></div>' +
        (plan.ok ? '' : '<div class="warnbox">' + (ar ? plan.over + ' علبة BK خارج الميزانية الضوئية — قرّب الـ OLT أو أضف مقسّمًا وسيطًا.' : plan.over + ' BK boxes exceed the optical budget — move the OLT closer or add an intermediate splitter.') + '</div>') +
        '<div class="warnbox" style="background:#12202e;border-color:#2a5a7a;color:#9ad0ff">' + (ar ? 'تقدير تخطيطي: التوجيه خطوط مستقيمة (لا يتبع الشوارع). عدّل بعد التطبيق. يمكن التراجع بـ Ctrl+Z.' : 'Planning estimate: straight-line routing (does not follow roads). Edit after applying. Ctrl+Z undoes it.') + '</div>';
    };
    U().modal(FT.t('t_design'), render(), [{ label: FT.t('close'), fn: () => { FT.map.setDraw([]); FT.T.setTool('select'); } }, { label: FT.t('an_apply'), cls: 'pri', fn: () => { FT.map.setDraw([]); FT._designHomes = 0; const n = D.apply(plan, { homes }); FT.T.setTool('select'); U().toast(n + ' ✓'); } }], function wire(root) {
      root.querySelector('#dsOlt').onchange = e => { oltId = e.target.value; root.innerHTML = render(); wire(root); }; root.querySelector('#dsHomes').onchange = e => { homes = e.target.checked; };
    });
  };
})(window);
