/* UI shell: header/toolbar, layer tree, right panel, dialogs, status bar. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const UI = FT.UI = {};
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const t = k => FT.t(k), T = () => FT.T;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  let mode = 'infra', rtab = 'tool', chipFilter = 'all', treeQuery = '', collapsed = new Set(), names = false;
  const O = UI.opt = { ratio: { sk: '', dk: '', bk: '' }, pipeCat: 'h40', cableCat: 'bb144', medium: 'free', floors: 2 };

  // ---------------- icons (own drawings) ----------------
  const SV = p => '<svg viewBox="0 0 24 24">' + p + '</svg>';
  const IC = {
    select: SV('<path d="M5 3l14 8-6 2-3 6z"/>'), area: SV('<path d="M4 8l6-4 9 3 1 8-8 5-7-6z" stroke-dasharray="3 2"/>'), measure: SV('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
    mh: SV('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'), pole: SV('<path d="M12 3v18M6 7h12M8 11h8"/>'),
    splice: SV('<circle cx="12" cy="12" r="8"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>'), pipe: SV('<path d="M3 9h18M3 15h18"/><path d="M6 9v6M18 9v6"/>'), cable: SV('<path d="M3 17c4-10 8 4 12-6s4-5 6-5"/>'),
    route: SV('<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7 17c6-1 2-9 10-10"/>'), reconnect: SV('<path d="M9 15l-3 3a3 3 0 004 4l3-3M15 9l3-3a3 3 0 00-4-4l-3 3M9 15l6-6"/>'),
    design: SV('<path d="M4 20L16 8M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 14l.6 1.6L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.4z"/>'), sub: SV('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M17 5v6M14 8h6"/>'), plan: SV('<path d="M4 18l4-12 8 4 4 8z"/><circle cx="12" cy="13" r="2"/>'),
    report: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>'), kmz: SV('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'), import: SV('<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>'),
    dxf: SV('<path d="M4 20V4h16"/><path d="M4 20L20 4M8 20h.01M20 8h.01"/>'), number: SV('<path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17"/>'), bdraw: SV('<path d="M4 20V10l8-6 8 6v10z"/><path d="M10 20v-6h4v6"/>'), house: SV('<path d="M3 11l9-7 9 7"/><path d="M5.5 10v10h13V10"/><path d="M12 12.5v5M9.5 15h5"/>'), floors: SV('<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>'),
    wdev: SV('<path d="M12 12v9M8 21h8"/><circle cx="12" cy="10" r="2"/><path d="M7 6a7 7 0 000 8M17 6a7 7 0 010 8M4.5 4a11 11 0 000 12M19.5 4a11 11 0 010 12"/>'), wlink: SV('<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M8 12h8" stroke-dasharray="2 2"/>'),
    soc: SV('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  };
  const nodeImg = k => '<img src="' + FT.map.iconDataURL(k, 40) + '">';
  function toolDefs() {
    const D = (id, ic, key) => ({ id, ic, key, l: t('t_' + id), d: t('t_' + id + '_d') });
    // top to bottom by how much they are used
    const basics = { g: 'g_select', items: [D('select', IC.select, 'V'), D('area', IC.area, 'L'), D('measure', IC.measure, 'U')] };
    const houses = { g: 'g_build', items: [D('house', IC.house, 'A'), D('number', IC.number, 'N'), D('floors', IC.floors, 'T'), D('bdraw', IC.bdraw, 'W')] };
    const design = { g: 'g_analysis', items: [D('design', IC.design, 'Y'), D('sub', IC.sub, 'S'), D('plan', IC.plan, 'C')] };
    const points = { g: 'g_point', items: [D('olt', nodeImg('olt'), 'O'), D('sk', nodeImg('sk'), '1'), D('dk', nodeImg('dk'), '2'), D('bk', nodeImg('bk'), '3'), D('mh', IC.mh, 'M'), D('hh', nodeImg('hh'), 'J'), D('pole', IC.pole, 'D'), D('splice', IC.splice, 'E')] };
    const lines = { g: 'g_line', items: [D('pipe', IC.pipe, 'B'), D('cable', IC.cable, 'K'), D('route', IC.route, 'G'), D('reconnect', IC.reconnect, 'R')] };
    const files = { g: 'g_output', items: [{ id: 'report', ic: IC.report, l: t('t_report'), d: t('t_report_d'), act: () => UI.openReport() }, { id: 'soc', ic: IC.soc, l: t('t_soc'), d: t('t_soc_d'), act: () => FT.spec.open() }, { id: 'kmz', ic: IC.kmz, l: t('t_kmz'), d: t('t_kmz_d'), act: () => FT.exp.kmz() }, { id: 'dxf', ic: IC.dxf, l: t('t_dxf'), d: t('t_dxf_d'), act: () => { FT.exp.area = { mode: null, ring: null }; FT.exp.openDxf(); } }, { id: 'import', ic: IC.import, l: t('t_import'), d: t('t_import_d'), act: () => UI.openIO() }] };
    if (mode === 'wireless') return [basics, { g: 'g_point', items: [D('wdev', IC.wdev, 'W'), D('wlink', IC.wlink, 'Q')] }, files];
    if (mode === 'pon') return [basics, design, files];
    return [basics, houses, design, points, lines, files];
  }
  UI.buildToolbar = function () {
    const tb = $('#toolbar'); tb.innerHTML = ''; tb.dir = FT.lang === 'ar' ? 'rtl' : 'ltr';
    toolDefs().forEach(g => {
      const el = document.createElement('div'); el.className = 'grp'; el.innerHTML = '<div class="row"></div><div class="gl">' + esc(t(g.g)) + '</div>';
      g.items.forEach(it => { const b = document.createElement('button'); b.className = 'tb'; b.dataset.id = it.id; b.dataset.tip = it.l; b.dataset.desc = it.d || ''; b.dataset.key = it.key || FT.keys.OUT[it.id] || ''; b.innerHTML = it.ic + '<span>' + esc(it.l) + '</span>' + (it.key ? '<kbd>' + it.key + '</kbd>' : ''); b.onclick = () => it.act ? it.act() : T().setTool(it.id); el.firstChild.appendChild(b); });
      tb.appendChild(el);
    });
    UI.toolChanged(); UI.fitToolbar();
    if (!UI._tbWatch && G.ResizeObserver) { UI._tbWatch = new ResizeObserver(() => { if (tb.clientHeight !== UI._tbH) UI.fitToolbar(); }); UI._tbWatch.observe(tb); }
  };
  // every tool stays visible without scrolling: the buttons shrink to the screen's height, and on very short screens a third column opens
  UI.fitToolbar = function () {
    const tb = $('#toolbar'); if (!tb || !tb.firstChild) return; UI._tbH = tb.clientHeight; if (!tb.clientHeight) return;
    const over = () => tb.scrollHeight > tb.clientHeight + 1;
    for (const cols of [2, 3, 4]) {
      tb.style.setProperty('--tbc', cols);
      for (let h = 36; h >= 24; h--) { tb.style.setProperty('--tbh', h + 'px'); if (!over()) return; }
    }
  };
  UI.toolChanged = function () {
    $$('#toolbar .tb').forEach(b => b.classList.toggle('on', b.dataset.id === T().tool));
    const d = toolDefs().flatMap(g => g.items).find(x => x.id === T().tool); $('#stTool').textContent = (d ? d.l : t('t_select')) + ' · ' + t('ready');
    const keys = { pipe: 1, cable: 1 }[T().tool] ? [['k_click', 'k_node'], ['k_enter', 'Enter'], ['k_back', '⌫'], ['k_esc', 'Esc']] : T().tool === 'select' ? [['k_click', 'V'], ['k_esc', 'Esc']] : [['k_click', 'k_place'], ['k_esc', 'Esc']];
    $('#stKeys').innerHTML = keys.map(([a, b]) => '<kbd class="k">' + (b === 'k_place' ? t('place_here') : b === 'k_node' ? t('k_node') : esc(b)) + '</kbd> ' + esc(t(a))).join('  ');
    if (T().tool !== 'select') UI.tab('tool'); UI.renderPanel(); UI.hint('');
  };
  UI.refreshStatus = function () {
    const d = T().draw; if (d && d.pts) { $('#stMsg').textContent = t('drawing') + ' · ' + d.nodes.filter(Boolean).length + ' ' + t('nodes_n') + ' · ' + FT.fmtLen(FT.pathLen(d.pts)); } else $('#stMsg').textContent = '';
  };

  // ---------------- small pieces ----------------
  let toastTimer = 0; UI.toast = m => { const e = $('#toast'); e.textContent = m; e.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => e.style.display = 'none', 2600); };
  UI.hint = m => { const e = $('#hint'); e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; };
  // the planner's own dark / light switch (independent of the browser and the computer)
  UI.theme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  UI.setTheme = function (name) {
    const th = name === 'light' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', th); try { localStorage.setItem('ft2_theme', th); } catch (e) { }
    const set = (n, v) => { const m = document.querySelector('meta[name=' + n + ']'); if (m) m.content = v; };
    set('color-scheme', 'only ' + th); set('supported-color-schemes', 'only ' + th); set('theme-color', th === 'light' ? '#ffffff' : '#07090d'); UI.themeButtons(); if (FT.map && FT.map.applyTheme) FT.map.applyTheme();
  };
  UI.openLearn = () => FT.hub.open('home'); // three cards: videos, tips, interactive training (js/hub.js)
  UI.themeButtons = function () {
    const ar = FT.lang === 'ar', learn = $('#bLearn'); if (learn) { learn.querySelector('span').textContent = ar ? 'تعليمي' : 'Tutorials'; learn.title = ar ? 'فيديوهات الشرح والتلميحات والتدريب التفاعلي' : 'Videos, tips and interactive training'; learn.onclick = () => UI.openLearn(); }
    $$('#themeSw button').forEach(b => { const v = b.dataset.th; b.classList.toggle('on', v === UI.theme()); b.querySelector('span').textContent = v === 'dark' ? (ar ? 'غامق' : 'Dark') : (ar ? 'فاتح' : 'Light'); b.dataset.tip = v === 'dark' ? (ar ? 'الوضع الغامق' : 'Dark mode') : (ar ? 'الوضع الفاتح' : 'Light mode'); b.dataset.desc = ar ? 'يغيّر شكل الأداة فقط، ولا يتأثر بوضع المتصفح أو الجهاز.' : 'Changes this planner only; the browser or computer mode never affects it.'; b.dataset.key = 'Shift+V'; b.onclick = () => UI.setTheme(v); });
  };
  UI.coord = s => { $('#stCoord').textContent = s; }; UI.zoom = z => { $('#stZoom').textContent = 'z' + z.toFixed(1); };
  UI.saved = ok => { const m = $('#stMsg'); m.style.color = ok === false ? 'var(--warn)' : 'var(--ok)'; m.textContent = ok === false ? (FT.lang === 'ar' ? 'غير متصل — محفوظ على هذا الجهاز' : 'offline — saved on this device') : (FT.lang === 'ar' ? 'تم الحفظ في السحابة' : 'saved to cloud'); setTimeout(() => { m.textContent = ''; }, 2500); };
  UI.meter = function (pt, seg, total) { const m = $('#meter'); if (!pt) { m.style.display = 'none'; return; } m.style.display = 'block'; m.style.left = (pt.x + 16) + 'px'; m.style.top = (pt.y + 14) + 'px'; m.innerHTML = '+ <b>' + FT.fmtLen(seg) + '</b> · ' + t('live_total') + ' <b>' + FT.fmtLen(total) + '</b>'; };
  UI.meterNode = (pt, d) => { const m = $('#meter'); m.style.display = 'block'; m.style.left = (pt.x + 16) + 'px'; m.style.top = (pt.y + 14) + 'px'; m.innerHTML = '<b>' + FT.fmtLen(d) + '</b>'; };
  UI.meterRect = (pt, a, b) => { const m = $('#meter'); m.style.display = 'block'; m.style.left = (pt.x + 16) + 'px'; m.style.top = (pt.y + 14) + 'px'; const w = FT.dist(a, [b[0], a[1]]), h = FT.dist(a, [a[0], b[1]]); m.innerHTML = '<b>' + Math.round(w) + ' × ' + Math.round(h) + ' m</b> · ' + (w * h / 1e6).toFixed(3) + ' km²'; };
  UI.meterMeasure = (pt, pts) => { const m = $('#meter'); m.style.display = 'block'; m.style.left = (pt.x + 16) + 'px'; m.style.top = (pt.y + 14) + 'px'; const len = FT.pathLen(pts); m.innerHTML = '<b>' + FT.fmtLen(len) + '</b>' + (pts.length >= 3 ? ' · ' + (FT.ringArea(pts) / 10000).toFixed(2) + ' ha' : ''); };
  UI.toolPipeType = () => (FT.PIPE_CAT.find(x => x.id === O.pipeCat) || {}).type || 'hdpe';
  UI.toolPipeCat = () => O.pipeCat; UI.toolCableCat = () => O.cableCat; UI.toolMedium = () => O.medium; UI.floorsValue = () => O.floors;
  UI.numChanged = () => { if (T().tool === 'number') UI.renderPanel(); };

  // ---------------- modal / ctx ----------------
  // onClose (optional) runs once, whichever way this window goes away
  const runClose = () => { const f = UI._onClose; UI._onClose = null; if (f) f(); };
  UI.modal = function (title, body, btns, wire, onClose) {
    runClose(); UI._onClose = onClose || null;
    const m = $('#modal'); m.innerHTML = '<div class="dlg"><div class="dh"><span>' + esc(title) + '</span><button class="ib" id="mX">✕</button></div><div class="db">' + body + '</div><div class="df"></div></div>'; m.classList.add('on');
    const df = m.querySelector('.df'); (btns || []).forEach(b => { const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; if (b.id) e.id = b.id; e.onclick = async () => { if (b.fn) await b.fn(m); if (!b.keep) UI.closeModal(); }; df.appendChild(e); });
    m.querySelector('#mX').onclick = UI.closeModal; m.onmousedown = e => { if (e.target === m) UI.closeModal(); }; if (wire) wire(m.querySelector('.db'));
  };
  UI.closeModal = () => { runClose(); const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; if (FT.map && FT.map.doneRing && !(FT.T && FT.T.multi)) setTimeout(() => { if (!$('#modal').classList.contains('on') && !(FT.T && (FT.T.multi || FT.T.draw))) FT.map.setDone(null); }, 0); };
  UI.ask = function (title, value, label) {
    return new Promise(res => {
      const m = $('#modal2'); m.innerHTML = '<div class="dlg"><div class="dh"><span>' + esc(title) + '</span></div><div class="db"><input id="askIn" value="' + esc(value || '') + '"></div><div class="df"><button class="btn" id="askNo">' + t('cancel') + '</button><button class="btn pri" id="askOk">' + esc(label || t('ok')) + '</button></div></div>'; m.classList.add('on');
      const inp = m.querySelector('#askIn'), done = v => { m.classList.remove('on'); m.innerHTML = ''; res(v); };
      m.querySelector('#askOk').onclick = () => done(inp.value.trim() || null); m.querySelector('#askNo').onclick = () => done(null);
      inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim() || null); else if (e.key === 'Escape') done(null); e.stopPropagation(); }; setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  };
  UI.confirmBox = function (msg, danger) {
    return new Promise(res => {
      const m = $('#modal2'); m.innerHTML = '<div class="dlg"><div class="db" style="font-size:15px;padding:22px 18px">' + esc(msg) + '</div><div class="df"><button class="btn" id="cfNo">' + t('cancel') + '</button><button class="btn ' + (danger ? 'bad' : 'pri') + '" id="cfOk">' + t('ok') + '</button></div></div>'; m.classList.add('on');
      const done = v => { m.classList.remove('on'); m.innerHTML = ''; res(v); };
      m.querySelector('#cfOk').onclick = () => done(true); m.querySelector('#cfNo').onclick = () => done(false); m.querySelector('#cfOk').focus();
    });
  };
  UI.closeCtx = () => { $('#ctx').style.display = 'none'; };
  UI.ctxMenu = function (x, y, h, p, extra) {
    const c = $('#ctx'), items = [];
    if (h && h.kind === 'bld') { items.push([t('menu_props'), () => { UI.tab('props'); }], [t('menu_zoom'), UI.zoomSel], ['📍 ' + t('house_move'), () => T().pickHouseMove(h.id)]); if (T().bsel.size > 1) items.push([t('merge_b'), () => FT.bedit.merge([...T().bsel])]); items.push([t('menu_delete'), () => T().deleteSelection()]); }
    else if (h) { items.push([t('menu_props'), () => { UI.tab('props'); }], [t('menu_zoom'), UI.zoomSel], [t('menu_hide'), UI.hideSel]); if (h.kind === 'node') items.push([t('menu_splice'), () => UI.openSplice(h.id, true)], [t('p_trace'), () => FT.fui.openTrace({ node: h.id })]); items.push([t('menu_delete'), () => T().deleteSelection()]); }
    (extra || []).forEach(x => items.unshift(x));
    FT.extras.menuItems(h).forEach(x => items.push(x));
    items.push([t('menu_copy'), () => navigator.clipboard && navigator.clipboard.writeText(p[1].toFixed(6) + ', ' + p[0].toFixed(6))]);
    c.innerHTML = ''; items.forEach(([l, f]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { UI.closeCtx(); f(); }; c.appendChild(b); });
    c.style.display = 'block'; c.style.left = Math.min(x, innerWidth - 190) + 'px'; c.style.top = Math.min(y, innerHeight - 40 * items.length) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!c.contains(e.target)) { UI.closeCtx(); document.removeEventListener('mousedown', f); } }), 0);
  };
  UI.edgeBtns = () => { const l = $('#left'), r = $('#right'), bl = $('#showLeft'), br = $('#showRight'); if (bl) bl.style.display = l.style.display === 'none' ? 'block' : 'none'; if (br) br.style.display = r.classList.contains('hide') ? 'block' : 'none'; };
  UI.toggleLeft = () => { const l = $('#left'); l.style.display = l.style.display === 'none' ? '' : 'none'; setTimeout(() => FT.map.map.resize(), 50); UI.edgeBtns(); };
  UI.toggleRight = () => { $('#right').classList.toggle('hide'); UI.edgeBtns(); };
  UI.fitAll = function () { const pts = []; Object.values(FT.state.nodes).forEach(n => pts.push(n.ll)); Object.values(FT.state.pipes).forEach(p => p.pts.forEach(q => pts.push(q))); if (pts.length > 1) FT.map.fitBBox(FT.bboxOf(pts)); else if (pts.length === 1) FT.map.flyTo(pts[0], 17); else FT.map.flyTo([36.7137, 34.7324], 14.5); };
  // clicking a row in the tree: if the element is off screen or too small to see at this height, fly to it and zoom so that it shows
  UI.revealSel = function () {
    const s = T().sel, S = FT.state, m = FT.map.map; if (!s || !m) return; const z = m.getZoom(), b = m.getBounds(); let pts = [];
    if (s.kind === 'node' && S.nodes[s.id]) pts = [S.nodes[s.id].ll]; else if (s.kind === 'pipe' && S.pipes[s.id]) pts = S.pipes[s.id].pts; else if (s.kind === 'cable' && S.cables[s.id]) pts = [].concat(...FT.cableSpans(S.cables[s.id]).map(x => x.pts)); else if (s.kind === 'bld') { const q = UI.housePos(s.id); if (q) pts = [q]; }
    if (!pts.length) return; const inView = pts.some(p => p[0] >= b.getWest() && p[0] <= b.getEast() && p[1] >= b.getSouth() && p[1] <= b.getNorth());
    if (!inView || z < FT.map.CABLE_MINZ) UI.zoomSel();
  };
  UI.zoomSel = function () { const s = T().sel, S = FT.state; if (!s) return; if (s.kind === 'node' && S.nodes[s.id]) FT.map.flyTo(S.nodes[s.id].ll, 18.5); else if (s.kind === 'pipe' && S.pipes[s.id]) FT.map.fitBBox(FT.bboxOf(S.pipes[s.id].pts), FT.map.CABLE_MINZ + 0.1); else if (s.kind === 'cable' && S.cables[s.id]) FT.map.fitBBox(FT.bboxOf([].concat(...FT.cableSpans(S.cables[s.id]).map(x => x.pts))), FT.map.CABLE_MINZ + 0.1); else if (s.kind === 'bld') { const q = UI.housePos(s.id); if (q) FT.map.flyTo(q, 19); } };
  UI.housePos = id => { const o = FT.state.bld[id] || {}; return o.pt || FT.map.housePoint(id) || o.ll || (o.fp ? FT.centroid(o.fp) : null); }; // where the house icon stands
  UI.hideSel = function () { const s = T().sel; if (!s) return; T().hidden.add(s.id); UI.applyHidden(); UI.refreshTree(); };
  UI.applyHidden = function () { FT.map.renderNet('lod'); }; // hidden items are skipped when the map data is built
  const folderIds = fid => Object.keys(FT.state.fmap || {}).filter(k => FT.state.fmap[k] === fid).map(k => k.slice(2));
  UI.hideFolder = function (fid, hide) { folderIds(fid).forEach(id => hide ? T().hidden.add(id) : T().hidden.delete(id)); UI.applyHidden(); UI.refreshTree(); };

  // ---------------- layer tree ----------------
  const ROW_ICON = { node: n => '<img class="ico" data-ic="' + n.type + '">', pipe: p => '<span class="dot" style="background:' + (p.color || '#2aa8ff') + '"></span>', cable: c => '<span class="dot" style="background:' + (c.color || ((FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group === 'Drop' ? '#d4ff4a' : (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group === 'Distribution' ? '#35e0c9' : '#b57bff')) + '"></span>', splice: () => '<img class="ico" data-ic="splice">' };
  const COLL = { 'n:': 'nodes', 'p:': 'pipes', 'c:': 'cables', 's:': 'splices' }, NODE_ORDER = ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole'];
  let dragKey = null, lastSelKey = '';
  UI.drawChips = function () {
    const c = $('#chips'); if (!c) return;
    c.innerHTML = [['all', 'f_all'], ['box', 'f_box'], ['olt', 'f_olt'], ['mh', 'f_mh'], ['pipe', 'f_pipe'], ['cable', 'f_cable'], ['splice', 'f_splice']].map(([k, l]) => '<span class="chip' + (chipFilter === k ? ' on' : '') + '" data-c="' + k + '">' + t(l) + '</span>').join('');
    $$('#chips .chip').forEach(x => x.onclick = () => { chipFilter = x.dataset.c; UI.drawChips(); UI.refreshTree(); });
  };
  // make a new / selected element visible in the tree: expand its group, clear the search and the filter that hide it
  UI.reveal = function (kind, id) {
    const S = FT.state; let grp = null, o = null;
    if (kind === 'node') { o = S.nodes[id]; grp = o && 'nodes:' + o.type; } else if (kind === 'pipe') { o = S.pipes[id]; grp = 'pipes'; } else if (kind === 'cable') { o = S.cables[id]; grp = 'cables'; } else if (kind === 'splice') { o = S.splices[id]; grp = 'splices'; }
    if (!o) return false; let changed = false; if (collapsed.delete('root')) changed = true; if (grp && collapsed.delete(grp)) changed = true;
    const fid = (S.fmap || {})[({ node: 'n:', pipe: 'p:', cable: 'c:', splice: 's:' }[kind]) + id]; if (fid && collapsed.delete(fid)) changed = true;
    const visible = chipFilter === 'all' || (kind === 'node' && ((chipFilter === 'olt' && o.type === 'olt') || (chipFilter === 'box' && FT.BOX_TYPES.includes(o.type)) || (chipFilter === 'mh' && ['mh', 'hh', 'pole'].includes(o.type)))) || chipFilter === kind;
    if (!visible) { chipFilter = 'all'; UI.drawChips(); changed = true; }
    if (treeQuery) { treeQuery = ''; const ls = $('#lsearch'); if (ls) ls.value = ''; changed = true; }
    lastSelKey = ''; return changed;
  };
  // selection only moves the highlight (cheap); the tree is rebuilt only if the row is missing
  UI.treeSelect = function (force) {
    const el = $('#tree'); if (!el) return; const sel = T().sel, S = FT.state;
    const inTree = sel && ((sel.kind === 'node' && S.nodes[sel.id]) || (sel.kind === 'pipe' && S.pipes[sel.id]) || (sel.kind === 'cable' && S.cables[sel.id]) || (sel.kind === 'splice' && S.splices[sel.id]));
    if (force || (inTree && vIndex[sel.id] == null)) { UI.refreshTree(); return; }
    const old = el.querySelector('.tr.sel'); if (old) old.classList.remove('sel');
    if (!inTree) return; const row = el.querySelector('.tr[data-id="' + sel.id + '"]');
    if (row) { row.classList.add('sel'); if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); }
    else { el.scrollTop = Math.max(0, vIndex[sel.id] * VH - el.clientHeight / 2); UI.treeRender(); } // row is outside the rendered window
  };
  let treeTimer = 0; UI.refreshTreeSoon = function () { clearTimeout(treeTimer); treeTimer = setTimeout(UI.refreshTree, 40); };
  UI.moveRow = function (key, dir) {
    const S = FT.state, coll = COLL[key.slice(0, 2)], id = key.slice(2); if (!coll || !S[coll][id]) return;
    let list = FT.ordered(coll); if (coll === 'nodes') list = list.filter(n => n.type === S.nodes[id].type);
    const i = list.findIndex(o => o.id === id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return;
    FT.commit(); FT.reorder(coll, id, list[j].id, dir > 0); FT.changed('order');
  };
  // The tree keeps a flat list of row descriptors and renders only the rows on screen (a big city = 40 000+ rows).
  const VH = 28; let vRows = [], vIndex = {}, vOn = false, vFrom = 0, vTo = 0, treeWired = false;
  UI.treeRender = function () {
    const el = $('#tree'); if (!el) return; const sel = T().sel, keep = el.scrollTop; let from = 0, to = vRows.length;
    if (vOn) { const vh = el.clientHeight || 600; from = Math.max(0, Math.floor(keep / VH) - 30); to = Math.min(vRows.length, Math.ceil((keep + vh) / VH) + 30); }
    let h = ''; for (let i = from; i < to; i++) { const d = vRows[i];
      h += d.k === 'row' ? d.html.replace('%S%', sel && sel.id === d.id ? ' sel' : '').replace('%C%', T().hidden.has(d.id) ? '' : ' checked').replace('%L%', T().locked.has(d.id) ? '🔒' : '🔓').replace(/data-ic="(\w+)"/g, (m, t) => 'src="' + FT.map.iconDataURL(t, 36) + '"') : d.html; }
    el.innerHTML = vOn ? '<div style="height:' + (from * VH) + 'px"></div>' + h + '<div style="height:' + ((vRows.length - to) * VH) + 'px"></div>' : h;
    el.scrollTop = keep; vFrom = from; vTo = to;
  };
  UI.refreshTree = function () {
    clearTimeout(treeTimer); const S = FT.state, el = $('#tree'); if (!el) return; const q = treeQuery.toLowerCase(), sel = T().sel;
    const match = (name, type) => (!q || (name + ' ' + type).toLowerCase().includes(q));
    const chipOK = k => chipFilter === 'all' || chipFilter === k;
    const nodeOK = n => match(n.name + ' ' + (n.label || '') + ' ' + (n.code || ''), n.type) && (chipFilter === 'all' || (chipFilter === 'olt' && n.type === 'olt') || (chipFilter === 'box' && FT.BOX_TYPES.includes(n.type)) || (chipFilter === 'mh' && ['mh', 'hh', 'pole'].includes(n.type)));
    const lst = { nodes: FT.ordered('nodes').filter(nodeOK), pipes: FT.ordered('pipes').filter(p => match(p.name, 'pipe') && chipOK('pipe')), cables: FT.ordered('cables').filter(c => match(c.name, 'cable') && chipOK('cable')), splices: FT.ordered('splices').filter(x => match(x.label || 'splice', 'splice') && chipOK('splice')) };
    const total = Object.keys(S.nodes).length + Object.keys(S.pipes).length + Object.keys(S.cables).length + Object.keys(S.splices).length;
    wireTree(); vRows = []; vIndex = {};
    if (!total && !Object.keys(S.imports || {}).length && !(FT.sync && FT.sync.active)) { vOn = false; el.innerHTML = '<div class="empty">' + t('no_layers') + '</div>'; return; }
    const fmap = S.fmap || {}, inFolder = key => fmap[key];
    const row = (kind, o, key) => { const nm = o.name || (kind === 'splice' ? 'EK · ' + ((FT.state.nodes[o.node] || {}).name || '') + (o.label ? ' · ' + o.label : '') : o.label || kind);
      vIndex[o.id] = vRows.length; vRows.push({ k: 'row', id: o.id, html: '<div class="tr%S%" draggable="true" data-key="' + key + '" data-k="' + kind + '" data-id="' + o.id + '" style="padding-inline-start:30px"><input type="checkbox"%C% data-vis="' + o.id + '">' + ROW_ICON[kind](o) + '<span class="nm">' + esc(nm) + '</span><span class="acts"><button data-act="up" title="' + t('layer_up') + '">▲</button><button data-act="down" title="' + t('layer_down') + '">▼</button><button data-act="lock" title="' + t('layer_lock') + '">%L%</button><button data-act="del" title="' + t('layer_del') + '">🗑</button><button data-act="more" title="' + t('layer_actions') + '">⋯</button></span></div>' }); };
    const raw = html => vRows.push({ k: 'raw', html });
    const grp = (id, title, items, kind, prefixKey) => { const open = !collapsed.has(id), its = items.filter(o => !inFolder(prefixKey + o.id)); if (!items.length) return; raw('<div class="tr fold" data-fold="' + id + '"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">' + esc(title) + '</span><span class="ct">' + its.length + '</span></div>'); if (open) its.forEach(o => row(kind, o, prefixKey + o.id)); };
    if (FT.sync && FT.sync.active) { // the team: who made what, each with a show/hide box for MY map
      const people = FT.sync.userList(), open = !collapsed.has('users');
      raw('<div class="tr fold" data-fold="users"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">👥 ' + t('users') + '</span><span class="ct">' + people.length + '</span></div>');
      if (open) people.forEach(p => raw('<div class="tr usr" data-user="' + p.id + '" style="padding-inline-start:30px"><input type="checkbox" data-uvis="' + p.id + '" title="' + t('user_vis') + '"' + (p.hidden ? '' : ' checked') + '><i class="udot" style="background:' + p.color + '"></i><span class="nm">' + esc(p.old ? t('user_before') : p.name || t('user_unknown')) + (p.me ? ' <small>' + t('user_me') + '</small>' : '') + '</span>' + (p.peer ? '<span class="uon" title="' + t('user_online') + '">●</span>' : '') + '<span class="ct">' + p.count + '</span>' + (p.peer ? '<button class="ugo" data-ugo="' + p.peer + '" title="' + t('user_go') + '">⌖</button>' : '') + '</div>'));
    }
    raw('<div class="tr fold" data-fold="root"><span class="tw">' + (collapsed.has('root') ? '▸' : '▾') + '</span><span class="nm">' + t('physical') + '</span></div>');
    if (!collapsed.has('root')) {
      Object.entries(S.folders || {}).forEach(([fid, f]) => { const open = !collapsed.has(fid); const items = []; lst.nodes.forEach(o => fmap['n:' + o.id] === fid && items.push(['node', o, 'n:' + o.id])); lst.pipes.forEach(o => fmap['p:' + o.id] === fid && items.push(['pipe', o, 'p:' + o.id])); lst.cables.forEach(o => fmap['c:' + o.id] === fid && items.push(['cable', o, 'c:' + o.id]));
        raw('<div class="tr fold" data-fold="' + fid + '" data-drop="' + fid + '" style="padding-inline-start:16px"><span class="tw">' + (open ? '▾' : '▸') + '</span><input type="checkbox" data-fvis="' + fid + '" title="' + t('folder_vis') + '"' + (items.length && items.every(x => T().hidden.has(x[1].id)) ? '' : ' checked') + '><span class="nm">📁 ' + esc(f.name) + '</span><span class="ct">' + items.length + '</span><span class="acts"><button data-act="fren" data-fid="' + fid + '">✎</button><button data-act="fdel" data-fid="' + fid + '">🗑</button></span></div>'); if (open) items.forEach(x => row(x[0], x[1], x[2])); });
      NODE_ORDER.forEach(tp => grp('nodes:' + tp, t('tg_' + tp), lst.nodes.filter(n => n.type === tp), 'node', 'n:'));
      grp('pipes', t('pipes'), lst.pipes, 'pipe', 'p:'); grp('cables', t('cables'), lst.cables, 'cable', 'c:'); grp('splices', t('splices'), lst.splices, 'splice', 's:');
      const ig = importsGroup(); if (ig) raw(ig);
    }
    vOn = vRows.length > 300; UI.treeRender();
    const sk = sel ? sel.kind + ':' + sel.id : '';
    if (sk !== lastSelKey) { lastSelKey = sk; if (sel && vIndex[sel.id] != null) { const rw = el.querySelector('.tr.sel'); if (rw && rw.scrollIntoView) rw.scrollIntoView({ block: 'nearest' }); else { el.scrollTop = Math.max(0, vIndex[sel.id] * VH - el.clientHeight / 2); UI.treeRender(); } } }
  };
  // events are delegated on the container (rows come and go while scrolling)
  function wireTree() {
    if (treeWired) return; treeWired = true; const el = $('#tree'), S = () => FT.state;
    const clearMarks = () => el.querySelectorAll('.dropa,.dropb').forEach(x => x.classList.remove('dropa', 'dropb'));
    const sameColl = r => { const key = r.dataset.key; if (!dragKey || !key || dragKey === key || dragKey.slice(0, 2) !== key.slice(0, 2)) return false; if (key.startsWith('n:')) { const a = S().nodes[dragKey.slice(2)], b = S().nodes[r.dataset.id]; return !!(a && b && a.type === b.type); } return true; };
    let tick = 0; el.addEventListener('scroll', () => { if (!vOn || tick) return; tick = requestAnimationFrame(() => { tick = 0; const st = el.scrollTop, vh = el.clientHeight || 600; if (Math.floor(st / VH) - 8 < vFrom && vFrom > 0 || Math.ceil((st + vh) / VH) + 8 > vTo && vTo < vRows.length) UI.treeRender(); }); });
    el.addEventListener('click', e => {
      const tg = e.target, btn = tg.closest('button'), r = tg.closest('.tr'); if (!r) return;
      if (btn && btn.dataset.ugo) { e.stopPropagation(); FT.sync.goTo(btn.dataset.ugo); return; }
      if (btn && btn.dataset.impconv) { e.stopPropagation(); FT.extras.openConvert(btn.dataset.impconv); return; }
      if (btn && btn.dataset.implock) { e.stopPropagation(); FT.imp.setLocked(btn.dataset.implock, !FT.imp.isLocked(btn.dataset.implock)); return; }
      if (btn && btn.dataset.impdel) { e.stopPropagation(); FT.commit(); delete S().imports[btn.dataset.impdel]; FT.imp.unlocked.delete(btn.dataset.impdel); FT.changed('import'); return; }
      if (btn && btn.dataset.act) { e.stopPropagation(); const a = btn.dataset.act, id = r.dataset.id, k = r.dataset.k, key = r.dataset.key;
        if (a === 'lock') { T().locked.has(id) ? T().locked.delete(id) : T().locked.add(id); UI.treeRender(); }
        else if (a === 'del') { T().select(k, id); T().deleteSelection(); } else if (a === 'up' || a === 'down') UI.moveRow(key, a === 'up' ? -1 : 1);
        else if (a === 'more') { T().select(k, id); const rc = btn.getBoundingClientRect(); UI.ctxMenu(rc.right, rc.bottom, { kind: k, id }, [0, 0]); }
        else if (a === 'fren') (async () => { const f = S().folders[btn.dataset.fid]; const n = await UI.ask(t('new_folder'), f.name); if (n) { FT.commit(); f.name = n; FT.changed('folder'); } })();
        else if (a === 'fdel') { FT.commit(); const fid = btn.dataset.fid; delete S().folders[fid]; Object.keys(S().fmap || {}).forEach(kk => S().fmap[kk] === fid && delete S().fmap[kk]); FT.changed('folder'); }
        return; }
      if (tg.type === 'checkbox') return;
      if (r.dataset.fold) { const id = r.dataset.fold; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); UI.refreshTree(); return; }
      if (r.dataset.id) { T().select(r.dataset.k, r.dataset.id); UI.revealSel(); }
    });
    el.addEventListener('dblclick', e => {
      const r = e.target.closest('.tr'); if (!r || e.target.closest('.acts')) return;
      if (r.dataset.id) { T().select(r.dataset.k, r.dataset.id); UI.zoomSel(); }
      else if (r.dataset.imp) { const g = S().imports[r.dataset.imp]; if (g) FT.map.fitBBox(FT.bboxOf([].concat(...g.features.slice(0, 2000).map(f => f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0])))); }
    });
    el.addEventListener('change', e => { const c = e.target;
      if (c.dataset.uvis) { FT.sync.setUserHidden(c.dataset.uvis, !c.checked); return; }
      if (c.dataset.fvis) { UI.hideFolder(c.dataset.fvis, !c.checked); return; }
      if (c.dataset.vis) { c.checked ? T().hidden.delete(c.dataset.vis) : T().hidden.add(c.dataset.vis); UI.applyHidden(); }
      else if (c.dataset.impvis) { c.checked ? T().hidden.delete(c.dataset.impvis) : T().hidden.add(c.dataset.impvis); FT.imp.render(); } });
    el.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('.tr[data-key]'); if (!r) return; dragKey = r.dataset.key; e.dataTransfer.setData('text', dragKey); e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
    el.addEventListener('dragend', e => { dragKey = null; const r = e.target.closest && e.target.closest('.tr'); if (r) r.classList.remove('dragging'); clearMarks(); });
    el.addEventListener('dragover', e => { const f = e.target.closest('[data-drop]'); if (f && dragKey) { e.preventDefault(); return; } const r = e.target.closest('.tr[data-key]'); if (!r || !sameColl(r)) return; e.preventDefault(); const rc = r.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2; clearMarks(); r.classList.add(after ? 'dropa' : 'dropb'); });
    el.addEventListener('dragleave', e => { const r = e.target.closest && e.target.closest('.tr'); if (r) r.classList.remove('dropa', 'dropb'); });
    el.addEventListener('drop', e => {
      const f = e.target.closest('[data-drop]');
      if (f) { e.preventDefault(); const key = e.dataTransfer.getData('text'); if (!key) return; FT.commit(); (S().fmap = S().fmap || {})[key] = f.dataset.drop; FT.changed('folder'); return; }
      const r = e.target.closest('.tr[data-key]'); if (!r || !sameColl(r)) return; e.preventDefault(); e.stopPropagation(); const rc = r.getBoundingClientRect(), after = e.clientY > rc.top + rc.height / 2, did = dragKey.slice(2); clearMarks();
      FT.commit(); if (FT.reorder(COLL[r.dataset.key.slice(0, 2)], did, r.dataset.id, after)) FT.changed('order');
    });
  }
  function importsGroup() {
    const im = Object.values(FT.state.imports || {}); if (!im.length) return ''; const open = !collapsed.has('imports');
    return '<div class="tr fold" data-fold="imports"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">' + t('imports') + '</span><span class="ct">' + im.length + '</span></div>' + (open ? im.map(g => { const lk = FT.imp.isLocked(g.id);
      return '<div class="tr" data-imp="' + g.id + '" style="padding-inline-start:30px"><input type="checkbox" ' + (T().hidden.has(g.id) ? '' : 'checked') + ' data-impvis="' + g.id + '"><span class="dot" style="background:#7ad7ff"></span><span class="nm">' + esc(g.name) + '</span><span class="ct">' + g.features.length + '</span><button class="convb" data-impconv="' + g.id + '" title="' + (FT.lang === 'ar' ? 'حوّل لأنابيب وكبلات' : 'Turn into ducts and cables') + '">⇄</button><button class="lockv' + (lk ? '' : ' open') + '" data-implock="' + g.id + '" title="' + t(lk ? 'imp_unlock' : 'imp_lock') + '">' + (lk ? '🔒' : '🔓') + '</button><span class="acts"><button data-impdel="' + g.id + '">🗑</button></span></div>'; }).join('') : '');
  }
  UI.newFolder = async function () { const n = await UI.ask(t('new_folder'), t('new_folder')); if (!n) return; FT.commit(); const S = FT.state; (S.folders = S.folders || {})[FT.uid('f')] = { name: n }; FT.changed('folder'); };

  // ---------------- right panel ----------------
  UI.tab = k => { rtab = k; $$('.tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === k)); UI.renderPanel(); };
  UI.selectionChanged = function () { if (T().sel || T().multi) { rtab = 'props'; } else if (rtab === 'props') rtab = 'tool'; $$('.tabs button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === rtab)); UI.renderPanel(); };
  const sel = (id, opts, cur) => '<select id="' + id + '">' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const field = (label, html) => '<div class="f"><label>' + esc(label) + '</label>' + html + '</div>';
  const keysBox = k => '<div class="keys">' + k.map(([a, b]) => '<kbd class="k">' + esc(b) + '</kbd><span>' + esc(a) + '</span>').join('') + '</div>';
  UI.renderPanel = function () {
    const body = $('#rbody'); if (!body) return; const tool = T().tool, tbl = toolDefs().flatMap(g => g.items).find(x => x.id === tool);
    if (rtab === 'props') return panelProps(body);
    if (tool === 'wdev' || tool === 'wlink') { if (rtab === 'tool') return FT.wl.toolPanel(body); }
    if (rtab === 'analysis') return panelAnalysis(body);
    // tool tab
    if (tool === 'select' && !tbl) { body.innerHTML = '<p class="d">' + t('empty_panel') + '</p>'; return; }
    let h = '<h3>' + esc(tbl ? tbl.l : '') + '</h3><p class="d">' + esc(tbl ? tbl.d : '') + '</p>';
    if (['sk', 'dk', 'bk'].includes(tool)) h += field(t('ratio'), '<div class="seg" id="ratioSeg">' + FT.RATIOS.map(r => '<button data-r="' + r + '" class="' + (O.ratio[tool] === r ? 'on' : '') + '">' + (r || t('ratio_none')) + '</button>').join('') + '</div><div class="d" style="margin-top:5px">' + t('ratio_hint') + '</div>');
    if (tool === 'pipe' || tool === 'cable') h += '<div class="fl"><input type="checkbox" id="roadSnap"' + (FT.roads.on ? ' checked' : '') + '><span>' + (FT.lang === 'ar' ? 'اتباع الشوارع تلقائيًا (لا يمرّ فوق البيوت)' : 'Follow streets automatically (never across buildings)') + '</span></div>';
    if (tool === 'pipe') h += field(t('pipe_type'), sel('pipeCat', FT.PIPE_CAT.map(p => [p.id, p.name]), O.pipeCat));
    if (tool === 'cable') { const groups = {}; FT.CABLE_CAT.forEach(c => (groups[c.group] = groups[c.group] || []).push(c)); h += field(t('cable_cat'), '<select id="cableCat">' + Object.entries(groups).map(([g, a]) => '<optgroup label="' + g + '">' + a.map(c => '<option value="' + c.id + '"' + (c.id === O.cableCat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</optgroup>').join('') + '</select>') + field(t('medium'), '<div class="seg" id="mediumSeg"><button data-m="free" class="' + (O.medium === 'free' ? 'on' : '') + '">' + t('m_free') + '</button><button data-m="aerial" class="' + (O.medium === 'aerial' ? 'on' : '') + '">' + t('m_aerial') + '</button></div>'); }
    if (tool === 'number') { const n = T().num; h += '<div class="seg" id="numMode" style="margin-bottom:10px"><button data-m="auto" class="' + (n.mode === 'auto' ? 'on' : '') + '">' + t('num_auto') + '</button><button data-m="click" class="' + (n.mode === 'click' ? 'on' : '') + '">' + t('num_click') + '</button></div><div class="two">' + field(t('num_prefix'), '<input id="numPfx" value="' + esc(n.prefix) + '">') + field(t('num_next'), '<input id="numNext" type="text" inputmode="numeric" value="' + n.next + '">') + '</div>' + (n.mode === 'auto' ? field(t('num_order'), sel('numOrder', [['walk', t('o_walk')], ['rows', t('o_rows')], ['street', t('o_street')]], n.order)) + '<p class="d">' + t('num_hint_auto') + '</p><button class="btn" id="numClear">' + t('num_clear') + '</button>' : '<p class="d">' + t('num_hint_click') + '</p>'); }
    if (tool === 'house') h += '<p class="d">' + t('house_hint') + '</p>';
    if (tool === 'splice') h += '<button class="btn pri full" id="spAll" style="margin-bottom:8px">' + (FT.lang === 'ar' ? 'وصل تلقائي لكل المقسّمات غير الملحومة' : 'Auto-join every unfed splitter') + '</button>';
    if (tool === 'floors' || tool === 'bdraw' || tool === 'house') h += field(t('floors'), '<input id="flN" type="text" inputmode="numeric" value="' + O.floors + '">') + (tool === 'floors' ? field(FT.lang === 'ar' ? 'عدد الشقق لكل مبنى (اختياري)' : 'Flats per building (optional)', '<input id="flF" type="text" inputmode="numeric" value="' + (O.flats || '') + '">') + field(FT.lang === 'ar' ? 'أو شقق بكل طابق (للمنطقة)' : 'or flats per floor (for an area)', '<input id="flP" type="text" inputmode="numeric" value="' + (O.perFloor || '') + '">') + '<button type="button" class="btn pri full" id="flArea" style="margin-bottom:8px">' + (FT.lang === 'ar' ? 'طبّق على كل مباني منطقة بترسمها' : 'Apply to every building in an area you draw') + '</button>' : '') + '<p class="d">' + t('floors_hint') + '</p>';
    if (tool !== 'select') h += keysBox([[t('place_here'), t('k_click')], [t('k_enter'), 'Enter'], [t('k_back'), '⌫'], [t('k_esc'), 'Esc']]);
    body.innerHTML = h;
    body.querySelectorAll('#ratioSeg button').forEach(b => b.onclick = () => { O.ratio[tool] = b.dataset.r; FT.state.ui.ratio[tool] = b.dataset.r; UI.renderPanel(); });
    const sa = $('#spAll'); if (sa) sa.onclick = () => FT.fui.autoAll();
    const rs = $('#roadSnap'); if (rs) rs.onchange = () => { FT.roads.on = rs.checked; };
    const pc = $('#pipeCat'); if (pc) pc.onchange = () => O.pipeCat = pc.value; const cc = $('#cableCat'); if (cc) cc.onchange = () => O.cableCat = cc.value;
    body.querySelectorAll('#mediumSeg button').forEach(b => b.onclick = () => { O.medium = b.dataset.m; UI.renderPanel(); });
    body.querySelectorAll('#numMode button').forEach(b => b.onclick = () => { T().num.mode = b.dataset.m; T().cancel(true); T().draw = null; FT.map.setDraw([]); UI.toolChanged(); }); // the tool stays on: setTool() on the active tool would switch it off
    const np = $('#numPfx'); if (np) np.oninput = () => { T().num.prefix = np.value; const nx = $('#numNext'); if (nx) nx.value = FT.num.syncNext(); }; const nn = $('#numNext'); if (nn) nn.oninput = () => { const v = parseInt(String(nn.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v > 0) { T().num.next = v; T().num.from = v; T().num.fromPfx = T().num.prefix || ''; } }; const no = $('#numOrder'); if (no) no.onchange = () => T().num.order = no.value;
    const nc = $('#numClear'); if (nc) nc.onclick = () => FT.T.startShape('poly', ring => FT.num.clearIn(ring), t('num_hint_auto'));
    const fl = $('#flN'); if (fl) fl.oninput = () => { const v = parseInt(String(fl.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v > 0) O.floors = v; };
    const ff = $('#flF'); if (ff) ff.oninput = () => { const v = parseInt(String(ff.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); O.flats = v > 0 ? Math.min(400, v) : 0; };
    const fp = $('#flP'); if (fp) fp.oninput = () => { const v = parseInt(String(fp.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); O.perFloor = v > 0 ? Math.min(20, v) : 0; };
    const fz = $('#flArea'); if (fz) fz.onclick = () => FT.plus.pickArea({ floors: O.floors, flats: O.flats || 0, perFloor: O.perFloor || 0 });
  };
  function panelProps(body) {
    const S = FT.state, s = T().sel, m = T().multi;
    if (m) { body.innerHTML = '<h3>' + (m.nodes.size + m.pipes.size + m.cables.size) + ' ✓</h3><div class="kv"><span>' + t('nodes') + '</span><b>' + m.nodes.size + '</b></div><div class="kv"><span>' + t('pipes') + '</span><b>' + m.pipes.size + '</b></div><div class="kv"><span>' + t('cables') + '</span><b>' + m.cables.size + '</b></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="mRep">' + t('t_report') + '</button><button class="btn bad" id="mDel">' + t('menu_delete') + '</button></div>'; $('#mRep').onclick = () => UI.openReport(true); $('#mDel').onclick = () => T().deleteSelection(); return; }
    if (!s) { body.innerHTML = '<p class="d">' + t('empty_panel') + '</p>'; return; }
    if (s.kind === 'node' && S.nodes[s.id]) return propNode(body, S.nodes[s.id]);
    if (s.kind === 'pipe' && S.pipes[s.id]) return propPipe(body, S.pipes[s.id]);
    if (s.kind === 'cable' && S.cables[s.id]) return propCable(body, S.cables[s.id]);
    if (s.kind === 'splice' && S.splices[s.id]) { UI.openSplice(S.splices[s.id].node); return; }
    if (s.kind === 'wdev') return FT.wl.propDev(body, s.id);
    if (s.kind === 'wlink') return FT.wl.propLink(body, s.id);
    if (s.kind === 'bld') return propBld(body, s.id);
    body.innerHTML = '<p class="d">' + t('empty_panel') + '</p>';
  }
  const head = (name, extra) => '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0">' + esc(name) + '</h3><button class="btn" style="padding:3px 9px;font-size:12px" id="pRel">' + t('release') + '</button></div>' + (extra || '');
  UI.bindProps = (b, o, m) => bind(b, o, m);
  function bind(body, obj, map) {
    body.querySelectorAll('[data-p]').forEach(i => { const k = i.dataset.p; const ev = i.tagName === 'SELECT' ? 'onchange' : 'oninput'; i[ev] = () => { let v = i.value; if (i.dataset.n) { v = parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))); if (isNaN(v)) return; } obj[k] = v; if (map && map[k]) map[k](v); clearTimeout(bind.t); bind.t = setTimeout(() => FT.changed('prop'), 300); }; i.onfocus = () => { if (!i._c) { FT.commit(); i._c = 1; } }; });
    const r = $('#pRel'); if (r) r.onclick = () => T().select(null);
  }
  function propNode(body, n) {
    const d = n; const fc = FT.FIBER_COLORS.map(c => '<span><i style="background:' + c.hex + '"></i>' + c.code + ' ' + (FT.lang === 'ar' ? c.ar : c.en) + '</span>').join('');
    const conn = Object.values(FT.state.cables).filter(c => c.nodes.includes(n.id)).length;
    body.innerHTML = head(n.name, '<div class="kv"><span>' + n.ll[1].toFixed(6) + ', ' + n.ll[0].toFixed(6) + '</span><b>' + conn + ' ' + t('cables') + '</b></div><div style="display:flex;gap:6px;margin:8px 0"><button class="btn pri full" id="pTrace">' + t('p_trace') + '</button><button class="btn full" id="pSplice">' + t('splice_title') + '</button></div>' + FT.fui.portGrid(n.id) + (FT.fiber.splittersOf(n.id).length ? '<button class="btn full" id="pSub" style="margin-bottom:8px">👤 ' + (FT.lang === 'ar' ? 'ربط مشترك من هالعلبة' : 'Connect a subscriber here') + '</button>' : '')) +
      '<div class="two">' + field(t('p_type'), sel('x', Object.keys(FT.NODE_TYPES).map(k => [k, FT.nodeTypeName(k)]), n.type).replace('id="x"', 'data-p="type"')) + field(t('p_place'), sel('x', FT.PLACEMENTS.map(p => [p, t('pl_' + p)]), n.place).replace('id="x"', 'data-p="place"')) + '</div>' +
      '<div class="two">' + field(t('p_ratio'), sel('x', FT.RATIOS.map(r => [r, r || t('ratio_none')]), n.ratio).replace('id="x"', 'data-p="ratio"')) + field(t('p_cores'), '<input data-p="cores" data-n="1" value="' + n.cores + '">') + '</div>' +
      field(t('p_name'), '<input data-p="name" value="' + esc(n.name) + '">') + field(t('p_label'), '<input data-p="label" value="' + esc(n.label) + '">') + '<div class="two">' + field(t('p_code'), '<input data-p="code" value="' + esc(n.code || '') + '" placeholder="F01-PS01-P01-D01-FDB01" style="direction:ltr">') + (n.type === 'sk' ? field(t('p_nsplit'), '<input data-p="nsplit" data-n="1" value="' + (n.nsplit || 1) + '">') : '<div></div>') + '</div>' +
      field(t('p_colors'), '<div class="fc">' + fc + '</div>') + '<div class="two">' + field(t('p_closure'), sel('x', FT.CASSETTES.map(c => [c, c || '—']), n.cassette).replace('id="x"', 'data-p="cassette"')) + field(t('p_cat'), sel('x', [['', '—']].concat(FT.NODE_CAT.map(c => [c.id, c.name])), n.cat).replace('id="x"', 'data-p="cat"')) + '</div>' +
      field(t('p_size'), '<input data-p="size" value="' + esc(n.size) + '">') + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(n.note) + '</textarea>') + '<button class="btn bad full" id="pDel">' + t('p_delnode') + '</button>';
    if (FT.field) FT.field.attach(body, 'node', n.id);
    bind(body, n); $('#pDel').onclick = () => T().deleteSelection(); $('#pTrace').onclick = () => FT.fui.openTrace({ node: n.id }); $('#pSplice').onclick = () => UI.openSplice(n.id); if ($('#pSub')) $('#pSub').onclick = () => { T().setTool('sub'); T().sel = { kind: 'node', id: n.id }; FT.map.setSelection('node', n.id); UI.hint(n.name + ' → ' + (FT.lang === 'ar' ? 'اضغط لوغو البيت' : 'click a house icon')); };
    body.querySelectorAll('[data-spk]').forEach(b => b.onclick = () => FT.fui.openTrace({ sp: b.dataset.spk }));
  }
  function propPipe(body, p) {
    const A = FT.state.nodes[p.a], B = FT.state.nodes[p.b];
    body.innerHTML = head(p.name, '<div class="kv"><span>' + t('p_len') + '</span><b>' + FT.fmtLen(FT.pathLen(p.pts)) + '</b></div><div class="kv"><span>' + p.pts.length + ' ' + t('p_corners') + '</span></div><div class="kv"><span>' + t('p_start') + ': ' + esc(A ? A.name : '?') + '</span></div><div class="kv"><span>' + t('p_end') + ': ' + esc(B ? B.name : (p.load ? t('p_branch') : '?')) + '</span></div>' + (p.load ? '<div class="kv"><span>' + t('p_shared') + '</span><b>' + p.load + '</b></div><div class="kv"><span>' + t('p_qty') + '</span><b>' + (p.qty || 1) + '</b></div>' : '') + '<div style="height:8px"></div>') +
      field(t('p_name'), '<input data-p="name" value="' + esc(p.name) + '">') + '<div class="two">' + field(t('pipe_type'), sel('x', FT.PIPE_TYPES.map(x => [x, t('pt_' + x)]), p.ptype).replace('id="x"', 'data-p="ptype"')) + field(t('p_pno'), '<input data-p="no" data-n="1" value="' + p.no + '">') + '</div>' +
      field(t('p_cat'), sel('x', FT.PIPE_CAT.map(c => [c.id, c.name]), p.cat).replace('id="x"', 'data-p="cat"')) + '<div class="three">' + field(t('p_depth'), '<input data-p="depth" data-n="1" value="' + (p.depth == null ? 30 : p.depth) + '">') + field(t('p_width'), '<input data-p="width" data-n="1" value="' + (p.width == null ? 6 : p.width) + '">') + field(t('p_cover'), '<input data-p="cover" data-n="1" value="' + (p.cover == null ? 10 : p.cover) + '">') + '</div>' + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(p.note) + '</textarea>') + field(t('p_color'), '<input type="color" data-p="color" value="' + (p.color || '#2aa8ff') + '" style="height:34px;padding:2px">') + '<button class="btn bad full" id="pDel">' + t('p_delpipe') + '</button>';
    bind(body, p); $('#pDel').onclick = () => T().deleteSelection(); if (FT.field) FT.field.attach(body, 'pipe', p.id);
  }
  function propCable(body, c) {
    const A = FT.state.nodes[c.a], B = FT.state.nodes[c.b], spans = FT.cableSpans(c);
    body.innerHTML = head(c.name, '<div class="kv"><span>' + t('p_total') + '</span><b>' + FT.fmtLen(FT.cableLength(c)) + '</b></div><div class="kv"><span>' + (FT.lang === 'ar' ? 'المطلوب مع الاحتياط والهالك' : 'To buy, with loops and waste') + '</span><b>' + FT.fmtLen(FT.fiber.cableNeed(c)) + '</b></div><div class="kv"><span>' + spans.length + ' ' + t('p_sections') + ' · ' + c.core + ' core</span></div><div class="kv"><span>' + t('p_start') + ': ' + esc(A ? A.name : '?') + '</span></div><div class="kv"><span>' + t('p_end') + ': ' + esc(B ? B.name : '?') + '</span></div>' + spans.map((s, i) => '<div class="kv"><span>' + t('p_span') + ' ' + (i + 1) + ' · ' + (s.medium === 'duct' ? 'Pipe' : s.medium === 'aerial' ? t('m_aerial') : t('m_free')) + '</span><b>' + FT.fmtLen(s.len) + '</b></div>').join('') + '<button class="btn full" id="pHl" style="margin:8px 0">' + t('p_hl') + '</button><div class="f"><label>' + t('p_follow') + '</label><div class="fc" style="max-height:64px;overflow:auto">' + Array.from({ length: Math.min(c.core, 144) }, (_, i) => '<span data-str="' + (i + 1) + '" class="fx-str" title="' + FT.fiberLabel(Math.floor(i / c.cpt) + 1, i % c.cpt + 1) + '"><i style="background:' + FT.FIBER_COLORS[i % 12].hex + '"></i>' + FT.fiberLabel(Math.floor(i / c.cpt) + 1, i % c.cpt + 1) + '</span>').join('') + '</div></div>') +
      field(t('p_name'), '<input data-p="name" value="' + esc(c.name) + '">') + '<div class="two">' + field(t('p_std'), sel('x', FT.CABLE_STD.map(s => [s, s]), c.std).replace('id="x"', 'data-p="std"')) + field(t('p_struct'), sel('x', FT.CABLE_STRUCT.map(s => [s, t('ct_' + s)]), c.struct).replace('id="x"', 'data-p="struct"')) + '</div><div class="two">' + field(t('p_tubes'), '<input data-p="tubes" data-n="1" value="' + c.tubes + '">') + field(t('p_cpt'), '<input data-p="cpt" data-n="1" value="' + c.cpt + '">') + '</div>' +
      field(t('p_cat'), sel('x', FT.CABLE_CAT.map(x => [x.id, x.name]), c.cat).replace('id="x"', 'data-p="cat"')) + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(c.note) + '</textarea>') + '<button class="btn bad full" id="pDel">' + t('p_delcable') + '</button>';
    bind(body, c, { cat: v => { const k = FT.CABLE_CAT.find(x => x.id === v); if (k) { c.std = k.std; c.struct = k.struct; c.tubes = k.tubes; c.cpt = k.core / k.tubes; c.core = k.core; } }, tubes: v => { c.core = c.tubes * c.cpt; }, cpt: v => { c.core = c.tubes * c.cpt; } });
    $('#pDel').onclick = () => T().deleteSelection(); $('#pHl').onclick = () => FT.map.setSelection('cable', c.id); if (FT.field) FT.field.attach(body, 'cable', c.id);
    body.querySelectorAll('[data-str]').forEach(b => b.onclick = () => FT.fui.openTrace({ strand: [c.id, +b.dataset.str] }));
  }
  function propBld(body, id) {
    const S = FT.state, o = S.bld[id] || {}, ring = FT.bedit.ringOf(id), f = (FT.map.bldFeats || []).find(x => x.properties.id === id), pr = f ? f.properties : {}, bs = T().bsel;
    if (bs && bs.size > 1) {
      body.innerHTML = head(bs.size + ' ' + t('bld_n')) + '<p class="d">' + t('b_multi_hint') + '</p><div style="display:grid;gap:8px"><button class="btn pri full" id="bMerge">' + t('merge_b') + '</button><button class="btn bad full" id="bDelAll">' + t('b_delete') + '</button></div>';
      $('#bMerge').onclick = () => FT.bedit.merge([...bs]); $('#bDelAll').onclick = () => T().deleteSelection(); $('#pRel').onclick = () => T().select(null); return;
    }
    const cap = FT.diagram.caption(id).map(x => '<div class="kv"><span>' + esc(x) + '</span></div>').join('');
    body.innerHTML = head(t('b_title') + (o.num ? ' · ' + esc(FT.num.label(o)) : ''), '<div class="kv"><span>' + t('b_height') + '</span><b>' + (FT.houses.floorsOf(o) * 3.2).toFixed(1) + ' m</b></div><div style="height:8px"></div>') +
      '<div id="bDiag">' + FT.diagram.bld(id) + '</div><div style="margin:6px 0 10px">' + cap + '</div>' +
      '<div class="two">' + field(t('b_num'), '<input id="bNum" value="' + (o.num || '') + '">') + field(t('num_prefix'), '<input id="bPfx" value="' + esc(o.pfx || '') + '">') + '</div>' + '<div class="two">' + field(t('b_floors'), '<input id="bFl" value="' + (o.floors || '') + '" placeholder="' + FT.houses.DEFAULT_FLOORS + '">') + field(FT.lang === 'ar' ? 'عدد الشقق' : 'Flats', '<input id="bFlats" value="' + (o.flats || '') + '" placeholder="' + (FT.lang === 'ar' ? 'مقدّر ' : 'est. ') + FT.houses.homesOf(o) + '">') + '</div>' + field(t('b_name'), '<input id="bNm" value="' + esc(o.name || '') + '">') +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px"><button class="btn pri" id="bSave">' + t('p_save') + '</button><button class="btn" id="bClr">' + t('b_clear') + '</button><button class="btn" id="bMove">📍 ' + t('house_move') + '</button>' + (ring && !o.house && !FT.map.hideBld ? '<button class="btn" id="bDraw">✏️ ' + (FT.bedit.editing === id ? (FT.lang === 'ar' ? 'إنهاء تعديل الرسم' : 'Done editing drawing') : (FT.lang === 'ar' ? 'تعديل رسم المبنى' : 'Edit building drawing')) + '</button>' : '') + '<button class="btn bad" id="bDel">' + t('b_delete') + '</button></div>' + (FT.bedit.editing === id ? '<p class="d">' + t('b_handles') + '</p>' : '');
    const num = v => parseInt(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10) || 0;
    $('#bSave').onclick = () => { FT.commit(); const b = FT.houses.pin(id); const n = num($('#bNum').value), fl = num($('#bFl').value), flats = num($('#bFlats').value); flats ? b.flats = Math.min(400, flats) : delete b.flats; n ? b.num = n : delete b.num; b.pfx = $('#bPfx').value; fl ? b.floors = fl : delete b.floors; b.name = $('#bNm').value; if (!b.ll) { const q = UI.housePos(id); if (q) b.ll = q.slice(); } FT.changed('bld'); UI.toast(t('toast_saved')); };
    $('#bMove').onclick = () => FT.T.pickHouseMove(id);
    if ($('#bDraw')) $('#bDraw').onclick = () => { FT.bedit.editing = FT.bedit.editing === id ? null : id; FT.bedit.refresh(); panelProps(body); };
    $('#bClr').onclick = () => { FT.num.clear(id); panelProps(body); }; $('#pRel').onclick = () => T().select(null); $('#bDel').onclick = () => T().deleteSelection();
  }
  UI.mode = () => mode;
  function panelAnalysis(body) {
    if (mode === 'pon') return FT.fui.ponPanel(body);
    const S = FT.state, rows = FT.report(null), cab = rows.filter(r => r.kind === 'cable').reduce((a, r) => a + r.len, 0), pip = rows.filter(r => r.kind === 'pipe').reduce((a, r) => a + r.len, 0);
    const nb = Object.values(S.bld).filter(b => b.num).length, subs = Object.keys(S.subs).length;
    let h = '<h3>' + t('an_summary') + '</h3><p class="d">' + t('an_hint') + '</p>' + [[t('nodes'), Object.keys(S.nodes).length], [t('pipes'), Object.keys(S.pipes).length + ' · ' + FT.fmtLenShort(pip)], [t('cables'), Object.keys(S.cables).length + ' · ' + FT.fmtLenShort(cab)], [t('splices'), Object.keys(S.splices).length], [t('buildings') + ' #', nb], ['SUB', subs]].map(([a, b]) => '<div class="kv"><span>' + a + '</span><b>' + b + '</b></div>').join('');
    h += '<div class="kv" style="margin-top:6px"><span><b>' + t('project_cost') + '</b></span><b style="color:var(--ok);font-size:15px">' + (FT.hasPrices() ? FT.money(FT.cost(null).total) : '—') + '</b></div>' + (FT.hasPrices() ? '' : '<p class="d">' + t('prices_not_set') + '</p>'); if (FT.plus) h += FT.plus.costHtml();
    h += (FT.field ? FT.field.summaryHtml() : '') + '<h3 style="margin-top:14px">' + t('an_budget') + '</h3>' + FT.spec.budgetHtml() + FT.spec.summaryHtml();
    const ar_ = FT.lang === 'ar';
    h = '<div style="display:grid;gap:6px;margin-bottom:10px"><button class="btn pri full" id="anHealth">🩺 ' + (ar_ ? 'فحص صحة الشبكة' : 'Network health check') + '</button><button class="btn pri full" id="anDr">' + (ar_ ? 'جداول التصميم واللحام والتحذيرات' : 'Design tables, splices and warnings') + '</button><button class="btn full" id="anAuto">' + (ar_ ? 'وصل تلقائي للمقسّمات غير الملحومة' : 'Auto-join the unfed splitters') + '</button><button class="btn full" id="anVals">' + (ar_ ? 'قيم حساب الإشارة' : 'Signal planning values') + '</button></div>' + h;
    body.innerHTML = h; const so = $('#socOpen'); if (so) so.onclick = () => FT.spec.open();
    $('#anDr').onclick = () => FT.designResults.open(); $('#anAuto').onclick = () => { FT.fui.autoAll(); }; $('#anHealth').onclick = () => FT.plus.openHealth(); $('#anVals').onclick = () => FT.fui.openAssumptions();
  }
  // optical budget for each subscriber, from the nearest OLT along the cable graph
  UI.shapeForAnalysis = function (tool, ring) { if (tool === 'plan') { const list = FT.map.buildingsInRing(ring), n = list.length, set = FT.houses.setting(); let flats = 0, boxes = 0, spl = 0; list.forEach(b => { const h = FT.houses.homesOf(b.o); flats += h; FT.design.boxesFor(h, 4, set.boxPorts).forEach(x => { boxes++; spl += x.nsplit; }); }); UI.modal(t('t_plan'), '<div class="kv"><span>' + t('buildings') + '</span><b>' + n + '</b></div><div class="kv"><span>' + (FT.lang === 'ar' ? 'الشقق (حسب المكتوب أو المقدّر)' : 'Flats (typed or estimated)') + '</span><b>' + flats + '</b></div><div class="kv"><span>km²</span><b>' + (FT.ringArea(ring) / 1e6).toFixed(3) + '</b></div><div class="kv"><span>≈ FDB (' + (FT.lang === 'ar' ? 'حسب الشقق' : 'from the flats') + ')</span><b>' + boxes + '</b></div><div class="kv"><span>≈ FDC (48)</span><b>' + Math.ceil(spl / 48) + '</b></div><div class="kv"><span>≈ ' + (FT.lang === 'ar' ? 'منافذ PON (مقسم 1:4 + 1:4 = 1:16)' : 'PON ports (1:4 + 1:4 = 1:16)') + '</span><b>' + Math.ceil(spl / 4) + '</b></div>', [{ label: t('close') }]); T().setTool('select'); } else { T().setTool('select'); FT.design.open(ring); } };

  // ---------------- dialogs ----------------
  UI.openSplice = nodeId => FT.fui.openSplice(nodeId); // many cables, splitters and PON ports per closure (js/fiberui.js)
  let areaRing = null, areaSet = null; // the last area drawn for a report (used for the map in the printed report)
  UI.reportArea = function () {
    UI.closeModal();
    T().startShape('poly', ring => { const m = T().collectIn(ring); if (!(m.nodes.size + m.pipes.size + m.cables.size)) { UI.toast(t('rp_area_empty')); return; } T().selectMulti(m); areaRing = ring; areaSet = m; UI.openReport(true); }, t('rp_area_hint'));
  };
  UI.openReport = function (selected) {
    let scope = selected && T().multi ? T().multi : null;
    const ringOf = () => scope && scope === areaSet ? areaRing : null;
    const draw = () => { const c = FT.cost(scope), badge = { cable: 'rp_cable', pipe: 'rp_pipe', node: 'rp_node', splitter: 'rp_node', splice: 'rp_splice', wdev: 'rp_node', labour: 'rp_pipe' };
      return '<div class="seg" id="rpScope" style="margin-bottom:10px"><button data-s="all" class="' + (!scope ? 'on' : '') + '">' + t('scope_all') + '</button><button data-s="sel" class="' + (scope ? 'on' : '') + '">' + t('scope_sel') + '</button><button data-s="area">⬠ ' + t('rp_area') + '</button></div>' +
        (scope ? '<p class="d" style="margin:0 0 8px">' + (scope.nodes.size + scope.pipes.size + scope.cables.size ? t('rp_scope_n') + ' ' + scope.nodes.size + ' · ' + scope.pipes.size + ' · ' + scope.cables.size : t('rp_area_how')) + '</p>' : '') +
        (FT.hasPrices() ? '' : '<div class="warnbox">' + t('prices_not_set') + '</div>') + '<table class="t"><tr><th>' + t('qty') + '</th><th></th>' + (FT.hasPrices() ? '<th>' + t('unit_price') + '</th><th>' + t('cost_total') + '</th>' : '') + '</tr>' + c.lines.map(r => '<tr><td style="direction:ltr;white-space:nowrap">' + (r.unit === 'm' ? FT.fmtLen(r.qty) : r.qty) + '</td><td><span class="badge">' + t(badge[r.kind] || 'rp_node') + '</span>' + esc(r.name) + '</td>' + (FT.hasPrices() ? '<td>' + FT.money(r.price) + (r.unit === 'm' ? ' /m' : '') + '</td><td><b>' + FT.money(r.total) + '</b></td>' : '') + '</tr>').join('') +
        (FT.hasPrices() ? '<tr><td colspan="3" style="text-align:end"><b>' + t('project_cost') + '</b></td><td><b style="color:var(--ok);font-size:16px">' + FT.money(c.total) + '</b></td></tr>' : '') + '</table>' + (c.lines.length ? '' : '<div class="empty">—</div>'); };
    UI.modal(t('report_title'), draw(), [{ label: t('prices_btn'), fn: () => UI.openPrices({ back: () => UI.openReport(!!scope) }), keep: true }, { label: t('rp_csv'), fn: () => FT.exp.reportCsv(scope), keep: true }, { label: t('rp_print'), cls: 'ok', fn: () => FT.rep.open(scope, ringOf()), keep: true }, { label: t('close') }], function wire(root) { root.querySelectorAll('#rpScope button').forEach(b => b.onclick = () => { if (b.dataset.s === 'area') return UI.reportArea(); scope = b.dataset.s === 'sel' ? (T().multi || { nodes: new Set(), pipes: new Set(), cables: new Set() }) : null; root.innerHTML = draw(); wire(root); }); });
  };
  UI.openIO = function () {
    UI.modal(t('io_title'), '<div class="seg"><button class="btn pri" id="ioSave">' + t('io_save') + '</button><button class="btn" id="ioLoad">' + t('io_load') + '</button><button class="btn" id="ioGeo">' + t('io_geo') + '</button><button class="btn" id="ioKmz">KMZ</button><button class="btn" id="ioGpkg">GeoPackage</button><button class="btn bad" id="ioReset">' + t('io_reset') + '</button><button class="btn" id="ioVers">🕘 ' + (FT.lang === 'ar' ? 'النسخ السابقة' : 'Earlier versions') + '</button><button class="btn" id="ioSurvey">' + (FT.lang === 'ar' ? 'قالب الشقق (CSV)' : 'Flats sheet (CSV)') + '</button><button class="btn" id="ioSurveyIn">' + (FT.lang === 'ar' ? '⬆ استيراد الشقق' : '⬆ Import flats') + '</button></div>' +
      '<div class="f" style="margin-top:14px"><label>' + t('io_import') + ' (KML · KMZ · GeoJSON · DXF)</label><div class="two"><select id="ioCrs"><option value="utm37">DXF: UTM 37N (WGS84)</option><option value="utm36">DXF: UTM 36N (WGS84)</option><option value="ll">DXF: lon / lat</option></select><button class="btn" id="ioImp">' + t('io_import') + '</button></div><input type="file" id="ioFile" accept=".json,.geojson,.kml,.kmz,.dxf" hidden></div><p class="d">' + t('io_dxf_note') + '</p>', [{ label: t('close') }], root => {
      root.querySelector('#ioSave').onclick = () => FT.exp.saveJson(); root.querySelector('#ioGeo').onclick = () => FT.exp.geojson(); root.querySelector('#ioKmz').onclick = () => FT.exp.kmz(); root.querySelector('#ioGpkg').onclick = () => FT.deliver.gpkg();
      root.querySelector('#ioVers').onclick = () => FT.versions.open();
      root.querySelector('#ioSurvey').onclick = () => FT.plus.downloadSurvey(); root.querySelector('#ioSurveyIn').onclick = () => FT.plus.pickSurvey();
      root.querySelector('#ioLoad').onclick = () => { root.querySelector('#ioFile').dataset.mode = 'project'; root.querySelector('#ioFile').click(); }; root.querySelector('#ioImp').onclick = () => { root.querySelector('#ioFile').dataset.mode = 'import'; root.querySelector('#ioFile').click(); };
      root.querySelector('#ioFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; e.target.value = ''; if ((await FT.imp.file(f, root.querySelector('#ioCrs').value)) !== 'asked') UI.closeModal(); };
      root.querySelector('#ioReset').onclick = async () => { if (await UI.confirmBox(t('io_confirm'), true)) { FT.commit(); FT.setState(Object.assign(FT.blank(), { meta: FT.state.meta })); UI.closeModal(); } };
    });
  };
  UI.helpBody = function () { // every shortcut, grouped
    return '<div class="sc">' + FT.keys.helpRows().map(([title, rows]) => '<section><h4>' + esc(title) + '</h4><table class="t">' + rows.map(([k, l]) => '<tr><td><kbd class="k">' + esc(k) + '</kbd></td><td>' + esc(l) + '</td></tr>').join('') + '</table></section>').join('') + '</div><p class="d">' + (FT.lang === 'ar' ? 'الاختصارات تعمل بلوحة المفاتيح العربية والإنكليزية. مرّر الماوس فوق أي زر ليظهر اختصاره.' : 'Shortcuts work with an Arabic or English layout. Hover any button to see its shortcut.') + '</p>';
  };
  UI.openHelp = () => FT.hub.open('tips'); // the ? and F1 keys go straight to the tips card
  UI.openProjects = async function (first) {
    const list = await FT.store.list(), types = [['gpon', 'GPON', 'ألياف (سلكي)'], ['wireless', 'Wireless', 'لاسلكي'], ['mixed', 'Mixed', 'مختلط']];
    const ic = { gpon: '🔌', wireless: '📡', mixed: '🔀' };
    const body = '<div class="d">' + t('choose_type') + '</div><div class="ptypes">' + types.map(([k]) => '<button class="ptype" data-new="' + k + '"><i>' + ic[k] + '</i><b>' + t('pk_' + k) + '</b><span>' + t('pk_' + k + '_d') + '</span></button>').join('') + '</div>' + (list.length ? '<div class="cap" style="margin-bottom:6px">' + t('recent') + '</div>' : '') +
      (list.length ? '<table class="t">' + list.sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(p => '<tr><td><a href="#" data-open="' + p.id + '" style="color:var(--hot2);font-weight:700">' + esc(p.name || 'Project') + '</a></td><td><span class="badge">' + esc((p.type || 'gpon').toUpperCase()) + '</span>' + (p.mode === 'view' ? '<span class="badge">VIEW</span>' : '') + (p.offline ? '<span class="badge">OFFLINE</span>' : '') + '</td><td style="direction:ltr;color:var(--mu)">' + (p.updated ? new Date(p.updated).toLocaleDateString('en-GB') : '') + '</td><td>' + (FT.store.cur && FT.store.cur.id !== p.id ? '<button class="btn" style="padding:2px 8px;font-size:11.5px" data-ovl="' + p.id + '" title="' + (FT.lang === 'ar' ? 'اعرضه فوق المشروع المفتوح (للقراءة)' : 'Show on top of the open project (read only)') + '">' + (FT.lang === 'ar' ? 'كطبقة' : 'As layer') + '</button> ' : '') + '<button class="ib sm" data-ren="' + p.id + '">✎</button><button class="ib sm" data-del="' + p.id + '">🗑</button></td></tr>').join('') + '</table>' : '<p class="d">—</p>') +
      '<div class="f" style="margin-top:14px"><label>' + t('open_by_link') + '</label><div style="display:flex;gap:6px"><input id="prLink" placeholder="https://…?p=…&k=…"><button class="btn" id="prGo">' + t('open') + '</button></div></div>';
    UI.modal(t('projects'), body, first ? [] : [{ label: t('close') }], root => {
      root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => UI.openPrices({ start: true, name: 'Homs ' + (list.length + 1), type: b.dataset.new }));
      root.querySelectorAll('[data-open]').forEach(a => a.onclick = async e => { e.preventDefault(); if (await FT.store.open(a.dataset.open)) { UI.closeModal(); UI.afterProject(); } else UI.toast('Cannot open this project'); });
      root.querySelectorAll('[data-ovl]').forEach(b => b.onclick = () => FT.extras.overlay(list.find(x => x.id === b.dataset.ovl)));
      root.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => { const n = await UI.ask(t('rename'), (list.find(x => x.id === b.dataset.ren) || {}).name || ''); if (!n) return; if (!FT.store.cur || FT.store.cur.id !== b.dataset.ren) await FT.store.open(b.dataset.ren); FT.store.rename(n); UI.closeModal(); UI.afterProject(); UI.openProjects(); });
      root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!(await UI.confirmBox(t('delete_q'), true))) return; await FT.store.remove(b.dataset.del); UI.closeModal(); UI.openProjects(!FT.store.cur); });
      root.querySelector('#prGo').onclick = async () => { try { const u = new URL(root.querySelector('#prLink').value.trim()), id = u.searchParams.get('p'), k = u.searchParams.get('k'); if (id && k && await FT.store.open(id, k)) { UI.closeModal(); UI.afterProject(); } else UI.toast('Invalid link'); } catch (e) { UI.toast('Invalid link'); } };
    });
    if (first) $('#modal').onmousedown = null;
  };
  UI.priceBtn = () => { const b = $('#bPrices'); if (b) b.textContent = FT.CURRENCIES[FT.cur()].sym + ' ' + t('prices_btn'); };
  FT.onChange && FT.onChange(why => { if (why === 'load' || why === 'prices' || why === 'undo' || why === 'redo' || why === 'remote-net' || why === 'remote') UI.priceBtn(); });
  UI.openPrices = function (o) {
    o = o || {}; const P = FT.prices(), ar = FT.lang === 'ar', wl = (o.type || (FT.state.meta && FT.state.meta.type)) !== 'gpon', fb = (o.type || (FT.state.meta && FT.state.meta.type)) !== 'wireless';
    const row = (path, label, val) => '<tr><td class="n">' + esc(label) + '</td><td><input data-price="' + path + '" type="text" inputmode="decimal" value="' + val + '"></td></tr>';
    const sec = (title, rows) => '<h4>' + esc(title) + '</h4><table class="t ptable">' + rows + '</table>';
    // a new project starts from the built-in prices in the chosen currency, not from the project that happens to be open
    let cur = o.start ? 'USD' : FT.cur(); const rates = o.start ? { EUR: FT.CURRENCIES.EUR.rate, SAR: FT.CURRENCIES.SAR.rate } : { EUR: FT.rate('EUR'), SAR: FT.rate('SAR') };
    if (o.start) { const D = FT.DEFAULT_PRICES; Object.keys(D).forEach(k => P[k] = typeof D[k] === 'object' ? Object.assign({}, D[k]) : D[k]); }
    let h = (o.start ? '<div class="f"><label>' + t('proj_name') + '</label><input id="prName" value="' + esc(o.name) + '"></div>' : '') +
      '<div class="two"><div class="f"><label>' + (ar ? 'العملة' : 'Currency') + '</label><div class="seg" id="prCur">' + Object.values(FT.CURRENCIES).map(c => '<button type="button" data-cur="' + c.code + '" class="' + (c.code === cur ? 'on' : '') + '">' + (ar ? c.ar : c.en) + '</button>').join('') + '</div></div>' +
      '<div class="f" id="prRateBox"><label id="prRateLab"></label><input id="prRate" type="text" inputmode="decimal" style="direction:ltr"></div></div><p class="d" id="prRateNote"></p>' +
      '<p class="d">' + t('price_hint') + '</p>';
    if (fb) {
      h += sec(t('cat_cables'), FT.CABLE_CAT.map(c => row('cable.' + c.id, c.name.split(' loose')[0].split(' G.')[0], P.cable[c.id])).join(''));
      h += sec(t('cat_pipes'), FT.PIPE_CAT.map(c => row('pipe.' + c.id, c.name, P.pipe[c.id])).join(''));
      h += sec(t('cat_nodes'), Object.keys(FT.NODE_TYPES).map(k => row('node.' + k, FT.nodeTypeName(k), P.node[k])).join(''));
      h += sec(t('cat_splitters'), FT.RATIOS.filter(Boolean).map(r => row('splitter.' + r, 'Splitter ' + r, P.splitter[r])).join(''));
      h += sec(t('cat_splice'), row('splice', 'Splice closure IP68', P.splice));
    }
    if (wl) h += sec(t('cat_wireless'), [['ap', 'AP (sector)'], ['cpe', 'CPE'], ['ptp', 'PTP radio']].map(([k, l]) => row('wdev.' + k, l, P.wdev[k])).join(''));
    h += sec(t('cat_labour'), row('labour.pipe_m', ar ? 'تركيب الأنابيب' : 'Pipe installation', P.labour.pipe_m) + row('labour.cable_m', ar ? 'تركيب الكبلات' : 'Cable installation', P.labour.cable_m));
    UI.modal((o.start ? t('new_project') + ' — ' : '') + t('prices_title'), h, [o.start ? { label: t('close'), fn: () => UI.openProjects(!FT.store.cur) } : { label: t('close') }].concat(o.start ? [{ label: t('skip_prices'), fn: async () => { await FT.store.create(($('#prName') && $('#prName').value.trim()) || o.name, o.type); if (cur !== 'USD') { FT.setMoney(cur, rates); FT.changed('prices'); await FT.store.saveNow(); } UI.afterProject(); } }] : []).concat([{ label: o.start ? t('start_project') : t('save_prices'), cls: 'pri', fn: async () => {
      const num = v => { v = parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')); return isNaN(v) || v < 0 ? 0 : v; }, out = {};
      $$('[data-price]').forEach(i => { const path = i.dataset.price.split('.'); if (path.length === 1) out[path[0]] = num(i.value); else { (out[path[0]] = out[path[0]] || {})[path[1]] = num(i.value); } });
      const old = o.start ? {} : (FT.priceBook() || {}), merged = Object.assign({}, old, out); Object.keys(out).forEach(k => { if (typeof out[k] === 'object') merged[k] = Object.assign({}, old[k] || {}, out[k]); });
      if (o.start) { await FT.store.create(($('#prName') && $('#prName').value.trim()) || o.name, o.type); FT.setMoney(cur, rates, merged); FT.changed('prices'); await FT.store.saveNow(); UI.afterProject(); } else { FT.commit(); FT.setMoney(cur, rates, merged); FT.changed('prices'); UI.toast(t('toast_saved')); if (o.back) setTimeout(o.back, 0); }
    } }]), function wire(root) {
      const rateOf = c => c === 'USD' ? 1 : rates[c];
      const scale = k => root.querySelectorAll('[data-price]').forEach(i => { const v = parseFloat(i.value); if (!isNaN(v)) i.value = Math.round(v * k * 10000) / 10000; });
      const show = () => { const box = root.querySelector('#prRateBox'), note = root.querySelector('#prRateNote'); box.style.visibility = cur === 'USD' ? 'hidden' : ''; root.querySelector('#prRateLab').textContent = cur === 'USD' ? '' : (ar ? '1 دولار = كم ' + FT.CURRENCIES[cur].ar : '1 USD = ? ' + cur); if (cur !== 'USD') root.querySelector('#prRate').value = rates[cur]; note.textContent = cur === 'EUR' ? (ar ? 'سعر اليورو تقريبي ويتغيّر: عدّله حسب سعر اليوم.' : 'The euro rate is approximate and moves: set today\'s rate.') : cur === 'SAR' ? (ar ? 'الريال السعودي مثبّت على 3.75 للدولار.' : 'The Saudi riyal is pegged at 3.75 per dollar.') : ''; };
      root.querySelectorAll('#prCur button').forEach(b => b.onclick = () => { const next = b.dataset.cur; if (next === cur) return; scale(rateOf(next) / rateOf(cur)); cur = next; root.querySelectorAll('#prCur button').forEach(x => x.classList.toggle('on', x === b)); show(); });
      root.querySelector('#prRate').onchange = e => { const v = parseFloat(String(e.target.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')); if (cur !== 'USD' && v > 0) { scale(v / rates[cur]); rates[cur] = v; } show(); };
      show();
    });
  };
  // a project that exists only in this browser: say it clearly and offer to upload it
  UI.openUpload = function () {
    const ar = FT.lang === 'ar', say = (a, e) => ar ? a : e;
    const body = '<div class="warnbox">' + say('هذا المشروع محفوظ على هذا المتصفح فقط وغير موجود على السيرفر. إذا مُسحت بيانات المتصفح يضيع، ولا يمكن مشاركته مع الفريق.', 'This project is saved in this browser only, not on the server. Clearing the browser data loses it, and it cannot be shared with a team.') + '</div><p class="d">' + say('الرفع ينسخه إلى السحابة، ويتأكد أنه وصل كاملاً قبل أن يلمس النسخة الموجودة هنا. بعدها يصير له رابط مشاركة ويظهر قسم المستخدمين. أغلق أي تبويب آخر مفتوح على المخطط قبل الرفع.', 'Uploading copies it to the cloud and checks that it arrived complete before touching the copy here. It then gets share links and the Users section. Close other planner tabs first.') + '</p><p class="d" id="upMsg"></p>';
    UI.modal(say('رفع المشروع للسحابة', 'Upload to the cloud'), body, [{ label: t('close') }, { label: '⬆ ' + say('ارفع المشروع للسحابة', 'Upload this project'), cls: 'pri', id: 'upGo', keep: true, fn: async () => {
      const btn = $('#upGo'), msg = $('#upMsg'); btn.disabled = true; msg.textContent = say('عم يرفع ويتأكد…', 'Uploading and checking…');
      const r = await FT.store.upload();
      if (r.ok) { UI.closeModal(); UI.afterProject(); UI.toast(say('انرفع المشروع، وصار فيك تشاركه', 'Uploaded. You can share it now')); UI.openShare(); return; }
      btn.disabled = false; msg.style.color = 'var(--bad)';
      msg.textContent = r.why === 'big' ? say('المشروع أكبر من حد الرفع الحالي (8 ميغا). النسخة المحلية لم تتغير.', 'The project is above the current upload limit (8 MB). Your local copy is unchanged.') : r.why === 'verify' ? say('النسخة على السيرفر غير مطابقة، فلم أغير شيئاً هنا. جرّب مرة ثانية.', 'The server copy did not match, so nothing here was changed. Try again.') : say('ما قدرت أوصل للسيرفر. النسخة المحلية لم تتغير. تأكد من الإنترنت وجرّب مرة ثانية.', 'Could not reach the server. Your local copy is unchanged. Check the connection and try again.');
    } }]);
  };
  UI.localBadge = function () { // always visible while the open project is local only
    let b = $('#bLocal'); const share = $('#bShare'); if (!share) return;
    if (!b) { b = document.createElement('button'); b.id = 'bLocal'; b.className = 'pill'; share.parentNode.insertBefore(b, share); b.onclick = () => UI.openUpload(); }
    b.style.display = FT.store.isLocal() ? '' : 'none'; b.textContent = '⚠ ' + (FT.lang === 'ar' ? 'محلي فقط · ارفعه' : 'Local only · upload');
  };
  UI.openShare = function () {
    const L = FT.store.links(); if (!L) { if (FT.store.isLocal()) UI.openUpload(); else UI.toast(FT.lang === 'ar' ? 'افتح مشروعاً أولاً' : 'Open a project first'); return; }
    const row = (lab, url, hint) => '<div class="f"><label>' + lab + '</label><div style="display:flex;gap:6px"><input readonly value="' + esc(url) + '" style="direction:ltr"><button class="btn" data-copy="' + esc(url) + '">' + t('copy') + '</button></div><div class="d" style="margin-top:4px">' + hint + '</div></div>';
    UI.modal(t('share'), row(t('link_view'), L.view || '—', t('link_view_d')) + row(t('link_edit'), L.edit, t('link_edit_d')), [{ label: t('close') }], root => root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy).then(() => UI.toast(t('copied'))); }));
  };
  UI.afterProject = function () {
    document.body.classList.remove('nop'); document.body.classList.toggle('ro', FT.store.mode === 'view'); setTimeout(() => FT.map.map.resize(), 50);
    if (FT.store.mode === 'view') UI.toast(FT.lang === 'ar' ? 'وضع العرض فقط' : 'View-only mode');
    const type = (FT.state.meta && FT.state.meta.type) || (FT.store.cur && FT.store.cur.type) || 'gpon';
    $('#projTitle').textContent = (FT.state.meta.name || (FT.store.cur && FT.store.cur.name) || '—');
    mode = 'infra'; UI.localBadge(); if (FT.cloud) FT.cloud.button(); UI.buildTabs(type); UI.buildToolbar(); UI.refreshTree(); UI.renderPanel(); FT.map.renderNet(); UI.applyHidden(); UI.fitAll();
  };
  UI.buildTabs = function (type) {
    const tabs = [['infra', t('tab_infra'), type !== 'wireless'], ['wireless', FT.lang === 'ar' ? 'لاسلكي' : 'Wireless', type !== 'gpon'], ['pon', t('tab_pon'), type !== 'wireless']].filter(x => x[2]);
    const el = $('#modeTabs'); el.innerHTML = tabs.map(([k, l]) => '<button data-mode="' + k + '" class="' + (mode === k ? 'on' : '') + '">' + esc(l) + '</button>').join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { mode = b.dataset.mode; T().setTool('select'); UI.buildTabs(type); UI.buildToolbar(); if (mode === 'pon') UI.tab('analysis'); });
  };

  // ---------------- commands ----------------
  function wireSearch() {
    const cmd = $('#cmd'); cmd.onkeydown = e => { if (e.key !== 'Enter') return; const v = cmd.value.trim(); cmd.value = ''; cmd.blur(); FT.extras.run(v); };
  }

  // ---------------- static wiring / boot ----------------
  UI.applyLang = function () {
    UI.themeButtons(); document.documentElement.lang = FT.lang; $('#brand').title = t('projects'); $('#layersTitle').textContent = t('layers'); $('#lsearch').placeholder = t('layers_search');
    $('#bUndo').title = t('undo'); $('#bRedo').title = t('redo'); $('#bLang').textContent = FT.lang === 'ar' ? 'EN' : 'عربي'; $('#bShare').textContent = t('share'); UI.priceBtn(); if (FT.auth) FT.auth.paint(); else $('#bUser').textContent = t('signin');
    $('#bNewFolder').title = t('new_folder'); $('#bCollapse').title = t('collapse'); $('#bLockAll').title = t('lock_all');
    $$('.tabs button[data-tab]').forEach(b => b.textContent = t('tab_' + (b.dataset.tab === 'tool' ? 'tool' : b.dataset.tab === 'props' ? 'props' : 'analysis')));
    $('#basemap .cap').textContent = t('basemap'); $('#basemap .bm').innerHTML = [['map', 'b_map'], ['3d', 'b_3d'], ['sat', 'b_sat']].map(([k, l]) => '<button data-b="' + k + '" class="' + ((FT.map.base || 'map') === k ? 'on' : '') + '">' + t(l) + '</button>').join(''); $('#basemap .bm').innerHTML += '<button id="bHideNet" class="' + (FT.map.netHidden ? 'on' : '') + '" title="' + t('b_hidenet') + '">👁 ' + t('b_hidenet') + '</button><button id="bHideHouses" class="' + (FT.map.hideHouses ? 'on' : '') + '" title="' + t('b_hidehouses') + '">👁 ' + t('b_hidehouses') + '</button>'; { $('#basemap .bm').innerHTML += '<button id="bHideBld" class="' + (FT.map.hideBld ? 'on' : '') + '" title="' + t('b_hide') + '">👁 ' + t('b_hide') + '</button>'; $('#bHideBld').onclick = () => { FT.map.setBldHidden(!FT.map.hideBld); UI.applyLang(); }; }
    $$('#basemap [data-b]').forEach(b => b.onclick = () => { FT.map.setBase(b.dataset.b); UI.applyLang(); });
    $('#bHideNet').onclick = () => { FT.map.setNetHidden(!FT.map.netHidden); UI.applyLang(); };
    $('#bHideHouses').onclick = () => { FT.map.setHousesHidden(!FT.map.hideHouses); UI.applyLang(); };
    if (FT.field) { const bb = document.createElement('button'); bb.id = 'bBuild'; bb.className = FT.field.overlay ? 'on' : ''; bb.textContent = '🚧 ' + (FT.lang === 'ar' ? 'حالة التنفيذ' : 'Build state'); bb.title = bb.textContent; $('#basemap .bm').appendChild(bb); bb.onclick = () => FT.field.toggleOverlay(); }
    UI.drawChips();
    $('#cmd').placeholder = '> help · goto lat lon'; $('#bCross').title = t('st_cross'); $('#bNames').title = t('st_names'); $('#bLay').title = t('st_layers'); $('#bPan').title = t('st_panel');
    if (FT.map.ready) { UI.buildToolbar(); UI.refreshTree(); UI.renderPanel(); }
  };
  FT.boot = async function () {
    if (window.__PHONE) return;
    document.body.classList.add('nop'); UI.applyLang(); await FT.map.init('map'); FT.T.init(); UI.applyLang();
    $('#brand').onclick = () => UI.openProjects(); $('#projName').onclick = () => UI.openProjects();
    $('#bUndo').onclick = () => FT.undo(); $('#bRedo').onclick = () => FT.redo(); $('#bLang').onclick = () => { FT.setLang(FT.lang === 'ar' ? 'en' : 'ar'); UI.applyLang(); UI.buildTabs((FT.state.meta && FT.state.meta.type) || 'gpon'); UI.buildToolbar(); };
    $('#bShare').onclick = UI.openShare; $('#bPrices').onclick = () => UI.openPrices(); $('#bUser').onclick = () => FT.auth.open();
    $('#showLeft').onclick = UI.toggleLeft; $('#showRight').onclick = UI.toggleRight; $('#bLayersX').onclick = UI.toggleLeft; $('#bRightX').onclick = UI.toggleRight; $('#bLay').onclick = UI.toggleLeft; $('#bPan').onclick = UI.toggleRight;
    $('#bNewFolder').onclick = UI.newFolder; $('#bCollapse').onclick = () => { collapsed = collapsed.has('root') ? new Set() : new Set(['root', ...NODE_ORDER.map(x => 'nodes:' + x), 'pipes', 'cables', 'splices', 'imports', ...Object.keys(FT.state.folders || {})]); UI.refreshTree(); };
    $('#bLockAll').onclick = () => { Object.keys(FT.state.nodes).forEach(i => T().locked.add(i)); UI.refreshTree(); };
    $('#lsearch').oninput = e => { treeQuery = e.target.value; UI.refreshTree(); };
    $('#bCross').onclick = () => { const c = $('#cross'); c.style.display = c.style.display === 'block' ? 'none' : 'block'; $('#bCross').classList.toggle('on'); };
    $('#cross').innerHTML = '<i class="v"></i><i class="h"></i>'; $('#mapwrap').addEventListener('mousemove', e => { const r = $('#mapwrap').getBoundingClientRect(), v = $('#cross .v'), h = $('#cross .h'); v.style.left = (e.clientX - r.left) + 'px'; h.style.top = (e.clientY - r.top) + 'px'; });
    $('#bNames').onclick = () => { names = !names; $('#bNames').classList.toggle('on', names); FT.map.map.setLayoutProperty('nodes', 'text-field', names ? ['coalesce', ['get', 'lab'], ['get', 'name']] : ['step', ['zoom'], '', 15.5, ['coalesce', ['get', 'lab'], ['get', 'name']]]); };
    $$('.tabs button[data-tab]').forEach(b => b.onclick = () => UI.tab(b.dataset.tab));
    wireSearch(); FT.map.map.on('moveend', () => FT.imp && FT.imp.renderHandles()); FT.onChange(why => { if (FT.bedit) FT.bedit.refresh(); if (why !== 'move') UI.refreshTreeSoon(); UI.renderPanelKeep(); $('#bUndo').disabled = !FT.canUndo(); $('#bRedo').disabled = !FT.canRedo(); });
    $('#bUndo').disabled = true; $('#bRedo').disabled = true; UI.tab('tool');
    if (FT.versions) FT.versions.hook();
    if (FT.train && FT.train.on) { await FT.train.start(); return; } // ?train=1: the sealed training project, no real project is opened
    if (await FT.store.openFromUrl()) UI.afterProject(); else { const last = localStorage.getItem('ft2_last'); if (last && await FT.store.open(last)) UI.afterProject(); else UI.openProjects(true); }
    if (window.__FIELD && FT.field) FT.field.start();
  };
  UI.renderPanelKeep = function () { if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#rbody').contains(document.activeElement)) return; UI.renderPanel(); };
})(window);
