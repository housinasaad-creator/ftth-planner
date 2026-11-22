/* UI shell: header/toolbar, layer tree, right panel, dialogs, status bar. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const UI = FT.UI = {};
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const t = k => FT.t(k), T = () => FT.T;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  let mode = 'infra', rtab = 'tool', chipFilter = 'all', treeQuery = '', collapsed = new Set(), names = false;
  const O = UI.opt = { ratio: { sk: '', dk: '', bk: '' }, pipeCat: 'h40', cableCat: 'bb144', medium: 'free', floors: 4 };

  // ---------------- icons (own drawings) ----------------
  const SV = p => '<svg viewBox="0 0 24 24">' + p + '</svg>';
  const IC = {
    select: SV('<path d="M5 3l14 8-6 2-3 6z"/>'), area: SV('<path d="M4 8l6-4 9 3 1 8-8 5-7-6z" stroke-dasharray="3 2"/>'), measure: SV('<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
    mh: SV('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'), pole: SV('<path d="M12 3v18M6 7h12M8 11h8"/>'),
    splice: SV('<circle cx="12" cy="12" r="8"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>'), pipe: SV('<path d="M3 9h18M3 15h18"/><path d="M6 9v6M18 9v6"/>'), cable: SV('<path d="M3 17c4-10 8 4 12-6s4-5 6-5"/>'),
    route: SV('<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7 17c6-1 2-9 10-10"/>'), reconnect: SV('<path d="M9 15l-3 3a3 3 0 004 4l3-3M15 9l3-3a3 3 0 00-4-4l-3 3M9 15l6-6"/>'),
    design: SV('<path d="M4 20L16 8M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM19 14l.6 1.6L21 16l-1.4.6L19 18l-.6-1.4L17 16l1.4-.4z"/>'), sub: SV('<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M17 5v6M14 8h6"/>'), plan: SV('<path d="M4 18l4-12 8 4 4 8z"/><circle cx="12" cy="13" r="2"/>'),
    report: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>'), kmz: SV('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'), import: SV('<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>'),
    dxf: SV('<path d="M4 20V4h16"/><path d="M4 20L20 4M8 20h.01M20 8h.01"/>'), number: SV('<path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17"/>'), bdraw: SV('<path d="M4 20V10l8-6 8 6v10z"/><path d="M10 20v-6h4v6"/>'), floors: SV('<path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>'),
    wdev: SV('<path d="M12 12v9M8 21h8"/><circle cx="12" cy="10" r="2"/><path d="M7 6a7 7 0 000 8M17 6a7 7 0 010 8M4.5 4a11 11 0 000 12M19.5 4a11 11 0 010 12"/>'), wlink: SV('<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M8 12h8" stroke-dasharray="2 2"/>'),
  };
  const nodeImg = k => '<img src="' + FT.map.iconDataURL(k, 40) + '">';
  function toolDefs() {
    const D = (id, ic, key) => ({ id, ic, key, l: t('t_' + id), d: t('t_' + id + '_d') });
    const infra = [
      { g: 'g_select', items: [D('select', IC.select, 'V'), D('area', IC.area, 'L'), D('measure', IC.measure, 'U')] },
      { g: 'g_point', items: [D('mh', IC.mh, 'M'), D('pole', IC.pole, 'D'), D('sk', nodeImg('sk'), '1'), D('dk', nodeImg('dk'), '2'), D('bk', nodeImg('bk'), '3'), D('olt', nodeImg('olt'), 'O'), D('splice', IC.splice, 'E')] },
      { g: 'g_line', items: [D('pipe', IC.pipe, 'B'), D('cable', IC.cable, 'K'), D('route', IC.route, 'G')] },
      { g: 'g_edit', items: [D('reconnect', IC.reconnect, 'R')] },
      { g: 'g_build', items: [D('number', IC.number, 'N'), D('bdraw', IC.bdraw, ''), D('floors', IC.floors, '')] },
      { g: 'g_analysis', items: [D('design', IC.design, ''), D('sub', IC.sub, ''), D('plan', IC.plan, '')] },
      { g: 'g_output', items: [{ id: 'report', ic: IC.report, l: t('t_report'), d: t('t_report_d'), act: () => UI.openReport() }, { id: 'kmz', ic: IC.kmz, l: t('t_kmz'), d: t('t_kmz_d'), act: () => FT.exp.kmz() }, { id: 'import', ic: IC.import, l: t('t_import'), d: t('t_import_d'), act: () => UI.openIO() }, { id: 'dxf', ic: IC.dxf, l: t('t_dxf'), d: t('t_dxf_d'), act: () => { FT.exp.area = { mode: null, ring: null }; FT.exp.openDxf(); } }] },
    ];
    if (mode === 'wireless') return [infra[0], { g: 'g_point', items: [D('wdev', IC.wdev, 'W'), D('wlink', IC.wlink, 'Q')] }, infra[6]];
    if (mode === 'pon') return [infra[0], infra[5], infra[6]];
    return infra;
  }
  UI.buildToolbar = function () {
    const tb = $('#toolbar'); tb.innerHTML = '';
    toolDefs().forEach(g => {
      const el = document.createElement('div'); el.className = 'grp'; el.innerHTML = '<div class="row"></div><div class="gl">' + esc(t(g.g)) + '</div>';
      g.items.forEach(it => { const b = document.createElement('button'); b.className = 'tb'; b.dataset.id = it.id; b.title = it.l + (it.key ? ' · ' + it.key : '') + ' — ' + it.d; b.innerHTML = it.ic + '<span>' + esc(it.l) + '</span>' + (it.key ? '<kbd>' + it.key + '</kbd>' : ''); b.onclick = () => it.act ? it.act() : T().setTool(it.id); el.firstChild.appendChild(b); });
      tb.appendChild(el);
    });
    UI.toolChanged();
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
  UI.modal = function (title, body, btns, wire) {
    const m = $('#modal'); m.innerHTML = '<div class="dlg"><div class="dh"><span>' + esc(title) + '</span><button class="ib" id="mX">✕</button></div><div class="db">' + body + '</div><div class="df"></div></div>'; m.classList.add('on');
    const df = m.querySelector('.df'); (btns || []).forEach(b => { const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label; if (b.id) e.id = b.id; e.onclick = async () => { if (b.fn) await b.fn(m); if (!b.keep) UI.closeModal(); }; df.appendChild(e); });
    m.querySelector('#mX').onclick = UI.closeModal; m.onmousedown = e => { if (e.target === m) UI.closeModal(); }; if (wire) wire(m.querySelector('.db'));
  };
  UI.closeModal = () => { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; };
  UI.closeCtx = () => { $('#ctx').style.display = 'none'; };
  UI.ctxMenu = function (x, y, h, p) {
    const c = $('#ctx'), items = [];
    if (h) { items.push([t('menu_props'), () => { UI.tab('props'); }], [t('menu_zoom'), UI.zoomSel], [t('menu_hide'), UI.hideSel]); if (h.kind === 'node') items.push([t('menu_splice'), () => UI.openSplice(h.id, true)]); items.push([t('menu_delete'), () => T().deleteSelection()]); }
    items.push([t('menu_copy'), () => navigator.clipboard && navigator.clipboard.writeText(p[1].toFixed(6) + ', ' + p[0].toFixed(6))]);
    c.innerHTML = ''; items.forEach(([l, f]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = () => { UI.closeCtx(); f(); }; c.appendChild(b); });
    c.style.display = 'block'; c.style.left = Math.min(x, innerWidth - 190) + 'px'; c.style.top = Math.min(y, innerHeight - 40 * items.length) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!c.contains(e.target)) { UI.closeCtx(); document.removeEventListener('mousedown', f); } }), 0);
  };
  UI.toggleLeft = () => { const l = $('#left'); l.style.display = l.style.display === 'none' ? '' : 'none'; setTimeout(() => FT.map.map.resize(), 50); };
  UI.toggleRight = () => { $('#right').classList.toggle('hide'); };
  UI.fitAll = function () { const pts = []; Object.values(FT.state.nodes).forEach(n => pts.push(n.ll)); Object.values(FT.state.pipes).forEach(p => p.pts.forEach(q => pts.push(q))); if (pts.length > 1) FT.map.fitBBox(FT.bboxOf(pts)); else if (pts.length === 1) FT.map.flyTo(pts[0], 17); else FT.map.flyTo([36.7137, 34.7324], 14.5); };
  UI.zoomSel = function () { const s = T().sel, S = FT.state; if (!s) return; if (s.kind === 'node' && S.nodes[s.id]) FT.map.flyTo(S.nodes[s.id].ll, 18.5); else if (s.kind === 'pipe' && S.pipes[s.id]) FT.map.fitBBox(FT.bboxOf(S.pipes[s.id].pts)); else if (s.kind === 'cable' && S.cables[s.id]) FT.map.fitBBox(FT.bboxOf([].concat(...FT.cableSpans(S.cables[s.id]).map(x => x.pts)))); else if (s.kind === 'bld') { const r = FT.map.buildingRing(s.id) || (S.bld[s.id] && S.bld[s.id].fp); if (r) FT.map.flyTo(FT.centroid(r), 19); } };
  UI.hideSel = function () { const s = T().sel; if (!s) return; T().hidden.add(s.id); UI.applyHidden(); UI.refreshTree(); };
  UI.applyHidden = function () {
    const ids = [...T().hidden], f = ids.length ? ['!', ['in', ['get', 'id'], ['literal', ids]]] : null, map = FT.map.map;
    ['nodes', 'pipes', 'cables'].forEach(l => map.setFilter(l, f));
  };

  // ---------------- layer tree ----------------
  const ROW_ICON = { node: n => '<img class="ico" src="' + FT.map.iconDataURL(n.type, 36) + '">', pipe: p => '<span class="dot" style="background:' + (p.color || '#2aa8ff') + '"></span>', cable: c => '<span class="dot" style="background:' + (c.color || ((FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group === 'Drop' ? '#d4ff4a' : (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group === 'Distribution' ? '#35e0c9' : '#b57bff')) + '"></span>', splice: () => '<img class="ico" src="' + FT.map.iconDataURL('splice', 36) + '">' };
  UI.refreshTree = function () {
    const S = FT.state, el = $('#tree'), q = treeQuery.toLowerCase(), sel = T().sel;
    const match = (name, type) => (!q || (name + ' ' + type).toLowerCase().includes(q));
    const chipOK = k => chipFilter === 'all' || chipFilter === k || (chipFilter === 'box' && k === 'node-box');
    const lst = { nodes: Object.values(S.nodes).filter(n => match(n.name + ' ' + n.label, n.type) && (chipFilter === 'all' || (chipFilter === 'olt' && n.type === 'olt') || (chipFilter === 'box' && ['sk', 'dk', 'bk'].includes(n.type)))), pipes: Object.values(S.pipes).filter(p => match(p.name, 'pipe') && chipOK('pipe')), cables: Object.values(S.cables).filter(c => match(c.name, 'cable') && chipOK('cable')), splices: Object.values(S.splices).filter(s => match(s.label || 'splice', 'splice') && chipOK('splice')) };
    const total = Object.keys(S.nodes).length + Object.keys(S.pipes).length + Object.keys(S.cables).length + Object.keys(S.splices).length;
    if (!total && !Object.keys(S.imports || {}).length) { el.innerHTML = '<div class="empty">' + t('no_layers') + '</div>'; return; }
    const fmap = S.fmap || {}, inFolder = key => fmap[key];
    const row = (kind, o, key) => { const lock = T().locked.has(o.id), hid = T().hidden.has(o.id); const nm = o.name || (kind === 'splice' ? 'EK · ' + ((FT.state.nodes[o.node] || {}).name || '') + (o.label ? ' · ' + o.label : '') : o.label || kind);
      return '<div class="tr' + (sel && sel.id === o.id ? ' sel' : '') + '" draggable="true" data-key="' + key + '" data-k="' + kind + '" data-id="' + o.id + '" style="padding-inline-start:' + (fmap[key] ? 30 : 30) + 'px"><input type="checkbox" ' + (hid ? '' : 'checked') + ' data-vis="' + o.id + '">' + ROW_ICON[kind](o) + '<span class="nm">' + esc(nm) + '</span><span class="acts"><button data-act="lock" title="' + t('layer_lock') + '">' + (lock ? '🔒' : '🔓') + '</button><button data-act="del" title="' + t('layer_del') + '">🗑</button><button data-act="more" title="' + t('layer_actions') + '">⋯</button></span></div>'; };
    const grp = (id, title, items, kind, prefixKey) => { const open = !collapsed.has(id), its = items.filter(o => !inFolder(prefixKey + o.id)); if (!items.length) return ''; return '<div class="tr fold" data-fold="' + id + '"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">' + esc(title) + '</span><span class="ct">' + its.length + '</span></div>' + (open ? its.map(o => row(kind, o, prefixKey + o.id)).join('') : ''); };
    let h = '<div class="tr fold" data-fold="root"><span class="tw">' + (collapsed.has('root') ? '▸' : '▾') + '</span><span class="nm">' + t('physical') + '</span></div>';
    if (!collapsed.has('root')) {
      // user folders first
      Object.entries(S.folders || {}).forEach(([fid, f]) => { const open = !collapsed.has(fid); const items = []; lst.nodes.forEach(o => fmap['n:' + o.id] === fid && items.push(['node', o, 'n:' + o.id])); lst.pipes.forEach(o => fmap['p:' + o.id] === fid && items.push(['pipe', o, 'p:' + o.id])); lst.cables.forEach(o => fmap['c:' + o.id] === fid && items.push(['cable', o, 'c:' + o.id]));
        h += '<div class="tr fold" data-fold="' + fid + '" data-drop="' + fid + '" style="padding-inline-start:16px"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">📁 ' + esc(f.name) + '</span><span class="ct">' + items.length + '</span><span class="acts"><button data-act="fren" data-fid="' + fid + '">✎</button><button data-act="fdel" data-fid="' + fid + '">🗑</button></span></div>' + (open ? items.map(x => row(x[0], x[1], x[2])).join('') : ''); });
      h += grp('nodes', t('nodes'), lst.nodes, 'node', 'n:') + grp('pipes', t('pipes'), lst.pipes, 'pipe', 'p:') + grp('cables', t('cables'), lst.cables, 'cable', 'c:') + grp('splices', t('splices'), lst.splices, 'splice', 's:') + importsGroup();
    }
    el.innerHTML = h;
    el.querySelectorAll('[data-fold]').forEach(f => f.onclick = e => { if (e.target.closest('.acts')) return; const id = f.dataset.fold; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); UI.refreshTree(); });
    el.querySelectorAll('.tr[data-id]').forEach(r => {
      const id = r.dataset.id, k = r.dataset.k;
      r.onclick = e => { if (e.target.closest('.acts') || e.target.type === 'checkbox') return; T().select(k, id); };
      r.ondblclick = () => { T().select(k, id); UI.zoomSel(); };
      r.ondragstart = e => e.dataTransfer.setData('text', r.dataset.key);
      r.querySelectorAll('[data-act]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = b.dataset.act; if (a === 'lock') { T().locked.has(id) ? T().locked.delete(id) : T().locked.add(id); UI.refreshTree(); } else if (a === 'del') { T().select(k, id); T().deleteSelection(); } else if (a === 'more') { T().select(k, id); const rc = b.getBoundingClientRect(); UI.ctxMenu(rc.right, rc.bottom, { kind: k, id }, [0, 0]); } });
      const cb = r.querySelector('[data-vis]'); cb.onchange = () => { cb.checked ? T().hidden.delete(id) : T().hidden.add(id); UI.applyHidden(); };
    });
    el.querySelectorAll('[data-impvis]').forEach(c => c.onchange = () => { c.checked ? T().hidden.delete(c.dataset.impvis) : T().hidden.add(c.dataset.impvis); FT.imp.render(); });
    el.querySelectorAll('[data-impdel]').forEach(b => b.onclick = e => { e.stopPropagation(); FT.commit(); delete FT.state.imports[b.dataset.impdel]; FT.changed('import'); });
    el.querySelectorAll('[data-imp]').forEach(r => r.ondblclick = () => { const g = FT.state.imports[r.dataset.imp]; if (g) FT.map.fitBBox(FT.bboxOf([].concat(...g.features.slice(0, 2000).map(f => f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0])))); });
    el.querySelectorAll('[data-drop]').forEach(f => { f.ondragover = e => e.preventDefault(); f.ondrop = e => { e.preventDefault(); const key = e.dataTransfer.getData('text'); if (!key) return; FT.commit(); (S.fmap = S.fmap || {})[key] = f.dataset.drop; FT.changed('folder'); }; });
    el.querySelectorAll('[data-act=fren]').forEach(b => b.onclick = e => { e.stopPropagation(); const f = S.folders[b.dataset.fid]; const n = prompt(t('new_folder'), f.name); if (n) { FT.commit(); f.name = n; FT.changed('folder'); } });
    el.querySelectorAll('[data-act=fdel]').forEach(b => b.onclick = e => { e.stopPropagation(); FT.commit(); const fid = b.dataset.fid; delete S.folders[fid]; Object.keys(S.fmap || {}).forEach(k => S.fmap[k] === fid && delete S.fmap[k]); FT.changed('folder'); });
  };
  function importsGroup() { const im = Object.values(FT.state.imports || {}); if (!im.length) return ''; const open = !collapsed.has('imports'); return '<div class="tr fold" data-fold="imports"><span class="tw">' + (open ? '▾' : '▸') + '</span><span class="nm">' + t('imports') + '</span><span class="ct">' + im.length + '</span></div>' + (open ? im.map(g => '<div class="tr" data-imp="' + g.id + '" style="padding-inline-start:30px"><input type="checkbox" ' + (T().hidden.has(g.id) ? '' : 'checked') + ' data-impvis="' + g.id + '"><span class="dot" style="background:#7ad7ff"></span><span class="nm">' + esc(g.name) + '</span><span class="ct">' + g.features.length + '</span><span class="acts"><button data-impdel="' + g.id + '">🗑</button></span></div>').join('') : ''); }
  UI.newFolder = function () { const n = prompt(t('new_folder'), t('new_folder')); if (!n) return; FT.commit(); const S = FT.state; (S.folders = S.folders || {})[FT.uid('f')] = { name: n }; FT.changed('folder'); };

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
    if (tool === 'pipe') h += field(t('pipe_type'), sel('pipeCat', FT.PIPE_CAT.map(p => [p.id, p.name]), O.pipeCat));
    if (tool === 'cable') { const groups = {}; FT.CABLE_CAT.forEach(c => (groups[c.group] = groups[c.group] || []).push(c)); h += field(t('cable_cat'), '<select id="cableCat">' + Object.entries(groups).map(([g, a]) => '<optgroup label="' + g + '">' + a.map(c => '<option value="' + c.id + '"' + (c.id === O.cableCat ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</optgroup>').join('') + '</select>') + field(t('medium'), '<div class="seg" id="mediumSeg"><button data-m="free" class="' + (O.medium === 'free' ? 'on' : '') + '">' + t('m_free') + '</button><button data-m="aerial" class="' + (O.medium === 'aerial' ? 'on' : '') + '">' + t('m_aerial') + '</button></div>'); }
    if (tool === 'number') { const n = T().num; h += '<div class="seg" id="numMode" style="margin-bottom:10px"><button data-m="auto" class="' + (n.mode === 'auto' ? 'on' : '') + '">' + t('num_auto') + '</button><button data-m="click" class="' + (n.mode === 'click' ? 'on' : '') + '">' + t('num_click') + '</button></div><div class="two">' + field(t('num_prefix'), '<input id="numPfx" value="' + esc(n.prefix) + '">') + field(t('num_next'), '<input id="numNext" type="text" inputmode="numeric" value="' + n.next + '">') + '</div>' + (n.mode === 'auto' ? field(t('num_order'), sel('numOrder', [['walk', t('o_walk')], ['rows', t('o_rows')], ['street', t('o_street')]], n.order)) + '<p class="d">' + t('num_hint_auto') + '</p><button class="btn" id="numClear">' + t('num_clear') + '</button>' : '<p class="d">' + t('num_hint_click') + '</p>'); }
    if (tool === 'floors' || tool === 'bdraw') h += field(t('floors'), '<input id="flN" type="text" inputmode="numeric" value="' + O.floors + '">') + '<p class="d">' + t('floors_hint') + '</p>';
    if (tool !== 'select') h += keysBox([[t('place_here'), t('k_click')], [t('k_enter'), 'Enter'], [t('k_back'), '⌫'], [t('k_esc'), 'Esc']]);
    body.innerHTML = h;
    body.querySelectorAll('#ratioSeg button').forEach(b => b.onclick = () => { O.ratio[tool] = b.dataset.r; FT.state.ui.ratio[tool] = b.dataset.r; UI.renderPanel(); });
    const pc = $('#pipeCat'); if (pc) pc.onchange = () => O.pipeCat = pc.value; const cc = $('#cableCat'); if (cc) cc.onchange = () => O.cableCat = cc.value;
    body.querySelectorAll('#mediumSeg button').forEach(b => b.onclick = () => { O.medium = b.dataset.m; UI.renderPanel(); });
    body.querySelectorAll('#numMode button').forEach(b => b.onclick = () => { T().num.mode = b.dataset.m; T().setTool('number'); });
    const np = $('#numPfx'); if (np) np.oninput = () => T().num.prefix = np.value; const nn = $('#numNext'); if (nn) nn.oninput = () => { const v = parseInt(String(nn.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v > 0) T().num.next = v; }; const no = $('#numOrder'); if (no) no.onchange = () => T().num.order = no.value;
    const nc = $('#numClear'); if (nc) nc.onclick = () => FT.T.startShape('poly', ring => FT.num.clearIn(ring), t('num_hint_auto'));
    const fl = $('#flN'); if (fl) fl.oninput = () => { const v = parseInt(String(fl.value).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10); if (v > 0) O.floors = v; };
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
    body.innerHTML = head(n.name, '<div class="kv"><span>' + n.ll[1].toFixed(6) + ', ' + n.ll[0].toFixed(6) + '</span><b>' + conn + ' ' + t('cables') + '</b></div><button class="btn full" id="pTrace" style="margin:8px 0">' + t('p_trace') + '</button>') +
      '<div class="two">' + field(t('p_type'), sel('x', [['olt', 'OLT / Exchange'], ['sk', 'SK'], ['dk', 'DK'], ['bk', 'BK'], ['mh', 'Manhole'], ['pole', 'Pole']], n.type).replace('id="x"', 'data-p="type"')) + field(t('p_place'), sel('x', FT.PLACEMENTS.map(p => [p, t('pl_' + p)]), n.place).replace('id="x"', 'data-p="place"')) + '</div>' +
      '<div class="two">' + field(t('p_ratio'), sel('x', FT.RATIOS.map(r => [r, r || t('ratio_none')]), n.ratio).replace('id="x"', 'data-p="ratio"')) + field(t('p_cores'), '<input data-p="cores" data-n="1" value="' + n.cores + '">') + '</div>' +
      field(t('p_name'), '<input data-p="name" value="' + esc(n.name) + '">') + field(t('p_label'), '<input data-p="label" value="' + esc(n.label) + '">') +
      field(t('p_colors'), '<div class="fc">' + fc + '</div>') + '<div class="two">' + field(t('p_closure'), sel('x', FT.CASSETTES.map(c => [c, c || '—']), n.cassette).replace('id="x"', 'data-p="cassette"')) + field(t('p_cat'), sel('x', [['', '—']].concat(FT.NODE_CAT.map(c => [c.id, c.name])), n.cat).replace('id="x"', 'data-p="cat"')) + '</div>' +
      field(t('p_size'), '<input data-p="size" value="' + esc(n.size) + '">') + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(n.note) + '</textarea>') + '<button class="btn bad full" id="pDel">' + t('p_delnode') + '</button>';
    bind(body, n); $('#pDel').onclick = () => T().deleteSelection(); $('#pTrace').onclick = () => UI.openSplice(n.id, true);
  }
  function propPipe(body, p) {
    const A = FT.state.nodes[p.a], B = FT.state.nodes[p.b];
    body.innerHTML = head(p.name, '<div class="kv"><span>' + t('p_len') + '</span><b>' + FT.fmtLen(FT.pathLen(p.pts)) + '</b></div><div class="kv"><span>' + p.pts.length + ' ' + t('p_corners') + '</span></div><div class="kv"><span>' + t('p_start') + ': ' + esc(A ? A.name : '?') + '</span></div><div class="kv"><span>' + t('p_end') + ': ' + esc(B ? B.name : '?') + '</span></div><div style="height:8px"></div>') +
      field(t('p_name'), '<input data-p="name" value="' + esc(p.name) + '">') + '<div class="two">' + field(t('pipe_type'), sel('x', FT.PIPE_TYPES.map(x => [x, t('pt_' + x)]), p.ptype).replace('id="x"', 'data-p="ptype"')) + field(t('p_pno'), '<input data-p="no" data-n="1" value="' + p.no + '">') + '</div>' +
      field(t('p_cat'), sel('x', FT.PIPE_CAT.map(c => [c.id, c.name]), p.cat).replace('id="x"', 'data-p="cat"')) + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(p.note) + '</textarea>') + field(t('p_color'), '<input type="color" data-p="color" value="' + (p.color || '#2aa8ff') + '" style="height:34px;padding:2px">') + '<button class="btn bad full" id="pDel">' + t('p_delpipe') + '</button>';
    bind(body, p); $('#pDel').onclick = () => T().deleteSelection();
  }
  function propCable(body, c) {
    const A = FT.state.nodes[c.a], B = FT.state.nodes[c.b], spans = FT.cableSpans(c);
    body.innerHTML = head(c.name, '<div class="kv"><span>' + t('p_total') + '</span><b>' + FT.fmtLen(FT.cableLength(c)) + '</b></div><div class="kv"><span>' + spans.length + ' ' + t('p_sections') + ' · ' + c.core + ' core</span></div><div class="kv"><span>' + t('p_start') + ': ' + esc(A ? A.name : '?') + '</span></div><div class="kv"><span>' + t('p_end') + ': ' + esc(B ? B.name : '?') + '</span></div>' + spans.map((s, i) => '<div class="kv"><span>' + t('p_span') + ' ' + (i + 1) + ' · ' + (s.medium === 'duct' ? 'Pipe' : s.medium === 'aerial' ? t('m_aerial') : t('m_free')) + '</span><b>' + FT.fmtLen(s.len) + '</b></div>').join('') + '<button class="btn full" id="pHl" style="margin:8px 0">' + t('p_hl') + '</button><div class="f"><label>' + t('p_follow') + '</label><div class="fc" style="max-height:64px;overflow:auto">' + Array.from({ length: Math.min(c.core, 36) }, (_, i) => '<span title="' + FT.fiberLabel(Math.floor(i / c.cpt) + 1, i % c.cpt + 1) + '"><i style="background:' + FT.FIBER_COLORS[i % 12].hex + '"></i>' + FT.fiberLabel(Math.floor(i / c.cpt) + 1, i % c.cpt + 1) + '</span>').join('') + '</div></div>') +
      field(t('p_name'), '<input data-p="name" value="' + esc(c.name) + '">') + '<div class="two">' + field(t('p_std'), sel('x', FT.CABLE_STD.map(s => [s, s]), c.std).replace('id="x"', 'data-p="std"')) + field(t('p_struct'), sel('x', FT.CABLE_STRUCT.map(s => [s, t('ct_' + s)]), c.struct).replace('id="x"', 'data-p="struct"')) + '</div><div class="two">' + field(t('p_tubes'), '<input data-p="tubes" data-n="1" value="' + c.tubes + '">') + field(t('p_cpt'), '<input data-p="cpt" data-n="1" value="' + c.cpt + '">') + '</div>' +
      field(t('p_cat'), sel('x', FT.CABLE_CAT.map(x => [x.id, x.name]), c.cat).replace('id="x"', 'data-p="cat"')) + field(t('p_note'), '<textarea data-p="note" rows="2">' + esc(c.note) + '</textarea>') + '<button class="btn bad full" id="pDel">' + t('p_delcable') + '</button>';
    bind(body, c, { cat: v => { const k = FT.CABLE_CAT.find(x => x.id === v); if (k) { c.std = k.std; c.struct = k.struct; c.tubes = k.tubes; c.cpt = k.core / k.tubes; c.core = k.core; } }, tubes: v => { c.core = c.tubes * c.cpt; }, cpt: v => { c.core = c.tubes * c.cpt; } });
    $('#pDel').onclick = () => T().deleteSelection(); $('#pHl').onclick = () => FT.map.setSelection('cable', c.id);
  }
  function propBld(body, id) {
    const S = FT.state, o = S.bld[id] || {}, ring = FT.map.buildingRing(id) || o.fp, f = (FT.map.bldFeats || []).find(x => x.properties.id === id), pr = f ? f.properties : {};
    body.innerHTML = head(t('b_title'), '<div class="kv"><span>' + t('b_area') + '</span><b>' + (ring ? Math.round(FT.ringArea(ring)) + ' m²' : '?') + '</b></div><div class="kv"><span>' + t('b_height') + '</span><b>' + (pr.eh ? pr.eh.toFixed(1) + ' m' : '?') + '</b></div><div style="height:8px"></div>') +
      '<div class="two">' + field(t('b_num'), '<input id="bNum" value="' + (o.num || '') + '">') + field(t('num_prefix'), '<input id="bPfx" value="' + esc(o.pfx || '') + '">') + '</div>' + field(t('b_floors'), '<input id="bFl" value="' + (o.floors || '') + '" placeholder="auto">') + field(t('b_name'), '<input id="bNm" value="' + esc(o.name || '') + '">') +
      '<div style="display:flex;gap:8px"><button class="btn pri" id="bSave">' + t('p_save') + '</button><button class="btn" id="bClr">' + t('b_clear') + '</button></div>';
    const num = v => parseInt(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10) || 0;
    $('#bSave').onclick = () => { FT.commit(); const b = S.bld[id] = S.bld[id] || {}; const n = num($('#bNum').value), fl = num($('#bFl').value); n ? b.num = n : delete b.num; b.pfx = $('#bPfx').value; fl ? b.floors = fl : delete b.floors; b.name = $('#bNm').value; FT.changed('bld'); UI.toast(t('toast_saved')); };
    $('#bClr').onclick = () => { FT.num.clear(id); panelProps(body); }; $('#pRel').onclick = () => T().select(null);
  }
  function panelAnalysis(body) {
    const S = FT.state, rows = FT.report(null), cab = rows.filter(r => r.kind === 'cable').reduce((a, r) => a + r.len, 0), pip = rows.filter(r => r.kind === 'pipe').reduce((a, r) => a + r.len, 0);
    const nb = Object.values(S.bld).filter(b => b.num).length, subs = Object.keys(S.subs).length;
    let h = '<h3>' + t('an_summary') + '</h3><p class="d">' + t('an_hint') + '</p>' + [[t('nodes'), Object.keys(S.nodes).length], [t('pipes'), Object.keys(S.pipes).length + ' · ' + FT.fmtLenShort(pip)], [t('cables'), Object.keys(S.cables).length + ' · ' + FT.fmtLenShort(cab)], [t('splices'), Object.keys(S.splices).length], [t('buildings') + ' #', nb], ['SUB', subs]].map(([a, b]) => '<div class="kv"><span>' + a + '</span><b>' + b + '</b></div>').join('');
    h += '<div class="kv" style="margin-top:6px"><span><b>' + t('project_cost') + '</b></span><b style="color:var(--ok);font-size:15px">' + (FT.hasPrices() ? FT.money(FT.cost(null).total) : '—') + '</b></div>' + (FT.hasPrices() ? '' : '<p class="d">' + t('prices_not_set') + '</p>');
    h += '<h3 style="margin-top:14px">' + t('an_budget') + '</h3>' + budgetHtml();
    body.innerHTML = h;
  }
  // optical budget for each subscriber, from the nearest OLT along the cable graph
  function budgetHtml() {
    const S = FT.state, olts = Object.values(S.nodes).filter(n => n.type === 'olt'), subs = Object.values(S.subs); if (!subs.length || !olts.length) return '<p class="d">OLT + subscriber → budget</p>';
    const B = FT.BASE_LOSS; let h = '<table class="t"><tr><th>SUB</th><th>km</th><th>dB</th><th>Rx</th></tr>';
    subs.slice(0, 40).forEach(sub => { let best = null; olts.forEach(o => { const r = T().route(o.id, sub.node); if (r && (!best || r.len < best.len)) best = Object.assign({ olt: o }, r); }); if (!best) { h += '<tr><td>' + esc(sub.name) + '</td><td colspan="3">—</td></tr>'; return; } let loss = best.len / 1000 * B.fiber1490 + 2 * B.connector + best.nodes.length * B.splice; best.nodes.forEach(id => { const n = S.nodes[id]; if (n && n.ratio) loss += FT.SPLITTER_LOSS[n.ratio] || 0; }); const rx = B.txDbm - loss; h += '<tr><td>' + esc(sub.name) + '</td><td>' + (best.len / 1000).toFixed(2) + '</td><td>' + loss.toFixed(1) + '</td><td style="color:' + (rx > B.rxSens + 3 ? 'var(--ok)' : rx > B.rxSens ? 'var(--warn)' : 'var(--bad)') + '">' + rx.toFixed(1) + ' dBm</td></tr>'; });
    return h + '</table>';
  }
  UI.shapeForAnalysis = function (tool, ring) { if (tool === 'plan') { const n = FT.map.buildingsInRing(ring).length; UI.modal(t('t_plan'), '<div class="kv"><span>' + t('buildings') + '</span><b>' + n + '</b></div><div class="kv"><span>km²</span><b>' + (FT.ringArea(ring) / 1e6).toFixed(3) + '</b></div><div class="kv"><span>≈ OLT ports (1:32 split, 1 per 32 homes)</span><b>' + Math.ceil(n / 32) + '</b></div><div class="kv"><span>≈ BK (1:8)</span><b>' + Math.ceil(n / 8) + '</b></div><div class="kv"><span>≈ DK (1:4)</span><b>' + Math.ceil(n / 32) + '</b></div>', [{ label: t('close') }]); T().setTool('select'); } else { T().setTool('select'); FT.design.open(ring); } };

  // ---------------- dialogs ----------------
  UI.openSplice = function (nodeId, create) {
    const S = FT.state, n = S.nodes[nodeId]; if (!n) return;
    let sp = Object.values(S.splices).find(x => x.node === nodeId);
    if (!sp && create) { FT.commit(); S.seq.splice++; sp = { id: FT.uid('e'), node: nodeId, label: '', inCable: '', outCable: '', fus: {} }; S.splices[sp.id] = sp; FT.changed('add'); }
    if (!sp) return;
    const cabs = Object.values(S.cables).filter(c => c.nodes.includes(nodeId)); if (!sp.inCable && cabs[0]) sp.inCable = cabs[0].id;
    const render = () => {
      const inC = S.cables[sp.inCable], outC = S.cables[sp.outCable], nf = Object.values(sp.fus).filter(v => v && v !== 'T').length;
      const outOpts = outC ? '<option value="">—</option><option value="T">TERM</option>' + Array.from({ length: outC.core }, (_, i) => '<option value="' + (i + 1) + '">' + FT.fiberLabel(Math.floor(i / outC.cpt) + 1, i % outC.cpt + 1) + '</option>').join('') : '<option value="">—</option><option value="T">TERM</option>';
      return '<div class="f"><label>' + t('splice_name') + '</label><input id="spL" value="' + esc(sp.label) + '"></div><div class="two"><div class="f"><label>' + t('in_cable') + '</label><select id="spIn">' + cabs.map(c => '<option value="' + c.id + '"' + (c.id === sp.inCable ? ' selected' : '') + '>' + esc(c.name + ' · ' + c.core + 'C') + '</option>').join('') + '</select></div><div class="f"><label>' + t('out_cable') + '</label><select id="spOut"><option value="">' + t('no_second') + '</option>' + cabs.filter(c => c.id !== sp.inCable).map(c => '<option value="' + c.id + '"' + (c.id === sp.outCable ? ' selected' : '') + '>' + esc(c.name + ' · ' + c.core + 'C') + '</option>').join('') + '</select></div></div>' +
        (outC ? '' : '<div class="warnbox">' + t('splice_note') + '</div>') + '<div class="kv"><span><b>' + nf + '</b> ' + t('fusions') + ' · ≈ ' + (nf * FT.BASE_LOSS.splice).toFixed(2) + ' dB ' + t('loss') + '</span></div>' +
        '<div style="max-height:46vh;overflow:auto;margin-top:8px"><table class="t"><tr><th></th><th>' + t('in_cable') + '</th><th>' + t('out_cable') + '</th></tr>' + (inC ? Array.from({ length: inC.core }, (_, i) => { const lb = FT.fiberLabel(Math.floor(i / inC.cpt) + 1, i % inC.cpt + 1), v = sp.fus[i + 1] || ''; return '<tr><td><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:' + FT.FIBER_COLORS[i % 12].hex + '"></span></td><td style="direction:ltr;font-family:monospace">' + lb + '</td><td><select data-core="' + (i + 1) + '">' + outOpts.replace('value="' + v + '"', 'value="' + v + '" selected') + '</select></td></tr>'; }).join('') : '') + '</table></div>';
    };
    UI.modal(t('splice_title') + ' — ' + n.name, render(), [{ label: t('menu_delete'), cls: 'bad', fn: () => { FT.commit(); delete S.splices[sp.id]; FT.changed('delete'); } }, { label: t('close') }], function wire(root) {
      const again = () => { root.innerHTML = render(); wire(root); };
      root.querySelector('#spL').oninput = e => { sp.label = e.target.value; clearTimeout(wire.t); wire.t = setTimeout(() => FT.changed('prop'), 300); };
      root.querySelector('#spIn').onchange = e => { FT.commit(); sp.inCable = e.target.value; sp.fus = {}; FT.changed('prop'); again(); };
      root.querySelector('#spOut').onchange = e => { FT.commit(); sp.outCable = e.target.value; sp.fus = {}; FT.changed('prop'); again(); };
      root.querySelectorAll('select[data-core]').forEach(s => s.onchange = () => { FT.commit(); if (s.value) sp.fus[s.dataset.core] = s.value; else delete sp.fus[s.dataset.core]; FT.changed('prop'); again(); });
    });
  };
  UI.openReport = function (selected) {
    let scope = selected && T().multi ? T().multi : null;
    const draw = () => { const c = FT.cost(scope), badge = { cable: 'rp_cable', pipe: 'rp_pipe', node: 'rp_node', splitter: 'rp_node', splice: 'rp_splice', wdev: 'rp_node', labour: 'rp_pipe' };
      return '<div class="seg" id="rpScope" style="margin-bottom:10px"><button data-s="all" class="' + (!scope ? 'on' : '') + '">' + t('scope_all') + '</button><button data-s="sel" class="' + (scope ? 'on' : '') + '">' + t('scope_sel') + '</button></div>' +
        (FT.hasPrices() ? '' : '<div class="warnbox">' + t('prices_not_set') + '</div>') + '<table class="t"><tr><th>' + t('qty') + '</th><th></th>' + (FT.hasPrices() ? '<th>' + t('unit_price') + '</th><th>' + t('cost_total') + '</th>' : '') + '</tr>' + c.lines.map(r => '<tr><td style="direction:ltr;white-space:nowrap">' + (r.unit === 'm' ? FT.fmtLen(r.qty) : r.qty) + '</td><td><span class="badge">' + t(badge[r.kind] || 'rp_node') + '</span>' + esc(r.name) + '</td>' + (FT.hasPrices() ? '<td>' + FT.money(r.price) + (r.unit === 'm' ? ' /m' : '') + '</td><td><b>' + FT.money(r.total) + '</b></td>' : '') + '</tr>').join('') +
        (FT.hasPrices() ? '<tr><td colspan="3" style="text-align:end"><b>' + t('project_cost') + '</b></td><td><b style="color:var(--ok);font-size:16px">' + FT.money(c.total) + '</b></td></tr>' : '') + '</table>' + (c.lines.length ? '' : '<div class="empty">—</div>'); };
    UI.modal(t('report_title'), draw(), [{ label: t('prices_btn'), fn: () => UI.openPrices(), keep: false }, { label: t('rp_csv'), fn: () => FT.exp.reportCsv(scope), keep: true }, { label: t('rp_print'), cls: 'ok', fn: () => FT.exp.print(scope), keep: true }, { label: t('close') }], function wire(root) { root.querySelectorAll('#rpScope button').forEach(b => b.onclick = () => { scope = b.dataset.s === 'sel' ? (T().multi || { nodes: new Set(), pipes: new Set(), cables: new Set() }) : null; root.innerHTML = draw(); wire(root); }); });
  };
  UI.openIO = function () {
    UI.modal(t('io_title'), '<div class="seg"><button class="btn pri" id="ioSave">' + t('io_save') + '</button><button class="btn" id="ioLoad">' + t('io_load') + '</button><button class="btn" id="ioGeo">' + t('io_geo') + '</button><button class="btn" id="ioKmz">KMZ</button><button class="btn bad" id="ioReset">' + t('io_reset') + '</button></div>' +
      '<div class="f" style="margin-top:14px"><label>' + t('io_import') + ' (KML · KMZ · GeoJSON · DXF)</label><div class="two"><select id="ioCrs"><option value="utm37">DXF: UTM 37N (WGS84)</option><option value="utm36">DXF: UTM 36N (WGS84)</option><option value="ll">DXF: lon / lat</option></select><button class="btn" id="ioImp">' + t('io_import') + '</button></div><input type="file" id="ioFile" accept=".json,.geojson,.kml,.kmz,.dxf" hidden></div><p class="d">' + t('io_dxf_note') + '</p>', [{ label: t('close') }], root => {
      root.querySelector('#ioSave').onclick = () => FT.exp.saveJson(); root.querySelector('#ioGeo').onclick = () => FT.exp.geojson(); root.querySelector('#ioKmz').onclick = () => FT.exp.kmz();
      root.querySelector('#ioLoad').onclick = () => { root.querySelector('#ioFile').dataset.mode = 'project'; root.querySelector('#ioFile').click(); }; root.querySelector('#ioImp').onclick = () => { root.querySelector('#ioFile').dataset.mode = 'import'; root.querySelector('#ioFile').click(); };
      root.querySelector('#ioFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; await FT.imp.file(f, root.querySelector('#ioCrs').value); UI.closeModal(); };
      root.querySelector('#ioReset').onclick = () => { if (confirm(t('io_confirm'))) { FT.commit(); FT.setState(Object.assign(FT.blank(), { meta: FT.state.meta })); UI.closeModal(); } };
    });
  };
  UI.openHelp = function () {
    const rows = [['V', 'sc_select'], ['M / D / 1 / 2 / 3 / O / E', 't_point'], ['B / K / G / R', 'g_line'], ['L / U', 't_area'], ['N', 't_number'], ['Esc', 'sc_esc'], ['Enter', 'sc_enter'], ['Del', 'sc_del'], ['Ctrl+Z / Ctrl+Y', 'sc_undo'], ['F', 'sc_f'], ['H', 'sc_h'], ['Ctrl+B', 'sc_layers'], ['Ctrl+I', 'sc_panel']];
    UI.modal(t('help_title'), '<table class="t">' + rows.map(([k, l]) => '<tr><td><kbd class="k">' + esc(k) + '</kbd></td><td>' + esc(t(l)) + '</td></tr>').join('') + '</table>', [{ label: t('close') }]);
  };
  UI.openProjects = async function (first) {
    const list = await FT.store.list(), types = [['gpon', 'GPON', 'ألياف (سلكي)'], ['wireless', 'Wireless', 'لاسلكي'], ['mixed', 'Mixed', 'مختلط']];
    const ic = { gpon: '🔌', wireless: '📡', mixed: '🔀' };
    const body = '<div class="d">' + t('choose_type') + '</div><div class="ptypes">' + types.map(([k]) => '<button class="ptype" data-new="' + k + '"><i>' + ic[k] + '</i><b>' + t('pk_' + k) + '</b><span>' + t('pk_' + k + '_d') + '</span></button>').join('') + '</div>' + (list.length ? '<div class="cap" style="margin-bottom:6px">' + t('recent') + '</div>' : '') +
      (list.length ? '<table class="t">' + list.sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(p => '<tr><td><a href="#" data-open="' + p.id + '" style="color:var(--hot2);font-weight:700">' + esc(p.name || 'Project') + '</a></td><td><span class="badge">' + esc((p.type || 'gpon').toUpperCase()) + '</span>' + (p.mode === 'view' ? '<span class="badge">VIEW</span>' : '') + (p.offline ? '<span class="badge">OFFLINE</span>' : '') + '</td><td style="direction:ltr;color:var(--mu)">' + (p.updated ? new Date(p.updated).toLocaleDateString() : '') + '</td><td><button class="ib sm" data-ren="' + p.id + '">✎</button><button class="ib sm" data-del="' + p.id + '">🗑</button></td></tr>').join('') + '</table>' : '<p class="d">—</p>') +
      '<div class="f" style="margin-top:14px"><label>' + t('open_by_link') + '</label><div style="display:flex;gap:6px"><input id="prLink" placeholder="https://…?p=…&k=…"><button class="btn" id="prGo">' + t('open') + '</button></div></div>';
    UI.modal(t('projects'), body, first ? [] : [{ label: t('close') }], root => {
      root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { const n = prompt(t('new_project'), 'Homs ' + (list.length + 1)); if (!n) return; UI.openPrices({ start: true, name: n, type: b.dataset.new }); });
      root.querySelectorAll('[data-open]').forEach(a => a.onclick = async e => { e.preventDefault(); if (await FT.store.open(a.dataset.open)) { UI.closeModal(); UI.afterProject(); } else UI.toast('Cannot open this project'); });
      root.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => { const n = prompt(t('projects'), ''); if (!n) return; if (!FT.store.cur || FT.store.cur.id !== b.dataset.ren) await FT.store.open(b.dataset.ren); FT.store.rename(n); UI.closeModal(); UI.afterProject(); UI.openProjects(); });
      root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm(t('menu_delete') + '?')) return; await FT.store.remove(b.dataset.del); UI.closeModal(); UI.openProjects(!FT.store.cur); });
      root.querySelector('#prGo').onclick = async () => { try { const u = new URL(root.querySelector('#prLink').value.trim()), id = u.searchParams.get('p'), k = u.searchParams.get('k'); if (id && k && await FT.store.open(id, k)) { UI.closeModal(); UI.afterProject(); } else UI.toast('Invalid link'); } catch (e) { UI.toast('Invalid link'); } };
    });
    if (first) $('#modal').onmousedown = null;
  };
  UI.openPrices = function (o) {
    o = o || {}; const P = FT.prices(), ar = FT.lang === 'ar', wl = (o.type || (FT.state.meta && FT.state.meta.type)) !== 'gpon', fb = (o.type || (FT.state.meta && FT.state.meta.type)) !== 'wireless';
    const row = (path, label, val) => '<tr><td class="n">' + esc(label) + '</td><td><input data-price="' + path + '" type="text" inputmode="decimal" value="' + val + '"></td></tr>';
    const sec = (title, rows) => '<h4>' + esc(title) + '</h4><table class="t ptable">' + rows + '</table>';
    let h = '<p class="d">' + t('price_hint') + '</p>';
    if (fb) {
      h += sec(t('cat_cables'), FT.CABLE_CAT.map(c => row('cable.' + c.id, c.name.split(' loose')[0].split(' G.')[0], P.cable[c.id])).join(''));
      h += sec(t('cat_pipes'), FT.PIPE_CAT.map(c => row('pipe.' + c.id, c.name, P.pipe[c.id])).join(''));
      h += sec(t('cat_nodes'), [['olt', 'OLT / Exchange'], ['sk', 'SK — Field cabinet'], ['dk', 'DK — Distribution box'], ['bk', 'BK — Building box'], ['mh', 'Manhole'], ['pole', 'Pole']].map(([k, l]) => row('node.' + k, l, P.node[k])).join(''));
      h += sec(t('cat_splitters'), FT.RATIOS.filter(Boolean).map(r => row('splitter.' + r, 'Splitter ' + r, P.splitter[r])).join(''));
      h += sec(t('cat_splice'), row('splice', 'Splice closure IP68', P.splice));
    }
    if (wl) h += sec(t('cat_wireless'), [['ap', 'AP (sector)'], ['cpe', 'CPE'], ['ptp', 'PTP radio']].map(([k, l]) => row('wdev.' + k, l, P.wdev[k])).join(''));
    h += sec(t('cat_labour'), row('labour.pipe_m', ar ? 'تركيب الأنابيب' : 'Pipe installation', P.labour.pipe_m) + row('labour.cable_m', ar ? 'تركيب الكبلات' : 'Cable installation', P.labour.cable_m));
    UI.modal((o.start ? o.name + ' — ' : '') + t('prices_title'), h, [o.start ? { label: t('close'), fn: () => UI.openProjects(!FT.store.cur) } : { label: t('close') }].concat(o.start ? [{ label: t('skip_prices'), fn: async () => { await FT.store.create(o.name, o.type); UI.afterProject(); } }] : []).concat([{ label: o.start ? t('start_project') : t('save_prices'), cls: 'pri', fn: async () => {
      const num = v => { v = parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')); return isNaN(v) || v < 0 ? 0 : v; }, out = {};
      $$('[data-price]').forEach(i => { const path = i.dataset.price.split('.'); if (path.length === 1) out[path[0]] = num(i.value); else { (out[path[0]] = out[path[0]] || {})[path[1]] = num(i.value); } });
      const merged = Object.assign({}, FT.state.prices || {}, out); Object.keys(out).forEach(k => { if (typeof out[k] === 'object') merged[k] = Object.assign({}, (FT.state.prices || {})[k] || {}, out[k]); });
      if (o.start) { await FT.store.create(o.name, o.type); FT.state.prices = merged; await FT.store.saveNow(); UI.afterProject(); } else { FT.commit(); FT.state.prices = merged; FT.changed('prices'); UI.toast(t('toast_saved')); }
    } }]));
  };
  UI.openShare = function () {
    const L = FT.store.links(); if (!L) { UI.toast(FT.lang === 'ar' ? 'المشروع محلي فقط — لا يوجد رابط' : 'Local-only project — no link'); return; }
    const row = (lab, url, hint) => '<div class="f"><label>' + lab + '</label><div style="display:flex;gap:6px"><input readonly value="' + esc(url) + '" style="direction:ltr"><button class="btn" data-copy="' + esc(url) + '">' + t('copy') + '</button></div><div class="d" style="margin-top:4px">' + hint + '</div></div>';
    UI.modal(t('share'), row(t('link_view'), L.view || '—', t('link_view_d')) + row(t('link_edit'), L.edit, t('link_edit_d')), [{ label: t('close') }], root => root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy).then(() => UI.toast(t('copied'))); }));
  };
  UI.afterProject = function () {
    document.body.classList.remove('nop'); document.body.classList.toggle('ro', FT.store.mode === 'view'); setTimeout(() => FT.map.map.resize(), 50);
    if (FT.store.mode === 'view') UI.toast(FT.lang === 'ar' ? 'وضع العرض فقط' : 'View-only mode');
    const type = (FT.state.meta && FT.state.meta.type) || (FT.store.cur && FT.store.cur.type) || 'gpon';
    $('#projTitle').textContent = (FT.state.meta.name || (FT.store.cur && FT.store.cur.name) || '—');
    mode = 'infra'; UI.buildTabs(type); UI.buildToolbar(); UI.refreshTree(); UI.renderPanel(); FT.map.renderNet(); UI.applyHidden(); UI.fitAll();
  };
  UI.buildTabs = function (type) {
    const tabs = [['infra', t('tab_infra'), type !== 'wireless'], ['wireless', FT.lang === 'ar' ? 'لاسلكي' : 'Wireless', type !== 'gpon'], ['pon', t('tab_pon'), type !== 'wireless']].filter(x => x[2]);
    const el = $('#modeTabs'); el.innerHTML = tabs.map(([k, l]) => '<button data-mode="' + k + '" class="' + (mode === k ? 'on' : '') + '">' + esc(l) + '</button>').join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { mode = b.dataset.mode; T().setTool('select'); UI.buildTabs(type); UI.buildToolbar(); if (mode === 'pon') UI.tab('analysis'); });
  };

  // ---------------- search / commands ----------------
  function wireSearch() {
    const inp = $('#search'), res = $('#searchRes'); let tm = 0;
    inp.oninput = () => { clearTimeout(tm); const q = inp.value.trim(); if (q.length < 3) { res.style.display = 'none'; return; } tm = setTimeout(async () => { try { const b = FT.BOUND.bbox, r = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=' + FT.lang + '&viewbox=' + b[0] + ',' + b[3] + ',' + b[2] + ',' + b[1] + '&bounded=1&q=' + encodeURIComponent(q))).json(); res.innerHTML = r.map(x => '<div data-ll="' + x.lon + ',' + x.lat + '">' + esc(x.display_name) + '</div>').join('') || '<div>—</div>'; res.style.display = 'block'; res.querySelectorAll('[data-ll]').forEach(d => d.onclick = () => { const [lo, la] = d.dataset.ll.split(',').map(Number); FT.map.flyTo([lo, la], 17); res.style.display = 'none'; }); } catch (e) { res.style.display = 'none'; } }, 500); };
    document.addEventListener('click', e => { if (!$('#searchBox').contains(e.target)) res.style.display = 'none'; });
    const cmd = $('#cmd'); cmd.onkeydown = e => { if (e.key !== 'Enter') return; const v = cmd.value.trim(), a = v.split(/\s+/); cmd.value = ''; cmd.blur(); if (a[0] === 'goto' && a.length >= 3) FT.map.flyTo([+a[2], +a[1]], 17); else if (a[0] === 'help') UI.openHelp(); else if (a[0] === 'dxf') FT.exp.openDxf(); else if (a[0] === 'kmz') FT.exp.kmz(); else UI.toast('help · goto <lat> <lon> · dxf · kmz'); };
  }

  // ---------------- static wiring / boot ----------------
  UI.applyLang = function () {
    document.documentElement.lang = FT.lang; $('#brand').title = t('projects'); $('#search').placeholder = t('search'); $('#layersTitle').textContent = t('layers'); $('#lsearch').placeholder = t('layers_search');
    $('#bUndo').title = t('undo'); $('#bRedo').title = t('redo'); $('#bHelp').title = t('help'); $('#bLang').textContent = FT.lang === 'ar' ? 'EN' : 'عربي'; $('#bShare').textContent = t('share'); $('#bPrices').textContent = '$ ' + t('prices_btn'); $('#bUser').textContent = FT.sb && FT.sb.user ? FT.sb.user.email.split('@')[0] : t('signin');
    $('#bNewFolder').title = t('new_folder'); $('#bCollapse').title = t('collapse'); $('#bLockAll').title = t('lock_all');
    $$('.tabs button[data-tab]').forEach(b => b.textContent = t('tab_' + (b.dataset.tab === 'tool' ? 'tool' : b.dataset.tab === 'props' ? 'props' : 'analysis')));
    $('#basemap .cap').textContent = t('basemap'); $('#basemap .bm').innerHTML = [['map', 'b_map'], ['3d', 'b_3d'], ['sat', 'b_sat']].map(([k, l]) => '<button data-b="' + k + '" class="' + ((FT.map.base || 'map') === k ? 'on' : '') + '">' + t(l) + '</button>').join('');
    $$('#basemap [data-b]').forEach(b => b.onclick = () => { FT.map.setBase(b.dataset.b); UI.applyLang(); });
    $('#chips').innerHTML = [['all', 'f_all'], ['box', 'f_box'], ['olt', 'f_olt'], ['pipe', 'f_pipe'], ['cable', 'f_cable'], ['splice', 'f_splice']].map(([k, l]) => '<span class="chip' + (chipFilter === k ? ' on' : '') + '" data-c="' + k + '">' + t(l) + '</span>').join('');
    $$('#chips .chip').forEach(c => c.onclick = () => { chipFilter = c.dataset.c; UI.applyLang(); UI.refreshTree(); });
    $('#cmd').placeholder = '> help · goto lat lon'; $('#bCross').title = t('st_cross'); $('#bNames').title = t('st_names'); $('#bLay').title = t('st_layers'); $('#bPan').title = t('st_panel');
    if (FT.map.ready) { UI.buildToolbar(); UI.refreshTree(); UI.renderPanel(); }
  };
  FT.boot = async function () {
    if (window.__PHONE) return;
    document.body.classList.add('nop'); UI.applyLang(); await FT.map.init('map'); FT.T.init(); UI.applyLang();
    $('#brand').onclick = () => UI.openProjects(); $('#projName').onclick = () => UI.openProjects();
    $('#bUndo').onclick = () => FT.undo(); $('#bRedo').onclick = () => FT.redo(); $('#bHelp').onclick = UI.openHelp; $('#bLang').onclick = () => { FT.setLang(FT.lang === 'ar' ? 'en' : 'ar'); UI.applyLang(); UI.buildTabs((FT.state.meta && FT.state.meta.type) || 'gpon'); UI.buildToolbar(); };
    $('#bShare').onclick = UI.openShare; $('#bPrices').onclick = () => UI.openPrices(); $('#bUser').onclick = () => UI.toast('Sign-in — after Supabase connection');
    $('#bLayersX').onclick = UI.toggleLeft; $('#bRightX').onclick = UI.toggleRight; $('#bLay').onclick = UI.toggleLeft; $('#bPan').onclick = UI.toggleRight;
    $('#bNewFolder').onclick = UI.newFolder; $('#bCollapse').onclick = () => { collapsed = new Set(['root', 'nodes', 'pipes', 'cables', 'splices', ...Object.keys(FT.state.folders || {})]); UI.refreshTree(); };
    $('#bLockAll').onclick = () => { Object.keys(FT.state.nodes).forEach(i => T().locked.add(i)); UI.refreshTree(); };
    $('#lsearch').oninput = e => { treeQuery = e.target.value; UI.refreshTree(); };
    $('#bCross').onclick = () => { const c = $('#cross'); c.style.display = c.style.display === 'block' ? 'none' : 'block'; $('#bCross').classList.toggle('on'); };
    $('#cross').innerHTML = '<i class="v"></i><i class="h"></i>'; $('#mapwrap').addEventListener('mousemove', e => { const r = $('#mapwrap').getBoundingClientRect(), v = $('#cross .v'), h = $('#cross .h'); v.style.left = (e.clientX - r.left) + 'px'; h.style.top = (e.clientY - r.top) + 'px'; });
    $('#bNames').onclick = () => { names = !names; $('#bNames').classList.toggle('on', names); FT.map.map.setLayoutProperty('nodes', 'text-field', names ? ['get', 'name'] : ['step', ['zoom'], '', 15.5, ['get', 'name']]); };
    $$('.tabs button[data-tab]').forEach(b => b.onclick = () => UI.tab(b.dataset.tab));
    wireSearch(); FT.onChange(() => { UI.refreshTree(); UI.renderPanelKeep(); $('#bUndo').disabled = !FT.canUndo(); $('#bRedo').disabled = !FT.canRedo(); });
    $('#bUndo').disabled = true; $('#bRedo').disabled = true; UI.tab('tool');
    if (await FT.store.openFromUrl()) UI.afterProject(); else { const last = localStorage.getItem('ft2_last'); if (last && await FT.store.open(last)) UI.afterProject(); else UI.openProjects(true); }
  };
  UI.renderPanelKeep = function () { if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#rbody').contains(document.activeElement)) return; UI.renderPanel(); };
})(window);
