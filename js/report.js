/* The project report: fixed A4 pages built from the project data and downloaded straight as a PDF (js/pdf.js). Nothing is sent anywhere. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const R = FT.rep = {};
  const ar = () => FT.lang === 'ar';
  const T = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const num = (v, d) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const len = m => m >= 1000 ? num(m / 1000, 2) + ' km' : num(m, 0) + ' m';
  const money = v => FT.moneyPlain(v);
  const ltr = s => '<bdi dir="ltr">' + s + '</bdi>';
  const PAL = ['#ff6a3d', '#2aa8ff', '#35c9b0', '#b57bff', '#ffb020', '#ff4f7a', '#6b7a99', '#84cc16'];
  const NODE_COL = { olt: '#17a86b', sk: '#ff8a3d', dk: '#e0a800', bk: '#ff4f7a', mh: '#6b7280', hh: '#9aa5bd', pole: '#a9825a' };
  const CAB_COL = { Feeder: '#9d5cf0', Backbone: '#9d5cf0', Distribution: '#17b9a4', Drop: '#8fb300' };
  const cabGroup = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder';
  const spanPts = c => [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts));

  // ---------------- data ----------------
  R.data = function (scope, ring) {
    const S = FT.state, has = (set, id) => !scope || (scope[set] && scope[set].has(id));
    const nodes = Object.values(S.nodes).filter(n => has('nodes', n.id)), pipes = Object.values(S.pipes).filter(p => has('pipes', p.id)), cables = Object.values(S.cables).filter(c => has('cables', c.id));
    const group = (list, key, length) => { const m = new Map(); list.forEach(x => { const k = key(x), g = m.get(k) || { name: k, n: 0, len: 0, items: [] }; g.n++; if (length) g.len += length(x); g.items.push(x); m.set(k, g); }); return [...m.values()]; };
    const cabLen = new Map(cables.map(c => [c.id, FT.cableLength(c)]));
    const cabByType = group(cables, c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).name || c.cat, c => cabLen.get(c.id)).sort((a, b) => b.len - a.len);
    const cabByGroup = group(cables, cabGroup, c => cabLen.get(c.id)).sort((a, b) => b.len - a.len);
    const pipByType = group(pipes, p => (FT.PIPE_CAT.find(x => x.id === p.cat) || {}).name || p.ptype, p => FT.pathLen(p.pts) * (p.qty || 1)).sort((a, b) => b.len - a.len);
    const nodeByType = Object.keys(FT.NODE_TYPES).map(t => ({ type: t, name: FT.NODE_TYPES[t].short, full: FT.nodeTypeName(t), n: nodes.filter(n => n.type === t).length })).filter(x => x.n);
    const splitters = group(nodes.filter(n => n.ratio), n => n.ratio).map(g => ({ name: g.name, n: g.items.reduce((a, n) => a + (n.nsplit || 1), 0) })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const inScope = new Set(nodes.map(n => n.id));
    const all = FT.spec.analyze(), fdb = all.filter(r => inScope.has(r.node.id)).sort((a, b) => String(a.node.code || a.node.name).localeCompare(String(b.node.code || b.node.name), undefined, { numeric: true }));
    const fed = fdb.filter(r => r.fed);
    const fdcRows = new Map();
    fed.forEach(r => { const f = r.path.map(i => S.nodes[i]).filter(x => x && x.type === 'sk').pop(); if (!f) return; const g = fdcRows.get(f.id) || { node: f, n: 0, worst: 0, far: 0 }; g.n++; g.worst = Math.max(g.worst, r.loss); g.far = Math.max(g.far, r.len); fdcRows.set(f.id, g); });
    const subs = FT.spec.subRows().filter(r => !scope || inScope.has(r.sub.node));
    const splices = Object.values(S.splices).filter(s => has('nodes', s.node)).length;
    const cost = FT.cost(scope);
    let buildings = 0; if (ring && FT.map && FT.map.buildingsInRing) buildings = FT.map.buildingsInRing(ring).length;
    const withFdb = new Set(nodes.filter(n => n.type === 'bk' && n.bld).map(n => n.bld)).size;
    return {
      nodes, pipes, cables, cabByType, cabByGroup, pipByType, nodeByType, splitters, fdb, fed, fdc: [...fdcRows.values()].sort((a, b) => String(a.node.code || a.node.name).localeCompare(String(b.node.code || b.node.name), undefined, { numeric: true })), subs, splices, cost, buildings, withFdb,
      pipeM: pipes.reduce((a, p) => a + FT.pathLen(p.pts), 0), cableM: cabByType.reduce((a, g) => a + g.len, 0),
      fibreKm: cables.reduce((a, c) => a + cabLen.get(c.id) / 1000 * (c.core || 0), 0), worst: fed.length ? Math.max(...fed.map(r => r.loss)) : null, soc: FT.spec.soc(),
    };
  };

  // ---------------- charts (inline SVG) ----------------
  function donut(items, fmt, center) {
    const total = items.reduce((a, x) => a + x.v, 0); if (!total) return '<p class="muted">—</p>';
    let a0 = -Math.PI / 2; const C = 80, r = 70, r2 = 44, arcs = items.map((x, i) => {
      const a1 = a0 + Math.min(0.9999, x.v / total) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, p = (rr, a) => (C + rr * Math.cos(a)).toFixed(2) + ' ' + (C + rr * Math.sin(a)).toFixed(2);
      const d = 'M' + p(r, a0) + ' A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + p(r, a1) + ' L' + p(r2, a1) + ' A' + r2 + ' ' + r2 + ' 0 ' + big + ' 0 ' + p(r2, a0) + 'Z'; a0 = a1;
      return '<path d="' + d + '" fill="' + (x.c || PAL[i % PAL.length]) + '"/>';
    }).join('');
    return '<div class="donut"><svg viewBox="0 0 160 160">' + arcs + '<text x="80" y="85" text-anchor="middle" class="dc">' + esc(center) + '</text></svg><ul>' + items.map((x, i) => '<li><i style="background:' + (x.c || PAL[i % PAL.length]) + '"></i><span>' + esc(x.k) + '</span><b>' + ltr(fmt(x.v)) + '</b><small>' + ltr(Math.round(x.v / total * 100) + '%') + '</small></li>').join('') + '</ul></div>';
  }
  function bars(items, fmt) {
    const max = Math.max(1, ...items.map(x => x.v));
    return '<div class="bars">' + items.map((x, i) => '<div class="bar"><span>' + esc(x.k) + '</span><div><i style="width:' + Math.max(1.5, x.v / max * 100).toFixed(1) + '%;background:' + (x.c || PAL[i % PAL.length]) + '"></i></div><b>' + ltr(fmt(x.v)) + '</b></div>').join('') + '</div>';
  }
  function lossChart(fed) {
    if (!fed.length) return '<p class="muted">' + T('لا توجد علب FDB موصولة بالـ OLT ضمن هذا النطاق.', 'No FDB connected to an OLT in this scope.') + '</p>';
    const L = FT.LIMITS.maxLoss, vals = fed.map(r => r.loss), lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.max(Math.ceil(Math.max(...vals) + 0.5), L + 1), step = (hi - lo) > 16 ? 2 : 1, n = Math.ceil((hi - lo) / step), bins = new Array(n).fill(0);
    vals.forEach(v => bins[Math.min(n - 1, Math.max(0, Math.floor((v - lo) / step)))]++);
    const W = 700, H = 210, pad = 28, bw = (W - pad * 2) / n, max = Math.max(...bins), X = v => pad + (v - lo) / (n * step) * (W - pad * 2);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hist" direction="ltr">';
    bins.forEach((b, i) => { const h = b / max * (H - 62), from = lo + i * step, col = from >= L ? '#e5484d' : from + step > L - 2 ? '#ffb020' : '#17a86b'; s += '<rect x="' + (pad + i * bw + 2) + '" y="' + (H - 28 - h) + '" width="' + (bw - 4) + '" height="' + h + '" rx="3" fill="' + col + '"/>' + (b ? '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (H - 33 - h) + '" text-anchor="middle">' + b + '</text>' : '') + '<text x="' + (pad + i * bw) + '" y="' + (H - 12) + '" text-anchor="middle" class="ax">' + from + '</text>'; });
    s += '<text x="' + (W - pad) + '" y="' + (H - 12) + '" text-anchor="middle" class="ax">' + (lo + n * step) + ' dB</text><line x1="' + X(L) + '" x2="' + X(L) + '" y1="14" y2="' + (H - 28) + '" stroke="#e5484d" stroke-width="2" stroke-dasharray="5 4"/><text x="' + X(L) + '" y="11" text-anchor="middle" fill="#e5484d">' + L + ' dB</text>';
    return s + '</svg>';
  }

  // ---------------- the map drawing ----------------
  R.mapSvg = function (d, ring) {
    const S = FT.state, pts = []; d.nodes.forEach(n => pts.push(n.ll)); d.pipes.forEach(p => p.pts.forEach(q => pts.push(q))); if (ring) ring.forEach(q => pts.push(q));
    if (pts.length < 2) return '';
    let [w, s, e, n] = FT.bboxOf(pts); const kx = Math.cos((s + n) / 2 * Math.PI / 180);
    const mx = Math.max((e - w) * 0.05, 0.00035), my = Math.max((n - s) * 0.05, 0.0003); w -= mx; e += mx; s -= my; n += my;
    const W = 1000, gw = (e - w) * kx, gh = n - s, H = Math.round(Math.min(1150, Math.max(430, W * gh / gw))), k = Math.min(W / gw, H / gh), ox = (W - gw * k) / 2, oy = (H - gh * k) / 2;
    const X = p => (ox + (p[0] - w) * kx * k).toFixed(1), Y = p => (oy + (n - p[1]) * k).toFixed(1), line = a => a.map(p => X(p) + ',' + Y(p)).join(' ');
    let o = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="map" direction="ltr"><rect width="' + W + '" height="' + H + '" fill="#f7f5f0"/>';
    const blds = ((FT.map && FT.map.bldFeats) || []).filter(f => { const p = f.geometry.coordinates[0][0]; return p[0] > w && p[0] < e && p[1] > s && p[1] < n; });
    if (blds.length && blds.length < 12000) o += '<g fill="#e4dfd4" stroke="#cfc8ba" stroke-width="0.6">' + blds.map(f => '<polygon points="' + line(f.geometry.coordinates[0]) + '"/>').join('') + '</g>';
    if (ring) o += '<polygon points="' + line(ring) + '" fill="#ff6a3d" fill-opacity="0.06" stroke="#ff6a3d" stroke-width="2.5" stroke-dasharray="9 6"/>';
    const dense = d.nodes.length > 900, lw = dense ? 1.6 : 3.4;
    o += '<g fill="none" stroke="#2aa8ff" stroke-width="' + (lw * 1.9) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">' + d.pipes.map(p => '<polyline points="' + line(p.pts) + '"/>').join('') + '</g>';
    ['Drop', 'Distribution', 'Feeder', 'Backbone'].forEach(g => { const list = d.cables.filter(c => cabGroup(c) === g); if (list.length) o += '<g fill="none" stroke="' + CAB_COL[g] + '" stroke-width="' + (g === 'Feeder' || g === 'Backbone' ? lw : lw * 0.62) + '" stroke-linecap="round" stroke-linejoin="round">' + list.map(c => '<polyline points="' + line(spanPts(c)) + '"/>').join('') + '</g>'; });
    const order = ['hh', 'mh', 'pole', 'bk', 'dk', 'sk', 'olt'], size = { olt: 11, sk: 8, dk: 7, bk: 5, mh: 4.2, hh: 3, pole: 3.5 }, f = dense ? 0.55 : 1;
    order.forEach(t => d.nodes.filter(x => x.type === t).forEach(x => { o += t === 'olt' ? '<rect x="' + (X(x.ll) - size[t] * f) + '" y="' + (Y(x.ll) - size[t] * f) + '" width="' + (2 * size[t] * f) + '" height="' + (2 * size[t] * f) + '" rx="3" fill="' + NODE_COL[t] + '" stroke="#fff" stroke-width="2"/>' : '<circle cx="' + X(x.ll) + '" cy="' + Y(x.ll) + '" r="' + (size[t] * f) + '" fill="' + NODE_COL[t] + '" stroke="#fff" stroke-width="' + (1.4 * f) + '"/>'; }));
    d.nodes.filter(x => x.type === 'olt' || (x.type === 'sk' && !dense)).forEach(x => { o += '<text x="' + X(x.ll) + '" y="' + (Y(x.ll) - 13) + '" text-anchor="middle" class="lb">' + esc(x.name) + '</text>'; });
    const mPerPx = 111320 / k, nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].filter(v => v / mPerPx <= 190).pop() || 10;
    o += '<g><rect x="18" y="' + (H - 42) + '" width="' + (nice / mPerPx + 20) + '" height="28" rx="6" fill="#fff" opacity="0.92"/><path d="M28 ' + (H - 24) + 'v6h' + (nice / mPerPx) + 'v-6" fill="none" stroke="#111" stroke-width="2"/><text x="' + (28 + nice / mPerPx / 2) + '" y="' + (H - 24) + '" text-anchor="middle" class="sc">' + (nice >= 1000 ? nice / 1000 + ' km' : nice + ' m') + '</text></g>';
    o += '<g transform="translate(' + (W - 36) + ',40)"><circle r="19" fill="#fff" opacity="0.92"/><path d="M0 -13 L6 7 L0 3 L-6 7Z" fill="#ff6a3d"/><text y="17" text-anchor="middle" class="sc">N</text></g>';
    return o + '</svg>';
  };
  const legend = d => '<div class="legend">' + '<span><i class="ln" style="background:#2aa8ff"></i>' + T('أنبوب', 'Duct') + '</span>' + d.cabByGroup.map(g => '<span><i class="ln" style="background:' + CAB_COL[g.name] + '"></i>' + esc(T({ Feeder: 'كبل تغذية', Backbone: 'كبل تغذية', Distribution: 'كبل توزيع', Drop: 'كبل مشترك' }[g.name] || g.name, g.name + ' cable')) + '</span>').join('') + d.nodeByType.map(x => '<span><i style="background:' + NODE_COL[x.type] + '"></i>' + x.name + '</span>').join('') + '</div>';

  // ---------------- the document: fixed A4 pages ----------------
  const MAX_ROWS = 4000; // longer lists are cut, with a note (the CSV / LLD exports hold everything)
  const ROWS = 40;
  const CT = { Feeder: ['تغذية', 'Feeder'], Backbone: ['تغذية', 'Feeder'], Distribution: ['توزيع', 'Distribution'], Drop: ['مشترك', 'Drop'] };
  const cabName = g => T((CT[g] || [g])[0], (CT[g] || [g, g])[1]);
  const nid = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '—'; };
  const f2 = v => ltr(Number(v).toFixed(2));
  const code = s => '<bdi dir="ltr" class="code">' + esc(s) + '</bdi>';
  const dotC = col => '<i class="sw" style="background:' + col + '"></i>';
  const STAT = { ok: ['ok', 'مطابقة', 'OK'], warn: ['warn', 'على الحد', 'Tight'], bad: ['bad', 'تتجاوز', 'Over'], broken: ['bad', 'مقطوعة', 'Broken'], check: ['warn', 'تُراجع', 'Check'], na: ['na', 'لا ينطبق', 'N/A'] };
  const pill = (s, text) => '<span class="pill ' + s + '">' + text + '</span>';
  const st = k => pill(STAT[k][0], T(STAT[k][1], STAT[k][2]));
  const boxStatus = r => !r.reached ? 'broken' : r.budget.status === 'bad' ? 'bad' : r.issues.length ? 'check' : r.budget.status;

  // everything about the signal, from the strand-level fibre engine
  R.signal = function (scope, d) {
    const inS = id => !scope || scope.nodes.has(id), A = FT.fiber.analyze();
    const byName = (a, b) => nid(a.node.id).localeCompare(nid(b.node.id), undefined, { numeric: true });
    const boxes = A.boxes.filter(r => r.node.type === 'bk' && inS(r.node.id)).sort(byName), fed = boxes.filter(r => r.reached);
    const cabs = A.boxes.filter(r => r.node.type !== 'bk' && inS(r.node.id)).sort(byName);
    const subs = A.subs.filter(t => t && inS(t.sub.node)).sort((a, b) => a.sub.name.localeCompare(b.sub.name, undefined, { numeric: true }));
    const stats = k => { const v = fed.map(k); return v.length ? { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, x) => a + x, 0) / v.length } : null; };
    const count = { ok: 0, warn: 0, bad: 0, broken: 0, check: 0 }; boxes.forEach(r => count[boxStatus(r)]++);
    // PON ports with what hangs on each
    const pon = new Map(); A.boxes.filter(r => r.reached && inS(r.node.id)).forEach(r => { const k = r.olt + ':' + r.port, g = pon.get(k) || { olt: r.olt, port: r.port, boxes: 0, outputs: 0, onus: 0, worst: null }; if (r.node.type === 'bk') { g.boxes++; g.outputs += r.splitter.n; g.onus += r.onus; if (r.budget && (g.worst == null || r.budget.down.rx < g.worst)) g.worst = r.budget.down.rx; } pon.set(k, g); });
    const joins = []; Object.values(FT.state.nodes).filter(n => inS(n.id)).sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name), undefined, { numeric: true })).forEach(n => FT.fiber.links(n.id).forEach(l => joins.push({ node: n, a: l.a, b: l.b })));
    return { A, boxes, fed, cabs, subs, count, pon: [...pon.values()].sort((a, b) => nid(a.olt).localeCompare(nid(b.olt)) || a.port - b.port), joins, rxD: stats(r => r.budget.down.rx), rxU: stats(r => r.budget.up.rx), loss: stats(r => r.budget.worstLoss), margin: stats(r => Math.min(r.budget.lossMargin, r.budget.sensMargin)) };
  };

  // ---- assets: our element pictures, in their own colours ----
  function icons() {
    const o = {}; ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole', 'splice', 'sub'].forEach(t => o[t] = FT.map.iconDataURL(t, 96));
    o.house = FT.houses.draw(2, 4).toDataURL(); return o;
  }
  const img = (src, size, cls) => '<img class="' + (cls || 'ic') + '" src="' + src + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain" alt=""/>';

  // ---- building blocks ----
  function paged(title, cols, rows, opt) { // a long table over as many pages as it needs
    opt = opt || {}; const per = opt.per || ROWS, all = rows.length, cut = rows.slice(0, MAX_ROWS), out = [];
    const tw = cols.reduce((a, c) => a + c[1], 0);
    const head = '<colgroup>' + cols.map(c => '<col style="width:' + (c[1] / tw * 100).toFixed(2) + '%"/>').join('') + '</colgroup><thead><tr>' + cols.map(c => '<th>' + c[0] + '</th>').join('') + '</tr></thead>';
    let first = true, i = 0;
    do {
      const room = first && opt.firstPer ? opt.firstPer : per, part = cut.slice(i, i + room); i += room;
      out.push((first && opt.intro ? opt.intro : '') + (part.length ? '<table class="grid">' + head + '<tbody>' + part.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '<p class="muted">' + (opt.empty || '—') + '</p>') + (i >= cut.length && all > MAX_ROWS ? '<p class="note">' + T('عُرض أول ' + MAX_ROWS + ' سطر من ' + all + '. القائمة الكاملة بملفات CSV و LLD.', 'First ' + MAX_ROWS + ' of ' + all + ' rows; the CSV / LLD files hold all of them.') + '</p>' : ''));
      first = false;
    } while (i < cut.length);
    return out.map((h, k) => ({ title: title + (out.length > 1 ? ' (' + (k + 1) + '/' + out.length + ')' : ''), html: h }));
  }
  const card = (v, l, color, ic) => '<div class="kpi" style="border-top-color:' + color + '">' + (ic ? img(ic, 30, 'kic') : '') + '<b>' + v + '</b><span>' + l + '</span></div>';

  function rxChart(fed) { // how strong the signal arrives, box by box
    if (!fed.length) return '<p class="muted">—</p>';
    const C = FT.fiber.cfg(), v = fed.map(r => r.budget.down.rx), lo = Math.min(Math.floor(Math.min(...v)) - 1, C.onuSens - 1), hi = Math.ceil(Math.max(...v)) + 1, step = Math.max(1, Math.ceil((hi - lo) / 18)), n = Math.ceil((hi - lo) / step), bins = new Array(n).fill(0);
    v.forEach(x => bins[Math.min(n - 1, Math.max(0, Math.floor((x - lo) / step)))]++);
    const W = 720, H = 200, pad = 30, bw = (W - 2 * pad) / n, max = Math.max(...bins), X = x => pad + (x - lo) / (n * step) * (W - 2 * pad);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="hist" direction="ltr">';
    bins.forEach((b, i) => { const h = b / max * (H - 66), from = lo + i * step, col = from < C.onuSens ? '#d64550' : from < C.onuSens + C.warnMargin ? '#d99a00' : '#17a86b'; s += '<rect x="' + (pad + i * bw + 2) + '" y="' + (H - 30 - h) + '" width="' + (bw - 4) + '" height="' + h + '" rx="3" fill="' + col + '"/>' + (b ? '<text x="' + (pad + i * bw + bw / 2) + '" y="' + (H - 35 - h) + '" text-anchor="middle">' + b + '</text>' : '') + '<text x="' + (pad + i * bw) + '" y="' + (H - 13) + '" text-anchor="middle" class="ax">' + from + '</text>'; });
    s += '<text x="' + (W - pad) + '" y="' + (H - 13) + '" text-anchor="middle" class="ax">' + (lo + n * step) + ' dBm</text><line x1="' + X(C.onuSens) + '" x2="' + X(C.onuSens) + '" y1="16" y2="' + (H - 30) + '" stroke="#d64550" stroke-width="2" stroke-dasharray="5 4"/><text x="' + X(C.onuSens) + '" y="12" text-anchor="middle" fill="#d64550">' + C.onuSens + ' dBm</text>';
    return s + '</svg>';
  }

  // the signal level after every element, from the OLT to the output of one box (downstream)
  function walkRows(r) {
    const C = FT.fiber.cfg(), rows = []; let loss = 0;
    const add = (what, where, metres, db) => { loss += db; rows.push([ltr(rows.length + 1), what, where, metres == null ? '—' : ltr(num(metres, 0) + ' m'), f2(db), f2(loss), '<b>' + f2(C.oltTx - loss) + '</b>']); };
    add(T('موصل عند الـ OLT', 'Connector at the OLT'), code(nid(r.olt)) + ' · PON ' + ltr(r.port), null, C.connector);
    r.steps.slice().reverse().forEach(s => {
      if (s.type === 'strand') { const c = FT.state.cables[s.cable]; add(dotC(FT.fiber.strandColor(c, s.f).hex) + esc(cabName(cabGroup(c))) + ' ' + ltr(esc(FT.fiber.strandName(c, s.f))), code(nid(s.from)) + ' ← ' + code(nid(s.to)), s.len, s.len / 1000 * C.att1490); }
      else if (s.type === 'fusion') add(T('لحام', 'Fusion'), code(nid(s.node)), null, C.fusion);
      else if (s.type === 'splitter') add(T('مقسّم ', 'Splitter ') + ltr(s.ratio), code(nid(s.node)) + ' · ' + T('مخرج ', 'out ') + ltr(s.port), null, FT.fiber.splitterLoss(s.ratio));
    });
    add(T('مقسّم العلبة ', 'Box splitter ') + ltr(r.splitter.ratio), code(nid(r.node.id)), null, FT.fiber.splitterLoss(r.splitter.ratio));
    if (r.budget.dropM) add(T('كبل المشترك (طول مفترض)', 'Drop (assumed length)'), T('إلى المشترك', 'to the subscriber'), r.budget.dropM, r.budget.dropM / 1000 * C.att1490);
    for (let i = 1; i < C.connectors; i++) add(T('موصل عند المشترك', 'Connector at the subscriber'), T('جهاز المشترك', 'ONU'), null, C.connector);
    return rows;
  }

  R.sections = function (scope, ring) {
    const d = R.data(scope, ring), g = R.signal(scope, d), S = FT.state, C = FT.fiber.cfg(), IC = icons(), priced = FT.hasPrices(), L = C.maxLoss;
    const count = t => (d.nodeByType.find(x => x.type === t) || { n: 0 }).n;
    const houses = ring && FT.map.buildingsInRing ? FT.map.buildingsInRing(ring).length : FT.map.housesData().length;
    const onus = g.subs.length, outputs = g.boxes.reduce((a, r) => a + r.splitter.n, 0);
    const broken = g.count.broken, over = g.count.bad, tight = g.count.warn + g.count.check, socN = d.soc.items.filter(i => i.status !== 'na').length;
    const verdict = !g.boxes.length ? ['na', T('لا توجد علب FDB ضمن النطاق بعد', 'No FDB boxes in this scope yet')] : (broken || over) ? ['bad', T('الشبكة تحتاج تصحيح قبل التنفيذ', 'The network needs fixing before building')] : (tight || d.soc.bad) ? ['warn', T('الشبكة صالحة مع نقاط تحتاج مراجعة', 'Usable, with points to review')] : ['ok', T('الشبكة موصولة بالكامل وضمن حدود الإشارة', 'Fully connected and within the signal limits')];
    const out = [];
    const sec = (name, pages) => out.push({ name, pages });

    // 1 summary
    const say = [];
    say.push(T('تغطي الشبكة ' + g.boxes.length + ' علبة توزيع (FDB) عبر ' + count('sk') + ' خزانة (FDC) ومقسم مركزي (OLT) عدد ' + count('olt') + '.', 'The network has ' + g.boxes.length + ' FDB boxes behind ' + count('sk') + ' FDC cabinets and ' + count('olt') + ' OLT.'));
    if (g.rxD) say.push(T('أضعف إشارة تصل إلى مشترك: ' + g.rxD.min.toFixed(2) + ' dBm (النزول)، وأقل هامش أمان ' + g.margin.min.toFixed(2) + ' dB. أكبر فقد ' + g.loss.max.toFixed(2) + ' dB من أصل ' + L + ' dB مسموحة.', 'Weakest downstream signal: ' + g.rxD.min.toFixed(2) + ' dBm; smallest safety margin ' + g.margin.min.toFixed(2) + ' dB; largest loss ' + g.loss.max.toFixed(2) + ' of ' + L + ' dB.'));
    say.push(broken ? T(broken + ' علبة غير موصولة بالكامل حتى الـ OLT.', broken + ' box(es) are not connected all the way to the OLT.') : T('كل العلب موصولة شعرة بشعرة حتى الـ OLT.', 'Every box is connected strand by strand to the OLT.'));
    if (over) say.push(T(over + ' علبة تتجاوز حد الفقد أو حساسية المستقبل.', over + ' box(es) exceed the loss limit or the receiver sensitivity.'));
    say.push(T('المخارج المتاحة للمشتركين ' + outputs + '، المربوط منها ' + onus + (outputs ? ' (' + Math.round(onus / outputs * 100) + '%)' : '') + '.', outputs + ' subscriber outputs, ' + onus + ' connected.'));
    sec(T('الملخص التنفيذي', 'Executive summary'), [{ title: T('الملخص التنفيذي', 'Executive summary'), html:
      '<div class="verdict ' + verdict[0] + '"><b>' + verdict[1] + '</b></div>' +
      '<div class="kpis">' + card(ltr(num(count('olt'))), 'OLT', '#17a86b', IC.olt) + card(ltr(num(count('sk') + count('dk'))), T('خزائن FDC / iFDC', 'Cabinets'), '#ff8a3d', IC.sk) + card(ltr(num(count('bk'))), T('علب FDB', 'FDB boxes'), '#ff4f7a', IC.bk) + card(ltr(num(houses)), T('بيوت في النطاق', 'Houses in scope'), '#ff6a3d', IC.house) +
      card(ltr(num(onus)), T('مشتركون مربوطون', 'Subscribers'), '#2aa8ff', IC.sub) + card(ltr(num(count('mh') + count('hh'))), T('مناهل وغرف تفتيش', 'Chambers'), '#6b7280', IC.mh) + card(ltr(len(d.pipeM)), T('مسارات الأنابيب', 'Duct routes'), '#2aa8ff') + card(ltr(len(d.cableM)), T('أطوال الكابلات', 'Cable length'), '#9d5cf0') +
      card(g.rxD ? ltr(g.rxD.min.toFixed(1) + ' dBm') : '—', T('أضعف إشارة (نزول)', 'Weakest signal (down)'), '#0f766e') + card(g.loss ? ltr(g.loss.max.toFixed(1) + ' dB') : '—', T('أكبر فقد (الحد ' + L + ')', 'Largest loss (limit ' + L + ')'), g.loss && g.loss.max > L ? '#d64550' : '#17a86b') + card(ltr(d.soc.ok + ' / ' + socN), T('بنود مطابقة للمواصفة', 'Specification checks passed'), d.soc.bad ? '#d64550' : '#17a86b') + card(priced ? ltr(money(d.cost.total)) : '—', T('الكلفة التقديرية', 'Estimated cost'), '#ff6a3d') + '</div>' +
      '<h3>' + T('خلاصة النتائج', 'Findings') + '</h3><ul class="say">' + say.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
      (g.boxes.length ? '<h3>' + T('حالة العلب', 'Box status') + '</h3>' + donut([['ok', '#17a86b', T('مطابقة', 'OK')], ['warn', '#d99a00', T('على الحد', 'Tight')], ['check', '#eab308', T('تُراجع', 'Check')], ['bad', '#d64550', T('تتجاوز', 'Over')], ['broken', '#7f1d1d', T('مقطوعة', 'Broken')]].map(x => ({ k: x[2], v: g.count[x[0]], c: x[1] })).filter(x => x.v), v => num(v), num(g.boxes.length)) : '') }]);

    // 2 map
    const map = R.mapSvg(d, ring);
    if (map) { const vb = /viewBox="0 0 1000 (\d+)"/.exec(map), h = vb ? +vb[1] : 700, w = Math.min(722, Math.floor(800 * 1000 / h)); sec(T('خريطة الشبكة', 'Network map'), [{ title: T('خريطة الشبكة', 'Network map'), html: '<div class="mapbox" style="width:' + w + 'px">' + map.replace('class="map"', 'class="map" width="' + w + '" height="' + Math.round(w * h / 1000) + '"') + '</div><div class="legend">' + '<span><i class="ln" style="background:#2aa8ff"></i>' + T('أنبوب', 'Duct') + '</span>' + d.cabByGroup.map(x => '<span><i class="ln" style="background:' + CAB_COL[x.name] + '"></i>' + T('كبل ', '') + cabName(x.name) + '</span>').join('') + d.nodeByType.map(x => '<span>' + img(IC[x.type], 16) + x.name + '</span>').join('') + '</div>' }]); }

    // 3 elements
    const ROLE = { olt: ['المقسم المركزي: منه تبدأ منافذ PON', 'Central office: PON ports start here'], sk: ['خزانة التوزيع: مقسّمات المرحلة الأولى', 'Cabinet: first-stage splitters'], dk: ['خزانة وسيطة', 'Intermediate cabinet'], bk: ['علبة المبنى: مقسّم المرحلة الثانية', 'Building box: second-stage splitter'], mh: ['منهل رئيسي على المسار', 'Main manhole'], hh: ['غرفة تفتيش صغيرة', 'Handhole'], pole: ['نقطة تعليق على جدار', 'Wall anchor'] };
    sec(T('عناصر الشبكة', 'Network elements'), [{ title: T('عناصر الشبكة', 'Network elements'), html:
      '<table class="grid tall"><colgroup><col style="width:8%"/><col style="width:30%"/><col style="width:50%"/><col style="width:12%"/></colgroup><thead><tr><th></th><th>' + T('العنصر', 'Element') + '</th><th>' + T('وظيفته', 'Role') + '</th><th>' + T('العدد', 'Count') + '</th></tr></thead><tbody>' +
      d.nodeByType.map(x => '<tr><td>' + img(IC[x.type], 28) + '</td><td class="wrap"><b>' + esc(x.full) + '</b></td><td class="wrap">' + T((ROLE[x.type] || ['', ''])[0], (ROLE[x.type] || ['', ''])[1]) + '</td><td><b class="big">' + ltr(num(x.n)) + '</b></td></tr>').join('') +
      '<tr><td>' + img(IC.house, 28) + '</td><td><b>' + T('البيوت', 'Houses') + '</b></td><td class="wrap">' + T('لوغو البيت هو وحدة العمل: رقمه وطوابقه وعلبته', 'The house icon: number, floors, serving box') + '</td><td><b class="big">' + ltr(num(houses)) + '</b></td></tr>' +
      '<tr><td>' + img(IC.sub, 28) + '</td><td><b>' + T('المشتركون (ONU)', 'Subscribers (ONU)') + '</b></td><td class="wrap">' + T('أجهزة مربوطة على منافذ المقسّمات', 'Units on splitter ports') + '</td><td><b class="big">' + ltr(num(onus)) + '</b></td></tr></tbody></table>' +
      '<h3>' + T('المقسّمات الضوئية', 'Optical splitters') + '</h3>' + (d.splitters.length ? '<table class="grid"><thead><tr><th>' + T('النسبة', 'Ratio') + '</th><th>' + T('العدد', 'Count') + '</th><th>' + T('فقد المقسّم الواحد', 'Loss each') + '</th><th>' + T('مجموع المخارج', 'Outputs') + '</th></tr></thead><tbody>' + d.splitters.map(x => '<tr><td><span class="ratio">' + ltr(x.name) + '</span></td><td>' + ltr(num(x.n)) + '</td><td>' + ltr(FT.fiber.splitterLoss(x.name) + ' dB') + '</td><td>' + ltr(num(x.n * FT.fiber.ratioN(x.name))) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">—</p>') }]);

    // 4 cables and ducts
    sec(T('الكابلات والأنابيب', 'Cables and ducts'), [{ title: T('الكابلات والأنابيب', 'Cables and ducts'), html:
      '<h3>' + T('طول الكابلات حسب الوظيفة', 'Cable length by role') + '</h3>' + donut(d.cabByGroup.map(x => ({ k: cabName(x.name), v: x.len, c: CAB_COL[x.name] })), len, len(d.cableM)) +
      '<h3>' + T('الكابلات حسب النوع', 'Cables by type') + '</h3><table class="grid"><thead><tr><th>' + T('نوع الكبل', 'Cable type') + '</th><th>' + T('العدد', 'Count') + '</th><th>' + T('الطول', 'Length') + '</th><th>' + T('ليف·كم', 'Fibre·km') + '</th></tr></thead><tbody>' + d.cabByType.slice(0, 12).map(x => '<tr><td class="wrap">' + dotC(CAB_COL[cabGroup(x.items[0])] || '#999') + ltr(esc(x.name)) + '</td><td>' + ltr(num(x.n)) + '</td><td>' + ltr(len(x.len)) + '</td><td>' + ltr(num(x.items.reduce((a, c) => a + FT.cableLength(c) / 1000 * (c.core || 0), 0), 1)) + '</td></tr>').join('') + '</tbody></table>' +
      '<h3>' + T('الأنابيب ومسارات الحفر', 'Ducts and trenches') + '</h3>' + (d.pipByType.length ? '<table class="grid"><thead><tr><th>' + T('نوع الأنبوب', 'Duct type') + '</th><th>' + T('القطع', 'Runs') + '</th><th>' + T('الطول', 'Length') + '</th><th>' + T('متوسط القطعة', 'Average run') + '</th></tr></thead><tbody>' + d.pipByType.slice(0, 10).map(x => '<tr><td class="wrap">' + dotC('#2aa8ff') + ltr(esc(x.name)) + '</td><td>' + ltr(num(x.n)) + '</td><td>' + ltr(len(x.len)) + '</td><td>' + ltr(len(x.len / x.n)) + '</td></tr>').join('') + '</tbody></table><p class="muted">' + T('طول مسارات الحفر الفعلي: ', 'Trench route length: ') + ltr(len(d.pipeM)) + ' · ' + T('وصلات علب خارجية: ', 'Outdoor closures: ') + ltr(num(d.splices)) + '</p>' : '<p class="muted">' + T('لا أنابيب (تمديد هوائي أو لم تُرسم بعد).', 'No ducts (aerial, or not drawn yet).') + '</p>') }]);

    // 5 signal quality
    const sgRow = (label, o, unit) => o ? '<tr><td>' + label + '</td><td>' + ltr(o.max.toFixed(2) + ' ' + unit) + '</td><td>' + ltr(o.avg.toFixed(2) + ' ' + unit) + '</td><td>' + ltr(o.min.toFixed(2) + ' ' + unit) + '</td></tr>' : '';
    const worst = g.fed.slice().sort((a, b) => a.budget.down.rx - b.budget.down.rx);
    sec(T('جودة الإشارة', 'Signal quality'), [{ title: T('جودة الإشارة', 'Signal quality'), html:
      (g.rxD ? '<table class="grid"><thead><tr><th>' + T('المقياس (عند مخرج العلبة)', 'Measure (at the box output)') + '</th><th>' + T('الأعلى', 'Highest') + '</th><th>' + T('المتوسط', 'Average') + '</th><th>' + T('الأدنى', 'Lowest') + '</th></tr></thead><tbody>' + sgRow(T('قوة الإشارة نزولاً 1490', 'Downstream signal 1490'), g.rxD, 'dBm') + sgRow(T('قوة الإشارة صعوداً 1310', 'Upstream signal 1310'), g.rxU, 'dBm') + sgRow(T('الفقد الكلي (الاتجاه الأضعف)', 'Total loss (weaker direction)'), g.loss, 'dB') + sgRow(T('هامش الأمان', 'Safety margin'), g.margin, 'dB') + '</tbody></table>' : '<p class="muted">' + T('لا توجد علب موصولة بالـ OLT.', 'No box connected to an OLT.') + '</p>') +
      '<h3>' + T('توزع قوة الإشارة نزولاً (dBm) على العلب', 'Downstream signal across boxes (dBm)') + '</h3>' + rxChart(g.fed) + '<h3>' + T('توزع الفقد الكلي (dB) على العلب', 'Total loss across boxes (dB)') + '</h3>' + lossChart(g.fed.map(r => ({ loss: r.budget.worstLoss }))) +
      '<h3>' + T('أضعف 8 علب إشارة', '8 weakest boxes') + '</h3><table class="grid"><colgroup><col style="width:34%"/><col style="width:7%"/><col style="width:12%"/><col style="width:18%"/><col style="width:17%"/><col style="width:12%"/></colgroup><thead><tr><th>' + T('العلبة', 'Box') + '</th><th>PON</th><th>' + T('الليف', 'Fibre') + '</th><th>' + T('الإشارة ↓', 'Signal ↓') + '</th><th>' + T('هامش الأمان', 'Margin') + '</th><th>' + T('الحالة', 'Status') + '</th></tr></thead><tbody>' + worst.slice(0, 8).map(r => '<tr><td>' + code(nid(r.node.id)) + '</td><td>' + ltr(r.port) + '</td><td>' + ltr(num(r.budget.fibreM) + ' m') + '</td><td><b>' + ltr(r.budget.down.rx.toFixed(2) + ' dBm') + '</b></td><td>' + ltr(Math.min(r.budget.lossMargin, r.budget.sensMargin).toFixed(2) + ' dB') + '</td><td>' + st(boxStatus(r)) + '</td></tr>').join('') + '</tbody></table>' }]);

    // 6 signal at every box
    sec(T('قوة الإشارة لكل علبة', 'Signal at every box'), paged(T('قوة الإشارة لكل علبة', 'Signal at every box'),
      [[T('رمز العلبة', 'Box'), 25], [T('المقسّم', 'Split.'), 7], ['OLT · PON', 11], [T('الليف م', 'Fibre m'), 7], [T('فقد ↓', 'Loss ↓'), 7], [T('إشارة ↓', 'Rx ↓'), 8], [T('هامش ↓', 'Marg. ↓'), 8], [T('فقد ↑', 'Loss ↑'), 7], [T('إشارة ↑', 'Rx ↑'), 8], [T('هامش ↑', 'Marg. ↑'), 8], [T('الحالة', 'Status'), 10]],
      g.boxes.map(r => { const b = r.budget; return [code(nid(r.node.id)), ltr(r.splitter.ratio), r.reached ? ltr(esc(nid(r.olt)) + ' · ' + r.port) : '—', b ? ltr(num(b.fibreM)) : '—', b ? f2(b.down.total) : '—', b ? '<b>' + f2(b.down.rx) + '</b>' : '—', b ? f2(b.down.margin) : '—', b ? f2(b.up.total) : '—', b ? '<b>' + f2(b.up.rx) + '</b>' : '—', b ? f2(b.up.margin) : '—', st(boxStatus(r))]; }),
      { per: 40, firstPer: 38, intro: '<p class="muted">' + T('القيم عند مخرج مقسّم العلبة مع كبل مشترك مفترض ' + C.dropM + ' م. الإشارة بوحدة dBm والفقد والهامش بوحدة dB. السهم ↓ نزول 1490 نانومتر و ↑ صعود 1310.', 'At the box splitter output with an assumed ' + C.dropM + ' m drop. Signal in dBm, loss and margin in dB. ↓ 1490 nm, ↑ 1310 nm.') + '</p>' }));

    // 7 where the loss comes from
    sec(T('تفصيل الفقد لكل علبة', 'Loss breakdown per box'), paged(T('تفصيل الفقد بند بند (نزول 1490)', 'Loss item by item (downstream)'),
      [[T('رمز العلبة', 'Box'), 28], [T('ألياف dB', 'Fibre dB'), 10], [T('لحامات', 'Fusions'), 8], [T('لحام dB', 'Fusion dB'), 10], [T('موصلات dB', 'Connect. dB'), 11], [T('المقسّمات', 'Splitters'), 15], [T('مقسّمات dB', 'Splitter dB'), 11], [T('المجموع dB', 'Total dB'), 10]],
      g.fed.map(r => { const b = r.budget; return [code(nid(r.node.id)), f2(b.down.fibre), ltr(b.fusions), f2(b.down.splice), f2(b.down.connector), ltr(b.ratios.join(' + ')), f2(b.down.splitter), '<b>' + f2(b.down.total) + '</b>']; }), { empty: T('لا توجد علب موصولة.', 'No connected box.') }));

    // 8 step by step on the weakest paths
    if (worst.length) sec(T('مسار الإشارة خطوة بخطوة', 'Signal path step by step'), [].concat(...worst.slice(0, 3).map((r, k) => paged(T('مسار الإشارة خطوة بخطوة — أضعف علبة رقم ' + (k + 1), 'Signal path step by step — weakest box ' + (k + 1)),
      [['#', 4], [T('العنصر', 'Element'), 29], [T('الموقع', 'Where'), 33], [T('الطول', 'Length'), 9], [T('فقده', 'Its loss'), 8], [T('التراكمي', 'Total'), 8], [T('الإشارة dBm', 'Signal dBm'), 11]], walkRows(r),
      { per: 36, firstPer: 34, intro: '<div class="path-head">' + img(IC.bk, 26) + '<b>' + code(nid(r.node.id)) + '</b> ' + st(boxStatus(r)) + '<span>' + T('تبدأ الإشارة من الـ OLT بقدرة ' + C.oltTx + ' dBm وتصل ' + r.budget.down.rx.toFixed(2) + ' dBm', 'From ' + C.oltTx + ' dBm at the OLT to ' + r.budget.down.rx.toFixed(2) + ' dBm') + '</span></div>' }))));

    // 9 PON ports
    sec(T('منافذ PON', 'PON ports'), paged(T('منافذ PON', 'PON ports'), [['OLT', 16], ['PON', 8], [T('علب FDB', 'FDB boxes'), 12], [T('مخارج المشتركين', 'Outputs'), 14], [T('مشتركون', 'Subscribers'), 12], [T('نسبة الاستخدام', 'Used'), 24], [T('أضعف إشارة ↓', 'Weakest ↓'), 14]],
      g.pon.map(x => { const u = x.outputs ? x.onus / x.outputs * 100 : 0; return [code(nid(x.olt)), '<b>' + ltr(x.port) + '</b>', ltr(x.boxes), ltr(x.outputs), ltr(x.onus), '<span class="use"><i style="width:' + u.toFixed(0) + '%"></i></span><small>' + ltr(Math.round(u) + '%') + '</small>', x.worst == null ? '—' : ltr(x.worst.toFixed(2) + ' dBm')]; }), { empty: T('لا يوجد منفذ PON موصول بعد.', 'No PON port is patched yet.') }));

    // 10 cabinets
    if (g.cabs.length) sec(T('الخزائن ومقسّماتها', 'Cabinets and their splitters'), paged(T('الخزائن ومقسّماتها', 'Cabinets and their splitters'), [[T('الخزانة', 'Cabinet'), 22], [T('المقسّم', 'Splitter'), 12], [T('رقمه', 'No.'), 7], ['OLT · PON', 18], [T('المخارج المستعملة', 'Outputs used'), 17], [T('الإشارة عند مخرجه ↓', 'Output signal ↓'), 14], [T('الحالة', 'Status'), 10]],
      g.cabs.map(r => [code(nid(r.node.id)), ltr(r.splitter.ratio), ltr(r.splitter.i), r.reached ? ltr(esc(nid(r.olt)) + ' · ' + r.port) : '—', ltr(r.spliced + ' / ' + r.splitter.n), r.budget ? ltr(r.budget.down.rx.toFixed(2) + ' dBm') : '—', st(!r.reached ? 'broken' : r.issues.length ? 'check' : 'ok')])));

    // 11 subscribers
    if (g.subs.length) sec(T('المشتركون وقوة إشارتهم', 'Subscribers and their signal'), paged(T('المشتركون وقوة إشارتهم', 'Subscribers and their signal'), [[T('المشترك', 'Subscriber'), 24], [T('العلبة', 'Box'), 22], [T('منفذ', 'Port'), 6], [T('العنوان', 'Address'), 17], [T('رقمه', 'No.'), 7], [T('الليف م', 'Fibre m'), 7], [T('إشارة ↓', 'Rx ↓'), 8], [T('إشارة ↑', 'Rx ↑'), 8], [T('الحالة', 'Status'), 10]],
      g.subs.map(t => [esc(t.sub.name), code(nid(t.sub.node)), ltr(t.sub.port), esc(t.sub.addr || '—'), ltr(esc(t.sub.subno || '—')), t.budget ? ltr(num(t.budget.fibreM + t.budget.dropM)) : '—', t.budget ? '<b>' + f2(t.budget.down.rx) + '</b>' : '—', t.budget ? '<b>' + f2(t.budget.up.rx) + '</b>' : '—', st(!t.reached ? 'broken' : t.budget.status === 'bad' ? 'bad' : t.issues.length ? 'check' : t.budget.status)])));

    // 12 splice plan
    const endHtml = e => { if (!e) return '—'; if (e.t) return T('منهية', 'terminated'); if (e.o != null) return '<b>PON ' + ltr(e.o) + '</b>'; if (e.s != null) { const sp = FT.fiber.splitter(e.s); return T('مقسّم ', 'Splitter ') + ltr((sp ? sp.ratio : '?') + ' #' + String(e.s).split('#').pop()) + ' · ' + (e.p ? T('مخرج ', 'out ') + ltr(e.p) : T('دخل', 'in')); } const c = S.cables[e.c]; return c ? dotC(FT.fiber.strandColor(c, e.f).hex) + ltr(esc(FT.fiber.strandName(c, e.f))) + ' <small>' + esc(c.name) + '</small>' : '?'; };
    if (g.joins.length) sec(T('خطة اللحام', 'Splice plan'), paged(T('خطة اللحام', 'Splice plan'), [[T('العلبة / العقدة', 'Closure'), 24], [T('من', 'From'), 38], [T('إلى', 'To'), 38]], g.joins.map(j => [code(nid(j.node.id)), endHtml(j.a), endHtml(j.b)])));

    // 13 cable schedule
    sec(T('جدول الكابلات', 'Cable schedule'), paged(T('جدول الكابلات واستعمال الألياف', 'Cables and fibre use'), [[T('الكبل', 'Cable'), 34], [T('الوظيفة', 'Role'), 9], [T('ألياف', 'Fibres'), 7], [T('مستعمل', 'Used'), 7], [T('احتياط', 'Spare'), 8], [T('من', 'From'), 15], [T('إلى', 'To'), 15], [T('الطول م', 'Length m'), 8]],
      d.cables.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })).map(c => { let used = 0; for (let f = 1; f <= c.core; f++) if (g.A.ix.used[c.id + ':' + f]) used++; return [dotC(CAB_COL[cabGroup(c)] || '#999') + ltr(esc(c.name)), cabName(cabGroup(c)), ltr(c.core), ltr(used), ltr(Math.round((c.core - used) / c.core * 100) + '%'), code(nid(c.a)), c.sub && S.subs[c.sub] ? esc(S.subs[c.sub].name) : code(nid(c.b)), ltr(num(FT.cableLength(c), 1))]; })));

    // radio devices and links (only when the project has them)
    const devs = Object.values(S.wdev || {}).filter(v => !ring || FT.pointInRing(v.ll, ring));
    if (devs.length) {
      const inD = new Set(devs.map(v => v.id)), links = Object.values(S.wlinks || {}).filter(l => inD.has(l.a) || inD.has(l.b));
      const LOS = { clear: ['ok', 'واضح', 'Clear'], marginal: ['warn', 'ضيق', 'Marginal'], blocked: ['bad', 'محجوب', 'Blocked'], unknown: ['na', 'غير معروف', 'Unknown'] };
      sec(T('الشبكة اللاسلكية', 'Radio network'), paged(T('أجهزة اللاسلكي وإعدادات التركيب', 'Radio devices and installation settings'), [[T('الجهاز', 'Device'), 16], [T('النوع', 'Type'), 8], [T('التردد GHz', 'GHz'), 9], [T('قدرة dBm', 'TX dBm'), 9], [T('ربح dBi', 'Gain dBi'), 9], [T('ارتفاع م', 'Mast m'), 9], [T('الاتجاه °', 'Azimuth °'), 10], [T('الزاوية °', 'Width °'), 9], [T('المدى كم', 'Range km'), 9], [T('الإحداثيات', 'Position'), 22]],
        devs.map(v => { const partner = links.map(l => l.a === v.id ? S.wdev[l.b] : l.b === v.id ? S.wdev[l.a] : null).find(Boolean), ap = v.type === 'ap', p = ap ? FT.cov.params(v) : null, az = ap ? p.az : partner ? FT.cov.bearing(v.ll, partner.ll) : null; return [esc(v.name), v.type.toUpperCase(), ltr(v.freq), ltr(v.txp), ltr(v.gain), ltr(v.h), az == null ? '—' : ltr(Math.round(az)), ap ? ltr(p.bw) : '—', ap ? ltr(FT.cov.rangeKm(v).toFixed(2)) : '—', ltr(v.ll[1].toFixed(5) + ', ' + v.ll[0].toFixed(5))]; }))
        .concat(links.length ? paged(T('وصلات اللاسلكي', 'Radio links'), [[T('الوصلة', 'Link'), 14], [T('من ← إلى', 'From → to'), 28], [T('المسافة', 'Distance'), 12], [T('الإشارة', 'Signal'), 12], [T('هامش الخفوت', 'Fade margin'), 12], [T('نصف قطر Fresnel', 'Fresnel r1'), 12], [T('خط الرؤية', 'Line of sight'), 10]],
          links.map(l => { const an = FT.wl.cache[l.id], a = S.wdev[l.a], b = S.wdev[l.b], v = an ? LOS[an.status] : null; return [esc(l.name), ltr(esc((a ? a.name : '?') + ' → ' + (b ? b.name : '?'))), an ? ltr(an.dKm.toFixed(2) + ' km') : '—', an ? '<b>' + ltr(an.rx.toFixed(1) + ' dBm') + '</b>' : '—', an ? ltr(an.fade.toFixed(1) + ' dB') : '—', an ? ltr(an.r1mid.toFixed(1) + ' m') : '—', v ? pill(v[0], T(v[1], v[2])) : '—']; })) : []));
    }

    // 14 bill of materials
    const kinds = { cable: T('كابلات', 'Cables'), pipe: T('أنابيب', 'Ducts'), node: T('علب وغرف', 'Boxes and chambers'), splitter: T('مقسّمات', 'Splitters'), splice: T('علب لحام', 'Closures'), wdev: T('لاسلكي', 'Radio'), labour: T('أجور تركيب', 'Installation') };
    const byKind = Object.keys(kinds).map((k, i) => ({ k: kinds[k], v: d.cost.lines.filter(x => x.kind === k).reduce((a, x) => a + x.total, 0), c: PAL[i] })).filter(x => x.v > 0);
    const cur = FT.CURRENCIES[FT.cur()], rate = FT.cur() === 'USD' ? '' : ' · ' + T('سعر الصرف المستعمل: 1 دولار = ' + FT.rate(FT.cur()) + ' ' + cur.ar, 'rate used: 1 USD = ' + FT.rate(FT.cur()) + ' ' + cur.code);
    sec(T('الكميات والكلفة', 'Quantities and cost'), paged(T('جدول الكميات والكلفة', 'Bill of materials and cost'), [[T('النوع', 'Type'), 14], [T('البند', 'Item'), 42], [T('الكمية', 'Quantity'), 14]].concat(priced ? [[T('سعر الوحدة', 'Unit price'), 15], [T('الإجمالي', 'Total'), 15]] : []),
      d.cost.lines.map(r => [kinds[r.kind] || r.kind, ltr(esc(r.name)), ltr(r.unit === 'm' ? num(r.qty, 1) + ' m' : num(r.qty))].concat(priced ? [ltr(money(r.price) + (r.unit === 'm' ? ' /m' : '')), '<b>' + ltr(money(r.total)) + '</b>'] : [])).concat(priced ? [['', '<b>' + T('الإجمالي الكلي', 'Grand total') + '</b>', ''].concat(['', '<b class="big">' + ltr(money(d.cost.total)) + '</b>'])] : []),
      { per: 34, firstPer: priced && byKind.length ? 22 : 34, intro: '<p class="muted">' + T('العملة: ', 'Currency: ') + T(cur.ar, cur.en) + rate + '</p>' + (priced && byKind.length ? donut(byKind, money, money(d.cost.total)) : '<p class="note">' + T('لم تُدخل الأسعار، فالجدول يعرض الكميات فقط.', 'No prices entered: quantities only.') + '</p>') }));

    // 15 specification check
    const soc = { ok: ['ok', T('مطابق', 'Compliant')], bad: ['bad', T('غير مطابق', 'Not compliant')], warn: ['warn', T('تنبيه', 'Warning')], na: ['na', T('لا ينطبق', 'N/A')] };
    sec(T('المطابقة للمواصفة', 'Specification check'), [{ title: T('فحص المطابقة لمواصفات السورية للاتصالات', 'Syrian Telecom specification check'), html: (scope ? '<p class="note">' + T('هذا الفحص يخص المشروع كاملاً لأن مسارات الألياف تمتد خارج المنطقة المحددة.', 'This check covers the whole project, because fibre paths run beyond the selected area.') + '</p>' : '') + '<div class="socbar"><i style="flex:' + d.soc.ok + ';background:#17a86b"></i><i style="flex:' + d.soc.warn + ';background:#d99a00"></i><i style="flex:' + d.soc.bad + ';background:#d64550"></i></div><table class="grid soc"><colgroup><col style="width:46%"/><col style="width:40%"/><col style="width:14%"/></colgroup><thead><tr><th>' + T('البند', 'Requirement') + '</th><th>' + T('التفاصيل', 'Detail') + '</th><th>' + T('النتيجة', 'Result') + '</th></tr></thead><tbody>' + d.soc.items.map(i => '<tr><td class="wrap"><b>' + esc(ar() ? i.ar : i.en) + '</b></td><td class="wrap">' + esc(i.detail) + '</td><td>' + pill(soc[i.status][0], soc[i.status][1]) + '</td></tr>').join('') + '</tbody></table>' }]);

    // 16 values and notes
    sec(T('قيم الحساب والملاحظات', 'Planning values and notes'), [{ title: T('قيم الحساب والملاحظات', 'Planning values and notes'), html: '<table class="grid tall"><colgroup><col style="width:48%"/><col style="width:14%"/><col style="width:38%"/></colgroup><thead><tr><th>' + T('القيمة', 'Value') + '</th><th></th><th>' + T('مصدرها', 'Source') + '</th></tr></thead><tbody>' + FT.fui.ASSUME.map(a => '<tr><td>' + esc(ar() ? a[1] : a[2]) + '</td><td><b>' + ltr(C[a[0]]) + '</b></td><td class="wrap">' + esc(ar() ? a[3] : a[4]) + (FT.state.cfg && FT.state.cfg.budget && FT.state.cfg.budget[a[0]] != null ? ' · <b>' + T('معدّلة بالمشروع', 'edited in this project') + '</b>' : '') + '</td></tr>').join('') + '</tbody></table><h3>' + T('ملاحظات', 'Notes') + '</h3><ul class="say"><li>' + T('تقدير تخطيطي مبني على الرسم، ويلزم التحقق الميداني وقياس OTDR قبل الاستلام.', 'A planning estimate; verify on site and with OTDR before acceptance.') + '</li><li>' + T('قيم قدرة الإرسال وحساسية المستقبل قيم تخطيطية للصنف B+ وتُعتمد من نشرات الأجهزة والجهة المالكة.', 'Transmit power and sensitivity are class B+ planning values; confirm with the equipment data sheets.') + '</li>' + (scope ? '<li>' + T('الأنبوب أو الكبل الذي يمر جزء منه داخل المنطقة محسوب بطوله الكامل.', 'A duct or cable partly inside the area is counted with its full length.') + '</li>' : '') + '<li>' + T('خلفية المباني من بيانات الخريطة المحمّلة وقت إنشاء التقرير (Microsoft, OpenStreetMap).', 'Building outlines from the loaded map data (Microsoft, OpenStreetMap).') + '</li></ul>' }]);

    return { out, d, g, verdict, IC, count, houses, onus };
  };

  const CSS = `
:root{color-scheme:only light;forced-color-adjust:none}
*{box-sizing:border-box;margin:0;padding:0;forced-color-adjust:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:794px;height:1123px;overflow:hidden;position:relative;background:#ffffff;color:#161b26;font-family:'RPlex','IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;font-size:11.5px;line-height:1.5}
.top{height:58px;padding:0 36px;display:flex;align-items:center;justify-content:space-between;background:#0e1117;color:#fff;border-bottom:4px solid #ff6a3d}
.top h2{font-size:15.5px;font-weight:700}.top .prj{font-size:11px;color:#aab2c5;text-align:end}
.top .brand{display:flex;gap:10px;align-items:center}.top .brand img{height:24px}
.body{padding:20px 36px 0}
.foot{position:absolute;left:36px;right:36px;bottom:16px;border-top:1px solid #dfe3ec;padding-top:6px;display:flex;justify-content:space-between;color:#7a8398;font-size:9.5px}
h3{font-size:13px;color:#b9431c;margin:14px 0 7px;border-inline-start:4px solid #ff6a3d;padding-inline-start:8px}
.muted{color:#687187;font-size:10.5px;margin:4px 0 8px}.note{background:#fff4ee;border:1px solid #ffd2c2;border-radius:8px;padding:6px 10px;color:#8a3a20;margin:8px 0}
bdi{unicode-bidi:isolate}.code{font-size:.93em}
table.grid{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.6px}
table.grid th{background:#1a2030;color:#fff;font-weight:700;text-align:start;padding:5px 5px;font-size:9.4px;border-bottom:2px solid #ff6a3d;overflow:hidden}
table.grid td{padding:0 5px;height:21.5px;border-bottom:1px solid #e6e9f1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}
table.grid tbody tr:nth-child(even){background:#f6f7fb}
table.grid td.wrap{white-space:normal;line-height:1.4;padding-block:4px;height:auto}
table.grid.tall td{height:34px;font-size:11px}table.grid.soc td{font-size:10px}
table.grid small{color:#7a8398;font-size:8.6px}
.big{font-size:14px}
.sw{display:inline-block;width:9px;height:9px;border-radius:50%;margin-inline-end:5px;border:1px solid rgba(0,0,0,.25);vertical-align:-1px}
.pill{display:inline-block;padding:0 8px;border-radius:20px;font-weight:700;font-size:9px;line-height:15px;white-space:nowrap}
.pill.ok{background:#d9f4e6;color:#0b7447}.pill.warn{background:#ffedc7;color:#805300}.pill.bad{background:#fddcde;color:#a81f27}.pill.na{background:#eceef3;color:#667089}
.ratio{display:inline-block;background:#0e1117;color:#fff;border:1.5px solid #ff6a3d;border-radius:5px;padding:0 8px;font-weight:700}
.verdict{border-radius:10px;padding:12px 16px;font-size:15px;margin-bottom:12px;border:1.5px solid}
.verdict.ok{background:#e8f8f0;border-color:#17a86b;color:#0b6b42}.verdict.warn{background:#fff6dd;border-color:#d99a00;color:#7a5300}.verdict.bad{background:#fdeaec;border-color:#d64550;color:#9c1c25}.verdict.na{background:#f0f2f7;border-color:#9aa3b8;color:#4b5366}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
.kpi{border:1px solid #e1e5ee;border-top:4px solid #ff6a3d;border-radius:10px;padding:8px 10px;background:#fbfbfd;position:relative;min-height:66px}
.kpi b{display:block;font-size:17px;line-height:1.35}.kpi span{color:#687187;font-size:10px}.kpi .kic{position:absolute;inset-inline-end:8px;top:9px}
ul.say{padding-inline-start:18px}ul.say li{margin:3px 0}
.donut{display:flex;gap:18px;align-items:center}.donut svg{width:128px;height:128px;flex:0 0 auto}.dc{font-weight:700;font-size:15px;fill:#161b26;direction:ltr}.donut ul{list-style:none;flex:1}.donut li{display:flex;gap:7px;align-items:center;padding:2.5px 0;border-bottom:1px dashed #e1e5ee}.donut li i{width:11px;height:11px;border-radius:3px;flex:0 0 auto}.donut li span{flex:1}.donut li small{color:#687187;min-width:34px;text-align:end}
.hist{width:722px;height:auto;display:block}.hist text{font-weight:700;font-size:10.5px;fill:#161b26}.hist .ax{fill:#687187;font-weight:400}
.mapbox{margin:0 auto;border:1px solid #d8d3c8;border-radius:10px;overflow:hidden}.map{display:block}.map .lb{font-weight:700;font-size:12px;fill:#141925;paint-order:stroke;stroke:#fff;stroke-width:3.5px}.map .sc{font-weight:700;font-size:11px;fill:#111}
.legend{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px;font-size:11px;justify-content:center}.legend span{display:flex;gap:6px;align-items:center}.legend i.ln{width:22px;height:5px;border-radius:3px;display:inline-block}
.socbar{display:flex;height:11px;border-radius:7px;overflow:hidden;margin:2px 0 10px;background:#eceef3}
.use{display:inline-block;width:100px;height:8px;border-radius:5px;background:#e6e9f1;overflow:hidden;vertical-align:middle;margin-inline-end:6px}.use i{display:block;height:100%;background:#ff6a3d}
.path-head{display:flex;gap:10px;align-items:center;background:#f6f7fb;border:1px solid #e1e5ee;border-radius:9px;padding:7px 10px;margin-bottom:8px;font-size:12px}.path-head span:last-child{margin-inline-start:auto;color:#687187;font-size:11px}
.cover{height:100%;background:#0b0e14;color:#fff;padding:56px 56px 0;position:relative}
.cover .logo{height:52px}.cover .kicker{margin-top:120px;color:#ff8a62;font-weight:700;font-size:15px}
.cover h1{font-size:38px;line-height:1.4;margin:10px 0 6px;font-weight:700}.cover .pname{font-size:23px;color:#e9ecf4;font-weight:500}
.cover .rule{width:120px;height:6px;background:#ff6a3d;border-radius:4px;margin:22px 0}
.cover dl{display:grid;grid-template-columns:150px 1fr;row-gap:9px;font-size:13px}.cover dt{color:#9aa3b8}.cover dd{font-weight:500}
.cover .strip{position:absolute;left:56px;right:56px;bottom:132px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.cover .chip{background:#151a26;border:1px solid #262d3d;border-radius:12px;padding:12px 6px;text-align:center}.cover .chip img{display:block;margin:0 auto 6px}.cover .chip b{display:block;font-size:20px}.cover .chip span{color:#9aa3b8;font-size:10.5px}
.cover .bar{position:absolute;left:0;right:0;bottom:0;height:78px;background:#ff6a3d;display:flex;align-items:center;justify-content:space-between;padding:0 56px;font-weight:700;font-size:13px}
.cover .verdict{display:inline-block;margin-top:26px}
.toc{list-style:none;margin-top:6px}.toc li{display:flex;gap:10px;align-items:baseline;padding:9px 4px;border-bottom:1px dashed #dfe3ec;font-size:13px}.toc em{font-style:normal;background:#ff6a3d;color:#fff;border-radius:7px;min-width:26px;text-align:center;font-weight:700;font-size:12px}.toc b{font-weight:500;flex:1}.toc span{color:#687187;font-weight:700}
`;
  R.CSS = CSS;

  // the finished pages, each the inside of one A4 box
  R.pages = async function (scope, ring) {
    const x = R.sections(scope, ring), S = FT.state, when = new Date(), date = when.toLocaleDateString('en-GB'), time = when.toTimeString().slice(0, 5);
    const name = (S.meta && S.meta.name) || 'FTTH', logo = await FT.pdf.image('img/mjh-logo.png');
    const total = 2 + x.out.reduce((a, s) => a + s.pages.length, 0);
    const foot = n => '<div class="foot"><span>' + esc(name) + ' · ' + ltr(date + ' ' + time) + '</span><span>' + T('صفحة ', 'Page ') + ltr(n + ' / ' + total) + '</span></div>';
    const top = (title) => '<div class="top"><h2>' + title + '</h2><div class="brand"><div class="prj">' + T('التقرير الفني لشبكة FTTH', 'FTTH technical report') + '<br/>' + esc(name) + '</div>' + (logo ? '<img src="' + logo + '" alt=""/>' : '') + '</div></div>';
    const chip = (ic, v, l) => '<div class="chip">' + img(ic, 34) + '<b>' + ltr(num(v)) + '</b><span>' + l + '</span></div>';
    const cover = '<div class="cover">' + (logo ? '<img class="logo" src="' + logo + '" alt=""/>' : '') + '<div class="kicker">' + T('شبكة الألياف الضوئية إلى المنازل', 'Fibre to the home network') + '</div><h1>' + T('التقرير الفني<br/>للتصميم والإشارة والكميات', 'Technical report<br/>design, signal and quantities') + '</h1><div class="pname">' + esc(name) + '</div><div class="rule"></div><dl><dt>' + T('نطاق التقرير', 'Scope') + '</dt><dd>' + (scope ? T('منطقة محددة', 'Selected area') + (ring ? ' · ' + ltr(num(FT.ringArea(ring) / 1e6, 3) + ' km²') : '') : T('المشروع كامل', 'Whole project')) + '</dd><dt>' + T('تاريخ الإصدار', 'Date') + '</dt><dd>' + ltr(date + ' ' + time) + '</dd><dt>' + T('نظام الإحداثيات', 'Coordinates') + '</dt><dd>' + ltr('WGS 84') + '</dd><dt>' + T('العملة', 'Currency') + '</dt><dd>' + T(FT.CURRENCIES[FT.cur()].ar, FT.CURRENCIES[FT.cur()].en) + '</dd></dl><div class="verdict ' + x.verdict[0] + '"><b>' + x.verdict[1] + '</b></div>' +
      '<div class="strip">' + chip(x.IC.olt, x.count('olt'), 'OLT') + chip(x.IC.sk, x.count('sk') + x.count('dk'), T('خزائن', 'Cabinets')) + chip(x.IC.bk, x.count('bk'), T('علب FDB', 'FDB boxes')) + chip(x.IC.house, x.houses, T('بيوت', 'Houses')) + chip(x.IC.sub, x.onus, T('مشتركون', 'Subscribers')) + '</div><div class="bar"><span>FTTH Planner</span><span>' + ltr(total) + ' ' + T('صفحة', 'pages') + '</span></div></div>';
    let at = 3; const toc = x.out.map((s, i) => { const from = at; at += s.pages.length; return '<li><em>' + (i + 1) + '</em><b>' + s.name + '</b><span>' + ltr(s.pages.length > 1 ? from + ' – ' + (at - 1) : from) + '</span></li>'; }).join('');
    const pages = [cover, top(T('المحتويات', 'Contents')) + '<div class="body"><ol class="toc">' + toc + '</ol></div>' + foot(2)];
    x.out.forEach(s => s.pages.forEach(p => pages.push(top(p.title) + '<div class="body">' + p.html + '</div>' + foot(pages.length + 1))));
    return pages;
  };
  // one HTML document with every page (for looking at it in the browser)
  R.html = async function (scope, ring) {
    const pages = await R.pages(scope, ring), dir = ar() ? 'rtl' : 'ltr';
    return '<!doctype html><html lang="' + (ar() ? 'ar' : 'en') + '" dir="' + dir + '"><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><meta name="darkreader-lock"><title>FTTH report</title><style>' + (await FT.pdf.fonts()) + CSS + 'body{background:#d9dce4}.page{margin:14px auto;box-shadow:0 6px 24px rgba(0,0,0,.18)}</style></head><body>' + pages.map(p => '<div class="page">' + p + '</div>').join('') + '</body></html>';
  };
  R.fileName = () => 'FTTH_Report_' + String((FT.state.meta && FT.state.meta.name) || 'project').replace(/[^\w؀-ۿ-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
  // the PDF itself; progress(done, total) may return false to stop
  R.blob = async function (scope, ring, progress) {
    const css = (await FT.pdf.fonts()) + CSS, pages = await R.pages(scope, ring), dir = ar() ? 'rtl' : 'ltr', shots = [];
    for (let i = 0; i < pages.length; i++) {
      if (progress && progress(i, pages.length) === false) return null;
      shots.push(await FT.pdf.render(pages[i], css, dir, pages.length > 120 ? 1.6 : 2));
      await new Promise(r => setTimeout(r, 0));
    }
    return FT.pdf.build(shots, 'FTTH report — ' + ((FT.state.meta && FT.state.meta.name) || ''));
  };
  R.download = async function (scope, ring) {
    if (R.busy) return; R.busy = true; let stop = false;
    FT.UI.modal(T('تنزيل التقرير PDF', 'Download PDF report'), '<p class="d" id="rpMsg">' + T('عم يتجهّز التقرير…', 'Preparing the report…') + '</p><span class="fx-bar"><i id="rpBar" style="width:2%"></i></span>', [{ label: FT.t('cancel') }], null, () => { stop = true; });
    try {
      const blob = await R.blob(scope, ring, (i, n) => { const m = document.getElementById('rpMsg'), b = document.getElementById('rpBar'); if (m) m.textContent = T('صفحة ' + (i + 1) + ' من ' + n, 'Page ' + (i + 1) + ' of ' + n); if (b) b.style.width = Math.round((i + 1) / n * 100) + '%'; return !stop; });
      if (blob) { FT.exp.download(R.fileName(), blob); FT.UI.closeModal(); FT.UI.toast(T('نزل التقرير', 'Report downloaded')); }
    } catch (e) { console.error(e); FT.UI.closeModal(); FT.UI.toast(T('تعذّر إنشاء ملف PDF: ', 'Could not make the PDF: ') + e.message); }
    finally { R.busy = false; }
  };
  R.open = (scope, ring) => R.download(scope, ring);
})(window);
