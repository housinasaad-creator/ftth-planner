/* FTTH planner — application shell: map view (locked to the drawing), tools, selection, inspector. */
(function () {
  'use strict';
  const A = window.FTAPP = {};
  const $ = (s, r) => (r || document).querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const S0 = window.SURVEY;
  const KEY = 'ftth.project.v1', UIKEY = 'ftth.ui.v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  A.esc = esc;
  let ui = { lang: 'ar', img: true, imgOpacity: 0.85, imgBright: 1, panel: true, bmode: 'fat', layers: { streets: true, buildings: true, cables: true, nodes: true, labels: true, cableLabels: false, drops: true, blabels: true }, tool: 'select' };
  try { Object.assign(ui, JSON.parse(localStorage.getItem(UIKEY) || '{}')); ui.layers = Object.assign({ streets: true, buildings: true, cables: true, nodes: true, labels: true, cableLabels: false, drops: true, blabels: true }, ui.layers); } catch (e) { }
  A.ui = ui;
  const saveUI = () => { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { } };
  A.saveUI = saveUI;

  /* ------------------------------------------------------------ i18n */
  const t = A.t = function (key) { const d = (window.FT_I18N || {}); let s = (d[ui.lang] && d[ui.lang][key]); if (s == null) s = d.en && d.en[key]; if (s == null) s = key; for (let i = 1; i < arguments.length; i++) s = s.replace('{' + (i - 1) + '}', arguments[i]); return s; };
  A.tl = (o) => (o ? (o[ui.lang] || o.en) : '');   // pick a localised field of {ar,en}

  /* ------------------------------------------------------------ icons */
  const IC = {
    select: '<path d="M5 3l14 8-6 2-3 6z"/>', pan: '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3l3 3M12 21l-3-3m3 3l3-3M3 12l3-3m-3 3l3 3M21 12l-3-3m3 3l-3 3"/>',
    co: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h2M14 8h2M8 12h2M14 12h2M10 21v-4h4v4"/>', fdh: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M8 8h1M15 8h1M8 12h1M15 12h1M8 16h1M15 16h1"/>',
    fat: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5"/>', closure: '<path d="M12 3l9 9-9 9-9-9z"/><path d="M8 12h8"/>', pole: '<path d="M12 3v18M7 7h10M8 11h8"/>',
    handhole: '<rect x="5" y="7" width="14" height="10" rx="1.5"/><path d="M9 12h6"/>', manhole: '<circle cx="12" cy="12" r="8"/><path d="M7 12h10M12 7v10"/>',
    feeder: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h10" stroke-width="3.6"/>', distribution: '<circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M7 17h5V7h5" stroke-width="2.6"/>',
    drop: '<path d="M3 11l9-7 9 7"/><path d="M6 10v10h12V10M10 20v-5h4v5"/>', addb: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 8v8M8 12h8"/>', measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', report: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', check: '<path d="M4 12l5 5L20 6"/>', dash: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>', book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/>', io: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>', keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h1M11 10h1M15 10h1M7 14h10"/>', lib: '<path d="M4 5h4v14H4zM10 5h4v14h-4zM16 6l4 1-3 13-4-1z"/>', pin: '<path d="M12 21s7-6 7-11a7 7 0 00-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', color: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>', price: '<path d="M12 3v18M16 7c-1-1.5-2.5-2-4-2-2.5 0-4 1.2-4 3s1.5 2.5 4 3 4 1.2 4 3-1.5 3-4 3c-1.5 0-3-.5-4-2"/>'
  };
  A.ic = (n, extra) => '<svg viewBox="0 0 24 24"' + (extra || '') + '>' + (IC[n] || '') + '</svg>';

  /* ------------------------------------------------------------ view / locked navigation */
  const svg = $('#map'), stage = $('#stage'), B = FT.BOUNDS;
  let view = { k: 1, tx: 0, ty: 0 }, minK = 0.5, maxK = 12;
  const vp = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  function computeLimits() { const { w, h } = vp(); minK = Math.min(w / (B.x1 - B.x0), h / (B.y1 - B.y0)); maxK = minK * 14; }
  function clampView() {   // the map can never leave the drawing: no panning beyond its edges, no zooming out past "fit"
    const { w, h } = vp(); view.k = Math.max(minK, Math.min(maxK, view.k));
    const visW = w / view.k, visH = h / view.k; let left = -view.tx / view.k, top = -view.ty / view.k;
    left = visW >= B.x1 - B.x0 ? B.x0 - (visW - (B.x1 - B.x0)) / 2 : Math.max(B.x0, Math.min(B.x1 - visW, left));
    top = visH >= B.y1 - B.y0 ? B.y0 - (visH - (B.y1 - B.y0)) / 2 : Math.max(B.y0, Math.min(B.y1 - visH, top));
    view.tx = -left * view.k; view.ty = -top * view.k;
  }
  A.fit = function () { computeLimits(); view.k = minK; clampView(); render(); };
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - view.tx) / view.k, (cy - r.top - view.ty) / view.k]; };
  function zoomAt(cx, cy, f) { const r = svg.getBoundingClientRect(), x = cx - r.left, y = cy - r.top, wx = (x - view.tx) / view.k, wy = (y - view.ty) / view.k; view.k *= f; view.k = Math.max(minK, Math.min(maxK, view.k)); view.tx = x - wx * view.k; view.ty = y - wy * view.k; clampView(); requestRender(); }
  A.zoomTo = function (wx, wy, k) { const { w, h } = vp(); view.k = Math.max(minK, Math.min(maxK, k || Math.max(view.k, minK * 4))); view.tx = w / 2 - wx * view.k; view.ty = h / 2 - wy * view.k; clampView(); render(); };

  /* ------------------------------------------------------------ state, history, persistence */
  let hist = [], hidx = -1, saveTimer = null;
  function snapshot() { const s = JSON.stringify(FT.state); if (hist[hidx] === s) return; hist = hist.slice(0, hidx + 1); hist.push(s); if (hist.length > 80) hist.shift(); hidx = hist.length - 1; updUndo(); }
  function updUndo() { $('#btnUndo').disabled = hidx <= 0; $('#btnRedo').disabled = hidx >= hist.length - 1; }
  A.undo = function () { if (hidx <= 0) return; hidx--; FT.load(JSON.parse(hist[hidx])); sel = sel.filter(stillExists); afterLoad(); };
  A.redo = function () { if (hidx >= hist.length - 1) return; hidx++; FT.load(JSON.parse(hist[hidx])); sel = sel.filter(stillExists); afterLoad(); };
  function afterLoad() { updUndo(); persist(); render(); renderInspector(); renderStatus(); }
  function stillExists(s) { return s.t === 'n' ? !!FT.node(s.id) : s.t === 'c' ? !!FT.cable(s.id) : !!FT.bld(s.id); }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(FT.state)); } catch (e) { toast(t('save_fail')); } }, 300); }
  A.commit = function (opt) { FT.invalidate(); snapshot(); persist(); render(); if (!opt || !opt.noInspector) renderInspector(); renderStatus(); };
  A.replaceProject = function (obj, keepView) { FT.load(obj); sel = []; hist = []; hidx = -1; snapshot(); persist(); if (!keepView) A.fit(); else render(); renderInspector(); renderStatus(); renderHeader(); };
  A.resetDemo = function () { FT.buildDemo(); FT.state.geoRef = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]; sel = []; hist = []; hidx = -1; snapshot(); persist(); A.fit(); renderInspector(); renderStatus(); renderHeader(); };
  A.blank = function () { FT.newProject(); FT.state.geoRef = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]; sel = []; hist = []; hidx = -1; snapshot(); persist(); A.fit(); renderInspector(); renderStatus(); renderHeader(); };

  /* ------------------------------------------------------------ selection */
  let sel = []; A.getSel = () => sel;
  const isSel = (tt, id) => sel.some(s => s.t === tt && s.id === id);
  A.select = function (list, noZoom) { sel = list || []; render(); renderInspector(); renderStatus(); };
  A.selectAndShow = function (tt, id) {
    let p = null; if (tt === 'n') { const n = FT.node(id); if (n) p = [n.x, n.y]; } else if (tt === 'b') { const b = FT.bld(id); if (b) p = FT.centre(b); } else { const c = FT.cable(id), pts = FT.cablePts(c); if (pts) p = pts[Math.floor(pts.length / 2)]; }
    sel = [{ t: tt, id }]; if (p) A.zoomTo(p[0], p[1], Math.max(view.k, minK * 3.2)); else render(); renderInspector();
  };

  /* ------------------------------------------------------------ tools */
  const TOOLS = [
    { id: 'select', ic: 'select', k: 'V' }, { id: 'pan', ic: 'pan', k: 'H' }, { sep: 1 },
    { id: 'add:co', ic: 'co', k: '1' }, { id: 'add:fdh', ic: 'fdh', k: '2' }, { id: 'add:fat', ic: 'fat', k: '3' }, { id: 'add:closure', ic: 'closure', k: '4' }, { id: 'add:pole', ic: 'pole', k: '5' }, { id: 'add:handhole', ic: 'handhole', k: '6' }, { id: 'add:manhole', ic: 'manhole', k: '7' }, { sep: 1 },
    { id: 'cable:feeder', ic: 'feeder', k: 'Q' }, { id: 'cable:distribution', ic: 'distribution', k: 'E' }, { id: 'drop', ic: 'drop', k: 'R' }, { sep: 1 }, { id: 'addb', ic: 'addb', k: 'B' }, { id: 'measure', ic: 'measure', k: 'M' }
  ];
  let tool = 'select', draw = null, drag = null, pointers = new Map(), measurePts = [], spaceDown = false, mouseW = [0, 0], boxSel = null;
  const TKEYS = { v: 'select', h: 'pan', 1: 'add:co', 2: 'add:fdh', 3: 'add:fat', 4: 'add:closure', 5: 'add:pole', 6: 'add:handhole', 7: 'add:manhole', q: 'cable:feeder', e: 'cable:distribution', r: 'drop', b: 'addb', m: 'measure' };
  function renderTools() {
    $('#tools').innerHTML = TOOLS.map(x => x.sep ? '<div class="sep"></div>' : '<button class="tb' + (tool === x.id ? ' on' : '') + '" data-tool="' + x.id + '" title="' + esc(t('tool_' + x.id.replace(':', '_'))) + ' (' + x.k + ')">' + A.ic(x.ic) + '<span class="k">' + x.k + '</span></button>').join('');
  }
  A.setTool = function (id) { tool = id; draw = null; measurePts = []; boxSel = null; renderTools(); svg.classList.toggle('cross', !/^(select|pan)$/.test(id)); hint(); render(); };
  function hint(extra) {
    const h = $('#hint'); let k = 'hint_' + tool.replace(':', '_'); if (tool === 'drop' && draw && draw.fat) k = 'hint_drop2'; if (tool.startsWith('cable:') && draw) k = 'hint_cable2';
    const txt = (tool === 'select' || tool === 'pan') && !extra ? '' : (extra || t(k)); h.textContent = txt; h.style.display = txt ? 'block' : 'none';
  }

  /* ------------------------------------------------------------ rendering */
  let rafPending = false; function requestRender() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); }
  const f1 = v => Math.round(v * 10) / 10;
  function bFill(b) {
    const D = FT.derive(), m = ui.bmode;
    if (m === 'plain') return ['#ffffff', 0.2];
    if (m === 'status') { const c = { planned: '#7d8b9c', passed: '#3b9cff', survey: '#b57bff', connected: '#34d17b', active: '#14e0a5', refused: '#ff5d6c' }[b.status] || '#7d8b9c'; return [c, 0.55]; }
    if (m === 'budget') { const bu = D.budget[b.id]; if (!bu) return ['#7d8b9c', 0.35]; return [{ ok: '#34d17b', over: '#3b9cff', warn: '#ffb02e', fail: '#ff5d6c' }[bu.status], 0.6]; }
    if (!b.fat) return ['#7d8b9c', 0.3]; const n = FT.node(b.fat); return [n ? FT.zoneColor(n) : '#7d8b9c', 0.55];
  }
  function nodeSymbol(n) {
    const c = n.color && n.type === 'fdh' ? n.color : FT.NODE_TYPES[n.type].color, st = '#06090d';
    switch (n.type) {
      case 'co': return '<rect x="-13" y="-13" width="26" height="26" rx="5" fill="' + c + '" stroke="' + st + '" stroke-width="2"/><path d="M-6 -5h3M3 -5h3M-6 0h3M3 0h3M-2 9v-5h4v5" stroke="' + st + '" stroke-width="1.6"/>';
      case 'fdh': return '<rect x="-11" y="-12" width="22" height="24" rx="3" fill="' + c + '" stroke="' + st + '" stroke-width="2"/><path d="M0 -12v24M-6 -5h2M4 -5h2M-6 1h2M4 1h2M-6 7h2M4 7h2" stroke="' + st + '" stroke-width="1.6"/>';
      case 'fat': return '<circle r="10" fill="' + (n.color || c) + '" stroke="' + st + '" stroke-width="2"/><circle r="3.6" fill="' + st + '"/><path d="M0 -10v4M0 6v4M-10 0h4M6 0h4" stroke="' + st + '" stroke-width="1.6"/>';
      case 'closure': return '<path d="M0 -11L11 0 0 11-11 0z" fill="' + c + '" stroke="' + st + '" stroke-width="2"/><path d="M-5 0h10" stroke="' + st + '" stroke-width="1.8"/>';
      case 'pole': return '<circle r="5.5" fill="' + c + '" stroke="' + st + '" stroke-width="1.8"/><path d="M-9 0h18" stroke="' + c + '" stroke-width="2"/>';
      case 'handhole': return '<rect x="-6" y="-6" width="12" height="12" rx="2" fill="' + c + '" stroke="' + st + '" stroke-width="1.8"/>';
      default: return '<circle r="8" fill="' + c + '" stroke="' + st + '" stroke-width="2"/><path d="M-4 0h8M0 -4v8" stroke="' + st + '" stroke-width="1.6"/>';
    }
  }
  function render() {
    if (!FT.state) return; const D = FT.derive(), k = view.k, L = ui.layers, o = [];
    o.push('<defs><clipPath id="bclip"><rect x="' + B.x0 + '" y="' + B.y0 + '" width="' + (B.x1 - B.x0) + '" height="' + (B.y1 - B.y0) + '"/></clipPath></defs>');
    o.push('<g id="vp" transform="translate(' + view.tx + ' ' + view.ty + ') scale(' + k + ')">');
    o.push('<rect x="' + B.x0 + '" y="' + B.y0 + '" width="' + (B.x1 - B.x0) + '" height="' + (B.y1 - B.y0) + '" fill="#0f1620" stroke="#2f4258" stroke-width="1.5" vector-effect="non-scaling-stroke"/>');
    if (ui.img) { const I = S0.image; o.push('<g clip-path="url(#bclip)"><image href="' + I.src + '" x="' + I.x + '" y="' + I.y + '" width="' + I.w + '" height="' + I.h + '" opacity="' + ui.imgOpacity + '" style="filter:brightness(' + ui.imgBright + ')" preserveAspectRatio="none"/></g>'); }
    else { o.push('<g clip-path="url(#bclip)" stroke="#1b2634" stroke-width="1" vector-effect="non-scaling-stroke">'); for (let x = Math.ceil(B.x0 / 50) * 50; x < B.x1; x += 50) o.push('<line x1="' + x + '" y1="' + B.y0 + '" x2="' + x + '" y2="' + B.y1 + '" vector-effect="non-scaling-stroke"/>'); for (let y = Math.ceil(B.y0 / 50) * 50; y < B.y1; y += 50) o.push('<line x1="' + B.x0 + '" y1="' + y + '" x2="' + B.x1 + '" y2="' + y + '" vector-effect="non-scaling-stroke"/>'); o.push('</g>'); }
    if (L.streets) {
      S0.streets.forEach(s => { const p = s.pts.map(q => q.join(',')).join(' '); o.push('<polyline points="' + p + '" fill="none" stroke="' + (ui.img ? '#ffffff' : '#7d8fa6') + '" stroke-opacity="' + (ui.img ? 0.12 : 0.22) + '" stroke-width="' + (ui.img ? 9 : 11) + '" stroke-linecap="round" stroke-linejoin="round"/><polyline points="' + p + '" fill="none" stroke="#c9d6e6" stroke-opacity=".55" stroke-width="1" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>'); });
    }
    if (L.buildings) {
      FT.state.buildings.forEach(b => {
        const [fc, fo] = bFill(b), s = isSel('b', b.id), w = b.x2 - b.x1, h = b.y2 - b.y1;
        o.push('<rect data-t="b" data-id="' + b.id + '" x="' + b.x1 + '" y="' + b.y1 + '" width="' + w + '" height="' + h + '" rx="1.5" fill="' + fc + '" fill-opacity="' + fo + '" stroke="' + (s ? '#ffd166' : '#ffffff') + '" stroke-opacity="' + (s ? 1 : 0.7) + '" stroke-width="' + (s ? 2.6 : 1) + '" vector-effect="non-scaling-stroke" style="cursor:pointer"/>');
      });
    }
    // cables: drops first, then distribution, then feeders on top
    if (L.cables) {
      const order = { drop: 0, distribution: 1, feeder: 2 }, list = FT.state.cables.slice().sort((a, b) => order[a.kind] - order[b.kind]);
      list.forEach(c => {
        if (c.kind === 'drop' && !L.drops) return; const pts = FT.cablePts(c); if (!pts) return; const ps = pts.map(q => f1(q[0]) + ',' + f1(q[1])).join(' '), s = isSel('c', c.id), wd = c.kind === 'feeder' ? 4 : c.kind === 'distribution' ? 3 : 1.5;
        if (s) o.push('<polyline points="' + ps + '" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="' + (wd + 6) + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pointer-events="none"/>');
        const dash = c.status === 'planned' ? (c.kind === 'drop' ? '4 3' : '9 4') : '';
        o.push('<polyline points="' + ps + '" fill="none" stroke="' + esc(c.color) + '" stroke-opacity="' + (c.kind === 'drop' ? 0.9 : 1) + '" stroke-width="' + wd + '" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' vector-effect="non-scaling-stroke" pointer-events="none"/>');
        o.push('<polyline data-t="c" data-id="' + c.id + '" points="' + ps + '" fill="none" stroke="transparent" stroke-width="' + (c.kind === 'drop' ? 9 : 12) + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="cursor:pointer;pointer-events:stroke"/>');
      });
    }
    // labels for streets / buildings
    if (L.streets && L.labels && k > minK * 1.6) S0.streets.forEach(s => { const m = s.pts[Math.floor(s.pts.length / 2)]; o.push('<text transform="translate(' + m[0] + ' ' + (m[1] - 8 / k) + ') scale(' + 1 / k + ')" font-size="10.5" text-anchor="middle" fill="#cfe0f5" opacity=".85" class="nolab" style="stroke:none">' + esc(ui.lang === 'ar' ? s.name : s.en) + '</text>'); });
    if (L.buildings && L.blabels) FT.state.buildings.forEach(b => { const w = b.x2 - b.x1, h = b.y2 - b.y1, fs = Math.max(7.5, Math.min(14, Math.min(w, h) * k * 0.5)); if (Math.min(w, h) * k < 9) return; const c = FT.centre(b); o.push('<text transform="translate(' + f1(c[0]) + ' ' + f1(c[1]) + ') scale(' + 1 / k + ')" font-size="' + f1(fs) + '" text-anchor="middle" dominant-baseline="central" font-weight="700" style="stroke-width:2.4px">' + b.id + '</text>'); });
    if (L.cables && L.cableLabels) FT.state.cables.forEach(c => { if (c.kind === 'drop') return; const pts = FT.cablePts(c); if (!pts) return; let tot = FT.polyLen(pts) / 2, acc = 0, mp = pts[0]; for (let i = 1; i < pts.length; i++) { const d = FT.dist(pts[i - 1], pts[i]); if (acc + d >= tot) { const u = (tot - acc) / d; mp = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; break; } acc += d; } o.push('<text transform="translate(' + mp[0] + ' ' + mp[1] + ') scale(' + 1 / k + ')" font-size="10" text-anchor="middle" fill="' + esc(c.color) + '" style="stroke-width:3px">' + esc(c.name) + ' · ' + c.fibres + 'F · ' + Math.round(D.len[c.id].total) + 'm</text>'); });
    // selected cable handles
    sel.filter(s => s.t === 'c').forEach(s => { const c = FT.cable(s.id); if (!c) return; (c.pts || []).forEach((p, i) => o.push('<g transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + 1 / k + ')" data-t="v" data-id="' + c.id + '" data-i="' + i + '" style="cursor:move"><rect x="-6" y="-6" width="12" height="12" rx="3" fill="#fff" stroke="#111" stroke-width="1.5"/></g>')); });
    // nodes
    if (L.nodes) FT.state.nodes.forEach(n => {
      const s = isSel('n', n.id), lab = L.labels ? '<text x="14" y="4" font-size="11" font-weight="500">' + esc(n.name) + '</text>' : '';
      o.push('<g transform="translate(' + n.x + ' ' + n.y + ') scale(' + 1 / k + ')" data-t="n" data-id="' + n.id + '" style="cursor:' + (tool === 'select' ? 'move' : 'pointer') + '">' + (s ? '<circle r="20" fill="none" stroke="#ffd166" stroke-width="2.4" stroke-dasharray="5 3"/>' : '') + '<circle r="17" fill="transparent"/>' + nodeSymbol(n) + lab + '</g>');
    });
    // overlays: cable being drawn, measure, box select
    if (draw && draw.a && (tool.startsWith('cable:') || tool === 'drop')) { const a = draw.a === 'fat' ? null : FT.endPos(draw.a); const start = tool === 'drop' ? (draw.fat ? [FT.node(draw.fat).x, FT.node(draw.fat).y] : null) : a; if (start) { const ps = [start].concat(draw.pts || [], [mouseW]).map(q => f1(q[0]) + ',' + f1(q[1])).join(' '); o.push('<polyline points="' + ps + '" fill="none" stroke="#ffd166" stroke-width="2.4" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" pointer-events="none"/>'); } }
    if (tool === 'drop' && draw && draw.fat) { const n = FT.node(draw.fat); if (n) o.push('<circle cx="' + n.x + '" cy="' + n.y + '" r="' + 24 / k + '" fill="none" stroke="#ffd166" stroke-width="2" vector-effect="non-scaling-stroke"/>'); }
    if (tool === 'measure' && measurePts.length) { const ps = measurePts.concat([mouseW]).map(q => f1(q[0]) + ',' + f1(q[1])).join(' '); o.push('<polyline points="' + ps + '" fill="none" stroke="#7df9ff" stroke-width="2.4" vector-effect="non-scaling-stroke" pointer-events="none"/>'); measurePts.forEach(p => o.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + 4 / k + '" fill="#7df9ff"/>')); const len = FT.polyLen(measurePts.concat([mouseW])) * FT.state.settings.scale; o.push('<text transform="translate(' + mouseW[0] + ' ' + (mouseW[1] - 12 / k) + ') scale(' + 1 / k + ')" font-size="12" font-weight="700" fill="#7df9ff" text-anchor="middle">' + len.toFixed(1) + ' m  (+' + FT.state.settings.slack + '% = ' + (len * (1 + FT.state.settings.slack / 100)).toFixed(1) + ' m)</text>'); }
    if (boxSel) o.push('<rect x="' + Math.min(boxSel.a[0], boxSel.b[0]) + '" y="' + Math.min(boxSel.a[1], boxSel.b[1]) + '" width="' + Math.abs(boxSel.a[0] - boxSel.b[0]) + '" height="' + Math.abs(boxSel.a[1] - boxSel.b[1]) + '" fill="#ffd16622" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" pointer-events="none"/>');
    o.push('</g>');
    svg.innerHTML = o.join('');
    renderScale(); renderLegend();
  }
  function renderScale() { const sc = FT.state.settings.scale, targets = [5, 10, 20, 50, 100, 200], pxPerM = view.k / sc; let m = targets[0]; for (const x of targets) { if (x * pxPerM >= 60) { m = x; break; } m = x; } $('#scalebar').innerHTML = '<i style="width:' + Math.round(m * pxPerM) + 'px"></i>' + m + ' m'; }
  function renderLegend() {
    const lg = $('#legend'), m = ui.bmode; let rows = [];
    if (m === 'fat') rows = FT.state.nodes.filter(n => n.type === 'fdh').map(n => [n.color || '#3b9cff', n.name]).concat([['#7d8b9c', t('lg_unassigned')]]);
    else if (m === 'status') rows = FT.B_STATUS.map(s => [{ planned: '#7d8b9c', passed: '#3b9cff', survey: '#b57bff', connected: '#34d17b', active: '#14e0a5', refused: '#ff5d6c' }[s], t('bst_' + s)]);
    else if (m === 'budget') rows = [['#34d17b', t('lg_ok')], ['#ffb02e', t('lg_warn')], ['#ff5d6c', t('lg_fail')], ['#3b9cff', t('lg_over')]];
    lg.style.display = rows.length ? 'block' : 'none'; lg.innerHTML = '<b style="font-size:11px;color:var(--tx3)">' + esc(t('bm_' + m)) + '</b>' + rows.map(r => '<div><i style="background:' + r[0] + '"></i>' + esc(r[1]) + '</div>').join('');
  }
  function renderStatus() {
    const D = FT.derive(), st = FT.stats(), ch = FT.checks(), er = ch.filter(c => c.sev === 'error').length, wr = ch.filter(c => c.sev === 'warn').length;
    $('#status').innerHTML = '<span>' + t('st_homes') + ': <b>' + st.assigned + '/' + st.homes + '</b></span><span>' + t('st_cable') + ': <b>' + (st.totalCable / 1000).toFixed(2) + ' km</b></span><span>' + t('st_nodes') + ': <b>' + FT.state.nodes.length + '</b></span><span>' + t('st_worst') + ': <b>' + (st.worst ? st.worst.loss.toFixed(1) + ' dB' : '—') + '</b></span><span style="cursor:pointer" id="stChecks">' + t('st_checks') + ': <b style="color:' + (er ? 'var(--bad)' : wr ? 'var(--warn)' : 'var(--ok)') + '">' + er + ' ⛔ ' + wr + ' ⚠</b></span><span style="margin-inline-start:auto;color:var(--tx3)">' + esc(t('st_proto')) + '</span>';
    const sc = $('#stChecks'); if (sc) sc.onclick = () => A.dialog && A.dialog('checks');
  }
  function renderHeader() { $('#pname').textContent = FT.state.meta.name || 'FTTH'; $('#psub').textContent = [FT.state.meta.area, 'v' + FT.state.meta.version].filter(Boolean).join(' · '); document.title = (FT.state.meta.name || 'FTTH') + ' — FTTH Planner'; }
  A.renderHeader = renderHeader; A.render = render; A.renderStatus = renderStatus; A.renderInspector = () => renderInspector();

  /* ------------------------------------------------------------ pointer interaction */
  function pickRaw(el) { return el ? { t: el.dataset.t, id: el.dataset.id, i: el.dataset.i } : null; }
  function pick(e) {
    const el = e.target.closest ? e.target.closest('[data-t]') : null; let h = pickRaw(el); if (!h || h.t !== 'c') return h;
    // a thin drop cable that crosses a house must not hide the house (and in the connect/draw tools only nodes/houses count)
    const c = FT.cable(h.id), wantUnder = (tool === 'drop' || tool.startsWith('cable:')) || (c && c.kind === 'drop' && !isSel('c', c.id));
    if (wantUnder && document.elementsFromPoint) { const under = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.dataset && (x.dataset.t === 'n' || x.dataset.t === 'b')); if (under) return pickRaw(under); }
    return h;
  }
  const idOf = (tt, id) => tt === 'b' ? +id : id;
  function snapPoint(p, e) { if (!FT.state.settings.snapStreet || (e && e.altKey)) return p; const r = FT.nearOnStreets(p); return r && r.d < 9 / view.k ? r.pt : p; }
  function nodeAt(e) { const p = pick(e); return p && p.t === 'n' ? p.id : null; }
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { drag = { type: 'pinch' }; return; }
    const w = toWorld(e.clientX, e.clientY), hit = pick(e); mouseW = w;
    if (e.button === 1 || spaceDown || tool === 'pan') { drag = { type: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; svg.classList.add('grabbing'); return; }
    if (tool === 'select') {
      if (hit && hit.t === 'v') { drag = { type: 'vertex', id: hit.id, i: +hit.i, moved: false }; return; }
      if (hit && hit.t === 'n') { const already = isSel('n', hit.id); if (!already) sel = e.shiftKey ? sel.concat([{ t: 'n', id: hit.id }]) : [{ t: 'n', id: hit.id }]; const n = FT.node(hit.id); drag = { type: 'node', id: hit.id, off: [w[0] - n.x, w[1] - n.y], moved: false }; render(); renderInspector(); return; }
      if (hit && (hit.t === 'b' || hit.t === 'c')) {
        const id = idOf(hit.t, hit.id); if (e.shiftKey) { sel = isSel(hit.t, id) ? sel.filter(s => !(s.t === hit.t && s.id === id)) : sel.concat([{ t: hit.t, id }]); } else sel = [{ t: hit.t, id }];
        render(); renderInspector(); if (hit.t === 'c') drag = { type: 'cablepending', id, x: e.clientX, y: e.clientY, w }; return;
      }
      if (e.shiftKey) { boxSel = { a: w, b: w }; drag = { type: 'box' }; return; }
      if (sel.length) { sel = []; render(); renderInspector(); }
      drag = { type: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; svg.classList.add('grabbing'); return;
    }
    if (tool.startsWith('add:')) { const type = tool.slice(4), p = snapPoint(w, e), n = FT.addNode(type, p[0], p[1]); sel = [{ t: 'n', id: n.id }]; A.commit(); return; }
    if (tool === 'addb') { drag = { type: 'newb', a: w, b: w }; return; }
    if (tool === 'measure') { measurePts.push(snapPoint(w, e)); render(); return; }
    if (tool.startsWith('cable:')) {
      const kind = tool.slice(6);
      if (!draw) { if (hit && hit.t === 'n') { draw = { a: { t: 'n', id: hit.id }, pts: [] }; hint(); render(); } return; }
      if (hit && hit.t === 'n' && hit.id !== draw.a.id) {   // finish at this node
        const a = FT.node(draw.a.id), b = FT.node(hit.id); let pts = draw.pts.slice();
        if (!pts.length && FT.state.settings.snapStreet) pts = FT.route([a.x, a.y], [b.x, b.y]);
        const c = FT.addCable(kind, draw.a, { t: 'n', id: hit.id }, pts); if (kind === 'distribution') { const z = FT.zoneColor(a); c.color = z; }
        draw = null; sel = [{ t: 'c', id: c.id }]; hint(); A.commit(); toast(t('cable_added', c.name)); return;
      }
      draw.pts.push(snapPoint(w, e)); render(); return;
    }
    if (tool === 'drop') {
      if (hit && hit.t === 'n') { const n = FT.node(hit.id); if (n.type === 'fat' || n.type === 'pole' || n.type === 'closure' || n.type === 'fdh') { draw = { fat: hit.id, a: { t: 'n', id: hit.id }, pts: [] }; sel = [{ t: 'n', id: hit.id }]; hint(); render(); renderInspector(); } return; }
      if (hit && hit.t === 'b' && draw && draw.fat) {
        const b = FT.bld(+hit.id), n = FT.node(draw.fat); if (b.fat === draw.fat) { toast(t('already_here')); return; }
        if (FT.derive().portsUsed[n.id] >= (+n.props.ports || 999) && n.type === 'fat') toast(t('fat_full', n.name));
        FT.assign(b.id, draw.fat); A.commit({ noInspector: false }); toast(t('assigned_to', b.id, n.name, b.port)); return;
      }
      if (!hit && draw) { draw.pts.push(snapPoint(w, e)); render(); } return;
    }
  });
  svg.addEventListener('pointermove', e => {
    const w = toWorld(e.clientX, e.clientY); mouseW = w; $('#coords').textContent = (w[0] * FT.state.settings.scale).toFixed(0) + ' , ' + (w[1] * FT.state.settings.scale).toFixed(0) + ' m';
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag && drag.type === 'pinch' && pointers.size === 2) { const [p, q] = [...pointers.values()], d = Math.hypot(p.x - q.x, p.y - q.y); if (drag.d) zoomAt((p.x + q.x) / 2, (p.y + q.y) / 2, d / drag.d); drag.d = d; return; }
    if (!drag) { if ((tool.startsWith('cable:') && draw) || tool === 'measure' || (tool === 'drop' && draw)) requestRender(); return; }
    if (drag.type === 'pan') { view.tx = drag.tx + (e.clientX - drag.x); view.ty = drag.ty + (e.clientY - drag.y); clampView(); requestRender(); }
    else if (drag.type === 'node') { const n = FT.node(drag.id); let p = [w[0] - drag.off[0], w[1] - drag.off[1]]; if (!e.altKey) p = snapPoint(p, e); const dx = p[0] - n.x, dy = p[1] - n.y; if (Math.hypot(dx, dy) > 0.01) drag.moved = true; sel.filter(s => s.t === 'n').forEach(s => { const m = FT.node(s.id); m.x = f1(m.x + dx); m.y = f1(m.y + dy); }); FT.invalidate(); requestRender(); }
    else if (drag.type === 'vertex') { const c = FT.cable(drag.id); c.pts[drag.i] = snapPoint(w, e).map(f1); drag.moved = true; FT.invalidate(); requestRender(); }
    else if (drag.type === 'cablepending') { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.type = 'none'; } }
    else if (drag.type === 'box') { boxSel.b = w; requestRender(); }
    else if (drag.type === 'newb') { drag.b = w; requestRender(); boxSel = { a: drag.a, b: drag.b }; }
  });
  function endDrag(e) {
    pointers.delete(e.pointerId); svg.classList.remove('grabbing'); if (!drag) return; const d = drag; if (pointers.size < 2 && d.type === 'pinch') { drag = null; return; } drag = null;
    if (d.type === 'node' && d.moved) { A.commit(); } else if (d.type === 'vertex' && d.moved) A.commit();
    else if (d.type === 'box') { const a = boxSel.a, b = boxSel.b, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); boxSel = null; FT.state.buildings.forEach(bb => { const c = FT.centre(bb); if (c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1 && !isSel('b', bb.id)) sel.push({ t: 'b', id: bb.id }); }); render(); renderInspector(); }
    else if (d.type === 'newb') {
      boxSel = null; let x0 = Math.min(d.a[0], d.b[0]), x1 = Math.max(d.a[0], d.b[0]), y0 = Math.min(d.a[1], d.b[1]), y1 = Math.max(d.a[1], d.b[1]); if (x1 - x0 < 4 || y1 - y0 < 4) { x1 = x0 + 14; y1 = y0 + 14; }
      const id = Math.max(0, ...FT.state.buildings.map(b => b.id)) + 1; FT.state.buildings.push({ id, block: '', x1: f1(x0), y1: f1(y0), x2: f1(x1), y2: f1(y1), name: '', units: 1, floors: 1, status: 'planned', fat: null, port: '', plan: '', ont: { model: '', serial: '' }, contact: '', notes: '' }); sel = [{ t: 'b', id }]; A.commit(); toast(t('house_added', id));
    }
  }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  svg.addEventListener('dblclick', e => {
    const hit = pick(e); const w = toWorld(e.clientX, e.clientY);
    if (tool === 'measure') { measurePts = []; render(); return; }
    if (tool.startsWith('cable:') && draw) { draw = null; hint(); render(); return; }
    if (tool === 'select' && hit && hit.t === 'c') {   // add a vertex on the cable path
      const c = FT.cable(hit.id), pts = FT.cablePts(c); let bi = 0, bd = 1e9; for (let i = 1; i < pts.length; i++) { const r = FT.nearOnSeg(w, pts[i - 1], pts[i]); if (r.d < bd) { bd = r.d; bi = i - 1; } }
      c.pts.splice(bi, 0, [f1(w[0]), f1(w[1])]); A.commit(); return;
    }
    if (tool === 'select' && hit && (hit.t === 'n' || hit.t === 'b')) A.zoomTo(...(hit.t === 'n' ? [FT.node(hit.id).x, FT.node(hit.id).y] : FT.centre(FT.bld(+hit.id))), Math.max(view.k, minK * 4));
  });
  svg.addEventListener('contextmenu', e => {
    e.preventDefault(); const hit = pick(e);
    if (hit && hit.t === 'v') { const c = FT.cable(hit.id); c.pts.splice(+hit.i, 1); A.commit(); return; }
    if (draw) { if (draw.pts && draw.pts.length) draw.pts.pop(); else { draw = null; } hint(); render(); return; }
    if (measurePts.length) { measurePts = []; render(); }
  });
  window.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    if ($('#modal').classList.contains('open')) { if (e.key === 'Escape') A.closeModal(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) { if (k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); } else if (k === 'y') { e.preventDefault(); A.redo(); } else if (k === 's') { e.preventDefault(); A.dialog && A.exportJSON(); } return; }
    if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
    if (e.key === 'Escape') { if (draw || measurePts.length || tool !== 'select') { draw = null; measurePts = []; A.setTool('select'); } else { sel = []; render(); renderInspector(); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { A.deleteSelection(); return; }
    if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
    if (e.key === '+' || e.key === '=') { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); return; }
    if (e.key === '-') { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.25); return; }
    if (e.key === 'f' || e.key === 'F') { A.fit(); return; }
    if (TKEYS[k]) A.setTool(TKEYS[k]);
  });
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
  A.deleteSelection = function () {
    if (!sel.length) return; const names = sel.map(s => s.t === 'n' ? (FT.node(s.id) || {}).name : s.t === 'c' ? (FT.cable(s.id) || {}).name : '#' + s.id).join(', ');
    if (!confirm(t('confirm_delete', names))) return;
    sel.forEach(s => { if (s.t === 'n') FT.deleteNode(s.id); else if (s.t === 'c') FT.deleteCable(s.id); else { const dc = FT.state.cables.find(c => c.kind === 'drop' && c.b.t === 'b' && c.b.id === s.id); if (dc) FT.deleteCable(dc.id); FT.state.buildings = FT.state.buildings.filter(b => b.id !== s.id); } });
    sel = []; A.commit();
  };

  /* ------------------------------------------------------------ inspector */
  const numVal = A.numVal = v => { const n = parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(',', '.')); return isNaN(n) ? '' : n; };
  const STATUS_OPTS = (list, prefix) => list.map(s => [s, t(prefix + s)]);
  function opts(list, cur) { return list.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join(''); }
  function fld(label, o, k, val, kind, extra) {
    extra = extra || {}; const pk = extra.pk ? ' data-pk="' + extra.pk + '"' : '', id = extra.id != null ? ' data-id="' + esc(extra.id) + '"' : '', ty = ' data-ty="' + (kind || 'text') + '"', base = ' data-o="' + o + '" data-k="' + k + '"' + pk + id + ty;
    let inp; if (kind === 'select') inp = '<select' + base + '>' + opts(extra.options, val) + '</select>'; else if (kind === 'area') inp = '<textarea' + base + '>' + esc(val) + '</textarea>'; else if (kind === 'color') inp = '<input type="color"' + base + ' value="' + esc(val) + '">'; else if (kind === 'num') inp = '<input type="text" inputmode="decimal" dir="ltr" lang="en"' + base + ' value="' + esc(val) + '">'; else inp = '<input type="text"' + base + ' value="' + esc(val) + '"' + (extra.ro ? ' readonly' : '') + '>';
    return '<div class="row"><label>' + esc(label) + '</label><div class="v">' + inp + '</div></div>';
  }
  const badge = st => '<span class="badge b-' + ({ ok: 'ok', warn: 'warn', fail: 'fail', over: 'over' }[st] || 'n') + '">' + t('bs_' + st) + '</span>';
  const bar = (u, c) => { const p = c ? Math.min(100, u / c * 100) : 0; return '<div class="bar"><i class="' + (u > c ? 'e' : p > 85 ? 'w' : '') + '" style="width:' + p + '%"></i></div>'; };
  function renderInspector() {
    const el = $('#inspector'); if (!FT.state) return; const D = FT.derive();
    if (!sel.length) { el.innerHTML = inspectorHome(); return; }
    if (sel.length > 1) { el.innerHTML = inspectorMulti(); return; }
    const s = sel[0]; el.innerHTML = s.t === 'n' ? inspectorNode(FT.node(s.id), D) : s.t === 'c' ? inspectorCable(FT.cable(s.id), D) : inspectorBld(FT.bld(s.id), D);
  }
  function inspectorHome() {
    const st = FT.stats(); const S = FT.state.settings, pr = FT.profile();
    return '<div class="ph"><b>' + esc(FT.state.meta.name) + '</b></div><div class="sec"><div class="kv"><span>' + t('st_homes') + '</span><span>' + st.assigned + ' / ' + st.homes + '</span><span>' + t('st_cable') + '</span><span>' + (st.totalCable / 1000).toFixed(2) + ' km</span><span>' + t('pon_profile') + '</span><span>' + esc(pr.name.split(' (')[0]) + '</span><span>' + t('st_worst') + '</span><span>' + (st.worst ? st.worst.loss.toFixed(1) + ' dB' : '—') + '</span></div></div>' +
      '<div class="sec"><h4>' + t('display') + '</h4><div class="row"><label>' + t('bm_title') + '</label><div class="v"><select id="selBmode">' + opts([['fat', t('bm_fat')], ['status', t('bm_status')], ['budget', t('bm_budget')], ['plain', t('bm_plain')]], ui.bmode) + '</select></div></div><div class="row"><label>' + t('img_opacity') + '</label><div class="v"><input type="range" id="rngImg" min="0.15" max="1" step="0.05" value="' + ui.imgOpacity + '"></div></div><div class="row"><label>' + t('img_bright') + '</label><div class="v"><input type="range" id="rngBright" min="0.5" max="1.6" step="0.05" value="' + ui.imgBright + '"></div></div></div>' +
      '<div class="sec"><h4>' + t('layers') + '</h4>' + ['streets', 'buildings', 'cables', 'nodes', 'labels', 'blabels', 'cableLabels', 'drops'].map(k => '<label style="display:flex;gap:8px;align-items:center;margin:5px 0"><input type="checkbox" data-layer="' + k + '"' + (ui.layers[k] ? ' checked' : '') + '>' + t('ly_' + k) + '</label>').join('') + '</div>' +
      '<div class="sec"><div class="tip">' + t('home_tip') + '</div><div class="btns"><button class="btn" data-act="dlg" data-d="checks">' + A.ic('check') + t('m_checks') + '</button><button class="btn" data-act="dlg" data-d="reports">' + A.ic('report') + t('m_reports') + '</button></div></div>';
  }
  function inspectorMulti() {
    const bl = sel.filter(s => s.t === 'b').map(s => FT.bld(s.id)); const fats = FT.state.nodes.filter(n => n.type === 'fat' || n.type === 'closure' || n.type === 'pole');
    if (!bl.length) return '<div class="ph"><b>' + t('multi_sel', sel.length) + '</b></div><div class="sec"><button class="btn danger" data-act="del">' + A.ic('trash') + t('delete') + '</button></div>';
    return '<div class="ph"><b>' + t('multi_homes', bl.length) + '</b></div><div class="sec"><h4>' + t('assign_to') + '</h4><select id="mAssign">' + opts(fats.map(n => [n.id, n.name]), '') + '</select><div class="btns"><button class="btn pri" data-act="massign">' + t('assign') + '</button></div></div>' +
      '<div class="sec"><h4>' + t('status') + '</h4><select id="mStatus">' + opts(STATUS_OPTS(FT.B_STATUS, 'bst_'), 'planned') + '</select><div class="btns"><button class="btn" data-act="mstatus">' + t('apply') + '</button><button class="btn danger" data-act="del">' + A.ic('trash') + t('delete') + '</button></div></div>';
  }
  function inspectorNode(n, D) {
    if (!n) return ''; const nt = FT.NODE_TYPES[n.type], isFat = n.type === 'fat', isFdh = n.type === 'fdh', isCo = n.type === 'co', P = n.props;
    let h = '<div class="ph"><span class="dot" style="background:' + (n.type === 'fdh' && n.color ? n.color : nt.color) + '"></span><b>' + esc(n.name) + '</b><small>' + t('nt_' + n.type) + '</small></div>';
    h += '<div class="sec">' + fld(t('f_name'), 'n', 'name', n.name, 'text', { id: n.id }) + fld(t('f_status'), 'n', 'status', n.status, 'select', { id: n.id, options: STATUS_OPTS(FT.STATUS, 'st_') }) + (isFdh ? fld(t('f_zone_color'), 'n', 'color', n.color || '#3b9cff', 'color', { id: n.id }) : '') + '</div>';
    h += '<div class="sec"><h4>' + t('f_equipment') + '</h4>';
    if (isCo) h += fld(t('f_olt'), 'n', 'olt', P.olt || '', 'text', { id: n.id, pk: 'olt' }) + fld(t('f_pon_ports'), 'n', 'ponPorts', P.ponPorts, 'num', { id: n.id, pk: 'ponPorts', min: 0 }) + fld(t('f_tx'), 'n', 'txOverride', P.txOverride == null ? '' : P.txOverride, 'num', { id: n.id, pk: 'txOverride' });
    if (isFdh) h += fld(t('f_slots'), 'n', 'slots', P.slots, 'num', { id: n.id, pk: 'slots', min: 0 });
    if (isFat) h += fld(t('f_ports'), 'n', 'ports', P.ports, 'num', { id: n.id, pk: 'ports', min: 1 });
    if (n.type === 'closure') h += fld(t('f_trays'), 'n', 'trays', P.trays || 4, 'num', { id: n.id, pk: 'trays', min: 1 });
    if (isFdh || isFat || n.type === 'closure' || isCo) h += fld(t('f_split'), 'n', 'split', P.split || 'none', 'select', { id: n.id, pk: 'split', options: Object.keys(FT.state.settings.splitterLoss).map(r => [r, r === 'none' ? t('none') : '\u2066' + r + '  (' + FT.splitLoss(r).toFixed(1) + ' dB)\u2069']) }) + fld(t('f_conn'), 'n', 'conn', P.conn, 'num', { id: n.id, pk: 'conn', min: 0 }) + fld(t('f_splice'), 'n', 'splice', P.splice, 'num', { id: n.id, pk: 'splice', min: 0 });
    h += fld(t('f_notes'), 'n', 'notes', n.notes || '', 'area', { id: n.id }) + '</div>';
    // derived
    h += '<div class="sec"><h4>' + t('f_derived') + '</h4>';
    if (isFat) { const used = D.portsUsed[n.id], cap = +P.ports || 0; h += '<div class="kv"><span>' + t('d_ports') + '</span><span>' + used + ' / ' + cap + '</span></div>' + bar(used, cap); }
    if (isFdh) { const need = D.splittersNeeded[n.id] || 0, cap = +P.slots || 0, N = FT.splitN(P.split); h += '<div class="kv"><span>' + t('d_splitters') + '</span><span>' + need + ' / ' + cap + ' (' + (P.split || 'none') + ')</span><span>' + t('d_outputs') + '</span><span>' + (D.children[n.id].reduce((s, c) => s + (D.cableUsed[c.id] || 0), 0)) + ' / ' + (need * N) + '</span></div>' + bar(need, cap); }
    if (isCo) { let need = 0; D.children[n.id].forEach(c => need += D.cableUsed[c.id] || 0); h += '<div class="kv"><span>' + t('d_pon') + '</span><span>' + need + ' / ' + (+P.ponPorts || 0) + '</span></div>' + bar(need, +P.ponPorts || 0); }
    const pc = D.parent[n.id]; if (pc) h += '<div class="kv"><span>' + t('d_feed') + '</span><span><a href="#" data-act="selcable" data-id="' + pc.id + '" style="color:var(--ac2)">' + esc(pc.name) + '</a></span></div>';
    const ch = D.children[n.id]; if (ch.length) h += '<div class="tip">' + t('d_out_cables') + ': ' + ch.map(c => '<a href="#" data-act="selcable" data-id="' + c.id + '" style="color:var(--ac2)">' + esc(c.name) + '</a>').join(' · ') + '</div>';
    h += '</div>';
    if (isFdh && FT.splitN(P.split) > 1) { const al = FT.fdhAlloc(n.id); if (al.spl.length) h += '<div class="sec"><h4>' + t('splitter_table') + '</h4><table class="t"><tr><th>' + t('f_split') + '</th><th>' + t('port') + '</th><th>→</th></tr>' + al.spl.map(s => s.outs.map((o, i) => '<tr>' + (i === 0 ? '<td rowspan="' + s.outs.length + '" style="white-space:nowrap">' + esc(s.name.replace('SPL-' + n.name + '-', 'SPL-')) + ' <small>(' + P.split + ')</small></td>' : '') + '<td class="n">' + o.port + '</td><td>' + esc(o.cable) + ' #' + o.fibre + '</td></tr>').join('')).join('') + '</table></div>'; }
    if (isCo) { const al = FT.coAlloc(n.id); if (al.rows.length) h += '<div class="sec"><h4>' + t('pon_table') + '</h4><table class="t"><tr><th>PON</th><th>' + t('rp_cable') + '</th><th>' + t('fibre') + '</th></tr>' + al.rows.map(r => '<tr><td class="n">' + r.pon + '</td><td>' + esc(r.cable) + '</td><td class="n">#' + r.fibre + '</td></tr>').join('') + '</table></div>'; }
    if (isFat) {
      const hs = FT.state.buildings.filter(b => b.fat === n.id).sort((a, b) => (+a.port || 99) - (+b.port || 99));
      h += '<div class="sec"><h4>' + t('port_map') + '</h4><table class="t"><tr><th>#</th><th>' + t('f_house') + '</th><th>' + t('f_status') + '</th><th>Rx</th></tr>' + hs.map(b => { const bu = D.budget[b.id]; return '<tr style="cursor:pointer" data-act="selbld" data-id="' + b.id + '"><td class="n">' + (b.port || '—') + '</td><td>#' + b.id + (b.name ? ' ' + esc(b.name) : '') + '</td><td>' + t('bst_' + b.status) + '</td><td class="n">' + (bu ? bu.rx.toFixed(1) : '—') + '</td></tr>'; }).join('') + '</table><div class="btns"><button class="btn pri" data-act="connect" data-id="' + n.id + '">' + A.ic('drop') + t('connect_homes') + '</button></div></div>';
    }
    if (isFdh || isCo) h += '<div class="sec"><div class="btns"><button class="btn" data-act="newcable" data-kind="' + (isCo ? 'feeder' : 'distribution') + '" data-id="' + n.id + '">' + A.ic(isCo ? 'feeder' : 'distribution') + t(isCo ? 'tool_cable_feeder' : 'tool_cable_distribution') + '</button></div></div>';
    if (isFdh || isFat || n.type === 'closure') {
      const att = FT.state.cables.filter(c => (c.a && c.a.t === 'n' && c.a.id === n.id) || (c.b && c.b.t === 'n' && c.b.id === n.id)), sp = n.splices || [];
      const copt = sel0 => '<option value="">—</option>' + att.map(c => '<option value="' + c.id + '"' + (c.id === sel0 ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      h += '<div class="sec"><h4>' + t('splice_records') + '</h4>' + (sp.length ? '<table class="t"><tr><th>' + t('rp_cable') + ' A</th><th>#</th><th>' + t('rp_cable') + ' B</th><th>#</th><th>dB</th><th></th></tr>' + sp.map((r, i) => '<tr><td><select data-o="spl" data-id="' + n.id + '" data-i="' + i + '" data-k="a">' + copt(r.a) + '</select></td><td><input type="text" inputmode="numeric" dir="ltr" style="width:44px" data-o="spl" data-id="' + n.id + '" data-i="' + i + '" data-k="fa" value="' + esc(r.fa) + '"></td><td><select data-o="spl" data-id="' + n.id + '" data-i="' + i + '" data-k="b">' + copt(r.b) + '</select></td><td><input type="text" inputmode="numeric" dir="ltr" style="width:44px" data-o="spl" data-id="' + n.id + '" data-i="' + i + '" data-k="fb" value="' + esc(r.fb) + '"></td><td><input type="text" inputmode="decimal" dir="ltr" style="width:48px" data-o="spl" data-id="' + n.id + '" data-i="' + i + '" data-k="loss" value="' + esc(r.loss) + '"></td><td><button class="btn sm danger" data-act="delsplice" data-id="' + n.id + '" data-i="' + i + '">×</button></td></tr>').join('') + '</table>' : '<div class="tip">' + t('splice_none') + '</div>') + '<div class="btns"><button class="btn sm" data-act="addsplice" data-id="' + n.id + '">+ ' + t('add_splice') + '</button></div></div>';
    }
    h += '<div class="sec"><div class="btns"><button class="btn" data-act="zoom">' + A.ic('pin') + t('zoom_to') + '</button><button class="btn" data-act="dup">' + t('duplicate') + '</button><button class="btn danger" data-act="del">' + A.ic('trash') + t('delete') + '</button></div></div>';
    return h;
  }
  function inspectorCable(c, D) {
    if (!c) return ''; const len = D.len[c.id], used = D.cableUsed[c.id] || 0, a = c.a && (c.a.t === 'n' ? FT.node(c.a.id) : FT.bld(c.a.id)), b = c.b && (c.b.t === 'n' ? FT.node(c.b.id) : null), bb = c.b && c.b.t === 'b' ? FT.bld(c.b.id) : null;
    const code = FT.COLOR_CODES[FT.state.settings.colorStd];
    let h = '<div class="ph"><span class="dot" style="background:' + esc(c.color) + '"></span><b>' + esc(c.name) + '</b><small>' + t('ck_' + c.kind) + '</small></div>';
    h += '<div class="sec">' + fld(t('f_name'), 'c', 'name', c.name, 'text', { id: c.id }) + fld(t('f_kind'), 'c', 'kind', c.kind, 'select', { id: c.id, options: ['feeder', 'distribution', 'drop'].map(k => [k, t('ck_' + k)]) }) +
      fld(t('f_ctype'), 'c', 'cableType', c.cableType, 'select', { id: c.id, options: Object.keys(FT.CABLE_TYPES).map(k => [k, A.tl(FT.CABLE_TYPES[k])]) }) + fld(t('f_fibres'), 'c', 'fibres', c.fibres, 'select', { id: c.id, options: FT.FIBRE_COUNTS.map(n => [n, '\u2066' + n + ' F\u2069']) }) +
      fld(t('f_install'), 'c', 'install', c.install, 'select', { id: c.id, options: FT.INSTALL.map(k => [k, A.tl(FT.INSTALL_LABEL[k])]) }) + fld(t('f_status'), 'c', 'status', c.status, 'select', { id: c.id, options: STATUS_OPTS(FT.STATUS, 'st_') }) + fld(t('f_slack'), 'c', 'slack', c.slack === '' || c.slack == null ? '' : c.slack, 'num', { id: c.id }) +
      fld(t('f_color'), 'c', 'color', c.color, 'color', { id: c.id }) + '<div class="pal">' + code.map(x => '<i style="background:' + x.hex + '" data-act="paint" data-hex="' + x.hex + '" title="' + esc(A.tl(x)) + '"></i>').join('') + '</div>' + fld(t('f_notes'), 'c', 'notes', c.notes || '', 'area', { id: c.id }) + '</div>';
    h += '<div class="sec"><h4>' + t('test_results') + '</h4>' + fld(t('f_test_loss'), 'c', 'testLoss', c.testLoss == null ? '' : c.testLoss, 'num', { id: c.id }) + fld(t('f_test_date'), 'c', 'testDate', c.testDate || '', 'text', { id: c.id }) + fld(t('f_tester'), 'c', 'tester', c.tester || '', 'text', { id: c.id }) + '</div>';
    h += '<div class="sec"><h4>' + t('f_route') + '</h4><div class="kv"><span>' + t('d_from') + '</span><span>' + esc(a ? (a.name || '#' + a.id) : '?') + '</span><span>' + t('d_to') + '</span><span>' + esc(b ? b.name : bb ? '#' + bb.id : '?') + '</span><span>' + t('d_geo') + '</span><span>' + len.geo.toFixed(1) + ' m</span><span>' + t('d_slack') + '</span><span>+' + len.slack.toFixed(1) + ' m</span><span>' + t('d_loops') + '</span><span>+' + len.loops.toFixed(0) + ' m</span><span><b>' + t('d_total') + '</b></span><span><b>' + len.total.toFixed(1) + ' m</b></span></div>' +
      '<div class="btns"><button class="btn" data-act="reroute">' + t('reroute') + '</button><button class="btn" data-act="straight">' + t('straighten') + '</button><button class="btn" data-act="swap">' + t('swap_dir') + '</button></div><div class="tip">' + t('cable_tip') + '</div></div>';
    h += '<div class="sec"><h4>' + t('d_fibre_use') + ': ' + used + ' / ' + c.fibres + '</h4>' + bar(used, c.fibres) + '</div>';
    h += '<div class="sec"><h4>' + t('fibre_table') + '</h4><div class="fibtbl"><table class="t"><tr><th>#</th><th>' + t('tube') + '</th><th>' + t('fibre') + '</th><th>' + t('f_status') + '</th><th>' + t('f_label') + '</th></tr>' + fibreRows(c, used) + '</table></div></div>';
    h += '<div class="sec"><div class="btns"><button class="btn" data-act="zoom">' + A.ic('pin') + t('zoom_to') + '</button><button class="btn danger" data-act="del">' + A.ic('trash') + t('delete') + '</button></div></div>';
    return h;
  }
  A.fibreLabel = function (c, idx, used) {   // automatic description of what a fibre is used for
    if (idx > used) return ''; if (c.kind === 'drop') { const b = c.b && c.b.t === 'b' ? FT.bld(c.b.id) : null; return b ? 'ONT #' + b.id + (b.port ? ' (port ' + b.port + ')' : '') : ''; }
    const an = c.a && c.a.t === 'n' ? FT.node(c.a.id) : null, bn = c.b && c.b.t === 'n' ? FT.node(c.b.id) : null; let lab = '';
    if (an && an.type === 'co') { const m = FT.coAlloc(an.id).byCable[c.id]; lab += (m && m[idx] ? 'PON ' + m[idx] : '') + ' '; }
    if (an && an.type === 'fdh') { const m = FT.fdhAlloc(an.id).byCable[c.id]; lab += (m && m[idx] ? m[idx].spl + ' out ' + m[idx].out : '') + ' '; }
    if (bn) lab += '→ ' + bn.name + (bn.type === 'fdh' && FT.splitN(bn.props.split) > 1 ? ' (SPL in)' : bn.type === 'fat' && FT.splitN(bn.props.split) > 1 ? ' (' + bn.props.split + ')' : '');
    return lab.trim();
  };
  function fibreRows(c, used) {
    const ov = c.fibOv || {}, rows = []; const cap = Math.min(c.fibres, 288);
    for (let i = 1; i <= cap; i++) {
      const fi = FT.fibreInfo(i), o = ov[i] || {}, auto = i <= used ? 'used' : 'spare', stt = o.status || auto, lab = o.label != null ? o.label : A.fibreLabel(c, i, used);
      rows.push('<tr><td class="n">' + i + '</td><td><span class="sw" style="background:' + fi.tubeCol.hex + '"></span>' + fi.tube + (fi.ring ? '*' : '') + '</td><td><span class="sw" style="background:' + fi.fibre.hex + '"></span>' + esc(A.tl(fi.fibre)) + '</td><td><select data-o="fib" data-id="' + c.id + '" data-i="' + i + '" data-k="status">' + opts(['used', 'spare', 'reserved', 'faulty', 'dark'].map(s => [s, t('fs_' + s)]), stt) + '</select></td><td><input type="text" data-o="fib" data-id="' + c.id + '" data-i="' + i + '" data-k="label" value="' + esc(lab) + '"></td></tr>');
    }
    return rows.join('');
  }
  function inspectorBld(b, D) {
    if (!b) return ''; const bu = D.budget[b.id], pa = D.pathOf[b.id], fats = FT.state.nodes.filter(n => n.type === 'fat' || n.type === 'closure' || n.type === 'pole' || n.type === 'fdh');
    let h = '<div class="ph"><span class="dot" style="background:#fff"></span><b>' + t('f_house') + ' #' + b.id + '</b><small>' + esc(b.block || '') + '</small></div>';
    h += '<div class="sec">' + fld(t('f_owner'), 'b', 'name', b.name || '', 'text', { id: b.id }) + fld(t('f_status'), 'b', 'status', b.status, 'select', { id: b.id, options: STATUS_OPTS(FT.B_STATUS, 'bst_') }) + fld(t('f_units'), 'b', 'units', b.units, 'num', { id: b.id, min: 1 }) + fld(t('f_floors'), 'b', 'floors', b.floors, 'num', { id: b.id, min: 1 }) + fld(t('f_plan'), 'b', 'plan', b.plan || '', 'text', { id: b.id }) +
      '<div class="row"><label>' + t('f_fat') + '</label><div class="v"><select data-o="bfat" data-id="' + b.id + '" data-k="fat"><option value="">— ' + t('none') + ' —</option>' + opts(fats.map(n => [n.id, n.name]), b.fat) + '</select></div></div>' + fld(t('f_port'), 'b', 'port', b.port, 'num', { id: b.id, min: 1 }) +
      fld(t('f_ont_model'), 'b', 'model', (b.ont || {}).model || '', 'text', { id: b.id, pk: 'ont' }) + fld(t('f_ont_sn'), 'b', 'serial', (b.ont || {}).serial || '', 'text', { id: b.id, pk: 'ont' }) + fld(t('f_contact'), 'b', 'contact', b.contact || '', 'text', { id: b.id }) + fld(t('f_rx_meas'), 'b', 'rxMeasured', b.rxMeasured == null ? '' : b.rxMeasured, 'num', { id: b.id }) + fld(t('f_notes'), 'b', 'notes', b.notes || '', 'area', { id: b.id }) + '</div>';
    if (bu) h += '<div class="sec"><h4>' + t('budget') + ' ' + badge(bu.status) + '</h4><div class="kv"><span>' + t('b_path') + '</span><span style="direction:ltr">' + pa.nodes.map(n => esc(n.name)).join(' → ') + '</span><span>' + t('b_len') + '</span><span>' + bu.lenM.toFixed(0) + ' m</span><span>' + t('b_fibre') + '</span><span>' + bu.fibre.toFixed(2) + ' dB</span><span>' + t('b_conn') + ' (' + bu.conn + ')</span><span>' + bu.connLoss.toFixed(2) + ' dB</span><span>' + t('b_splice') + ' (' + bu.splices + ')</span><span>' + bu.spliceLossT.toFixed(2) + ' dB</span><span>' + t('b_split') + '</span><span>' + bu.splitLoss.toFixed(1) + ' dB</span><span><b>' + t('b_total') + '</b></span><span><b>' + bu.loss.toFixed(2) + ' dB</b></span><span>' + t('b_tx') + '</span><span>' + bu.tx.toFixed(1) + ' dBm</span><span><b>' + t('b_rx') + '</b></span><span><b>' + bu.rx.toFixed(1) + ' dBm</b></span><span>' + t('b_margin') + '</span><span>' + bu.margin.toFixed(1) + ' dB</span></div></div>';
    else h += '<div class="sec"><div class="tip">' + t('b_nopath') + '</div></div>';
    h += '<div class="sec"><div class="btns"><button class="btn" data-act="zoom">' + A.ic('pin') + t('zoom_to') + '</button>' + (b.fat ? '<button class="btn" data-act="selnode" data-id="' + b.fat + '">' + t('go_fat') + '</button>' : '') + '<button class="btn danger" data-act="del">' + A.ic('trash') + t('delete') + '</button></div></div>';
    return h;
  }
  // delegated inspector events
  $('#inspector').addEventListener('change', e => {
    const el = e.target; if (el.id === 'selBmode') { ui.bmode = el.value; saveUI(); render(); return; }
    if (el.id === 'rngImg') { ui.imgOpacity = +el.value; saveUI(); render(); return; } if (el.id === 'rngBright') { ui.imgBright = +el.value; saveUI(); render(); return; }
    if (el.dataset.layer) { ui.layers[el.dataset.layer] = el.checked; saveUI(); render(); return; }
    const o = el.dataset.o; if (!o) return; let v = el.value; if (el.dataset.ty === 'num') v = numVal(v);
    if (o === 'spl') { const n = FT.node(el.dataset.id), r = n.splices[+el.dataset.i], k = el.dataset.k; r[k] = (k === 'fa' || k === 'fb' || k === 'loss') ? numVal(v) : v; A.commit({ noInspector: true }); return; }
    if (o === 'fib') { const c = FT.cable(el.dataset.id); c.fibOv = c.fibOv || {}; const i = el.dataset.i; c.fibOv[i] = c.fibOv[i] || {}; c.fibOv[i][el.dataset.k] = v; A.commit({ noInspector: true }); return; }
    if (o === 'bfat') { const b = FT.bld(+el.dataset.id); if (!v) { const dc = FT.state.cables.find(c => c.kind === 'drop' && c.b.t === 'b' && c.b.id === b.id); if (dc) FT.deleteCable(dc.id); b.fat = null; b.port = ''; } else FT.assign(b.id, v); A.commit(); return; }
    const id = el.dataset.id, obj = o === 'n' ? FT.node(id) : o === 'c' ? FT.cable(id) : FT.bld(+id); if (!obj) return;
    if (el.dataset.pk) { if (el.dataset.pk === 'ont') { obj.ont = obj.ont || {}; obj.ont[el.dataset.k] = v; } else obj.props[el.dataset.pk] = v; } else {
      obj[el.dataset.k] = el.dataset.k === 'fibres' || (o === 'b' && el.dataset.k === 'port' && v !== '') ? +v : v;
      if (o === 'c' && el.dataset.k === 'cableType') { const ct = FT.CABLE_TYPES[v]; if (ct) obj.install = ct.install; }
      if (o === 'c' && el.dataset.k === 'kind' && v === 'drop') { /* keep */ }
    }
    A.commit(); renderHeader();
  });
  $('#inspector').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return; e.preventDefault(); const act = a.dataset.act, s0 = sel[0];
    switch (act) {
      case 'del': A.deleteSelection(); break;
      case 'addsplice': { const n = FT.node(a.dataset.id); n.splices = n.splices || []; n.splices.push({ a: '', fa: '', b: '', fb: '', loss: FT.state.settings.spliceLoss }); A.commit(); break; }
      case 'delsplice': { const n = FT.node(a.dataset.id); n.splices.splice(+a.dataset.i, 1); A.commit(); break; }
      case 'zoom': if (s0) A.selectAndShow(s0.t, s0.id); break;
      case 'dlg': A.dialog && A.dialog(a.dataset.d); break;
      case 'selcable': A.selectAndShow('c', a.dataset.id); break; case 'selnode': A.selectAndShow('n', a.dataset.id); break; case 'selbld': A.selectAndShow('b', +a.dataset.id); break;
      case 'connect': A.setTool('drop'); draw = { fat: a.dataset.id, a: { t: 'n', id: a.dataset.id }, pts: [] }; hint(); render(); break;
      case 'newcable': { A.setTool('cable:' + a.dataset.kind); draw = { a: { t: 'n', id: a.dataset.id }, pts: [] }; hint(); render(); break; }
      case 'paint': { const c = FT.cable(s0.id); c.color = a.dataset.hex; A.commit(); break; }
      case 'reroute': { const c = FT.cable(s0.id), p1 = FT.endPos(c.a), p2 = FT.endPos(c.b); c.pts = FT.route(p1, p2); A.commit(); break; }
      case 'straight': { FT.cable(s0.id).pts = []; A.commit(); break; }
      case 'swap': { const c = FT.cable(s0.id); if (c.a.t === 'n' && c.b.t === 'n') { const x = c.a; c.a = c.b; c.b = x; c.pts.reverse(); A.commit(); } break; }
      case 'dup': { const n = FT.node(s0.id), m = FT.addNode(n.type, n.x + 14, n.y + 14, { color: n.color }); Object.assign(m.props, JSON.parse(JSON.stringify(n.props))); sel = [{ t: 'n', id: m.id }]; A.commit(); break; }
      case 'massign': { const id = $('#mAssign').value; sel.filter(s => s.t === 'b').forEach(s => FT.assign(s.id, id)); A.commit(); break; }
      case 'mstatus': { const v = $('#mStatus').value; sel.filter(s => s.t === 'b').forEach(s => { FT.bld(s.id).status = v; }); A.commit(); break; }
    }
  });
  $('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) A.setTool(b.dataset.tool); });

  /* ------------------------------------------------------------ chrome: header, search, language, panel */
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); } A.toast = toast;
  function applyLang() {
    document.documentElement.lang = ui.lang; document.documentElement.dir = 'ltr'; document.body.classList.toggle('ar', ui.lang === 'ar'); $('#btnLang').textContent = ui.lang === 'ar' ? 'EN' : 'عربي'; $('#search').placeholder = t('search_ph');
    document.querySelectorAll('[data-tip]').forEach(b => { b.title = t('tip_' + b.dataset.tip); });
    $('#btnMenu').title = t('menu'); renderTools(); renderHeader(); if (FT.state) { render(); renderInspector(); renderStatus(); } A.onLang && A.onLang();
  }
  A.applyLang = applyLang;
  $('#btnLang').onclick = () => { ui.lang = ui.lang === 'ar' ? 'en' : 'ar'; saveUI(); applyLang(); };
  $('#btnUndo').onclick = () => A.undo(); $('#btnRedo').onclick = () => A.redo(); $('#btnFit').onclick = () => A.fit();
  $('#btnImg').onclick = () => { ui.img = !ui.img; saveUI(); $('#btnImg').classList.toggle('on', ui.img); render(); toast(t(ui.img ? 'img_on' : 'img_off')); };
  $('#btnPanel').onclick = () => { ui.panel = !ui.panel; saveUI(); $('#btnPanel').classList.toggle('on', ui.panel); $('#inspector').classList.toggle('hide', !ui.panel); setTimeout(() => { computeLimits(); clampView(); render(); }, 30); };
  $('#zIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.3); }; $('#zOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.3); };
  $('#btnMenu').onclick = () => A.openDrawer && A.openDrawer();
  const sIn = $('#search'), sRes = $('#searchRes');
  sIn.addEventListener('input', () => {
    const q = sIn.value.trim().toLowerCase(); if (!q) { sRes.style.display = 'none'; return; } const r = [];
    FT.state.buildings.forEach(b => { if (String(b.id) === q || ('#' + b.id) === q || (b.name || '').toLowerCase().includes(q)) r.push(['b', b.id, t('f_house') + ' #' + b.id, b.name || b.block || '']); });
    FT.state.nodes.forEach(n => { if (n.name.toLowerCase().includes(q)) r.push(['n', n.id, n.name, t('nt_' + n.type)]); }); FT.state.cables.forEach(c => { if (c.kind !== 'drop' && c.name.toLowerCase().includes(q)) r.push(['c', c.id, c.name, t('ck_' + c.kind)]); });
    sRes.innerHTML = r.slice(0, 14).map((x, i) => '<div data-i="' + i + '"><span>' + esc(x[2]) + '</span><small>' + esc(x[3]) + '</small></div>').join('') || '<div><small>' + t('no_results') + '</small></div>'; sRes.style.display = 'block'; sRes._r = r;
  });
  sRes.addEventListener('click', e => { const d = e.target.closest('[data-i]'); if (!d) return; const x = sRes._r[+d.dataset.i]; A.selectAndShow(x[0], x[1]); sRes.style.display = 'none'; sIn.value = ''; });
  document.addEventListener('click', e => { if (!e.target.closest('.searchbox')) sRes.style.display = 'none'; });
  window.addEventListener('resize', () => { computeLimits(); clampView(); requestRender(); });

  /* ------------------------------------------------------------ start */
  A.getView = () => view; A.getTool = () => tool; A.snapshot = snapshot;
  A.start = function () {
    let loaded = false;
    try { const s = localStorage.getItem(KEY); if (s) { FT.load(JSON.parse(s)); loaded = FT.state.nodes.length + FT.state.buildings.length > 0; } } catch (e) { loaded = false; }
    if (!loaded) { FT.buildDemo(); FT.state.geoRef = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2]; }
    if (!localStorage.getItem(UIKEY) && window.innerWidth < 900) ui.panel = false;
    snapshot(); $('#btnImg').classList.toggle('on', ui.img); $('#btnPanel').classList.toggle('on', ui.panel); $('#inspector').classList.toggle('hide', !ui.panel);
    computeLimits(); view.k = minK; clampView(); applyLang(); A.fit(); persist();
    if (!loaded && window.FTAPP.onFirstRun) FTAPP.onFirstRun();
  };
})();
