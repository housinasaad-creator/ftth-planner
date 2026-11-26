/* Syrian Telecom (ST) FTTH micro-trenching specification: optical budget along the real cable graph, compliance check (SOC),
   official codes (F01-PS01-P01-D01-FDB01). Every number comes from FT.LIMITS / FT.BASE_LOSS / FT.SPLITTER_LOSS (model.js). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const SP = FT.spec = {};
  const DROP_M = 100; // assumed drop length to the ONT (the drop itself is ST's work)
  const ar = () => FT.lang === 'ar';
  const ratioN = r => r ? (parseInt(String(r).split(':')[1], 10) || 1) : 1;
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  // ---------------- cable graph ----------------
  SP.graph = function () {
    const adj = {}, S = FT.state;
    Object.values(S.cables).forEach(c => FT.cableSpans(c).forEach(s => { if (s.from === s.to) return; (adj[s.from] = adj[s.from] || []).push([s.to, s.len, c.id]); (adj[s.to] = adj[s.to] || []).push([s.from, s.len, c.id]); }));
    return adj;
  };
  SP.tree = function (src, adj) { // Dijkstra with a binary heap -> { dist, prev: id -> [previousNode, cableId] }
    const dist = { [src]: 0 }, prev = {}, done = new Set(), h = [[0, src]];
    const push = x => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
    const pop = () => { const t = h[0], l = h.pop(); if (h.length) { h[0] = l; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= h.length) break; if (c + 1 < h.length && h[c + 1][0] < h[c][0]) c++; if (h[i][0] <= h[c][0]) break; [h[i], h[c]] = [h[c], h[i]]; i = c; } } return t; };
    while (h.length) { const [d, u] = pop(); if (done.has(u)) continue; done.add(u); (adj[u] || []).forEach(([v, w, cid]) => { const nd = d + w; if (dist[v] == null || nd < dist[v]) { dist[v] = nd; prev[v] = [u, cid]; push([nd, v]); } }); }
    return { dist, prev };
  };
  SP.pathTo = (t, id) => { const p = []; let c = id; while (c != null) { p.unshift(c); const pv = t.prev[c]; c = pv ? pv[0] : null; } return p; };

  // ---------------- optical budget ----------------
  SP.metrics = function (path, lenM) {
    const S = FT.state, B = FT.BASE_LOSS; let split = 1, stages = 0, loss = 0, boxes = 0, holes = 0; const ratios = [];
    path.forEach(id => { const n = S.nodes[id]; if (!n) return; if (FT.BOX_TYPES.includes(n.type)) boxes++; if (n.type === 'mh' || n.type === 'hh') holes++; if (n.ratio) { split *= ratioN(n.ratio); stages++; loss += FT.SPLITTER_LOSS[n.ratio] || 0; ratios.push(n.ratio); } });
    const km = (lenM + DROP_M) / 1000, conn = 2 + 2 * boxes, spl = 2 * boxes + holes;
    loss += km * B.fiber1490 + conn * B.connector + spl * B.splice;
    return { split, stages, loss, km, ratios, conn, spl, rx: B.txDbm - loss };
  };
  // one row per FDB: the path from the nearest OLT, split ratio, stages and total loss
  SP.analyze = function () {
    const S = FT.state, olts = Object.values(S.nodes).filter(n => n.type === 'olt'), adj = SP.graph(), trees = olts.map(o => ({ olt: o, t: SP.tree(o.id, adj) })), rows = [];
    Object.values(S.nodes).filter(n => n.type === 'bk').forEach(n => {
      let best = null; trees.forEach(({ olt, t }) => { if (t.dist[n.id] != null && (!best || t.dist[n.id] < best.len)) best = { olt, len: t.dist[n.id], t }; });
      if (!best) { rows.push({ node: n, fed: false }); return; }
      const path = SP.pathTo(best.t, n.id); rows.push(Object.assign({ node: n, fed: true, olt: best.olt, path, len: best.len }, SP.metrics(path, best.len)));
    });
    return rows;
  };

  // ---------------- official codes ----------------
  // FDC -> F{feeder}-PS{cabinet splitter}; FDB -> F01-PS01-P01-D01-FDB01 (feeder - primary splitter - port - distribution cable - box)
  SP.codeFor = (f, ps, p, d, b) => 'F' + pad(f) + '-PS' + pad(ps) + '-P' + pad(p) + '-D' + pad(d) + '-FDB' + pad(b);
  SP.autoCodes = function (onlyEmpty) {
    const S = FT.state, rows = SP.analyze(), fdcs = Object.values(S.nodes).filter(n => n.type === 'sk'); let maxF = 0;
    Object.values(S.nodes).forEach(n => { const m = /^F(\d+)-PS/.exec(n.code || ''); if (m) maxF = Math.max(maxF, +m[1]); });
    const fnum = {}; fdcs.forEach(f => { if (onlyEmpty && f.code) { fnum[f.id] = +((/^F(\d+)/.exec(f.code) || [])[1]) || 0; } if (!fnum[f.id]) fnum[f.id] = ++maxF; if (!onlyEmpty || !f.code) f.code = 'F' + pad(fnum[f.id]) + '-PS' + pad(1); });
    const per = {}; let n = 0;
    rows.filter(r => r.fed).sort((a, b) => a.node.name.localeCompare(b.node.name, undefined, { numeric: true })).forEach(r => {
      const fdc = r.path.map(id => S.nodes[id]).filter(x => x && x.type === 'sk').pop(); if (!fdc) return; if (onlyEmpty && r.node.code) return;
      const k = (per[fdc.id] = (per[fdc.id] || 0) + 1) - 1, s1 = Math.max(1, ratioN(fdc.ratio) || 4), ps = Math.floor(k / s1) + 1, p = k % s1 + 1;
      r.node.code = SP.codeFor(fnum[fdc.id], ps, p, 1, 1); n++;
    });
    return n;
  };

  // ---------------- compliance (SOC) ----------------
  // status: ok | bad | warn | na
  SP.soc = function () {
    const S = FT.state, L = FT.LIMITS, rows = SP.analyze(), items = [], fed = rows.filter(r => r.fed);
    const add = (id, ar_, en_, status, ar_d, en_d, refs) => items.push({ id, ar: ar_, en: en_, status, detail: ar() ? ar_d : en_d, refs: refs || [] });
    const nodes = Object.values(S.nodes), pipes = Object.values(S.pipes), cables = Object.values(S.cables);
    // 1 split
    if (!fed.length) add('split', 'نسبة التقسيم الكلية ≤ 1:16 على مرحلتين', 'Total split ≤ 1:16 in two stages', 'na', 'لا توجد علب FDB موصولة بـ OLT بعد.', 'No FDB connected to an OLT yet.');
    else { const bad = fed.filter(r => r.split > L.maxSplit || r.stages > L.maxStages), none = fed.filter(r => r.stages === 0), legacy = nodes.filter(n => n.ratio === '1:32'), worst = Math.max(...fed.map(r => r.split));
      add('split', 'نسبة التقسيم الكلية ≤ 1:16 على مرحلتين', 'Total split ≤ 1:16 in two stages', bad.length || legacy.length ? 'bad' : none.length ? 'warn' : 'ok',
        bad.length ? bad.length + ' علبة FDB تتجاوز (الأسوأ 1:' + worst + ') — ' + (legacy.length ? legacy.length + ' مقسّم 1:32 غير مسموح' : '') : none.length ? none.length + ' علبة بلا أي مقسّم على مسارها (حدّد نسبة المقسّم)' : 'الأسوأ 1:' + worst + ' من ' + fed.length + ' علبة',
        bad.length ? bad.length + ' FDB over the limit (worst 1:' + worst + ')' + (legacy.length ? ' — ' + legacy.length + ' splitter(s) 1:32 not allowed' : '') : none.length ? none.length + ' FDB with no splitter on its path (set the splitter ratio)' : 'worst 1:' + worst + ' over ' + fed.length + ' FDB', bad.map(r => r.node.id)); }
    // 2 loss
    if (!fed.length) add('loss', 'الفقد الكلي عند الـ ONT ≤ 28 dB', 'Total loss at the ONT ≤ 28 dB', 'na', '—', '—');
    else { const bad = fed.filter(r => r.loss > L.maxLoss), mx = Math.max(...fed.map(r => r.loss)); add('loss', 'الفقد الكلي عند الـ ONT ≤ 28 dB', 'Total loss at the ONT ≤ 28 dB', bad.length ? 'bad' : mx > L.maxLoss - 2 ? 'warn' : 'ok', 'الأسوأ ' + mx.toFixed(1) + ' dB' + (bad.length ? ' — ' + bad.length + ' علبة تتجاوز' : ''), 'worst ' + mx.toFixed(1) + ' dB' + (bad.length ? ' — ' + bad.length + ' FDB over' : ''), bad.map(r => r.node.id)); }
    // 3 FDB per building
    const blds = FT.map.housesData().filter(h => h.o.num || h.o.fdb).map(h => [h.id, h.o, h.ll]), fdbs = nodes.filter(n => n.type === 'bk');
    if (!blds.length) add('fdb_b', 'علبة FDB عند مدخل كل مبنى', 'One FDB at the entrance of every building', fdbs.length ? 'warn' : 'na', fdbs.length ? fdbs.length + ' علبة FDB لكن لا مبانٍ مرقّمة لفحص التغطية — رقّم المباني أو استعمل «إنشاء بنية»' : 'لا مبانٍ مرقّمة ولا علب بعد', fdbs.length ? fdbs.length + ' FDB but no numbered buildings to check coverage — number the buildings or use “Auto design”' : 'no numbered buildings and no FDB yet');
    else { const miss = blds.filter(([id, o, ll]) => !(o.fdb && S.nodes[o.fdb]) && !fdbs.some(f => FT.dist(f.ll, ll) <= 40)); add('fdb_b', 'علبة FDB عند مدخل كل مبنى', 'One FDB at the entrance of every building', miss.length ? 'bad' : 'ok', miss.length ? miss.length + ' مبنى مرقّم من ' + blds.length + ' بلا FDB قريبة (≤ 40 م)' : 'كل المباني المعروفة (' + blds.length + ') لها FDB', miss.length + ' of ' + blds.length + ' known buildings have no FDB within 40 m', miss.map(x => x[0])); }
    // 4 fed
    const unfed = rows.filter(r => !r.fed);
    add('fed', 'كل FDB موصولة بكبل حتى الـ OLT', 'Every FDB is connected by cable to the OLT', !fdbs.length ? 'na' : unfed.length ? 'bad' : 'ok', unfed.length ? unfed.length + ' علبة غير موصولة بأي OLT' : fdbs.length + ' علبة موصولة', unfed.length ? unfed.length + ' FDB not connected to any OLT' : fdbs.length + ' FDB connected', unfed.map(r => r.node.id));
    // 5 ratios
    const badR = nodes.filter(n => n.ratio && !FT.SPLITTER_LOSS[n.ratio] || n.ratio === '1:32'), noR = nodes.filter(n => (n.type === 'bk' || n.type === 'sk') && !n.ratio);
    add('ratios', 'نسب المقسّمات المسموحة: 1:2 · 1:4 · 1:8 · 1:16', 'Allowed splitter ratios: 1:2, 1:4, 1:8, 1:16', badR.length ? 'bad' : noR.length ? 'warn' : 'ok', badR.length ? badR.length + ' علبة بنسبة غير مسموحة' : noR.length ? noR.length + ' علبة FDC/FDB بلا نسبة مقسّم' : 'كل النسب مطابقة', badR.length ? badR.length + ' box(es) with a ratio that is not allowed' : noR.length ? noR.length + ' FDC/FDB without a splitter ratio' : 'all ratios comply', badR.concat(noR).map(n => n.id));
    // 6 MH/HH spacing
    const longP = pipes.filter(p => p.ptype !== 'aerial' && FT.pathLen(p.pts) > L.maxSpan);
    cables.forEach(c => { if (c.shared && c.segs && c.segs.some(s => FT.pathLen(s) > L.maxSpan + 0.5)) longP.push(c); });
    add('span', 'المسافة بين المناهل/الغرف ≤ 250 م', 'Distance between MH/HH ≤ 250 m', !pipes.length ? 'na' : longP.length ? 'bad' : 'ok', longP.length ? longP.length + ' أنبوب أطول من 250 م (أضف HH وسيطة)' : 'كل الأنابيب ≤ 250 م', longP.length ? longP.length + ' pipe(s) longer than 250 m (add an intermediate HH)' : 'all pipes ≤ 250 m', longP.map(p => p.id));
    // 7 trench
    const buried = pipes.filter(p => p.ptype !== 'aerial'), badT = buried.filter(p => (p.depth || 30) > L.trenchDepth || (p.width || 6) > L.trenchWidth || (p.cover == null ? 10 : p.cover) < L.minCover);
    add('trench', 'الخندق الدقيق: عمق ≤ 30 سم، عرض ≤ 6 سم، غطاء ≥ 10 سم', 'Micro-trench: depth ≤ 30 cm, width ≤ 6 cm, cover ≥ 10 cm', !buried.length ? 'na' : badT.length ? 'bad' : 'ok', badT.length ? badT.length + ' أنبوب بأبعاد خندق مخالفة' : buried.length + ' أنبوب ضمن الحدود', badT.length ? badT.length + ' pipe(s) with trench dimensions out of limits' : buried.length + ' pipe(s) within limits', badT.map(p => p.id));
    // 8 fill / ways
    const use = {}; cables.forEach(c => FT.cableSpans(c).forEach(s => { if (s.pipe) (use[s.pipe] = use[s.pipe] || []).push(c); }));
    const badF = []; let shared = 0; pipes.forEach(p => { const cat = FT.PIPE_CAT.find(x => x.id === p.cat), cs = use[p.id] || []; if (!cat) return;
      if (p.load) { // a shared run made by the auto design: p.load cables in p.qty ducts
        shared++; const q = p.qty || 1;
        if (cat.type === 'microduct') { if (p.load > q * ((cat.ways || 12) - 1)) badF.push(p.id); }
        else if (cat.idmm) { if (p.load > q * Math.max(1, Math.floor(Math.pow(L.fillMax / 100 * cat.idmm / (p.od || 11), 2)))) badF.push(p.id); }
        return; }
      if (!cs.length) return;
      const od = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).od || 10;
      if (cat.type === 'microduct') { if (cs.length > (cat.ways || 12) - 1 || cs.some(c => od(c) / cat.idmm > L.fillMax / 100)) badF.push(p.id); }
      else if (cat.idmm) { const eq = Math.sqrt(cs.reduce((a, c) => a + od(c) ** 2, 0)); if (eq / cat.idmm > L.fillMax / 100) badF.push(p.id); } });
    add('fill', 'امتلاء الأنبوب ≤ 70% (قطر الكبل ÷ القطر الداخلي) ومسار احتياطي واحد', 'Duct fill ≤ 70% (cable OD ÷ duct ID) and one spare way', !Object.keys(use).length && !shared ? 'na' : badF.length ? 'bad' : 'ok', badF.length ? badF.length + ' أنبوب مخالف (كبل أكبر من اللازم أو مسارات ممتلئة)' : 'كل الأنابيب ضمن 70%', badF.length ? badF.length + ' pipe(s) over the fill limit or without a spare way' : 'all ducts within 70%', badF);
    // 9 poles / aerial
    const poles = nodes.filter(n => n.type === 'pole'), badPl = poles.filter(n => n.place !== 'wall'), aerial = pipes.filter(p => p.ptype === 'aerial');
    add('aerial', 'التعليق الهوائي على الجدران فقط وبموافقة ST (لا أعمدة)', 'Aerial only on walls with ST approval (no poles)', badPl.length ? 'bad' : (poles.length || aerial.length) ? 'warn' : 'ok', badPl.length ? badPl.length + ' نقطة تعليق ليست على جدار' : (poles.length || aerial.length) ? 'يوجد تعليق هوائي — يلزم موافقة ST خطية' : 'لا تعليق هوائي', badPl.length ? badPl.length + ' anchor(s) not on a wall' : (poles.length || aerial.length) ? 'aerial route present — written ST approval needed' : 'no aerial route', badPl.map(n => n.id));
    // 10 fibre standards
    const badS = cables.filter(c => { const g = (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group; return (g === 'Drop' ? c.std !== 'G.657.A2' : c.std !== 'G.652.D'); });
    add('fibre', 'الألياف: G.652.D للمغذي والتوزيع، G.657.A2 للمشترك', 'Fibre: G.652.D feeder/distribution, G.657.A2 drop', !cables.length ? 'na' : badS.length ? 'bad' : 'ok', badS.length ? badS.length + ' كبل بمعيار ألياف مخالف' : 'كل الكبلات مطابقة', badS.length ? badS.length + ' cable(s) with the wrong fibre standard' : 'all cables comply', badS.map(c => c.id));
    // 11 codes
    const noCode = fdbs.filter(n => !n.code);
    add('codes', 'ترميز العلب الرسمي F01-PS01-P01-D01-FDB01', 'Official box code F01-PS01-P01-D01-FDB01', !fdbs.length ? 'na' : noCode.length ? 'warn' : 'ok', noCode.length ? noCode.length + ' علبة بلا ترميز (زر «ترميز تلقائي»)' : 'كل العلب مرمّزة', noCode.length ? noCode.length + ' FDB without a code (use “Auto codes”)' : 'all FDB coded', noCode.map(n => n.id));
    // 12 scope
    const drops = cables.filter(c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group === 'Drop');
    add('scope', 'نطاق المقاول ينتهي عند FDB (المشترك والتمديد الداخلي من عمل ST)', 'Contractor scope ends at the FDB (drop and in-building are ST work)', drops.length ? 'warn' : 'ok', drops.length ? drops.length + ' كبل مشترك مرسوم — للتخطيط فقط وخارج نطاق المقاول' : 'لا كبلات مشترك', drops.length ? drops.length + ' drop cable(s) drawn — planning only, outside the contractor scope' : 'no drop cables', []);
    return { items, rows, ok: items.filter(i => i.status === 'ok').length, bad: items.filter(i => i.status === 'bad').length, warn: items.filter(i => i.status === 'warn').length };
  };
  const ICON = { ok: '✔', bad: '✘', warn: '⚠', na: '–' }, COL = { ok: 'var(--ok)', bad: 'var(--bad)', warn: 'var(--warn)', na: 'var(--mu)' };
  SP.table = function (soc) {
    return '<table class="t soc">' + soc.items.map(i => '<tr><td style="color:' + COL[i.status] + ';font-weight:800;width:22px">' + ICON[i.status] + '</td><td><b>' + esc(ar() ? i.ar : i.en) + '</b><div class="d" style="margin:2px 0 0">' + esc(i.detail) + '</div></td>' + '<td style="width:74px;color:' + COL[i.status] + '">' + esc({ ok: FT.t('soc_ok'), bad: FT.t('soc_bad'), warn: FT.t('soc_warn'), na: FT.t('soc_na') }[i.status]) + '</td></tr>').join('') + '</table>';
  };
  SP.summaryHtml = function () {
    const soc = SP.soc(); return '<h3 style="margin-top:14px">' + FT.t('soc_title') + '</h3><div class="kv"><span style="color:var(--ok)">✔ ' + soc.ok + '</span><span style="color:var(--warn)">⚠ ' + soc.warn + '</span><span style="color:var(--bad)">✘ ' + soc.bad + '</span></div>' + SP.table(soc) + '<button class="btn full" id="socOpen" style="margin-top:8px">' + FT.t('soc_open') + '</button>';
  };
  // subscribers (ONT): path from the nearest OLT to the box they hang on
  SP.subRows = function () {
    const S = FT.state, olts = Object.values(S.nodes).filter(n => n.type === 'olt'), adj = SP.graph(), trees = olts.map(o => ({ olt: o, t: SP.tree(o.id, adj) }));
    return Object.values(S.subs || {}).map(sub => {
      let best = null; trees.forEach(({ olt, t }) => { if (t.dist[sub.node] != null && (!best || t.dist[sub.node] < best.len)) best = { olt, len: t.dist[sub.node], t }; });
      if (!best) return { sub, fed: false };
      const path = SP.pathTo(best.t, sub.node); return Object.assign({ sub, fed: true, olt: best.olt, path, len: best.len }, SP.metrics(path, best.len));
    });
  };
  SP.budgetHtml = function () {
    const fdb = SP.analyze().filter(r => r.fed).sort((a, b) => b.loss - a.loss).slice(0, 30), subs = SP.subRows().slice(0, 30);
    if (!fdb.length && !subs.length) return '<p class="d">OLT + FDB/ONT + ' + (ar() ? 'كبلات' : 'cables') + ' → ' + FT.t('an_budget') + '</p>';
    const L = FT.LIMITS.maxLoss, B = FT.BASE_LOSS, rxc = rx => rx > B.rxSens + 3 ? 'var(--ok)' : rx > B.rxSens ? 'var(--warn)' : 'var(--bad)';
    const line = (nm, r) => '<tr><td>' + esc(nm) + '</td><td>' + r.km.toFixed(2) + '</td><td>1:' + r.split + '</td><td style="color:' + (r.loss > L ? 'var(--bad)' : r.loss > L - 2 ? 'var(--warn)' : 'var(--ok)') + '">' + r.loss.toFixed(1) + '</td><td style="color:' + rxc(r.rx) + '">' + r.rx.toFixed(1) + ' dBm</td></tr>';
    let h = '<table class="t"><tr><th></th><th>km</th><th>1:N</th><th>dB</th><th>Rx</th></tr>';
    fdb.forEach(r => { h += line(r.node.code || r.node.name, r); });
    subs.forEach(r => { h += r.fed ? line(r.sub.name, r) : '<tr><td>' + esc(r.sub.name) + '</td><td colspan="4" style="color:var(--warn)">' + (ar() ? 'غير موصول بكبل من OLT' : 'no cable path from the OLT') + '</td></tr>'; });
    return h + '</table><p class="d">' + (ar() ? 'الحد الأقصى ' + L + ' dB · 1:16 كحد أقصى · الأسوأ أولًا' : 'limit ' + L + ' dB · 1:16 max · worst first') + '</p>';
  };

  // ---------------- dialog ----------------
  SP.open = function () {
    const soc = SP.soc(), D = () => FT.deliver, b = (id, l, cls) => '<button class="btn ' + (cls || '') + '" id="' + id + '">' + l + '</button>';
    const body = '<div class="kv"><span style="color:var(--ok)">✔ ' + soc.ok + '</span><span style="color:var(--warn)">⚠ ' + soc.warn + '</span><span style="color:var(--bad)">✘ ' + soc.bad + '</span></div>' + SP.table(soc) +
      '<h4 style="color:var(--hot2);margin:14px 0 6px">' + FT.t('soc_deliver') + '</h4><div class="seg">' + b('dvCodes', FT.t('dv_codes')) + b('dvPack', FT.t('dv_pack'), 'pri') + b('dvGpkg', 'GeoPackage (QGIS)') + b('dvKmz', 'KMZ (KML 2.2)') + b('dvLld', FT.t('dv_lld')) + b('dvBom', FT.t('dv_bom')) + b('dvSec', FT.t('dv_sec')) + b('dvOtdr', FT.t('dv_otdr')) + b('dvDxf', 'DXF') + b('dvGeo', 'GeoJSON') + '</div><p class="d" style="margin-top:8px">' + FT.t('soc_note') + '</p>';
    FT.UI.modal(FT.t('soc_title'), body, [{ label: FT.t('close') }], root => {
      const on = (id, fn) => { const e = root.querySelector('#' + id); if (e) e.onclick = fn; };
      on('dvCodes', () => { FT.commit(); const n = SP.autoCodes(true); FT.changed('codes'); FT.UI.toast((ar() ? 'رُمّزت ' : 'Coded ') + n + ' FDB'); SP.open(); });
      on('dvPack', () => D().pack()); on('dvGpkg', () => D().gpkg()); on('dvKmz', () => D().kmz()); on('dvLld', () => D().lldCsv()); on('dvBom', () => FT.exp.reportCsv(null)); on('dvSec', () => D().sections()); on('dvOtdr', () => D().otdr());
      on('dvDxf', () => { FT.UI.closeModal(); FT.exp.area = { mode: null, ring: null }; FT.exp.openDxf(); }); on('dvGeo', () => FT.exp.geojson());
    });
  };
})(window);
