/* Protection of the work. The browser keeps earlier versions of every project: before a deletion, before an automatic design,
   before a teammate's deletion arrives, when a project is opened, and while working. A version can bring back only what is
   missing (safe in a team: nobody's newer work is touched) or the whole drawing. When the server has the history functions,
   what was deleted there can be brought back too. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const H = FT.versions = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  H.COLLS = ['nodes', 'pipes', 'cables', 'splices', 'bld', 'subs', 'wdev', 'wlinks', 'imports', 'folders', 'fmap'];
  H.KEEP = 40; H.EVERY_MS = 10 * 60 * 1000; H.MAX_BYTES = 60 * 1024 * 1024;
  const WHY = { open: ['فتح المشروع', 'project opened'], work: ['أثناء العمل', 'while working'], delete: ['قبل حذف', 'before a deletion'], design: ['قبل تصميم تلقائي', 'before an automatic design'], remote: ['قبل حذف من زميل', "before a teammate's deletion"], load: ['قبل تحميل ملف', 'before loading a file'], restore: ['قبل استرجاع', 'before a restore'], manual: ['حفظ يدوي', 'saved by hand'] };
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('ft2_versions', 1); r.onupgradeneeded = () => { const s = r.result.createObjectStore('v', { keyPath: 'id', autoIncrement: true }); s.createIndex('pid', 'pid'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('v', mode), q = fn(t.objectStore('v')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  const pid = () => (FT.store && FT.store.cur && FT.store.cur.id) || '';
  const training = () => !!(FT.train && FT.train.on);
  const counts = s => ({ nodes: Object.keys(s.nodes || {}).length, cables: Object.keys(s.cables || {}).length, pipes: Object.keys(s.pipes || {}).length, houses: Object.keys(s.bld || {}).length, subs: Object.keys(s.subs || {}).length });
  const size = c => c.nodes + c.cables + c.pipes + c.houses + c.subs;
  let last = { pid: '', text: '', at: 0 };
  // the picture is taken at once (the caller is about to change the project); writing it can take its time
  H.snapshot = function (why) {
    if (!pid() || training() || (FT.store && FT.store.mode === 'view')) return Promise.resolve(null);
    const st = FT.state, c = counts(st); if (!size(c)) return Promise.resolve(null);
    const body = {}; H.COLLS.concat(['cfg', 'ord']).forEach(k => body[k] = st[k] || {});
    const text = JSON.stringify(body), project = pid(); if (last.pid === project && last.text === text) return Promise.resolve(null);
    last = { pid: project, text, at: Date.now() };
    const row = { pid: project, t: Date.now(), why, counts: c, bytes: text.length, state: text };
    return run('readwrite', s => s.add(row)).then(async id => { await H.trim(project); return id; }).catch(() => null);
  };
  H.auto = function () { if (Date.now() - last.at >= H.EVERY_MS || last.pid !== pid()) H.snapshot('work'); };
  H.list = async function (project) { const all = await run('readonly', s => s.index('pid').getAll(project || pid())); return (all || []).sort((a, b) => b.t - a.t || b.id - a.id); };
  H.trim = async function (project) {
    const rows = await H.list(project); let bytes = 0; const gone = [];
    rows.forEach((r, i) => { bytes += r.bytes; if (i >= H.KEEP || (i >= 3 && bytes > H.MAX_BYTES)) gone.push(r.id); });
    if (gone.length) await run('readwrite', s => { gone.forEach(id => s.delete(id)); });
  };
  H.get = id => run('readonly', s => s.get(id));

  // ---------------- bringing back ----------------
  H.missing = function (version) {
    const old = JSON.parse(version.state), out = {}; let n = 0;
    H.COLLS.forEach(c => { out[c] = Object.keys(old[c] || {}).filter(k => !(FT.state[c] || {})[k] || (c === 'bld' && FT.state[c][k].deleted && !old[c][k].deleted)); if (c !== 'fmap') n += out[c].length; });
    return { old, ids: out, n };
  };
  // only what is gone comes back; everything drawn or edited since stays as it is
  H.restoreMissing = async function (id) {
    const v = await H.get(id); if (!v || (FT.store && FT.store.mode === 'view')) return 0;
    await H.snapshot('restore'); const m = H.missing(v); if (!m.n) return 0;
    FT.commit(); H.COLLS.forEach(c => { FT.state[c] = FT.state[c] || {}; m.ids[c].forEach(k => { FT.state[c][k] = m.old[c][k]; }); });
    FT.fiber.prune(); FT.changed('restore'); return m.n;
  };
  H.restoreAll = async function (id) {
    const v = await H.get(id); if (!v || (FT.store && FT.store.mode === 'view')) return false;
    await H.snapshot('restore'); const old = JSON.parse(v.state);
    FT.commit(); H.COLLS.concat(['cfg']).forEach(c => { FT.state[c] = old[c] || {}; }); FT.T && FT.T.select(null); FT.changed('restore'); return true;
  };

  // ---------------- the server's own history (after the database upgrade) ----------------
  H.serverDeleted = async function (hours) {
    const c = FT.store && FT.store.cur; if (!c || c.key === 'local') return { ok: false, why: 'local' };
    try { const rows = await FT.store.rpc('ftth_deleted', { p_id: c.id, p_key: c.key, p_hours: hours || 168 }); return { ok: true, rows: rows || [] }; }
    catch (e) { return { ok: false, why: /PGRST202|Could not find the function| 404 /.test(String(e.message)) ? 'upgrade' : 'net' }; }
  };
  H.restoreServer = function (rows) {
    const FOLD = { nodes: 'n:', pipes: 'p:', cables: 'c:' }; let n = 0;
    FT.commit();
    rows.forEach(r => { if (!H.COLLS.includes(r.c) || !r.d || (FT.state[r.c] || {})[r.i]) return; FT.state[r.c] = FT.state[r.c] || {}; if (FOLD[r.c] && r.d.o) { FT.state[r.c][r.i] = r.d.o; if (r.d.f) { FT.state.fmap = FT.state.fmap || {}; FT.state.fmap[FOLD[r.c] + r.i] = r.d.f; } } else FT.state[r.c][r.i] = r.d; n++; });
    if (n) FT.changed('restore'); return n;
  };

  // ---------------- the window ----------------
  const when = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  H.open = async function () {
    const rows = await H.list(), view = FT.store && FT.store.mode === 'view';
    const line = v => { const m = H.missing(v).n; return '<tr><td>' + FT.lt(when(v.t)) + '<small class="fx-src">' + tx((WHY[v.why] || WHY.work)[0], (WHY[v.why] || WHY.work)[1]) + '</small></td><td>' + tx(v.counts.nodes + ' عنصر · ' + v.counts.cables + ' كبل · ' + v.counts.houses + ' بيت', v.counts.nodes + ' elements · ' + v.counts.cables + ' cables · ' + v.counts.houses + ' houses') + '<small class="fx-src">' + (m ? tx(m + ' شي ناقص عن الآن', m + ' item(s) missing today') : tx('ما في شي ناقص', 'nothing is missing')) + '</small></td><td style="white-space:nowrap">' + (view ? '' : '<button type="button" class="btn pri" data-miss="' + v.id + '"' + (m ? '' : ' disabled') + '>' + tx('رجّع المحذوف', 'Bring back deleted') + '</button> <button type="button" class="btn" data-all="' + v.id + '">' + tx('رجّع الكل', 'Restore all') + '</button>') + '</td></tr>'; };
    const body = '<p class="d">' + tx('المتصفح على هالجهاز بيحتفظ بآخر ' + H.KEEP + ' نسخة. «رجّع المحذوف» ما بيلمس يلي انرسم أو تعدّل بعدها. «رجّع الكل» بيبدّل الرسم كلو بالنسخة. والتنين بيتراجعو بـ Ctrl+Z.', 'This browser keeps the last ' + H.KEEP + ' versions on this computer. "Bring back deleted" leaves newer work alone. "Restore all" replaces the whole drawing. Both can be undone with Ctrl+Z.') + '</p>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px"><button type="button" class="btn" id="vNow">' + tx('احفظ نسخة هلق', 'Save a version now') + '</button><button type="button" class="btn" id="vSrv">' + tx('المحذوفات عالسيرفر', 'Deleted on the server') + '</button></div><div id="vSrvOut"></div>' +
      (rows.length ? '<table class="t">' + rows.map(line).join('') + '</table>' : '<p class="d">' + tx('لسا ما في نسخ لهالمشروع.', 'No versions of this project yet.') + '</p>');
    FT.UI.modal(tx('النسخ السابقة', 'Earlier versions'), body, [{ label: FT.t('close') }], root => {
      root.querySelector('#vNow').onclick = async () => { last.text = ''; await H.snapshot('manual'); H.open(); };
      root.querySelector('#vSrv').onclick = async () => {
        const out = root.querySelector('#vSrvOut'), r = await H.serverDeleted(168);
        if (!r.ok) { out.innerHTML = '<div class="warnbox">' + (r.why === 'upgrade' ? tx('سجل السيرفر لسا مو مفعّل. بيتفعّل بعد تشغيل ملف ترقية قاعدة البيانات.', 'The server history is not switched on yet; it needs the database upgrade file.') : r.why === 'local' ? tx('هالمشروع على هالجهاز بس.', 'This project is on this device only.') : tx('ما قدرنا نوصل للسيرفر.', 'The server could not be reached.')) + '</div>'; return; }
        out.innerHTML = r.rows.length ? '<div class="warnbox">' + tx(r.rows.length + ' عنصر انحذف خلال آخر 7 أيام.', r.rows.length + ' element(s) deleted in the last 7 days.') + (view ? '' : ' <button type="button" class="btn pri" id="vSrvGo">' + tx('رجّعهن', 'Bring them back') + '</button>') + '</div>' : '<p class="d">' + tx('ما في محذوفات عالسيرفر خلال آخر 7 أيام.', 'Nothing deleted on the server in the last 7 days.') + '</p>';
        const go = out.querySelector('#vSrvGo'); if (go) go.onclick = () => { const n = H.restoreServer(r.rows); FT.UI.toast(tx('رجع ' + n + ' عنصر', n + ' element(s) are back')); FT.UI.closeModal(); };
      };
      root.querySelectorAll('[data-miss]').forEach(b => b.onclick = async () => { const n = await H.restoreMissing(+b.dataset.miss); FT.UI.closeModal(); FT.UI.toast(tx('رجع ' + n + ' عنصر', n + ' item(s) are back')); });
      root.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { if (b.dataset.sure) { H.restoreAll(+b.dataset.all).then(ok => { FT.UI.closeModal(); if (ok) FT.UI.toast(tx('رجعت النسخة. Ctrl+Z بيتراجع.', 'Version restored. Ctrl+Z undoes it.')); }); return; } b.dataset.sure = 1; b.textContent = tx('أكيد؟ اضغط كمان مرة', 'Sure? Press again'); b.classList.add('bad'); });
    });
  };

  // ---------------- the moments a version is taken ----------------
  H.hook = function () {
    if (H.hooked) return; H.hooked = true;
    const commit = FT.commit; FT.commit = function () { H.auto(); return commit.apply(this, arguments); };
    if (FT.T && FT.T.deleteSelection) { const del = FT.T.deleteSelection; FT.T.deleteSelection = function () { H.snapshot('delete'); return del.apply(this, arguments); }; }
    if (FT.design && FT.design.apply) { const apply = FT.design.apply; FT.design.apply = function () { H.snapshot('design'); return apply.apply(this, arguments); }; }
    FT.onChange(why => { if (why === 'load') setTimeout(() => H.snapshot('open'), 2500); });
  };
  // called by the live sync just before a teammate's deletions are applied
  H.beforeRemote = function (changes) { if ((changes || []).some(ch => ch.d === null && ['nodes', 'pipes', 'cables', 'splices', 'bld', 'subs'].includes(ch.c))) H.snapshot('remote'); };
})(typeof window !== 'undefined' ? window : globalThis);
