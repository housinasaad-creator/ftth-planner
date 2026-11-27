/* Keyboard: a shortcut for every tool and action, cut / copy / paste (at the mouse) / duplicate / select all / nudge,
   and a clear tooltip with the shortcut over every button. Keys are read by their PHYSICAL position (event.code),
   so they work with an Arabic keyboard layout too. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const K = FT.keys = {};
  const ar = () => FT.lang === 'ar', T = () => FT.T, U = () => FT.UI, tx = (a, e) => ar() ? a : e;
  const click = sel => { const e = document.querySelector(sel); if (e && e.offsetParent !== null) { e.click(); return true; } return false; };

  // single-letter tool keys (infrastructure) — wireless mode swaps in its own two
  K.TOOLS = { select: 'V', area: 'L', measure: 'U', mh: 'M', hh: 'J', pole: 'D', sk: '1', dk: '2', bk: '3', olt: 'O', splice: 'E', pipe: 'B', cable: 'K', route: 'G', reconnect: 'R', number: 'N', bdraw: 'W', house: 'A', floors: 'T', design: 'Y', sub: 'S', plan: 'C' };
  const WIRELESS = { wdev: 'W', wlink: 'Q' };
  // buttons that run at once
  K.OUT = { report: 'Shift+R', kmz: 'Shift+K', import: 'Shift+I', dxf: 'Shift+D', soc: 'Shift+C' };
  const code = k => /^\d$/.test(k) ? 'Digit' + k : 'Key' + k;
  const toolFor = c => { const num = c.replace('Numpad', 'Digit'); const wl = document.querySelector('#toolbar .tb[data-id=wdev]'); const maps = wl ? [WIRELESS, K.TOOLS] : [K.TOOLS]; for (const m of maps) for (const id in m) if (code(m[id]) === num) return id; return null; };

  // ---------------- clipboard ----------------
  let clip = null, mouse = null;
  const M = () => FT.map.map;
  function selected() { // what is selected right now, as id lists
    const t = T(), out = { nodes: [], pipes: [], cables: [], houses: [] };
    if (t.multi) { ['nodes', 'pipes', 'cables', 'houses'].forEach(k => t.multi[k] && t.multi[k].forEach(i => out[k].push(i))); }
    else if (t.bsel && t.bsel.size) out.houses = [...t.bsel];
    else if (t.sel) { const s = t.sel; if (s.kind === 'node') out.nodes.push(s.id); else if (s.kind === 'pipe') out.pipes.push(s.id); else if (s.kind === 'cable') { out.cables.push(s.id); const c = FT.state.cables[s.id]; if (c) out.nodes.push(...new Set(c.nodes)); } else if (s.kind === 'bld') out.houses.push(s.id); }
    return out;
  }
  const count = s => s.nodes.length + s.pipes.length + s.cables.length + s.houses.length;
  K.copy = function (quiet) {
    const S = FT.state, s = selected(); if (!count(s)) { if (!quiet) U().toast(tx('ما في شي محدّد للنسخ', 'Nothing selected to copy')); return false; }
    const pts = [];
    const c = { nodes: s.nodes.map(i => S.nodes[i]).filter(Boolean), pipes: s.pipes.map(i => S.pipes[i]).filter(Boolean), cables: s.cables.map(i => S.cables[i]).filter(Boolean), houses: s.houses.map(id => { const o = S.bld[id] || {}, p = FT.map.housePoint(id); return p ? { pt: p, floors: FT.houses.floorsOf(o), fp: o.fp || null, name: o.name || '' } : null; }).filter(Boolean) };
    c.nodes.forEach(n => pts.push(n.ll)); c.pipes.forEach(p => pts.push(p.pts[0], p.pts[p.pts.length - 1])); c.houses.forEach(h => pts.push(h.pt));
    if (!pts.length) c.cables.forEach(x => pts.push(...(x.pts || [])));
    if (!pts.length) return false;
    c.anchor = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    clip = JSON.parse(JSON.stringify(c)); try { localStorage.setItem('ft_clip', JSON.stringify(clip)); } catch (e) { }
    if (!quiet) U().toast(tx('نُسخ ', 'Copied ') + (c.nodes.length + c.pipes.length + c.cables.length + c.houses.length) + tx(' عنصر · Ctrl+V للّصق مكان الماوس', ' item(s) · Ctrl+V pastes at the mouse'));
    return true;
  };
  const readOnly = () => FT.store && FT.store.mode === 'view';
  K.paste = function (at) {
    if (readOnly()) { U().toast(FT.t('ro_msg')); return; }
    let c = clip; try { c = JSON.parse(localStorage.getItem('ft_clip')) || clip; } catch (e) { }
    if (!c) { U().toast(tx('الحافظة فاضية: انسخ أولاً بـ Ctrl+C', 'Clipboard is empty: copy with Ctrl+C first')); return; }
    const center = M().getCenter(), to = at || mouse || [center.lng, center.lat];
    if (!FT.map.insideGov(to)) { U().toast(FT.t('toast_outside')); return; }
    const dx = to[0] - c.anchor[0], dy = to[1] - c.anchor[1], mv = p => [+(p[0] + dx).toFixed(7), +(p[1] + dy).toFixed(7)];
    FT.commit(); const S = FT.state, id = {}, made = { nodes: new Set(), pipes: new Set(), cables: new Set(), houses: new Set() };
    c.nodes.forEach(n => { const extra = Object.assign({}, n); ['id', 'type', 'll', 'name', 'code', 'bld', 'by'].forEach(k => delete extra[k]); const x = FT.addNode(n.type, mv(n.ll), extra); id[n.id] = x.id; made.nodes.add(x.id); });
    c.pipes.forEach(p => { const x = FT.addPipe(p.pts.map(mv), id[p.a] || null, id[p.b] || null, p.ptype, p.cat); ['depth', 'width', 'cover', 'color', 'note', 'load', 'qty', 'od'].forEach(k => { if (p[k] !== undefined) x[k] = p[k]; }); made.pipes.add(x.id); });
    let skipped = 0;
    c.cables.forEach(k => { const ids = (k.nodes || [k.a, k.b]).map(n => id[n]); if (ids.some(i => !i)) { skipped++; return; } const x = FT.addCable((k.pts || []).map(mv), id[k.a], id[k.b], k.cat, k.medium, ids, k.segs ? k.segs.map(g => g.map(mv)) : null); x.name = k.name; ['color', 'note', 'shared'].forEach(f => { if (k[f] !== undefined) x[f] = k[f]; }); made.cables.add(x.id); });
    c.houses.forEach(h => { const nid = 'h' + FT.uid('').slice(0, 8), o = { custom: 1, floors: h.floors, pt: mv(h.pt) }; if (h.fp) o.fp = h.fp.map(mv); else o.house = 1; if (h.name) o.name = h.name; S.bld[nid] = o; made.houses.add(nid); });
    T().select(null); FT.changed('paste');
    const total = made.nodes.size + made.pipes.size + made.cables.size + made.houses.size;
    if (total === 1 && made.houses.size) T().select('bld', [...made.houses][0]);
    else if (total === 1 && made.nodes.size) T().select('node', [...made.nodes][0]);
    else if (made.houses.size === total) { T().bsel = new Set(made.houses); T().multi = null; T().sel = { kind: 'bld', id: [...made.houses].pop() }; FT.map.setBuildingSelection(new Set(made.houses)); U().selectionChanged(); }
    else { made.delHouses = true; T().selectMulti(made); FT.map.setBuildingSelection(new Set(made.houses)); }
    U().toast(tx('لُصق ', 'Pasted ') + total + (skipped ? tx(' · تُرك ' + skipped + ' كبل لأن عقده غير منسوخة', ' · ' + skipped + ' cable(s) skipped: their nodes were not copied') : ''));
  };
  K.cut = function () {
    if (readOnly()) { U().toast(FT.t('ro_msg')); return; }
    const s = selected(); if (!count(s) || !K.copy(true)) { U().toast(tx('ما في شي محدّد للقص', 'Nothing selected to cut')); return; }
    if (T().multi && s.houses.length) { T().deleteSelection(); FT.bedit.remove(s.houses, true); FT.changed('bld'); } else T().deleteSelection();
    U().toast(tx('قُصّ · Ctrl+V للّصق مكان الماوس', 'Cut · Ctrl+V pastes at the mouse'));
  };
  K.pasteInPlace = function () { let c = clip; try { c = JSON.parse(localStorage.getItem('ft_clip')) || clip; } catch (e) { } K.paste(c && c.anchor ? c.anchor.slice() : undefined); }; // same coordinates as copied (also from another project)
  K.duplicate = function () {
    const keep = clip, s = selected(); if (!count(s)) { U().toast(tx('ما في شي محدّد', 'Nothing selected')); return; }
    let saved = null; try { saved = localStorage.getItem('ft_clip'); } catch (e) { }
    if (!K.copy(true)) return; const a = clip.anchor; K.paste([a[0] + 10 / (111320 * Math.cos(a[1] * Math.PI / 180)), a[1] - 6 / 110540]);
    clip = keep; try { if (saved) localStorage.setItem('ft_clip', saved); } catch (e) { }
  };
  K.selectAll = function (houses) {
    const t = T();
    if (houses) { const b = M().getBounds(), ids = (FT.map.houseFeats || []).filter(f => b.contains(f.geometry.coordinates)).map(f => f.properties.id); if (!ids.length) { U().toast(tx('قرّب حتى تظهر البيوت', 'Zoom in until houses show')); return; } t.multi = null; t.bsel = new Set(ids); t.sel = { kind: 'bld', id: ids[ids.length - 1] }; FT.map.setBuildingSelection(new Set(ids)); U().selectionChanged(); U().toast(ids.length + tx(' بيت محدّد', ' houses selected')); return; }
    const S = FT.state, m = { nodes: new Set(Object.keys(S.nodes)), pipes: new Set(Object.keys(S.pipes)), cables: new Set(Object.keys(S.cables)) };
    if (!(m.nodes.size + m.pipes.size + m.cables.size)) return K.selectAll(true);
    t.bsel = new Set(); t.selectMulti(m);
  };

  // ---------------- move with the arrow keys ----------------
  let lastNudge = 0, lastKey = '';
  K.nudge = function (right, up) { // metres, as seen on the screen
    if (readOnly()) return false; const s = selected(); if (!(s.nodes.length + s.pipes.length + s.houses.length)) return false;
    const S = FT.state, br = M().getBearing() * Math.PI / 180, east = right * Math.cos(br) + up * Math.sin(br), north = -right * Math.sin(br) + up * Math.cos(br);
    const sh = p => [+(p[0] + east / (111320 * Math.cos(p[1] * Math.PI / 180))).toFixed(7), +(p[1] + north / 110540).toFixed(7)];
    const key = [].concat(s.nodes, s.pipes, s.houses).join(), now = Date.now(); if (key !== lastKey || now - lastNudge > 900) FT.commit(); lastKey = key; lastNudge = now; // one undo step per burst of key presses
    const moved = new Set(s.nodes);
    s.nodes.forEach(i => { const n = S.nodes[i]; if (n && !T().locked.has(i)) T().moveNode(i, sh(n.ll)); });
    s.pipes.forEach(i => { const p = S.pipes[i]; if (p && !moved.has(p.a) && !moved.has(p.b)) p.pts = p.pts.map(sh); });
    s.houses.forEach(id => { const p = FT.map.housePoint(id); if (p && !T().locked.has(id)) FT.houses.moveTo(id, sh(p)); });
    FT.changed(s.houses.length ? 'bld' : 'move');
    if (T().sel && T().sel.kind === 'node') FT.map.setSelection('node', T().sel.id);
    return true;
  };

  // ---------------- the one keyboard handler ----------------
  function onKey(ev) {
    const tg = ev.target, typing = tg && (/INPUT|TEXTAREA|SELECT/.test(tg.tagName) || tg.isContentEditable);
    if (typing && ev.code !== 'Escape') return;
    const c = ev.code, mod = ev.ctrlKey || ev.metaKey, stop = () => { ev.preventDefault(); ev.stopPropagation(); };
    const modal = document.getElementById('modal').classList.contains('on');
    if (c === 'Escape') { if (modal) { U().closeModal(); return; } if (!T().cancel()) U().closeCtx(); return; }
    if (modal) return; // a window is open: the map shortcuts wait
    if (mod && !ev.altKey) {
      if (c === 'KeyZ') { stop(); ev.shiftKey ? FT.redo() : FT.undo(); return; }
      if (c === 'KeyY') { stop(); FT.redo(); return; }
      if ((c === 'KeyC' || c === 'KeyX') && String(G.getSelection ? G.getSelection() : '')) return; // text marked on the page: normal copy
      if (c === 'KeyC') { stop(); K.copy(); return; }
      if (c === 'KeyX') { stop(); K.cut(); return; }
      if (c === 'KeyV') { stop(); if (ev.shiftKey) K.pasteInPlace(); else K.paste(); return; }
      if (c === 'KeyD') { stop(); K.duplicate(); return; }
      if (c === 'KeyA') { stop(); K.selectAll(ev.shiftKey); return; }
      if (c === 'KeyS') { stop(); FT.store.saveNow(); if (FT.sync && FT.sync.active) FT.sync.flush(); U().toast(tx('حُفظ', 'Saved')); return; }
      if (c === 'KeyF') { stop(); const e = document.getElementById('lsearch'); if (e) e.focus(); return; }
      if (c === 'KeyB') { stop(); U().toggleLeft(); return; }
      if (c === 'KeyI') { stop(); U().toggleRight(); return; }
      return;
    }
    if (ev.altKey) { const base = { Digit1: 'map', Digit2: '3d', Digit3: 'sat' }[c]; if (base) { stop(); click('#basemap [data-b="' + base + '"]'); } return; }
    if (/^Arrow/.test(c)) { const m = ev.shiftKey ? 10 : 1, d = { ArrowLeft: [-m, 0], ArrowRight: [m, 0], ArrowUp: [0, m], ArrowDown: [0, -m] }[c]; if (K.nudge(d[0], d[1])) stop(); return; } // nothing selected: the arrows move the map as usual
    if (c === 'Enter' || c === 'NumpadEnter') { if (T().draw) { stop(); T().finish(); } return; }
    if (c === 'Delete') { stop(); T().deleteSelection(); return; }
    if (c === 'Backspace') { stop(); if (T().draw && T().draw.pts.length) T().backPoint(); else T().deleteSelection(); return; }
    if (ev.key === '?' || (c === 'Slash' && ev.shiftKey) || c === 'F1') { stop(); U().openHelp(); return; }
    if (ev.shiftKey) {
      const run = {
        KeyF: () => U().fitAll(), KeyH: () => { T().hidden.clear(); U().applyHidden(); U().refreshTree(); },
        KeyM: () => { const s = T().sel; if (s && (s.kind === 'bld' || s.kind === 'node')) T().pickHouseMove(s.id, s.kind); else U().toast(tx('حدّد بيت أو عنصر أولاً', 'Select a house or an element first')); },
        KeyN: () => click('#bHideNet'), KeyA: () => click('#bHideHouses'), KeyB: () => click('#bHideBld'),
        KeyR: () => U().openReport(), KeyK: () => FT.exp.kmz(), KeyI: () => click('#toolbar .tb[data-id=import]'), KeyD: () => click('#toolbar .tb[data-id=dxf]'), KeyC: () => FT.spec.open(),
        KeyV: () => U().setTheme(U().theme() === 'dark' ? 'light' : 'dark'),
        KeyE: () => U().openLearn(),
        KeyP: () => click('#bPrices'), KeyS: () => click('#bShare'), KeyT: () => click('#bTeam'), KeyL: () => click('#bLang'), KeyO: () => click('#projName'),
      }[c];
      if (run) { stop(); run(); }
      return;
    }
    if (c === 'KeyF') { stop(); U().zoomSel(); return; }
    if (c === 'KeyH') { stop(); U().hideSel(); return; }
    const tool = toolFor(c); if (tool) { stop(); T().setTool(tool); }
  }

  // ---------------- tooltips ----------------
  const BUTTONS = { bLearn: 'Shift+E', bUndo: 'Ctrl+Z', bRedo: 'Ctrl+Y', bHelp: '?', bLang: 'Shift+L', bPrices: 'Shift+P', bShare: 'Shift+S', bTeam: 'Shift+T', projName: 'Shift+O', bHideNet: 'Shift+N', bHideHouses: 'Shift+A', bHideBld: 'Shift+B', bLayersX: 'Ctrl+B' };
  const BASE = { map: 'Alt+1', '3d': 'Alt+2', sat: 'Alt+3' };
  function tipOf(el) {
    if (el.dataset.tip) return { name: el.dataset.tip, desc: el.dataset.desc || '', key: el.dataset.key || '' };
    const key = BUTTONS[el.id] || (el.dataset.b ? BASE[el.dataset.b] : '');
    const name = el.dataset.tt || el.getAttribute('title') || el.textContent.trim(); if (el.getAttribute('title')) { el.dataset.tt = el.getAttribute('title'); el.removeAttribute('title'); }
    return name ? { name, desc: '', key } : null;
  }
  function wireTips() {
    const box = document.createElement('div'); box.id = 'tip'; document.body.appendChild(box); let cur = null, timer = 0;
    const hide = () => { clearTimeout(timer); cur = null; box.style.display = 'none'; };
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('[data-tip], #top button, #basemap button, #status button, #left .ph button, #bNewFolder, #bCollapse, #bLockAll');
      if (el === cur) return; hide(); if (!el) return; cur = el;
      const t = tipOf(el); if (!t) return;
      timer = setTimeout(() => {
        box.innerHTML = '<div class="tn"><b></b>' + (t.key ? '<kbd></kbd>' : '') + '</div>' + (t.desc ? '<p></p>' : '');
        box.querySelector('b').textContent = t.name; if (t.key) box.querySelector('kbd').textContent = t.key; if (t.desc) box.querySelector('p').textContent = t.desc;
        box.style.display = 'block'; const r = el.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
        const side = el.closest('#toolbar');
        box.style.left = (side ? Math.max(8, side.getBoundingClientRect().left - w - 8) : Math.max(8, Math.min(G.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
        box.style.top = (side ? Math.max(8, Math.min(G.innerHeight - h - 8, r.top + r.height / 2 - h / 2)) : (r.bottom + h + 10 > G.innerHeight ? r.top - h - 8 : r.bottom + 8)) + 'px';
      }, 220);
    });
    document.addEventListener('mousedown', hide, true); G.addEventListener('blur', hide);
  }

  // ---------------- help ----------------
  K.helpRows = function () {
    const t = FT.t;
    return [
      [tx('الأساسية', 'Basics'), [['Ctrl+C', tx('نسخ المحدّد', 'Copy selection')], ['Ctrl+X', tx('قص', 'Cut')], ['Ctrl+Shift+V', tx('لصق بنفس المكان', 'Paste in place')], ['Ctrl+V', tx('لصق مكان الماوس', 'Paste at the mouse')], ['Ctrl+D', tx('تكرار', 'Duplicate')], ['Ctrl+Z', tx('تراجع', 'Undo')], ['Ctrl+Y · Ctrl+Shift+Z', tx('إعادة', 'Redo')], ['Ctrl+A', tx('تحديد كل الشبكة', 'Select the whole network')], ['Ctrl+Shift+A', tx('تحديد كل البيوت الظاهرة', 'Select all houses in view')], ['Delete · Backspace', tx('حذف المحدّد', 'Delete selection')], ['Ctrl+S', tx('حفظ', 'Save')], ['Esc', tx('إلغاء / إغلاق', 'Cancel / close')], ['Enter', tx('إنهاء الرسم', 'Finish drawing')]]],
      [tx('التحريك', 'Moving'), [['← ↑ → ↓', tx('تحريك المحدّد متراً واحداً', 'Move selection by 1 m')], ['Shift + ← ↑ → ↓', tx('تحريك المحدّد 10 أمتار', 'Move selection by 10 m')], ['Shift+M', tx('نقل البيت أو العنصر بنقرة', 'Move house / element with one click')], ['F', tx('الذهاب إلى المحدّد', 'Zoom to selection')], ['Shift+F', tx('عرض كل المشروع', 'Show whole project')], ['H', tx('إخفاء المحدّد', 'Hide selection')], ['Shift+H', tx('إظهار كل المخفي', 'Show everything hidden')]]],
      [tx('الأدوات', 'Tools'), Object.keys(K.TOOLS).map(id => [K.TOOLS[id], t('t_' + id)])],
      [tx('الخريطة والعرض', 'Map and view'), [['Alt+1', t('b_map')], ['Alt+2', t('b_3d')], ['Alt+3', t('b_sat')], ['Shift+B', t('b_hide')], ['Shift+A', t('b_hidehouses')], ['Shift+N', t('b_hidenet')], ['Ctrl+B', tx('لوحة الطبقات', 'Layers panel')], ['Ctrl+I', tx('اللوحة اليمنى', 'Right panel')], ['Ctrl+F', tx('بحث في الطبقات', 'Search layers')]]],
      [tx('النوافذ والملفات', 'Windows and files'), [['Shift+R', t('t_report')], ['Shift+K', t('t_kmz')], ['Shift+I', t('t_import')], ['Shift+D', 'DXF'], ['Shift+C', tx('فحص المواصفات', 'Specification check')], ['Shift+P', tx('الأسعار', 'Prices')], ['Shift+S', tx('مشاركة', 'Share')], ['Shift+T', tx('الفريق', 'Team')], ['Shift+O', tx('المشاريع', 'Projects')], ['Shift+L', tx('اللغة', 'Language')], ['Shift+V', tx('وضع غامق / فاتح', 'Dark / light mode')], ['Shift+E', tx('تعليمي', 'Tutorials')], ['? · F1', tx('هذه القائمة', 'This list')]]],
    ];
  };

  K.init = function () {
    document.addEventListener('keydown', onKey, true); // before the map's own arrow handling
    const m = M(); m.on('mousemove', e => { mouse = [e.lngLat.lng, e.lngLat.lat]; }); m.getCanvas().addEventListener('mouseleave', () => { mouse = null; });
    wireTips();
  };
})(window);
