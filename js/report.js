/* The printable report (Print → "Save as PDF"): cover, key numbers, a drawn map of the scope, charts, detailed tables,
   optical budget, bill of materials and the specification check. Everything is built from the project data; nothing is sent anywhere. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const R = FT.rep = {};
  const ar = () => FT.lang === 'ar';
  const T = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const num = (v, d) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const len = m => m >= 1000 ? num(m / 1000, 2) + ' km' : num(m, 0) + ' m';
  const money = v => '$' + num(v, 2);
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
    const pipByType = group(pipes, p => (FT.PIPE_CAT.find(x => x.id === p.cat) || {}).name || p.ptype, p => FT.pathLen(p.pts)).sort((a, b) => b.len - a.len);
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
      pipeM: pipByType.reduce((a, g) => a + g.len, 0), cableM: cabByType.reduce((a, g) => a + g.len, 0),
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

  // ---------------- the document ----------------
  const table = (head, rows, cls) => '<table class="' + (cls || '') + '"><thead><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  const sec = (n, title, body, cls) => '<section class="' + (cls || '') + '"><h2><em>' + n + '</em>' + title + '</h2>' + body + '</section>';
  const pill = (s, text) => '<span class="pill ' + s + '">' + text + '</span>';
  R.html = function (scope, ring) {
    const d = R.data(scope, ring), S = FT.state, L = FT.LIMITS.maxLoss, B = FT.BASE_LOSS, priced = FT.hasPrices();
    const when = new Date(), date = when.toLocaleDateString('en-GB') + ' ' + when.toTimeString().slice(0, 5);
    const name = (S.meta && S.meta.name) || 'FTTH Planner', socN = d.soc.items.filter(i => i.status !== 'na').length;
    const kpi = (v, l, c) => '<div class="kpi" style="--c:' + c + '"><b>' + v + '</b><span>' + l + '</span></div>';
    const count = t => (d.nodeByType.find(x => x.type === t) || { n: 0 }).n;
    let n = 0, h = '';
    h += '<header class="cover"><div class="brand"><span class="mark">F</span><div><b>FTTH Planner</b><small>' + T('تقرير تخطيط شبكة الألياف الضوئية', 'Fibre network planning report') + '</small></div></div><h1>' + esc(name) + '</h1><div class="meta"><span class="scope">' + (scope ? T('تقرير لمنطقة محددة', 'Selected area') : T('المشروع كامل', 'Whole project')) + '</span>' + (ring ? '<span>' + T('المساحة', 'Area') + ' ' + ltr(num(FT.ringArea(ring) / 1e6, 3) + ' km²') + '</span>' : '') + '<span>' + ltr(date) + '</span></div></header>';
    h += '<div class="kpis">' + kpi(ltr(num(count('sk'))), T('خزائن FDC', 'FDC cabinets'), '#ff8a3d') + kpi(ltr(num(count('bk'))), T('علب FDB', 'FDB boxes'), '#ff4f7a') + kpi(ltr(num(count('mh') + count('hh'))), T('مناهل وغرف', 'Manholes + handholes'), '#6b7280') + kpi(ltr(len(d.pipeM)), T('طول الأنابيب', 'Duct length'), '#2aa8ff') + kpi(ltr(len(d.cableM)), T('طول الكابلات', 'Cable length'), '#9d5cf0') + kpi(ltr(num(d.fibreKm, 1)), T('كيلومتر ليف', 'Fibre km'), '#17b9a4') +
      kpi(ltr(ring ? num(d.buildings) : num(d.withFdb)), ring ? T('مبانٍ داخل المنطقة', 'Buildings in the area') : T('مبانٍ لها علبة', 'Buildings with a box'), '#a9825a') + kpi(ltr(d.worst == null ? '—' : d.worst.toFixed(1) + ' dB'), T('أسوأ فقد (الحد ' + L + ')', 'Worst loss (limit ' + L + ')'), d.worst != null && d.worst > L ? '#e5484d' : '#17a86b') + kpi(ltr(d.soc.ok + ' / ' + socN), T('بنود مطابقة للمواصفات', 'Specification checks passed'), d.soc.bad ? '#e5484d' : '#17a86b') + (priced ? kpi(ltr(money(d.cost.total)), T('الكلفة التقديرية', 'Estimated cost'), '#ff6a3d') : '') + '</div>';
    const map = R.mapSvg(d, ring); if (map) h += sec(++n, T('خريطة النطاق', 'Map of the scope'), map + legend(d), 'keep');
    h += sec(++n, T('توزيع الكابلات والأنابيب', 'Cables and ducts'), '<div class="two"><div><h3>' + T('طول الكابلات حسب الوظيفة', 'Cable length by role') + '</h3>' + donut(d.cabByGroup.map(g => ({ k: T({ Feeder: 'تغذية', Backbone: 'تغذية', Distribution: 'توزيع', Drop: 'مشترك' }[g.name] || g.name, g.name), v: g.len, c: CAB_COL[g.name] })), len, len(d.cableM)) + '</div><div><h3>' + T('طول الأنابيب حسب النوع', 'Duct length by type') + '</h3>' + bars(d.pipByType.map(g => ({ k: g.name, v: g.len })), len) + '</div></div>' +
      '<h3>' + T('الكابلات بالتفصيل', 'Cables in detail') + '</h3>' + table([T('نوع الكبل', 'Cable type'), T('العدد', 'Count'), T('الطول', 'Length'), T('ألياف·كم', 'Fibre·km')], d.cabByType.map(g => [ltr(esc(g.name)), ltr(num(g.n)), ltr(len(g.len)), ltr(num(g.items.reduce((a, c) => a + FT.cableLength(c) / 1000 * (c.core || 0), 0), 1))])) +
      '<h3>' + T('الأنابيب بالتفصيل', 'Ducts in detail') + '</h3>' + table([T('نوع الأنبوب', 'Duct type'), T('العدد', 'Count'), T('الطول', 'Length'), T('متوسط القطعة', 'Average run')], d.pipByType.map(g => [ltr(esc(g.name)), ltr(num(g.n)), ltr(len(g.len)), ltr(len(g.len / g.n))])));
    h += sec(++n, T('العناصر والمقسّمات', 'Elements and splitters'), '<div class="two"><div><h3>' + T('العناصر حسب النوع', 'Elements by type') + '</h3>' + bars(d.nodeByType.map(x => ({ k: x.name, v: x.n, c: NODE_COL[x.type] })), v => num(v)) + '</div><div><h3>' + T('المقسّمات الضوئية', 'Optical splitters') + '</h3>' + (d.splitters.length ? bars(d.splitters.map(x => ({ k: x.name, v: x.n })), v => num(v)) : '<p class="muted">—</p>') + '<p class="muted">' + T('وصلات اللحام (Splice closures): ', 'Splice closures: ') + ltr(num(d.splices)) + '</p></div></div>' +
      table([T('العنصر', 'Element'), T('العدد', 'Count')], d.nodeByType.map(x => [esc(x.full), ltr(num(x.n))])));
    if (d.fdc.length) h += sec(++n, T('خزائن التوزيع FDC', 'FDC cabinets'), table([T('الخزانة', 'Cabinet'), T('الرمز', 'Code'), T('المقسّم', 'Splitter'), T('علب FDB', 'FDB served'), T('أبعد علبة عن الـ OLT', 'Farthest box from OLT'), T('أسوأ فقد', 'Worst loss')], d.fdc.map(g => [ltr(esc(g.node.name)), ltr(esc(g.node.code || '—')), ltr((g.node.nsplit || 1) + ' × ' + esc(g.node.ratio || '—')), ltr(num(g.n)), ltr(len(g.far)), pill(g.worst > L ? 'bad' : g.worst > L - 2 ? 'warn' : 'ok', ltr(g.worst.toFixed(1) + ' dB'))])));
    h += sec(++n, T('الميزانية الضوئية', 'Optical budget'), '<h3>' + T('عدد علب FDB حسب الفقد الكلي (dB)', 'FDB boxes by total loss (dB)') + '</h3>' + lossChart(d.fed) + (d.fdb.length ? '<h3>' + T('جدول العلب', 'Box by box') + '</h3>' + table(['#', T('رمز العلبة', 'Box code'), T('رقم المبنى', 'Building'), T('المسافة', 'Distance'), T('التقسيم', 'Split'), T('الفقد', 'Loss'), 'Rx', T('الحالة', 'Status')], d.fdb.map((r, i) => [ltr(i + 1), ltr(esc(r.node.code || r.node.name)), ltr(esc(r.node.label || '—')), r.fed ? ltr(len(r.len)) : '—', r.fed ? ltr('1:' + r.split) : '—', r.fed ? ltr(r.loss.toFixed(1) + ' dB') : '—', r.fed ? ltr(r.rx.toFixed(1) + ' dBm') : '—', !r.fed ? pill('warn', T('غير موصولة', 'Not fed')) : r.loss > L || r.rx <= B.rxSens ? pill('bad', T('تتجاوز', 'Over')) : r.loss > L - 2 ? pill('warn', T('قريبة من الحد', 'Near limit')) : pill('ok', T('مطابقة', 'OK'))]), 'dense') : ''));
    if (d.subs.length) h += sec(++n, T('المشتركون', 'Subscribers'), table([T('المشترك', 'Subscriber'), T('المسافة', 'Distance'), T('الفقد', 'Loss'), 'Rx'], d.subs.map(r => [esc(r.sub.name), r.fed ? ltr(len(r.len)) : '—', r.fed ? ltr(r.loss.toFixed(1) + ' dB') : T('غير موصول', 'Not fed'), r.fed ? ltr(r.rx.toFixed(1) + ' dBm') : '—']), 'dense'));
    const kinds = { cable: T('كابلات', 'Cables'), pipe: T('أنابيب', 'Ducts'), node: T('علب وغرف', 'Boxes and chambers'), splitter: T('مقسّمات', 'Splitters'), splice: T('وصلات', 'Splices'), wdev: T('لاسلكي', 'Radio'), labour: T('أجور تركيب', 'Installation') };
    const byKind = Object.keys(kinds).map(k => ({ k: kinds[k], v: d.cost.lines.filter(l => l.kind === k).reduce((a, l) => a + l.total, 0) })).filter(x => x.v > 0);
    h += sec(++n, T('جدول الكميات والكلفة', 'Bill of materials and cost'), (priced && byKind.length ? '<h3>' + T('توزيع الكلفة', 'Cost split') + '</h3>' + donut(byKind, money, money(d.cost.total)) : '<p class="note">' + T('الأسعار غير مدخلة، فيعرض الجدول الكميات فقط. أدخل الأسعار من زر «الأسعار» ليظهر حساب الكلفة.', 'No prices entered: quantities only. Add them with the Prices button to see the cost.') + '</p>') +
      table([T('النوع', 'Type'), T('البند', 'Item'), T('الكمية', 'Quantity')].concat(priced ? [T('سعر الوحدة', 'Unit price'), T('الإجمالي', 'Total')] : []), d.cost.lines.map(r => [esc(kinds[r.kind] || r.kind), ltr(esc(r.name)), ltr(r.unit === 'm' ? num(r.qty, 1) + ' m' : num(r.qty))].concat(priced ? [ltr(money(r.price) + (r.unit === 'm' ? ' /m' : '')), '<b>' + ltr(money(r.total)) + '</b>'] : []))) + (priced ? '<div class="total">' + T('الإجمالي', 'Total') + ' ' + ltr(money(d.cost.total)) + '</div>' : ''));
    const stat = { ok: ['ok', T('مطابق', 'Compliant')], bad: ['bad', T('غير مطابق', 'Not compliant')], warn: ['warn', T('تنبيه', 'Warning')], na: ['na', T('لا ينطبق', 'N/A')] };
    h += sec(++n, T('فحص المطابقة لمواصفات السورية للاتصالات', 'Syrian Telecom specification check'), (scope ? '<p class="note">' + T('هذا الفحص يخص المشروع كاملاً، لأن مسارات الألياف تمتد خارج المنطقة المحددة.', 'This check covers the whole project, because fibre paths run beyond the selected area.') + '</p>' : '') + '<div class="socbar"><i style="flex:' + d.soc.ok + ';background:#17a86b"></i><i style="flex:' + d.soc.warn + ';background:#ffb020"></i><i style="flex:' + d.soc.bad + ';background:#e5484d"></i></div>' + table([T('البند', 'Requirement'), T('التفاصيل', 'Detail'), T('النتيجة', 'Result')], d.soc.items.map(i => ['<b>' + esc(ar() ? i.ar : i.en) + '</b>', esc(i.detail), pill(stat[i.status][0], stat[i.status][1])])));
    h += '<footer><b>' + T('ملاحظات', 'Notes') + '</b><ul><li>' + T('هذا تقدير تخطيطي مبني على الرسم، ويلزم التحقق الميداني قبل التنفيذ.', 'A planning estimate based on the drawing; verify on site before building.') + '</li><li>' + T('حساب الفقد يفترض كبل مشترك بطول 100 م حتى جهاز المشترك.', 'The loss calculation assumes a 100 m drop to the subscriber unit.') + '</li>' + (scope ? '<li>' + T('الأنبوب أو الكبل الذي يمر جزء منه داخل المنطقة محسوب بطوله الكامل، حتى الجزء الخارج عنها.', 'A duct or cable that is partly inside the area is counted with its full length, including the part outside it.') + '</li>' : '') + '<li>' + T('خلفية المباني من بيانات الخريطة المحمّلة وقت إنشاء التقرير.', 'Building outlines come from the map data loaded when the report was made.') + '</li></ul></footer>';
    return '<!doctype html><html lang="' + (ar() ? 'ar' : 'en') + '" dir="' + (ar() ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8"><title>' + esc(name) + ' — FTTH report</title><style>' + CSS + '</style></head><body><div class="tools"><button onclick="window.print()">🖨 ' + T('طباعة / حفظ PDF', 'Print / save as PDF') + '</button><span>' + T('من نافذة الطباعة اختر «حفظ بتنسيق PDF».', 'In the print window choose “Save as PDF”.') + '</span></div><main>' + h + '</main></body></html>';
  };
  const CSS = `
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e9ebf0;color:#141925;font:13px/1.55 "IBM Plex Sans Arabic","Segoe UI",Tahoma,Arial,sans-serif}
main{max-width:980px;margin:0 auto 30px;background:#fff;padding:26px 30px;box-shadow:0 6px 30px rgba(0,0,0,.14)}
.tools{position:sticky;top:0;z-index:5;background:#0e1117;color:#9aa1b6;padding:10px;display:flex;gap:14px;align-items:center;justify-content:center}
.tools button{background:#ff6a3d;border:0;color:#fff;font:700 14px inherit;font-family:inherit;padding:9px 22px;border-radius:9px;cursor:pointer}
.cover{background:linear-gradient(135deg,#0e1117 0%,#1b2030 70%,#2a1c1a 100%);color:#fff;border-radius:14px;padding:22px 26px 20px;border-bottom:6px solid #ff6a3d}
.brand{display:flex;gap:11px;align-items:center}.brand small{display:block;color:#9aa1b6}.mark{width:40px;height:40px;border-radius:11px;background:#ff6a3d;display:grid;place-items:center;font-weight:800;font-size:21px}
h1{margin:16px 0 8px;font-size:30px;line-height:1.25}.meta{display:flex;gap:14px;flex-wrap:wrap;color:#c9cfdf;align-items:center}.scope{background:#ff6a3d;color:#fff;padding:3px 13px;border-radius:20px;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0 6px}
.kpi{border:1px solid #e3e6ee;border-top:4px solid var(--c);border-radius:11px;padding:10px 12px;background:#fbfbfd}.kpi b{display:block;font-size:19px;color:#141925}.kpi span{color:#667089;font-size:11.5px}
section{margin-top:22px}section.keep{break-inside:avoid}
h2{font-size:17px;margin:0 0 11px;padding-bottom:7px;border-bottom:2px solid #ffd9cd;display:flex;gap:9px;align-items:center;break-after:avoid}
h2 em{font-style:normal;background:#ff6a3d;color:#fff;border-radius:7px;min-width:26px;height:26px;display:grid;place-items:center;font-size:13px}
h3{font-size:13.5px;margin:14px 0 7px;color:#c2461f;break-after:avoid}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;break-inside:avoid}
table{width:100%;border-collapse:collapse;margin-top:4px}thead{display:table-header-group}th{background:#141925;color:#fff;text-align:start;padding:7px 9px;font-size:12px}td{padding:6px 9px;border-bottom:1px solid #e8eaf1;vertical-align:top}tbody tr:nth-child(even){background:#f7f8fb}tr{break-inside:avoid}
table.dense td,table.dense th{padding:3.5px 7px;font-size:11px}
.pill{display:inline-block;padding:1px 10px;border-radius:20px;font-weight:700;font-size:11px;white-space:nowrap}.pill.ok{background:#dcf5e9;color:#0d7a4c}.pill.warn{background:#fff0d1;color:#8a5a00}.pill.bad{background:#fde2e3;color:#b4232a}.pill.na{background:#eceef3;color:#667089}
.donut{display:flex;gap:14px;align-items:center}.donut svg{width:150px;height:150px;flex:0 0 auto}.dc{font:700 15px "Segoe UI";fill:#141925;direction:ltr}.donut ul{list-style:none;margin:0;padding:0;flex:1}.donut li{display:flex;gap:7px;align-items:center;padding:3px 0;border-bottom:1px dashed #e3e6ee}.donut li i{width:11px;height:11px;border-radius:3px;flex:0 0 auto}.donut li span{flex:1}.donut li small{color:#667089;min-width:34px;text-align:end}
.bars .bar{display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:9px;align-items:center;margin:5px 0}.bar span{font-size:11px;line-height:1.3;unicode-bidi:plaintext;overflow-wrap:anywhere}.bar div{background:#eef0f5;border-radius:6px;height:13px}.bar i{display:block;height:100%;border-radius:6px}.bar b{font-size:12px}
.hist{width:100%;height:auto}.hist text{font:600 11px "Segoe UI";fill:#141925}.hist .ax{fill:#667089;font-weight:400}
.map{width:100%;height:auto;max-height:238mm;border:1px solid #d8d3c8;border-radius:11px;display:block}.map .lb{font:700 12px "Segoe UI";fill:#141925;paint-order:stroke;stroke:#fff;stroke-width:3.5px}.map .sc{font:600 11px "Segoe UI";fill:#111}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:9px;font-size:12px}.legend span{display:flex;gap:6px;align-items:center}.legend i{width:11px;height:11px;border-radius:50%}.legend i.ln{width:22px;height:5px;border-radius:3px}
.total{margin-top:9px;background:#0e1117;color:#fff;border-radius:9px;padding:10px 16px;font-size:17px;font-weight:700;text-align:end}
.note{background:#fff4ee;border:1px solid #ffd2c2;border-radius:9px;padding:8px 12px;color:#8a3a20}.muted{color:#667089}
.socbar{display:flex;height:12px;border-radius:7px;overflow:hidden;margin:4px 0 10px;background:#eceef3}
footer{margin-top:24px;border-top:2px solid #ffd9cd;padding-top:9px;color:#667089;font-size:11.5px}footer ul{margin:5px 0;padding-inline-start:18px}
@page{size:A4;margin:10mm}
@media print{body{background:#fff;font-size:11.5px}.tools{display:none}main{box-shadow:none;padding:0;max-width:none;margin:0}.kpis{grid-template-columns:repeat(5,1fr)}}
@media screen and (max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}}
`;
  R.open = function (scope, ring) {
    const w = window.open('', '_blank'); if (!w) { FT.UI.toast(T('اسمح بالنوافذ المنبثقة لهذا الموقع', 'Allow pop-ups for this site')); return; }
    w.document.write(R.html(scope, ring)); w.document.close();
  };
})(window);
