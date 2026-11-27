/* From the drawing to the ground: field measurements (OTDR / power meter) compared with the design, the build state of every
   element (planned, built, tested, problem) with a note and photos, and a phone "field mode" for the crew on site. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const V = FT.field = { active: false, overlay: false };
  const ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const $ = s => document.querySelector(s);
  const readOnly = () => !!(FT.store && FT.store.mode === 'view');
  const num = v => parseFloat(String(v).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.'));
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const nm = n => (n && (n.code || n.name)) || '?';

  // ================================================================ measurements against the design
  // what the meter should read from the exchange to the output of this box: the design loss without the assumed drop and
  // without the connector at the subscriber's end
  V.expected = function (nodeId, nmWave, walked) {
    const b = (walked || FT.fiber.boxBudgets())[nodeId]; if (!b) return null;
    const C = FT.fiber.cfg(), low = +nmWave === 1310, dir = low ? b.up : b.down;
    return dir.total - b.dropM / 1000 * (low ? C.att1310 : C.att1490) - C.connector;
  };
  V.LOW_BY = 4; // a reading this far under the design is as suspicious as a high one
  V.judge = function (n, walked) {
    const m = n && n.otdr; if (!m || !(m.db >= 0)) return null;
    const C = FT.fiber.cfg(), exp = V.expected(n.id, m.nm, walked);
    if (exp == null) return { db: m.db, exp: null, diff: null, status: m.db > FT.LIMITS.maxLoss ? 'over' : 'nopath' };
    const diff = m.db - exp;
    return { db: m.db, exp, diff, status: m.db > FT.LIMITS.maxLoss ? 'over' : diff > C.otdrTol ? 'high' : diff < -V.LOW_BY ? 'low' : 'ok' };
  };
  V.STATUS = { ok: ['مطابق للتصميم', 'matches the design', '#2bd18b'], high: ['أعلى من التصميم: افحص اللحامات والموصلات', 'higher than designed: check splices and connectors', '#ffc233'], low: ['أقل بكتير: تأكّد من القياس أو من بيانات التصميم', 'far lower: check the reading or the design data', '#ffc233'], over: ['فوق الحد المسموح', 'over the limit', '#ff4f7a'], nopath: ['لا يوجد مسار ملحوم للمقارنة', 'no spliced path to compare with', '#9aa1b6'] };
  V.measurements = function () {
    const walked = FT.fiber.boxBudgets(), rows = Object.values(FT.state.nodes).filter(n => n.otdr).map(n => Object.assign({ node: n }, V.judge(n, walked))).filter(r => r.status);
    const cmp = rows.filter(r => r.diff != null), count = { ok: 0, high: 0, low: 0, over: 0, nopath: 0 }; rows.forEach(r => count[r.status]++);
    return { rows, count, mean: cmp.length ? cmp.reduce((a, r) => a + r.diff, 0) / cmp.length : null, boxes: Object.values(FT.state.nodes).filter(n => n.type === 'bk').length };
  };
  V.setMeasure = function (n, m) { if (m && m.db >= 0) n.otdr = { db: +m.db, nm: +m.nm === 1310 ? 1310 : 1550, date: m.date || today(), by: m.by || '' }; else delete n.otdr; };

  // a sheet the crew fills in, and the way back
  const csvCell = v => /[",\r\n;]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  V.csvTemplate = function () {
    const walked = FT.fiber.boxBudgets(), boxes = Object.values(FT.state.nodes).filter(n => n.type === 'bk').sort((a, b) => nm(a).localeCompare(nm(b), undefined, { numeric: true }));
    return '﻿' + [['code', 'name', 'wavelength_nm', 'expected_dB', 'measured_dB', 'date', 'by']].concat(boxes.map(n => { const w = (n.otdr && n.otdr.nm) || 1550, x = V.expected(n.id, w, walked); return [n.code || '', n.name || '', w, x == null ? '' : x.toFixed(2), n.otdr ? n.otdr.db : '', (n.otdr && n.otdr.date) || '', (n.otdr && n.otdr.by) || '']; })).map(r => r.map(csvCell).join(',')).join('\r\n');
  };
  V.parseCsv = function (text) {
    text = String(text).replace(/^﻿/, ''); const first = text.split('\n')[0], sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c; }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  };
  V.importCsv = function (text) {
    const rows = V.parseCsv(text); if (rows.length < 2) return { applied: 0, unknown: [], bad: [], error: 'empty' };
    const head = rows[0].map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
    if (col('measured_db') < 0 || (col('code') < 0 && col('name') < 0)) return { applied: 0, unknown: [], bad: [], error: 'columns' };
    const byKey = {}; Object.values(FT.state.nodes).forEach(n => { if (n.name) byKey[n.name.trim().toLowerCase()] = n; }); Object.values(FT.state.nodes).forEach(n => { if (n.code) byKey[n.code.trim().toLowerCase()] = n; });
    const out = { applied: 0, unknown: [], bad: [] }, todo = [];
    rows.slice(1).forEach(r => {
      const get = k => col(k) >= 0 ? String(r[col(k)] || '').trim() : '', key = get('code') || get('name'), raw = get('measured_db'); if (!raw) return;
      const n = byKey[key.toLowerCase()] || byKey[get('name').toLowerCase()]; if (!n) { out.unknown.push(key); return; }
      const db = num(raw); if (!(db >= 0 && db < 80)) { out.bad.push(key + ': ' + raw); return; }
      todo.push([n, { db, nm: num(get('wavelength_nm')) || 1550, date: get('date'), by: get('by') }]);
    });
    if (todo.length) { FT.commit(); todo.forEach(([n, m]) => V.setMeasure(n, m)); out.applied = todo.length; FT.changed('otdr'); }
    return out;
  };
  V.downloadTemplate = () => FT.exp.download('ftth_measurements_' + today() + '.csv', new Blob([V.csvTemplate()], { type: 'text/csv;charset=utf-8' }));
  V.pickImport = function () {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,text/csv'; i.id = 'otdrFile'; i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return; if (readOnly()) { FT.UI.toast(FT.t('ro_msg')); return; } const r = V.importCsv(await f.text());
      FT.UI.toast(r.error ? tx('الملف ما فيه عمود measured_dB مع code أو name', 'The file needs measured_dB and code or name') : tx('انقرأ ' + r.applied + ' قياس' + (r.unknown.length ? ' · ' + r.unknown.length + ' رمز غير معروف' : '') + (r.bad.length ? ' · ' + r.bad.length + ' قيمة غلط' : ''), r.applied + ' reading(s) read' + (r.unknown.length ? ' · ' + r.unknown.length + ' unknown code(s)' : '') + (r.bad.length ? ' · ' + r.bad.length + ' bad value(s)' : ''))); };
    i.click();
  };

  // ================================================================ build state
  V.STATES = [['', 'مخطط', 'Planned', '#9aa1b6'], ['built', 'منفّذ', 'Built', '#ffc233'], ['tested', 'مفحوص', 'Tested', '#2bd18b'], ['issue', 'فيه مشكلة', 'Problem', '#ff4f7a']];
  V.stateOf = o => (o && o.bs && o.bs.s) || '';
  V.stateInfo = k => V.STATES.find(x => x[0] === k) || V.STATES[0];
  const bag = kind => FT.state[kind === 'node' ? 'nodes' : kind === 'pipe' ? 'pipes' : 'cables'];
  V.set = function (kind, id, patch) {
    const o = bag(kind)[id]; if (!o) return null;
    const b = Object.assign({}, o.bs || {}, patch, { d: today(), by: (FT.sync && FT.sync.name && FT.sync.name()) || '' });
    if (!b.s && !b.note && !(b.ph && b.ph.length)) delete o.bs; else o.bs = b;
    return o;
  };
  V.progress = function () {
    const S = FT.state, count = list => { const c = { total: 0, '': 0, built: 0, tested: 0, issue: 0 }; list.forEach(([k, w]) => { c[k] += w; c.total += w; }); c.done = c.total ? (c.built + c.tested) / c.total : 0; return c; };
    return { boxes: count(Object.values(S.nodes).filter(n => FT.BOX_TYPES.includes(n.type) || n.type === 'olt').map(n => [V.stateOf(n), 1])),
      chambers: count(Object.values(S.nodes).filter(n => n.type === 'mh' || n.type === 'hh').map(n => [V.stateOf(n), 1])),
      pipes: count(Object.values(S.pipes).map(p => [V.stateOf(p), FT.pathLen(p.pts)])),
      cables: count(Object.values(S.cables).map(c => [V.stateOf(c), FT.cableLength(c)])) };
  };
  V.progressRows = function () {
    const p = V.progress();
    return [[tx('العلب والخزائن', 'Boxes and cabinets'), p.boxes, v => String(Math.round(v))], [tx('المناهل والغرف', 'Manholes and handholes'), p.chambers, v => String(Math.round(v))], [tx('الأنابيب', 'Ducts'), p.pipes, v => FT.fmtLenShort(v)], [tx('الكابلات', 'Cables'), p.cables, v => FT.fmtLenShort(v)]].filter(r => r[1].total > 0);
  };
  V.summaryHtml = function () {
    const rows = V.progressRows(); if (!rows.length) return '';
    const bar = c => '<div style="display:flex;height:8px;border-radius:5px;overflow:hidden;background:#232a38;margin:3px 0 8px">' + ['tested', 'built', 'issue'].map(k => '<i style="width:' + (c[k] / c.total * 100).toFixed(1) + '%;background:' + V.stateInfo(k)[3] + '"></i>').join('') + '</div>';
    const m = V.measurements();
    return '<h3 style="margin-top:14px">' + tx('نسبة التنفيذ', 'Build progress') + '</h3>' + rows.map(([a, c, f]) => '<div class="kv"><span>' + a + '</span><b>' + Math.round(c.done * 100) + '% <small>' + FT.lt(f(c.built + c.tested) + ' / ' + f(c.total)) + (c.issue ? ' · <span style="color:#ff4f7a">⚠ ' + FT.lt(f(c.issue)) + '</span>' : '') + '</small></b></div>' + bar(c)).join('') +
      (m.rows.length ? '<div class="kv"><span>' + tx('قياسات ميدانية', 'Field readings') + '</span><b>' + m.rows.length + ' / ' + m.boxes + ' · <span style="color:#2bd18b">✔ ' + m.count.ok + '</span> <span style="color:#ffc233">⚠ ' + (m.count.high + m.count.low) + '</span> <span style="color:#ff4f7a">✘ ' + m.count.over + '</span></b></div>' + (m.mean != null ? '<div class="kv"><span>' + tx('متوسط الفرق عن التصميم', 'Average difference from the design') + '</span><b>' + FT.lt((m.mean >= 0 ? '+' : '') + m.mean.toFixed(2) + ' dB') + '</b></div>' : '') : '');
  };
  V.csvState = function () {
    const rows = [['kind', 'code', 'name', 'type', 'state', 'date', 'by', 'note', 'photos', 'lat', 'lon']];
    const put = (kind, o, type, ll) => { const b = o.bs || {}; rows.push([kind, o.code || '', o.name || '', type, V.stateInfo(b.s || '')[2], b.d || '', b.by || '', b.note || '', (b.ph || []).length, ll ? ll[1].toFixed(6) : '', ll ? ll[0].toFixed(6) : '']); };
    Object.values(FT.state.nodes).forEach(n => put('node', n, (FT.NODE_TYPES[n.type] || {}).short || n.type, n.ll));
    Object.values(FT.state.pipes).forEach(p => put('duct', p, p.ptype, p.pts && p.pts[0]));
    Object.values(FT.state.cables).forEach(c => put('cable', c, c.core + 'C', null));
    return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  };

  // ================================================================ photos: kept outside the project (they are heavy)
  const P = V.photos = { shared: null }; // shared: null = not tried yet, true = the server keeps them, false = this device only
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('ft2_photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const idb = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('p', mode), q = fn(t.objectStore('p')); t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error); }); };
  const pkey = id => ((FT.store && FT.store.cur && FT.store.cur.id) || 'local') + '/' + id;
  const cloud = () => FT.store && FT.store.cur && FT.store.cur.key !== 'local';
  P.shrink = file => new Promise((res, rej) => {
    const im = new Image(), url = URL.createObjectURL(file);
    im.onload = () => { URL.revokeObjectURL(url); const k = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      let q = 0.65, out = c.toDataURL('image/jpeg', q); while (out.length > 190000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); } res(out); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); }; im.src = url;
  });
  P.put = async function (data) {
    const id = FT.uid('p') + Date.now().toString(36);
    await idb('readwrite', s => s.put({ data, sent: false }, pkey(id)));
    if (cloud()) { try { await FT.store.rpc('ftth_photo_put', { p_id: FT.store.cur.id, p_key: FT.store.cur.key, p_photo: id, p_data: data }); P.shared = true; await idb('readwrite', s => s.put({ data, sent: true }, pkey(id))); } catch (e) { P.shared = false; } }
    return id;
  };
  P.get = async function (id) {
    try { const x = await idb('readonly', s => s.get(pkey(id))); if (x) return x.data; } catch (e) { }
    if (cloud()) { try { const d = await FT.store.rpc('ftth_photo_get', { p_id: FT.store.cur.id, p_key: FT.store.cur.key, p_photo: id }); if (d) { try { await idb('readwrite', s => s.put({ data: d, sent: true }, pkey(id))); } catch (e) { } return d; } } catch (e) { } }
    return null;
  };
  // photos taken while the server could not take them go up later
  P.flush = async function () {
    if (!cloud() || readOnly()) return 0; let n = 0;
    const d = await db(), keys = await new Promise(res => { const q = d.transaction('p').objectStore('p').getAllKeys(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
    for (const k of keys) { if (String(k).indexOf(FT.store.cur.id + '/') !== 0) continue; const x = await idb('readonly', s => s.get(k)); if (!x || x.sent) continue; try { await FT.store.rpc('ftth_photo_put', { p_id: FT.store.cur.id, p_key: FT.store.cur.key, p_photo: String(k).split('/')[1], p_data: x.data }); await idb('readwrite', s => s.put({ data: x.data, sent: true }, k)); n++; P.shared = true; } catch (e) { P.shared = false; break; } }
    return n;
  };
  V.MAX_PHOTOS = 6;
  V.addPhoto = async function (kind, id, file) {
    const o = bag(kind)[id]; if (!o) return false; if (((o.bs && o.bs.ph) || []).length >= V.MAX_PHOTOS) { FT.UI.toast(tx('أكتر شي ' + V.MAX_PHOTOS + ' صور للعنصر', 'At most ' + V.MAX_PHOTOS + ' photos per element')); return false; }
    let data; try { data = await P.shrink(file); } catch (e) { FT.UI.toast(tx('الملف مو صورة', 'That file is not a picture')); return false; }
    const ph = await P.put(data); FT.commit(); const cur = bag(kind)[id]; if (!cur) return false; V.set(kind, id, { ph: ((cur.bs && cur.bs.ph) || []).concat(ph) }); FT.changed('build');
    if (P.shared === false && cloud()) FT.UI.toast(tx('الصورة محفوظة على هالجهاز بس، لسا ما وصلت للسيرفر', 'The photo is on this device only, not on the server yet'));
    return true;
  };

  // ================================================================ the block shown in the properties panel and on the phone
  V.panel = function (kind, o) {
    const ro = readOnly(), s = V.stateOf(o), b = o.bs || {}, isBox = kind === 'node' && o.type === 'bk';
    let h = '<div class="fv-box"><h4 class="fx-h">' + tx('حالة التنفيذ', 'Build state') + '</h4><div class="seg fv-seg">' + V.STATES.map(x => '<button type="button" data-bs="' + x[0] + '" class="' + (s === x[0] ? 'on' : '') + '" style="--c:' + x[3] + '"' + (ro ? ' disabled' : '') + '>' + tx(x[1], x[2]) + '</button>').join('') + '</div>' +
      (b.d ? '<p class="d">' + tx('آخر تحديث: ', 'Last update: ') + FT.lt(b.d) + (b.by ? ' · ' + esc(b.by) : '') + '</p>' : '') +
      '<textarea id="fvNote" rows="2" placeholder="' + tx('ملاحظة من الموقع', 'Note from the site') + '"' + (ro ? ' readonly' : '') + '>' + esc(b.note || '') + '</textarea>' +
      '<div class="fv-photos">' + (b.ph || []).map(p => '<span class="fv-ph" data-ph="' + p + '"><img alt=""><button type="button" data-phdel="' + p + '" title="' + tx('حذف', 'remove') + '"' + (ro ? ' hidden' : '') + '>×</button></span>').join('') + (ro ? '' : '<label class="btn fv-add">📷 ' + tx('صورة', 'Photo') + '<input type="file" accept="image/*" capture="environment" id="fvFile" hidden></label>') + '</div>';
    if (isBox) {
      const m = o.otdr || {}, j = V.judge(o), exp = V.expected(o.id, m.nm || 1550);
      h += '<h4 class="fx-h">' + tx('القياس الميداني (من المقسم لحد مخرج العلبة)', 'Field reading (exchange to box output)') + '</h4>' +
        '<div class="kv"><span>' + tx('المتوقع من التصميم', 'Expected from the design') + '</span><b id="fvExp">' + (exp == null ? tx('بدها لحام أول', 'splice it first') : FT.lt(exp.toFixed(2) + ' dB')) + '</b></div>' +
        '<div class="two"><input id="fvDb" inputmode="decimal" placeholder="' + tx('الفقد المقاس dB', 'measured loss dB') + '" value="' + (m.db != null ? m.db : '') + '"' + (ro ? ' readonly' : '') + '><select id="fvNm"' + (ro ? ' disabled' : '') + '><option value="1550"' + (m.nm !== 1310 ? ' selected' : '') + '>1550 nm</option><option value="1310"' + (m.nm === 1310 ? ' selected' : '') + '>1310 nm</option></select></div>' +
        (ro ? '' : '<button type="button" class="btn full" id="fvSaveM" style="margin-top:6px">' + tx('احفظ القياس', 'Save the reading') + '</button>') +
        (j ? '<div class="fv-judge" style="--c:' + V.STATUS[j.status][2] + '"><b>' + tx(V.STATUS[j.status][0], V.STATUS[j.status][1]) + '</b>' + (j.diff != null ? '<span>' + FT.lt((j.diff >= 0 ? '+' : '') + j.diff.toFixed(2) + ' dB') + '</span>' : '') + '</div>' : '');
    }
    return h + '</div>';
  };
  V.wire = function (root, kind, id, again) {
    const el = q => root.querySelector(q);
    root.querySelectorAll('[data-bs]').forEach(b => b.onclick = () => { if (readOnly()) return; FT.commit(); V.set(kind, id, { s: b.dataset.bs }); FT.changed('build'); again(); });
    const note = el('#fvNote'); if (note) note.onchange = () => { if (readOnly()) return; FT.commit(); V.set(kind, id, { note: note.value.trim() }); FT.changed('build'); };
    const file = el('#fvFile'); if (file) file.onchange = async () => { const f = file.files[0]; if (f && await V.addPhoto(kind, id, f)) again(); };
    root.querySelectorAll('.fv-ph').forEach(async span => { const d = await P.get(span.dataset.ph), img = span.querySelector('img'); if (!img) return; if (d) { img.src = d; img.onclick = () => V.showPhoto(d); } else { img.replaceWith(Object.assign(document.createElement('small'), { textContent: tx('الصورة على جهاز تاني', 'photo is on another device') })); } });
    root.querySelectorAll('[data-phdel]').forEach(b => b.onclick = () => { if (readOnly()) return; const o = bag(kind)[id]; FT.commit(); V.set(kind, id, { ph: ((o.bs && o.bs.ph) || []).filter(p => p !== b.dataset.phdel) }); FT.changed('build'); again(); });
    const sm = el('#fvSaveM'); if (sm) sm.onclick = () => { const raw = el('#fvDb').value.trim(), v = num(raw); if (raw && !(v >= 0 && v < 80)) { FT.UI.toast(tx('اكتب رقم صحيح', 'Type a valid number')); return; } FT.commit(); V.setMeasure(FT.state.nodes[id], raw ? { db: v, nm: +el('#fvNm').value, by: (FT.sync && FT.sync.name && FT.sync.name()) || '' } : null); FT.changed('otdr'); again(); };
    const w = el('#fvNm'); if (w) w.onchange = () => { const x = V.expected(id, +w.value); el('#fvExp').textContent = x == null ? '—' : FT.lt(x.toFixed(2) + ' dB'); };
  };
  V.showPhoto = function (d) { const o = document.createElement('div'); o.id = 'fvView'; o.innerHTML = '<img alt="">'; o.querySelector('img').src = d; o.onclick = () => o.remove(); document.body.appendChild(o); };
  V.attach = function (body, kind, id) {
    const o = bag(kind)[id]; if (!o) return; let host = body.querySelector('#fvHost'); if (!host) { host = document.createElement('div'); host.id = 'fvHost'; const del = body.querySelector('#pDel'); if (del) del.before(host); else body.appendChild(host); }
    const draw = () => { const cur = bag(kind)[id]; if (!cur || !host.isConnected) return; host.innerHTML = V.panel(kind, cur); V.wire(host, kind, id, draw); };
    draw();
  };

  // ================================================================ the state painted on the map
  function overlayData() {
    const S = FT.state, pts = [], lines = [];
    Object.values(S.nodes).forEach(n => { const j = n.otdr ? V.judge(n) : null; pts.push({ type: 'Feature', properties: { c: V.stateInfo(V.stateOf(n))[3], ring: j ? V.STATUS[j.status][2] : '#07090d' }, geometry: { type: 'Point', coordinates: n.ll } }); });
    Object.values(S.pipes).forEach(p => lines.push({ type: 'Feature', properties: { c: V.stateInfo(V.stateOf(p))[3], s: V.stateOf(p) }, geometry: { type: 'LineString', coordinates: p.pts } }));
    Object.values(S.cables).forEach(c => { const line = [].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts)); if (line.length > 1) lines.push({ type: 'Feature', properties: { c: V.stateInfo(V.stateOf(c))[3], s: V.stateOf(c) }, geometry: { type: 'LineString', coordinates: line } }); });
    return { pts: { type: 'FeatureCollection', features: pts }, lines: { type: 'FeatureCollection', features: lines } };
  }
  V.paint = function () {
    const map = FT.map && FT.map.map; if (!map || !map.isStyleLoaded || !map.getStyle()) return;
    const have = !!map.getSource('fv-pt');
    if (!V.overlay) { if (have) ['fv-ln', 'fv-pt'].forEach(l => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', 'none')); return; }
    const d = overlayData();
    if (!have) {
      map.addSource('fv-ln', { type: 'geojson', data: d.lines }); map.addSource('fv-pt', { type: 'geojson', data: d.pts });
      map.addLayer({ id: 'fv-ln', type: 'line', source: 'fv-ln', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 5, 'line-opacity': ['case', ['==', ['get', 's'], ''], 0.45, 0.95] } });
      map.addLayer({ id: 'fv-pt', type: 'circle', source: 'fv-pt', paint: { 'circle-radius': 9, 'circle-color': ['get', 'c'], 'circle-stroke-color': ['get', 'ring'], 'circle-stroke-width': 3 } });
    } else { map.getSource('fv-ln').setData(d.lines); map.getSource('fv-pt').setData(d.pts); ['fv-ln', 'fv-pt'].forEach(l => map.setLayoutProperty(l, 'visibility', 'visible')); }
  };
  V.toggleOverlay = function (on) { V.overlay = on == null ? !V.overlay : !!on; V.paint(); const b = $('#bBuild'); if (b) b.classList.toggle('on', V.overlay); const k = $('#fvKey'); if (k) k.remove();
    if (V.overlay) { const key = document.createElement('div'); key.id = 'fvKey'; key.innerHTML = V.STATES.map(x => '<span><i style="background:' + x[3] + '"></i>' + tx(x[1], x[2]) + '</span>').join(''); ($('#mapwrap') || document.body).appendChild(key); } };
  let paintT = 0;
  FT.onChange(why => { if (!V.overlay) return; if (why === 'load') setTimeout(V.paint, 1200); else { clearTimeout(paintT); paintT = setTimeout(V.paint, 300); } });

  // ================================================================ the phone: field mode
  function distTo(ll, line) { return FT.dist(ll, FT.nearestOnPath(ll, line).pt); }
  // the element a finger meant: a node first, else the nearest cable or duct
  V.pickAt = function (point) {
    const map = FT.map.map, px = ll => map.project(ll); let best = null;
    Object.values(FT.state.nodes).forEach(n => { const q = px(n.ll), d = Math.hypot(q.x - point.x, q.y - point.y); if (d <= 30 && (!best || d < best.d)) best = { kind: 'node', id: n.id, d }; });
    if (best) return best;
    const seg = pts => { let m = 1e9; for (let i = 1; i < pts.length; i++) { const a = px(pts[i - 1]), b = px(pts[i]), dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / L)) : 0; m = Math.min(m, Math.hypot(a.x + t * dx - point.x, a.y + t * dy - point.y)); } return m; };
    Object.values(FT.state.cables).forEach(c => { const d = seg([].concat(...FT.cableSpans(c).map((s, i) => i ? s.pts.slice(1) : s.pts))); if (d <= 20 && (!best || d < best.d)) best = { kind: 'cable', id: c.id, d }; });
    Object.values(FT.state.pipes).forEach(p => { const d = seg(p.pts); if (d <= 20 && (!best || d < best.d)) best = { kind: 'pipe', id: p.id, d }; });
    return best;
  };
  const KIND = { node: ['عنصر', 'Element'], cable: ['كبل', 'Cable'], pipe: ['أنبوب', 'Duct'] };
  V.sheet = function (kind, id) {
    const o = bag(kind)[id]; if (!o) return; V.closeSheet();
    const box = document.createElement('div'); box.id = 'fvSheet';
    const draw = () => { const cur = bag(kind)[id]; if (!cur) { V.closeSheet(); return; } const sub = kind === 'node' ? FT.nodeTypeName(cur.type) : kind === 'cable' ? cur.core + 'C · ' + FT.fmtLenShort(FT.cableLength(cur)) : FT.fmtLenShort(FT.pathLen(cur.pts));
      box.innerHTML = '<div class="fv-head"><div><b>' + esc(cur.code || cur.name) + '</b><small>' + tx(KIND[kind][0], KIND[kind][1]) + ' · ' + esc(sub) + '</small></div><button type="button" id="fvClose">×</button></div><div class="fv-body">' + V.panel(kind, cur) + (kind === 'node' ? '<a class="btn full fv-nav" target="_blank" rel="noopener" href="geo:' + cur.ll[1].toFixed(6) + ',' + cur.ll[0].toFixed(6) + '?q=' + cur.ll[1].toFixed(6) + ',' + cur.ll[0].toFixed(6) + '">🧭 ' + tx('افتح المكان بتطبيق الخرائط', 'Open in a maps app') + '</a><p class="d" dir="ltr">' + cur.ll[1].toFixed(6) + ', ' + cur.ll[0].toFixed(6) + '</p>' : '') + '</div>';
      box.querySelector('#fvClose').onclick = V.closeSheet; V.wire(box, kind, id, draw); };
    document.body.appendChild(box); draw(); FT.map.setSelection(kind === 'node' ? 'node' : kind, id);
  };
  V.closeSheet = () => { const s = $('#fvSheet'); if (s) s.remove(); };
  V.nearby = function (ll, n) {
    return Object.values(FT.state.nodes).map(x => ({ node: x, m: FT.dist(ll, x.ll) })).sort((a, b) => a.m - b.m).slice(0, n || 12);
  };
  function list(title, rows) {
    V.closeSheet(); const box = document.createElement('div'); box.id = 'fvSheet';
    box.innerHTML = '<div class="fv-head"><div><b>' + title + '</b></div><button type="button" id="fvClose">×</button></div><div class="fv-body">' + (rows.map(r => '<button type="button" class="fv-row" data-go="' + r.node.id + '"><i style="background:' + V.stateInfo(V.stateOf(r.node))[3] + '"></i><span>' + esc(nm(r.node)) + '</span><small>' + (r.m != null ? FT.lt(Math.round(r.m) + ' m') : esc((FT.NODE_TYPES[r.node.type] || {}).short || '')) + '</small></button>').join('') || '<p class="d">—</p>') + '</div>';
    document.body.appendChild(box); box.querySelector('#fvClose').onclick = V.closeSheet;
    box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const n = FT.state.nodes[b.dataset.go]; FT.map.map.easeTo({ center: n.ll, zoom: 18.5 }); V.sheet('node', n.id); });
  }
  V.search = function (q) { q = String(q || '').trim().toLowerCase(); return Object.values(FT.state.nodes).filter(n => !q || ((n.code || '') + ' ' + (n.name || '') + ' ' + (n.label || '')).toLowerCase().includes(q)).slice(0, 40).map(node => ({ node })); };
  let meMarker = null;
  V.locate = function () {
    if (!navigator.geolocation) { FT.UI.toast(tx('الجهاز ما بيعطي الموقع', 'This device gives no position')); return; }
    navigator.geolocation.getCurrentPosition(p => { const ll = [p.coords.longitude, p.coords.latitude];
      if (!meMarker) { const e = document.createElement('div'); e.className = 'fv-me'; meMarker = new maplibregl.Marker({ element: e }).setLngLat(ll).addTo(FT.map.map); } else meMarker.setLngLat(ll);
      FT.map.map.easeTo({ center: ll, zoom: 17.8 }); list(tx('الأقرب إليك (دقة ' + Math.round(p.coords.accuracy) + ' م)', 'Nearest to you (±' + Math.round(p.coords.accuracy) + ' m)'), V.nearby(ll, 12));
    }, () => FT.UI.toast(tx('ما قدرنا ناخد الموقع. اسمح للمتصفح بالموقع.', 'No position. Allow location for this page.')), { enableHighAccuracy: true, timeout: 15000 });
  };
  V.start = function () {
    if (V.active) return; V.active = true; document.body.classList.add('field');
    const bar = document.createElement('div'); bar.id = 'fvBar';
    bar.innerHTML = '<button type="button" id="fvNear">📍<span>' + tx('قريب مني', 'Near me') + '</span></button><input id="fvSearch" placeholder="' + tx('ابحث برمز العلبة', 'Search a code') + '"><button type="button" id="fvProg">📊<span>' + tx('التنفيذ', 'Progress') + '</span></button>';
    document.body.appendChild(bar);
    $('#fvNear').onclick = V.locate;
    $('#fvSearch').onchange = e => list(tx('نتائج البحث', 'Results'), V.search(e.target.value));
    $('#fvProg').onclick = () => { V.closeSheet(); const box = document.createElement('div'); box.id = 'fvSheet'; box.innerHTML = '<div class="fv-head"><div><b>' + esc(FT.state.meta.name || '') + '</b></div><button type="button" id="fvClose">×</button></div><div class="fv-body">' + (V.summaryHtml() || '<p class="d">—</p>') + '</div>'; document.body.appendChild(box); box.querySelector('#fvClose').onclick = V.closeSheet; };
    const hook = () => { if (!FT.map || !FT.map.map) return void setTimeout(hook, 300); FT.map.map.on('click', e => { if (!V.active) return; const hit = V.pickAt(e.point); if (hit) V.sheet(hit.kind, hit.id); else V.closeSheet(); }); FT.map.map.dragRotate.disable(); V.toggleOverlay(true); setTimeout(() => FT.map.map.resize(), 200); };
    hook(); setTimeout(() => P.flush(), 6000); setInterval(() => P.flush(), 90000);
  };

  // ================================================================ in the report
  V.reportSections = function (sec, paged, T, code, escR) {
    const m = V.measurements();
    if (m.rows.length) sec(T('القياسات الميدانية', 'Field readings'), paged(T('القياسات الميدانية مقابل التصميم', 'Field readings against the design'), [[T('العلبة', 'Box'), 26], [T('الموجة', 'nm'), 8], [T('المتوقع dB', 'Expected'), 11], [T('المقاس dB', 'Measured'), 11], [T('الفرق', 'Difference'), 10], [T('التاريخ', 'Date'), 11], [T('النتيجة', 'Result'), 23]],
      m.rows.map(r => [code(nm(r.node)), String(r.node.otdr.nm), r.exp == null ? '—' : r.exp.toFixed(2), '<b>' + r.db.toFixed(2) + '</b>', r.diff == null ? '—' : '<bdi dir="ltr">' + (r.diff >= 0 ? '+' : '') + r.diff.toFixed(2) + '</bdi>', escR(r.node.otdr.date || ''), '<span style="color:' + V.STATUS[r.status][2] + ';font-weight:700">' + T(V.STATUS[r.status][0], V.STATUS[r.status][1]) + '</span>']),
      { intro: '<p class="note">' + T('قُرئ ' + m.rows.length + ' من ' + m.boxes + ' علبة. السماحية: ' + FT.fiber.cfg().otdrTol + ' dB فوق المتوقع.' + (m.mean != null ? ' متوسط الفرق: ' + (m.mean >= 0 ? '+' : '') + m.mean.toFixed(2) + ' dB.' : ''), m.rows.length + ' of ' + m.boxes + ' boxes read. Tolerance: ' + FT.fiber.cfg().otdrTol + ' dB over the expected value.') + '</p>' }));
    const all = [].concat(Object.values(FT.state.nodes), Object.values(FT.state.pipes), Object.values(FT.state.cables));
    if (all.some(o => o.bs)) {
      const rows = V.progressRows().map(([a, c, f]) => [a, f(c.total), f(c.tested), f(c.built), f(c.issue), '<b>' + Math.round(c.done * 100) + '%</b>']);
      const noted = all.filter(o => o.bs && (o.bs.s === 'issue' || o.bs.note)).slice(0, 200).map(o => [code(nm(o)), T(V.stateInfo(o.bs.s || '')[1], V.stateInfo(o.bs.s || '')[2]), escR(o.bs.note || ''), escR(o.bs.d || ''), escR(o.bs.by || ''), String((o.bs.ph || []).length)]);
      sec(T('حالة التنفيذ', 'Build state'), paged(T('نسبة التنفيذ', 'Build progress'), [[T('البند', 'Item'), 30], [T('الكل', 'Total'), 14], [T('مفحوص', 'Tested'), 14], [T('منفّذ', 'Built'), 14], [T('فيه مشكلة', 'Problem'), 14], [T('الإنجاز', 'Done'), 14]], rows).concat(noted.length ? paged(T('ملاحظات الموقع', 'Site notes'), [[T('العنصر', 'Element'), 24], [T('الحالة', 'State'), 11], [T('الملاحظة', 'Note'), 37], [T('التاريخ', 'Date'), 11], [T('بواسطة', 'By'), 11], [T('صور', 'Photos'), 6]], noted) : []));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
