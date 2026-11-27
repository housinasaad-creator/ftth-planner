/* Results of an automatic design (also of the whole project): cables, splitters, splice plan, budget per box, material and
   warnings in tabs, with the fibre label file for the field team, the PDF report of just that design and its map. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const D = FT.designResults = {};
  const U = () => FT.UI, F = () => FT.fiber, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const nm = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '—'; };
  const group = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder';
  const MAX = 600;

  D.list = () => Object.entries(FT.state.folders || {}).filter(([, f]) => /^Design-\d+$/.test(f.name)).map(([id, f]) => ({ id, name: f.name })).sort((a, b) => +a.name.slice(7) - +b.name.slice(7));
  D.scope = function (name) {
    if (!name) return null;
    const S = FT.state, d = D.list().find(x => x.name === name); if (!d) return null;
    const scope = { nodes: new Set(), pipes: new Set(), cables: new Set() };
    Object.entries(S.fmap || {}).forEach(([k, fid]) => { if (fid !== d.id) return; const id = k.slice(2), set = k[0] === 'n' ? 'nodes' : k[0] === 'p' ? 'pipes' : k[0] === 'c' ? 'cables' : null; if (set && S[set][id]) scope[set].add(id); });
    return scope;
  };
  D.labelRows = function (scope) {
    const rows = [[tx('الكبل', 'cable'), tx('الوظيفة', 'role'), tx('الأنبوب', 'tube'), tx('رقم الشعرة', 'strand'), tx('اللون', 'colour'), tx('من', 'from'), tx('الوجهة', 'to'), 'OLT', 'PON', tx('طول الكبل (م)', 'cable length (m)'), tx('الحالة', 'status')]];
    F().labels().filter(r => !scope || scope.cables.has(r.cable.id)).forEach(r => rows.push([r.cable.name, group(r.cable), r.tube, r.f, r.color.code + ' ' + (ar() ? r.color.ar : r.color.en), r.from, r.dest, r.olt, r.pon, FT.cableLength(r.cable).toFixed(1), r.status]));
    return rows;
  };
  D.labelsCsv = function (scope) { FT.exp.download('ftth_fibre_labels_' + new Date().toISOString().slice(0, 10) + '.csv', FT.exp.csv(D.labelRows(scope)), 'text/csv;charset=utf-8'); };

  D.data = function (scope) {
    const S = FT.state, A = F().analyze(), inN = id => !scope || scope.nodes.has(id);
    const cables = Object.values(S.cables).filter(c => !scope || scope.cables.has(c.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
    const boxes = A.boxes.filter(r => r.node.type === 'bk' && inN(r.node.id)).sort((a, b) => nm(a.node.id).localeCompare(nm(b.node.id), undefined, { numeric: true }));
    const splitters = A.boxes.filter(r => inN(r.node.id)).sort((a, b) => nm(a.node.id).localeCompare(nm(b.node.id), undefined, { numeric: true }));
    const joins = []; Object.values(S.nodes).filter(n => inN(n.id) || (n.type === 'olt')).forEach(n => F().links(n.id).forEach(l => { if (scope && !scope.nodes.has(n.id)) { const c = l.a.c != null ? l.a.c : l.b.c; if (!c || !scope.cables.has(c)) return; } joins.push({ n, a: l.a, b: l.b }); }));
    const warnings = [], add = (level, text, node) => warnings.push({ level, text, node });
    boxes.forEach(r => {
      if (!r.reached) add('bad', tx('العلبة ' + nm(r.node.id) + ' ما بتوصل للـOLT', nm(r.node.id) + ' does not reach the OLT') + ' — ' + FT.fui.issueText(r.issues[0] || { code: 'open' }), r.node.id);
      else { if (r.budget.status === 'bad') add('bad', tx(nm(r.node.id) + ': الفقد ' + r.budget.worstLoss.toFixed(1) + ' dB فوق الحد', nm(r.node.id) + ': loss ' + r.budget.worstLoss.toFixed(1) + ' dB over the limit'), r.node.id); else if (r.budget.status === 'warn') add('warn', tx(nm(r.node.id) + ': الإشارة على الحد', nm(r.node.id) + ': signal close to the limit'), r.node.id); r.issues.forEach(i => add('warn', FT.fui.issueText(i), i.node)); }
    });
    cables.forEach(c => { const len = FT.cableLength(c); if (c.sub && len > FT.fui.DROP_WARN_M) add('warn', tx('كبل المشترك ' + c.name + ' طوله ' + Math.round(len) + ' م', c.name + ' is ' + Math.round(len) + ' m long'), c.a); if (c.medium === 'aerial' && !c.sub) c._aerial = 1; });
    if (cables.some(c => c._aerial)) add('warn', tx('في تمديد هوائي: بدو موافقة خطية من الاتصالات، وعلى الجدران فقط.', 'Aerial routes present: written ST approval needed, walls only.'));
    cables.forEach(c => delete c._aerial);
    Object.values(S.pipes).filter(p => !scope || scope.pipes.has(p.id)).forEach(p => { if (p.ptype !== 'aerial' && FT.pathLen(p.pts) > FT.LIMITS.maxSpan) add('warn', tx(p.name + ': أطول من ' + FT.LIMITS.maxSpan + ' م بلا غرفة تفتيش', p.name + ': over ' + FT.LIMITS.maxSpan + ' m without a chamber'), p.a); });
    return { A, cables, boxes, splitters, joins, warnings, cost: FT.cost(scope) };
  };

  const table = (head, rows, empty) => rows.length ? '<table class="t dr"><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr>' + rows.slice(0, MAX).map(r => '<tr' + (r.go ? ' data-go="' + r.go + '"' : '') + '>' + r.c.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table>' + (rows.length > MAX ? '<p class="d">' + tx('عُرض أول ' + MAX + ' من ' + rows.length + '. الكل بالتقرير وبملفات CSV.', 'First ' + MAX + ' of ' + rows.length + '.') + '</p>' : '') : '<p class="d">' + (empty || '—') + '</p>';

  D.open = function (name) {
    if (name === undefined) { const l = D.list(); name = l.length ? l[l.length - 1].name : null; }
    const scope = D.scope(name), d = D.data(scope), S = FT.state; let tab = 'budget';
    const end = e => { if (!e) return '—'; if (e.t) return tx('منهية', 'terminated'); if (e.o != null) return 'PON ' + e.o; if (e.s != null) { const sp = F().splitter(e.s); return tx('مقسّم ', 'splitter ') + FT.lt((sp ? sp.ratio : '?') + ' #' + String(e.s).split('#').pop()) + ' · ' + (e.p ? tx('مخرج ', 'out ') + e.p : tx('دخل', 'in')); } const c = S.cables[e.c]; return c ? '<i class="fx-dot" style="background:' + F().strandColor(c, e.f).hex + '"></i>' + FT.lt(F().strandName(c, e.f)) + ' <small>' + esc(c.name) + '</small>' : '?'; };
    const col = s => s === 'ok' ? 'var(--ok)' : s === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const TABS = [
      ['budget', tx('ميزانية العلب', 'Budget'), d.boxes.length], ['cables', tx('الكبلات', 'Cables'), d.cables.length], ['splitters', tx('المقسّمات', 'Splitters'), d.splitters.length], ['splices', tx('خطة اللحام', 'Splices'), d.joins.length], ['material', tx('المواد', 'Material'), d.cost.lines.length], ['warn', tx('التحذيرات', 'Warnings'), d.warnings.length]];
    const content = () => {
      if (tab === 'budget') return table([tx('العلبة', 'Box'), 'PON', tx('الليف م', 'Fibre m'), tx('الفقد dB', 'Loss dB'), tx('إشارة ↓', 'Rx ↓'), tx('إشارة ↑', 'Rx ↑'), tx('الهامش', 'Margin')], d.boxes.map(r => { const b = r.budget; return { go: r.node.id, c: ['<button type="button" class="fx-go" data-tsp="' + r.splitter.key + '">' + esc(nm(r.node.id)) + '</button>', r.reached ? r.port : '—', b ? Math.round(b.fibreM) : '—', b ? b.down.total.toFixed(2) : '—', b ? FT.lt(b.down.rx.toFixed(2)) : '—', b ? FT.lt(b.up.rx.toFixed(2)) : '—', b ? '<b style="color:' + col(b.status) + '">' + Math.min(b.lossMargin, b.sensMargin).toFixed(2) + '</b>' : '<b style="color:var(--bad)">' + tx('مقطوعة', 'broken') + '</b>'] }; }));
      if (tab === 'cables') return table([tx('الكبل', 'Cable'), tx('الوظيفة', 'Role'), tx('ألياف', 'Fibres'), tx('مستعمل', 'Used'), tx('من', 'From'), tx('إلى', 'To'), tx('الطول', 'Length')], d.cables.map(c => { let used = 0; for (let f = 1; f <= c.core; f++) if (d.A.ix.used[c.id + ':' + f]) used++; return { c: [esc(c.name), group(c), c.core, used, esc(nm(c.a)), c.sub && S.subs[c.sub] ? esc(S.subs[c.sub].name) : esc(nm(c.b)), FT.lt(FT.cableLength(c).toFixed(1) + ' m')] }; }));
      if (tab === 'splitters') return table([tx('العقدة', 'Node'), tx('المقسّم', 'Splitter'), '#', 'PON', tx('دخله', 'Input'), tx('مخارج ملحومة', 'Fused outputs'), tx('مشتركين', 'Subscribers')], d.splitters.map(r => ({ c: ['<button type="button" class="fx-go" data-tsp="' + r.splitter.key + '">' + esc(nm(r.node.id)) + '</button>', FT.lt(r.splitter.ratio), r.splitter.i, r.reached ? r.port : '—', r.reached ? '✔' : '<span style="color:var(--bad)">✘</span>', r.spliced + '/' + r.splitter.n, r.onus] })));
      if (tab === 'splices') return table([tx('العلبة', 'Closure'), tx('من', 'From'), tx('إلى', 'To')], d.joins.map(j => ({ c: [esc(nm(j.n.id)), end(j.a), end(j.b)] })));
      if (tab === 'material') return table([tx('البند', 'Item'), tx('الكمية', 'Quantity')].concat(FT.hasPrices() ? [tx('الإجمالي', 'Total')] : []), d.cost.lines.map(l => ({ c: [esc(l.name), FT.lt(l.unit === 'm' ? l.qty.toFixed(1) + ' m' : String(l.qty))].concat(FT.hasPrices() ? [FT.money(l.total)] : []) }))) + (FT.hasPrices() ? '<div class="kv"><span><b>' + tx('الإجمالي', 'Total') + '</b></span><b style="color:var(--ok)">' + FT.money(d.cost.total) + '</b></div>' : '');
      return d.warnings.length ? '<div class="fx-issues">' + d.warnings.slice(0, MAX).map(w => '<div style="color:' + col(w.level) + '">' + (w.level === 'bad' ? '✘ ' : '⚠ ') + esc(w.text) + (w.node ? ' <button type="button" class="fx-go" data-goto="' + w.node + '">' + tx('روح', 'go') + '</button>' : '') + '</div>').join('') + '</div>' : '<p class="d" style="color:var(--ok)">✔ ' + tx('ما في تحذيرات.', 'No warnings.') + '</p>';
    };
    const render = () => {
      const ok = d.boxes.filter(r => r.reached && !r.issues.length && r.budget.status === 'ok').length, worst = Math.max(0, ...d.boxes.map(r => r.budget ? r.budget.worstLoss : 0));
      return '<div class="two"><div class="f"><label>' + tx('عرض', 'Show') + '</label><select id="drWhich">' + D.list().map(x => '<option value="' + x.name + '"' + (x.name === name ? ' selected' : '') + '>' + x.name + '</option>').join('') + '<option value=""' + (!name ? ' selected' : '') + '>' + tx('المشروع كامل', 'Whole project') + '</option></select></div><div><div class="kv"><span>' + tx('علب سليمة', 'Healthy boxes') + '</span><b>' + ok + ' / ' + d.boxes.length + '</b></div><div class="kv"><span>' + tx('أكبر فقد', 'Largest loss') + '</span><b>' + (worst ? FT.lt(worst.toFixed(2) + ' dB') : '—') + '</b></div></div></div>' +
        '<div class="seg" id="drTabs" style="margin:6px 0 8px">' + TABS.map(([k, l, n]) => '<button type="button" data-t="' + k + '" class="' + (tab === k ? 'on' : '') + '">' + l + ' <b>' + n + '</b></button>').join('') + '</div><div class="dr-box">' + content() + '</div>' +
        '<div class="fx-tools"><button type="button" class="btn pri" id="drPdf">' + FT.t('rp_print') + '</button><button type="button" class="btn" id="drLab">' + tx('لصاقات الألياف CSV', 'Fibre labels CSV') + '</button><button type="button" class="btn" id="drCsv">' + tx('المواد CSV', 'Material CSV') + '</button><button type="button" class="btn" id="drMap">' + tx('اعرضه عالخريطة', 'Show on the map') + '</button></div>';
    };
    U().modal(tx('نتائج التصميم', 'Design results') + (name ? ' — ' + name : ''), render(), [{ label: FT.t('close') }], function wire(root) {
      root.closest('.dlg').classList.add('wide');
      const again = () => { root.innerHTML = render(); wire(root); };
      root.querySelector('#drWhich').onchange = e => D.open(e.target.value || null);
      root.querySelectorAll('#drTabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; again(); });
      root.querySelectorAll('[data-tsp]').forEach(b => b.onclick = () => FT.fui.openTrace({ sp: b.dataset.tsp }));
      root.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { const n = S.nodes[b.dataset.goto]; if (!n) return; U().closeModal(); FT.map.flyTo(n.ll, 18.8); FT.T.select('node', n.id); });
      root.querySelector('#drPdf').onclick = () => FT.rep.download(scope, null);
      root.querySelector('#drLab').onclick = () => D.labelsCsv(scope);
      root.querySelector('#drCsv').onclick = () => FT.exp.reportCsv(scope);
      root.querySelector('#drMap').onclick = () => { U().closeModal(); const m = scope || { nodes: new Set(Object.keys(S.nodes)), pipes: new Set(Object.keys(S.pipes)), cables: new Set(Object.keys(S.cables)) }; const pts = [...m.nodes].map(id => S.nodes[id].ll); if (pts.length > 1) { FT.map.fitBBox(FT.bboxOf(pts)); FT.T.selectMulti({ nodes: m.nodes, pipes: m.pipes, cables: m.cables, houses: new Set() }); } };
    });
    D.last = d;
  };
})(window);
