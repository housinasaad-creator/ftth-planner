/* Organisation sign-in: one user name and password per organisation, at most five registered devices (enforced by the
   database, see sql/upgrade_v5.sql). After the fifth device the password registers nothing new. A project that is bound to
   an organisation opens only on its registered devices. The password is never kept in the browser. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const A = FT.auth = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const get = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const training = () => !!(FT.train && FT.train.on);

  A.org = () => get('ft2_org');
  // a long random number that stands for this browser; the server keeps only its fingerprint
  A.deviceToken = function () {
    let t = localStorage.getItem('ft2_device'); if (t && t.length >= 32) return t;
    const b = new Uint8Array(32); crypto.getRandomValues(b); t = Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('ft2_device', t); return t;
  };
  A.deviceName = function () {
    const u = navigator.userAgent || '', os = /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : '?';
    const br = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '?';
    return br + ' · ' + os;
  };
  // sent with every request, only while signed in
  A.headers = () => A.org() && !training() ? { 'x-ftth-device': A.deviceToken() } : {};
  const missing = e => /PGRST202|Could not find the function| 404 /.test(String(e && e.message));

  A.WHY = {
    wrong: ['اسم المستخدم أو كلمة المرور غلط.', 'Wrong user name or password.'],
    burned: ['كلمة المرور هي سجّلت أجهزتها كلها، وما بتسجّل جهاز جديد. اطلب من مدير الأداة يشيل جهاز أو يعطيك كلمة جديدة.', 'This password has registered all its devices and takes no new one. Ask the administrator to remove a device or set a new password.'],
    locked: ['محاولات غلط كتيرة. جرّب بعد ربع ساعة.', 'Too many wrong tries. Try again in 15 minutes.'],
    device: ['ما قدرنا نعرّف هالجهاز.', 'This device could not be identified.'],
    upgrade: ['تسجيل الدخول لسا مو مفعّل عالسيرفر. بيتفعّل بعد تشغيل ملف ترقية قاعدة البيانات.', 'Sign-in is not switched on at the server yet; it needs the database upgrade file.'],
    net: ['ما قدرنا نوصل للسيرفر.', 'The server could not be reached.']
  };
  A.login = async function (user, pass) {
    try {
      const r = await FT.store.rpc('ftth_login', { p_user: String(user || '').trim(), p_pass: String(pass || ''), p_device_token: A.deviceToken(), p_device_name: A.deviceName() });
      if (!r || !r.ok) return { ok: false, why: (r && r.why) || 'wrong' };
      localStorage.setItem('ft2_org', JSON.stringify({ name: r.org, user: String(user).trim().toLowerCase(), devices: r.devices, max: r.max })); A.paint(); return { ok: true, org: r.org, devices: r.devices, max: r.max };
    } catch (e) { return { ok: false, why: missing(e) ? 'upgrade' : 'net' }; }
  };
  A.logout = function () { localStorage.removeItem('ft2_org'); A.paint(); };
  A.claim = async function () {
    const c = FT.store && FT.store.cur; if (!c || c.key === 'local') return { ok: false, why: 'local' };
    try { const r = await FT.store.rpc('ftth_org_claim', { p_id: c.id, p_key: c.key, p_device_token: A.deviceToken() }); return r && r.ok ? { ok: true } : { ok: false, why: (r && r.why) || 'no' }; }
    catch (e) { return { ok: false, why: missing(e) ? 'upgrade' : 'net' }; }
  };
  A.refused = e => /device not allowed/i.test(String(e && e.message));

  A.paint = function () {
    const b = document.getElementById('bUser'); if (!b) return; const o = A.org();
    b.textContent = o ? '🏢 ' + o.name : FT.t('signin'); b.classList.toggle('on', !!o);
  };
  A.open = function () {
    if (training()) { FT.UI.toast(tx('تسجيل الدخول مو متاح بالتدريب.', 'Not available in the training project.')); return; }
    const o = A.org();
    if (o) {
      const c = FT.store && FT.store.cur, canClaim = c && c.key !== 'local' && FT.store.mode === 'edit';
      FT.UI.modal(tx('حساب الجهة', 'Organisation account'), '<div class="kv"><span>' + tx('الجهة', 'Organisation') + '</span><b>' + esc(o.name) + '</b></div><div class="kv"><span>' + tx('المستخدم', 'User') + '</span><b>' + esc(o.user) + '</b></div><div class="kv"><span>' + tx('الأجهزة المسجّلة', 'Registered devices') + '</span><b>' + FT.lt(o.devices + ' / ' + o.max) + '</b></div><div class="kv"><span>' + tx('هالجهاز', 'This device') + '</span><b>' + esc(A.deviceName()) + '</b></div>' +
        (canClaim ? '<p class="d" style="margin-top:10px">' + tx('إذا ربطت المشروع المفتوح بالجهة، ما بينفتح ولا بيتعدّل إلا من أجهزتها المسجّلة، حتى لو حدا معو الرابط.', 'A project bound to the organisation opens and changes only on its registered devices, even for someone who has the link.') + '</p><button type="button" class="btn full" id="auClaim">' + tx('اربط المشروع المفتوح بالجهة', 'Bind the open project to the organisation') + '</button><div id="auOut"></div>' : ''),
        [{ label: tx('تسجيل خروج', 'Sign out'), cls: 'bad', fn: () => A.logout() }, { label: FT.t('close') }], root => {
          const cl = root.querySelector('#auClaim'); if (cl) cl.onclick = async () => { if (!cl.dataset.sure) { cl.dataset.sure = 1; cl.textContent = tx('أكيد؟ اضغط كمان مرة', 'Sure? Press again'); return; } const r = await A.claim(); root.querySelector('#auOut').innerHTML = '<div class="warnbox">' + (r.ok ? tx('تمّ. المشروع صار لأجهزة الجهة بس.', 'Done. The project now belongs to the organisation devices only.') : r.why === 'upgrade' ? tx(A.WHY.upgrade[0], A.WHY.upgrade[1]) : tx('ما تمّ الربط.', 'It was not bound.')) + '</div>'; };
        });
      return;
    }
    FT.UI.modal(tx('دخول الجهة', 'Organisation sign-in'), '<p class="d">' + tx('كل جهة إلها اسم مستخدم وكلمة مرور، وبتسجّل عليهن خمسة أجهزة على الأكثر. كل جهاز بتدخل منو أول مرة بيحجز مكان.', 'Each organisation has one user name and password, for at most five devices. A device takes a place the first time it signs in.') + '</p><div class="f"><label>' + tx('اسم المستخدم', 'User name') + '</label><input id="auUser" autocomplete="username" style="direction:ltr"></div><div class="f"><label>' + tx('كلمة المرور', 'Password') + '</label><input id="auPass" type="password" autocomplete="current-password" style="direction:ltr"></div><div id="auOut"></div>',
      [{ label: FT.t('close') }, { label: tx('دخول', 'Sign in'), cls: 'pri', id: 'auGo', keep: true, fn: async () => {
        const u = document.getElementById('auUser').value, p = document.getElementById('auPass').value, out = document.getElementById('auOut'); if (!u.trim() || !p) return;
        const r = await A.login(u, p);
        if (r.ok) { FT.UI.closeModal(); FT.UI.toast(tx('أهلاً ' + r.org + ' · الأجهزة ' + r.devices + ' من ' + r.max, 'Welcome ' + r.org + ' · devices ' + r.devices + ' of ' + r.max)); }
        else if (out) out.innerHTML = '<div class="warnbox">' + tx((A.WHY[r.why] || A.WHY.wrong)[0], (A.WHY[r.why] || A.WHY.wrong)[1]) + '</div>';
      } }]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
