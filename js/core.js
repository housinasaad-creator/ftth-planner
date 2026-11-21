/* FTTH planner — core model: standards, geometry, street graph, derived topology, optical budget, checks, BOM.
   Coordinates are image pixels of the survey mosaic; metres = px * settings.scale. */
(function () {
  'use strict';
  const FT = window.FT = {};
  const S0 = window.SURVEY;

  /* ------------------------------------------------------------------ standards */
  // Fibre / tube colour codes. TIA-598 (IEC 60304 sequence used by most operators) and DIN VDE 0888 (Deutsche Telekom style).
  FT.COLOR_CODES = {
    TIA598: [
      { hex: '#1f6fe0', en: 'Blue', ar: 'أزرق' }, { hex: '#ff8a00', en: 'Orange', ar: 'برتقالي' }, { hex: '#1fa447', en: 'Green', ar: 'أخضر' }, { hex: '#7a4a21', en: 'Brown', ar: 'بني' },
      { hex: '#6b7785', en: 'Slate (grey)', ar: 'رمادي' }, { hex: '#f4f4f4', en: 'White', ar: 'أبيض' }, { hex: '#e02424', en: 'Red', ar: 'أحمر' }, { hex: '#15181d', en: 'Black', ar: 'أسود' },
      { hex: '#f2d600', en: 'Yellow', ar: 'أصفر' }, { hex: '#7e3fb3', en: 'Violet', ar: 'بنفسجي' }, { hex: '#ff7fb0', en: 'Rose (pink)', ar: 'وردي' }, { hex: '#19c4c4', en: 'Aqua (turquoise)', ar: 'تركوازي' }
    ],
    DIN: [
      { hex: '#e02424', en: 'Red', ar: 'أحمر' }, { hex: '#1fa447', en: 'Green', ar: 'أخضر' }, { hex: '#1f6fe0', en: 'Blue', ar: 'أزرق' }, { hex: '#f2d600', en: 'Yellow', ar: 'أصفر' },
      { hex: '#f4f4f4', en: 'White', ar: 'أبيض' }, { hex: '#6b7785', en: 'Grey', ar: 'رمادي' }, { hex: '#7a4a21', en: 'Brown', ar: 'بني' }, { hex: '#7e3fb3', en: 'Violet', ar: 'بنفسجي' },
      { hex: '#19c4c4', en: 'Turquoise', ar: 'تركوازي' }, { hex: '#15181d', en: 'Black', ar: 'أسود' }, { hex: '#ff8a00', en: 'Orange', ar: 'برتقالي' }, { hex: '#ff7fb0', en: 'Pink', ar: 'وردي' }
    ]
  };
  FT.FIBRE_COUNTS = [1, 2, 4, 6, 8, 12, 24, 36, 48, 72, 96, 144, 288];
  FT.CABLE_TYPES = {
    'loose-duct': { ar: 'أنبوب فضفاض (Loose tube) – للقنوات', en: 'Loose tube – duct', fibreType: 'G.652.D', od: 10, install: 'duct' },
    'loose-armored': { ar: 'أنبوب فضفاض مدرّع – دفن مباشر', en: 'Loose tube armoured – direct buried', fibreType: 'G.652.D', od: 13, install: 'direct' },
    'adss': { ar: 'هوائي ADSS (ذاتي الحمل)', en: 'ADSS aerial (self-supporting)', fibreType: 'G.652.D', od: 12, install: 'aerial' },
    'figure8': { ar: 'هوائي رقم 8 (Figure-8)', en: 'Figure-8 aerial', fibreType: 'G.652.D', od: 8, install: 'aerial' },
    'ribbon': { ar: 'كبل شرائط (Ribbon) عالي السعة', en: 'Ribbon cable (high count)', fibreType: 'G.652.D', od: 14, install: 'duct' },
    'micro': { ar: 'مايكرو كبل (نفخ في مايكرو دَكت)', en: 'Micro cable (blown, micro-duct)', fibreType: 'G.657.A1', od: 6, install: 'micro' },
    'drop-flat': { ar: 'كبل Drop مسطح FTTH (G.657.A2)', en: 'FTTH flat drop (G.657.A2)', fibreType: 'G.657.A2', od: 5, install: 'aerial' },
    'drop-round': { ar: 'كبل Drop دائري / واجهات', en: 'Round drop / facade', fibreType: 'G.657.A2', od: 5, install: 'facade' },
    'indoor': { ar: 'كبل داخلي LSZH (Riser)', en: 'Indoor / riser LSZH', fibreType: 'G.657.A2', od: 4, install: 'indoor' }
  };
  FT.INSTALL = ['duct', 'direct', 'aerial', 'facade', 'micro', 'indoor'];
  FT.INSTALL_LABEL = {
    duct: { ar: 'قناة / ماسورة (Duct)', en: 'Duct / conduit' }, direct: { ar: 'دفن مباشر', en: 'Direct buried' }, aerial: { ar: 'هوائي (أعمدة)', en: 'Aerial (poles)' },
    facade: { ar: 'على الجدران / الواجهات', en: 'Facade / wall' }, micro: { ar: 'مايكرو دَكت', en: 'Micro-duct' }, indoor: { ar: 'داخل المبنى', en: 'Indoor' }
  };
  // Typical maximum insertion loss per splitter (dB) — editable in settings.
  FT.SPLITTER_LOSS = { 'none': 0, '1:2': 3.8, '1:4': 7.3, '1:8': 10.7, '1:16': 14.0, '1:32': 17.4, '1:64': 21.0 };
  // PON profiles (typical values — verify with the vendor datasheet).
  FT.PON = {
    'GPON-B+': { name: 'GPON Class B+ (ITU-T G.984)', txMin: 1.5, rxSens: -27, ovl: -8, down: 1490, up: 1310 },
    'GPON-C+': { name: 'GPON Class C+ (ITU-T G.984)', txMin: 3, rxSens: -30, ovl: -12, down: 1490, up: 1310 },
    'XGSPON-N1': { name: 'XGS-PON N1 (ITU-T G.9807.1)', txMin: 2, rxSens: -28, ovl: -9, down: 1577, up: 1270 },
    'EPON-PX20': { name: 'EPON 1000BASE-PX20 (IEEE 802.3ah)', txMin: 2, rxSens: -27, ovl: -6, down: 1490, up: 1310 }
  };
  FT.CONNECTORS = [
    { id: 'SC/APC', hex: '#1fa447', ar: 'أخضر – SC/APC (الأساسي لـ FTTH/GPON)', en: 'Green – SC/APC (standard for FTTH/GPON)' },
    { id: 'SC/UPC', hex: '#1f6fe0', ar: 'أزرق – SC/UPC', en: 'Blue – SC/UPC' },
    { id: 'LC/APC', hex: '#1fa447', ar: 'أخضر – LC/APC', en: 'Green – LC/APC' },
    { id: 'LC/UPC', hex: '#1f6fe0', ar: 'أزرق – LC/UPC', en: 'Blue – LC/UPC' }
  ];
  FT.NODE_TYPES = {
    co: { prefix: 'CO', color: '#ff5d73', props: { olt: 'OLT', ponPorts: 16, conn: 2, splice: 0, split: 'none', slots: 0, ports: 0 } },
    fdh: { prefix: 'FDH', color: '#ffb02e', props: { olt: '', ponPorts: 0, conn: 2, splice: 2, split: '1:4', slots: 8, ports: 0 } },
    fat: { prefix: 'FAT', color: '#2fd4a6', props: { olt: '', ponPorts: 0, conn: 1, splice: 2, split: '1:8', slots: 0, ports: 8 } },
    closure: { prefix: 'SC', color: '#a78bfa', props: { olt: '', ponPorts: 0, conn: 0, splice: 1, split: 'none', slots: 0, ports: 0, trays: 4 } },
    pole: { prefix: 'P', color: '#94a3b8', props: { conn: 0, splice: 0, split: 'none' } },
    handhole: { prefix: 'HH', color: '#7dd3fc', props: { conn: 0, splice: 0, split: 'none' } },
    manhole: { prefix: 'MH', color: '#fca5a5', props: { conn: 0, splice: 0, split: 'none' } }
  };
  FT.STATUS = ['planned', 'approved', 'construction', 'installed', 'active', 'faulty'];
  FT.B_STATUS = ['planned', 'passed', 'survey', 'connected', 'active', 'refused'];
  FT.ZONE_COLORS = ['#3b9cff', '#34d17b', '#ff9f43', '#b57bff', '#27d3d3', '#ff6b9d', '#d7e04a'];

  FT.defaultSettings = function () {
    return {
      scale: S0.scale, slack: 10, maxDrop: 150, snapStreet: true, colorStd: 'TIA598', tubeSize: 12, ponProfile: 'GPON-B+', txOverride: null,
      att1310: 0.35, att1490: 0.30, att1550: 0.25, connLoss: 0.30, spliceLoss: 0.10, margin: 3, ontConn: 1, splitterLoss: Object.assign({}, FT.SPLITTER_LOSS),
      loops: { co: 20, fdh: 10, fat: 5, closure: 10, pole: 0, handhole: 5, manhole: 10, b: 10 },
      prefixes: { co: 'CO', fdh: 'FDH', fat: 'FAT', closure: 'SC', pole: 'P', handhole: 'HH', manhole: 'MH', feeder: 'FC', distribution: 'DC', drop: 'DR' },
      prices: { 'cable:loose-duct': 0.45, 'cable:loose-armored': 0.75, 'cable:adss': 0.40, 'cable:figure8': 0.35, 'cable:ribbon': 1.6, 'cable:micro': 0.30, 'cable:drop-flat': 0.14, 'cable:drop-round': 0.16, 'cable:indoor': 0.12,
        'node:co': 0, 'node:fdh': 650, 'node:fat': 45, 'node:closure': 35, 'node:pole': 60, 'node:handhole': 90, 'node:manhole': 250, 'split:1:2': 6, 'split:1:4': 9, 'split:1:8': 14, 'split:1:16': 24, 'split:1:32': 40, 'split:1:64': 80,
        ont: 35, pigtail: 1.2, splice: 1.5, sleeve: 0.3, patchcord: 2, trench: 6, install: 0.5 },
      geo: { lat: '', lon: '', rot: 0 }
    };
  };
  FT.defaultMeta = function () {
    return { name: 'FTTH – Tadmor demo', area: 'Tadmor (Palmyra)', client: '', designer: '', company: '', date: new Date().toISOString().slice(0, 10), version: '0.1', notes: '' };
  };

  /* ------------------------------------------------------------------ geometry */
  FT.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  FT.polyLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += FT.dist(pts[i - 1], pts[i]); return s; };
  FT.nearOnSeg = function (p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * dx, a[1] + t * dy]; return { pt: q, d: FT.dist(p, q), t };
  };
  FT.nearOnStreets = function (p) {
    let best = null;
    S0.streets.forEach(s => { for (let i = 1; i < s.pts.length; i++) { const r = FT.nearOnSeg(p, s.pts[i - 1], s.pts[i]); if (!best || r.d < best.d) best = { pt: r.pt, d: r.d, street: s.id }; } });
    return best;
  };
  FT.bbox = function () {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    S0.streets.forEach(s => s.pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    S0.buildings.forEach(b => { x0 = Math.min(x0, b[2]); y0 = Math.min(y0, b[3]); x1 = Math.max(x1, b[4]); y1 = Math.max(y1, b[5]); });
    return { x0: x0 - 40, y0: y0 - 40, x1: x1 + 40, y1: y1 + 40 };   // the drawing's extent (+ a small margin): the view is locked to this
  };
  FT.BOUNDS = FT.bbox();

  /* street graph: streets sampled every ~5 px, vertices of different streets closer than 7 px are joined (junctions) */
  FT.graph = (function () {
    const V = [], adj = [];
    S0.streets.forEach(s => {
      let prev = -1;
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1], b = s.pts[i], L = FT.dist(a, b), n = Math.max(1, Math.round(L / 5));
        for (let k = (i === 1 ? 0 : 1); k <= n; k++) {
          const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]; V.push({ p, s: s.id }); adj.push([]);
          const id = V.length - 1; if (prev >= 0) { const d = FT.dist(V[prev].p, p); adj[prev].push([id, d]); adj[id].push([prev, d]); } prev = id;
        }
      }
      prev = -1;
    });
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (V[i].s !== V[j].s) { const d = FT.dist(V[i].p, V[j].p); if (d < 22) { adj[i].push([j, d + 0.1]); adj[j].push([i, d + 0.1]); } }
    return { V, adj };
  })();
  FT.nearestVertex = function (p) { let bi = 0, bd = 1e12; FT.graph.V.forEach((v, i) => { const d = FT.dist(p, v.p); if (d < bd) { bd = d; bi = i; } }); return bi; };
  FT.graphDist = function (src) {
    const { V, adj } = FT.graph, D = new Float64Array(V.length).fill(1e12), done = new Uint8Array(V.length); D[src] = 0; const q = [src];
    while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (D[q[i]] < D[q[bi]]) bi = i; const u = q.splice(bi, 1)[0]; if (done[u]) continue; done[u] = 1; adj[u].forEach(([v, w]) => { if (D[u] + w < D[v]) { D[v] = D[u] + w; q.push(v); } }); }
    return D;
  };
  /* shortest route along streets: returns interior vertices (without the two end points) */
  FT.route = function (p1, p2) {
    const { V, adj } = FT.graph, s = FT.nearestVertex(p1), e = FT.nearestVertex(p2), D = new Float64Array(V.length).fill(1e12), P = new Int32Array(V.length).fill(-1), done = new Uint8Array(V.length);
    D[s] = 0; const q = [s];
    while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (D[q[i]] < D[q[bi]]) bi = i; const u = q.splice(bi, 1)[0]; if (done[u]) continue; done[u] = 1; if (u === e) break;
      adj[u].forEach(([v, w]) => { if (D[u] + w < D[v]) { D[v] = D[u] + w; P[v] = u; q.push(v); } }); }
    const path = []; for (let u = e; u !== -1; u = P[u]) path.push(V[u].p); path.reverse();
    // simplify: drop nearly collinear points
    const out = []; path.forEach((p, i) => { if (i === 0 || i === path.length - 1) { out.push(p); return; } const a = out[out.length - 1], b = path[i + 1]; const cr = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / (FT.dist(a, b) || 1); if (cr > 1.2) out.push(p); });
    if (out.length && FT.dist(out[0], p1) < 6) out.shift(); if (out.length && FT.dist(out[out.length - 1], p2) < 6) out.pop();
    return out.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  };

  /* ------------------------------------------------------------------ project state */
  FT.state = null; FT.D = null; FT.dirty = true;
  FT.uid = function (k) { const c = FT.state.counters; c[k] = (c[k] || 0) + 1; return k + c[k]; };
  FT.nextName = function (type) {
    const st = FT.state, pre = st.settings.prefixes[type] || type.toUpperCase(); let n = 0, name; const names = new Set(st.nodes.map(x => x.name).concat(st.cables.map(x => x.name)));
    do { n++; name = pre + '-' + String(n).padStart(2, '0'); } while (names.has(name)); return name;
  };
  FT.node = id => FT.state.nodes.find(n => n.id === id);
  FT.cable = id => FT.state.cables.find(c => c.id === id);
  FT.bld = id => FT.state.buildings.find(b => b.id === id);
  FT.centre = b => [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
  FT.endPos = function (ref) {
    if (!ref) return null;
    if (ref.t === 'n') { const n = FT.node(ref.id); return n ? [n.x, n.y] : null; }
    const b = FT.bld(ref.id); return b ? FT.centre(b) : null;
  };
  FT.cablePts = function (c) { const a = FT.endPos(c.a), b = FT.endPos(c.b); if (!a || !b) return null; return [a].concat(c.pts || [], [b]); };
  FT.endLoop = function (ref) { const s = FT.state.settings.loops; if (!ref) return 0; if (ref.t === 'b') return s.b || 0; const n = FT.node(ref.id); return n ? (s[n.type] || 0) : 0; };
  FT.cableLen = function (c) {
    const pts = FT.cablePts(c), sc = FT.state.settings.scale; if (!pts) return { geo: 0, slack: 0, loops: 0, total: 0 };
    const geo = FT.polyLen(pts) * sc, sl = (c.slack == null || c.slack === '' ? FT.state.settings.slack : +c.slack) / 100, slack = geo * sl, loops = FT.endLoop(c.a) + FT.endLoop(c.b);
    return { geo, slack, loops, total: geo + slack + loops };
  };
  FT.fibreInfo = function (idx, tubeSize, std) {
    const code = FT.COLOR_CODES[std || FT.state.settings.colorStd], ts = tubeSize || FT.state.settings.tubeSize || 12;
    const tube = Math.floor((idx - 1) / ts) + 1, fi = (idx - 1) % ts;
    return { idx, tube, fibreInTube: fi + 1, fibre: code[fi % 12], tubeCol: code[(tube - 1) % 12], ring: tube > 12 };
  };
  FT.splitN = r => { if (!r || r === 'none') return 1; return parseInt(String(r).split(':')[1], 10) || 1; };
  FT.splitLoss = r => { const t = FT.state.settings.splitterLoss; return r && r !== 'none' ? (t[r] != null ? +t[r] : FT.SPLITTER_LOSS[r] || 0) : 0; };

  /* ------------------------------------------------------------------ derived topology */
  FT.invalidate = function () { FT.dirty = true; };
  FT.derive = function () {
    if (!FT.dirty && FT.D) return FT.D;
    const st = FT.state, D = { children: {}, parent: {}, dropOf: {}, portsUsed: {}, cableUsed: {}, demand: {}, splittersNeeded: {}, budget: {}, pathOf: {}, len: {} };
    st.nodes.forEach(n => { D.children[n.id] = []; D.portsUsed[n.id] = 0; });
    st.cables.forEach(c => {
      D.len[c.id] = FT.cableLen(c);
      if (c.kind === 'drop') { if (c.b && c.b.t === 'b') D.dropOf[c.b.id] = c; }
      else if (c.a && c.a.t === 'n' && D.children[c.a.id]) { D.children[c.a.id].push(c); if (c.b && c.b.t === 'n') D.parent[c.b.id] = c; }
    });
    st.buildings.forEach(b => { if (b.fat && D.portsUsed[b.fat] != null && b.status !== 'refused') D.portsUsed[b.fat]++; });
    const memo = {};
    const demand = nid => {   // fibres entering the node's input (after its splitter, if any)
      if (memo[nid] != null) return memo[nid]; memo[nid] = 0; const n = FT.node(nid); if (!n) return 0;
      let outs = D.portsUsed[nid] || 0; D.children[nid].forEach(c => { outs += (c.b && c.b.t === 'n') ? demand(c.b.id) : 0; });
      const N = FT.splitN(n.props.split); D.splittersNeeded[nid] = N > 1 ? Math.ceil(outs / N) : 0; memo[nid] = N > 1 ? Math.ceil(outs / N) : outs; return memo[nid];
    };
    st.nodes.forEach(n => { D.demand[n.id] = demand(n.id); });
    st.cables.forEach(c => { D.cableUsed[c.id] = c.kind === 'drop' ? 1 : (c.b && c.b.t === 'n' ? D.demand[c.b.id] || 0 : 0); });
    // path of each building and optical budget
    const prof = FT.PON[st.settings.ponProfile] || FT.PON['GPON-B+'], S = st.settings;
    st.buildings.forEach(b => {
      const dc = D.dropOf[b.id]; const cables = [], nodes = []; let ok = !!(dc && b.fat);
      if (dc) {
        cables.push(dc); let nid = dc.a && dc.a.t === 'n' ? dc.a.id : null, guard = 0;
        while (nid && guard++ < 50) { const n = FT.node(nid); if (!n) { ok = false; break; } nodes.unshift(n); const pc = D.parent[nid]; if (!pc) break; cables.unshift(pc); nid = pc.a && pc.a.t === 'n' ? pc.a.id : null; }
        if (!nodes.length || nodes[0].type !== 'co') ok = false;
      }
      D.pathOf[b.id] = { cables, nodes, ok };
      if (!ok) { D.budget[b.id] = null; return; }
      let m = 0; cables.forEach(c => m += D.len[c.id].total); const km = m / 1000;
      let conn = S.ontConn, spl = 0, split = 0; nodes.forEach(n => { conn += +n.props.conn || 0; spl += +n.props.splice || 0; split += FT.splitLoss(n.props.split); });
      const fibre = km * S.att1490, fibreUp = km * S.att1310, cl = conn * S.connLoss, sl = spl * S.spliceLoss, loss = fibre + cl + sl + split;
      const tx = (nodes[0].props.txOverride !== '' && nodes[0].props.txOverride != null && !isNaN(+nodes[0].props.txOverride)) ? +nodes[0].props.txOverride : (S.txOverride != null && S.txOverride !== '' ? +S.txOverride : prof.txMin);
      const rx = tx - loss, margin = rx - prof.rxSens; let status = margin >= S.margin ? 'ok' : (margin >= 0 ? 'warn' : 'fail'); if (rx > prof.ovl) status = status === 'fail' ? 'fail' : 'over';
      D.budget[b.id] = { lenM: m, km, fibre, fibreUp, conn, splices: spl, splitLoss: split, connLoss: cl, spliceLossT: sl, loss, tx, rx, margin, status, lossUp: fibreUp + cl + sl + split };
    });
    FT.D = D; FT.dirty = false; return D;
  };
  FT.profile = () => FT.PON[FT.state.settings.ponProfile] || FT.PON['GPON-B+'];


  /* splitter / PON allocation tables (derived, in cable order) */
  FT.fdhAlloc = function (nid) {
    const D = FT.derive(), n = FT.node(nid), N = FT.splitN(n.props.split), res = { N, spl: [], byCable: {} }; if (N < 2) return res; let o = 0;
    (D.children[nid] || []).forEach(c => { res.byCable[c.id] = {}; const u = D.cableUsed[c.id] || 0; for (let i = 1; i <= u; i++) { const s = Math.floor(o / N) + 1, p = (o % N) + 1; res.byCable[c.id][i] = { spl: 'SPL-' + n.name + '-' + s, out: p }; (res.spl[s - 1] = res.spl[s - 1] || { name: 'SPL-' + n.name + '-' + s, outs: [] }).outs.push({ port: p, cable: c.name, fibre: i }); o++; } });
    return res;
  };
  FT.coAlloc = function (nid) {
    const D = FT.derive(), rows = [], byCable = {}; let k = 0;
    (D.children[nid] || []).forEach(c => { byCable[c.id] = {}; const u = D.cableUsed[c.id] || 0; for (let i = 1; i <= u; i++) { k++; const pon = '0/' + (Math.floor((k - 1) / 16) + 1) + '/' + (((k - 1) % 16) + 1); byCable[c.id][i] = pon; rows.push({ pon, cable: c.name, fibre: i }); } });
    return { rows, byCable };
  };


  /* splitter / PON allocation tables (derived, in cable order) */
  FT.fdhAlloc = function (nid) {
    const D = FT.derive(), n = FT.node(nid), N = FT.splitN(n.props.split), res = { N, spl: [], byCable: {} }; if (N < 2) return res; let o = 0;
    (D.children[nid] || []).forEach(c => { res.byCable[c.id] = {}; const u = D.cableUsed[c.id] || 0; for (let i = 1; i <= u; i++) { const s = Math.floor(o / N) + 1, p = (o % N) + 1; res.byCable[c.id][i] = { spl: 'SPL-' + n.name + '-' + s, out: p }; (res.spl[s - 1] = res.spl[s - 1] || { name: 'SPL-' + n.name + '-' + s, outs: [] }).outs.push({ port: p, cable: c.name, fibre: i }); o++; } });
    return res;
  };
  FT.coAlloc = function (nid) {
    const D = FT.derive(), rows = [], byCable = {}; let k = 0;
    (D.children[nid] || []).forEach(c => { byCable[c.id] = {}; const u = D.cableUsed[c.id] || 0; for (let i = 1; i <= u; i++) { k++; const pon = '0/' + (Math.floor((k - 1) / 16) + 1) + '/' + (((k - 1) % 16) + 1); byCable[c.id][i] = pon; rows.push({ pon, cable: c.name, fibre: i }); } });
    return { rows, byCable };
  };

  /* ------------------------------------------------------------------ design checks */
  FT.checks = function () {
    const st = FT.state, D = FT.derive(), out = [], S = st.settings, push = (sev, key, target, args) => out.push({ sev, key, target, args: args || [] });
    const co = st.nodes.filter(n => n.type === 'co');
    if (!co.length) push('error', 'chk_noco', null);
    st.nodes.forEach(n => {
      if ((n.type === 'fdh' || n.type === 'fat' || n.type === 'closure') && !D.parent[n.id]) push('error', 'chk_nofeed', { t: 'n', id: n.id }, [n.name]);
      if (n.type === 'fat') { const cap = +n.props.ports || 0; if (D.portsUsed[n.id] > cap) push('error', 'chk_fat_over', { t: 'n', id: n.id }, [n.name, D.portsUsed[n.id], cap]); if (!D.portsUsed[n.id]) push('info', 'chk_fat_empty', { t: 'n', id: n.id }, [n.name]); }
      if (n.type === 'fdh') { const need = D.splittersNeeded[n.id] || 0, cap = +n.props.slots || 0; if (need > cap) push('error', 'chk_fdh_over', { t: 'n', id: n.id }, [n.name, need, cap]); }
      if (n.type === 'co') { let need = 0; D.children[n.id].forEach(c => need += D.cableUsed[c.id] || 0); if (need > (+n.props.ponPorts || 0)) push('error', 'chk_co_pon', { t: 'n', id: n.id }, [n.name, need, n.props.ponPorts]); }
    });
    const names = {}; st.nodes.concat(st.cables).forEach(x => { names[x.name] = (names[x.name] || 0) + 1; }); Object.keys(names).forEach(k => { if (names[k] > 1) push('warn', 'chk_dupname', null, [k]); });
    st.cables.forEach(c => {
      if (!FT.cablePts(c)) { push('error', 'chk_cable_end', { t: 'c', id: c.id }, [c.name]); return; }
      const u = D.cableUsed[c.id] || 0; if (u > (+c.fibres || 0)) push('error', 'chk_cable_cap', { t: 'c', id: c.id }, [c.name, u, c.fibres]);
      if (c.kind === 'drop' && D.len[c.id].geo * 1 > S.maxDrop) push('warn', 'chk_drop_long', { t: 'c', id: c.id }, [c.name, Math.round(D.len[c.id].geo), S.maxDrop]);
      if (D.len[c.id].geo < 0.5) push('warn', 'chk_cable_zero', { t: 'c', id: c.id }, [c.name]);
    });
    const ports = {}; st.buildings.forEach(b => { if (b.fat) { const k = b.fat + ':' + b.port; if (b.port) { if (ports[k]) push('warn', 'chk_port_dup', { t: 'b', id: b.id }, [b.id, (FT.node(b.fat) || {}).name, b.port]); ports[k] = 1; } } });
    let unassigned = 0; st.buildings.forEach(b => {
      if (!b.fat) { unassigned++; return; }
      const bu = D.budget[b.id]; if (!bu) { push('error', 'chk_nopath', { t: 'b', id: b.id }, [b.id]); return; }
      if (bu.status === 'fail') push('error', 'chk_budget_fail', { t: 'b', id: b.id }, [b.id, bu.rx.toFixed(1)]);
      else if (bu.status === 'warn') push('warn', 'chk_budget_warn', { t: 'b', id: b.id }, [b.id, bu.margin.toFixed(1)]);
      else if (bu.status === 'over') push('info', 'chk_budget_over', { t: 'b', id: b.id }, [b.id, bu.rx.toFixed(1)]);
    });
    if (unassigned) push('info', 'chk_unassigned', null, [unassigned]);
    return out;
  };

  /* ------------------------------------------------------------------ statistics + BOM */
  FT.stats = function () {
    const st = FT.state, D = FT.derive(), r = { homes: st.buildings.length, assigned: 0, active: 0, connected: 0, cableM: { feeder: 0, distribution: 0, drop: 0 }, cableN: { feeder: 0, distribution: 0, drop: 0 }, nodes: {}, worst: null, avg: 0, ok: 0, warn: 0, fail: 0 };
    st.buildings.forEach(b => { if (b.fat) r.assigned++; if (b.status === 'active') r.active++; if (b.status === 'connected' || b.status === 'active') r.connected++; });
    st.cables.forEach(c => { r.cableM[c.kind] = (r.cableM[c.kind] || 0) + D.len[c.id].total; r.cableN[c.kind] = (r.cableN[c.kind] || 0) + 1; });
    st.nodes.forEach(n => { r.nodes[n.type] = (r.nodes[n.type] || 0) + 1; });
    let sum = 0, cnt = 0; st.buildings.forEach(b => { const bu = D.budget[b.id]; if (!bu) return; cnt++; sum += bu.loss; if (!r.worst || bu.loss > r.worst.loss) r.worst = Object.assign({ id: b.id }, bu); if (bu.status === 'ok' || bu.status === 'over') r.ok++; else if (bu.status === 'warn') r.warn++; else r.fail++; });
    r.avg = cnt ? sum / cnt : 0; r.totalCable = r.cableM.feeder + r.cableM.distribution + r.cableM.drop; return r;
  };
  FT.bom = function () {
    const st = FT.state, D = FT.derive(), P = st.settings.prices, items = [];
    const groups = {};
    st.cables.forEach(c => { const k = c.cableType + '|' + c.fibres + '|' + c.kind; (groups[k] = groups[k] || { type: c.cableType, fibres: c.fibres, kind: c.kind, n: 0, m: 0 }); groups[k].n++; groups[k].m += D.len[c.id].total; });
    Object.values(groups).sort((a, b) => a.kind.localeCompare(b.kind) || b.fibres - a.fibres).forEach(g => items.push({ cat: 'cable', g, qty: Math.ceil(g.m), unit: 'm', price: (P['cable:' + g.type] || 0) * Math.max(1, Math.sqrt(g.fibres / 12)), key: 'cable:' + g.type }));
    const nc = {}; st.nodes.forEach(n => { nc[n.type] = (nc[n.type] || 0) + 1; }); Object.keys(nc).forEach(t => items.push({ cat: 'node', type: t, qty: nc[t], unit: 'pcs', price: P['node:' + t] || 0, key: 'node:' + t }));
    const sp = {}; st.nodes.forEach(n => { const N = n.props.split; if (!N || N === 'none') return; const q = n.type === 'fat' ? (D.portsUsed[n.id] ? 1 : 0) : (D.splittersNeeded[n.id] || 0); if (q) sp[N] = (sp[N] || 0) + q; });
    Object.keys(sp).forEach(r => items.push({ cat: 'split', ratio: r, qty: sp[r], unit: 'pcs', price: P['split:' + r] || 0, key: 'split:' + r }));
    let pig = 0; st.cables.forEach(c => { [c.a, c.b].forEach(ref => { if (ref && ref.t === 'n') { const n = FT.node(ref.id); if (n && (+n.props.splice > 0)) pig += D.cableUsed[c.id] || 0; } }); });
    const onts = st.buildings.filter(b => b.fat && b.status !== 'refused').length;
    items.push({ cat: 'misc', k: 'ont', qty: onts, unit: 'pcs', price: P.ont || 0, key: 'ont' });
    items.push({ cat: 'misc', k: 'pigtail', qty: pig, unit: 'pcs', price: P.pigtail || 0, key: 'pigtail' });
    items.push({ cat: 'misc', k: 'splice', qty: pig, unit: 'pcs', price: P.splice || 0, key: 'splice' });
    items.push({ cat: 'misc', k: 'sleeve', qty: pig, unit: 'pcs', price: P.sleeve || 0, key: 'sleeve' });
    items.push({ cat: 'misc', k: 'patchcord', qty: onts, unit: 'pcs', price: P.patchcord || 0, key: 'patchcord' });
    let ductM = 0; st.cables.forEach(c => { if (c.install === 'duct' || c.install === 'direct' || c.install === 'micro') ductM += D.len[c.id].geo; });
    items.push({ cat: 'misc', k: 'trench', qty: Math.ceil(ductM), unit: 'm', price: P.trench || 0, key: 'trench' });
    items.forEach(i => { i.total = i.qty * i.price; }); return items;
  };

  /* ------------------------------------------------------------------ editing helpers */
  FT.addNode = function (type, x, y, opts) {
    const st = FT.state, def = FT.NODE_TYPES[type], n = { id: FT.uid('n'), type, name: FT.nextName(type), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, status: 'planned', notes: '', props: JSON.parse(JSON.stringify(def.props)) };
    if (opts) Object.assign(n, opts); st.nodes.push(n); FT.invalidate(); return n;
  };
  FT.addCable = function (kind, a, b, pts, opts) {
    const st = FT.state, S = st.settings, c = { id: FT.uid('c'), kind, name: '', a, b, pts: pts || [], cableType: kind === 'drop' ? 'drop-flat' : 'loose-duct', fibres: kind === 'drop' ? 2 : 12, install: kind === 'drop' ? 'aerial' : 'duct', color: kind === 'feeder' ? '#ff4d4d' : '#3b9cff', status: 'planned', slack: '', notes: '' };
    const pre = S.prefixes[kind] || 'C'; if (kind === 'drop' && b && b.t === 'b') c.name = pre + '-' + String(b.id).padStart(3, '0'); else c.name = FT.nextName(kind);
    if (opts) Object.assign(c, opts); st.cables.push(c); FT.invalidate(); return c;
  };
  FT.deleteCable = function (id) { const st = FT.state, c = FT.cable(id); if (!c) return; st.cables = st.cables.filter(x => x.id !== id); if (c.kind === 'drop' && c.b && c.b.t === 'b') { const b = FT.bld(c.b.id); if (b) { b.fat = null; b.port = ''; } } FT.invalidate(); };
  FT.deleteNode = function (id) {
    const st = FT.state; st.cables.filter(c => (c.a && c.a.t === 'n' && c.a.id === id) || (c.b && c.b.t === 'n' && c.b.id === id)).forEach(c => FT.deleteCable(c.id));
    st.buildings.forEach(b => { if (b.fat === id) { b.fat = null; b.port = ''; } }); st.nodes = st.nodes.filter(n => n.id !== id); FT.invalidate();
  };
  FT.nextPort = function (fatId) { const used = new Set(FT.state.buildings.filter(b => b.fat === fatId && b.port).map(b => +b.port)); let p = 1; while (used.has(p)) p++; return p; };
  FT.assign = function (bldId, fatId, keepCable) {
    const b = FT.bld(bldId), n = FT.node(fatId); if (!b || !n) return null;
    let dc = FT.state.cables.find(c => c.kind === 'drop' && c.b && c.b.t === 'b' && c.b.id === bldId);
    if (dc) { dc.a = { t: 'n', id: fatId }; if (!keepCable) dc.pts = []; } else dc = FT.addCable('drop', { t: 'n', id: fatId }, { t: 'b', id: bldId }, []);
    dc.color = FT.zoneColor(n); b.fat = fatId; b.port = FT.nextPort(fatId); if (b.status === 'planned') b.status = 'passed'; FT.invalidate(); return dc;
  };
  FT.zoneColor = function (n) { // colour of the FDH zone a node belongs to
    const D = FT.derive(); let guard = 0, cur = n; while (cur && guard++ < 20) { if (cur.type === 'fdh') return cur.color || FT.ZONE_COLORS[0]; const pc = D.parent[cur.id]; cur = pc && pc.a ? FT.node(pc.a.id) : null; } return '#3b9cff';
  };

  /* ------------------------------------------------------------------ demo network for the surveyed area */
  FT.newProject = function () {
    const st = FT.state = { v: 1, meta: FT.defaultMeta(), settings: FT.defaultSettings(), counters: {}, nodes: [], cables: [], buildings: [], notes: [] };
    S0.buildings.forEach(b => st.buildings.push({ id: b[0], block: b[1], x1: b[2], y1: b[3], x2: b[4], y2: b[5], name: '', units: 1, floors: 1, status: 'planned', fat: null, port: '', plan: '', ont: { model: '', serial: '' }, contact: '', notes: '' }));
    FT.invalidate(); return st;
  };
  FT.buildDemo = function () {
    const st = FT.newProject(), S = st.settings;
    const co = FT.addNode('co', 470, 316, { name: 'CO-01 (POP/OLT)' }); co.props.olt = 'OLT-01 (16×PON)';
    const FD = [[680, 322], [676, 492], [668, 657], [925, 502], [940, 340]].map((p, i) => { const n = FT.addNode('fdh', p[0], p[1], { name: 'FDH-0' + (i + 1) }); n.color = FT.ZONE_COLORS[i]; return n; });
    // assign buildings to the nearest FDH (street distance approximated by straight distance), then split into FATs of <= 8
    const groups = FD.map(() => []), GD = FD.map(f => FT.graphDist(FT.nearestVertex([f.x, f.y])));
    st.buildings.forEach(b => { const c = FT.centre(b), v = FT.nearestVertex(c), off = FT.dist(c, FT.graph.V[v].p); let bi = 0, bd = 1e12; GD.forEach((g, i) => { const d = g[v] + off; if (d < bd) { bd = d; bi = i; } }); groups[bi].push(b); });
    let fatN = 0;
    groups.forEach((G, gi) => {
      if (!G.length) return; const k = Math.ceil(G.length / 8); let cent = []; const sorted = G.slice().sort((a, b) => FT.centre(a)[0] + FT.centre(a)[1] * 0.3 - FT.centre(b)[0] - FT.centre(b)[1] * 0.3);
      for (let i = 0; i < k; i++) cent.push(FT.centre(sorted[Math.floor((i + 0.5) * sorted.length / k)]));
      let asg = new Array(G.length).fill(0);
      for (let it = 0; it < 12; it++) {
        const load = new Array(k).fill(0); const order = G.map((b, i) => i).sort((i, j) => { const ci = FT.centre(G[i]), cj = FT.centre(G[j]); const di = Math.min(...cent.map(c => FT.dist(ci, c))), dj = Math.min(...cent.map(c => FT.dist(cj, c))); return di - dj; });
        order.forEach(i => { const c = FT.centre(G[i]); const ranked = cent.map((cc, ci) => [FT.dist(c, cc), ci]).sort((a, b) => a[0] - b[0]); for (const [, ci] of ranked) if (load[ci] < 8) { asg[i] = ci; load[ci]++; break; } });
        cent = cent.map((c, ci) => { const m = G.filter((b, i) => asg[i] === ci).map(FT.centre); if (!m.length) return c; return [m.reduce((s, p) => s + p[0], 0) / m.length, m.reduce((s, p) => s + p[1], 0) / m.length]; });
      }
      const fdh = FD[gi], fats = [];
      for (let ci = 0; ci < k; ci++) {
        const mem = G.filter((b, i) => asg[i] === ci); if (!mem.length) continue; fatN++;
        const near = FT.nearOnStreets(cent[ci]), pos = near ? near.pt : cent[ci];
        const fat = FT.addNode('fat', pos[0], pos[1], { name: 'FAT-' + String(gi + 1) + String.fromCharCode(65 + fats.length) }); fat.color = fdh.color; fats.push(fat);
        const dcab = FT.addCable('distribution', { t: 'n', id: fdh.id }, { t: 'n', id: fat.id }, FT.route([fdh.x, fdh.y], [fat.x, fat.y]), { name: 'DC-' + (gi + 1) + String.fromCharCode(65 + fats.length - 1), color: fdh.color, fibres: 12 });
        mem.sort((a, b) => FT.centre(a)[0] - FT.centre(b)[0]).forEach(b => FT.assign(b.id, fat.id));
      }
    });
    FD.forEach((f, i) => { const D = FT.derive(); const need = D.cableUsed ? 0 : 0; const rt = FT.route([co.x, co.y], [f.x, f.y]); FT.addCable('feeder', { t: 'n', id: co.id }, { t: 'n', id: f.id }, rt, { name: 'FC-0' + (i + 1), fibres: 12, color: '#ff4d4d' }); });
    // size feeders from the demand (twice the used fibres, standard counts, minimum 12)
    FT.invalidate(); const D = FT.derive(); st.cables.filter(c => c.kind === 'feeder').forEach(c => { const u = D.cableUsed[c.id] || 1; c.fibres = FT.FIBRE_COUNTS.find(x => x >= Math.max(12, u * 2)) || 288; });
    st.cables.filter(c => c.kind === 'distribution').forEach(c => { c.fibres = 12; });
    FT.invalidate(); return st;
  };

  /* ------------------------------------------------------------------ export helpers */
  FT.csv = rows => '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
  FT.toLatLon = function (x, y) {   // approximate: local plane around the reference point, rotated by 'rot' degrees (clockwise from north), x east / y south in image px
    const g = FT.state.settings.geo, lat0 = parseFloat(g.lat), lon0 = parseFloat(g.lon); if (isNaN(lat0) || isNaN(lon0)) return null;
    const sc = FT.state.settings.scale, mx = (x - FT.state.geoRef[0]) * sc, my = -(y - FT.state.geoRef[1]) * sc, th = (parseFloat(g.rot) || 0) * Math.PI / 180;
    const E = mx * Math.cos(th) + my * Math.sin(th), N = -mx * Math.sin(th) + my * Math.cos(th);
    return [lon0 + E / (111320 * Math.cos(lat0 * Math.PI / 180)), lat0 + N / 110574];
  };
  FT.load = function (obj) {
    const base = FT.defaultSettings(), s = Object.assign({}, base, obj.settings || {}); s.loops = Object.assign({}, base.loops, (obj.settings || {}).loops); s.prefixes = Object.assign({}, base.prefixes, (obj.settings || {}).prefixes);
    s.prices = Object.assign({}, base.prices, (obj.settings || {}).prices); s.splitterLoss = Object.assign({}, base.splitterLoss, (obj.settings || {}).splitterLoss); s.geo = Object.assign({}, base.geo, (obj.settings || {}).geo);
    FT.state = Object.assign({ v: 1, meta: FT.defaultMeta(), counters: {}, nodes: [], cables: [], buildings: [], notes: [] }, obj, { settings: s }); if (!FT.state.geoRef) FT.state.geoRef = [(FT.BOUNDS.x0 + FT.BOUNDS.x1) / 2, (FT.BOUNDS.y0 + FT.BOUNDS.y1) / 2]; FT.invalidate();
  };
})();
