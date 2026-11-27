/* The tutorial videos: one per tool group, recorded from the planner itself, in Arabic and in English. The window shows
   the ones of the language the planner is in. Files: video/<lang>/<id>.mp4 and .jpg (made by tools/video/make.py). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const V = FT.videos = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => (ar() ? a : e);
  // [id, [Arabic title, English], [Arabic line, English], seconds in Arabic, seconds in English]
  V.list = [
    ['01-interface', ['الشجرة والشريط العلوي والخريطة', 'Layer tree, top bar and map'], ['ابدأ من هون', 'Start here']],
    ['02-basics', ['الأدوات الأساسية', 'The basic tools'], ['التحديد والمنطقة والقياس', 'Select, area and measure']],
    ['03-houses', ['أدوات البيوت', 'The house tools'], ['إضافة ورسم وطوابق وترقيم', 'Add, draw, floors and numbers']],
    ['04-boxes', ['العلب والغرف واللحام', 'Boxes, chambers and splicing'], ['OLT و FDC و FDB والمناهل', 'OLT, FDC, FDB and chambers']],
    ['05-lines', ['الخطوط: الأنابيب والكبلات', 'Lines: ducts and cables'], ['رسم ومسار وتتبّع الليف', 'Drawing, routes and fibre trace']],
    ['06-design', ['التصميم والمشتركين', 'Design and subscribers'], ['ربط مشترك وتصميم تلقائي', 'Subscribers and automatic design']],
    ['07-files', ['الملفات والتسليم', 'Files and delivery'], ['تقرير وغوغل إيرث وأوتوكاد', 'Report, Google Earth and AutoCAD']],
  ];
  V.seconds = {"ar/01-interface": 208.7, "ar/02-basics": 91.4, "ar/03-houses": 84.0, "ar/04-boxes": 136.2, "ar/05-lines": 117.5, "ar/06-design": 107.3, "ar/07-files": 79.0, "en/01-interface": 212.0, "en/02-basics": 91.8, "en/03-houses": 84.6, "en/04-boxes": 136.4, "en/05-lines": 117.7, "en/06-design": 109.3, "en/07-files": 82.2}; // length of each recorded file (tools/video/durations.py)
  const mmss = s => (s ? Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') : '');
  const src = (id, ext) => 'video/' + (ar() ? 'ar' : 'en') + '/' + id + '.' + ext;
  const seenKey = 'ft2_videos_seen';
  const seen = () => { try { return JSON.parse(localStorage.getItem(seenKey)) || {}; } catch (e) { return {}; } };

  V.cardsHtml = function () {
    const s = seen();
    return '<div class="vd-grid">' + V.list.map((v, i) => {
      const len = mmss(V.seconds[(ar() ? 'ar/' : 'en/') + v[0]]);
      return '<button type="button" class="vd-card" data-vid="' + i + '"><span class="vd-pic"><img loading="lazy" src="' + src(v[0], 'jpg') + '" alt=""><i class="vd-play">▶</i>' + (len ? '<em dir="ltr">' + len + '</em>' : '') + (s[v[0]] ? '<u>✓</u>' : '') + '</span><b>' + (i + 1) + '. ' + v[1][ar() ? 0 : 1] + '</b><small>' + v[2][ar() ? 0 : 1] + '</small></button>';
    }).join('') + '</div>';
  };
  V.wire = root => root.querySelectorAll('[data-vid]').forEach(b => b.onclick = () => V.play(+b.dataset.vid));
  V.play = function (i) {
    const v = V.list[i]; if (!v) return;
    const body = '<video id="vdPlayer" controls autoplay playsinline preload="metadata" poster="' + src(v[0], 'jpg') + '" src="' + src(v[0], 'mp4') + '"></video><p class="d" id="vdErr" style="display:none">' + tx('ما قدرت حمّل الفيديو. تأكّد من الإنترنت وجرّب مرة تانية.', 'The video could not be loaded. Check the connection and try again.') + '</p>';
    const btns = [{ label: tx('☰ كل الفيديوهات', '☰ All videos'), keep: true, fn: () => FT.hub.open('videos') }];
    if (i > 0) btns.push({ label: tx('السابق', 'Previous'), keep: true, fn: () => V.play(i - 1) });
    if (i < V.list.length - 1) btns.push({ label: tx('التالي', 'Next') + ' ▶', cls: 'pri', keep: true, fn: () => V.play(i + 1) });
    btns.push({ label: FT.t('close') });
    FT.UI.modal((i + 1) + ' · ' + v[1][ar() ? 0 : 1], body, btns, root => {
      root.closest('.dlg').classList.add('vd-dlg');
      const p = root.querySelector('#vdPlayer');
      p.onerror = () => { root.querySelector('#vdErr').style.display = ''; };
      p.onended = () => { const s = seen(); s[v[0]] = 1; try { localStorage.setItem(seenKey, JSON.stringify(s)); } catch (e) { } };
    }, () => { const p = document.getElementById('vdPlayer'); if (p) p.pause(); if (FT.train) FT.train.menu = false; });
    if (FT.train) FT.train.menu = true; // inside the training the player counts as the open menu, so its controls answer
  };
})(window);
