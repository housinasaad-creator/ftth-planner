/* "Show only this", another project as a read-only layer, imported lines turned into ducts / cables, paste in place,
   and the command line. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const X = FT.extras = {};
  const U = () => FT.UI, T = () => FT.T, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const readOnly = () => FT.store && FT.store.mode === 'view';

  // ---------------- show only this ----------------
  const allIds = () => { const S = FT.state; return [].concat(Object.keys(S.nodes), Object.keys(S.pipes), Object.keys(S.cables)); };
  X.only = function (ids) {
    const keep = new Set(ids); T().hidden.clear(); allIds().forEach(id => { if (!keep.has(id)) T().hidden.add(id); });
    U().applyHidden(); U().refreshTree(); U().toast(tx('معروض ' + keep.size + ' عنصر بس. «اعرض الكل» بيرجّع الباقي.', 'Showing ' + keep.size + ' element(s) only.'));
  };
  X.showAll = function () { T().hidden.clear(); U().applyHidden(); U().refreshTree(); if (FT.imp) FT.imp.render(); };
  X.menuItems = function (h) { // extra rows for the right-click menu
    const out = [];
    if (T().multi) { const m = T().multi; out.push([tx('اعرض المحدّد فقط', 'Show only the selection'), () => X.only([].concat([...m.nodes], [...m.pipes], [...m.cables]))]); }
    else if (h && (h.kind === 'node' || h.kind === 'pipe' || h.kind === 'cable')) out.push([tx('اعرض هذا فقط', 'Show only this'), () => X.only([h.id])]);
    if (T().hidden.size) out.push([tx('اعرض الكل', 'Show everything'), X.showAll]);
    return out;
  };

  // ---------------- another project as a read-only layer ----------------
  X.asFeatures = function (st) {
    const f = [], nodes = st.nodes || {};
    Object.values(st.pipes || {}).forEach(p => { if (p.pts && p.pts.length > 1) f.push({ type: 'Feature', properties: { name: p.name, kind: 'pipe' }, geometry: { type: 'LineString', coordinates: p.pts } }); });
    Object.values(st.cables || {}).forEach(c => { let pts = []; if (c.segs) pts = [].concat(...c.segs.map((s, i) => i ? s.slice(1) : s)); if (pts.length < 2) pts = c.pts && c.pts.length > 1 ? c.pts : (c.nodes || []).map(id => nodes[id] && nodes[id].ll).filter(Boolean); if (pts.length > 1) f.push({ type: 'Feature', properties: { name: c.name, kind: 'cable' }, geometry: { type: 'LineString', coordinates: pts } }); });
    Object.values(nodes).forEach(n => f.push({ type: 'Feature', properties: { name: n.name, kind: n.type }, geometry: { type: 'Point', coordinates: n.ll } }));
    return f;
  };
  X.overlay = async function (entry) { // entry: a row of the project list
    if (FT.store.cur && FT.store.cur.id === entry.id) { U().toast(tx('هاد هو المشروع المفتوح', 'That project is the open one')); return; }
    let st = null;
    try {
      const reg = JSON.parse(localStorage.getItem('ft2_cloud') || '[]'), e = reg.find(x => x.id === entry.id);
      if (e && e.key && e.key !== 'local') { const r = await FT.store.rpc('ftth_get_project', { p_id: e.id, p_key: e.key }); if (r) st = r.state; }
    } catch (err) { console.warn(err); }
    if (!st) { try { st = JSON.parse(localStorage.getItem('ft2_p_' + entry.id)); } catch (err) { st = null; } }
    const feats = st ? X.asFeatures(st) : [];
    if (!feats.length) { U().toast(tx('ما قدرت جيب هالمشروع، أو فاضي', 'Could not read that project, or it is empty')); return; }
    if (readOnly()) { U().toast(FT.t('ro_msg')); return; }
    U().closeModal(); FT.imp.add(tx('طبقة: ', 'Layer: ') + (entry.name || entry.id), feats);
  };

  // ---------------- imported lines -> ducts or cables ----------------
  X.convert = function (gid, o) { // o: {lines:'pipe'|'cable'|'', cat, points:nodeType|''}
    const S = FT.state, g = S.imports[gid]; if (!g) return null;
    FT.commit();
    const made = { nodes: 0, lines: 0 }, near = ll => Object.values(S.nodes).find(n => FT.dist(n.ll, ll) <= 3);
    const nodeAt = (ll, type, name) => { let n = near(ll); if (!n) { n = FT.addNode(type, ll.slice()); if (name) n.label = String(name).slice(0, 80); made.nodes++; } return n; };
    if (o.points) g.features.filter(f => f.geometry.type === 'Point').forEach(f => nodeAt(f.geometry.coordinates, o.points, f.properties && f.properties.name));
    if (o.lines) g.features.filter(f => f.geometry.type === 'LineString' && f.geometry.coordinates.length > 1).forEach(f => {
      const pts = f.geometry.coordinates.map(q => q.slice()), a = nodeAt(pts[0], 'hh'), b = nodeAt(pts[pts.length - 1], 'hh'); if (a.id === b.id) return;
      pts[0] = a.ll.slice(); pts[pts.length - 1] = b.ll.slice();
      let x; if (o.lines === 'pipe') { const cat = FT.PIPE_CAT.find(c => c.id === o.cat) || FT.PIPE_CAT[1]; x = FT.addPipe(pts, a.id, b.id, cat.type, cat.id); } else x = FT.addCable(pts, a.id, b.id, o.cat, 'free', [a.id, b.id], [pts]);
      if (f.properties && (f.properties.name || f.properties.description)) x.note = String(f.properties.description || f.properties.name).slice(0, 200);
      made.lines++;
    });
    T().hidden.add(gid); FT.imp.render(); FT.changed('add'); return made;
  };
  X.openConvert = function (gid) {
    const g = FT.state.imports[gid]; if (!g) return; if (readOnly()) { U().toast(FT.t('ro_msg')); return; }
    const nl = g.features.filter(f => f.geometry.type === 'LineString').length, np = g.features.filter(f => f.geometry.type === 'Point').length, o = { lines: nl ? 'pipe' : '', cat: 'h40', points: '' };
    const body = () => '<div class="kv"><span>' + esc(g.name) + '</span><b>' + nl + ' ' + tx('خط', 'lines') + ' · ' + np + ' ' + tx('نقطة', 'points') + '</b></div><div class="f"><label>' + tx('الخطوط تصير', 'Lines become') + '</label><div class="seg" id="cvL">' + [['pipe', tx('أنابيب', 'Ducts')], ['cable', tx('كبلات', 'Cables')], ['', tx('اتركها', 'Leave')]].map(([k, l]) => '<button type="button" data-k="' + k + '" class="' + (o.lines === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>' +
      (o.lines ? '<div class="f"><label>' + tx('النوع', 'Type') + '</label><select id="cvCat">' + (o.lines === 'pipe' ? FT.PIPE_CAT : FT.CABLE_CAT).map(c => '<option value="' + c.id + '"' + (c.id === o.cat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></div>' : '') +
      '<div class="f"><label>' + tx('النقاط تصير', 'Points become') + '</label><select id="cvP"><option value="">' + tx('اتركها', 'Leave') + '</option>' + Object.keys(FT.NODE_TYPES).map(k => '<option value="' + k + '"' + (o.points === k ? ' selected' : '') + '>' + esc(FT.nodeTypeName(k)) + '</option>').join('') + '</select></div><p class="d">' + tx('أطراف الخطوط بتنربط بعقدة قريبة (3 م)، وإلا بتنعمل غرفة تفتيش. Ctrl+Z بيرجّع الكل دفعة وحدة.', 'Line ends join a node within 3 m, otherwise a handhole is made. One undo.') + '</p>';
    U().modal(tx('تحويل المستورد لعناصر شبكة', 'Turn the import into network elements'), body(), [{ label: FT.t('cancel') }, { label: tx('حوّل', 'Convert'), cls: 'pri', fn: () => { if (!o.lines && !o.points) return; const m = X.convert(gid, o); if (m) U().toast(tx('انعمل ' + m.lines + ' خط و ' + m.nodes + ' عقدة', m.lines + ' lines, ' + m.nodes + ' nodes made')); } }], function wire(root) {
      const again = () => { root.innerHTML = body(); wire(root); };
      root.querySelectorAll('#cvL button').forEach(b => b.onclick = () => { o.lines = b.dataset.k; o.cat = o.lines === 'cable' ? 'ds24' : 'h40'; again(); });
      const c = root.querySelector('#cvCat'); if (c) c.onchange = () => o.cat = c.value; root.querySelector('#cvP').onchange = e => o.points = e.target.value;
    });
  };

  // ---------------- command line ----------------
  const find = q => { const S = FT.state, s = String(q || '').trim().toLowerCase(); if (!s) return null; const list = Object.values(S.nodes); return list.find(n => (n.name || '').toLowerCase() === s || (n.code || '').toLowerCase() === s) || list.find(n => (n.name + ' ' + (n.code || '') + ' ' + (n.label || '')).toLowerCase().includes(s)) || null; };
  const selNode = () => T().sel && T().sel.kind === 'node' ? FT.state.nodes[T().sel.id] : null;
  const goNode = n => { FT.map.flyTo(n.ll, 18.8); T().select('node', n.id); };
  const num = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const target = args => args.length ? find(args.join(' ')) : selNode();
  const need = n => { if (!n) U().toast(tx('ما لقيت العقدة. اكتب اسمها أو حدّدها أول.', 'No such node. Name it or select it first.')); return n; };
  const edit = fn => { if (readOnly()) { U().toast(FT.t('ro_msg')); return false; } FT.commit(); fn(); FT.changed('prop'); return true; };
  // name, arguments, what it does (ar, en), action
  X.COMMANDS = [
    ['help', '', 'قائمة الأوامر', 'list of commands', () => X.openCommands()],
    ['goto', '<lat> <lon>', 'روح لإحداثيات', 'go to coordinates', a => { const la = num(a[0]), lo = num(a[1]); if (isNaN(la) || isNaN(lo)) U().toast('goto <lat> <lon>'); else FT.map.flyTo([lo, la], 17); }],
    ['find', '<name>', 'دوّر على عقدة وروح لعندها', 'find a node', a => { const n = need(find(a.join(' '))); if (n) goNode(n); }],
    ['add', '<olt|sk|dk|bk|mh|hh|pole> [lat lon]', 'ضيف عقدة (بنص الشاشة أو بإحداثيات)', 'add a node', a => { const type = (a[0] || '').toLowerCase(); if (!FT.NODE_TYPES[type]) { U().toast('add <olt|sk|dk|bk|mh|hh|pole> [lat lon]'); return; } const c = FT.map.map.getCenter(), la = num(a[1]), lo = num(a[2]), ll = isNaN(la) || isNaN(lo) ? [c.lng, c.lat] : [lo, la]; if (!FT.map.insideGov(ll)) { U().toast(FT.t('toast_outside')); return; } let n; if (edit(() => { n = FT.addNode(type, ll); })) { T().select('node', n.id); U().toast(n.name); } }],
    ['delete', '[name]', 'احذف المحدّد أو عقدة باسمها', 'delete the selection or a node', a => { if (a.length) { const n = need(find(a.join(' '))); if (!n) return; T().select('node', n.id); } if (T().sel || T().multi || T().bsel.size) T().deleteSelection(); else need(null); }],
    ['move', '<lat> <lon>', 'انقل العقدة المحدّدة', 'move the selected node', a => { const n = need(selNode()), la = num(a[0]), lo = num(a[1]); if (!n || isNaN(la) || isNaN(lo)) return; if (!FT.map.insideGov([lo, la])) { U().toast(FT.t('toast_outside')); return; } edit(() => T().moveNode(n.id, [lo, la])); T().select('node', n.id); }],
    ['rename', '<new name>', 'غيّر اسم العقدة المحدّدة', 'rename the selected node', a => { const n = need(selNode()); if (n && a.length) edit(() => { n.name = a.join(' '); }); }],
    ['ratio', '<1:2|1:4|1:8|1:16|none>', 'حدّد مقسّم العقدة المحدّدة', 'set the splitter of the selected node', a => { const n = need(selNode()); if (!n) return; const r = a[0] === 'none' ? '' : a[0]; if (r && !FT.RATIOS.includes(r)) { U().toast(FT.RATIOS.filter(Boolean).join(' ')); return; } edit(() => { n.ratio = r; }); U().renderPanel(); }],
    ['trace', '[name]', 'تتبّع الليف', 'fibre trace', a => { const n = need(target(a)); if (n) FT.fui.openTrace({ node: n.id }); }],
    ['splice', '[name]', 'علبة اللحام', 'splice closure', a => { const n = need(target(a)); if (n) U().openSplice(n.id); }],
    ['auto', '', 'وصل تلقائي للمقسّمات', 'auto-join splitters', () => FT.fui.autoAll()],
    ['sub', '', 'ربط مشترك', 'connect a subscriber', () => T().setTool('sub')],
    ['design', '', 'تصميم تلقائي (ارسم المنطقة)', 'auto design', () => T().setTool('design')],
    ['results', '', 'جداول التصميم', 'design tables', () => FT.designResults.open()],
    ['report', '', 'نزّل التقرير PDF', 'download the PDF report', () => FT.rep.download(null, null)],
    ['values', '', 'قيم حساب الإشارة', 'signal planning values', () => FT.fui.openAssumptions()],
    ['soc', '', 'فحص المواصفة والتسليم', 'specification check', () => FT.spec.open()],
    ['labels', '', 'لصاقات الألياف CSV', 'fibre labels CSV', () => FT.designResults.labelsCsv(null)],
    ['dxf', '', 'تصدير أوتوكاد', 'AutoCAD export', () => { FT.exp.area = { mode: null, ring: null }; FT.exp.openDxf(); }],
    ['kmz', '', 'تصدير KMZ', 'KMZ export', () => FT.exp.kmz()],
    ['gpkg', '', 'تصدير GeoPackage', 'GeoPackage export', () => FT.deliver.gpkg()],
    ['geojson', '', 'تصدير GeoJSON', 'GeoJSON export', () => FT.exp.geojson()],
    ['import', '', 'استيراد ملف', 'import a file', () => U().openIO()],
    ['only', '[name]', 'اعرض المحدّد أو عقدة لحالها', 'show only', a => { if (T().multi && !a.length) { const m = T().multi; X.only([].concat([...m.nodes], [...m.pipes], [...m.cables])); return; } const n = need(target(a)); if (n) X.only([n.id]); }],
    ['all', '', 'اعرض الكل', 'show everything', () => X.showAll()],
    ['fit', '', 'اعرض المشروع كامل', 'zoom to the whole project', () => U().fitAll()],
    ['theme', '<dark|light>', 'غامق أو فاتح', 'dark or light', a => U().setTheme(a[0] === 'light' ? 'light' : a[0] === 'dark' ? 'dark' : U().theme() === 'dark' ? 'light' : 'dark')],
    ['undo', '', 'تراجع', 'undo', () => FT.undo()],
    ['redo', '', 'إعادة', 'redo', () => FT.redo()],
  ];
  X.ALIAS = { 'مساعدة': 'help', 'روح': 'goto', 'دور': 'find', 'ضيف': 'add', 'احذف': 'delete', 'حذف': 'delete', 'انقل': 'move', 'تتبع': 'trace', 'تتبّع': 'trace', 'لحام': 'splice', 'تقرير': 'report', 'تصميم': 'design', 'تراجع': 'undo', 'الكل': 'all' };
  X.run = function (line) {
    const a = String(line || '').trim().split(/\s+/); if (!a[0]) return false;
    const name = X.ALIAS[a[0]] || a[0].toLowerCase(), c = X.COMMANDS.find(x => x[0] === name);
    if (!c) { U().toast(tx('أمر غير معروف. اكتب help', 'Unknown command. Type help')); return false; }
    c[4](a.slice(1)); return true;
  };
  X.openCommands = function () {
    U().modal(tx('سطر الأوامر', 'Command line'), '<p class="d">' + tx('اكتب الأمر بالشريط تحت واضغط Enter.', 'Type in the bar below and press Enter.') + '</p><table class="t">' + X.COMMANDS.map(c => '<tr><td style="direction:ltr;white-space:nowrap"><b>' + c[0] + '</b> <small>' + esc(c[1]) + '</small></td><td>' + (ar() ? c[2] : c[3]) + '</td></tr>').join('') + '</table>', [{ label: FT.t('close') }]);
  };
})(window);
