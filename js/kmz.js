/* Professional KMZ for Google Earth. The file explains itself: a "how to read this" page, a legend that stays on screen, our own
   element pictures, folders in the order of the network, and on every element a card saying what it is, what it does and all its
   figures (ports, signal, path step by step, splices). Building drawings stand in 3D. Attributes are typed (SchemaData) for GIS. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const K = FT.kmzPro = {};
  const U = () => FT.UI, F = () => FT.fiber, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const nm = id => { const n = FT.state.nodes[id]; return n ? (n.code || n.name) : '—'; };
  const num = (v, d) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const ltr = s => '<span dir="ltr" style="unicode-bidi:isolate;white-space:nowrap">' + s + '</span>';
  const kcol = (hex, a) => (a == null ? 'ff' : Math.round(a * 255).toString(16).padStart(2, '0')) + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3);
  const group = c => (FT.CABLE_CAT.find(x => x.id === c.cat) || {}).group || 'Feeder';
  const cablePts = c => [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts));
  const SHORT = { olt: 'OLT', sk: 'FDC', dk: 'iFDC', bk: 'FDB', mh: 'MH', hh: 'HH', pole: 'WA' };
  const NCOL = { olt: '#2bd18b', sk: '#ff8a3d', dk: '#ffc233', bk: '#ff4f7a', mh: '#9aa1b6', hh: '#cfd6ea', pole: '#c9a37a' };
  const CCOL = { Feeder: '#b57bff', Distribution: '#35e0c9', Drop: '#d4ff4a' };
  const SCOL = { ok: '#17a86b', warn: '#e0a100', bad: '#e5484d', broken: '#7f1d1d' };
  const WHAT = () => ({
    olt: [tx('المقسم المركزي (OLT)', 'Central office (OLT)'), tx('من هون بتبلّش الإشارة. كل منفذ PON بيغذّي مجموعة علب.', 'The signal starts here; every PON port feeds a group of boxes.')],
    sk: [tx('خزانة التوزيع (FDC)', 'Distribution cabinet (FDC)'), tx('فيها مقسّمات المرحلة الأولى: بتقسم الشعرة الجاية من المقسم على عدة علب.', 'First-stage splitters: one feeder fibre is shared by several boxes.')],
    dk: [tx('خزانة وسيطة (iFDC)', 'Intermediate cabinet'), tx('نقطة توزيع بين الخزانة والعلب.', 'A distribution point between cabinet and boxes.')],
    bk: [tx('علبة المبنى (FDB)', 'Building box (FDB)'), tx('على مدخل المبنى، فيها مقسّم المرحلة الثانية، ومنها بتتمدّد كبلات المشتركين.', 'At the building entrance; second-stage splitter; subscriber drops leave from here.')],
    mh: [tx('منهل رئيسي (MH)', 'Manhole'), tx('غرفة تحت الأرض على مسار الأنابيب للسحب واللحام.', 'Underground chamber for pulling and splicing.')],
    hh: [tx('غرفة تفتيش صغيرة (HH)', 'Handhole'), tx('غرفة صغيرة على مسار الخندق.', 'Small chamber on the trench route.')],
    pole: [tx('نقطة تعليق على جدار (WA)', 'Wall anchor'), tx('نقطة تثبيت الكبل الهوائي على الجدار.', 'Fixes the aerial cable to a wall.')],
  });

  const CARD = (icon, color, title, sub, rows, extra) => '<div dir="' + (ar() ? 'rtl' : 'ltr') + '" style="font-family:Segoe UI,Tahoma,Arial;width:440px;color:#161b26">' +
    '<div style="background:#0e1117;color:#ffffff;padding:10px 12px;border-radius:8px 8px 0 0;border-bottom:4px solid ' + color + '"><table style="width:100%;border-collapse:collapse"><tr>' + (icon ? '<td style="width:40px"><img src="icons/' + icon + '.png" width="32" height="32"/></td>' : '') + '<td><div style="font-size:16px;font-weight:bold;color:#ffffff">' + esc(title) + '</div><div style="font-size:11px;color:#aab2c5">' + esc(sub) + '</div></td></tr></table></div>' +
    (rows.length ? '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' + rows.map((r, i) => '<tr style="background:' + (i % 2 ? '#f4f6fa' : '#ffffff') + '"><td style="padding:5px 10px;color:#5a6377;border-bottom:1px solid #e3e7f0;width:45%">' + r[0] + '</td><td style="padding:5px 10px;font-weight:bold;border-bottom:1px solid #e3e7f0">' + r[1] + '</td></tr>').join('') + '</table>' : '') + (extra || '') + '</div>';
  const SUBTABLE = (title, head, rows) => rows.length ? '<div style="font-weight:bold;color:#b9431c;margin:10px 4px 4px;font-size:13px">' + title + '</div><table style="width:100%;border-collapse:collapse;font-size:11.5px"><tr style="background:#1a2030;color:#ffffff">' + head.map(h => '<td style="padding:4px 6px">' + h + '</td>').join('') + '</tr>' + rows.map((r, i) => '<tr style="background:' + (i % 2 ? '#f4f6fa' : '#ffffff') + '">' + r.map(c => '<td style="padding:3px 6px;border-bottom:1px solid #e3e7f0">' + c + '</td>').join('') + '</tr>').join('') + '</table>' : '';
  const chip = (s, t) => '<span style="background:' + SCOL[s] + ';color:#ffffff;border-radius:10px;padding:1px 9px">' + t + '</span>';
  const dot = hex => '<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:' + hex + ';border:1px solid #777">&#160;</span> ';

  function endText(e) {
    const S = FT.state; if (!e) return '—'; if (e.t) return tx('منهية', 'terminated'); if (e.o != null) return 'PON ' + e.o;
    if (e.s != null) { const sp = F().splitter(e.s); return tx('مقسّم ', 'splitter ') + ltr((sp ? sp.ratio : '?') + ' #' + String(e.s).split('#').pop()) + ' · ' + (e.p ? tx('مخرج ', 'out ') + e.p : tx('دخل', 'in')); }
    const c = S.cables[e.c]; return c ? dot(F().strandColor(c, e.f).hex) + ltr(esc(F().strandName(c, e.f))) + ' · <bdi style="white-space:nowrap">' + esc(c.name) + '</bdi>' : '?';
  }
  function spliceRows(nodeId) { return F().links(nodeId).slice(0, 80).map(l => [endText(l.a), endText(l.b)]); }
  // the signal level after every element from the OLT to this box
  function pathRows(r) {
    const C = F().cfg(), rows = []; let level = C.oltTx;
    const add = (what, dB) => { level -= dB; rows.push([rows.length + 1, what, ltr(dB.toFixed(2)), '<b>' + ltr(level.toFixed(2)) + '</b>']); };
    add(tx('موصل عند الـOLT · منفذ PON ', 'Connector at the OLT · PON ') + r.port, C.connector);
    r.steps.slice().reverse().forEach(s => { if (s.type === 'strand') { const c = FT.state.cables[s.cable]; add(dot(F().strandColor(c, s.f).hex) + '<bdi style="white-space:nowrap">' + esc(c.name) + '</bdi> · ' + ltr(esc(F().strandName(c, s.f))) + ' · ' + ltr(num(s.len) + ' m'), s.len / 1000 * C.att1490); } else if (s.type === 'fusion') add(tx('لحام بـ ', 'Fusion at ') + esc(nm(s.node)), C.fusion); else if (s.type === 'splitter') add(tx('مقسّم ', 'Splitter ') + ltr(s.ratio) + ' · ' + esc(nm(s.node)), F().splitterLoss(s.ratio)); });
    add(tx('مقسّم العلبة ', 'Box splitter ') + ltr(r.splitter.ratio), F().splitterLoss(r.splitter.ratio));
    if (r.budget.slackM > 0.005) add(tx('احتياط اللفّات والهالك ', 'Cable loops and waste ') + ltr(num(r.budget.slackM) + ' m'), r.budget.slackM / 1000 * C.att1490);
    if (r.budget.boxConnectors) add(tx('موصلات داخل العلب × ', 'Connectors inside the boxes × ') + ltr(r.budget.boxConnectors), r.budget.boxConnectors * C.connector);
    if (r.budget.assumedFusions) add(tx('لحامات مقدّرة غير مرسومة × ', 'Assumed splices, not drawn × ') + ltr(r.budget.assumedFusions), r.budget.assumedFusions * C.fusion);
    if (r.budget.dropM) add(tx('كبل المشترك المفترض ', 'Assumed drop ') + ltr(r.budget.dropM + ' m'), r.budget.dropM / 1000 * C.att1490);
    for (let i = 1; i < C.connectors; i++) add(tx('موصل عند المشترك', 'Connector at the subscriber'), C.connector);
    return rows;
  }

  // ---------------- pictures ----------------
  const bytesOf = dataUrl => { const b = atob(dataUrl.split(',')[1]), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  async function pictures() {
    const o = {}; ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole', 'splice', 'sub'].forEach(t => o[t] = FT.map.iconDataURL(t, 96));
    o.house = FT.houses.draw(2, 4).toDataURL();
    Object.keys(SCOL).forEach(k => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = SCOL[k]; g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); g.stroke(); o['sig_' + k] = c.toDataURL(); });
    return o;
  }
  // the legend drawn as a picture: it stays on the screen in Google Earth
  async function legend(pics, present) {
    const items = [];
    Object.keys(SHORT).forEach(t => { if (present[t]) items.push({ icon: pics[t], text: WHAT()[t][0] }); });
    if (present.house) items.push({ icon: pics.house, text: tx('بيت (رقمه وطوابقه)', 'House (number, floors)') });
    if (present.sub) items.push({ icon: pics.sub, text: tx('مشترك مربوط', 'Subscriber') });
    if (present.splice) items.push({ icon: pics.splice, text: tx('علبة لحام', 'Splice closure') });
    [['Feeder', tx('كبل تغذية (من المقسم للخزانة)', 'Feeder cable'), 7], ['Distribution', tx('كبل توزيع (من الخزانة للعلبة)', 'Distribution cable'), 5], ['Drop', tx('كبل مشترك (من العلبة للبيت)', 'Drop cable'), 3]].forEach(v => { if (present['c_' + v[0]]) items.push({ line: CCOL[v[0]], w: v[2], text: v[1] }); });
    if (present.duct) items.push({ line: '#2aa8ff', w: 8, text: tx('أنبوب / خندق دقيق تحت الأرض', 'Buried duct / micro-trench') });
    if (present.aerial) items.push({ line: '#ffc233', w: 6, text: tx('مسار هوائي على الجدران', 'Aerial route') });
    const W = 380, rh = 30, H = 64 + items.length * rh + 14, cv = document.createElement('canvas'), k = 2; cv.width = W * k; cv.height = H * k; const g = cv.getContext('2d'); g.scale(k, k);
    g.fillStyle = 'rgba(14,17,23,0.92)'; g.beginPath(); g.roundRect(0, 0, W, H, 12); g.fill(); g.fillStyle = '#ff6a3d'; g.fillRect(0, 46, W, 3);
    const rtl = ar(); g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '700 17px "IBM Plex Sans Arabic", Segoe UI, Tahoma'; g.fillText(tx('مفتاح الخريطة', 'Map key'), rtl ? W - 16 : 16, 25);
    g.font = '500 13px "IBM Plex Sans Arabic", Segoe UI, Tahoma';
    for (let i = 0; i < items.length; i++) {
      const it = items[i], y = 66 + i * rh, ix = rtl ? W - 44 : 16;
      if (it.icon) { const im = await loadImg(it.icon), s = Math.min(24 / im.width, 24 / im.height); g.drawImage(im, ix + (28 - im.width * s) / 2, y - im.height * s / 2, im.width * s, im.height * s); }
      else { g.strokeStyle = it.line; g.lineWidth = it.w * 0.75; g.lineCap = 'round'; g.beginPath(); g.moveTo(ix + 2, y); g.lineTo(ix + 28, y); g.stroke(); }
      g.fillStyle = '#eceff6'; g.fillText(it.text, rtl ? W - 56 : 56, y);
    }
    return { url: cv.toDataURL(), w: W, h: H };
  }

  // ---------------- the document ----------------
  K.build = async function (opt) {
    opt = Object.assign({ ring: null, houses: true, buildings3d: true, subs: true, splices: true, signal: true, pon: true, ducts: true, legend: true }, opt || {});
    const S = FT.state, ring = opt.ring, inR = ll => !ring || FT.pointInRing(ll, ring), pics = await pictures(), used = new Set(), present = {}, W = WHAT();
    const A = F().analyze(), C = F().cfg();
    const nodes = Object.values(S.nodes).filter(n => inR(n.ll)), inN = new Set(nodes.map(n => n.id));
    const cables = Object.values(S.cables).filter(c => !ring || (c.nodes || []).some(i => inN.has(i)));
    const pipes = opt.ducts ? Object.values(S.pipes).filter(p => !ring || p.pts.some(inR) || inN.has(p.a) || inN.has(p.b)) : [];
    let blds = [];
    if ((opt.houses || opt.buildings3d) && ring) { await FT.map.ensureTiles(FT.bboxOf(ring)); blds = FT.map.buildingsInRing(ring).slice(0, 60000); }
    const houses = ring ? blds.map(b => ({ id: b.id, o: b.o || {}, ll: b.house || FT.map.housePoint(b.id) || b.c, ring: b.ring })) : FT.map.housesData().map(h => ({ id: h.id, o: h.o, ll: h.ll, ring: FT.map.ringAny ? FT.map.ringAny(h.id) : null }));
    const boxRow = {}; A.boxes.forEach(r => { if (!boxRow[r.node.id]) boxRow[r.node.id] = r; });
    const status = r => !r.reached ? 'broken' : r.budget.status === 'bad' ? 'bad' : (r.issues.length || r.budget.status === 'warn') ? 'warn' : 'ok';
    const STXT = { ok: tx('سليمة', 'OK'), warn: tx('تحتاج مراجعة', 'Review'), bad: tx('تتجاوز الحد', 'Over limit'), broken: tx('غير موصولة', 'Not connected') };
    const ico = n => { used.add(n); return 'icons/' + n + '.png'; };
    const styles = [];
    const ptStyle = (id, icon, scale, label, labelHi, hotY) => { ico(icon); const s = (sc, lb) => '<IconStyle><scale>' + sc + '</scale><Icon><href>icons/' + icon + '.png</href></Icon><hotSpot x="0.5" y="' + (hotY == null ? 0.5 : hotY) + '" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>' + lb + '</scale></LabelStyle><BalloonStyle><text>$[description]</text></BalloonStyle>'; styles.push('<Style id="' + id + '_n">' + s(scale, label) + '</Style><Style id="' + id + '_h">' + s((scale * 1.35).toFixed(2), labelHi) + '</Style><StyleMap id="' + id + '"><Pair><key>normal</key><styleUrl>#' + id + '_n</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#' + id + '_h</styleUrl></Pair></StyleMap>'); };
    ptStyle('olt', 'olt', 1.2, 0.9, 1.1); ptStyle('sk', 'sk', 1.0, 0.8, 1); ptStyle('dk', 'dk', 0.95, 0.7, 1); ptStyle('bk', 'bk', 0.85, 0, 1); ptStyle('mh', 'mh', 0.75, 0, 0.9); ptStyle('hh', 'hh', 0.65, 0, 0.9); ptStyle('pole', 'pole', 0.75, 0, 0.9);
    ptStyle('house', 'house', 0.8, 0, 1, -0.15); ptStyle('sub', 'sub', 0.55, 0, 0.9); ptStyle('splice', 'splice', 0.6, 0, 0.9); Object.keys(SCOL).forEach(k => ptStyle('sig_' + k, 'sig_' + k, 0.8, 0, 1));
    const lnStyle = (id, hex, w, a) => styles.push('<Style id="' + id + '_n"><LineStyle><color>' + kcol(hex, a) + '</color><width>' + w + '</width></LineStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style><Style id="' + id + '_h"><LineStyle><color>' + kcol('#ffffff') + '</color><width>' + (w + 2.5) + '</width></LineStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style><StyleMap id="' + id + '"><Pair><key>normal</key><styleUrl>#' + id + '_n</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#' + id + '_h</styleUrl></Pair></StyleMap>');
    lnStyle('cab_Feeder', CCOL.Feeder, 5); lnStyle('cab_Distribution', CCOL.Distribution, 3.2); lnStyle('cab_Drop', CCOL.Drop, 2); lnStyle('pipe_u', '#2aa8ff', 7, 0.55); lnStyle('pipe_a', '#ffc233', 4);
    const PONC = ['#ff6a3d', '#2aa8ff', '#35e0c9', '#b57bff', '#ffc233', '#ff4f7a', '#84cc16', '#f472b6']; PONC.forEach((c, i) => lnStyle('pon' + i, c, 4.5));
    styles.push('<Style id="bld3d"><LineStyle><color>' + kcol('#ffffff', 0.55) + '</color><width>1</width></LineStyle><PolyStyle><color>' + kcol('#e9dfce', 0.78) + '</color></PolyStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style><Style id="bld3d_fed"><LineStyle><color>' + kcol('#ffffff', 0.7) + '</color><width>1.2</width></LineStyle><PolyStyle><color>' + kcol('#ff8a62', 0.7) + '</color></PolyStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style><Style id="area"><LineStyle><color>' + kcol('#ff6a3d') + '</color><width>3</width></LineStyle><PolyStyle><color>' + kcol('#ff6a3d', 0.05) + '</color></PolyStyle></Style><Style id="guide"><IconStyle><scale>0</scale></IconStyle><LabelStyle><scale>0</scale></LabelStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style>');
    // typed attributes: readable by GIS programs
    const SCHEMAS = { element: ['type', 'name', 'code', 'splitter', 'building', 'olt', 'pon_port', 'loss_db', 'rx_down_dbm', 'rx_up_dbm', 'status'], cable: ['name', 'role', 'fibres', 'fibres_used', 'standard', 'length_m', 'from_node', 'to_node'], duct: ['name', 'type', 'ducts', 'length_m', 'depth_cm', 'width_cm', 'cover_cm'], house: ['number', 'floors', 'name', 'served_by'], subscriber: ['name', 'box', 'port', 'address', 'number', 'rx_down_dbm'] };
    const NUMERIC = { loss_db: 1, rx_down_dbm: 1, rx_up_dbm: 1, fibres: 1, fibres_used: 1, length_m: 1, ducts: 1, depth_cm: 1, width_cm: 1, cover_cm: 1, floors: 1, port: 1, pon_port: 1 };
    const schemaXml = Object.entries(SCHEMAS).map(([id, f]) => '<Schema name="ftth_' + id + '" id="ftth_' + id + '">' + f.map(n => '<SimpleField type="' + (NUMERIC[n] ? 'double' : 'string') + '" name="' + n + '"/>').join('') + '</Schema>').join('');
    const data = (schema, o) => '<ExtendedData><SchemaData schemaUrl="#ftth_' + schema + '">' + SCHEMAS[schema].filter(k => o[k] !== '' && o[k] != null).map(k => '<SimpleData name="' + k + '">' + esc(clean(o[k])) + '</SimpleData>').join('') + '</SchemaData></ExtendedData>';
    const cd = html => '<![CDATA[' + clean(html).split(']]>').join(']]&gt;') + ']]>';
    const placemark = (name, style, html, ext, geom, more) => '<Placemark><name>' + esc(clean(name)) + '</name>' + (more || '') + '<description>' + cd(html) + '</description><styleUrl>#' + style + '</styleUrl>' + (ext || '') + geom + '</Placemark>';
    const off = x => x.replace('</name>', '</name><visibility>0</visibility>');
    const point = ll => '<Point><coordinates>' + ll[0].toFixed(7) + ',' + ll[1].toFixed(7) + ',0</coordinates></Point>';
    const coords = (pts, h) => pts.map(p => p[0].toFixed(7) + ',' + p[1].toFixed(7) + ',' + (h || 0)).join(' ');
    const line = pts => '<LineString><tessellate>1</tessellate><coordinates>' + coords(pts) + '</coordinates></LineString>';
    const folder = (name, items, o) => items.length ? '<Folder><name>' + esc(name) + ' (' + items.length + ')</name>' + (o && o.hidden ? '<visibility>0</visibility>' : '') + '<open>0</open>' + (o && o.about ? '<description>' + cd(o.about) + '</description>' : '') + (o && o.hidden ? items.map(off).join('') : items.join('')) + '</Folder>' : '';
    const folders = [];

    // elements, in the order of the network
    ['olt', 'sk', 'dk', 'bk', 'mh', 'hh', 'pole'].forEach(t => {
      const list = nodes.filter(n => n.type === t).sort((a, b) => nm(a.id).localeCompare(nm(b.id), undefined, { numeric: true })); if (!list.length) return; present[t] = 1;
      folders.push(folder(SHORT[t] + ' — ' + W[t][0], list.map(n => {
        const r = boxRow[n.id], sps = F().splittersOf(n.id), joins = spliceRows(n.id), rows = [[tx('الرمز', 'Code'), ltr(esc(n.code || '—'))], [tx('الاسم', 'Name'), esc(n.name)]];
        if (n.label) rows.push([tx('المبنى / الوسم', 'Building / label'), esc(n.label)]);
        if (sps.length) { let usedOut = 0, all = 0; sps.forEach(sp => { all += sp.n; for (let p = 1; p <= sp.n; p++) if (F().busy(n.id, { s: sp.key, p })) usedOut++; }); rows.push([tx('المقسّمات', 'Splitters'), ltr((sps.length > 1 ? sps.length + ' × ' : '') + n.ratio)], [tx('المخارج المستعملة', 'Outputs used'), ltr(usedOut + ' / ' + all)]); }
        if (t === 'olt') rows.push([tx('منافذ PON المستعملة', 'PON ports used'), F().usedPon(n.id).length]);
        let extra = '';
        if (r && opt.signal) {
          rows.push([tx('الحالة', 'Status'), chip(status(r), STXT[status(r)])]);
          if (r.reached) rows.push(['OLT · PON', ltr(esc(nm(r.olt)) + ' · ' + r.port)], [tx('طول الليف من المقسم', 'Fibre from the OLT'), ltr(num(r.budget.fibreM) + ' m')], [tx('قوة الإشارة نزولاً (1490)', 'Signal down (1490)'), ltr(r.budget.down.rx.toFixed(2) + ' dBm')], [tx('قوة الإشارة صعوداً (1310)', 'Signal up (1310)'), ltr(r.budget.up.rx.toFixed(2) + ' dBm')], [tx('الفقد الكلي', 'Total loss'), ltr(r.budget.down.total.toFixed(2) + ' dB  (' + tx('المسموح ', 'limit ') + C.maxLoss + ')')], [tx('هامش الأمان', 'Safety margin'), ltr(Math.min(r.budget.lossMargin, r.budget.sensMargin).toFixed(2) + ' dB')]);
          if (r.reached && t === 'bk') extra += SUBTABLE(tx('مسار الإشارة خطوة بخطوة', 'Signal path step by step'), ['#', tx('العنصر', 'Element'), tx('الفقد dB', 'Loss'), tx('الإشارة dBm', 'Signal')], pathRows(r));
        }
        if (joins.length && opt.splices) extra += SUBTABLE(tx('اللحامات جوّا (من ← إلى)', 'Joins inside'), [tx('من', 'From'), tx('إلى', 'To')], joins);
        const card = CARD(t, NCOL[t], n.code || n.name, W[t][0], [[tx('شو هاد؟', 'What is it?'), '<span style="font-weight:normal">' + W[t][1] + '</span>']].concat(rows, [[tx('الإحداثيات', 'Position'), ltr(n.ll[1].toFixed(6) + ', ' + n.ll[0].toFixed(6))]]), extra);
        return placemark(n.code || n.name, t, card, data('element', { type: SHORT[t], name: n.name, code: n.code, splitter: n.ratio, building: n.label, olt: r && r.reached ? nm(r.olt) : '', pon_port: r && r.reached ? r.port : '', loss_db: r && r.budget ? r.budget.down.total.toFixed(2) : '', rx_down_dbm: r && r.budget ? r.budget.down.rx.toFixed(2) : '', rx_up_dbm: r && r.budget ? r.budget.up.rx.toFixed(2) : '', status: r ? status(r) : '' }), point(n.ll));
      }), { about: W[t][1] }));
    });

    // cables
    const CTITLE = { Feeder: tx('كبلات التغذية', 'Feeder cables'), Distribution: tx('كبلات التوزيع', 'Distribution cables'), Drop: tx('كبلات المشتركين', 'Drop cables') };
    ['Feeder', 'Distribution', 'Drop'].forEach(g => {
      const list = cables.filter(c => group(c) === g).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })); if (!list.length) return; present['c_' + g] = 1;
      folders.push(folder(CTITLE[g], list.map(c => {
        const strands = []; for (let f = 1; f <= c.core; f++) if (A.ix.used[c.id + ':' + f]) strands.push(f);
        const len = FT.cableLength(c), to = c.sub && S.subs[c.sub] ? S.subs[c.sub].name : nm(c.b);
        const tr = strands.slice(0, 24).map(f => { const t = F().traceStrand(c.id, f, A.ix); const dest = !t.down ? '—' : t.down.state === 'split' ? nm(t.down.node) + ' · ' + t.down.child.ratio : t.down.state === 'onu' ? t.down.sub.name : t.down.state === 'term' ? tx('منهية', 'terminated') : tx('مفتوحة', 'open'); return [dot(F().strandColor(c, f).hex) + ltr(esc(F().strandName(c, f))), '<bdi style="white-space:nowrap">' + esc(dest) + '</bdi>', t.reached ? ltr('PON ' + t.port) : '—']; });
        const card = CARD(null, CCOL[g], c.name, CTITLE[g], [[tx('من ← إلى', 'From → to'), ltr(esc(nm(c.a)) + ' → ' + esc(to))], [tx('الطول', 'Length'), ltr(num(len, 1) + ' m')], [tx('عدد الألياف', 'Fibres'), c.core], [tx('المستعمل / الاحتياط', 'Used / spare'), ltr(strands.length + ' / ' + (c.core - strands.length))], [tx('معيار الليف', 'Fibre standard'), ltr(esc(c.std))], [tx('طريقة التمديد', 'Laid as'), c.medium === 'aerial' ? tx('هوائي على الجدران', 'aerial') : c.medium === 'duct' ? tx('داخل أنبوب تحت الأرض', 'in a buried duct') : tx('مباشر', 'direct')]], SUBTABLE(tx('الألياف المستعملة ووجهتها', 'Used strands and where they go'), [tx('الشعرة', 'Strand'), tx('الوجهة', 'Destination'), 'PON'], tr));
        return placemark(c.name, 'cab_' + g, card, data('cable', { name: c.name, role: g, fibres: c.core, fibres_used: strands.length, standard: c.std, length_m: len.toFixed(1), from_node: nm(c.a), to_node: to }), line(cablePts(c)));
      })));
    });

    // ducts
    [['pipe_u', tx('الأنابيب تحت الأرض', 'Buried ducts'), p => p.ptype !== 'aerial', 'duct'], ['pipe_a', tx('المسارات الهوائية', 'Aerial routes'), p => p.ptype === 'aerial', 'aerial']].forEach(([st, title, fn, key]) => {
      const list = pipes.filter(fn); if (!list.length) return; present[key] = 1;
      folders.push(folder(title, list.map(p => { const cat = FT.PIPE_CAT.find(x => x.id === p.cat), len = FT.pathLen(p.pts); const card = CARD(null, st === 'pipe_u' ? '#2aa8ff' : '#ffc233', p.name, title, [[tx('النوع', 'Type'), ltr(esc(cat ? cat.name : p.ptype))], [tx('عدد الأنابيب بالمسار', 'Ducts in the run'), p.qty || 1], [tx('الطول', 'Length'), ltr(num(len, 1) + ' m')]].concat(st === 'pipe_u' ? [[tx('عمق الخندق', 'Trench depth'), ltr((p.depth || 30) + ' cm')], [tx('عرض الخندق', 'Width'), ltr((p.width || 6) + ' cm')], [tx('الغطاء', 'Cover'), ltr((p.cover == null ? 10 : p.cover) + ' cm')]] : []).concat([[tx('من ← إلى', 'From → to'), ltr(esc(nm(p.a)) + ' → ' + esc(nm(p.b)))]])); return placemark(p.name, st, card, data('duct', { name: p.name, type: cat ? cat.name : p.ptype, ducts: p.qty || 1, length_m: len.toFixed(1), depth_cm: p.depth, width_cm: p.width, cover_cm: p.cover }), line(p.pts)); })));
    });

    // splice closures in chambers
    if (opt.splices) { const list = Object.values(S.splices).filter(s => inN.has(s.node) && FT.isClosure(s)); if (list.length) present.splice = 1; folders.push(folder(tx('علب اللحام', 'Splice closures'), list.map(s => { const n = S.nodes[s.node], rows = spliceRows(n.id); return placemark(s.label || ('EK ' + nm(n.id)), 'splice', CARD('splice', '#ff6a3d', s.label || ('EK ' + nm(n.id)), tx('علبة لحام داخل ', 'Closure in ') + nm(n.id), [[tx('عدد اللحامات', 'Fusions'), rows.length]], SUBTABLE(tx('من ← إلى', 'Joins'), [tx('من', 'From'), tx('إلى', 'To')], rows)), '', point(n.ll)); }))); }

    // subscribers
    if (opt.subs) { const list = Object.values(S.subs).filter(s => inN.has(s.node) && s.ll); if (list.length) present.sub = 1; const traced = {}; A.subs.forEach(t => { if (t) traced[t.sub.id] = t; }); folders.push(folder(tx('المشتركون', 'Subscribers'), list.map(s => { const t = traced[s.id]; return placemark(s.name, 'sub', CARD('sub', '#2aa8ff', s.name, tx('مشترك مربوط', 'Connected subscriber'), [[tx('العلبة', 'Box'), ltr(esc(nm(s.node)))], [tx('المنفذ', 'Port'), s.port], [tx('العنوان', 'Address'), esc(s.addr || '—')], [tx('رقم المشترك', 'Number'), esc(s.subno || '—')]].concat(t && t.budget ? [['OLT · PON', ltr(esc(nm(t.olt)) + ' · ' + t.port)], [tx('قوة الإشارة نزولاً', 'Signal down'), ltr(t.budget.down.rx.toFixed(2) + ' dBm')], [tx('قوة الإشارة صعوداً', 'Signal up'), ltr(t.budget.up.rx.toFixed(2) + ' dBm')], [tx('طول الليف', 'Fibre'), ltr(num(t.budget.fibreM + t.budget.dropM) + ' m')]] : [])), data('subscriber', { name: s.name, box: nm(s.node), port: s.port, address: s.addr, number: s.subno, rx_down_dbm: t && t.budget ? t.budget.down.rx.toFixed(2) : '' }), point(s.ll)); }))); }

    // houses and their 3D drawings
    if (opt.houses && houses.length) { present.house = 1; folders.push(folder('Houses — ' + tx('البيوت', 'houses'), houses.map(h => { const o = h.o || {}, served = o.fdb && S.nodes[o.fdb] ? nm(o.fdb) : '', floors = FT.houses.floorsOf(o), label = o.num ? FT.num.label(o) : (o.name || ''); return placemark(label || tx('بيت', 'house'), 'house', CARD('house', '#ff6a3d', label ? tx('بيت رقم ', 'House ') + label : tx('بيت', 'House'), tx('وحدة العمل: كل شي مربوط بالبيت', 'The planning unit'), [[tx('الرقم', 'Number'), esc(label || '—')], [tx('عدد الطوابق', 'Floors'), floors], [tx('اسم المبنى', 'Name'), esc(o.name || '—')], [tx('العلبة التي تخدمه', 'Served by'), served ? ltr(esc(served)) : tx('بلا علبة بعد', 'not yet')]]), data('house', { number: label, floors, name: o.name, served_by: served }), point(h.ll)); }))); }
    if (opt.buildings3d) { const list = houses.filter(h => h.ring && h.ring.length > 2); if (list.length) folders.push(folder('Building drawings — ' + tx('المباني ثلاثية الأبعاد', '3D buildings'), list.map(h => { const o = h.o || {}, floors = FT.houses.floorsOf(o), H = floors * 3.2, fed = o.fdb && S.nodes[o.fdb]; return placemark(o.num ? FT.num.label(o) : '', fed ? 'bld3d_fed' : 'bld3d', CARD('house', fed ? '#ff8a62' : '#b8ad98', tx('رسم المبنى', 'Building'), fed ? tx('مخدوم من ', 'Served by ') + nm(o.fdb) : tx('بلا علبة بعد', 'Not served yet'), [[tx('الطوابق', 'Floors'), floors], [tx('الارتفاع المقدّر', 'Estimated height'), ltr(H.toFixed(1) + ' m')]]), '', '<Polygon><extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>' + coords(h.ring.concat([h.ring[0]]), H.toFixed(1)) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>'); }))); }

    // two optional layers, switched off at first
    if (opt.signal) { const list = A.boxes.filter(r => r.node.type === 'bk' && inN.has(r.node.id)); folders.push(folder(tx('طبقة حالة الإشارة (فعّلها بالعين)', 'Signal status layer (tick to show)'), list.map(r => placemark(r.budget ? r.budget.down.rx.toFixed(1) + ' dBm' : STXT.broken, 'sig_' + status(r), CARD('sig_' + status(r), SCOL[status(r)], nm(r.node.id), STXT[status(r)], r.budget ? [[tx('الإشارة', 'Signal'), ltr(r.budget.down.rx.toFixed(2) + ' dBm')], [tx('الهامش', 'Margin'), ltr(Math.min(r.budget.lossMargin, r.budget.sensMargin).toFixed(2) + ' dB')]] : []), '', point(r.node.ll))), { hidden: true, about: tx('دوائر ملوّنة: أخضر سليمة، أصفر مراجعة، أحمر تتجاوز، أحمر غامق غير موصولة.', 'Green ok, yellow review, red over limit, dark red not connected.') })); }
    if (opt.pon) {
      const per = new Map(); A.boxes.filter(r => r.reached && r.node.type === 'bk' && inN.has(r.node.id)).forEach(r => { const k = r.olt + ':' + r.port; const set = per.get(k) || { olt: r.olt, port: r.port, cables: new Set(), boxes: [] }; r.steps.forEach(s => { if (s.type === 'strand') set.cables.add(s.cable); }); set.boxes.push(r); per.set(k, set); });
      const sub = [...per.values()].sort((a, b) => a.port - b.port).map((p, i) => '<Folder><name>' + esc(nm(p.olt)) + ' · PON ' + p.port + ' — ' + p.boxes.length + ' ' + tx('علبة', 'boxes') + '</name><visibility>0</visibility>' + [...p.cables].map(id => S.cables[id] ? placemark('PON ' + p.port + ' · ' + S.cables[id].name, 'pon' + (i % PONC.length), CARD(null, PONC[i % PONC.length], 'PON ' + p.port, tx('مسار منفذ PON واحد', 'The route of one PON port'), [[tx('الكبل', 'Cable'), esc(S.cables[id].name)], [tx('العلب على هالمنفذ', 'Boxes on this port'), ltr(esc(p.boxes.map(b => nm(b.node.id)).join(' · ')))]]), '', line(cablePts(S.cables[id]))).replace('</name>', '</name><visibility>0</visibility>') : '').join('') + '</Folder>');
      if (sub.length) folders.push('<Folder><name>' + esc(tx('مسارات منافذ PON (فعّل أي منفذ لترى طريقه)', 'PON port routes (tick one to see its path)')) + ' (' + sub.length + ')</name><visibility>0</visibility>' + sub.join('') + '</Folder>');
    }
    if (ring) folders.push(folder(tx('حدود المنطقة المصدّرة', 'Exported area'), [placemark(tx('حدود المنطقة', 'Area'), 'area', CARD(null, '#ff6a3d', tx('حدود المنطقة', 'Area'), '', [[tx('المساحة', 'Area'), ltr((FT.ringArea(ring) / 1e6).toFixed(3) + ' km²')]]), '', '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' + coords(ring.concat([ring[0]])) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>')]));

    // the first thing a stranger sees: what this file is and how to read it
    const boxes = A.boxes.filter(r => r.node.type === 'bk' && inN.has(r.node.id)), fed = boxes.filter(r => r.reached), worst = fed.slice().sort((a, b) => a.budget.down.rx - b.budget.down.rx)[0];
    const sum = a => a.reduce((x, y) => x + y, 0), count = t => nodes.filter(n => n.type === t).length;
    const symbols = Object.keys(SHORT).filter(t => present[t]).map(t => ['<img src="icons/' + t + '.png" width="24" height="24"/>', '<b>' + W[t][0] + '</b><br/>' + W[t][1]]);
    if (present.house) symbols.push(['<img src="icons/house.png" width="26" height="22"/>', '<b>' + tx('البيت', 'House') + '</b><br/>' + tx('رقمه وعدد طوابقه والعلبة اللي بتخدمه.', 'Number, floors and serving box.')]);
    if (present.sub) symbols.push(['<img src="icons/sub.png" width="22" height="22"/>', '<b>' + tx('مشترك', 'Subscriber') + '</b>']);
    const bar = (hex, h) => '<div style="width:34px;height:' + h + 'px;background:' + hex + ';border-radius:3px">&#160;</div>';
    [['c_Feeder', CCOL.Feeder, 7, tx('كبل تغذية: من المقسم المركزي للخزانة', 'Feeder: OLT to cabinet')], ['c_Distribution', CCOL.Distribution, 5, tx('كبل توزيع: من الخزانة لعلبة المبنى', 'Distribution: cabinet to box')], ['c_Drop', CCOL.Drop, 3, tx('كبل مشترك: من العلبة للبيت', 'Drop: box to home')], ['duct', '#2aa8ff', 9, tx('أنبوب تحت الأرض (خندق دقيق) بيمشي فيه الكبل', 'Buried duct carrying the cables')], ['aerial', '#ffc233', 6, tx('مسار هوائي على الجدران', 'Aerial route on walls')]].forEach(v => { if (present[v[0]]) symbols.push([bar(v[1], v[2]), v[3]]); });
    const guide = CARD(null, '#ff6a3d', tx('📖 كيف تقرأ هذا الملف', '📖 How to read this file'), (S.meta.name || 'FTTH') + ' · ' + new Date().toLocaleDateString('en-GB'),
      [[tx('شو هاد الملف؟', 'What is this?'), '<span style="font-weight:normal">' + tx('مخطط شبكة ألياف ضوئية للمنازل (FTTH): الإشارة بتطلع من المقسم المركزي، بتنقسم بالخزانة، وبعدين بعلبة المبنى، وبتوصل للبيت.', 'A fibre-to-the-home plan: the signal leaves the central office, is split at a cabinet, split again at the building box and reaches the home.') + '</span>'],
        [tx('طريقة الاستعمال', 'How to use'), '<span style="font-weight:normal">' + tx('1) اضغط على أي رمز أو خط لتشوف بطاقته.  2) من القائمة اليسار شيل أو حط علامة لتخفي أو تظهر أي طبقة.  3) مرّر الماوس فوق عنصر ليظهر اسمه.  4) أمِل الخريطة (Shift + العجلة) لتشوف المباني ثلاثية الأبعاد.', '1) Click any symbol or line for its card. 2) Tick/untick layers in the left list. 3) Hover to see names. 4) Tilt (Shift + wheel) for 3D.') + '</span>']],
      SUBTABLE(tx('معنى الرموز والألوان', 'Symbols and colours'), [tx('الرمز', 'Symbol'), tx('معناه', 'Meaning')], symbols) +
      SUBTABLE(tx('أرقام المشروع', 'Project figures'), [tx('البند', 'Item'), tx('القيمة', 'Value')], [['OLT', count('olt')], [tx('خزائن', 'Cabinets'), count('sk') + count('dk')], [tx('علب مباني', 'Building boxes'), count('bk')], [tx('بيوت', 'Houses'), houses.length], [tx('مشتركين', 'Subscribers'), Object.values(S.subs).filter(s => inN.has(s.node)).length], [tx('مناهل وغرف', 'Chambers'), count('mh') + count('hh')], [tx('طول الكبلات', 'Cable length'), ltr(num(sum(cables.map(c => FT.cableLength(c)))) + ' m')], [tx('طول مسارات الأنابيب', 'Duct routes'), ltr(num(sum(pipes.map(p => FT.pathLen(p.pts)))) + ' m')], [tx('علب موصولة حتى المقسم', 'Boxes connected'), ltr(fed.length + ' / ' + boxes.length)], [tx('أضعف إشارة', 'Weakest signal'), worst ? ltr(worst.budget.down.rx.toFixed(2) + ' dBm — ' + esc(nm(worst.node.id))) : '—']]) +
      '<div style="font-size:11.5px;color:#5a6377;margin:8px 4px">' + tx('قوة الإشارة بوحدة dBm: كل ما كان الرقم أقرب للصفر الإشارة أقوى. أضعف قيمة مقبولة لجهاز المشترك ' + ltr(C.onuSens + ' dBm') + '. الأرقام تقدير تخطيطي ويلزم قياس ميداني.', 'Signal in dBm: closer to zero is stronger; the weakest acceptable at the subscriber unit is ' + C.onuSens + ' dBm. Planning estimates.') + '</div>');
    const all = []; nodes.forEach(n => all.push(n.ll)); pipes.forEach(p => p.pts.forEach(q => all.push(q))); if (ring) ring.forEach(q => all.push(q)); if (!all.length) houses.forEach(h => all.push(h.ll));
    const bb = all.length ? FT.bboxOf(all) : [36.70, 34.72, 36.72, 34.74], mid = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], diag = Math.max(150, FT.dist([bb[0], bb[1]], [bb[2], bb[3]]));
    const guidePm = '<Placemark><name>' + esc(tx('📖 اقرأني أولاً: كيف تقرأ هذا الملف', '📖 Read me first')) + '</name><description>' + cd(guide) + '</description><styleUrl>#guide</styleUrl><gx:balloonVisibility>1</gx:balloonVisibility>' + point(mid) + '</Placemark>';
    let overlay = '', legendFile = null;
    if (opt.legend) { const L = await legend(pics, present); legendFile = { name: 'icons/legend.png', bytes: bytesOf(L.url) }; overlay = '<ScreenOverlay><name>' + esc(tx('مفتاح الخريطة (على الشاشة)', 'On-screen key')) + '</name><Icon><href>icons/legend.png</href></Icon><overlayXY x="0" y="0" xunits="fraction" yunits="fraction"/><screenXY x="12" y="40" xunits="pixels" yunits="pixels"/><size x="' + L.w + '" y="' + L.h + '" xunits="pixels" yunits="pixels"/></ScreenOverlay>'; }
    const kml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>' + esc('FTTH — ' + (S.meta.name || '')) + '</name><open>1</open><description>' + cd(guide) + '</description>' +
      '<LookAt><longitude>' + mid[0].toFixed(7) + '</longitude><latitude>' + mid[1].toFixed(7) + '</latitude><altitude>0</altitude><heading>0</heading><tilt>40</tilt><range>' + Math.round(diag * 1.25) + '</range></LookAt>' + styles.join('') + schemaXml + guidePm + overlay + folders.filter(Boolean).join('\n') + '</Document></kml>';
    const files = [{ name: 'doc.kml', bytes: new TextEncoder().encode(kml) }].concat([...used].map(n => ({ name: 'icons/' + n + '.png', bytes: bytesOf(pics[n]) }))).concat(legendFile ? [legendFile] : []);
    ['house', 'sub', 'splice'].forEach(n => { if (!used.has(n)) files.push({ name: 'icons/' + n + '.png', bytes: bytesOf(pics[n]) }); });
    return { kml, files, present, houses: houses.length, center: mid };
  };
  K.fileName = () => 'FTTH_' + String((FT.state.meta && FT.state.meta.name) || 'project').replace(/[^\w؀-ۿ-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.kmz';
  K.blob = async function (opt) { const r = await K.build(opt); return new Blob([FT.deliver.zip(r.files)], { type: 'application/vnd.google-earth.kmz' }); };
  K.download = async function (opt) { const b = await K.blob(opt); FT.exp.download(K.fileName(), b); U().toast('KMZ ✓'); };

  K.open = function () {
    const o = K.opt = K.opt || { houses: true, buildings3d: true, subs: true, splices: true, signal: true, pon: true, ducts: true, legend: true };
    const items = [['ducts', tx('الأنابيب والخنادق', 'Ducts and trenches')], ['houses', tx('البيوت (رقم وطوابق)', 'Houses')], ['buildings3d', tx('المباني ثلاثية الأبعاد', '3D buildings')], ['subs', tx('المشتركين', 'Subscribers')], ['splices', tx('اللحامات داخل البطاقات', 'Splice details')], ['signal', tx('قوة الإشارة ومسارها', 'Signal and path')], ['pon', tx('مسارات منافذ PON', 'PON routes')], ['legend', tx('مفتاح الخريطة على الشاشة', 'On-screen key')]];
    const body = () => '<p class="d">' + tx('ملف لـ Google Earth بيشرح حاله: صفحة «كيف تقرأ الملف»، مفتاح رموز على الشاشة، وبطاقة تفصيلية لكل عنصر.', 'A self-explaining Google Earth file.') + '</p><div class="seg" id="kzArea" style="margin-bottom:8px"><button type="button" data-m="all" class="' + (!K.ring ? 'on' : '') + '">' + tx('المشروع كامل', 'Whole project') + '</button><button type="button" data-m="draw" class="' + (K.ring ? 'on' : '') + '">⬠ ' + tx('ارسم منطقة', 'Draw an area') + '</button></div>' + items.map(([k, l]) => '<div class="fl"><input type="checkbox" data-kz="' + k + '"' + (o[k] ? ' checked' : '') + '><span>' + l + '</span></div>').join('');
    U().modal(tx('تصدير KMZ لـ Google Earth', 'Export KMZ for Google Earth'), body(), [{ label: FT.t('close'), fn: () => { K.ring = null; } }, { label: tx('⬇ تنزيل KMZ', '⬇ Download KMZ'), cls: 'pri', keep: true, id: 'kzGo', fn: async () => { const b = document.getElementById('kzGo'); if (b) { b.disabled = true; b.textContent = '…'; } try { await K.download(Object.assign({ ring: K.ring }, o)); K.ring = null; U().closeModal(); } catch (e) { console.error(e); U().toast('KMZ: ' + e.message); if (b) b.disabled = false; } } }], function wire(root) {
      root.querySelectorAll('[data-kz]').forEach(i => i.onchange = () => o[i.dataset.kz] = i.checked);
      root.querySelectorAll('#kzArea button').forEach(b => b.onclick = () => { if (b.dataset.m === 'all') { K.ring = null; root.innerHTML = body(); wire(root); return; } U().closeModal(); FT.T.startShape('poly', ring => { K.ring = ring; K.open(); }, tx('ارسم منطقة التصدير ثم Enter', 'Draw the export area, then Enter')); });
    });
  };
})(window);
