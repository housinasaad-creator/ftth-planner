/* Interaction layer: tool state machine on top of the map. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const T = FT.T = { tool: 'select', draw: null, sel: null, multi: null, num: { prefix: '', next: 1, order: 'walk', mode: 'click' }, shapeCB: null, cycle: 0, hidden: new Set(), locked: new Set() };
  const NODE_TOOLS = { mh: 'mh', hh: 'hh', pole: 'pole', sk: 'sk', dk: 'dk', bk: 'bk', olt: 'olt' };
  let map, dragging = null;
  const U = () => FT.UI;
  const ll = e => [e.lngLat.lng, e.lngLat.lat];

  T.init = function () {
    map = FT.map.map; FT.roads.init();
    map.on('click', onClick); map.on('mousemove', onMove); map.on('dblclick', onDbl); map.on('contextmenu', onCtx);
    map.on('mousedown', onDown); document.addEventListener('mouseup', onUp);
    map.on('mousemove', e => { const s = e.lngLat; U().coord(s.lat.toFixed(6) + ', ' + s.lng.toFixed(6)); });
    map.on('zoom', () => U().zoom(map.getZoom()));
    FT.keys.init();
    initMiddleRotate();
  };

  // Middle mouse button (wheel pressed) + move = rotate the camera: horizontal = bearing (half the map width = 180°), vertical = tilt
  function initMiddleRotate() {
    const cv = map.getCanvasContainer(); let mid = null;
    cv.addEventListener('mousedown', e => { if (e.button !== 1) return; e.preventDefault(); e.stopPropagation(); mid = { x: e.clientX, y: e.clientY, b: map.getBearing(), p: map.getPitch(), w: cv.clientWidth || 1000 }; cv.style.cursor = 'grabbing'; }, true);
    cv.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); }, true);
    document.addEventListener('mousemove', e => { if (!mid) return; const dx = e.clientX - mid.x, dy = e.clientY - mid.y; map.jumpTo({ bearing: mid.b + dx * 360 / mid.w, pitch: Math.max(0, Math.min(map.getMaxPitch ? map.getMaxPitch() : 75, mid.p - dy * 0.3)) }); });
    document.addEventListener('mouseup', e => { if (e.button === 1 && mid) { mid = null; cv.style.cursor = ''; } });
  }

  // ---------------- tool switching ----------------
  T.setTool = function (t, opt) {
    if (FT.store && FT.store.mode === 'view' && !['select', 'area', 'measure', 'shape', 'dxfarea'].includes(t)) { U().toast(FT.t('ro_msg')); return; }
    if (T.tool === t && t !== 'select') t = 'select';
    T.draw = null; T.tool = t; T.opt = opt || null; // keep the selection (needed by Connect subscriber)
    map.getCanvas().style.cursor = t === 'select' ? '' : 'crosshair';
    FT.map.setDraw([]); if (t !== 'select') FT.map.setDone(null); U().meter(null); U().toolChanged();
  };
  T.backPoint = function () { if (!T.draw || !T.draw.pts.length) return; T.draw.pts.pop(); T.draw.nodes.pop(); preview(); U().refreshStatus(); };
  T.cancel = function (silent) {
    if (T.movePick) { T.endHouseMove(); return true; }
    if (!silent && !T.draw && FT.map.doneRing) { FT.map.setDone(null); if (T.sel || T.multi) T.select(null); U().hint(''); return true; } // first step back: the finished area and its rings
    if (T.draw) { T.draw = null; FT.map.setDraw([]); U().meter(null); if (!silent) U().refreshStatus(); return true; }
    if (T.tool !== 'select' && !silent) { T.setTool('select'); return true; }
    if (T.sel || T.multi) { T.select(null); return true; }
    if (FT.map.doneRing) { FT.map.setDone(null); U().hint(''); return true; }
    return false;
  };

  // ---------------- selection ----------------
  T.bsel = new Set(); // selected buildings (Shift+click adds)
  T.clearBuildingSel = () => { T.bsel = new Set(); };
  T.select = function (kind, id) {
    T.sel = kind ? { kind, id } : null; T.multi = null; // clearing the selection must clear a multi-selection too, or Delete would still remove it unseen
    FT.map.setMulti(null); FT.map.setDone(null);
    if (kind === 'bld') T.bsel = new Set([id]); else T.bsel = new Set();
    FT.map.setSelection(kind, id); FT.map.setBuildingSelection(new Set(T.bsel));
    if (FT.bedit) FT.bedit.refresh(); const ch = kind && U().reveal ? U().reveal(kind, id) : false;
    U().selectionChanged(); U().treeSelect(ch);
  };
  T.toggleBuilding = function (id) {
    if (T.sel && T.sel.kind === 'bld' && !T.bsel.size) T.bsel.add(T.sel.id);
    if (T.bsel.has(id)) T.bsel.delete(id); else T.bsel.add(id);
    const last = T.bsel.has(id) ? id : [...T.bsel].pop(); T.multi = null; T.sel = last ? { kind: 'bld', id: last } : null;
    FT.map.setSelection(null); FT.map.setBuildingSelection(new Set(T.bsel)); FT.bedit.refresh(); U().selectionChanged(); U().treeSelect();
  };
  T.selectMulti = function (m) { T.multi = m; T.sel = null; FT.map.setSelection(null); FT.map.setMulti(m); if (m && m.houses) FT.map.setBuildingSelection(new Set(m.houses)); U().selectionChanged(); U().treeSelect(); };

  function nodeNear(pt, r) {
    r = r || 16; let best = null, bd = r;
    for (const n of Object.values(FT.state.nodes)) { const p = map.project(n.ll), d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  T.nodeNear = nodeNear;
  function hit(e) {
    const b = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const f = map.queryRenderedFeatures(b, { layers: ['wdev', 'wl-line', 'm3d', 'nodes', 'spl-lab', 'house', 'house-num', 'cables', 'pipes'].filter(l => map.getLayer(l)) });
    const pick = ly => f.find(x => x.layer.id === ly);
    const wd = pick('wdev'); if (wd) return { kind: 'wdev', id: wd.properties.id };
    const wl = pick('wl-line'); if (wl) return { kind: 'wlink', id: wl.properties.id };
    const exact = map.getLayer('m3d') ? map.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['m3d'] }) : [];
    const md = exact[0] || pick('m3d'); if (md) return md.properties.kind === 'house' ? { kind: 'bld', id: md.properties.mid } : { kind: 'node', id: md.properties.mid };
    const at = ['nodes', 'house', 'house-num'].filter(l => map.getLayer(l)), under = map.queryRenderedFeatures([e.point.x, e.point.y], { layers: at });
    const nodeHit = f0 => ({ kind: f0.properties.type === 'splice' ? 'splice' : 'node', id: f0.properties.id });
    const onNode = under.find(x => x.layer.id === 'nodes'); if (onNode) return nodeHit(onNode);
    const onHouse = under.find(x => x.layer.id === 'house' || x.layer.id === 'house-num'); if (onHouse) return { kind: 'bld', id: onHouse.properties.id };
    const nd = pick('nodes'); if (nd) return nodeHit(nd);
    const hm = pick('house') || pick('house-num'); if (hm) return { kind: 'bld', id: hm.properties.id };
    const badge = pick('spl-lab'); if (badge) return { kind: 'node', id: badge.properties.id };
    const cb = pick('cables'), pp = pick('pipes');
    if (cb && pp) { // pipe first, click again on the same spot -> cable
      if (T.sel && T.sel.kind === 'pipe' && T.sel.id === pp.properties.id) return { kind: 'cable', id: cb.properties.id };
      return { kind: 'pipe', id: pp.properties.id };
    }
    if (cb) return { kind: 'cable', id: cb.properties.id }; if (pp) return { kind: 'pipe', id: pp.properties.id };
    return null;
  }
  T.hit = hit;

  // ---------------- helpers ----------------
  function guard(p) { if (!FT.map.insideGov(p)) { U().toast(FT.t('toast_outside')); return false; } return true; }
  T.moveNode = function (id, p) {
    const S = FT.state, n = S.nodes[id]; if (!n) return; n.ll = p;
    Object.values(S.pipes).forEach(x => { if (x.a === id) x.pts[0] = p; if (x.b === id) x.pts[x.pts.length - 1] = p; });
    Object.values(S.cables).forEach(c => { (c.nodes || []).forEach((nid, i) => { if (nid !== id || !c.segs) return; if (c.segs[i]) c.segs[i][0] = p; if (c.segs[i - 1]) c.segs[i - 1][c.segs[i - 1].length - 1] = p; }); });
  };
  T.deleteSelection = function () {
    if (FT.store && FT.store.mode === 'view') { U().toast(FT.t('ro_msg')); return; }
    if ((T.sel && T.sel.kind === 'bld') || T.bsel.size) { FT.bedit.removeSelected(); return; }
    const S = FT.state; let did = false; FT.commit();
    if (T.sel) { const { kind, id } = T.sel; if (kind === 'node') FT.deleteNode(id); else if (kind === 'pipe') FT.deletePipe(id); else if (kind === 'cable') FT.deleteCable(id); else if (kind === 'splice') delete S.splices[id]; else if (kind === 'wdev') FT.wl.deleteDev(id); else if (kind === 'wlink') delete S.wlinks[id]; else if (kind === 'bld') { if (S.bld[id]) { delete S.bld[id].num; } } did = true; }
    else if (T.multi) { T.multi.nodes.forEach(i => FT.deleteNode(i)); T.multi.pipes.forEach(i => FT.deletePipe(i)); T.multi.cables.forEach(i => FT.deleteCable(i)); if (T.multi.delHouses && T.multi.houses && T.multi.houses.size) FT.bedit.remove([...T.multi.houses], true); did = true; }
    if (did) { T.sel = null; T.multi = null; FT.map.setSelection(null); FT.changed('delete'); U().selectionChanged(); U().toast(FT.t('toast_deleted')); }
  };

  // ---------------- drawing ----------------
  function livePts() { return T.draw ? T.draw.pts : []; }
  function drawLen(extra) { const pts = extra ? livePts().concat([extra]) : livePts(); return FT.pathLen(pts); }
  function preview(cur) {
    const d = T.draw; if (!d) return;
    const pts = cur ? d.pts.concat([cur]) : d.pts.slice();
    const feats = [];
    if (d.shape === 'poly' || d.kind === 'area' || d.kind === 'measure' && d.closed) { if (pts.length >= 3) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts.concat([pts[0]])] } }); else if (pts.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }); }
    else if (d.shape === 'rect' && pts.length >= 2) { const a = pts[0], b = pts[1]; feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[a, [b[0], a[1]], b, [a[0], b[1]], a]] } }); }
    else if (pts.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
    d.pts.forEach(p => feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    FT.map.setDraw(feats);
  }
  function startDraw(kind, extra) { T.draw = Object.assign({ kind, pts: [], nodes: [] }, extra || {}); U().refreshStatus(); }
  T.startShape = function (shape, cb, hint) { T.setTool('shape'); T.shapeCB = cb; startDraw('shape', { shape, hint }); U().hint(hint || ''); };

  function addDrawPoint(p, nodeId) {
    const d = T.draw; const last = d.pts[d.pts.length - 1];
    if (last && FT.dist(last, p) < 0.3) { // duplicate (dbl-click). A street corner added by the route can sit exactly under the element: the element takes that point
      const i = d.pts.length - 1; if (nodeId && !d.nodes[i]) { d.nodes[i] = nodeId; d.pts[i] = p; return true; } return false; }
    d.pts.push(p); d.nodes.push(nodeId || null); return true;
  }

  // ---------------- events ----------------
  // "move house": the next click on the map is its new place (Esc cancels)
  T.movePick = null;
  T.pickHouseMove = function (id, kind) { T.movePick = { id, kind: kind || 'bld' }; map.getCanvas().style.cursor = 'crosshair'; U().hint(FT.t('house_move_hint')); };
  T.endHouseMove = function () { T.movePick = null; map.getCanvas().style.cursor = ''; U().hint(''); };
  function onClick(e) {
    if (dragging && dragging.moved) return;
    const p = ll(e), t = T.tool;
    if (T.movePick) { const m = T.movePick; if (!guard(p)) return; T.endHouseMove(); FT.commit(); if (m.kind === 'node') { T.moveNode(m.id, p); FT.changed('move'); T.select('node', m.id); } else { FT.houses.moveTo(m.id, p); FT.changed('bld'); T.select('bld', m.id); U().toast(FT.t('house_moved')); } return; }
    if (t === 'select') {
      const bx = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], lay = l => map.getLayer(l);
      if (lay('impv-pt')) { const iv = map.queryRenderedFeatures(bx, { layers: ['impv-pt'] }); if (iv.length) { if (e.originalEvent.shiftKey) FT.imp.deleteVertex(iv[0].properties); return; } }
      if (lay('bh-pt') && map.queryRenderedFeatures(bx, { layers: ['bh-pt', 'bh-vtx'] }).length) return; // a click on a handle never changes the selection
      const h = hit(e); T.cycle++;
      if (!h) { if (T.sel || T.multi) T.select(null); else if (FT.map.doneRing) { FT.map.setDone(null); U().hint(''); } return; }
      if (T.tooHigh()) { tooHighToast(); return; }
      if (e.originalEvent.shiftKey && h.kind === 'bld') { T.toggleBuilding(h.id); return; }
      if (e.originalEvent.shiftKey && (h.kind === 'node' || h.kind === 'pipe' || h.kind === 'cable')) { T.toggleMulti(h); return; }
      T.select(h.kind, h.id); return;
    }
    if (NODE_TOOLS[t]) { if (!guard(p)) return; const sp = FT.roads.snapPoint(p, 18); FT.commit(); const n = FT.addNode(NODE_TOOLS[t], sp); FT.changed('add'); T.select('node', n.id); T.tool = t; U().toolChanged(); U().toast(FT.t('toast_added') + ' · ' + n.name); return; }
    if (t === 'splice') { const n = nodeNear(e.point, 22); if (n) { U().openSplice(n.id, true); } return; }
    if (t === 'pipe' || t === 'cable') return lineClick(e, p, t);
    if (t === 'route') return routeClick(e);
    if (t === 'reconnect') return reconnectClick(e, p);
    if (t === 'area' || t === 'measure' || t === 'shape' || (t === 'number' && T.num.mode === 'auto') || t === 'dxfarea' || t === 'bdraw' || t === 'plan' || t === 'design') return shapeClick(e, p);
    if (t === 'number' && T.num.mode === 'click') return FT.num.clickBuilding(e, p);
    if (t === 'floors') return FT.num.clickFloors(e, p);
    if (t === 'house') return houseClick(e, p);
    if (t === 'sub') return subClick(e, p);
    if (t === 'wdev' || t === 'wlink') return FT.wl && FT.wl.click(e, p);
  }

  function lineClick(e, p, t) {
    if (!guard(p)) return;
    if (!T.draw) startDraw(t);
    const n = nodeNear(e.point, 18), q = n ? n.ll : p;
    if (!T.draw.pts.length && !n) { U().toast(FT.t('toast_node_end')); return; }
    const last = T.draw.pts[T.draw.pts.length - 1];
    if (last && n && FT.roads.on && FT.dist(last, q) > 12) { const rp = FT.roads.path(last, q); if (rp && FT.pathLen(rp) < FT.dist(last, q) * 3.2 + 60) { rp.slice(1, -1).forEach(v => addDrawPoint(v, null)); T.roadSnapped = true; } }
    if (addDrawPoint(q, n && n.id)) { preview(q); updateMeter(e.point, q); U().refreshStatus(); }
  }
  function updateMeter(pt, cur) {
    const d = T.draw; if (!d || !d.pts.length) { U().meter(null); return; }
    const pts = d.pts.slice(), last = pts[pts.length - 1];
    let seg = FT.dist(last, cur), total = FT.pathLen(pts) + seg;
    // cable over an existing pipe: report the duct length
    if (d.kind === 'cable') { const a = d.nodes[d.nodes.length - 1], nb = T.hoverNode; if (a && nb && a !== nb.id) { const pp = FT.pipeBetween(a, nb.id); if (pp) { total = total - seg + FT.pathLen(pp.pts); seg = FT.pathLen(pp.pts); } } }
    U().meter(pt, seg, total);
  }
  function onMove(e) {
    const d = T.draw; T.hoverNode = null;
    if (dragging) return dragMove(e);
    FT.map.hover(ll(e), e.point);
    if (!d) { if (T.tool === 'select') { const h = hit(e); map.getCanvas().style.cursor = h ? 'pointer' : ''; } if (T.tool === 'pipe' || T.tool === 'cable' || T.tool === 'route' || T.tool === 'reconnect' || T.tool === 'splice') { const n = nodeNear(e.point, 18); map.getCanvas().style.cursor = n ? 'cell' : 'crosshair'; } return; }
    const p = ll(e); let cur = p;
    if (d.kind === 'pipe' || d.kind === 'cable') { const n = nodeNear(e.point, 18); if (n) { cur = n.ll; T.hoverNode = n; } }
    if (d.shape === 'rect' && d.pts.length === 1) { d.pts[1] = cur; preview(); d.pts.length = 1; U().meterRect(e.point, d.pts[0], cur); return; }
    preview(cur);
    if (d.kind === 'pipe' || d.kind === 'cable') updateMeter(e.point, cur);
    else if (d.kind === 'measure' || d.kind === 'area' || d.kind === 'shape') { const pts = d.pts.concat([cur]); U().meterMeasure(e.point, pts); }
  }
  function onDbl(e) {
    if (T.tool === 'select' && FT.imp && FT.imp.unlocked.size && map.getLayer('imp-line')) {
      const f = map.queryRenderedFeatures([[e.point.x - 7, e.point.y - 7], [e.point.x + 7, e.point.y + 7]], { layers: ['imp-line'] }).find(x => FT.imp.unlocked.has(x.properties.imp));
      if (f && FT.imp.insertVertex(f.properties.imp, +f.properties.fi, ll(e))) { e.preventDefault(); return; }
    }
    onDbl2(e);
  }
  function onDbl2(e) { if (T.draw && T.draw.kind !== 'shape' || (T.draw && T.draw.shape === 'poly')) { e.preventDefault(); T.finish(); } }
  function onCtx(e) {
    if (T.draw) { e.preventDefault && e.preventDefault(); T.finish(); return; }
    const h = hit(e), extra = [];
    if (map.getLayer('impv-pt')) { const iv = map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ['impv-pt'] }); if (iv.length) { const pr = iv[0].properties; extra.push([FT.lang === 'ar' ? 'حذف هذه النقطة' : 'Delete this point', () => FT.imp.deleteVertex(pr)]); } }
    if (h && T.tooHigh()) { tooHighToast(); return; }
    if (h && !(h.kind === 'bld' && T.bsel.has(h.id))) { T.select(h.kind, h.id); }
    U().ctxMenu(e.originalEvent.clientX, e.originalEvent.clientY, h, ll(e), extra);
  }

  // node dragging
  T.SELECT_MAX_M = 100; // metres under a 100 px scale bar; zoomed out further than this nothing drawn can be selected or edited
  const metersPer100px = () => 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom()) * 100;
  T.tooHigh = () => metersPer100px() > T.SELECT_MAX_M;
  const tooHighToast = () => { if (Date.now() - (T._hiToast || 0) > 3000) { T._hiToast = Date.now(); U().toast(FT.lang === 'ar' ? 'قرّب أكتر لتحديد العناصر (السكيل أقل من 100 م)' : 'Zoom in to select elements (scale under 100 m)'); } };
  T.isDragging = () => !!dragging;
  T.MOVE_MAX_M = 50; // metres under a 100 px scale bar; zoomed out further than this, elements cannot be dragged
  function onDown(e) {
    if (T.tool !== 'select' || e.originalEvent.button !== 0) return;
    const bx = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
    if (!(FT.store && FT.store.mode === 'view') && !T.tooHigh()) {
      if (map.getLayer('bh-pt') && T.sel && T.sel.kind === 'bld') { // building handles: stretch / move / single corner
        const hb = map.queryRenderedFeatures(bx, { layers: ['bh-pt', 'bh-vtx'] });
        if (hb.length) { const sc = x => { const q = map.project(x.geometry.coordinates); return Math.hypot(q.x - e.point.x, q.y - e.point.y) + (x.properties.k === 'move' ? 6 : 0); }; const f = hb.slice().sort((p1, p2) => sc(p1) - sc(p2))[0], k = f.properties.k; /* nearest handle to the cursor: icons overlap on small buildings */ if (FT.bedit.begin(T.sel.id, k, k === 'vtx' ? f.properties.i : f.properties.d, ll(e))) { dragging = { bh: true, moved: false, start: ll(e) }; map.dragPan.disable(); return; } }
      }
      if (map.getLayer('impv-pt') && !e.originalEvent.shiftKey) { // vertex of an unlocked imported file
        const iv = map.queryRenderedFeatures(bx, { layers: ['impv-pt'] });
        if (iv.length) { const pr = iv[0].properties; dragging = { imp: { g: pr.g, f: +pr.f, r: +pr.r, i: +pr.i }, moved: false, start: ll(e) }; map.dragPan.disable(); return; }
      }
    }
    const h = hit(e);
    if (h && h.kind === 'bld' && !(FT.store && FT.store.mode === 'view')) { const hs = map.queryRenderedFeatures([[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]], { layers: ['house', 'm3d'] }).filter(f => f.layer.id === 'house' || f.properties.kind === 'house'); if (hs.length) { const id = hs[0].properties.id || hs[0].properties.mid, mpp = 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom()); if (mpp * 100 > T.MOVE_MAX_M && T.sel && T.sel.kind === 'bld' && hs.some(f => (f.properties.id || f.properties.mid) === T.sel.id) && Date.now() - (T._mvToast || 0) > 4000) { T._mvToast = Date.now(); U().toast(FT.t('house_move_zoom')); }
      if (mpp * 100 <= T.MOVE_MAX_M && !T.locked.has(id)) { dragging = { house: id, from: FT.map.housePoint(id).slice(), start: ll(e), moved: false }; map.dragPan.disable(); return; } } }
    if (!h || h.kind !== 'node') return;
    if (e.originalEvent.shiftKey) return; // Shift+click builds a multi-selection
    if (T.locked.has(h.id)) return;
    /* A dense network covers the whole screen: grabbing the first element under the cursor made it impossible to pan the map (and moved elements by accident).
       An element is grabbed at once only when it is already selected, part of the selection, or the map is zoomed in; otherwise the drag pans the map (click it first, then drag). */
    /* Housin's rule: elements can be moved only when zoomed in (scale bar of 100 px <= 50 m). Zoomed out, a drag always pans the map. */
    const mpp = 156543.03 * Math.cos(map.getCenter().lat * Math.PI / 180) / Math.pow(2, map.getZoom());
    if (mpp * 100 > T.MOVE_MAX_M) {
      if (T.sel && T.sel.kind === 'node' && T.sel.id === h.id && Date.now() - (T._mvToast || 0) > 4000) { T._mvToast = Date.now(); U().toast(FT.lang === 'ar' ? 'قرّب أكتر لتحريك العناصر (السكيل أقل من 50 م)' : 'Zoom in to move elements (scale under 50 m)'); }
      return;
    }
    T.select('node', h.id); dragging = { id: h.id, moved: false, start: ll(e) }; map.dragPan.disable();
  }
  let impTick = 0;
  function dragMove(e) {
    const d = dragging;
    if (d.house) { const q = ll(e); if (!d.moved) { if (FT.dist(d.start, q) < 0.8) return; FT.commit(); d.moved = true; T.select('bld', d.house); } FT.houses.moveTo(d.house, [d.from[0] + q[0] - d.start[0], d.from[1] + q[1] - d.start[1]]); FT.map.rebuildHouses(); FT.map.renderNet('move'); return; }
    if (d.bh) { if (!d.moved && FT.dist(d.start, ll(e)) < 0.4) return; d.moved = true; FT.bedit.update(ll(e)); return; }
    if (d.imp) { if (!d.moved) { if (FT.dist(d.start, ll(e)) < 0.4) return; FT.commit(); d.moved = true; } FT.imp.moveVertex(d.imp, ll(e)); const now = Date.now(); if (now - impTick > 45) { impTick = now; FT.imp.render(); } return; }
    if (!d.moved) { if (FT.dist(d.start, ll(e)) < 0.6) return; FT.commit(); d.moved = true; }
    T.moveNode(d.id, ll(e)); FT.map.renderNet('move'); FT.map.setSelection('node', d.id); U().meterNode(e.point, FT.dist(d.start, ll(e)));
  }
  function onUp() {
    if (!dragging) return; const d = dragging; map.dragPan.enable(); U().meter(null);
    if (d.house) { if (d.moved) FT.changed('bld'); setTimeout(() => { dragging = null; }, 0); if (!d.moved) dragging = null; return; }
    if (d.bh) { FT.bedit.end(); setTimeout(() => { dragging = null; }, 0); return; }
    if (d.imp) { if (d.moved) { FT.imp.render(); FT.changed('import'); } setTimeout(() => { dragging = null; }, 0); return; }
    if (d.moved) { FT.changed('move'); U().selectionChanged(); } setTimeout(() => { dragging = null; }, 0); if (!d.moved) dragging = null;
  }

  // ---------------- finishing ----------------
  T.finish = function () {
    const d = T.draw; if (!d) return;
    const t = T.tool;
    if (d.kind === 'pipe' || d.kind === 'cable') {
      if (d.pts.length < 2) { U().toast(FT.t('toast_need2')); return; }
      if (!d.nodes[d.nodes.length - 1]) { U().toast(FT.t('toast_node_end')); return; }
      FT.commit();
      // split at intermediate nodes
      const idx = d.nodes.map((n, i) => n ? i : -1).filter(i => i >= 0);
      if (d.kind === 'pipe') {
        for (let k = 1; k < idx.length; k++) { const a = idx[k - 1], b = idx[k]; if (d.nodes[a] === d.nodes[b]) continue; FT.addPipe(d.pts.slice(a, b + 1), d.nodes[a], d.nodes[b], T.opt && T.opt.ptype || U().toolPipeType(), U().toolPipeCat()); }
        U().toast(FT.t('toast_saved') + ' · ' + FT.fmtLen(FT.pathLen(d.pts)));
      } else {
        const nodes = idx.map(i => d.nodes[i]), segs = []; for (let k = 1; k < idx.length; k++) segs.push(d.pts.slice(idx[k - 1], idx[k] + 1));
        const c = FT.addCable(d.pts, nodes[0], nodes[nodes.length - 1], U().toolCableCat(), U().toolMedium(), nodes, segs);
        U().toast(FT.t('toast_cab_added') + ' · ' + FT.fmtLen(FT.cableLength(c)));
      }
      T.draw = null; FT.map.setDraw([]); U().meter(null); FT.changed('add'); U().refreshStatus(); return;
    }
    if (d.kind === 'shape' || d.kind === 'area' || d.kind === 'measure') finishShape(d);
  };
  // add a house marker (a click on an existing one selects it)
  function houseClick(e, p) {
    const on = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ['house', 'house-num'] });
    if (on.length) { T.select('bld', on[0].properties.id); U().tab('tool'); return; }
    if (!guard(p)) return; if (map.getZoom() < FT.houses.MINZ) { U().toast(FT.t('house_zoom')); return; }
    T.select('bld', FT.houses.add(p)); U().tab('tool');
  }
  function shapeClick(e, p) {
    const t = T.tool; if (!T.draw) startDraw(t === 'shape' ? 'shape' : (t === 'measure' ? 'measure' : (t === 'area' ? 'area' : 'shape')), { shape: t === 'dxfarea' && T.opt && T.opt.rect ? 'rect' : 'poly', tool: t });
    const d = T.draw;
    if (d.shape === 'rect') { if (!d.pts.length) { addDrawPoint(p); preview(p); } else { d.pts[1] = p; finishShape(d); } return; }
    if (t !== 'measure' && t !== 'area' && t !== 'shape' && t !== 'bdraw' && t !== 'number' && t !== 'dxfarea' && t !== 'plan' && t !== 'design') return;
    if (addDrawPoint(p)) preview(p);
  }
  function finishShape(d) {
    let pts = d.pts.slice(); const rect = d.shape === 'rect';
    if (rect && pts.length >= 2) { const a = pts[0], b = pts[1]; pts = [a, [b[0], a[1]], b, [a[0], b[1]]]; }
    if (d.kind === 'measure') { if (pts.length < 2) return; const len = FT.pathLen(pts); T.draw = null; FT.map.setDraw([]); U().meter(null); FT.map.setDone(pts, pts.length < 3); U().hint(FT.fmtLen(len) + (pts.length >= 3 ? ' · ' + (FT.ringArea(pts) / 10000).toFixed(2) + ' ha' : '')); return; } // the result stays, in green, until Esc or the next action
    if (pts.length < 3) { U().toast(FT.t('toast_need2')); return; }
    const tool = T.tool; T.draw = null; FT.map.setDraw([]); U().meter(null); U().refreshStatus(); if (tool !== 'bdraw') FT.map.setDone(pts);
    if (tool === 'area') { const m = T.collectIn(pts); if (!(m.nodes.size + m.pipes.size + m.cables.size) && m.houses.size) { const ids = [...m.houses]; T.multi = null; T.bsel = new Set(ids); T.sel = { kind: 'bld', id: ids[ids.length - 1] }; FT.map.setBuildingSelection(new Set(ids)); U().selectionChanged(); return; } T.selectMulti(m); return; }
    if (tool === 'shape' && T.shapeCB) { const cb = T.shapeCB; T.shapeCB = null; T.setTool('select'); cb(pts); return; }
    if (tool === 'dxfarea' && T.shapeCB) { const cb = T.shapeCB; T.shapeCB = null; T.setTool('select'); cb(pts); return; }
    if (tool === 'number') { FT.num.autoNumber(pts); return; }
    if (tool === 'bdraw') { FT.num.addBuilding(pts); return; }
    if (tool === 'plan' || tool === 'design') { U().shapeForAnalysis(tool, pts); return; }
  }
  T.collectIn = function (ring) {
    const S = FT.state, m = { nodes: new Set(), pipes: new Set(), cables: new Set() };
    Object.values(S.nodes).forEach(n => { if (FT.pointInRing(n.ll, ring)) m.nodes.add(n.id); });
    Object.values(S.pipes).forEach(p => { if (p.pts.some(q => FT.pointInRing(q, ring))) m.pipes.add(p.id); });
    Object.values(S.cables).forEach(c => { if (c.nodes.some(i => m.nodes.has(i))) m.cables.add(c.id); });
    m.houses = new Set(FT.map.buildingsInRing(ring).map(b => b.id));
    return m;
  };
  T.toggleMulti = function (h) {
    const m = T.multi || { nodes: new Set(), pipes: new Set(), cables: new Set() };
    if (T.sel && !T.multi) { const s = T.sel, k = s.kind === 'node' ? 'nodes' : s.kind === 'pipe' ? 'pipes' : 'cables'; m[k].add(s.id); }
    const k = h.kind === 'node' ? 'nodes' : h.kind === 'pipe' ? 'pipes' : 'cables';
    if (m[k].has(h.id)) m[k].delete(h.id); else m[k].add(h.id); T.selectMulti(m);
  };

  // ---------------- route, reconnect, subscriber ----------------
  function routeClick(e) {
    const n = nodeNear(e.point, 22); if (!n) return;
    if (!T.draw) { startDraw('route'); T.draw.a = n.id; U().hint('A → ' + n.name); return; }
    const path = T.route(T.draw.a, n.id); T.draw = null;
    if (!path) { U().toast('No cable path between these nodes'); return; }
    const pts = path.pts; FT.map.map.getSource('sel').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] });
    U().toast('Route: ' + FT.fmtLen(path.len) + ' · ' + path.nodes.length + ' ' + FT.t('nodes_n'));
  }
  T.route = function (a, b) {
    const S = FT.state, adj = {};
    Object.values(S.cables).forEach(c => FT.cableSpans(c).forEach(s => { (adj[s.from] = adj[s.from] || []).push([s.to, s.len, s.pts]); (adj[s.to] = adj[s.to] || []).push([s.from, s.len, s.pts.slice().reverse()]); }));
    const dist = { [a]: 0 }, prev = {}, q = [a], done = new Set();
    while (q.length) { q.sort((x, y) => dist[x] - dist[y]); const u = q.shift(); if (done.has(u)) continue; done.add(u); if (u === b) break; (adj[u] || []).forEach(([v, w, pts]) => { if (dist[v] == null || dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = [u, pts]; q.push(v); } }); }
    if (dist[b] == null) return null; const nodes = [b], segs = []; let c = b; while (c !== a) { const [u, pts] = prev[c]; segs.unshift(pts); nodes.unshift(u); c = u; }
    return { nodes, len: dist[b], pts: [].concat(...segs.map((s, i) => i ? s.slice(1) : s)) };
  };
  function reconnectClick(e, p) {
    const S = FT.state;
    if (!T.draw || !T.draw.line) {
      const h = hit(e); if (!h || (h.kind !== 'pipe' && h.kind !== 'cable')) return;
      const o = h.kind === 'pipe' ? S.pipes[h.id] : S.cables[h.id], A = S.nodes[o.a], B = S.nodes[o.b];
      const end = FT.dist(p, A.ll) <= FT.dist(p, B.ll) ? 'a' : 'b'; startDraw('reconnect'); T.draw.line = { kind: h.kind, id: h.id, end }; T.select(h.kind, h.id); U().hint(FT.t('p_link') + ' · ' + (end === 'a' ? FT.t('p_start') : FT.t('p_end'))); return;
    }
    const n = nodeNear(e.point, 22); if (!n) return; const L = T.draw.line, o = (L.kind === 'pipe' ? S.pipes : S.cables)[L.id];
    const other = o[L.end === 'a' ? 'b' : 'a']; if (n.id === other) { U().toast('Same node at both ends'); return; }
    FT.commit(); o[L.end] = n.id;
    if (L.kind === 'pipe') { if (L.end === 'a') o.pts[0] = n.ll; else o.pts[o.pts.length - 1] = n.ll; }
    else { o.nodes[L.end === 'a' ? 0 : o.nodes.length - 1] = n.id; if (o.segs) { if (L.end === 'a' && o.segs[0]) o.segs[0][0] = n.ll; if (L.end === 'b' && o.segs.length) o.segs[o.segs.length - 1][o.segs[o.segs.length - 1].length - 1] = n.ll; } }
    T.draw = null; U().hint(''); FT.changed('reconnect'); U().toast(FT.t('toast_saved'));
  }
  function subClick(e, p) {
    const pick = nodeNear(e.point, 22); if (pick && pick.ratio) { T.sel = { kind: 'node', id: pick.id }; FT.map.setSelection('node', pick.id); U().selectionChanged(); U().hint(pick.name + ' ' + pick.ratio + ' → ' + (FT.lang === 'ar' ? 'انقر على بيت لربطه' : 'click a building to connect')); return; }
    const h = T.hit(e), b = h && h.kind === 'bld' ? h.id : null, S = FT.state, box = T.sel && T.sel.kind === 'node' ? S.nodes[T.sel.id] : null;
    if (!box || !box.ratio) { U().toast('Select an FDC / iFDC / FDB with a splitter ratio first'); return; }
    if (!b) { U().toast(FT.lang === 'ar' ? 'انقر على لوغو البيت' : 'Click a house icon'); return; }
    FT.fui.openConnect(box.id, b); // pick the port; one step writes subscriber, drop cable and port fusion (js/subui.js)
  }

  // ---------------- keyboard ----------------
})(window);
