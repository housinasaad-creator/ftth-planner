/* Wireless module: radio devices (AP / CPE / PTP), PTP & PTMP links, link budget, Fresnel zone, terrain line-of-sight.
   Terrain = public AWS Terrain Tiles (terrarium, no key). Own maths: FSPL, earth bulge (k=4/3), first Fresnel zone. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const W = FT.wl = { devType: 'ap' };
  const U = () => FT.UI;
  const DEF = {
    ap:  { name: 'AP',  freq: 5.8, txp: 23, gain: 17, h: 12, rxs: -82, color: '#35e0c9' },
    cpe: { name: 'CPE', freq: 5.8, txp: 20, gain: 23, h: 6,  rxs: -82, color: '#ffd24a' },
    ptp: { name: 'PTP', freq: 5.8, txp: 25, gain: 30, h: 15, rxs: -85, color: '#b57bff' },
  };
  W.DEF = DEF;
  const S = () => FT.state;
  const ens = () => { const s = S(); s.wdev = s.wdev || {}; s.wlinks = s.wlinks || {}; s.seq.wdev = s.seq.wdev || 0; s.seq.wlink = s.seq.wlink || 0; };

  // ---------------- terrain ----------------
  const tiles = {};
  async function tile(z, x, y) {
    const k = z + '/' + x + '/' + y; if (tiles[k]) return tiles[k];
    tiles[k] = (async () => {
      try {
        const r = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + k + '.png'); if (!r.ok) return null;
        const bmp = await createImageBitmap(await r.blob()); const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, 256, 256).data;
      } catch (e) { return null; }
    })();
    return tiles[k];
  }
  W.elev = async function (lon, lat) {
    const z = 12, n = 2 ** z, fx = (lon + 180) / 360 * n, fy = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
    const x = Math.floor(fx), y = Math.floor(fy), d = await tile(z, x, y); if (!d) return null;
    const px = Math.min(255, Math.floor((fx - x) * 256)), py = Math.min(255, Math.floor((fy - y) * 256)), i = (py * 256 + px) * 4;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  };

  // ---------------- link maths ----------------
  W.fspl = (dKm, fGHz) => 32.44 + 20 * Math.log10(fGHz * 1000) + 20 * Math.log10(Math.max(dKm, 0.001));
  W.analyze = async function (link) {
    const A = S().wdev[link.a], B = S().wdev[link.b]; if (!A || !B) return null;
    const d = FT.dist(A.ll, B.ll), dKm = d / 1000, f = A.freq || 5.8;
    const loss = W.fspl(dKm, f), cable = 2, rx = A.txp + A.gain + B.gain - loss - cable, sens = B.rxs, fade = rx - sens;
    const N = Math.max(20, Math.min(80, Math.round(d / 40))), prof = [];
    const eA = await W.elev(A.ll[0], A.ll[1]), eB = await W.elev(B.ll[0], B.ll[1]);
    const hA = (eA == null ? 0 : eA) + A.h, hB = (eB == null ? 0 : eB) + B.h; let worst = 1e9, terrainOK = eA != null && eB != null;
    for (let i = 0; i <= N; i++) {
      const t = i / N, lon = A.ll[0] + (B.ll[0] - A.ll[0]) * t, lat = A.ll[1] + (B.ll[1] - A.ll[1]) * t;
      const e = await W.elev(lon, lat), d1 = dKm * t, d2 = dKm * (1 - t), bulge = d1 * d2 / (12.74 * 4 / 3);
      const los = hA + (hB - hA) * t, r1 = 17.31 * Math.sqrt(Math.max(d1 * d2, 0) / (f * Math.max(dKm, 0.001)));
      if (e == null) terrainOK = false;
      const ground = (e == null ? 0 : e) + bulge, clear = los - ground - 0.6 * r1; worst = Math.min(worst, clear);
      prof.push({ d: d * t, ground, los, f60: los - 0.6 * r1, e: e == null ? 0 : e });
    }
    const status = !terrainOK ? 'unknown' : worst >= 0 ? 'clear' : worst > -0.6 * 0 - 15 && prof.every(p => p.los > p.ground) ? 'marginal' : 'blocked';
    const r1mid = 17.31 * Math.sqrt((dKm / 2) * (dKm / 2) / (f * Math.max(dKm, 0.001)));
    return { d, dKm, loss, rx, sens, fade, r1mid, prof, status, worst, hA, hB, terrainOK };
  };
  const SCOL = { clear: '#2bd18b', marginal: '#ffc233', blocked: '#ff4f7a', unknown: '#9aa1b6' };
  W.color = a => !a ? '#9aa1b6' : a.fade < 10 && a.status === 'clear' ? '#ffc233' : SCOL[a.status];

  // ---------------- tools ----------------
  W.click = function (e, p) {
    const T = FT.T; ens();
    if (T.tool === 'wdev') {
      if (!FT.map.insideGov(p)) { U().toast(FT.t('toast_outside')); return; }
      const d = DEF[W.devType]; FT.commit(); S().seq.wdev++; const id = FT.uid('w');
      S().wdev[id] = { id, type: W.devType, name: d.name + '-' + S().seq.wdev, ll: p, freq: d.freq, txp: d.txp, gain: d.gain, h: d.h, rxs: d.rxs, note: '' };
      FT.changed('add'); T.select('wdev', id); T.tool = 'wdev'; U().toolChanged(); U().toast(FT.t('toast_added') + ' · ' + S().wdev[id].name); return;
    }
    if (T.tool === 'wlink') {
      const dv = W.near(e.point); if (!dv) { U().toast(FT.lang === 'ar' ? 'انقر على جهاز لاسلكي' : 'Click a radio device'); return; }
      if (!T.draw) { T.draw = { kind: 'wlink', a: dv.id, pts: [], nodes: [] }; U().hint('A → ' + dv.name); return; }
      if (T.draw.a === dv.id) return; const a = S().wdev[T.draw.a], b = dv;
      const kind = (a.type === 'ptp' && b.type === 'ptp') ? 'ptp' : ((a.type === 'ap' && b.type === 'cpe') || (a.type === 'cpe' && b.type === 'ap')) ? 'ptmp' : 'ptp';
      FT.commit(); S().seq.wlink++; const id = FT.uid('l'); S().wlinks[id] = { id, a: a.id, b: b.id, kind, name: (kind === 'ptp' ? 'PTP' : 'PTMP') + '-' + S().seq.wlink };
      T.draw = null; U().hint(''); FT.changed('add'); T.select('wlink', id); U().toast(FT.t('toast_added') + ' · ' + S().wlinks[id].name);
    }
  };
  W.near = function (pt) { let best = null, bd = 18; for (const d of Object.values(S().wdev || {})) { const q = FT.map.map.project(d.ll), dd = Math.hypot(q.x - pt.x, q.y - pt.y); if (dd < bd) { bd = dd; best = d; } } return best; };
  W.deleteDev = id => { const s = S(); delete s.wdev[id]; Object.values(s.wlinks).forEach(l => { if (l.a === id || l.b === id) delete s.wlinks[l.id]; }); };

  // ---------------- rendering ----------------
  W.cache = {};
  W.render = function () {
    const M = FT.map; if (!M.ready || !M.map.getSource('wd')) return; ens();
    M.map.getSource('wd').setData({ type: 'FeatureCollection', features: Object.values(S().wdev).map(d => ({ type: 'Feature', id: d.id, properties: { id: d.id, type: d.type, name: d.name }, geometry: { type: 'Point', coordinates: d.ll } })) });
    M.map.getSource('wl').setData({ type: 'FeatureCollection', features: Object.values(S().wlinks).map(l => { const a = S().wdev[l.a], b = S().wdev[l.b]; if (!a || !b) return null; const an = W.cache[l.id]; return { type: 'Feature', id: l.id, properties: { id: l.id, color: W.color(an), kind: l.kind }, geometry: { type: 'LineString', coordinates: [a.ll, b.ll] } }; }).filter(Boolean) });
    Object.values(S().wlinks).forEach(l => { const key = l.id + JSON.stringify([S().wdev[l.a] && S().wdev[l.a].ll, S().wdev[l.b] && S().wdev[l.b].ll, S().wdev[l.a] && [S().wdev[l.a].txp, S().wdev[l.a].gain, S().wdev[l.a].h, S().wdev[l.a].freq], S().wdev[l.b] && [S().wdev[l.b].gain, S().wdev[l.b].h, S().wdev[l.b].rxs]]); if (W.cache[l.id] && W.cache[l.id].key === key) return; W.analyze(l).then(an => { if (an) { an.key = key; W.cache[l.id] = an; clearTimeout(W._t); W._t = setTimeout(() => { W.render(); if (FT.T.sel && FT.T.sel.kind === 'wlink' && FT.T.sel.id === l.id) U().renderPanel(); }, 80); } }); });
  };

  // ---------------- panels ----------------
  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const f = (label, html) => '<div class="f"><label>' + esc(label) + '</label>' + html + '</div>';
  W.toolPanel = function (body) {
    const ar = FT.lang === 'ar', tp = FT.T.tool;
    if (tp === 'wdev') {
      body.innerHTML = '<h3>' + (ar ? 'جهاز لاسلكي' : 'Radio device') + '</h3><p class="d">' + (ar ? 'ضع جهازًا: AP (محطة قاعدة قطاعية) أو CPE (جهاز مشترك) أو PTP (وصلة نقطة لنقطة).' : 'Place a device: AP (sector base station), CPE (subscriber unit) or PTP (point-to-point radio).') + '</p><div class="seg" id="wType">' + ['ap', 'cpe', 'ptp'].map(k => '<button data-k="' + k + '" class="' + (W.devType === k ? 'on' : '') + '">' + DEF[k].name + '</button>').join('') + '</div>';
      body.querySelectorAll('#wType button').forEach(b => b.onclick = () => { W.devType = b.dataset.k; W.toolPanel(body); });
    } else body.innerHTML = '<h3>' + (ar ? 'وصلة لاسلكية' : 'Wireless link') + '</h3><p class="d">' + (ar ? 'انقر جهازًا ثم جهازًا ثانيًا لإنشاء وصلة PTP أو PTMP. تُحسب الميزانية وخط الرؤية والتضاريس تلقائيًا.' : 'Click one device, then a second one, to create a PTP / PTMP link. Budget, line-of-sight and terrain are computed automatically.') + '</p>';
  };
  W.propDev = function (body, id) {
    const d = S().wdev[id]; if (!d) return; const ar = FT.lang === 'ar';
    body.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">' + esc(d.name) + '</h3><button class="btn" style="padding:3px 9px;font-size:12px" id="pRel">' + FT.t('release') + '</button></div>' +
      f(FT.t('p_name'), '<input data-p="name" value="' + esc(d.name) + '">') + '<div class="two">' + f(FT.t('p_type'), '<select data-p="type">' + ['ap', 'cpe', 'ptp'].map(k => '<option value="' + k + '"' + (d.type === k ? ' selected' : '') + '>' + DEF[k].name + '</option>').join('') + '</select>') + f(ar ? 'التردد (GHz)' : 'Frequency (GHz)', '<input data-p="freq" data-n="1" value="' + d.freq + '">') + '</div>' +
      '<div class="two">' + f(ar ? 'قدرة الإرسال (dBm)' : 'TX power (dBm)', '<input data-p="txp" data-n="1" value="' + d.txp + '">') + f(ar ? 'ربح الهوائي (dBi)' : 'Antenna gain (dBi)', '<input data-p="gain" data-n="1" value="' + d.gain + '">') + '</div>' +
      '<div class="two">' + f(ar ? 'ارتفاع الصاري (م)' : 'Mast height (m)', '<input data-p="h" data-n="1" value="' + d.h + '">') + f(ar ? 'حساسية الاستقبال (dBm)' : 'RX sensitivity (dBm)', '<input data-p="rxs" data-n="1" value="' + d.rxs + '">') + '</div>' + f(FT.t('p_note'), '<textarea data-p="note" rows="2">' + esc(d.note) + '</textarea>') + '<button class="btn bad full" id="pDel">' + FT.t('menu_delete') + '</button>';
    FT.UI.bindProps(body, d); body.querySelector('#pDel').onclick = () => FT.T.deleteSelection();
  };
  W.propLink = function (body, id) {
    const l = S().wlinks[id]; if (!l) return; const A = S().wdev[l.a], B = S().wdev[l.b], an = W.cache[id], ar = FT.lang === 'ar';
    const st = { clear: ar ? 'خط رؤية واضح' : 'Clear LOS', marginal: ar ? 'هامش ضيق' : 'Marginal', blocked: ar ? 'محجوب' : 'Blocked', unknown: ar ? 'بدون بيانات تضاريس' : 'No terrain data' };
    body.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">' + esc(l.name) + '</h3><button class="btn" style="padding:3px 9px;font-size:12px" id="pRel">' + FT.t('release') + '</button></div><div class="kv"><span>' + esc(A ? A.name : '?') + ' ↔ ' + esc(B ? B.name : '?') + '</span><b>' + l.kind.toUpperCase() + '</b></div>' +
      (an ? '<div class="kv"><span>' + (ar ? 'المسافة' : 'Distance') + '</span><b>' + FT.lt(an.dKm.toFixed(2) + ' km') + '</b></div><div class="kv"><span>FSPL</span><b>' + FT.lt(an.loss.toFixed(1) + ' dB') + '</b></div><div class="kv"><span>' + (ar ? 'الاستقبال' : 'RX level') + '</span><b>' + FT.lt(an.rx.toFixed(1) + ' dBm') + '</b></div><div class="kv"><span>' + (ar ? 'هامش الخفوت' : 'Fade margin') + '</span><b style="color:' + (an.fade > 15 ? 'var(--ok)' : an.fade > 5 ? 'var(--warn)' : 'var(--bad)') + '">' + FT.lt(an.fade.toFixed(1) + ' dB') + '</b></div><div class="kv"><span>' + (ar ? 'نصف قطر Fresnel (الوسط)' : 'Fresnel r1 (mid)') + '</span><b>' + FT.lt(an.r1mid.toFixed(1) + ' m') + '</b></div><div class="kv"><span>' + (ar ? 'خط الرؤية' : 'Line of sight') + '</span><b style="color:' + W.color(an) + '">' + st[an.status] + '</b></div><canvas id="wProf" width="300" height="130" style="width:100%;margin-top:8px;background:#0b0e14;border-radius:8px"></canvas>' : '<p class="d">…</p>') +
      '<button class="btn bad full" id="pDel" style="margin-top:10px">' + FT.t('menu_delete') + '</button>';
    body.querySelector('#pRel').onclick = () => FT.T.select(null); body.querySelector('#pDel').onclick = () => FT.T.deleteSelection();
    if (an) { const c = body.querySelector('#wProf'), g = c.getContext('2d'), P = an.prof, W2 = c.width, H = c.height; const lo = Math.min(...P.map(p => Math.min(p.ground, p.e))) - 5, hi = Math.max(...P.map(p => Math.max(p.los, p.ground))) + 5, X = d => d / an.d * (W2 - 8) + 4, Y = v => H - 6 - (v - lo) / (hi - lo) * (H - 12);
      g.fillStyle = '#2a3140'; g.beginPath(); g.moveTo(X(0), H); P.forEach(p => g.lineTo(X(p.d), Y(p.ground))); g.lineTo(X(an.d), H); g.fill();
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.beginPath(); P.forEach((p, i) => i ? g.lineTo(X(p.d), Y(p.los)) : g.moveTo(X(p.d), Y(p.los))); g.stroke();
      g.strokeStyle = '#35e0c9'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.beginPath(); P.forEach((p, i) => i ? g.lineTo(X(p.d), Y(p.f60)) : g.moveTo(X(p.d), Y(p.f60))); g.stroke(); g.setLineDash([]); }
  };
})(window);
