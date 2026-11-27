/* "Upload to the server" button in the header. It only says "saved" after the server has confirmed it, and then hands over the
   share links. A project file from the computer can be uploaded as a NEW shared project (the open one is never touched). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const C = FT.cloud = {};
  const $ = s => document.querySelector(s);
  const U = () => FT.UI, ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const team = () => !!(FT.sync && FT.sync.active);
  const counts = st => [[tx('عقد وعلب', 'Nodes and boxes'), Object.keys(st.nodes || {}).length], [tx('كبلات', 'Cables'), Object.keys(st.cables || {}).length], [tx('أنابيب', 'Ducts'), Object.keys(st.pipes || {}).length], [tx('بيوت معدّلة أو مرقّمة', 'Edited or numbered houses'), Object.keys(st.bld || {}).length], [tx('مشتركين', 'Subscribers'), Object.keys(st.subs || {}).length]];
  const countRows = st => counts(st).map(c => '<div class="kv"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>').join('');

  // send everything and wait for the server's answer -> {ok, why, pending, at}
  C.confirm = async function (timeoutMs) {
    const S = FT.store, limit = Date.now() + (timeoutMs || 25000);
    if (!S.cur) return { ok: false, why: 'none' };
    if (S.mode !== 'edit') return { ok: false, why: 'view' };
    if (S.isLocal()) return { ok: false, why: 'local' };
    if (team()) {
      FT.sync.scanNow(); FT.sync.flush();
      while (FT.sync.pending() > 0 && Date.now() < limit) { await wait(250); if (!FT.sync.active) break; }
      if (FT.sync.pending() > 0) return { ok: false, why: 'pending', pending: FT.sync.pending() };
      try { const r = await S.rpc('ftth_pull', { p_id: S.cur.id, p_key: S.cur.key, p_since: FT.sync.rev, p_client: FT.sync.client, p_name: FT.sync.name(), p_info: {}, p_limit: 1 }); if (!r) return { ok: false, why: 'net' }; }
      catch (e) { return { ok: false, why: 'net', detail: String(e.message || e) }; }
      FT.sync.scanNow(); if (FT.sync.pending() > 0) return C.confirm(Math.max(3000, limit - Date.now()));
      return { ok: true, at: new Date(), how: 'team' };
    }
    // a project saved as a whole: save, read it back and compare
    try {
      const st = FT.state; st.meta = st.meta || {};
      await S.rpc('ftth_save_project', { p_id: S.cur.id, p_key: S.cur.key, p_name: st.meta.name || S.cur.name, p_type: st.meta.type || S.cur.type, p_state: st });
      const back = await S.rpc('ftth_get_project', { p_id: S.cur.id, p_key: S.cur.key });
      if (!back || S.fingerprint(back.state) !== S.fingerprint(JSON.parse(JSON.stringify(st)))) return { ok: false, why: 'verify' };
      S.online = true; return { ok: true, at: new Date(), how: 'whole' };
    } catch (e) { S.online = false; return { ok: false, why: 'net', detail: String(e.message || e) }; }
  };

  const linkRows = () => {
    const L = FT.store.links(); if (!L) return '';
    const row = (lab, url, hint) => '<div class="f"><label>' + lab + '</label><div style="display:flex;gap:6px"><input readonly value="' + esc(url) + '" style="direction:ltr"><button type="button" class="btn" data-copy="' + esc(url) + '">' + FT.t('copy') + '</button></div><div class="d" style="margin-top:3px">' + hint + '</div></div>';
    return '<h4 class="fx-h">' + tx('شاركه مع زملاءك', 'Share it with your colleagues') + '</h4>' + row(tx('رابط التعديل (للي بيشتغل معك)', 'Edit link'), L.edit, tx('اللي معه هالرابط بيشوف وبيعدّل. ابعته بس للي بتثق فيه.', 'Whoever has it can edit. Send it only to people you trust.')) + (L.view ? row(tx('رابط العرض فقط', 'View-only link'), L.view, tx('بيشوف بدون ما يعدّل.', 'Can look, not change.')) : '');
  };
  const wireCopy = root => root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(() => U().toast(FT.t('copied')), () => { const i = b.previousElementSibling; i.select(); document.execCommand('copy'); U().toast(FT.t('copied')); }); });
  const fileButton = () => '<h4 class="fx-h">' + tx('عندك ملف مشروع على جهازك؟', 'Have a project file on this computer?') + '</h4><button type="button" class="btn full" id="clFile">📄 ' + tx('ارفعه كمشروع مشترك جديد', 'Upload it as a new shared project') + '</button><input type="file" id="clInput" accept=".json,application/json" hidden><p class="d">' + tx('المشروع المفتوح هلأ ما بيتغيّر.', 'The open project is not touched.') + '</p>';
  const wireFile = root => { const b = root.querySelector('#clFile'), i = root.querySelector('#clInput'); if (!b) return; b.onclick = () => i.click(); i.onchange = () => { const f = i.files[0]; if (f) C.openFile(f); }; };

  const box = (kind, title, text) => '<div class="cl-box ' + kind + '"><div class="cl-ico">' + (kind === 'ok' ? '✓' : kind === 'bad' ? '!' : '…') + '</div><div><b>' + title + '</b><p>' + text + '</p></div></div>';
  C.open = function () {
    const S = FT.store; if (!S.cur) return;
    if (S.isLocal()) return U().openUpload();
    if (S.mode !== 'edit') { U().modal(tx('رفع للسيرفر', 'Upload to the server'), box('wait', tx('إنت بوضع العرض فقط', 'View-only'), tx('ما بتقدر تعدّل ولا ترفع على هالمشروع.', 'You cannot change this project.')), [{ label: FT.t('close') }]); return; }
    let alive = true;
    U().modal(tx('رفع للسيرفر', 'Upload to the server'), '<div id="clBody">' + box('wait', tx('عم ببعت وبتأكد…', 'Sending and checking…'), tx('عم بستنّى السيرفر يأكّد استلام كل التعديلات.', 'Waiting for the server to confirm.')) + '</div>', [{ label: FT.t('close') }], null, () => { alive = false; });
    const run = async () => {
      const r = await C.confirm(); const body = $('#clBody'); if (!alive || !body) return;
      if (r.ok) {
        C.lastOk = r.at;
        body.innerHTML = box('ok', tx('كل شي محفوظ على السيرفر', 'Everything is on the server'), tx('السيرفر أكّد استلام كل تعديلاتك. ', 'The server confirmed all your changes. ') + FT.lt(r.at.toTimeString().slice(0, 8))) + countRows(FT.state) + linkRows() + fileButton();
        wireCopy(body); wireFile(body);
      } else {
        body.innerHTML = box('bad', tx('ما تأكّد الرفع', 'Not confirmed'), (r.why === 'pending' ? tx('لسا في ' + r.pending + ' تعديل ما وصل. ', r.pending + ' change(s) not sent yet. ') : r.why === 'verify' ? tx('النسخة اللي رجعت من السيرفر مو مطابقة. ', 'The copy read back does not match. ') : tx('ما قدرت أوصل للسيرفر. ', 'The server could not be reached. ')) + tx('تعديلاتك محفوظة على هالجهاز. لا تمسح بيانات المتصفح، وجرّب كمان مرة لما يمشي النت.', 'Your changes are kept on this computer. Try again when the connection is back.')) + '<button type="button" class="btn pri full" id="clRetry">' + tx('جرّب كمان مرة', 'Try again') + '</button>' + fileButton();
        body.querySelector('#clRetry').onclick = () => C.open(); wireFile(body);
      }
      C.button();
    };
    run();
  };

  // a project file from the computer -> a new project on the server, checked, opened, with its links
  C.uploadState = async function (state, name) {
    const S = FT.store, st = Object.assign(FT.blank(), JSON.parse(JSON.stringify(state)));
    st.meta = Object.assign({}, st.meta, { name: name || (st.meta && st.meta.name) || 'Homs', type: (st.meta && st.meta.type) || 'gpon' });
    FT.migrate(st);
    const text = JSON.stringify(st); if (new Blob([text]).size > 7500000) return { ok: false, why: 'big' };
    const sent = JSON.parse(text); let c, back;
    try { c = await S.rpc('ftth_create_project', { p_name: st.meta.name, p_type: st.meta.type, p_state: sent }); back = await S.rpc('ftth_get_project', { p_id: c.id, p_key: c.edit_key }); }
    catch (e) { return { ok: false, why: 'net', detail: String(e.message || e) }; }
    if (!back || S.fingerprint(back.state) !== S.fingerprint(sent)) return { ok: false, why: 'verify' };
    const reg = JSON.parse(localStorage.getItem('ft2_cloud') || '[]'); reg.push({ id: c.id, key: c.edit_key, viewKey: c.view_key, name: st.meta.name, type: st.meta.type, updated: Date.now(), mode: 'edit' }); localStorage.setItem('ft2_cloud', JSON.stringify(reg));
    if (!(await S.open(c.id))) return { ok: false, why: 'open' };
    if (S.cur) S.cur.viewKey = c.view_key;
    U().afterProject(); return { ok: true, id: c.id };
  };
  C.openFile = async function (file) {
    let st = null; try { st = JSON.parse(await file.text()); } catch (e) { st = null; }
    if (!st || !st.nodes || !st.pipes) { U().modal(tx('ملف مشروع', 'Project file'), box('bad', tx('هاد مو ملف مشروع', 'Not a project file'), tx('اختار الملف اللي نزل من «حفظ المشروع» بالأداة (بينتهي بـ json). ملفات KMZ و DXF بتنضاف من «استيراد».', 'Choose the .json saved by the planner.')), [{ label: FT.t('close') }]); return; }
    const suggested = (st.meta && st.meta.name) || file.name.replace(/\.json$/i, '');
    U().modal(tx('رفع ملف مشروع للسيرفر', 'Upload a project file'), '<div class="f"><label>' + FT.t('proj_name') + '</label><input id="clName" value="' + esc(suggested) + '"></div>' + countRows(st) + '<p class="d">' + tx('رح ينعمل مشروع مشترك جديد. المشاريع الموجودة ما بتتغيّر.', 'A new shared project will be created.') + '</p><div id="clMsg"></div>', [{ label: FT.t('cancel') }, { label: '☁ ' + tx('ارفع للسيرفر', 'Upload'), cls: 'pri', id: 'clGo', keep: true, fn: async () => {
      const go = $('#clGo'), msg = $('#clMsg'), nameIn = $('#clName'); go.disabled = true; msg.innerHTML = box('wait', tx('عم يرفع ويتأكد…', 'Uploading and checking…'), '');
      const r = await C.uploadState(st, nameIn.value.trim() || suggested);
      if (r.ok) { U().modal(tx('رفع للسيرفر', 'Upload to the server'), box('ok', tx('انرفع، وتأكّد إنه وصل كامل', 'Uploaded and checked'), tx('هلأ صار مشروع مشترك، وهو المفتوح قدامك.', 'It is now a shared project and is open.')) + countRows(FT.state) + linkRows(), [{ label: FT.t('close') }], wireCopy); C.button(); }
      else { go.disabled = false; msg.innerHTML = box('bad', tx('ما انرفع', 'Not uploaded'), r.why === 'big' ? tx('الملف أكبر من 7.5 ميغا.', 'The file is over 7.5 MB.') : r.why === 'verify' ? tx('اللي رجع من السيرفر مو مطابق، فما اعتمدته.', 'The copy read back did not match.') : tx('ما قدرت أوصل للسيرفر. الملف على جهازك متل ما هو.', 'The server could not be reached.')); }
    } }]);
  };

  // the header button: its dot tells the state at a glance
  C.state = () => { const S = FT.store; if (!S || !S.cur) return 'none'; if (S.isLocal()) return 'local'; if (S.mode !== 'edit') return 'view'; if (team()) return !FT.sync.online ? 'offline' : FT.sync.pending() ? 'sending' : 'saved'; return S.online === false ? 'offline' : 'saved'; };
  C.button = function () {
    const share = $('#bShare'); if (!share) return;
    let b = $('#bCloud'); if (!b) { b = document.createElement('button'); b.id = 'bCloud'; b.className = 'pill'; share.parentNode.insertBefore(b, share); b.onclick = () => C.open(); }
    const s = C.state(); b.style.display = s === 'none' || s === 'local' || s === 'view' ? 'none' : ''; // a local-only project has its own "upload" badge in this place
    if (b.dataset.s !== s + FT.lang) { b.dataset.s = s + FT.lang; b.innerHTML = '<i class="cl-dot ' + s + '"></i>☁ <span class="cl-lab">' + tx('رفع للسيرفر', 'Upload to server') + '</span>'; b.title = { saved: tx('كل التعديلات المرسلة وصلت. اضغط للتأكيد والمشاركة.', 'Changes are on the server. Click to confirm and share.'), sending: tx('في تعديلات عم تنبعت…', 'Sending changes…'), offline: tx('ما في اتصال بالسيرفر', 'No connection to the server') }[s] || ''; }
  };
  setInterval(() => { try { C.button(); } catch (e) { } }, 1200);

  // loading a project FILE over a shared project replaces it for the whole team: ask first, offer the safe way
  C.guardLoad = function (file, proceed) {
    const S = FT.store; if (!S || !S.cur || S.isLocal() || S.mode !== 'edit') return proceed();
    setTimeout(() => U().modal(tx('انتبه', 'Careful'), box('bad', tx('هاد المشروع مشترك على السيرفر', 'This project is shared'), tx('إذا حمّلت الملف هون، بينحذف محتوى المشروع المفتوح وبيتبدّل بمحتوى الملف، عندك وعند كل الفريق.', 'Loading the file here replaces the content for you and the whole team.')), [{ label: FT.t('cancel') }, { label: tx('ارفعه كمشروع جديد (آمن)', 'Upload as a new project (safe)'), cls: 'pri', keep: true, fn: () => C.openFile(file) }, { label: tx('استبدل محتوى المشروع المشترك', 'Replace the shared content'), cls: 'bad', fn: () => { proceed(); } }]), 0);
    return 'asked';
  };
})(window);
