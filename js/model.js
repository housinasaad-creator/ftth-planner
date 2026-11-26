/* Data model, catalogues, geometry helpers, undo. Pure JS, no DOM. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};

  // ---------------- catalogues (industry-standard values) ----------------
  // Names follow the Syrian Telecom (ST) FTTH micro-trenching specification. Internal keys stay sk/dk/bk (old projects keep working).
  FT.NODE_TYPES = {
    olt:  { key: 'olt',  short: 'OLT',  color: '#2bd18b', prefix: 'OLT',  en: 'OLT / Central office (CO)', ar: 'OLT / مقسم مركزي (CO)' },
    sk:   { key: 'sk',   short: 'FDC',  color: '#ff8a3d', prefix: 'FDC',  en: 'FDC — Fibre distribution cabinet (stage 1)', ar: 'FDC — خزانة التوزيع الضوئية (المرحلة 1)' },
    dk:   { key: 'dk',   short: 'iFDC', color: '#ffc233', prefix: 'iFDC', en: 'iFDC — Intermediate cabinet (optional)', ar: 'iFDC — خزانة وسيطة (اختيارية)' },
    bk:   { key: 'bk',   short: 'FDB',  color: '#ff4f7a', prefix: 'FDB',  en: 'FDB — Fibre distribution box (one per building, stage 2)', ar: 'FDB — علبة التوزيع الضوئية (لكل مبنى، المرحلة 2)' },
    mh:   { key: 'mh',   short: 'MH',   color: '#9aa1b6', prefix: 'MH',   en: 'MH — Main manhole', ar: 'MH — منهل رئيسي' },
    hh:   { key: 'hh',   short: 'HH',   color: '#cfd6ea', prefix: 'HH',   en: 'HH — Handhole (max 60×60×60 cm)', ar: 'HH — غرفة تفتيش صغيرة (60×60×60 سم كحد أقصى)' },
    pole: { key: 'pole', short: 'WA',   color: '#c9a37a', prefix: 'WA',   en: 'WA — Wall anchor (aerial only on walls, ST approval)', ar: 'WA — تعليق جداري (الهوائي على الجدران فقط وبموافقة ST)' },
  };
  FT.nodeTypeName = t => { const x = FT.NODE_TYPES[t]; return x ? (FT.lang === 'ar' ? x.ar : x.en) : t; };
  FT.BOX_TYPES = ['sk', 'dk', 'bk']; // nodes that hold a splitter / are cabinets
  FT.PLACEMENTS = ['buried', 'aerial', 'wall', 'building'];
  FT.RATIOS = ['', '1:2', '1:4', '1:8', '1:16']; // 1:32 is not allowed by the ST specification (total split <= 1:16)
  FT.SPLITTER_LOSS = { '1:2': 4.0, '1:4': 7.3, '1:8': 10.7, '1:16': 14.0, '1:32': 17.5 }; // dB, MAXIMUM insertion loss from the ST specification (1:32 only for old projects)
  FT.LIMITS = { maxSplit: 16, maxStages: 2, maxLoss: 28, maxSpan: 250, trenchDepth: 30, trenchWidth: 6, minCover: 10, fillMax: 70, microWays: 12, hhSize: 60 };
  // TIA-598-C 12-colour code
  FT.FIBER_COLORS = [
    { n: 1, code: 'BL', hex: '#2f6bff', en: 'Blue', ar: 'أزرق' }, { n: 2, code: 'OR', hex: '#ff8a1f', en: 'Orange', ar: 'برتقالي' },
    { n: 3, code: 'GR', hex: '#1fb25a', en: 'Green', ar: 'أخضر' }, { n: 4, code: 'BR', hex: '#8a5a2b', en: 'Brown', ar: 'بني' },
    { n: 5, code: 'SL', hex: '#8793a6', en: 'Slate', ar: 'رمادي' }, { n: 6, code: 'WH', hex: '#f4f6fb', en: 'White', ar: 'أبيض' },
    { n: 7, code: 'RD', hex: '#e5384f', en: 'Red', ar: 'أحمر' }, { n: 8, code: 'BK', hex: '#15181f', en: 'Black', ar: 'أسود' },
    { n: 9, code: 'YL', hex: '#ffd21f', en: 'Yellow', ar: 'أصفر' }, { n: 10, code: 'VI', hex: '#8f3bff', en: 'Violet', ar: 'بنفسجي' },
    { n: 11, code: 'RS', hex: '#ffb0c8', en: 'Rose', ar: 'وردي' }, { n: 12, code: 'AQ', hex: '#19d3e6', en: 'Aqua', ar: 'سماوي' },
  ];
  FT.fiberLabel = (tube, core) => { const c = FT.FIBER_COLORS[(core - 1) % 12]; return 'T' + tube + ' C' + core + ' (' + c.code + ')'; };
  FT.CABLE_CAT = [
    { id: 'bb96',  group: 'Feeder', name: 'Feeder 96C (8×12) loose-tube G.652.D',  core: 96,  tubes: 8,  std: 'G.652.D', struct: 'loose_tube', od: 11 },
    { id: 'bb144', group: 'Feeder', name: 'Feeder 144C (12×12) loose-tube G.652.D', core: 144, tubes: 12, std: 'G.652.D', struct: 'loose_tube', od: 12.5 },
    { id: 'bb288', group: 'Feeder', name: 'Feeder 288C (24×12) loose-tube G.652.D', core: 288, tubes: 24, std: 'G.652.D', struct: 'loose_tube', od: 15.5 },
    { id: 'bb432', group: 'Feeder', name: 'Feeder 432C (36×12) loose-tube G.652.D', core: 432, tubes: 36, std: 'G.652.D', struct: 'loose_tube', od: 18 },
    { id: 'bb576', group: 'Feeder', name: 'Feeder 576C (48×12) loose-tube G.652.D', core: 576, tubes: 48, std: 'G.652.D', struct: 'loose_tube', od: 20 },
    { id: 'bb864', group: 'Feeder', name: 'Feeder 864C (72×12) loose-tube G.652.D', core: 864, tubes: 72, std: 'G.652.D', struct: 'loose_tube', od: 23 },
    { id: 'mf4',   group: 'Distribution', name: 'Distribution micro cable 4F G.652.D (air-blown)', core: 4, tubes: 1, std: 'G.652.D', struct: 'loose_tube', od: 4 },
    { id: 'ds24',  group: 'Distribution', name: 'Distribution 24C (2×12) loose-tube G.652.D', core: 24, tubes: 2, std: 'G.652.D', struct: 'loose_tube', od: 6.5 },
    { id: 'ds48',  group: 'Distribution', name: 'Distribution 48C (4×12) loose-tube G.652.D', core: 48, tubes: 4, std: 'G.652.D', struct: 'loose_tube', od: 8 },
    { id: 'ds96',  group: 'Distribution', name: 'Distribution 96C (8×12) loose-tube G.652.D', core: 96, tubes: 8, std: 'G.652.D', struct: 'loose_tube', od: 10 },
    { id: 'dr12',  group: 'Drop', name: 'Drop 12C (1×12) G.657.A2', core: 12, tubes: 1, std: 'G.657.A2', struct: 'drop', od: 6.5 },
    { id: 'dr1',   group: 'Drop', name: 'Drop 1C G.657.A2', core: 1, tubes: 1, std: 'G.657.A2', struct: 'drop', od: 3 },
    { id: 'dr2',   group: 'Drop', name: 'Drop 2C G.657.A2', core: 2, tubes: 1, std: 'G.657.A2', struct: 'drop', od: 4 },
    { id: 'dr4',   group: 'Drop', name: 'Drop 4C G.657.A2', core: 4, tubes: 1, std: 'G.657.A2', struct: 'drop', od: 5 },
  ];
  FT.CABLE_STD = ['G.652.D', 'G.657.A1', 'G.657.A2', 'G.657.B3'];
  FT.CABLE_STRUCT = ['loose_tube', 'ribbon', 'figure8', 'adss', 'drop'];
  FT.PIPE_CAT = [
    { id: 'h32', name: 'HDPE Ø32/26', type: 'hdpe', idmm: 26 },
    { id: 'h40', name: 'HDPE Ø40/33 (main buried duct)', type: 'hdpe', short: 'HDPE Ø40/33', idmm: 33 },
    { id: 'h50', name: 'HDPE Ø50/41', type: 'hdpe', idmm: 41 },
    { id: 'aer', name: 'Aerial on walls (ST approval)', type: 'aerial' },
    { id: 'mc12', name: 'Microduct bundle 12 ways Ø12/10 (max 12, +1 spare)', type: 'microduct', ways: 12, idmm: 10 },
    { id: 'mc7', name: 'Microduct bundle 7 ways Ø14/12', type: 'microduct', ways: 7, idmm: 12 },
    { id: 'md2', name: 'Micro duct to one building: 2 ways Ø12/10 (1 + 1 spare)', type: 'microduct', ways: 2, idmm: 10 },
  ];
  FT.PIPE_TYPES = ['hdpe', 'microduct', 'aerial', 'custom'];
  FT.NODE_CAT = [
    { id: 'c_bk', name: 'FDB IP65 (building box, SC/APC)', type: 'bk' }, { id: 'c_dk', name: 'iFDC (intermediate cabinet)', type: 'dk' },
    { id: 'c_sk', name: 'FDC IP65 (cabinet, stage-1 splitter)', type: 'sk' }, { id: 'c_odp', name: 'FDB 16 core', type: 'bk' },
    { id: 'c_mh', name: 'MH main manhole', type: 'mh' }, { id: 'c_fm', name: 'HH handhole 60×60×60 cm', type: 'hh' },
    { id: 'c_e144', name: 'Splice closure IP68 144F', type: 'mh' }, { id: 'c_e24', name: 'Splice closure IP68 24F', type: 'mh' },
    { id: 'c_e48', name: 'Splice closure IP68 48F', type: 'mh' }, { id: 'c_e96', name: 'Splice closure IP68 96F', type: 'mh' },
  ];
  FT.CASSETTES = ['', 'IP68 24F', 'IP68 48F', 'IP68 96F', 'custom'];
  FT.BASE_LOSS = { fiber1490: 0.30, fiber1310: 0.40, connector: 0.5, splice: 0.1, txDbm: 3, rxSens: -27 }; // ST maximums: 0.40 dB/km @1310, 0.30 @1550; SC/APC <= 0.5 dB

  // ---------------- geometry ----------------
  const R = 6371008.8, rad = Math.PI / 180;
  FT.dist = (a, b) => { // haversine metres, a/b = [lon,lat]
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad, la = a[1] * rad, lb = b[1] * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  FT.pathLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += FT.dist(pts[i - 1], pts[i]); return s; };
  FT.lt = s => '⁦' + s + '⁩'; // LTR isolate: keeps numbers+units intact inside Arabic text
  FT.fmtLen = m => { const cm = Math.round(m * 100); return FT.lt(Math.floor(cm / 100) + ' m ' + (cm % 100) + ' cm'); };
  FT.fmtLenShort = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : m.toFixed(1) + ' m';
  FT.pointInRing = (p, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  FT.ringArea = ring => { // m² (planar approx at ring centroid latitude)
    if (ring.length < 3) return 0; const la = ring[0][1] * rad, kx = R * rad * Math.cos(la), ky = R * rad; let s = 0;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; s += (a[0] * kx) * (b[1] * ky) - (b[0] * kx) * (a[1] * ky); }
    return Math.abs(s) / 2;
  };
  FT.centroid = ring => { let x = 0, y = 0; ring.forEach(p => { x += p[0]; y += p[1]; }); return [x / ring.length, y / ring.length]; };
  FT.bboxOf = pts => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; pts.forEach(p => { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }); return [a, b, c, d]; };
  // nearest point on segment (in lon/lat with local scaling)
  FT.nearestOnPath = (p, pts) => {
    const kx = Math.cos(p[1] * rad); let best = { d: 1e18, i: 0, t: 0, pt: pts[0] };
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
      const dx = (bx - ax) * kx, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? (((p[0] - ax) * kx) * dx + (p[1] - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const q = [ax + (bx - ax) * t, ay + (by - ay) * t], d = FT.dist(p, q);
      if (d < best.d) best = { d, i, t, pt: q };
    }
    return best;
  };

  // ---------------- state ----------------
  FT.blank = () => ({ v: 3, meta: { name: '', created: Date.now() }, nodes: {}, pipes: {}, cables: {}, splices: {}, bld: {}, subs: {}, wdev: {}, wlinks: {}, imports: {}, users: {}, ord: {}, seq: { olt: 0, sk: 0, dk: 0, bk: 0, mh: 0, hh: 0, pole: 0, pipe: 0, cable: 0, splice: 0, sub: 0, design: 0, wdev: 0, wlink: 0 }, folders: {}, ui: { ratio: { sk: '', dk: '', bk: '' } } });
  FT.state = FT.blank();
  FT.listeners = [];
  FT.onChange = fn => FT.listeners.push(fn);
  let undo = [], redo = [], batchDepth = 0;
  const snap = () => JSON.stringify(FT.state);
  const entry = () => ({ s: snap(), skip: new Set() }); // skip = items a teammate changed after this point: undo must leave them alone
  FT.commit = function (reason) { // call BEFORE mutating
    undo.push(entry()); if (undo.length > 80) undo.shift(); redo = [];
  };
  const UNDO_COLLS = ['nodes', 'pipes', 'cables', 'splices', 'bld', 'subs', 'wdev', 'wlinks', 'imports', 'folders', 'fmap'];
  function restore(e) {
    const old = JSON.parse(e.s); if (!FT.team) { FT.state = old; return; }
    // team project: put back only what I changed, item by item (never the teammates' work, never the shared number counters)
    const S = FT.state;
    UNDO_COLLS.forEach(c => { const a = S[c] = S[c] || {}, b = old[c] || {}; new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => { if (e.skip.has(c + '/' + k)) return; if (!(k in b)) delete a[k]; else if (!(k in a) || JSON.stringify(a[k]) !== JSON.stringify(b[k])) a[k] = b[k]; }); });
    S.ord = S.ord || {}; new Set(Object.keys(S.ord).concat(Object.keys(old.ord || {}))).forEach(k => { if (e.skip.has('ord/' + k)) return; if (old.ord && old.ord[k]) S.ord[k] = old.ord[k]; else delete S.ord[k]; });
  }
  FT.noteRemote = keys => { undo.concat(redo).forEach(e => keys.forEach(k => e.skip.add(k))); };
  FT.changed = function (why) { FT.dropPipeIndex && FT.dropPipeIndex(); FT.listeners.forEach(fn => { try { fn(why); } catch (e) { console.error(e); } }); };
  FT.undo = function () { if (!undo.length) return false; const e = undo.pop(); redo.push(entry()); restore(e); FT.changed('undo'); return true; };
  FT.redo = function () { if (!redo.length) return false; const e = redo.pop(); undo.push(entry()); restore(e); FT.changed('redo'); return true; };
  FT.canUndo = () => undo.length > 0; FT.canRedo = () => redo.length > 0;
  FT.clearHistory = () => { undo = []; redo = []; };
  FT.setState = function (s) { FT.state = Object.assign(FT.blank(), s); FT.state.seq = Object.assign(FT.blank().seq, s.seq || {}); FT.migrate(FT.state); FT.clearHistory(); FT.changed('load'); };
  // old projects: SK/DK/BK/Backbone names -> the official ST names (types and ids are unchanged)
  FT.migrate = function (S) {
    S.ord = S.ord || {};
    Object.values(S.nodes || {}).forEach(n => { n.name = String(n.name || '').replace(/^SK-/, 'FDC-').replace(/^DK-/, 'iFDC-').replace(/^BK-/, 'FDB-').replace(/^D-(\d+)$/, 'WA-$1'); if (n.type === 'pole' && n.place === 'aerial') n.place = 'wall'; });
    Object.values(S.cables || {}).forEach(c => { c.name = String(c.name || '').replace(/^Backbone /, 'Feeder '); });
    Object.values(S.pipes || {}).forEach(p => { if (p.depth == null) p.depth = 30; if (p.width == null) p.width = 6; if (p.cover == null) p.cover = 24; });
    return S;
  };
  // layer order (kept as explicit arrays: the cloud database does not keep object-key order)
  FT.ordered = function (coll) {
    const o = FT.state[coll] || {}, ord = (FT.state.ord && FT.state.ord[coll]) || [], seen = new Set(), out = [];
    ord.forEach(id => { if (o[id] && !seen.has(id)) { seen.add(id); out.push(o[id]); } });
    Object.keys(o).forEach(id => { if (!seen.has(id)) out.push(o[id]); });
    return out;
  };
  FT.reorder = function (coll, dragId, targetId, after) {
    const S = FT.state, ids = FT.ordered(coll).map(x => x.id).filter(i => i !== dragId), ti = ids.indexOf(targetId);
    if (ti < 0 || !(S[coll] || {})[dragId]) return false;
    ids.splice(after ? ti + 1 : ti, 0, dragId); (S.ord = S.ord || {})[coll] = ids; return true;
  };
  FT.zOrder = function (coll) { const l = FT.ordered(coll), n = l.length, z = {}; l.forEach((o, i) => { z[o.id] = n - i; }); return z; }; // first in the list = drawn on top
  FT.uid = p => p + Math.random().toString(36).slice(2, 9);

  // ---------------- object factories ----------------
  FT.addNode = function (type, ll, extra) {
    const S = FT.state, t = FT.NODE_TYPES[type]; S.seq[type] = (S.seq[type] || 0) + 1;
    const n = Object.assign({ id: FT.uid('n'), type, ll, name: t.prefix + '-' + S.seq[type], label: '', ratio: type === 'sk' || type === 'dk' || type === 'bk' ? (S.ui.ratio[type] || '') : '', place: type === 'pole' ? 'wall' : 'buried', code: '', cores: 24, note: '', color: '', cat: '', cassette: '', size: '', dir: 0 }, extra || {});
    S.nodes[n.id] = n; return n;
  };
  FT.addPipe = function (pts, a, b, ptype, cat) {
    const S = FT.state; S.seq.pipe++;
    const p = { id: FT.uid('p'), name: 'Pipe #' + S.seq.pipe, no: S.seq.pipe, ptype: ptype || 'hdpe', cat: cat || 'h40', pts, a, b, note: '', color: '', depth: 30, width: 6, cover: 24 };
    S.pipes[p.id] = p; pipeIdx = null; return p;
  };
  FT.addCable = function (pts, a, b, cat, medium, nodeIds, segs) {
    const S = FT.state, c0 = FT.CABLE_CAT.find(x => x.id === cat) || FT.CABLE_CAT[1]; S.seq.cable++;
    const c = { id: FT.uid('c'), name: '', cat: c0.id, std: c0.std, struct: c0.struct, tubes: c0.tubes, cpt: c0.core / c0.tubes, core: c0.core, pts, a, b, nodes: nodeIds || [a, b], segs: segs || null, medium: medium || 'free', note: '', color: '' };
    c.name = c0.group + ' ' + c0.core + 'C';
    S.cables[c.id] = c; return c;
  };
  FT.nodeById = id => FT.state.nodes[id];
  let pipeIdx = null, pipeIdxFor = null;
  FT.pipeBetween = (a, b) => { // indexed (rebuilt when the pipes object or their number changes; FT.changed also drops it)
    const P = FT.state.pipes;
    if (!pipeIdx || pipeIdxFor !== P) { pipeIdx = {}; Object.values(P).forEach(p => { const k1 = p.a + '|' + p.b, k2 = p.b + '|' + p.a; if (!pipeIdx[k1]) pipeIdx[k1] = p; if (!pipeIdx[k2]) pipeIdx[k2] = p; }); pipeIdxFor = P; }
    const p = pipeIdx[a + '|' + b]; return p && P[p.id] === p && ((p.a === a && p.b === b) || (p.a === b && p.b === a)) ? p : undefined;
  };
  FT.dropPipeIndex = () => { pipeIdx = null; };
  FT.cableSpans = function (c) {
    // consecutive node pairs; span medium = pipe if a pipe joins them else cable.medium
    const out = [], ids = c.nodes || [c.a, c.b];
    for (let i = 1; i < ids.length; i++) {
      const A = FT.state.nodes[ids[i - 1]], B = FT.state.nodes[ids[i]];
      if (!A || !B) continue;
      const own = c.segs && c.segs[i - 1] && c.segs[i - 1].length >= 2 ? c.segs[i - 1] : null;
      // a cable of a shared-trench design follows its own route: another run may join the same two chambers by a different street
      const p = c.shared && own ? null : FT.pipeBetween(ids[i - 1], ids[i]);
      const pts = p ? (p.a === ids[i - 1] ? p.pts : p.pts.slice().reverse()) : (own || [A.ll, B.ll]);
      out.push({ from: ids[i - 1], to: ids[i], medium: p || (c.shared && own) ? 'duct' : c.medium, pipe: p ? p.id : null, len: FT.pathLen(pts), pts });
    }
    return out;
  };
  FT.cableLength = c => FT.cableSpans(c).reduce((s, x) => s + x.len, 0);
  FT.deleteNode = function (id) {
    const S = FT.state, gone = S.nodes[id], chamber = !!gone && !FT.BOX_TYPES.includes(gone.type) && gone.type !== 'olt'; delete S.nodes[id]; pipeIdx = null;
    // shared-trench design: removing a chamber must not wipe the many cables that only pass through it
    Object.values(S.pipes).forEach(p => { if (p.a !== id && p.b !== id) return; if (chamber && p.load) { if (p.a === id) p.a = null; if (p.b === id) p.b = null; } else delete S.pipes[p.id]; });
    Object.values(S.cables).forEach(c => { if (!c.nodes.includes(id)) return; const i = c.nodes.indexOf(id);
      if (chamber && c.shared && c.segs && i > 0 && i < c.nodes.length - 1) { c.segs.splice(i - 1, 2, c.segs[i - 1].concat(c.segs[i].slice(1))); c.nodes.splice(i, 1); } else delete S.cables[c.id]; });
    Object.values(S.splices).forEach(s => { if (s.node === id) delete S.splices[s.id]; });
  };
  FT.deletePipe = id => { delete FT.state.pipes[id]; pipeIdx = null; };
  FT.deleteCable = id => { delete FT.state.cables[id]; Object.values(FT.state.splices).forEach(s => { if (s.inCable === id) s.inCable = ''; if (s.outCable === id) s.outCable = ''; }); };

  // ---------------- material prices (USD) and automatic costing ----------------
  // Defaults are rough market estimates so the first project is not empty; the user edits them to the real supplier prices.
  FT.DEFAULT_PRICES = {
    cable: { bb96: 1.6, bb144: 2.2, bb288: 4.0, bb432: 5.8, bb576: 7.6, bb864: 11.0, mf4: 0.22, ds24: 0.55, ds48: 0.9, ds96: 1.6, dr12: 0.7, dr1: 0.12, dr2: 0.15, dr4: 0.25 },   // USD per metre
    pipe: { h32: 0.45, h40: 0.6, h50: 0.8, aer: 0.35, mc12: 2.4, mc7: 1.8, md2: 0.6 },                                                                                     // USD per metre
    node: { olt: 4500, sk: 450, dk: 140, bk: 38, mh: 120, hh: 45, pole: 85 },                                                                                            // USD each
    splitter: { '1:2': 4, '1:4': 8, '1:8': 14, '1:16': 30, '1:32': 55 },                                                                                         // USD each (inside SK/DK/BK)
    splice: 35,                                                                                                                                                  // USD per splice closure
    wdev: { ap: 220, cpe: 65, ptp: 380 },                                                                                                                        // USD each
    labour: { pipe_m: 0, cable_m: 0 },                                                                                                                           // optional installation USD per metre
  };
  FT.prices = function () { const D = FT.DEFAULT_PRICES, P = FT.state.prices || {}, out = {}; Object.keys(D).forEach(k => { out[k] = (typeof D[k] === 'object') ? Object.assign({}, D[k], P[k] || {}) : (P[k] != null ? P[k] : D[k]); }); return out; };
  FT.hasPrices = () => !!FT.state.prices;
  FT.money = v => FT.lt('$' + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  FT.cost = function (scope) {
    const S = FT.state, P = FT.prices(), inS = (set, id) => !scope || scope[set].has(id), lines = [];
    const add = (kind, name, qty, unit, price) => { if (qty > 0) lines.push({ kind, name, qty, unit, price, total: qty * price }); };
    const cab = {}, pip = {}, nod = {}, spl = {};
    Object.values(S.cables).filter(c => inS('cables', c.id)).forEach(c => { cab[c.cat] = (cab[c.cat] || 0) + FT.cableLength(c); });
    let runM = 0; Object.values(S.pipes).filter(p => inS('pipes', p.id)).forEach(p => { const l = FT.pathLen(p.pts); runM += l; pip[p.cat] = (pip[p.cat] || 0) + l * (p.qty || 1); });
    Object.values(S.nodes).filter(n => inS('nodes', n.id)).forEach(n => { nod[n.type] = (nod[n.type] || 0) + 1; if (n.ratio) spl[n.ratio] = (spl[n.ratio] || 0) + (n.nsplit || 1); });
    Object.keys(cab).forEach(id => { const c = FT.CABLE_CAT.find(x => x.id === id); add('cable', c ? c.name.split(' loose')[0] : id, cab[id], 'm', P.cable[id] || 0); });
    Object.keys(pip).forEach(id => { const c = FT.PIPE_CAT.find(x => x.id === id); add('pipe', c ? c.name : id, pip[id], 'm', P.pipe[id] || 0); });
    const NN = { olt: 'OLT', sk: 'FDC cabinet', dk: 'iFDC cabinet', bk: 'FDB box', mh: 'MH manhole', hh: 'HH handhole', pole: 'WA wall anchor' };
    Object.keys(nod).forEach(t => add('node', NN[t] || t, nod[t], 'pc', P.node[t] || 0));
    Object.keys(spl).forEach(r => add('splitter', 'Splitter ' + r, spl[r], 'pc', P.splitter[r] || 0));
    add('splice', 'Splice closure', Object.values(S.splices).filter(s => inS('nodes', s.node)).length, 'pc', P.splice);
    const wd = {}; Object.values(scope ? {} : (S.wdev || {})).forEach(d => { wd[d.type] = (wd[d.type] || 0) + 1; }); Object.keys(wd).forEach(t => add('wdev', t.toUpperCase() + ' radio', wd[t], 'pc', P.wdev[t] || 0));
    const pm = runM, cm = Object.values(cab).reduce((a, b) => a + b, 0);
    add('labour', 'Pipe installation', pm, 'm', P.labour.pipe_m); add('labour', 'Cable installation', cm, 'm', P.labour.cable_m);
    return { lines, total: lines.reduce((a, l) => a + l.total, 0) };
  };

  // ---------------- reports ----------------
  FT.report = function (scope) { // scope: null=all or {nodes:Set,pipes:Set,cables:Set}
    const S = FT.state, rows = [], inScope = (set, id) => !scope || scope[set].has(id);
    const cab = {}, pip = {}, nod = {};
    Object.values(S.cables).filter(c => inScope('cables', c.id)).forEach(c => { const k = c.name + ' · ' + c.core + 'C ' + c.std; (cab[k] = cab[k] || { n: 0, len: 0 }); cab[k].n++; cab[k].len += FT.cableLength(c); });
    Object.values(S.pipes).filter(p => inScope('pipes', p.id)).forEach(p => { const cat = FT.PIPE_CAT.find(x => x.id === p.cat); const k = cat ? cat.name : p.ptype; (pip[k] = pip[k] || { n: 0, len: 0 }); pip[k].n += p.qty || 1; pip[k].len += FT.pathLen(p.pts) * (p.qty || 1); });
    Object.values(S.nodes).filter(n => inScope('nodes', n.id)).forEach(n => { const k = (FT.NODE_TYPES[n.type] ? FT.NODE_TYPES[n.type].short : n.type.toUpperCase()) + (n.ratio ? ' ' + n.ratio : ''); nod[k] = (nod[k] || 0) + 1; });
    Object.entries(cab).forEach(([k, v]) => rows.push({ kind: 'cable', name: k, qty: v.n, len: v.len }));
    Object.entries(pip).forEach(([k, v]) => rows.push({ kind: 'pipe', name: k, qty: v.n, len: v.len }));
    Object.entries(nod).forEach(([k, v]) => rows.push({ kind: 'node', name: k, qty: v }));
    rows.push({ kind: 'splice', name: 'Splice closure', qty: Object.values(S.splices).filter(s => inScope('nodes', s.node)).length });
    return rows;
  };
})(typeof window !== 'undefined' ? window : globalThis);
