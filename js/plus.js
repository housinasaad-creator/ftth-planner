/* Everyday helpers on a real project: flats for a whole area or from a survey sheet, one "network health" list that jumps to
   every problem, the cost of one flat, and the three split plans side by side before a design is applied. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const P = FT.plus = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const readOnly = () => !!(FT.store && FT.store.mode === 'view');
  const digits = v => String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const int = v => parseInt(digits(v), 10) || 0;
  const csvCell = v => /[",\r\n;]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

  // ---------------- flats and floors for every building of an area ----------------
  P.applyArea = async function (ring, o) { // o: {floors, flats, perFloor}
    if (readOnly()) return 0; await FT.map.ensureTiles(FT.bboxOf(ring)); const list = FT.map.buildingsInRing(ring); if (!list.length || !(o.floors || o.flats || o.perFloor)) return 0;
    FT.commit();
    list.forEach(x => { const b = FT.houses.pin(x.id); if (o.floors) b.floors = Math.min(FT.houses.MAX_FLOORS, o.floors);
      if (o.flats) b.flats = Math.min(400, o.flats); else if (o.perFloor) b.flats = Math.min(400, FT.houses.floorsOf(b) * o.perFloor); });
    FT.changed('floors'); return list.length;
  };
  P.pickArea = function (o) {
    FT.T.startShape('poly', async ring => { const n = await P.applyArea(ring, o); FT.UI.toast(n ? tx('تعدّل ' + n + ' مبنى. Ctrl+Z بيتراجع.', n + ' building(s) updated. Ctrl+Z undoes it.') : tx('اكتب الطوابق أو الشقق أول', 'Type the floors or flats first')); FT.T.setTool('select'); }, tx('ارسم المنطقة حوالين المباني', 'Draw the area around the buildings'));
  };
  // the survey sheet: out with what is known, back with what was counted on site
  P.surveySheet = function () {
    const rows = [['id', 'number', 'lat', 'lon', 'floors', 'flats', 'name']];
    FT.map.housesData().forEach(h => { const o = h.o || FT.state.bld[h.id] || {}; rows.push([h.id, o.num ? FT.num.label(o) : '', h.ll[1].toFixed(6), h.ll[0].toFixed(6), o.floors || '', o.flats || '', o.name || '']); });
    return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  };
  P.importSurvey = function (text) {
    const rows = FT.field.parseCsv(text); if (rows.length < 2) return { applied: 0, unknown: 0, error: 'empty' };
    const head = rows[0].map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
    if (col('flats') < 0 && col('floors') < 0) return { applied: 0, unknown: 0, error: 'columns' };
    const houses = FT.map.housesData(), byNum = {}, twice = {}; houses.forEach(h => { const o = h.o || {}; if (!o.num) return; const k = FT.num.label(o).toLowerCase(); if (byNum[k]) twice[k] = 1; byNum[k] = h.id; });
    const todo = []; let unknown = 0;
    rows.slice(1).forEach(r => {
      const get = k => col(k) >= 0 ? String(r[col(k)] || '').trim() : '', floors = int(get('floors')), flats = int(get('flats')); if (!floors && !flats) return;
      let id = get('id'); if (id && !FT.state.bld[id] && !houses.some(h => h.id === id)) id = '';
      const k = digits(get('number')).toLowerCase(); if (!id && k && byNum[k] && !twice[k]) id = byNum[k];
      const lat = parseFloat(digits(get('lat'))), lon = parseFloat(digits(get('lon')));
      if (!id && isFinite(lat) && isFinite(lon)) { let best = 15; houses.forEach(h => { const d = FT.dist([lon, lat], h.ll); if (d < best) { best = d; id = h.id; } });
        if (!id && FT.map.buildingAt) id = FT.map.buildingAt([lon, lat]) || ''; }
      if (!id) { unknown++; return; } todo.push([id, floors, flats]);
    });
    if (todo.length && !readOnly()) { FT.commit(); todo.forEach(([id, fl, n]) => { const b = FT.houses.pin(id); if (fl) b.floors = Math.min(FT.houses.MAX_FLOORS, fl); if (n) b.flats = Math.min(400, n); }); FT.changed('floors'); }
    return { applied: readOnly() ? 0 : todo.length, unknown };
  };
  P.downloadSurvey = () => FT.exp.download('ftth_flats_survey.csv', new Blob([P.surveySheet()], { type: 'text/csv;charset=utf-8' }));
  P.pickSurvey = function () {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,text/csv'; i.id = 'surveyFile'; i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return; const r = P.importSurvey(await f.text()); FT.UI.toast(r.error ? tx('الملف ما فيه عمود flats أو floors', 'The file has no flats or floors column') : tx('تعدّل ' + r.applied + ' مبنى' + (r.unknown ? ' · ' + r.unknown + ' ما انعرفو' : ''), r.applied + ' building(s) updated' + (r.unknown ? ' · ' + r.unknown + ' not recognised' : ''))); };
    i.click();
  };

  // ---------------- the network health list ----------------
  P.health = function () {
    const S = FT.state, out = [], A = FT.fiber.analyze();
    const nm = id => { const n = S.nodes[id]; return n ? (n.code || n.name) : '?'; };
    const add = (level, group, text, kind, id) => out.push({ level, group, text, kind: kind || null, id: id || null });
    const G_ = { link: tx('التوصيل', 'Connection'), signal: tx('الإشارة', 'Signal'), cap: tx('السعة', 'Capacity'), data: tx('البيانات', 'Data'), spec: tx('المواصفة', 'Specification'), site: tx('الموقع', 'On site') };
    A.boxes.filter(b => b.node.type === 'bk').forEach(b => {
      if (!b.reached) add('bad', G_.link, tx(nm(b.node.id) + ': المقسّم ' + b.splitter.i + ' مو واصل للمقسم المركزي', nm(b.node.id) + ': splitter ' + b.splitter.i + ' does not reach the exchange'), 'node', b.node.id);
      else { if (b.issues.length) add('warn', G_.link, tx(nm(b.node.id) + ': مسارها فيه ملاحظة لحام', nm(b.node.id) + ': a splicing note on its path'), 'node', b.node.id);
        if (b.budget.worstLoss > FT.LIMITS.maxLoss || b.budget.sensMargin < 0) add('bad', G_.signal, tx(nm(b.node.id) + ': الفقد ' + b.budget.worstLoss.toFixed(1) + ' dB', nm(b.node.id) + ': loss ' + b.budget.worstLoss.toFixed(1) + ' dB'), 'node', b.node.id);
        else if (b.budget.tooStrong) add('warn', G_.signal, tx(nm(b.node.id) + ': إشارة قوية زيادة، يلزم مخمّد', nm(b.node.id) + ': too strong, attenuator needed'), 'node', b.node.id);
        else if (b.budget.spare < 0) add('warn', G_.signal, tx(nm(b.node.id) + ': ما باقي هامش للمستقبل', nm(b.node.id) + ': no margin left for the future'), 'node', b.node.id); }
    });
    A.subs.forEach(t => { if (t && t.status !== 'ok') add('warn', G_.link, tx('المشترك ' + t.sub.name + ': توصيله ناقص', 'Subscriber ' + t.sub.name + ': incomplete connection'), 'node', t.sub.node); });
    FT.spec.capacity().forEach(c => { if (c.ports < c.flats) add('bad', G_.cap, tx('مبنى عليه ' + nm(c.fdb) + ': ' + c.ports + ' منفذ لـ ' + c.flats + ' شقة', 'Building of ' + nm(c.fdb) + ': ' + c.ports + ' ports for ' + c.flats + ' flats'), 'bld', c.id); });
    const guess = FT.spec.capacity().filter(c => !c.known).length; if (guess) add('info', G_.data, tx(guess + ' مبنى عدد شققه مقدّر من الطوابق. أدخل العدد الحقيقي من المسح.', guess + ' building(s) have an estimated flat count; enter the surveyed number.'));
    const codes = {}; Object.values(S.nodes).forEach(n => { if (n.code) (codes[n.code] = codes[n.code] || []).push(n.id); });
    Object.entries(codes).forEach(([c, ids]) => { if (ids.length > 1) add('bad', G_.data, tx('الرمز ' + c + ' مكرر ' + ids.length + ' مرات', 'Code ' + c + ' is used ' + ids.length + ' times'), 'node', ids[1]); });
    const wired = new Set(); Object.values(S.cables).forEach(c => (c.nodes || []).forEach(i => wired.add(i)));
    Object.values(S.nodes).forEach(n => { if ((FT.BOX_TYPES.includes(n.type) || n.type === 'olt') && !wired.has(n.id)) add('warn', G_.link, tx(nm(n.id) + ': ما واصلها أي كبل', nm(n.id) + ': no cable reaches it'), 'node', n.id); });
    FT.spec.soc().items.filter(i => (i.status === 'bad' || i.status === 'warn') && !['loss', 'ports'].includes(i.id)).forEach(i => add(i.status === 'bad' ? 'bad' : 'warn', G_.spec, (ar() ? i.ar : i.en) + ' — ' + i.detail, i.refs && i.refs.length ? (S.nodes[i.refs[0]] ? 'node' : S.pipes[i.refs[0]] ? 'pipe' : S.cables[i.refs[0]] ? 'cable' : null) : null, i.refs && i.refs[0]));
    if (FT.field) FT.field.measurements().rows.forEach(r => { if (r.status === 'over' || r.status === 'high' || r.status === 'low') add(r.status === 'over' ? 'bad' : 'warn', G_.site, nm(r.node.id) + ': ' + tx(FT.field.STATUS[r.status][0], FT.field.STATUS[r.status][1]), 'node', r.node.id); });
    [['node', S.nodes], ['pipe', S.pipes], ['cable', S.cables]].forEach(([k, bag]) => Object.values(bag).forEach(o => { if (o.bs && o.bs.s === 'issue') add('bad', G_.site, (o.code || o.name) + ': ' + (o.bs.note || tx('فيه مشكلة بالموقع', 'problem on site')), k, o.id); }));
    const order = { bad: 0, warn: 1, info: 2 }; return out.sort((a, b) => order[a.level] - order[b.level]);
  };
  P.goTo = function (kind, id) {
    const S = FT.state; if (!kind || !id) return;
    if (kind === 'bld') { const ll = FT.map.housePoint(id) || (S.bld[id] || {}).ll; if (ll) FT.map.map.easeTo({ center: ll, zoom: 19 }); FT.T.select('bld', id); FT.UI.tab('props'); return; }
    const o = (kind === 'node' ? S.nodes : kind === 'pipe' ? S.pipes : S.cables)[id]; if (!o) return;
    const pts = kind === 'node' ? [o.ll] : kind === 'pipe' ? o.pts : [].concat(...FT.cableSpans(o).map(s => s.pts));
    if (kind === 'node') FT.map.map.easeTo({ center: o.ll, zoom: 18.8 }); else FT.map.fitBBox(FT.bboxOf(pts));
    FT.T.select(kind, id); FT.UI.tab('props');
  };
  P.openHealth = function () {
    const list = P.health(), n = l => list.filter(x => x.level === l).length, col = { bad: '#ff4f7a', warn: '#ffc233', info: '#2aa8ff' }, mark = { bad: '✘', warn: '⚠', info: 'ℹ' };
    const body = list.length ? '<div class="kv"><span style="color:' + col.bad + '">✘ ' + n('bad') + ' ' + tx('لازم يتصلّح', 'to fix') + '</span><b style="color:' + col.warn + '">⚠ ' + n('warn') + ' ' + tx('للمراجعة', 'to review') + '</b></div><div class="hl-list">' + list.slice(0, 400).map((x, i) => '<button type="button" class="fv-row" data-hl="' + i + '"' + (x.id ? '' : ' disabled') + '><span style="color:' + col[x.level] + ';flex:none">' + mark[x.level] + '</span><span style="direction:' + (ar() ? 'rtl' : 'ltr') + '">' + esc(x.text) + '</span><small>' + esc(x.group) + '</small></button>').join('') + '</div>' + (list.length > 400 ? '<p class="d">+' + (list.length - 400) + '</p>' : '')
      : '<p class="d">' + (Object.keys(FT.state.nodes).length ? tx('✔ ما لقينا مشاكل بالفحوص الآلية. بيضل لازم مراجعة المهندس.', '✔ The automatic checks found nothing. An engineer still has to review.') : tx('لسا ما في شبكة لنفحصها.', 'There is no network to check yet.')) + '</p>';
    FT.UI.modal(tx('فحص صحة الشبكة', 'Network health check'), body, [{ label: FT.t('close') }], root => root.querySelectorAll('[data-hl]').forEach(b => b.onclick = () => { const x = list[+b.dataset.hl]; FT.UI.closeModal(); P.goTo(x.kind, x.id); }));
  };

  // ---------------- what one flat costs ----------------
  P.costPerFlat = function () {
    const cap = FT.spec.capacity(), flats = cap.reduce((a, c) => a + c.flats, 0); if (!flats || !FT.hasPrices()) return null;
    const total = FT.cost(null).total; return { total, flats, per: total / flats, buildings: cap.length, estimated: cap.filter(c => !c.known).length };
  };
  P.costHtml = function () {
    const c = P.costPerFlat(); if (!c) return '';
    return '<div class="kv"><span>' + tx('الكلفة لكل شقة مغطّاة', 'Cost per flat covered') + '</span><b style="color:var(--ok)">' + FT.money(c.per) + ' <small>' + FT.lt(String(c.flats)) + ' ' + tx('شقة' + (c.estimated ? ' (منها مقدّر)' : ''), 'flats' + (c.estimated ? ' (some estimated)' : '')) + '</small></b></div>';
  };

  // ---------------- the three split plans side by side ----------------
  P.planCost = function (plan) {
    const D = FT.design, C = FT.fiber.cfg(), Pr = FT.prices(), need = m => m * (1 + C.waste / 100) + 2 * C.slackEnd; let total = 0, cableM = 0;
    plan.cabs.forEach(cab => { if (!cab.existing) { const m = need(cab.len); cableM += m; total += m * (Pr.cable[cab.cat] || 0) + (Pr.node.sk || 0) + cab.nsplit * (Pr.splitter['1:' + plan.s1] || 0); }
      cab.fdbs.forEach(f => { const m = need(f.len); cableM += m; total += m * (Pr.cable[D.distCat(f.nsplit)] || 0) + (Pr.node.bk || 0) + f.nsplit * (Pr.splitter['1:' + plan.s2] || 0); }); });
    let ductM = 0; plan.pipes.forEach(r => { const d = FT.trench.duct(r.layer, r.load, r.od), m = r.len * (1 + C.waste / 100) * (d.qty || 1); ductM += r.len; total += m * (Pr.pipe[d.cat] || 0); });
    total += plan.hhs.length * (Pr.node.hh || 0) + cableM * ((Pr.labour || {}).cable_m || 0) + ductM * ((Pr.labour || {}).pipe_m || 0);
    return { total, cableM, ductM };
  };
  P.compare = async function (blds, olt, opt, spareFor) {
    const out = [];
    for (const [s1, s2] of FT.design.SPLITS) {
      const plan = await FT.design.planAsync(blds, olt, Object.assign({}, opt, { s1, s2, spare: spareFor ? spareFor(s1) : [] }));
      const c = P.planCost(plan);
      out.push({ s1, s2, fdb: plan.fdbCount, splitters: plan.splitters + plan.boxSplitters, fdc: plan.fdcCount, pon: plan.ports, cableM: c.cableM, ductM: c.ductM, worst: plan.worstLoss, ok: plan.ok, cost: c.total, flats: plan.flats });
    }
    return out;
  };
  P.compareHtml = function (rows) {
    const priced = FT.hasPrices(), best = k => Math.min(...rows.map(r => r[k]));
    const line = (label, k, f, mark) => '<tr><td>' + label + '</td>' + rows.map(r => '<td style="text-align:center' + (mark && r[k] === best(k) ? ';color:#2bd18b;font-weight:700' : '') + '">' + FT.lt(f(r[k])) + '</td>').join('') + '</tr>';
    return '<table class="t" id="dsCmpTable"><tr><th></th>' + rows.map(r => '<th style="text-align:center">' + FT.lt('1:' + r.s1 + ' + 1:' + r.s2) + '</th>').join('') + '</tr>' +
      line(tx('علب FDB', 'FDB boxes'), 'fdb', String, true) + line(tx('خزائن FDC', 'FDC cabinets'), 'fdc', String, true) + line(tx('مقسّمات بالمجموع', 'Splitters in total'), 'splitters', String, true) + line(tx('منافذ PON', 'PON ports'), 'pon', String, true) +
      line(tx('كابلات مطلوبة', 'Cable to buy'), 'cableM', v => FT.fmtLenShort(v), true) + line(tx('مسارات أنابيب', 'Duct runs'), 'ductM', v => FT.fmtLenShort(v), true) + line(tx('أسوأ فقد', 'Worst loss'), 'worst', v => v.toFixed(2) + ' dB', true) +
      (priced ? line(tx('كلفة تقديرية', 'Estimated cost'), 'cost', v => FT.money(v), true) : '') + '</table>' + (priced ? '' : '<p class="d">' + tx('أدخل الأسعار ليظهر سطر الكلفة.', 'Enter prices to see the cost row.') + '</p>');
  };
})(typeof window !== 'undefined' ? window : globalThis);
