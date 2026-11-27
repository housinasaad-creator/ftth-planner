/* Connecting a subscriber (pick the port, one step writes subscriber + drop cable + port fusion) and the PON view of the network. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const X = FT.fui, $ = s => document.querySelector(s);
  const U = () => FT.UI, F = () => FT.fiber, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const nodeName = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '—'; };
  X.DROP_WARN_M = 500;

  // which ports of every splitter in a box are taken (by a subscriber or by a fusion)
  X.ports = function (boxId, ix) {
    ix = ix || F().index();
    return F().splittersOf(boxId).map(sp => {
      const subs = (ix.subAt[boxId] || []).filter(s => (s.spl || 1) === sp.i);
      return { sp, ports: Array.from({ length: sp.n }, (_, i) => { const p = i + 1, sub = subs.find(s => s.port === p), joined = !!(ix.at[boxId] && ix.at[boxId]['s:' + sp.key + ':' + p]); return { p, sub: sub || null, joined, free: !sub && !joined }; }) };
    });
  };
  X.addSubscriber = function (boxId, bldId, o) { // o: {spl, port, medium, name, addr, subno, autoJoin}
    const S = FT.state, box = S.nodes[boxId], at = FT.map.housePoint(bldId); if (!box || !at) return { ok: false, why: 'gone' };
    const row = X.ports(boxId).find(r => r.sp.i === o.spl), port = row && row.ports.find(x => x.p === o.port);
    if (!port || !port.free) return { ok: false, why: 'port' };
    FT.commit(); S.seq.sub++;
    const end = at.slice(), sub = { id: FT.uid('s'), name: o.name || (nodeName(boxId) + '-P' + o.port), node: boxId, bld: bldId, ll: end, spl: o.spl, port: o.port, addr: o.addr || '', subno: o.subno || '' };
    S.subs[sub.id] = sub; FT.houses.pin(bldId).st = 1;
    const drop = FT.addCable([box.ll, end], boxId, boxId, 'dr2', o.medium === 'aerial' ? 'aerial' : 'free', [boxId, boxId], [[box.ll, end]]);
    drop.drop = sub.id; drop.sub = sub.id; drop.name = 'Drop ' + sub.name;
    F().connect(boxId, { s: row.sp.key, p: o.port }, { c: drop.id, f: 1 });
    let joined = null; if (o.autoJoin && !F().busy(boxId, { s: row.sp.key, p: 0 })) joined = F().autoSplice(new Set([boxId]));
    FT.changed('sub');
    return { ok: true, sub, drop, joined };
  };
  X.openConnect = function (boxId, bldId) {
    const S = FT.state, box = S.nodes[boxId]; if (!box) return;
    if (FT.store && FT.store.mode === 'view') { U().toast(FT.t('ro_msg')); return; }
    const at = FT.map.housePoint(bldId); if (!at) return;
    const rows = X.ports(boxId); if (!rows.length) { U().toast(tx('حدّد نسبة مقسّم لهالعلبة أول', 'Give this box a splitter ratio first')); return; }
    const first = rows.flatMap(r => r.ports.filter(x => x.free).map(x => ({ spl: r.sp.i, port: x.p })))[0];
    if (!first) { U().toast(tx('كل منافذ ' + nodeName(boxId) + ' مشغولة', 'Every port of ' + nodeName(boxId) + ' is taken')); return; }
    const len = FT.dist(box.ll, at), o = { spl: first.spl, port: first.port, medium: 'free', autoJoin: true };
    const here = Object.values(S.subs).filter(s => s.bld === bldId), house = S.bld[bldId] || {};
    const ix = F().index(), unfed = () => !F().busy(boxId, { s: boxId + '#' + o.spl, p: 0 });
    const grid = () => rows.map(r => '<div class="fx-ports"><div class="kv"><span>' + tx('مقسّم ', 'Splitter ') + r.sp.ratio + ' #' + r.sp.i + '</span><b>' + r.ports.filter(x => !x.free).length + '/' + r.sp.n + '</b></div><div class="fx-portrow">' + r.ports.map(x => '<button type="button" class="fx-port ' + (x.sub ? 'onu' : x.joined ? 'fus' : '') + (o.spl === r.sp.i && o.port === x.p ? ' pick' : '') + '"' + (x.free ? ' data-port="' + r.sp.i + ':' + x.p + '"' : ' disabled') + ' title="' + esc(x.sub ? x.sub.name : x.joined ? tx('ملحوم', 'fused') : tx('فاضي', 'free')) + '">' + x.p + '</button>').join('') + '</div></div>').join('');
    const render = () => '<div class="kv"><span>' + tx('العلبة', 'Box') + '</span><b>' + esc(nodeName(boxId)) + '</b></div><div class="kv"><span>' + tx('البيت', 'House') + '</span><b>' + esc(house.num ? FT.num.label(house) : house.name || '—') + '</b></div>' +
      (here.length ? '<div class="warnbox">' + tx('على هالبيت مشترك من قبل: ', 'This house already has: ') + esc(here.map(s => s.name).join('، ')) + '</div>' : '') +
      '<h4 class="fx-h">' + tx('1 · اختار المنفذ', '1 · Pick the port') + '</h4>' + grid() +
      '<h4 class="fx-h">' + tx('2 · كبل المشترك', '2 · Drop cable') + '</h4><div class="seg" id="coMed"><button type="button" data-m="free" class="' + (o.medium === 'free' ? 'on' : '') + '">' + tx('أرضي', 'Buried / free') + '</button><button type="button" data-m="aerial" class="' + (o.medium === 'aerial' ? 'on' : '') + '">' + tx('هوائي على الجدار', 'Aerial on walls') + '</button></div>' +
      '<div class="kv"><span>' + tx('الطول (خط مستقيم)', 'Length (straight)') + '</span><b>' + FT.fmtLen(len) + '</b></div>' + (len > X.DROP_WARN_M ? '<div class="warnbox">' + tx('كبل المشترك أطول من ' + X.DROP_WARN_M + ' م. الأفضل علبة أقرب.', 'The drop is longer than ' + X.DROP_WARN_M + ' m.') + '</div>' : '') +
      '<h4 class="fx-h">' + tx('3 · بيانات المشترك', '3 · Subscriber') + '</h4><div class="f"><label>' + tx('اسم جهاز المشترك (ONU)', 'ONU name') + '</label><input id="coName" value="' + esc(o.name != null ? o.name : nodeName(boxId) + '-P' + o.port) + '"></div><div class="two"><div class="f"><label>' + tx('العنوان', 'Address') + '</label><input id="coAddr" value="' + esc(o.addr || '') + '"></div><div class="f"><label>' + tx('رقم المشترك', 'Subscriber number') + '</label><input id="coNo" value="' + esc(o.subno || '') + '"></div></div>' +
      (unfed() ? '<div class="fl"><input type="checkbox" id="coAuto"' + (o.autoJoin ? ' checked' : '') + '><span>' + tx('دخل المقسّم مو ملحوم: وصّل العلبة تلقائياً لحد الـOLT', 'The splitter is not fed yet: join the box up to the OLT automatically') + '</span></div>' : '');
    U().modal(tx('ربط مشترك', 'Connect subscriber'), render(), [{ label: FT.t('cancel') }, { label: tx('اربط', 'Connect'), cls: 'pri', id: 'coGo', fn: () => {
      const r = X.addSubscriber(boxId, bldId, o);
      if (!r.ok) { U().toast(tx('المنفذ صار مشغول، اختار غيره', 'That port is taken now')); return; }
      U().toast(r.sub.name + ' → ' + nodeName(boxId) + ' · ' + tx('منفذ ', 'port ') + r.sub.port + (r.joined && r.joined.failed.length ? ' · ' + X.autoWhy(r.joined.failed[0]) : ''));
    } }], function wire(root) {
      const keep = () => { const a = root.querySelector('#coName'), b = root.querySelector('#coAddr'), c = root.querySelector('#coNo'); if (a && a.dataset.t) o.name = a.value; if (b) o.addr = b.value; if (c) o.subno = c.value; };
      const again = () => { keep(); root.innerHTML = render(); wire(root); };
      root.querySelector('#coName').oninput = e => { e.target.dataset.t = 1; o.name = e.target.value; };
      root.querySelector('#coAddr').oninput = e => o.addr = e.target.value; root.querySelector('#coNo').oninput = e => o.subno = e.target.value;
      root.querySelectorAll('[data-port]').forEach(b => b.onclick = () => { const [s, p] = b.dataset.port.split(':').map(Number); o.spl = s; o.port = p; again(); });
      root.querySelectorAll('#coMed button').forEach(b => b.onclick = () => { o.medium = b.dataset.m; again(); });
      const au = root.querySelector('#coAuto'); if (au) au.onchange = () => o.autoJoin = au.checked;
    });
  };

  // ================= PON view =================
  X.ponData = function () {
    const S = FT.state, ix = F().index(), out = [];
    Object.values(S.nodes).filter(n => n.type === 'olt').forEach(olt => {
      const ports = F().usedPon(olt.id).sort((a, b) => a - b).map(port => {
        const tr = F().tracePon(olt.id, port, ix), st = { splitters: 0, capacity: 0, onus: 0, open: 0 };
        const walk = (t, split) => { st.splitters++; let child = false; t.out.forEach(o => { if (o.state === 'split') { child = true; walk(o.child, split * t.n); } else { if (o.state === 'onu' || o.state === 'onu_unspliced') st.onus++; if (o.state === 'open') st.open++; } }); t.out.forEach(o => { if (o.state !== 'split' && o.state !== 'open') { /* a leaf output serves one home */ } }); if (!child) st.capacity += t.n; else st.capacity += 0; st.split = Math.max(st.split || 1, split * t.n); };
        if (tr.result.child) walk(tr.result.child, 1);
        return { port, tr, st };
      });
      out.push({ olt, ports });
    });
    return out;
  };
  X.ponPanel = function (body) {
    const data = X.ponData(), all = data.flatMap(d => d.ports);
    const sum = k => all.reduce((a, p) => a + (p.st[k] || 0), 0), cap = sum('capacity'), onus = sum('onus');
    const unfed = []; Object.values(FT.state.nodes).forEach(n => F().splittersOf(n.id).forEach(sp => { if (!F().busy(n.id, { s: sp.key, p: 0 })) unfed.push(sp); }));
    const bar = (a, b) => '<span class="fx-bar"><i style="width:' + (b ? Math.min(100, a / b * 100) : 0) + '%"></i></span>';
    const tree = (t, depth) => { const used = t.out.filter(o => o.state !== 'free').length; return '<div class="fx-pn" style="padding-inline-start:' + (depth * 12) + 'px"><button type="button" class="fx-go" data-tsp="' + t.key + '">' + t.ratio + ' · ' + esc(nodeName(t.node)) + '</button><small>' + used + '/' + t.n + '</small></div>' + t.out.map(o => o.state === 'split' ? tree(o.child, depth + 1) : (o.state === 'onu' || o.state === 'onu_unspliced') ? '<div class="fx-pn" style="padding-inline-start:' + ((depth + 1) * 12) + 'px">👤 <button type="button" class="fx-go" data-tsub="' + o.sub.id + '">' + esc(o.sub.name) + '</button><small>' + tx('منفذ ', 'port ') + o.port + (o.state === 'onu_unspliced' ? ' ⚠' : '') + '</small></div>' : o.state === 'open' ? '<div class="fx-pn warn" style="padding-inline-start:' + ((depth + 1) * 12) + 'px">⚠ ' + tx('مخرج ', 'out ') + o.port + ' ' + tx('مقطوع', 'open') + '</div>' : '').join(''); };
    body.innerHTML = '<h3>' + tx('شبكة PON', 'PON network') + '</h3>' +
      '<div class="kv"><span>' + tx('منافذ PON مستعملة', 'PON ports in use') + '</span><b>' + all.length + '</b></div><div class="kv"><span>' + tx('منافذ للمشتركين', 'Subscriber outputs') + '</span><b>' + cap + '</b></div><div class="kv"><span>' + tx('مشتركين مربوطين', 'Subscribers') + '</span><b>' + onus + (cap ? ' · ' + Math.round(onus / cap * 100) + '%' : '') + '</b></div>' + bar(onus, cap) +
      (unfed.length ? '<div class="warnbox">' + tx(unfed.length + ' مقسّم دخله مو ملحوم.', unfed.length + ' splitter(s) are not fed.') + '</div>' : '') +
      '<div style="display:grid;gap:6px;margin:8px 0"><button type="button" class="btn pri full" id="ponAuto">' + tx('وصل تلقائي للمقسّمات غير الموصولة', 'Auto-join the unfed splitters') + '</button><button type="button" class="btn full" id="ponSub">' + tx('ربط مشترك (اختار العلبة وبعدها البيت)', 'Connect a subscriber (box, then house)') + '</button></div>' +
      data.map(d => '<h4 class="fx-h">OLT · ' + esc(nodeName(d.olt.id)) + '</h4>' + (d.ports.length ? d.ports.slice(0, 400).map(p => '<details class="fx-pon"' + (d.ports.length <= 2 ? ' open' : '') + '><summary><b>PON ' + p.port + '</b><span>1:' + (p.st.split || 1) + ' · ' + p.st.onus + '/' + p.st.capacity + (p.tr.status !== 'ok' && p.st.open ? ' ⚠' : '') + '</span></summary>' + (p.tr.result.child ? tree(p.tr.result.child, 0) : '<p class="d">' + tx('المنفذ ما بيوصل لمقسّم', 'The port reaches no splitter') + '</p>') + '<button type="button" class="fx-go" data-tpon="' + d.olt.id + ':' + p.port + '">' + tx('تتبّع المنفذ', 'Trace the port') + '</button></details>').join('') : '<p class="d">' + tx('ما في ولا منفذ موصول لسا.', 'No port is patched yet.') + '</p>')).join('') + (data.length ? '' : '<p class="d">' + tx('حط OLT أول.', 'Place an OLT first.') + '</p>');
    body.querySelectorAll('[data-tsp]').forEach(b => b.onclick = () => X.openTrace({ sp: b.dataset.tsp }));
    body.querySelectorAll('[data-tsub]').forEach(b => b.onclick = () => X.openTrace({ sub: b.dataset.tsub }));
    body.querySelectorAll('[data-tpon]').forEach(b => b.onclick = () => { const [o, p] = b.dataset.tpon.split(':'); X.openTrace({ pon: [o, +p] }); });
    body.querySelector('#ponAuto').onclick = () => { X.autoAll(); U().renderPanel(); };
    body.querySelector('#ponSub').onclick = () => { FT.T.setTool('sub'); };
  };
})(window);
