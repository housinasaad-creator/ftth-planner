/* Interactive training: the coach. It walks the trainee through one continuous project on the training quarter, using
   the planner's own tools. Each step dims the screen, leaves only what is needed, points at it, and moves on by itself
   once the planner's data shows the action really happened. "Skip this tool" performs the rest of that tool for him.
   The lessons themselves are in train_lessons.js; every text is written as [Arabic, English]. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const TR = FT.train = { on: !!G.FT_TRAIN, active: false, L: 0, s: 0, vars: {}, snaps: {}, busy: false, pressed: false, menu: false, lessons: [] };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const U = () => FT.UI, T = () => FT.T, M = () => FT.map.map, W = () => FT.trainWorld;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const val = v => typeof v === 'function' ? v() : v;
  const ar = () => FT.lang === 'ar';
  const say = p => { p = val(p); return Array.isArray(p) ? p[ar() ? 0 : 1] : (p || ''); };
  const tx = (a, e) => ar() ? a : e;
  TR.say = say;
  const lesson = () => TR.lessons[TR.L];
  const step = () => { const l = lesson(); return l && l.steps[TR.s]; };
  TR.step = step;

  // ======================================================= the way in (header button, both modes)
  const saved = () => { try { return G.FT_TRAIN_STORE ? G.FT_TRAIN_STORE.get() : JSON.parse(localStorage.getItem('ft2_train')); } catch (e) { return null; } };
  async function goTraining(q) {
    try { if (FT.store && FT.store.cur) await FT.store.saveNow(); if (FT.sync && FT.sync.active) await FT.sync.flush(); } catch (e) { }
    location.href = location.pathname + '?train=1' + (q || '');
  }
  TR.exit = () => { location.href = location.pathname; };
  const need = () => { if (!TR.lessons.length) TR.lessons = FT.trainLessons(); }; // in the real planner the list is only needed in this window
  TR.openMenu = view => FT.hub.open(view || (TR.active && !TR.finished ? 'lessons' : 'home')); // the window itself is js/hub.js
  TR.progress = () => { need(); const sv = saved(); return sv && sv.L > 0 && sv.L < TR.lessons.length ? sv.L : 0; };
  TR.lessonsHtml = function () {
    need(); const at = TR.progress();
    const list = TR.lessons.map((l, i) => '<button type="button" class="tr-lsn' + (TR.active && i === TR.L ? ' on' : '') + (TR.active && i < TR.L ? ' done' : '') + '" data-lsn="' + i + '"><b>' + (i + 1) + '</b><i>' + l.icon + '</i><span>' + say(l.title) + '</span></button>').join('');
    return '<p class="d">' + tx('مشروع واحد متسلسل على حي تدريبي فيه عشرين بيت: بترسمه من الصفر لآخر تقرير، بالأدوات الحقيقية. التدريب بمكان معزول: ما بيلمس مشاريعك ولا السيرفر.', 'One continuous project on a training quarter with twenty houses: you build it from zero to the final report with the real tools. Training is sealed off: it never touches your projects or the server.') + '</p>' +
      (TR.active ? '' : '<div class="tr-go">' + (at ? '<button type="button" class="btn pri" id="trResume">⏵ ' + tx('كمّل من الأداة ', 'Continue at tool ') + (at + 1) + '</button>' : '') + '<button type="button" class="btn' + (at ? '' : ' pri') + '" id="trStart">▶ ' + tx('ابدأ من الأول', 'Start from the beginning') + '</button></div>') +
      '<div class="cap">' + tx('الدروس (' + TR.lessons.length + ') — اضغط أي درس لتروح له', 'Lessons (' + TR.lessons.length + ') — click one to go there') + '</div><div class="tr-lessons">' + list + '</div>';
  };
  TR.wireLessons = function (root) {
    const a = root.querySelector('#trStart'), b = root.querySelector('#trResume');
    if (a) a.onclick = () => goTraining();
    if (b) b.onclick = () => goTraining('&resume=1');
    root.querySelectorAll('[data-lsn]').forEach(x => x.onclick = () => { const i = +x.dataset.lsn; if (!TR.active) return goTraining('&lesson=' + i); TR.menu = false; U().closeModal(); TR.jump(i); });
  };

  // ======================================================= the training quarter on the map
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function hideBase() { (FT.map.baseLayerIds || []).forEach(id => { const l = M().getLayer(id); if (l && l.type !== 'background') M().setLayoutProperty(id, 'visibility', 'none'); }); }
  function paintWorld() {
    const m = M(); if (!m.getLayer('tr-road')) return; const dark = U().theme() === 'dark';
    m.setPaintProperty('tr-road', 'line-color', dark ? '#454c5e' : '#ffffff'); m.setPaintProperty('tr-road-case', 'line-color', dark ? '#1a1e28' : '#c3c9d6');
    m.setPaintProperty('tr-road-name', 'text-color', dark ? '#aab3c5' : '#4a5368'); m.setPaintProperty('tr-road-name', 'text-halo-color', dark ? '#2c3038' : '#ffffff');
    (FT.map.baseLayerIds || []).forEach(id => { const l = m.getLayer(id); if (l && l.type === 'background') m.setPaintProperty(id, 'background-color', dark ? '#2b2f38' : '#e9ebf1'); });
    m.setPaintProperty('tr-lot-fill', 'fill-color', '#ff6a3d'); m.setPaintProperty('tr-lot-name', 'text-color', dark ? '#ffb199' : '#c4461c'); m.setPaintProperty('tr-lot-name', 'text-halo-color', dark ? '#2c3038' : '#ffffff');
  }
  const roadData = () => ({ type: 'FeatureCollection', features: W().streets() });
  function lotData() {
    const S = FT.state, out = [];
    [1, 2].forEach(k => { const at = W().P['lot' + k]; const taken = Object.values(S.bld || {}).some(b => { if (b.deleted) return false; const p = b.pt || (b.fp && FT.centroid(b.fp)); return p && FT.dist(p, at) < 12; }); if (!taken) { out.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [W().lotOutline(k)] } }); out.push({ type: 'Feature', properties: { t: tx('أرض فاضية ' + k, 'Empty lot ' + k) }, geometry: { type: 'Point', coordinates: at } }); } });
    return { type: 'FeatureCollection', features: out };
  }
  function buildWorld() {
    const m = M();
    FT.roads._lines = W().streets(); FT.roads.on = true; FT.roads.dirty = true;
    hideBase();
    const under = m.getLayer('bld-3d') ? 'bld-3d' : undefined;
    m.addSource('tr-road', { type: 'geojson', data: roadData() });
    m.addLayer({ id: 'tr-road-case', type: 'line', source: 'tr-road', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 3, 19, 46] } }, under);
    m.addLayer({ id: 'tr-road', type: 'line', source: 'tr-road', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 2, 19, 38] } }, under);
    m.addLayer({ id: 'tr-road-name', type: 'symbol', source: 'tr-road', layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11.5 }, paint: { 'text-halo-width': 1.4 } }, under);
    m.addSource('tr-lot', { type: 'geojson', data: lotData() });
    m.addLayer({ id: 'tr-lot-fill', type: 'fill', source: 'tr-lot', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-opacity': 0.1 } }, under);
    m.addLayer({ id: 'tr-lot-line', type: 'line', source: 'tr-lot', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#ff6a3d', 'line-width': 1.4, 'line-dasharray': [3, 2] } }, under);
    m.addLayer({ id: 'tr-lot-name', type: 'symbol', source: 'tr-lot', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['get', 't'], 'text-font': ['Noto Sans Bold'], 'text-size': 11 }, paint: { 'text-halo-width': 1.4 } });
    m.addSource('tr-ghost', { type: 'geojson', data: EMPTY });
    m.addLayer({ id: 'tr-ghost-fill', type: 'fill', source: 'tr-ghost', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ff6a3d', 'fill-opacity': 0.07 } });
    m.addLayer({ id: 'tr-ghost-line', type: 'line', source: 'tr-ghost', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff8a62', 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1.2, 1.8] } });
    // the planner's own switches must not bring the real map back under the training quarter
    const base = FT.map.setBase; FT.map.setBase = function (k) { base.call(FT.map, k); hideBase(); paintWorld(); };
    const theme = FT.map.applyTheme; FT.map.applyTheme = function () { theme.call(FT.map); paintWorld(); };
    paintWorld();
  }
  TR.refreshLots = () => { const s = M().getSource('tr-lot'); if (s) s.setData(lotData()); };
  function ghost(list) { // list: lines (arrays of points) or {ring}
    const src = M().getSource('tr-ghost'); if (!src) return;
    src.setData({ type: 'FeatureCollection', features: (list || []).filter(Boolean).map(g => g.ring ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [g.ring.concat([g.ring[0]])] } } : { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: g } }) });
  }

  // ======================================================= what is lit, what is blocked
  let dim, marks, card, ring = null, panned = '', lastSig = '', lastCardAt = 0;
  const visible = el => { if (!el || !el.getClientRects().length) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
  const els = sel => { const s = val(sel); if (!s) return []; return [].concat(s).filter(Boolean).flatMap(q => { try { return $$(q); } catch (e) { return []; } }).filter(visible); };
  const box = (el, pad) => { let r = el.getBoundingClientRect(), x = r.left, y = r.top, X = r.right, Y = r.bottom; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const c = p.getBoundingClientRect(); x = Math.max(x, c.left); y = Math.max(y, c.top); X = Math.min(X, c.right); Y = Math.min(Y, c.bottom); } } return X - x > 2 && Y - y > 2 ? { x: x - pad, y: y - pad, w: X - x + 2 * pad, h: Y - y + 2 * pad } : null; };
  // map targets: [lon, lat] or { ll, dy } (dy = pixels from the point to the middle of its icon)
  const targets = st => { const p = st && val(st.pts); return (p || []).filter(Boolean).map(q => Array.isArray(q) ? { ll: q, dy: 0 } : { ll: val(q.ll), dy: q.dy || 0 }).filter(q => q.ll); };
  const mapBox = () => { const r = $('#map').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const screen = (q, mb) => { const p = M().project(q.ll); return { x: mb.x + p.x, y: mb.y + p.y + q.dy }; };
  const at = st => st.at ? st.at() : 0;
  // the targets that accept a click right now
  function openTargets(st) {
    const list = targets(st); if (!list.length) return [];
    if (st.any) return list.map((q, i) => Object.assign({ i }, q)).filter(q => !(st.isDone && st.isDone(q.i)));
    const i = at(st);
    return i < list.length ? [Object.assign({ i }, list[i])] : [Object.assign({ i: list.length - 1, finish: true }, list[list.length - 1])];
  }

  const rr = (b, r) => '<rect x="' + b.x.toFixed(1) + '" y="' + b.y.toFixed(1) + '" width="' + b.w.toFixed(1) + '" height="' + b.h.toFixed(1) + '" rx="' + (r == null ? 9 : r) + '"';
  function paint() {
    if (!TR.active) return;
    requestAnimationFrame(paint);
    const st = step(), hide = TR.menu || TR.finished || !st;
    dim.style.display = marks.style.display = hide ? 'none' : '';
    card.style.display = TR.menu ? 'none' : '';
    if (hide) return;
    const W_ = innerWidth, H_ = innerHeight, mb = mapBox(), modal = $('#modal').classList.contains('on') || $('#modal2').classList.contains('on');
    const hot = els(st.allow).map(e => box(e, 4)).filter(Boolean), soft = els(st.show).map(e => box(e, 4)).filter(Boolean);
    const list = modal ? [] : targets(st), open = modal ? [] : openTargets(st), cur = new Set(open.map(q => q.i));
    const mapOn = !modal && (st.map === 'free' || st.map === 'look' || list.length > 0);
    const pts = list.map((q, i) => Object.assign(screen(q, mb), { i, cur: cur.has(i), done: st.any ? !!(st.isDone && st.isDone(i)) : i < at(st), finish: open.some(o => o.finish && o.i === i) }));
    const sig = JSON.stringify([W_, H_, modal, mapOn, st.map, st.dim, hot, soft, mapOn ? [mb.x, mb.y, mb.w, mb.h] : 0, pts.map(p => [p.x | 0, p.y | 0, p.cur, p.done, p.finish])]);
    if (sig !== lastSig) {
      lastSig = sig;
      const holes = hot.concat(soft).map(b => rr(b) + ' fill="#000"/>').join('');
      const circles = pts.filter(p => p.cur).map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="30" fill="#000"/>').join('');
      const mapA = st.dim === 0 ? 0 : st.map === 'free' || st.map === 'look' ? 0 : list.length ? 0.34 : 0.6, uiA = st.dim === 0 ? 0 : 0.74;
      dim.setAttribute('viewBox', '0 0 ' + W_ + ' ' + H_);
      dim.innerHTML = '<defs><mask id="trMu"><rect width="' + W_ + '" height="' + H_ + '" fill="#fff"/>' + (modal ? '' : rr(mb, 0) + ' fill="#000"/>') + holes + '</mask><mask id="trMm"><rect width="' + W_ + '" height="' + H_ + '" fill="#000"/>' + (modal ? '' : rr(mb, 0) + ' fill="#fff"/>') + holes + circles + '</mask></defs>' +
        '<rect width="' + W_ + '" height="' + H_ + '" fill="#04060a" fill-opacity="' + uiA + '" mask="url(#trMu)"/><rect width="' + W_ + '" height="' + H_ + '" fill="#04060a" fill-opacity="' + mapA + '" mask="url(#trMm)"/>';
      // marks: pulsing frames around what to press, numbered dots on the map
      const many = list.length > 1;
      let h = hot.map(b => '<div class="tr-ring" style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"></div>').join('') + soft.map(b => '<div class="tr-ring soft" style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"></div>').join('');
      h += pts.filter(p => p.x > mb.x && p.x < mb.x + mb.w && p.y > mb.y && p.y < mb.y + mb.h).map(p => '<div class="tr-dot' + (p.cur ? ' cur' : p.done ? ' done' : '') + '" style="left:' + p.x + 'px;top:' + p.y + 'px">' + (many ? '<em>' + (p.done && !p.cur ? '✓' : p.i + 1) + '</em>' : '') + '</div>').join('');
      const aim = pts.find(p => p.cur) || null;
      if (aim) h += '<div class="tr-hand" style="left:' + aim.x + 'px;top:' + aim.y + 'px">👆</div>';
      else if (hot.length) { const b = hot[0], up = b.y > 110; h += '<div class="tr-arrow ' + (up ? 'down' : 'up') + '" style="left:' + (b.x + b.w / 2) + 'px;top:' + (up ? b.y - 4 : b.y + b.h + 4) + 'px"></div>'; }
      marks.innerHTML = h;
    }
    if (Date.now() - lastCardAt > 350) { lastCardAt = Date.now(); placeCard(hot.concat(soft), pts, mb, modal); }
    keepInView(st, list, mb, modal);
  }
  // the card goes where it covers nothing the trainee needs
  function placeCard(rects, pts, mb, modal) {
    const w = card.offsetWidth, h = card.offsetHeight, W_ = innerWidth, H_ = innerHeight;
    const need = rects.map(r => ({ x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24, k: 3 })).concat(pts.map(p => ({ x: p.x - 46, y: p.y - 46, w: 92, h: 92, k: p.cur ? 6 : 1.5 })));
    const dlg = modal && ($('#modal2.on .dlg') || $('#modal.on .dlg')); if (dlg) { const d = dlg.getBoundingClientRect(); need.push({ x: d.left, y: d.top, w: d.width, h: d.height, k: 2 }); }
    const rp = $('#right'); if (!modal && rp && visible(rp)) { const d = rp.getBoundingClientRect(); need.push({ x: d.left, y: d.top, w: d.width, h: d.height, k: 1 }); }
    const cost = c => need.reduce((a, r) => a + Math.max(0, Math.min(c.x + w, r.x + r.w) - Math.max(c.x, r.x)) * Math.max(0, Math.min(c.y + h, r.y + r.h) - Math.max(c.y, r.y)) * r.k, 0);
    const xs = [mb.x + 12, mb.x + (mb.w - w) / 2, mb.x + mb.w - w - 12, 12, W_ - w - 12, mb.x + mb.w - w - 356], ys = [H_ - h - 44, 62, (H_ - h) / 2];
    const cand = []; ys.forEach(y => xs.forEach(x => cand.push({ x: Math.max(8, Math.min(W_ - w - 8, x)), y: Math.max(54, Math.min(H_ - h - 8, y)) })));
    let best = null, bc = Infinity; cand.forEach((c, i) => { const k = cost(c) + i * 20; if (k < bc) { bc = k; best = c; } });
    if (ring && cost(ring) <= bc + 1500) best = ring; // stays put unless another place is clearly better
    ring = best; card.style.left = best.x + 'px'; card.style.top = best.y + 'px';
  }
  // a target must never sit under the right panel or off the screen
  function keepInView(st, list, mb, modal) {
    if (modal || !list.length || st.map === 'free' || TR.busy || M().isMoving()) return;
    const key = TR.L + ':' + TR.s + ':' + at(st); if (panned === key) return;
    const o = openTargets(st)[0]; if (!o) return; const p = screen(o, mb), rp = $('#right'), r = rp && visible(rp) ? rp.getBoundingClientRect() : null;
    const outside = p.x < mb.x + 40 || p.x > mb.x + mb.w - 40 || p.y < mb.y + 40 || p.y > mb.y + mb.h - 40, under = r && p.x > r.left - 24 && p.x < r.right + 24 && p.y > r.top - 24 && p.y < r.bottom + 24;
    panned = key; if (!outside && !under) return;
    M().panBy([p.x - (mb.x + (mb.w - (r ? r.width : 0)) / 2), p.y - (mb.y + mb.h / 2)], { duration: 450 });
  }
  // fit a group of points in the free part of the map
  TR.camera = function (pts, o) {
    o = o || {}; if (!pts || !pts.length) return; const mb = mapBox(), rp = $('#right'), right = rp && visible(rp) ? 350 : 60;
    const bb = FT.bboxOf(pts), cam = M().cameraForBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 50, bottom: Math.min(190, mb.h * 0.3), left: 50, right: Math.min(right, mb.w * 0.36) } });
    const zoom = Math.max(o.min || 17.6, Math.min(o.max || 18.6, cam ? cam.zoom : 18));
    M().easeTo({ center: cam ? cam.center : pts[0], zoom, bearing: 0, pitch: FT.map.base === '3d' ? 58 : 0, offset: cam ? [0, 0] : [0, 0], duration: o.now ? 0 : 500 });
    TR.cam = { pts, o }; panned = '';
  };

  // ------------------------------------------------------- the gate: during a step only the lit things answer
  const matches = (t, sel) => { const s = val(sel); if (!s || !t.closest) return false; return [].concat(s).filter(Boolean).some(q => { try { return !!t.closest(q); } catch (e) { return false; } }); };
  function mouseOk(e) {
    const t = e.target; if (!t.closest) return true;
    if (t.closest('#trCard')) return true;
    if (TR.menu) return !!t.closest('#modal');
    const st = step(); if (!st) return true;
    if (TR.busy) return false;
    if (matches(t, st.allow)) return true;
    if (t.closest('#map')) {
      if (t.closest('.maplibregl-ctrl')) return st.map === 'free';
      if (!t.closest('.maplibregl-canvas-container')) return false;
      if (st.map === 'free') return true;
      const mb = mapBox(), R = st.r || 22;
      return openTargets(st).some(q => { const p = screen(q, mb); return Math.hypot(p.x - e.clientX, p.y - e.clientY) <= R; });
    }
    return false;
  }
  let lastNudge = 0;
  function nudge() { if (Date.now() - lastNudge < 500) return; lastNudge = Date.now(); [marks, card].forEach(x => { x.classList.remove('shake'); void x.offsetWidth; x.classList.add('shake'); }); }
  const PASS_KEYS = /^(F5|F11|F12|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|MetaLeft|MetaRight|CapsLock)$/;
  function installGate() {
    ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'auxclick'].forEach(type => G.addEventListener(type, e => {
      if (!TR.active || TR.finished || !e.isTrusted) return;
      if (!mouseOk(e)) { e.preventDefault(); e.stopImmediatePropagation(); if (type === 'mousedown' || type === 'contextmenu') nudge(); return; }
      const st = step(); if (type === 'click' && st && st.press && matches(e.target, st.press)) TR.pressed = true;
    }, true));
    G.addEventListener('keydown', e => {
      if (!TR.active || TR.finished || !e.isTrusted || PASS_KEYS.test(e.code)) return;
      if ((e.ctrlKey || e.metaKey) && /^(KeyR|Minus|Equal|Digit0|NumpadAdd|NumpadSubtract)$/.test(e.code)) return;
      if (TR.menu) { if (e.code === 'Escape') return; e.preventDefault(); e.stopImmediatePropagation(); return; }
      const st = step(); if (!st) return; const t = e.target, typing = t && /INPUT|TEXTAREA/.test(t.tagName);
      if (typing && (matches(t, st.allow) || t.closest('#trCard')) && e.code !== 'Escape' && !TR.busy) return;
      const k = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + e.code.replace('NumpadEnter', 'Enter');
      if (!TR.busy && (val(st.keys) || []).includes(k)) return;
      e.preventDefault(); e.stopImmediatePropagation(); nudge();
    }, true);
  }

  // ======================================================= the card
  const total = () => TR.lessons.reduce((a, l) => a + l.steps.length, 0);
  const before = () => TR.lessons.slice(0, TR.L).reduce((a, l) => a + l.steps.length, 0) + TR.s;
  function drawCard() {
    if (TR.finished) return drawFinish();
    const l = lesson(), st = step(); if (!l || !st) return;
    const list = targets(st), n = list.length, done = st.any ? list.filter((q, i) => st.isDone && st.isDone(i)).length : Math.min(n, at(st));
    card.dir = ar() ? 'rtl' : 'ltr';
    card.innerHTML = '<div class="tr-top"><span class="tr-tag">🎓 ' + tx('تدريب', 'Training') + '</span><span class="tr-count">' + tx('أداة ' + (TR.L + 1) + ' من ' + TR.lessons.length, 'Tool ' + (TR.L + 1) + ' of ' + TR.lessons.length) + '</span><button type="button" class="tr-mini" data-do="lang">' + (ar() ? 'EN' : 'عربي') + '</button><button type="button" class="tr-mini" data-do="exit" title="' + tx('خروج', 'Exit') + '">✕</button></div>' +
      '<div class="tr-bar"><i style="width:' + (before() / total() * 100).toFixed(1) + '%"></i></div>' +
      '<h3><i>' + l.icon + '</i>' + say(l.title) + '</h3>' +
      '<div class="tr-steps">' + l.steps.map((x, i) => '<b class="' + (i < TR.s ? 'done' : i === TR.s ? 'cur' : '') + '"></b>').join('') + '</div>' +
      '<div class="tr-text">' + say(st.text) + '</div>' +
      (n > 1 ? '<div class="tr-prog">' + tx('تم ', 'Done ') + '<b>' + done + '</b> / ' + n + '</div>' : '') +
      '<div class="tr-act">' + (st.next ? '<button type="button" class="tr-btn pri" data-do="next">' + say(st.nextLabel || ['التالي ←', 'Next →']) + '</button>' : '<span class="tr-wait">' + tx('بانتظارك…', 'Your turn…') + '</span>') + '<button type="button" class="tr-btn" data-do="skip">⏭ ' + tx('تخطي هالأداة', 'Skip this tool') + '</button></div>' +
      '<div class="tr-sub"><button type="button" data-do="menu">☰ ' + tx('الدروس', 'Lessons') + '</button><button type="button" data-do="again">↺ ' + tx('عيد هالأداة', 'Redo tool') + '</button><button type="button" data-do="view">⌖ ' + tx('رجّع المنظر', 'Reset view') + '</button></div><div class="tr-flash"></div>';
    lastCardAt = 0; ring = null;
  }
  function wireCard() {
    card.addEventListener('click', e => {
      const b = e.target.closest('[data-do]'); if (!b) return; const d = b.dataset.do;
      if (d === 'exit') return TR.exit();
      if (d === 'lang') { FT.setLang(ar() ? 'en' : 'ar'); U().applyLang(); U().buildTabs('gpon'); U().buildToolbar(); TR.relang(); return; }
      if (TR.busy) return;
      if (d === 'restart') return TR.jump(0);
      if (d === 'menu') return TR.openMenu('lessons');
      if (d === 'next') return succeed(true);
      if (d === 'skip') return TR.skip();
      if (d === 'again') return TR.jump(TR.L, true);
      if (d === 'view') { if (TR.cam) TR.camera(TR.cam.pts, TR.cam.o); }
    });
  }
  TR.relang = function () {
    const m = M(); FT.roads._lines = W().streets(); if (m.getSource('tr-road')) { m.getSource('tr-road').setData(roadData()); m.getSource('tr-lot').setData(lotData()); }
    const t = $('#trChip'); if (t) t.textContent = tx('وضع التدريب', 'Training mode');
    lastSig = ''; drawCard();
  };

  // ======================================================= moving through the steps
  function ensureLayout() { // the panels the lessons point at must be there
    const l = $('#left'); if (l.style.display === 'none') U().toggleLeft(); if ($('#right').classList.contains('hide')) U().toggleRight();
  }
  function cleanup() {
    U().closeCtx(); const m2 = $('#modal2'); if (m2.classList.contains('on')) { const no = m2.querySelector('#askNo, #cfNo'); if (no) no.click(); m2.classList.remove('on'); m2.innerHTML = ''; }
    if ($('#modal').classList.contains('on')) U().closeModal();
    if (T().movePick) T().endHouseMove(); T().draw = null; FT.map.setDraw([]); if (T().tool !== 'select') T().setTool('select'); T().shapeCB = null; T().select(null); FT.map.setDone(null); U().hint(''); U().meter(null); ghost([]);
  }
  const snapshot = () => ({ state: JSON.stringify(FT.state), vars: JSON.parse(JSON.stringify(TR.vars)), opt: JSON.parse(JSON.stringify(U().opt)), num: { mode: T().num.mode, prefix: T().num.prefix }, hidden: [...T().hidden], mode: U().mode() });
  function restore(sn) {
    cleanup(); ensureLayout(); FT.setState(JSON.parse(sn.state)); TR.vars = JSON.parse(JSON.stringify(sn.vars || {}));
    const o = U().opt; Object.assign(o, JSON.parse(JSON.stringify(sn.opt || {}))); Object.assign(T().num, sn.num || {}); T().num.from = 0;
    T().hidden = new Set(sn.hidden || []); T().locked = new Set(); resetView();
    FT.roads.dirty = true; FT.map.renderNet(); U().applyHidden(); U().refreshTree(); U().renderPanel();
  }
  function resetView() { // whatever a lesson switched on the map goes back to normal
    if (FT.map.base && FT.map.base !== 'map') FT.map.setBase('map'); if (FT.map.netHidden) FT.map.setNetHidden(false); if (FT.map.hideHouses) FT.map.setHousesHidden(false); if (FT.map.hideBld) FT.map.setBldHidden(false);
    if (U().mode() !== 'infra') { const b = $('#modeTabs button[data-mode=infra]'); if (b) b.click(); }
    const q = $('#lsearch'); if (q && q.value) { q.value = ''; q.oninput({ target: q }); }
    const chip = $('#chips .chip[data-c=all]'); if (chip && !chip.classList.contains('on')) chip.click();
    U().applyLang();
  }
  function startLesson() {
    TR.s = 0; cleanup(); ensureLayout(); const l = lesson(); if (!l) return finish();
    if (l.begin) l.begin();
    TR.snaps[TR.L] = snapshot(); G.FT_TRAIN_STORE.set({ L: TR.L, snap: TR.snaps[TR.L] });
    if (l.cam) TR.camera(val(l.cam), l.camOpt);
    enter();
  }
  function enter() {
    const st = step(); if (!st) return;
    TR.pressed = false; panned = ''; lastSig = ''; TR.enteredAt = Date.now();
    if (st.enter) st.enter();
    if (st.cam) TR.camera(val(st.cam), st.camOpt);
    ghost(val(st.ghost)); M().getSource('tr-lot').setData(lotData());
    drawCard();
    setTimeout(() => { const first = val(st.allow); const el = first && els(first)[0]; if (el && el.closest('#tree, .db, #rbody')) el.scrollIntoView({ block: 'nearest' }); }, 120);
  }
  let progressSig = '';
  function tick() {
    if (!TR.active || TR.finished || TR.busy || TR.menu) return;
    const st = step(); if (!st) return;
    if (st.each) st.each();
    // keep the counter and the drawing guide up to date
    const sig = TR.L + ':' + TR.s + ':' + at(st) + ':' + (st.any ? targets(st).filter((q, i) => st.isDone && st.isDone(i)).length : '');
    if (sig !== progressSig) { progressSig = sig; const p = card.querySelector('.tr-prog b'); if (p) { const list = targets(st); p.textContent = st.any ? list.filter((q, i) => st.isDone(i)).length : Math.min(list.length, at(st)); } ghost(val(st.ghost)); M().getSource('tr-lot').setData(lotData()); lastCardAt = 0; }
    if (!st.next && st.done && Date.now() - TR.enteredAt > 250 && st.done()) succeed(false);
  }
  async function succeed(silent) {
    if (TR.busy) return; TR.busy = true; const st = step(), L = TR.L, s = TR.s;
    if (!silent) { const f = card.querySelector('.tr-flash'); if (f) { f.textContent = '✓ ' + tx('تمام', 'Well done'); f.classList.add('on'); } }
    if (st.after) st.after();
    await sleep(silent ? 60 : 750);
    TR.busy = false; if (L !== TR.L || s !== TR.s) return;
    advance();
  }
  function advance() {
    TR.s++;
    if (TR.s >= lesson().steps.length) { endLesson(); return; }
    enter();
  }
  function endLesson() { const l = lesson(); if (l.end) l.end(); TR.L++; if (TR.L >= TR.lessons.length) return finish(); startLesson(); }
  // perform what is left of this tool, then go to the next one
  async function runRest() {
    const l = lesson();
    for (; TR.s < l.steps.length; TR.s++) {
      const st = l.steps[TR.s];
      if (st.enter && TR.enteredStep !== TR.L + ':' + TR.s) st.enter();
      if (st.auto && !(st.done && !st.next && st.done())) { T().draw = null; FT.map.setDraw([]); await st.auto(); await sleep(30); }
      if (st.after) st.after();
    }
    TR.s = l.steps.length - 1;
  }
  TR.skip = async function () {
    if (TR.busy || TR.finished) return; TR.busy = true;
    TR.enteredStep = TR.L + ':' + TR.s;
    try { await runRest(); } catch (e) { console.error('training skip', e); TR.error = String(e && e.stack || e); }
    TR.busy = false; endLesson();
  };
  TR.jump = async function (to, again) {
    if (TR.busy) return; to = Math.max(0, Math.min(TR.lessons.length - 1, to));
    TR.finished = false;
    if (to <= TR.L) {
      let from = to; while (from > 0 && !TR.snaps[from]) from--;
      if (TR.snaps[from]) { TR.busy = true; restore(TR.snaps[from]); TR.L = from; TR.busy = false; startLesson(); }
      else if (again) { startLesson(); return; }
    }
    while (TR.L < to && !TR.finished) { const was = TR.L; await TR.skip(); if (TR.L === was) break; await sleep(40); }
  };
  function finish() { cleanup(); resetView(); TR.finished = true; G.FT_TRAIN_STORE.set({ L: 0, done: true }); dim.style.display = marks.style.display = 'none'; drawFinish();
    const bb = FT.bboxOf(W().areaAll), mw = mapBox().w; M().fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: { top: 60, bottom: 60, left: Math.min(430, mw * 0.38), right: Math.min(355, mw * 0.3) }, maxZoom: 18, duration: 700 }); } // the whole network beside the card
  function drawFinish() {
    const S = FT.state, n = o => Object.keys(o || {}).length, len = Object.values(S.cables).reduce((a, c) => a + FT.cableLength(c), 0);
    card.dir = ar() ? 'rtl' : 'ltr'; card.classList.add('end');
    card.innerHTML = '<div class="tr-top"><span class="tr-tag">🎓 ' + tx('خلص التدريب', 'Training complete') + '</span><span class="tr-count"></span><button type="button" class="tr-mini" data-do="lang">' + (ar() ? 'EN' : 'عربي') + '</button></div><div class="tr-bar"><i style="width:100%"></i></div><h3><i>🏆</i>' + tx('مبروك، بنيت شبكة كاملة', 'Well done, you built a whole network') + '</h3><div class="tr-stats">' +
      [[Object.values(S.bld).filter(b => !b.deleted && b.num).length, tx('بيت مرقّم', 'numbered houses')], [n(S.nodes), tx('عقدة وعلبة', 'nodes and boxes')], [n(S.pipes), tx('أنبوب', 'ducts')], [n(S.cables), tx('كبل', 'cables')], [Math.round(len), tx('متر كبلات', 'metres of cable')], [n(S.subs), tx('مشترك', 'subscribers')]].map(([v, t]) => '<div><b>' + v + '</b><span>' + t + '</span></div>').join('') +
      '</div><div class="tr-text">' + tx('هلأ المشروع التدريبي كله إلك: جرّب فيه اللي بدك بحرية. ولما تطلع بترجع على مشاريعك متل ما تركتها.', 'The training project is yours now: try anything. When you leave, your own projects are exactly as you left them.') + '</div><div class="tr-act"><button type="button" class="tr-btn pri" data-do="exit">' + tx('ارجع لمشاريعي', 'Back to my projects') + '</button><button type="button" class="tr-btn" data-do="restart">↺ ' + tx('عيد التدريب', 'Start again') + '</button></div><div class="tr-sub"><button type="button" data-do="menu">☰ ' + tx('الدروس', 'Lessons') + '</button></div>';
    card.style.left = (mapBox().x + 12) + 'px'; card.style.top = Math.max(60, innerHeight - card.offsetHeight - 50) + 'px';
  }

  // ======================================================= start
  TR.start = async function () {
    document.body.classList.add('training'); document.body.classList.remove('nop');
    TR.lessons = FT.trainLessons();
    buildWorld();
    FT.setState(W().state()); FT.store.cur = { id: 'Ltraining', key: 'local', name: FT.state.meta.name, type: 'gpon' }; FT.store.mode = 'edit';
    U().afterProject();
    dim = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); dim.id = 'trDim'; marks = document.createElement('div'); marks.id = 'trMarks'; card = document.createElement('div'); card.id = 'trCard';
    document.body.append(dim, marks, card);
    const chip = document.createElement('span'); chip.id = 'trChip'; chip.textContent = tx('وضع التدريب', 'Training mode'); const pn = $('#projName'); pn.parentNode.insertBefore(chip, pn.nextSibling);
    wireCard(); installGate();
    M().jumpTo({ center: W().ll(-10, 20), zoom: 17.6 }); M().resize();
    await sleep(350);
    const onceDownload = (obj, name, flag) => { if (!obj || !obj[name]) return; const f = obj[name]; obj[name] = async function () { const r = await f.apply(this, arguments); TR.vars[flag] = true; return r; }; };
    onceDownload(FT.rep, 'download', 'report'); onceDownload(FT.kmzPro, 'download', 'kmz');
    const route = T().route; T().route = function (a, b) { const r = route.apply(this, arguments); if (r && T().tool === 'route') TR.vars.routed = [a, b]; return r; };
    TR.active = true; setInterval(tick, 160); requestAnimationFrame(paint);
    const q = new URLSearchParams(location.search), sv = saved();
    TR.L = 0;
    if (q.get('resume') && sv && sv.snap && sv.L < TR.lessons.length) { restore(sv.snap); TR.L = sv.L; startLesson(); }
    else { startLesson(); const to = parseInt(q.get('lesson'), 10); if (to > 0) { await sleep(500); await TR.jump(to); } }
    TR.ready = true;
  };
})(window);
