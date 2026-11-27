/* The windows of the fibre engine: splice closure (two sides, coloured strands, joins drawn as lines), strand-level trace with the
   physical budget, the planning values behind it, and the PON tree. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const X = FT.fui = {};
  const $ = s => document.querySelector(s);
  const U = () => FT.UI, F = () => FT.fiber, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const num = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.'));
  const db = v => FT.lt(v.toFixed(2) + ' dB'), dbm = v => FT.lt(v.toFixed(2) + ' dBm');
  const nodeName = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '—'; };
  const cableName = c => (c.name || 'cable') + ' · ' + c.core + 'F';
  const locked = () => FT.store && FT.store.mode === 'view';
  const ROW = 26, PAGE = 48;

  const ISSUE = {
    no_input: ['مدخل المقسّم بدون لحام', 'The splitter input has no fusion'], open: ['شعرة مقطوعة: ما في لحام بآخرها', 'Open strand: no fusion at its end'],
    no_patch: ['الشعرة واصلة للـOLT بس مو موصولة على منفذ PON', 'The strand reaches the OLT but is not patched to a PON port'], terminated: ['الشعرة منهية (مختومة)', 'The strand is terminated'],
    no_cable: ['الكبل محذوف', 'The cable no longer exists'], no_strand: ['رقم الشعرة أكبر من سعة الكبل', 'The strand number is beyond the cable size'], no_splitter: ['المقسّم محذوف أو العلبة بلا نسبة', 'The splitter is gone (the box has no ratio)'],
    no_port: ['مخرج أكبر من نسبة المقسّم', 'Output number beyond the splitter ratio'], ambiguous: ['الشعرة ملحومة بأكتر من مكانين: الاتجاه مو واضح', 'The strand is joined in more than two places: direction unclear'],
    wrong_way: ['وصلة بالاتجاه الغلط (مخرج على مخرج أو دخل على دخل)', 'A join in the wrong direction'], loop: ['حلقة مغلقة', 'Loop'], unused: ['شعرة فاضية: مو مستعملة', 'Spare strand: not used'],
    onu_unspliced: ['مشترك على المنفذ بس شعرته مو ملحومة', 'A subscriber is on this port but not fused'], wrong_onu: ['المنفذ رايح لمشترك تاني', 'The port leads to another subscriber'],
  };
  const STATUS = { ok: ['كامل', 'Complete', 'var(--ok)'], partial: ['ناقص بعد الـOLT', 'Partial', 'var(--warn)'], broken: ['مقطوع', 'Broken', 'var(--bad)'] };
  X.issueText = i => { const t = ISSUE[i.code] || [i.code, i.code]; return (ar() ? t[0] : t[1]) + (i.node ? ' — ' + nodeName(i.node) : '') + (i.port ? ' · ' + tx('منفذ ', 'port ') + i.port : '') + (i.f ? ' · ' + tx('شعرة ', 'strand ') + i.f : ''); };
  X.statusChip = s => { const t = STATUS[s] || STATUS.broken; return '<span class="fx-chip" style="color:' + t[2] + ';border-color:' + t[2] + '">' + (ar() ? t[0] : t[1]) + '</span>'; };

  const dot = col => '<i class="fx-dot" style="background:' + col.hex + '"></i>';
  const strandText = (cid, f) => { const c = FT.state.cables[cid]; return c ? dot(F().strandColor(c, f)) + '<bdi>' + esc(F().strandName(c, f)) + '</bdi>' : '?'; };
  function endText(e, withCable) {
    if (!e) return '—'; if (e.t) return tx('منهية', 'terminated'); if (e.o != null) return 'PON ' + e.o;
    if (e.s != null) { const sp = F().splitter(e.s); return tx('مقسّم ', 'splitter ') + (sp ? sp.ratio + ' #' + sp.i : '?') + ' · ' + (e.p === 0 ? tx('دخل', 'in') : tx('مخرج ', 'out ') + e.p); }
    const c = FT.state.cables[e.c]; return (withCable ? esc(c ? c.name : '?') + ' · ' : '') + strandText(e.c, e.f);
  }

  // ================= splice closure =================
  // the things in a node that have ends: every cable passing it, every splitter in it, and the PON ports of an OLT
  function groups(nodeId) {
    const S = FT.state, n = S.nodes[nodeId], out = [];
    if (n.type === 'olt') { const used = F().usedPon(nodeId), max = Math.max(16, Math.ceil((Math.max(0, ...used) + 4) / 8) * 8); out.push({ id: 'pon', label: tx('منافذ PON', 'PON ports'), ends: Array.from({ length: max }, (_, i) => ({ o: i + 1 })) }); }
    F().splittersOf(nodeId).forEach(sp => out.push({ id: 's:' + sp.key, label: tx('مقسّم ', 'Splitter ') + sp.ratio + ' #' + sp.i, splitter: sp, ends: Array.from({ length: sp.n + 1 }, (_, p) => ({ s: sp.key, p })) }));
    FT.ordered('cables').filter(c => (c.nodes || []).includes(nodeId)).forEach(c => { const ids = c.nodes, other = ids[0] === nodeId ? ids[ids.length - 1] : ids[0]; out.push({ id: 'c:' + c.id, label: cableName(c) + (other && other !== nodeId ? ' → ' + nodeName(other) : ''), cable: c, ends: Array.from({ length: c.core }, (_, i) => ({ c: c.id, f: i + 1 })) }); });
    return out;
  }
  X.openSplice = function (nodeId, opt) {
    const S = FT.state, n = S.nodes[nodeId]; if (!n) return;
    const gs = groups(nodeId);
    if (!gs.length) { U().toast(tx('ما في كبلات ولا مقسّمات بهالعقدة. ارسم كبل أو حدّد نسبة مقسّم.', 'No cables or splitters at this node yet.')); return; }
    const st = X.sp = Object.assign({ node: nodeId, a: gs[0].id, b: (gs[1] || gs[0]).id, pageA: 0, pageB: 0, pick: null }, opt || {});
    const commit = fn => { if (locked()) { U().toast(FT.t('ro_msg')); return null; } FT.commit(); const r = fn(); FT.changed('splice'); return r; };
    const render = () => {
      const all = groups(nodeId), by = {}; all.forEach(g => by[g.id] = g);
      if (!by[st.a]) st.a = all[0].id; if (!by[st.b]) st.b = (all[1] || all[0]).id;
      const links = F().links(nodeId), ix = {}; links.forEach(l => { if (l.a) ix[F().key(l.a)] = l.b; if (l.b && !l.b.t) ix[F().key(l.b)] = l.a; });
      const subs = Object.values(S.subs).filter(s => s.node === nodeId);
      const col = (side, g) => {
        const page = Math.min(st['page' + side], Math.max(0, Math.ceil(g.ends.length / PAGE) - 1)); st['page' + side] = page;
        const ends = g.ends.slice(page * PAGE, (page + 1) * PAGE);
        return { ends, html: ends.map(e => {
          const k = F().key(e), to = ix[k], picked = st.pick && F().key(st.pick.e) === k;
          let label = e.o != null ? 'PON ' + e.o : e.s != null ? (e.p === 0 ? tx('دخل المقسّم', 'input') : tx('مخرج ', 'out ') + e.p) : strandText(e.c, e.f);
          const sub = e.s != null && e.p > 0 ? subs.find(s => F().splitter(e.s) && (s.spl || 1) === F().splitter(e.s).i && s.port === e.p) : null;
          if (sub) label += ' · ' + esc(sub.name);
          return '<button type="button" class="fx-end' + (to ? ' used' : '') + (picked ? ' pick' : '') + '" data-side="' + side + '" data-k="' + esc(k) + '"><span>' + label + '</span>' + (to ? '<small>' + endText(to, true) + '</small>' : '') + '</button>';
        }).join(''), pager: g.ends.length > PAGE ? '<div class="fx-pager"><button type="button" class="btn" data-pg="' + side + ':-1">‹</button><span>' + FT.lt((page * PAGE + 1) + '–' + Math.min(g.ends.length, (page + 1) * PAGE) + ' / ' + g.ends.length) + '</span><button type="button" class="btn" data-pg="' + side + ':1">›</button></div>' : '' };
      };
      const A = col('A', by[st.a]), B = col('B', by[st.b]);
      let lines = ''; A.ends.forEach((e, i) => { const to = ix[F().key(e)]; if (!to || to.t) return; const j = B.ends.findIndex(x => F().same(x, to)); if (j < 0) return; const c = e.c != null ? F().strandColor(S.cables[e.c], e.f).hex : to.c != null ? F().strandColor(S.cables[to.c], to.f).hex : '#ff6a3d'; const y1 = i * ROW + ROW / 2, y2 = j * ROW + ROW / 2; lines += '<path d="M0 ' + y1 + ' C 45 ' + y1 + ' 45 ' + y2 + ' 90 ' + y2 + '" stroke="var(--tx)" stroke-opacity=".35" stroke-width="4" fill="none"/><path d="M0 ' + y1 + ' C 45 ' + y1 + ' 45 ' + y2 + ' 90 ' + y2 + '" stroke="' + c + '" stroke-width="2" fill="none"/>'; });
      const H = Math.max(A.ends.length, B.ends.length) * ROW;
      const select = (side, cur) => '<select data-sel="' + side + '">' + all.map(g => '<option value="' + esc(g.id) + '"' + (g.id === cur ? ' selected' : '') + '>' + esc(g.label) + '</option>').join('') + '</select>';
      const fus = links.filter(l => !l.b.t && l.a.o == null && l.b.o == null).length, rec = F().record(nodeId, false) || Object.values(S.splices).find(r => r.node === nodeId);
      const list = links.length ? '<table class="t fx-list">' + links.map(l => '<tr><td>' + endText(l.a, true) + '</td><td class="fx-arrow">⟷</td><td>' + endText(l.b, true) + '</td><td style="text-align:end"><button type="button" class="ib" data-del="' + esc(F().key(l.a)) + '" title="' + tx('فك اللحام', 'Remove') + '">✕</button></td></tr>').join('') + '</table>' : '<p class="d">' + tx('لسا ما في ولا لحام بهالعلبة.', 'No joins in this closure yet.') + '</p>';
      return '<div class="f"><label>' + tx('اسم / وسم العلبة', 'Closure name / label') + '</label><input id="spL" value="' + esc((rec && rec.label) || '') + '"></div>' +
        '<div class="kv"><span><b>' + fus + '</b> ' + tx('لحام', 'fusions') + ' · ≈ ' + db(fus * F().cfg().fusion) + '</span><b>' + links.length + ' ' + tx('وصلة', 'joins') + '</b></div>' +
        '<div class="fx-heads">' + select('A', st.a) + '<span></span>' + select('B', st.b) + '</div>' +
        '<p class="d" style="margin:4px 0">' + tx('اضغط طرف من اليمين وبعده طرف من اليسار لتلحمهم. الضغط على طرف ملحوم بيحدّده للتتبّع أو الفك.', 'Click an end on one side, then one on the other, to fuse them.') + '</p>' +
        '<div class="fx-board"><div class="fx-col">' + A.html + '</div><svg class="fx-wires" width="90" height="' + H + '" viewBox="0 0 90 ' + H + '">' + (ar() ? '<g transform="translate(90 0) scale(-1 1)">' + lines + '</g>' : lines) + '</svg><div class="fx-col">' + B.html + '</div></div>' +
        '<div class="two">' + (A.pager || '<span></span>') + (B.pager || '<span></span>') + '</div>' +
        '<div class="fx-tools"><button type="button" class="btn pri" id="spOrder">' + tx('الحم بالترتيب (الفاضي مع الفاضي)', 'Fuse in order (free to free)') + '</button><button type="button" class="btn" id="spTerm">' + tx('إنهاء المحدّد', 'Terminate selected') + '</button><button type="button" class="btn" id="spUn">' + tx('فك المحدّد', 'Unjoin selected') + '</button><button type="button" class="btn" id="spTrace">' + tx('تتبّع المحدّد', 'Trace selected') + '</button><button type="button" class="btn" id="spAuto">' + tx('وصّل مقسّمات هالعلبة تلقائياً', 'Auto-join this box') + '</button></div>' +
        '<h4 class="fx-h">' + tx('كل الوصلات بهالعلبة', 'Everything joined in this closure') + '</h4><div class="fx-scroll">' + list + '</div>';
    };
    const endOf = k => { for (const g of groups(nodeId)) { const e = g.ends.find(x => F().key(x) === k); if (e) return e; } return null; };
    const partner = e => { const l = F().links(nodeId).find(x => F().same(x.a, e) || F().same(x.b, e)); return l ? (F().same(l.a, e) ? l.b : l.a) : null; };
    const WHY = { busy: tx('هالطرف ملحوم من قبل: فكّه أول', 'That end is already joined'), same_cable: tx('ما بينلحم كبل على حاله', 'Same cable on both sides'), invalid: tx('وصلة غير ممكنة', 'This join is not possible') };
    U().modal(tx('علبة اللحام — ', 'Splice closure — ') + nodeName(nodeId), render(), [{ label: tx('تتبّع', 'Trace'), keep: true, fn: () => X.openTrace({ node: nodeId }) }, { label: FT.t('close') }], function wire(root) {
      const again = () => { const sc = root.parentElement.scrollTop; root.innerHTML = render(); wire(root); root.parentElement.scrollTop = sc; };
      root.closest('.dlg').classList.add('wide');
      root.querySelector('#spL').onchange = e => { commit(() => { F().record(nodeId, true).label = e.target.value; }); };
      root.querySelectorAll('[data-sel]').forEach(s => s.onchange = () => { st[s.dataset.sel.toLowerCase()] = s.value; st['page' + s.dataset.sel] = 0; st.pick = null; again(); });
      root.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { const [side, d] = b.dataset.pg.split(':'); st['page' + side] = Math.max(0, st['page' + side] + +d); again(); });
      root.querySelectorAll('.fx-end').forEach(b => b.onclick = () => {
        const e = endOf(b.dataset.k); if (!e) return; const used = !!partner(e);
        if (!used && st.pick && !partner(st.pick.e) && st.pick.side !== b.dataset.side) { const a = st.pick.e; if (locked()) { U().toast(FT.t('ro_msg')); return; } FT.commit(); const r = F().connect(nodeId, a, e); if (!r.ok) U().toast(WHY[r.why] || r.why); else FT.changed('splice'); st.pick = null; again(); return; }
        st.pick = st.pick && F().same(st.pick.e, e) ? null : { e, side: b.dataset.side }; again();
      });
      root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const e = endOf(b.dataset.del) || F().links(nodeId).map(l => l.a).find(x => F().key(x) === b.dataset.del); if (e) commit(() => F().disconnect(nodeId, e)); st.pick = null; again(); });
      root.querySelector('#spOrder').onclick = () => {
        const all = groups(nodeId), A = all.find(g => g.id === st.a), B = all.find(g => g.id === st.b); if (!A || !B || A.id === B.id) { U().toast(tx('اختر طرفين مختلفين', 'Choose two different sides')); return; }
        // a splitter offers its outputs for this (its input is a single feed that is joined by hand)
        const free = g => g.ends.filter(e => !F().busy(nodeId, e) && !(e.s != null && e.p === 0));
        const a = free(A), b = free(B), count = Math.min(a.length, b.length); if (!count) { U().toast(tx('ما في أطراف فاضية بالجهتين', 'No free ends on both sides')); return; }
        const made = commit(() => { let k = 0; for (let i = 0; i < count; i++) if (F().connect(nodeId, a[i], b[i]).ok) k++; return k; }); if (made != null) U().toast(made + ' ✓'); again();
      };
      root.querySelector('#spTerm').onclick = () => { if (!st.pick) { U().toast(tx('حدّد طرف أول', 'Select an end first')); return; } if (partner(st.pick.e)) { U().toast(WHY.busy); return; } commit(() => F().connect(nodeId, st.pick.e, { t: 1 })); st.pick = null; again(); };
      root.querySelector('#spUn').onclick = () => { if (!st.pick || !partner(st.pick.e)) { U().toast(tx('حدّد طرف ملحوم', 'Select a joined end')); return; } commit(() => F().disconnect(nodeId, st.pick.e)); st.pick = null; again(); };
      root.querySelector('#spTrace').onclick = () => { const e = st.pick && st.pick.e; if (!e) { U().toast(tx('حدّد طرف أول', 'Select an end first')); return; } if (e.o != null) X.openTrace({ pon: [nodeId, e.o] }); else if (e.s != null) X.openTrace({ sp: e.s }); else X.openTrace({ strand: [e.c, e.f] }); };
      root.querySelector('#spAuto').onclick = () => { const r = commit(() => F().autoSplice(new Set([nodeId]))); if (!r) return; U().toast(r.done ? tx('انوصل ' + r.done + ' مقسّم (' + r.joins + ' وصلة)', r.done + ' splitter(s) joined') : r.failed.length ? X.autoWhy(r.failed[0]) : tx('كل المقسّمات هون موصولة', 'All splitters here are already fed')); again(); };
    });
  };
  X.autoWhy = f => ({ no_path: tx('ما في طريق كبلات من الـOLT لهالعلبة', 'No cable route from an OLT to this box'), no_strand: tx('كبل على الطريق ما عاد فيه شعرة فاضية', 'A cable on the route has no free strand'), busy: tx('طرف على الطريق مشغول', 'An end on the route is busy'), invalid: tx('وصلة غير ممكنة على الطريق', 'A join on the route is not possible') }[f.why] || f.why) + ' — ' + nodeName(f.node);
  X.autoAll = function () {
    if (locked()) { U().toast(FT.t('ro_msg')); return; }
    FT.commit(); const r = F().autoSplice(); FT.changed('splice');
    U().modal(tx('الوصل التلقائي', 'Auto splice'), '<div class="kv"><span>' + tx('مقسّمات انوصلت', 'Splitters joined') + '</span><b>' + r.done + '</b></div><div class="kv"><span>' + tx('وصلات انعملت', 'Joins made') + '</span><b>' + r.joins + '</b></div>' + (r.failed.length ? '<h4 class="fx-h">' + tx('ما انوصلوا', 'Not joined') + ' (' + r.failed.length + ')</h4><div class="fx-scroll">' + r.failed.slice(0, 200).map(f => '<div class="kv"><span>' + esc(X.autoWhy(f)) + '</span></div>').join('') + '</div>' : '') + '<p class="d">' + tx('Ctrl+Z بيرجّع كلشي دفعة وحدة. اللحام اليدوي الموجود ما بيتغيّر.', 'Ctrl+Z takes it all back. Existing joins are never changed.') + '</p>', [{ label: FT.t('close') }]);
    return r;
  };

  // ================= trace =================
  X.show = function (tr) { // the traced path on the map
    const lines = F().tracePoints(tr), map = FT.map.map;
    map.getSource('sel').setData({ type: 'FeatureCollection', features: lines.map(l => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) });
    return lines;
  };
  const goBtn = id => id && FT.state.nodes[id] ? ' <button type="button" class="fx-go" data-go="' + id + '">' + tx('روح', 'go') + '</button>' : '';
  function stepRow(s) {
    const C = F().cfg();
    if (s.type === 'olt') return '<li class="olt"><b>OLT · ' + esc(nodeName(s.node)) + '</b> · PON ' + s.port + goBtn(s.node) + '</li>';
    if (s.type === 'strand') { const c = FT.state.cables[s.cable]; return '<li><b>' + esc(c ? c.name : '?') + '</b> · ' + strandText(s.cable, s.f) + '<small>' + esc(nodeName(s.from)) + ' → ' + (s.to ? esc(nodeName(s.to)) : tx('المشترك', 'subscriber')) + ' · ' + FT.fmtLen(s.len || 0) + ' · ' + db((s.len || 0) / 1000 * C.att1310) + ' @1310</small></li>'; }
    if (s.type === 'fusion') return '<li class="fus">' + tx('لحام بـ ', 'fusion at ') + esc(nodeName(s.node)) + goBtn(s.node) + '<small>' + db(C.fusion) + '</small></li>';
    if (s.type === 'splitter') return '<li class="spl"><b>' + tx('مقسّم ', 'splitter ') + s.ratio + '</b> · ' + esc(nodeName(s.node)) + (s.port ? ' · ' + tx('مخرج ', 'out ') + s.port : '') + goBtn(s.node) + '<small>' + db(F().splitterLoss(s.ratio)) + '</small></li>';
    return '';
  }
  const steps = list => '<ol class="fx-steps">' + list.map(stepRow).join('') + '</ol>';
  function treeHtml(t, depth) {
    if (!t) return '';
    const free = t.out.filter(o => o.state === 'free').map(o => o.port);
    return '<ul class="fx-tree">' + t.out.filter(o => o.state !== 'free').map(o => {
      const len = (o.steps || []).filter(s => s.type === 'strand').reduce((a, s) => a + (s.len || 0), 0), head = '<b>' + tx('مخرج ', 'out ') + o.port + '</b> → ';
      if (o.state === 'split') return '<li>' + head + tx('مقسّم ', 'splitter ') + o.child.ratio + ' · ' + esc(nodeName(o.child.node)) + goBtn(o.child.node) + '<small>' + FT.fmtLen(len) + '</small>' + (depth < 6 ? treeHtml(o.child, depth + 1) : '') + '</li>';
      if (o.state === 'onu') return '<li>' + head + '👤 <button type="button" class="fx-go" data-sub="' + o.sub.id + '">' + esc(o.sub.name) + '</button><small>' + FT.fmtLen(len) + '</small></li>';
      if (o.state === 'onu_unspliced') return '<li class="warn">' + head + '👤 ' + esc(o.sub.name) + ' — ' + tx('غير ملحوم', 'not fused') + '</li>';
      if (o.state === 'term') return '<li>' + head + tx('منهية', 'terminated') + '</li>';
      return '<li class="warn">' + head + tx('مفتوحة بـ ', 'open at ') + esc(nodeName(o.node)) + goBtn(o.node) + '<small>' + FT.fmtLen(len) + '</small></li>';
    }).join('') + (free.length ? '<li class="free">' + tx('مخارج فاضية: ', 'free outputs: ') + FT.lt(ranges(free)) + '</li>' : '') + '</ul>';
  }
  const ranges = a => { const out = []; let s = a[0], p = a[0]; for (let i = 1; i <= a.length; i++) { if (a[i] === p + 1) { p = a[i]; continue; } out.push(s === p ? '' + s : s + '–' + p); s = p = a[i]; } return out.join(', '); };
  X.budgetHtml = function (b) {
    if (!b) return '';
    const C = F().cfg(), col = b.status === 'ok' ? 'var(--ok)' : b.status === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const row = (label, u, d, strong) => '<tr' + (strong ? ' class="sum"' : '') + '><td>' + label + '</td><td>' + u + '</td><td>' + d + '</td></tr>';
    return '<table class="t fx-budget"><tr><th>' + tx('البند', 'Item') + '</th><th>' + tx('صعود 1310', 'Up 1310') + '</th><th>' + tx('نزول 1490', 'Down 1490') + '</th></tr>' +
      row(tx('الألياف ', 'Fibre ') + FT.lt(Math.round(b.fibreM + b.dropM) + ' m') + (b.dropM ? tx(' (منها ' + b.dropM + ' م مفترضة للمشترك)', ' (incl. ' + b.dropM + ' m assumed drop)') : ''), db(b.up.fibre), db(b.down.fibre)) +
      row(tx('اللحامات ', 'Fusions ') + FT.lt(b.fusions + ' × ' + C.fusion), db(b.up.splice), db(b.down.splice)) +
      row(tx('الموصلات ', 'Connectors ') + FT.lt(b.connectors + ' × ' + C.connector), db(b.up.connector), db(b.down.connector)) +
      row(tx('المقسّمات ', 'Splitters ') + FT.lt(b.ratios.join(' → ') || '—'), db(b.up.splitter), db(b.down.splitter)) +
      row(tx('الفقد الكلي', 'Total loss'), db(b.up.total), db(b.down.total), true) +
      row(tx('قدرة الإرسال', 'Transmit power'), dbm(b.up.tx), dbm(b.down.tx)) +
      row(tx('قوة الإشارة عند المستقبل', 'Signal at the receiver'), dbm(b.up.rx), dbm(b.down.rx), true) +
      row(tx('حساسية المستقبل', 'Receiver sensitivity'), dbm(b.up.sens), dbm(b.down.sens)) +
      row(tx('هامش الإشارة', 'Signal margin'), db(b.up.margin), db(b.down.margin), true) + '</table>' +
      '<div class="kv"><span>' + tx('هامش الفقد عن حد ' + C.maxLoss + ' dB', 'Loss margin against ' + C.maxLoss + ' dB') + '</span><b style="color:' + col + '">' + db(b.lossMargin) + ' · ' + (b.status === 'ok' ? tx('ممتاز', 'good') : b.status === 'warn' ? tx('على الحد', 'tight') : tx('غير مقبول', 'not acceptable')) + '</b></div>' +
      '<div class="kv"><span>' + tx('الاتجاه الأضعف', 'Weaker direction') + '</span><b>' + (b.critical === 'up' ? tx('الصعود (من المشترك)', 'upstream') : tx('النزول (للمشترك)', 'downstream')) + ' · 1:' + b.split + '</b></div>';
  };
  X.ASSUME = [['att1310', 'تخميد الليف @1310 (dB/km)', 'Fibre loss @1310 (dB/km)', 'حد أقصى بمواصفة الاتصالات', 'ST maximum'], ['att1490', 'تخميد الليف @1490/1550 (dB/km)', 'Fibre loss @1490/1550 (dB/km)', 'حد أقصى بمواصفة الاتصالات', 'ST maximum'],
    ['fusion', 'فقد اللحام الواحد (dB)', 'Loss per fusion (dB)', 'حد القبول', 'acceptance limit'], ['connector', 'فقد الموصل SC/APC (dB)', 'Loss per SC/APC connector (dB)', 'حد أقصى بمواصفة الاتصالات', 'ST maximum'], ['connectors', 'عدد الموصلات على المسار', 'Connectors on the path', 'جهة الـOLT وجهة المشترك', 'OLT side and subscriber side'],
    ['dropM', 'طول كبل المشترك المفترض (م)', 'Assumed drop length (m)', 'لما ما يكون المشترك مرسوم', 'when no drop is drawn'], ['maxLoss', 'أقصى فقد مسموح (dB)', 'Largest allowed loss (dB)', 'مواصفة الاتصالات', 'ST specification'], ['warnMargin', 'هامش التنبيه (dB)', 'Warning margin (dB)', 'تحته منلوّن أصفر', 'below this: yellow'],
    ['oltTx', 'قدرة إرسال الـOLT (dBm)', 'OLT transmit power (dBm)', 'قيمة تخطيطية للصنف B+، تتأكد مع الاتصالات', 'class B+ planning value, confirm with ST'], ['onuSens', 'حساسية جهاز المشترك (dBm)', 'ONU sensitivity (dBm)', 'قيمة تخطيطية B+', 'B+ planning value'], ['onuTx', 'قدرة إرسال جهاز المشترك (dBm)', 'ONU transmit power (dBm)', 'قيمة تخطيطية B+، تتأكد من نشرة الجهاز', 'B+ planning value, check the data sheet'], ['oltSens', 'حساسية الـOLT (dBm)', 'OLT sensitivity (dBm)', 'قيمة تخطيطية B+', 'B+ planning value']];
  X.assumeTable = () => { const C = F().cfg(); return '<table class="t">' + X.ASSUME.map(a => '<tr><td>' + esc(ar() ? a[1] : a[2]) + '<small class="fx-src">' + esc(ar() ? a[3] : a[4]) + '</small></td><td style="direction:ltr;text-align:end"><b>' + C[a[0]] + '</b></td></tr>').join('') + '</table>'; };
  X.openAssumptions = function (back) {
    const C = F().cfg();
    const body = '<p class="d">' + tx('هالأرقام بتنحسب عليها كل الميزانية والتقرير. غيّرها حسب أجهزتك ومواصفة الاتصالات.', 'Every budget and the report use these values.') + '</p><table class="t">' + X.ASSUME.map(a => '<tr><td>' + esc(ar() ? a[1] : a[2]) + '<small class="fx-src">' + esc(ar() ? a[3] : a[4]) + '</small></td><td><input data-as="' + a[0] + '" value="' + C[a[0]] + '" style="direction:ltr;width:96px"></td></tr>').join('') + '</table>';
    U().modal(tx('قيم حساب الميزانية', 'Budget planning values'), body, [{ label: tx('رجّع القيم الأصلية', 'Reset'), fn: () => { if (locked()) return; FT.commit(); if (FT.state.cfg) delete FT.state.cfg.budget; FT.changed('prop'); if (back) setTimeout(back, 0); } }, { label: FT.t('close'), fn: () => { if (back) setTimeout(back, 0); } }, { label: FT.t('p_save'), cls: 'pri', fn: () => { if (locked()) return; const out = {}; document.querySelectorAll('[data-as]').forEach(i => { const v = num(i.value); if (!isNaN(v) && v !== F().DEFAULTS[i.dataset.as]) out[i.dataset.as] = v; }); FT.commit(); FT.state.cfg = FT.state.cfg || {}; FT.state.cfg.budget = out; FT.changed('prop'); U().toast(FT.t('toast_saved')); if (back) setTimeout(back, 0); } }]);
  };

  function chooser(title, items) { // several possible starting points: let the engineer pick
    U().modal(title, '<div class="fx-pick">' + items.map((it, i) => '<button type="button" class="btn full" data-ch="' + i + '">' + it.html + '</button>').join('') + '</div>', [{ label: FT.t('close') }], root => root.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => X.openTrace(items[+b.dataset.ch].target)));
  }
  X.openTrace = function (target) {
    const S = FT.state, ix = F().index();
    if (target.node) {
      const n = S.nodes[target.node]; if (!n) return;
      const sps = F().splittersOf(n.id);
      if (n.type === 'olt') { const ports = F().usedPon(n.id).sort((a, b) => a - b); if (!ports.length && !sps.length) { U().toast(tx('ما في ولا منفذ PON موصول لسا', 'No PON port is patched yet')); return; } return chooser(tx('تتبّع من أي منفذ؟', 'Trace from which port?'), ports.map(p => ({ html: 'PON ' + p, target: { pon: [n.id, p] } })).concat(sps.map(sp => ({ html: tx('مقسّم ', 'Splitter ') + sp.ratio + ' #' + sp.i, target: { sp: sp.key } })))); }
      if (sps.length === 1) return X.openTrace({ sp: sps[0].key });
      if (sps.length > 1) return chooser(tx('تتبّع أي مقسّم؟', 'Which splitter?'), sps.map(sp => ({ html: tx('مقسّم ', 'Splitter ') + sp.ratio + ' #' + sp.i, target: { sp: sp.key } })));
      const here = F().links(n.id).map(l => l.a.c != null ? l.a : l.b).filter(e => e.c != null);
      if (!here.length) { U().toast(tx('ما في لحامات ولا مقسّمات هون لنتتبّعها', 'Nothing to trace here yet')); return; }
      return chooser(tx('تتبّع أي شعرة؟', 'Which strand?'), here.slice(0, 120).map(e => ({ html: esc(S.cables[e.c].name) + ' · ' + strandText(e.c, e.f), target: { strand: [e.c, e.f] } })));
    }
    const tr = target.sp ? F().traceSplitter(target.sp, ix) : target.sub ? F().traceSub(target.sub, ix) : target.pon ? F().tracePon(target.pon[0], target.pon[1], ix) : F().traceStrand(target.strand[0], target.strand[1], ix);
    if (!tr) return;
    const title = target.sp ? nodeName(tr.splitter.node) + ' · ' + tr.splitter.ratio : target.sub ? tr.sub.name : target.pon ? nodeName(target.pon[0]) + ' · PON ' + target.pon[1] : (S.cables[target.strand[0]] || {}).name + ' · ' + F().strandName(S.cables[target.strand[0]], target.strand[1]);
    let body = '<div class="kv"><span>' + X.statusChip(tr.status) + '</span><b>' + (tr.reached && tr.olt ? FT.lt(esc(nodeName(tr.olt)) + ' · PON ' + tr.port) : '') + '</b></div>';
    if (tr.issues.length) body += '<div class="fx-issues">' + tr.issues.slice(0, 40).map(i => '<div>⚠ ' + esc(X.issueText(i)) + goBtn(i.node) + '</div>').join('') + '</div>';
    const upList = (tr.up || []).slice().reverse(); // from the OLT towards the point we started from
    if (target.pon) body += '<h4 class="fx-h">' + tx('من المنفذ باتجاه المشتركين', 'From the port downstream') + '</h4>' + steps(tr.steps) + treeHtml(tr.result.child, 0);
    else {
      if (upList.length) body += '<h4 class="fx-h">' + tx('من الـ ' + FT.lt('OLT') + ' لهون', 'From the OLT to here') + '</h4>' + steps(upList.concat(tr.own ? [tr.own] : [], tr.mine ? [tr.mine] : [], tr.kind === 'sub' ? tr.drop : [], tr.downSteps || []));
      if (tr.tree) body += '<h4 class="fx-h">' + tx('من هون باتجاه المشتركين', 'From here downstream') + '</h4>' + treeHtml(tr.tree, 0);
      if (tr.down && tr.down.state === 'split') body += '<h4 class="fx-h">' + tx('من هون باتجاه المشتركين', 'From here downstream') + '</h4>' + treeHtml(tr.down.child, 0);
    }
    if (tr.budget) body += '<h4 class="fx-h">' + tx('ميزانية الإشارة على المسار الفعلي', 'Optical budget along the real path') + '</h4>' + X.budgetHtml(tr.budget) + '<details class="fx-as"><summary>' + tx('القيم يلي انحسب عليها', 'Values used') + ' (' + X.ASSUME.length + ')</summary>' + X.assumeTable() + '</details>';
    else if (!tr.reached) body += '<p class="d">' + tx('المسار مقطوع قبل الـOLT، فما منعطي أرقام إشارة.', 'The path does not reach the OLT, so no signal figures are given.') + '</p>';
    U().modal(tx('تتبّع الليف — ', 'Fibre trace — ') + title, body, [{ label: tx('قيم الحساب', 'Values'), keep: true, fn: () => X.openAssumptions(() => X.openTrace(target)) }, { label: tx('اعرض المسار عالخريطة', 'Show on the map'), cls: 'pri', fn: () => { const lines = X.show(tr); if (lines.length) { FT.map.fitBBox(FT.bboxOf([].concat(...lines))); } else U().toast(tx('ما في مسار نعرضه', 'No path to show')); } }, { label: FT.t('close') }], root => {
      root.closest('.dlg').classList.add('wide');
      root.querySelectorAll('[data-go]').forEach(b => b.onclick = ev => { ev.preventDefault(); const n = S.nodes[b.dataset.go]; if (!n) return; U().closeModal(); FT.map.flyTo(n.ll, 18.8); FT.T.select('node', n.id); X.show(tr); });
      root.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => X.openTrace({ sub: b.dataset.sub }));
    });
    X.show(tr); X.last = tr; return tr;
  };

  // ports of the splitters of a node, for the properties panel
  X.portGrid = function (nodeId) {
    const ix = F().index();
    return F().splittersOf(nodeId).slice(0, 12).map(sp => {
      const subs = (ix.subAt[nodeId] || []).filter(s => (s.spl || 1) === sp.i);
      let used = 0; const cells = Array.from({ length: sp.n }, (_, i) => { const p = i + 1, joined = !!(ix.at[nodeId] && ix.at[nodeId]['s:' + sp.key + ':' + p]), sub = subs.find(s => s.port === p), cls = sub ? 'onu' : joined ? 'fus' : ''; if (sub || joined) used++; return '<button type="button" class="fx-port ' + cls + '" data-spk="' + sp.key + '" title="' + esc(sub ? sub.name : joined ? tx('ملحوم', 'fused') : tx('فاضي', 'free')) + '">' + p + '</button>'; }).join('');
      const fed = !!(ix.at[nodeId] && ix.at[nodeId]['s:' + sp.key + ':0']);
      return '<div class="fx-ports"><div class="kv"><span>' + sp.ratio + ' #' + sp.i + ' · ' + (fed ? tx('دخله ملحوم', 'input fused') : '<span style="color:var(--warn)">' + tx('دخله مو ملحوم', 'input not fused') + '</span>') + '</span><b>' + used + '/' + sp.n + '</b></div><div class="fx-portrow">' + cells + '</div></div>';
    }).join('');
  };
})(window);
