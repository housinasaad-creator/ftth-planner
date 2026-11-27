/* The training lessons: one continuous project, one tool per lesson. Every text is [Arabic, English].
   A step has: text · allow (what may be clicked, lit) · show (lit, read only) · pts (map targets, in order) · keys ·
   done() (read from the project itself) · auto() (what "skip this tool" does for the trainee) · next (a reading step). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  FT.trainLessons = function () {
    const TR = FT.train, W = FT.trainWorld, P = W.P, V = () => TR.vars;
    const S = () => FT.state, T = () => FT.T, U = () => FT.UI, M = () => FT.map.map, F = () => FT.fiber;
    const $ = s => document.querySelector(s);
    const K = c => '<kbd>' + c + '</kbd>';

    // ---------------- reading the project ----------------
    const node = (type, key) => Object.values(S().nodes).find(n => n.type === type && FT.dist(n.ll, P[key]) < 12.5); // the planner pulls a new node to a street up to 18 m away; the step then puts it back on the spot
    const nid = (type, key) => (node(type, key) || {}).id;
    const where = b => b.pt || (b.fp && FT.centroid(b.fp)) || b.ll;
    const lot = k => Object.keys(S().bld).find(id => { const b = S().bld[id], p = where(b); return !id.startsWith('tr_') && !b.deleted && p && FT.dist(p, P['lot' + k]) < 12; });
    const bld = id => S().bld[id] || {};
    const housePt = id => FT.map.housePoint(id) || where(bld(id));
    const onHouse = key => ({ ll: () => housePt(W.house[key].id), dy: -15 });
    const onId = get => ({ ll: () => { const id = get(); return id ? housePt(id) : null; }, dy: -15 });
    const cableAB = (a, b) => Object.values(S().cables).find(c => !c.sub && ((c.a === a && c.b === b) || (c.a === b && c.b === a)));
    const feeder = () => cableAB(nid('olt', 'olt'), nid('sk', 'fdc'));
    const dist1 = () => cableAB(nid('sk', 'fdc'), nid('bk', 'fdb1'));
    const modalOn = () => $('#modal').classList.contains('on');
    const has = sel => modalOn() && !!$('#modal ' + sel);
    const drawN = () => (T().draw ? T().draw.pts.length : 0);
    const drawNodes = () => (T().draw ? T().draw.nodes.filter(Boolean).length : 0);
    const polyAt = (done) => () => (done() ? 99 : drawN());

    // ---------------- step builders ----------------
    const info = (text, o) => Object.assign({ text, next: true }, o || {});
    const press = (text, sel, o) => Object.assign({ text, allow: sel, press: sel, done: () => TR.pressed }, o || {});
    const toolBtn = id => '#toolbar .tb[data-id=' + id + ']';
    const keyOf = id => { const k = FT.keys.TOOLS[id]; return k ? [/^\d$/.test(k) ? 'Digit' + k : 'Key' + k] : []; };
    const pick = (tool, text) => ({
      text: () => { const k = FT.keys.TOOLS[tool], t = TR.say(text); return t + (k ? TR.say([' أو من الكيبورد ' + K(k), ' or press ' + K(k)]) : ''); },
      allow: toolBtn(tool), keys: keyOf(tool), done: () => T().tool === tool, auto: () => { if (T().tool !== tool) T().setTool(tool); },
    });
    const opens = (tool, probe, text) => ({ text, allow: toolBtn(tool), done: () => has(probe) });
    const closeWin = text => ({ text, show: '#modal .dlg', allow: ['#mX', '#modal .df .btn:last-child'], keys: ['Escape'], done: () => !modalOn() });
    const snap = (type, key) => { const n = node(type, key); if (n && FT.dist(n.ll, P[key]) > 0.05) { T().moveNode(n.id, P[key].slice()); FT.changed('move'); } };
    const addNode = (type, key, extra) => { if (node(type, key)) return; FT.commit(); FT.addNode(type, P[key].slice(), Object.assign({}, extra || {})); FT.changed('add'); };
    // place one or several elements of one type, in order
    const place = (type, keys, text, extra) => {
      const count = () => { let i = 0; while (i < keys.length && node(type, keys[i])) i++; return i; };
      return { text, pts: keys.map(k => P[k]), at: count, done: () => count() === keys.length, each: () => keys.forEach(k => snap(type, k)), auto: () => keys.forEach(k => addNode(type, k, extra)) };
    };
    // "here it is in the layer tree": find it, hide it, show it again
    const row = (get, part) => () => (get() ? '#tree .tr[data-id="' + get() + '"] ' + part : '#tree');
    const tree = (kind, get, group) => [
      { text: ['🌳 شوف الشجرة عالشمال: يلي أضفتو صار تحت مجموعة «' + group[0] + '». اضغط على <b>اسمو</b> لتتحدّد عليه وتروحلو.', '🌳 Look at the layer tree on the left: what you added sits under “' + group[1] + '”. Click its <b>name</b> to select it and go there.'],
        enter: () => { if (T().tool !== 'select') T().setTool('select'); T().select(null); if (get()) U().reveal(kind, get()); U().refreshTree(); }, allow: row(get, '.nm'), done: () => !!(T().sel && T().sel.id === get()) },
      { text: ['هلأ <b>خفيه</b>: شيل الإشارة ✔ يلي جنب اسمو. بيختفي عن الخريطة بس ما بينحذف.', 'Now <b>hide</b> it: untick the box next to its name. It leaves the map but is not deleted.'],
        allow: row(get, 'input[data-vis]'), done: () => T().hidden.has(get()) },
      { text: ['ممتاز. <b>رجّع الإشارة ✔</b> ليرجع يبيّن عالخريطة.', 'Good. <b>Tick it again</b> to bring it back.'],
        allow: row(get, 'input[data-vis]'), done: () => !T().hidden.has(get()), auto: () => { T().hidden.delete(get()); U().applyHidden(); U().refreshTree(); } },
    ];
    const addPipeSeq = ids => { FT.commit(); for (let i = 1; i < ids.length; i++) if (!FT.pipeBetween(ids[i - 1], ids[i])) FT.addPipe([S().nodes[ids[i - 1]].ll.slice(), S().nodes[ids[i]].ll.slice()], ids[i - 1], ids[i], U().toolPipeType(), U().toolPipeCat()); FT.changed('add'); };
    const addCableSeq = (ids, cat) => {
      if (cableAB(ids[0], ids[ids.length - 1])) return; FT.commit();
      const segs = []; for (let i = 1; i < ids.length; i++) { const a = S().nodes[ids[i - 1]], b = S().nodes[ids[i]], pp = FT.pipeBetween(a.id, b.id); let pts = pp ? pp.pts.slice() : (FT.roads.path(a.ll, b.ll) || [a.ll, b.ll]).slice(); if (pp && pp.a !== a.id) pts.reverse(); pts[0] = a.ll.slice(); pts[pts.length - 1] = b.ll.slice(); segs.push(pts); }
      const all = [].concat(...segs.map((s, i) => (i ? s.slice(1) : s))); FT.addCable(all, ids[0], ids[ids.length - 1], cat, 'free', ids, segs); FT.changed('add');
    };
    const drawLine = (text, keys, types, done, auto) => ({
      text, pts: keys.map(k => P[k]), at: () => (done() ? keys.length : drawNodes()), keys: ['Enter', 'Backspace'], done, auto,
      ghost: () => (done() ? [] : [keys.map(k => P[k])]),
    });
    const drawArea = (text, ring, done, auto) => ({ text, pts: ring, at: () => (done() ? ring.length : drawN()), keys: ['Enter', 'Backspace'], ghost: () => (done() ? [] : [{ ring }]), done, auto });

    const camWest = [W.ll(-138, -8), W.ll(-12, 24)], camAll = [W.ll(-104, -24), W.ll(104, 58)], camSouth = [W.ll(-74, -24), W.ll(58, 4)], camNorth = [W.ll(-96, 2), W.ll(2, 66)], camEast = [W.ll(2, -2), W.ll(108, 62)], camNet = [W.ll(-136, -4), W.ll(2, 18)];
    const restoreState = () => { const sn = TR.snaps[TR.L]; if (sn && JSON.stringify(S()) !== sn.state) { FT.setState(JSON.parse(sn.state)); FT.map.renderNet(); U().refreshTree(); } };
    const ratio = (tool, r, text) => ({ text, allow: '#ratioSeg button[data-r="' + r + '"]', done: () => U().opt.ratio[tool] === r, auto: () => { U().opt.ratio[tool] = r; S().ui.ratio[tool] = r; U().renderPanel(); } });
    const numbered = id => !!bld(id).num;
    const numberOne = id => { if (numbered(id)) return; FT.num.syncNext(); const b = FT.houses.pin(id); b.num = T().num.next++; b.pfx = T().num.prefix || ''; const p = FT.map.housePoint(id); if (p) b.ll = p.slice(); };
    const north = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'].map(k => 'tr_' + k);
    const south = () => ['tr_c1', 'tr_c2', lot(1), lot(2)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const designed = () => !!(FT.designResults.list().length);
    const folderId = () => { const d = FT.designResults.list(); return d.length ? d[d.length - 1].id : ''; };
    const folderItems = () => Object.keys(S().fmap || {}).filter(k => S().fmap[k] === folderId()).map(k => k.slice(2));
    const folderRow = () => '#tree input[data-fvis="' + folderId() + '"]';
    const showFolderRow = () => { if (T().tool !== 'select') T().setTool('select'); T().select(null); U().refreshTree(); const el = $(folderRow()); if (el) el.scrollIntoView({ block: 'center' }); };
    const pointNear = (c, endNode, back) => { // a point on a cable, some metres before one of its ends
      const pts = [].concat(...FT.cableSpans(c).map((s, i) => (i ? s.pts.slice(1) : s.pts))); if (c.b !== endNode) pts.reverse();
      let left = back; for (let i = pts.length - 1; i > 0; i--) { const d = FT.dist(pts[i - 1], pts[i]); if (d >= left) { const k = left / d; return [pts[i][0] + (pts[i - 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i - 1][1] - pts[i][1]) * k]; } left -= d; }
      return pts[0];
    };
    const c2 = () => (V().c2 && S().cables[V().c2]) || null;
    const toggle = (sel, on, text, back) => [
      press(text, sel, { done: () => on(), auto: () => { } }),
      press(back, sel, { done: () => !on() }),
    ];

    return [
      // ------------------------------------------------------------------ 1
      { icon: '👋', title: ['أهلاً: جولة على الشاشة', 'Welcome: a tour of the screen'], cam: camAll, steps: [
        info(['رح نبني سوا <b>شبكة ألياف كاملة من الصفر</b> لحي فيه عشرين بيت: بيوت وترقيم، غرف وعلب، أنابيب وكبلات، لحام ومشتركين، وبالآخر تقرير وملفات تسليم.<br>كل خطوة بنوّرلك المكان، وأنت بتعملها بإيدك. وإذا ما بدك أداة: <b>⏭ تخطي هالأداة</b>.', 'We will build a <b>complete fibre network from zero</b> for a quarter of twenty houses: houses and numbering, chambers and boxes, ducts and cables, splicing and subscribers, then the report and delivery files.<br>Each step lights the spot and you do it yourself. Do not need a tool? Press <b>⏭ Skip this tool</b>.']),
        info(['<b>الشريط العلوي:</b> الوضع الغامق/الفاتح، اسم المشروع، تبويبات الشبكة، التراجع والإعادة، زر «تعليمي»، اللغة، الأسعار والمشاركة.', '<b>Top bar:</b> dark/light look, project name, network tabs, undo and redo, the Tutorials button, language, prices and sharing.'], { show: '#top' }),
        info(['<b>شريط الأدوات:</b> كل أدوات الرسم والتصميم والتصدير. مرّر الماوس فوق أي زر ليطلعلك اسمو وشرحو واختصارو.', '<b>Toolbar:</b> every drawing, design and export tool. Hover a button for its name, explanation and shortcut.'], { show: '#toolbar' }),
        info(['<b>شجرة الطبقات:</b> كل عنصر بتضيفو بيظهر هون. منها بتدوّر عليه، بتخفيه، بتظهرو، بتقفلو أو بتحذفو.', '<b>Layer tree:</b> everything you add appears here. Find it, hide it, show it, lock it or delete it from here.'], { show: '#left' }),
        info(['<b>اللوحة اليمين:</b> خيارات الأداة الشغّالة، وخصائص العنصر المحدّد، والتحليل.', '<b>Right panel:</b> options of the active tool, properties of the selected element, and the analysis.'], { show: '#right' }),
        info(['تحت عالشمال: <b>أزرار الخريطة</b> (شارع، ثري دي، قمر صناعي، وأزرار الإخفاء). وبأسفل الشاشة <b>شريط الحالة</b>: الأداة الشغّالة ومفاتيحها وسطر الأوامر.', 'Bottom left: the <b>map buttons</b> (street, 3D, satellite and the hide switches). Along the bottom, the <b>status bar</b>: active tool, its keys and the command line.'], { show: ['#basemap', '#status'] }),
        info(['وهاد <b>حيّنا التدريبي</b>: فيه ١٨ بيت جاهزين، و<b>أرضين فاضيتين</b> أنت رح تضيف عليهن بيتين ليصيرو عشرين.', 'And this is our <b>training quarter</b>: 18 houses are ready and <b>two lots are empty</b>. You will add those two to make twenty.'], { map: 'look' }),
      ] },
      // ------------------------------------------------------------------ 2
      { icon: '🧭', title: ['التحرّك على الخريطة', 'Moving around the map'], cam: camAll, end: () => { restoreState(); M().jumpTo({ bearing: 0, pitch: 0 }); if (TR.cam) TR.camera(TR.cam.pts, TR.cam.o); }, steps: [
        { text: ['<b>قرّب:</b> حط الماوس على الخريطة ولفّ العجلة لقدّام.', '<b>Zoom in:</b> put the mouse over the map and roll the wheel forward.'], map: 'free', enter: () => { V().z0 = M().getZoom(); }, done: () => M().getZoom() > V().z0 + 0.45 },
        { text: ['<b>اسحب الخريطة:</b> اضغط بالزر الشمال على مكان فاضي وحرّك.', '<b>Pan:</b> press the left button on an empty spot and drag.'], map: 'free', enter: () => { V().c0 = M().getCenter().toArray(); }, done: () => FT.dist(V().c0, M().getCenter().toArray()) > 25 && !M().isMoving() },
        { text: ['<b>لفّ الخريطة:</b> اضغط <b>عجلة الماوس</b> (أو الزر اليمين) وحرّك يمين وشمال.', '<b>Rotate:</b> hold the <b>mouse wheel button</b> (or the right button) and move sideways.'], map: 'free', done: () => Math.abs(M().getBearing()) > 8 },
        info(['وإذا ضعت بالخريطة بأي وقت: زر <b>⌖ رجّع المنظر</b> ببطاقة التدريب بيرجّعك لمكان الخطوة.<br>ملاحظة: العناصر ما بتتحرّك ولا بتتحدّد إلا لما تكون <b>مقرّب</b>، مشان ما تتحرّك بالغلط.', 'Lost? <b>⌖ Reset view</b> on this card brings you back.<br>Note: elements can only be selected or moved when you are <b>zoomed in</b>, so nothing moves by accident.'], { map: 'free' }),
      ] },
      // ------------------------------------------------------------------ 3
      { icon: '🖱️', title: ['أداة التحديد', 'The select tool'], cam: camNorth, steps: [
        info(['<b>التحديد ' + K('V') + '</b> هي الأداة الأساسية، وبترجعلها دايماً بزر ' + K('Esc') + '.', '<b>Select ' + K('V') + '</b> is the home tool; ' + K('Esc') + ' always brings you back to it.'], { show: toolBtn('select') }),
        { text: ['اضغط على <b>لوغو البيت المنوّر</b> لتحدّدو.', 'Click the <b>lit house icon</b> to select it.'], pts: [onHouse('a2')], at: () => 0, done: () => !!(T().sel && T().sel.id === 'tr_a2'), auto: () => T().select('bld', 'tr_a2') },
        info(['شوف اللوحة اليمين: <b>خصائص البيت</b>. رقمو، عدد طوابقو، اسمو، ونقلو أو حذفو. وعلامة التحديد صارت حول اللوغو.', 'See the right panel: the <b>house properties</b>: number, floors, name, move or delete. A halo marks the selected icon.'], { show: '#right', enter: () => { if (!T().sel) T().select('bld', 'tr_a2'); } }),
        { text: ['اضغط ' + K('Esc') + ' لتلغي التحديد.', 'Press ' + K('Esc') + ' to clear the selection.'], keys: ['Escape'], map: 'look', done: () => !T().sel, auto: () => T().select(null) },
      ] },
      // ------------------------------------------------------------------ 4
      { icon: '📏', title: ['عدّاد المسافة', 'Measuring'], cam: [W.ll(-112, -8), W.ll(4, 20)], steps: [
        pick('measure', ['اختار أداة <b>القياس</b> من شريط الأدوات', 'Pick the <b>measure</b> tool']),
        { text: ['قيس طول الشارع: اضغط النقطة <b>1</b> وبعدها <b>2</b>، وبعدين ' + K('Enter') + ' (أو ضغطتين على آخر نقطة). العدّاد بيمشي مع الماوس.', 'Measure the street: click point <b>1</b>, then <b>2</b>, then ' + K('Enter') + ' (or double-click the last point). The meter follows your mouse.'],
          pts: [W.ll(-110, 0), W.ll(0, 0)], at: () => (!T().draw && FT.map.doneRing ? 2 : drawN()), keys: ['Enter', 'Backspace'], ghost: [[W.ll(-110, 0), W.ll(0, 0)]], done: () => !T().draw && !!FT.map.doneRing, auto: () => FT.map.setDone([W.ll(-110, 0), W.ll(0, 0)], true) },
        info(['النتيجة بتضل ظاهرة على الخريطة وفوق. وإذا رسمت ٣ نقاط أو أكتر بيعطيك <b>المساحة</b> كمان.', 'The result stays on screen. With three points or more you also get the <b>area</b>.'], { map: 'look', show: '#hint' }),
        { text: ['اضغط ' + K('Esc') + ' لتمسح القياس.', 'Press ' + K('Esc') + ' to clear the measurement.'], keys: ['Escape'], map: 'look', done: () => !FT.map.doneRing, auto: () => FT.map.setDone(null) },
      ] },
      // ------------------------------------------------------------------ 5
      { icon: '🏠', title: ['إضافة بيت', 'Adding a house'], cam: camSouth, steps: [
        pick('house', ['في بيت مو مرسوم على الخريطة. اختار أداة <b>إضافة بيت</b>', 'A house is missing from the map. Pick <b>add house</b>']),
        { text: ['اضغط بنص <b>الأرض الفاضية 1</b> لتحط بيت.', 'Click the middle of <b>empty lot 1</b> to put a house there.'], pts: [P.lot1], done: () => !!lot(1),
          each: () => { const id = lot(1); if (id && bld(id).pt && FT.dist(bld(id).pt, P.lot1) > 0.05) { bld(id).pt = P.lot1.slice(); FT.changed('bld'); } },
          auto: () => { FT.commit(); S().bld.hlot1 = { house: 1, custom: 1, pt: P.lot1.slice(), floors: 2 }; FT.changed('bld'); } },
        info(['ممتاز، صار عنا ١٩ بيت. أي بيت بتضيفو هيك بيتعامل متل غيرو: بيترقّم، وبيدخل بالتصميم والتقرير.', 'Nineteen houses now. A house added this way is numbered, designed and reported like any other.'], { map: 'look' }),
      ] },
      // ------------------------------------------------------------------ 6
      { icon: '✏️', title: ['رسم مبنى', 'Drawing a building'], cam: camSouth, steps: [
        pick('bdraw', ['وإذا بدك المبنى <b>بشكلو الحقيقي</b>، بترسمو. اختار أداة <b>رسم مبنى</b>', 'To give a building its <b>real shape</b>, draw it. Pick <b>draw building</b>']),
        drawArea(['ارسم المبنى على <b>الأرض الفاضية 2</b>: اضغط الزوايا <b>1 ← 4</b> بالترتيب، وعلى الرابعة ضغطتين (أو ' + K('Enter') + '). وإذا غلطت بنقطة: ' + K('⌫') + '.', 'Draw the building on <b>empty lot 2</b>: click corners <b>1 → 4</b> in order and double-click the fourth (or press ' + K('Enter') + '). ' + K('⌫') + ' removes the last point.'],
          P.lot2ring, () => !!lot(2), () => { FT.commit(); S().bld.ulot2 = { fp: P.lot2ring.map(p => p.slice()), floors: 2, custom: 1 }; FT.changed('bld'); }),
        info(['صارو <b>عشرين بيت</b> 🎉. لوغو البيت بينحط لحالو من جهة الشارع.', 'That makes <b>twenty houses</b> 🎉. The house icon places itself on the street side.'], { map: 'look' }),
      ] },
      // ------------------------------------------------------------------ 7
      { icon: '🏢', title: ['عدد الطوابق', 'Floors'], cam: camNorth, end: () => { U().opt.floors = 2; }, steps: [
        pick('floors', ['اختار أداة <b>الطوابق</b>', 'Pick the <b>floors</b> tool']),
        { text: ['باللوحة اليمين، اكتب <b>5</b> بخانة الطوابق.', 'In the right panel, type <b>5</b> into the floors box.'], enter: () => U().tab('tool'), allow: '#flN', done: () => U().floorsValue() === 5, auto: () => { U().opt.floors = 5; U().renderPanel(); } },
        { text: ['هلأ اضغط على <b>البيتين المنوّرين</b> ليصيرو ٥ طوابق. شوف اللوغو كيف بيعلى.', 'Now click the <b>two lit houses</b> to give them 5 floors. Watch the icons grow.'], pts: [onHouse('a1'), onHouse('a5')], at: () => (bld('tr_a1').floors === 5 ? (bld('tr_a5').floors === 5 ? 2 : 1) : 0), done: () => bld('tr_a1').floors === 5 && bld('tr_a5').floors === 5,
          auto: () => { FT.commit(); ['tr_a1', 'tr_a5'].forEach(id => { FT.houses.pin(id).floors = 5; }); FT.changed('floors'); } },
      ] },
      // ------------------------------------------------------------------ 8
      { icon: '#️⃣', title: ['ترقيم البيوت', 'Numbering houses'], cam: camAll, begin: () => { T().num.mode = 'click'; T().num.prefix = ''; }, end: () => { T().num.mode = 'click'; }, steps: [
        pick('number', ['كل بيت بدو رقم. اختار أداة <b>الترقيم</b>', 'Every house needs a number. Pick <b>numbering</b>']),
        info(['إلها طريقتين: <b>بالضغط</b> (بيت بيت)، و<b>تلقائي</b> (ترسم منطقة وبيترقّمو كلهن). وفيك تحدّد بادئة ورقم البداية وطريقة الترتيب.', 'Two ways: <b>by clicking</b> (one by one) or <b>automatic</b> (draw an area). You can set a prefix, a start number and the order.'], { show: '#right', enter: () => U().tab('tool') }),
        { text: ['<b>بالضغط:</b> اضغط على بيوت الصف الجنوبي الأربعة المنوّرة، واحد واحد.', '<b>By clicking:</b> click the four lit houses of the south row, one by one.'], pts: [0, 1, 2, 3].map(i => onId(() => south()[i])), any: true, isDone: i => numbered(south()[i]), cam: camSouth, done: () => south().every(id => id && numbered(id)),
          auto: () => { FT.commit(); south().forEach(numberOne); FT.changed('num'); U().numChanged(); } },
        { text: ['هلأ الباقي دفعة وحدة: باللوحة اليمين اختار <b>تلقائي</b>.', 'Now the rest in one go: choose <b>automatic</b> in the right panel.'], enter: () => U().tab('tool'), allow: '#numMode button[data-m=auto]', done: () => T().num.mode === 'auto', auto: () => { T().num.mode = 'auto'; T().draw = null; U().toolChanged(); } },
        drawArea(['ارسم منطقة حول <b>البيوت الشمالية</b>: الزوايا <b>1 ← 4</b>، وعلى الرابعة ضغطتين.', 'Draw an area around the <b>northern houses</b>: corners <b>1 → 4</b>, double-click the fourth.'], W.areaNorth, () => north.every(numbered),
          async () => { FT.num.autoNumber(W.areaNorth); for (let i = 0; i < 60 && !north.every(numbered); i++) await sleep(100); }),
        info(['العشرين بيت مرقّمين، والرقم صار لوحة تحت كل لوغو.', 'All twenty are numbered; each carries its number on a plate.'], { map: 'look', cam: camAll }),
        { text: ['إزالة رقم: ارجع على طريقة <b>بالضغط</b>.', 'To remove a number, go back to <b>by clicking</b>.'], enter: () => U().tab('tool'), allow: '#numMode button[data-m=click]', done: () => T().num.mode === 'click', auto: () => { T().num.mode = 'click'; U().toolChanged(); } },
        { text: ['اضغط ' + K('Shift') + ' مع الضغط على <b>البيت المنوّر</b>: بينشال رقمو، والباقي بيترقّمو من جديد بدون فراغ.', 'Hold ' + K('Shift') + ' and click the <b>lit house</b>: its number goes and the rest close the gap.'], pts: [onHouse('c2')], done: () => !numbered('tr_c2'), cam: camSouth, auto: () => { FT.commit(); FT.bedit.unnumber('tr_c2'); } },
        { text: ['غلطنا؟ <b>تراجع:</b> زر ↶ فوق، أو ' + K('Ctrl') + ' + ' + K('Z') + '. بيشتغل على أي شي عملتو.', 'Changed your mind? <b>Undo</b>: the ↶ button or ' + K('Ctrl') + ' + ' + K('Z') + '. It works on anything.'], allow: '#bUndo', keys: ['Ctrl+KeyZ'], done: () => numbered('tr_c2'), auto: () => { if (!numbered('tr_c2')) FT.undo(); } },
      ] },
      // ------------------------------------------------------------------ 9
      { icon: '🟩', title: ['وضع الـ OLT', 'Placing the OLT'], cam: camNet, steps: [
        info(['هلأ منبلّش الشبكة. <b>OLT</b> هو قلبها: الجهاز بمركز الاتصالات يلي بيطلع منو الضوء لكل المشتركين.', 'Now the network. The <b>OLT</b> is its heart: the exchange equipment that sends the light to every subscriber.']),
        pick('olt', ['اختار أداة <b>OLT</b>', 'Pick the <b>OLT</b> tool']),
        place('olt', ['olt'], ['اضغط على <b>النقطة المنوّرة</b> بأول شارع المدرسة.', 'Click the <b>lit point</b> at the start of School Street.']),
        ...tree('node', () => nid('olt', 'olt'), ['OLT', 'OLT']),
        info(['ولما تحدّد أي عنصر، خصائصو هون: النوع، التموضع، نسبة المقسّم، الاسم، الكود، وزر <b>تتبّع الليف</b> و<b>جدول اللحام</b>.', 'When an element is selected its properties are here: type, placement, splitter ratio, name, code, plus <b>fibre trace</b> and <b>splice table</b>.'], { show: '#right', enter: () => T().select('node', nid('olt', 'olt')) }),
      ] },
      // ------------------------------------------------------------------ 10
      { icon: '⭕', title: ['المناهل', 'Manholes'], cam: camNet, steps: [
        pick('mh', ['<b>المنهل</b> غرفة تفتيش كبيرة تحت الأرض. اختار أداتو', 'A <b>manhole</b> is a large underground chamber. Pick its tool']),
        place('mh', ['mh1', 'mh2'], ['حط منهلين على التقاطعين: النقطة <b>1</b> وبعدها <b>2</b>.', 'Place two manholes at the junctions: point <b>1</b>, then <b>2</b>.']),
        ...tree('node', () => nid('mh', 'mh1'), ['المناهل', 'Manholes']),
      ] },
      // ------------------------------------------------------------------ 11
      { icon: '⬜', title: ['الهاند هول', 'Handholes'], cam: camNet, steps: [
        pick('hh', ['<b>الهاند هول</b> غرفة صغيرة على طول المسار لسحب الكبلات. اختارها', 'A <b>handhole</b> is a small chamber along the route for pulling cables. Pick it']),
        place('hh', ['hh1'], ['حط وحدة على <b>النقطة المنوّرة</b>.', 'Place one on the <b>lit point</b>.']),
        ...tree('node', () => nid('hh', 'hh1'), ['هاند هول', 'Handholes']),
      ] },
      // ------------------------------------------------------------------ 12
      { icon: '🟧', title: ['خزانة التوزيع FDC', 'The FDC cabinet'], cam: camNet, steps: [
        pick('sk', ['<b>FDC</b> خزانة بالشارع فيها المقسّم الأول، منها بتتوزّع الألياف على العلب. اختارها', 'The <b>FDC</b> is the street cabinet with the first splitter, feeding the boxes. Pick it']),
        ratio('sk', '1:4', ['قبل ما تحطها، اختار <b>نسبة المقسّم 1:4</b> من اللوحة اليمين: ليف واحد داخل، وأربعة طالعين.', 'Before placing it choose the <b>1:4 splitter</b> in the right panel: one fibre in, four out.']),
        place('sk', ['fdc'], ['حط الخزانة على <b>النقطة المنوّرة</b>.', 'Place the cabinet on the <b>lit point</b>.'], { ratio: '1:4' }),
        ...tree('node', () => nid('sk', 'fdc'), ['خزائن FDC', 'FDC cabinets']),
      ] },
      // ------------------------------------------------------------------ 13
      { icon: '🔴', title: ['علبة البناء FDB', 'The FDB building box'], cam: camNet, steps: [
        pick('bk', ['<b>FDB</b> علبة على حيط البناء فيها المقسّم التاني، ومنها بيطلع كبل كل مشترك. اختارها', 'The <b>FDB</b> is the box on the building wall with the second splitter; subscriber cables start here. Pick it']),
        ratio('bk', '1:4', ['اختار النسبة <b>1:4</b>. ليش مو أكبر؟ مواصفة الاتصالات بتقول <b>المرحلتين سوا ما يتجاوزو 1:16</b>، يعني 1:4 بالخزانة × 1:4 بالعلبة. وجدول الإشارة بيفرجيك المجموع.', 'Choose <b>1:4</b>. Why not more? The telecom specification says <b>both stages together may not exceed 1:16</b>: 1:4 in the cabinet × 1:4 in the box. The signal table shows the total.']),
        place('bk', ['fdb1', 'fdb2'], ['حط علبتين على حيطان البيوت: <b>1</b> وبعدها <b>2</b>.', 'Place two boxes on the house walls: <b>1</b>, then <b>2</b>.'], { ratio: '1:4' }),
        info(['⚠️ <b>انتبه:</b> المستطيل «1:4» يلي ظهر فوق البيت أو العلبة معناه بس إنو <b>جوّا العلبة مقسّم</b>. ما بيعني إنها موصولة ولا إنو في إشارة. هلأ هي لسا مو موصولة بشي!', '⚠️ <b>Careful:</b> the “1:4” rectangle above the house or box only means <b>there is a splitter inside</b>. It does not mean it is connected or has signal. Right now it is connected to nothing!'], { map: 'look' }),
        ...tree('node', () => nid('bk', 'fdb1'), ['علب FDB', 'FDB boxes']),
      ] },
      // ------------------------------------------------------------------ 14
      { icon: '📍', title: ['الأعمدة', 'Poles'], cam: camNorth, steps: [
        pick('pole', ['<b>العمود</b> للمسارات الهوائية. اختارو', '<b>Poles</b> carry aerial routes. Pick the tool']),
        place('pole', ['pole1', 'pole2'], ['حط عمودين على شارع الياسمين: <b>1</b> و<b>2</b>.', 'Place two poles on Jasmine Street: <b>1</b> and <b>2</b>.']),
        ...tree('node', () => nid('pole', 'pole1'), ['أعمدة', 'Poles']),
        info(['ملاحظة: التمديد الهوائي بمواصفة الاتصالات السورية بدو <b>موافقة خطية</b>، والأداة بتنبّهك عليه.', 'Note: aerial routes need <b>written telecom approval</b>; the planner warns about them.']),
      ] },
      // ------------------------------------------------------------------ 15
      { icon: '🔶', title: ['iFDC والحذف', 'iFDC and deleting'], cam: camNorth, steps: [
        pick('dk', ['<b>iFDC</b> خزانة داخلية بالأبنية الكبيرة. رح نحط وحدة ونتعلّم كيف منحذف. اختارها', 'An <b>iFDC</b> is an indoor cabinet for large buildings. We place one, then learn to delete. Pick it']),
        place('dk', ['idfc'], ['حطها على <b>النقطة المنوّرة</b>.', 'Place it on the <b>lit point</b>.']),
        pick('select', ['ارجع على أداة <b>التحديد</b>', 'Go back to <b>select</b>']),
        { text: ['حدّد الـ iFDC يلي حطيتها.', 'Select the iFDC you placed.'], pts: [P.idfc], done: () => !node('dk', 'idfc') || !!(T().sel && T().sel.id === nid('dk', 'idfc')), auto: () => { if (node('dk', 'idfc')) T().select('node', nid('dk', 'idfc')); } },
        { text: ['احذفها: زر ' + K('Delete') + ' بالكيبورد، أو زر الحذف الأحمر بآخر اللوحة. (و' + K('Ctrl') + ' + ' + K('Z') + ' بيرجّع أي محذوف.)', 'Delete it: press ' + K('Delete') + ' or use the red button at the bottom of the panel. (' + K('Ctrl') + ' + ' + K('Z') + ' brings anything back.)'], keys: ['Delete'], allow: '#pDel', done: () => !node('dk', 'idfc'), auto: () => { const n = node('dk', 'idfc'); if (n) { FT.commit(); FT.deleteNode(n.id); T().select(null); FT.changed('delete'); } } },
      ] },
      // ------------------------------------------------------------------ 16
      { icon: '🟦', title: ['رسم الأنابيب', 'Drawing ducts'], cam: camNet, steps: [
        pick('pipe', ['الكبلات بتمشي جوّا أنابيب تحت الأرض. اختار أداة <b>الأنبوب</b>', 'Cables run inside underground ducts. Pick the <b>duct</b> tool']),
        info(['من اللوحة بتختار <b>نوع الأنبوب</b>. وخيار «اتباع الشوارع» بيخلّي الخط يمشي مع الشارع وما يقطع البيوت.', 'Choose the <b>duct type</b> here. “Follow streets” keeps the line on the road, never across houses.'], { show: ['#pipeCat', '#roadSnap'], enter: () => U().tab('tool') }),
        drawLine(['ارسم المسار: ابدأ من الـ OLT واضغط العناصر بالترتيب <b>1 ← 5</b>، وبعدها ' + K('Enter') + '. لازم الأنبوب يبدأ ويخلص على عنصر.', 'Draw the route: start at the OLT, click the elements in order <b>1 → 5</b>, then press ' + K('Enter') + '. A duct must start and end on an element.'], ['olt', 'mh1', 'hh1', 'fdc', 'mh2'], 'pipe',
          () => { const ids = [nid('olt', 'olt'), nid('mh', 'mh1'), nid('hh', 'hh1'), nid('sk', 'fdc'), nid('mh', 'mh2')]; return ids.every((id, i) => !i || (id && ids[i - 1] && !!FT.pipeBetween(ids[i - 1], id))); },
          () => addPipeSeq([nid('olt', 'olt'), nid('mh', 'mh1'), nid('hh', 'hh1'), nid('sk', 'fdc'), nid('mh', 'mh2')])),
        info(['لاحظ: انقسم لحالو <b>٤ أنابيب</b>، قطعة بين كل عنصرين، وكل وحدة إلها طولها.', 'Notice it split itself into <b>four ducts</b>, one between each pair of elements, each with its own length.'], { map: 'look' }),
        ...tree('pipe', () => { const p = FT.pipeBetween(nid('olt', 'olt'), nid('mh', 'mh1')); return p && p.id; }, ['الأنابيب', 'Ducts']),
      ] },
      // ------------------------------------------------------------------ 17
      { icon: '🟪', title: ['سحب الكبلات', 'Pulling cables'], cam: camNet, steps: [
        pick('cable', ['هلأ الكبلات نفسها. اختار أداة <b>الكبل</b>', 'Now the cables. Pick the <b>cable</b> tool']),
        { text: ['أول كبل هو <b>كبل التغذية</b> من الـ OLT للخزانة. اختار من القائمة كبل <b>96 شعرة</b>.', 'The first is the <b>feeder</b> from the OLT to the cabinet. Choose the <b>96-fibre</b> cable from the list.'], enter: () => U().tab('tool'), allow: '#cableCat', done: () => U().opt.cableCat === 'bb96', auto: () => { U().opt.cableCat = 'bb96'; U().renderPanel(); } },
        drawLine(['اسحبو <b>جوّا الأنابيب</b>: اضغط العناصر <b>1 ← 4</b> وحدة وحدة، وبعدها ' + K('Enter') + '.', 'Pull it <b>through the ducts</b>: click elements <b>1 → 4</b> one by one, then ' + K('Enter') + '.'], ['olt', 'mh1', 'hh1', 'fdc'], 'cable', () => !!feeder(),
          () => addCableSeq([nid('olt', 'olt'), nid('mh', 'mh1'), nid('hh', 'hh1'), nid('sk', 'fdc')], 'bb96')),
        { text: ['هلأ كبلات <b>التوزيع</b> للعلب. اختار <b>Microcable 4 شعرات</b>.', 'Now the <b>distribution</b> cables to the boxes. Choose the <b>4-fibre microcable</b>.'], enter: () => U().tab('tool'), allow: '#cableCat', done: () => U().opt.cableCat === 'mf4', auto: () => { U().opt.cableCat = 'mf4'; U().renderPanel(); } },
        drawLine(['من الخزانة <b>1</b> للعلبة الأولى <b>2</b>، وبعدها ' + K('Enter') + '.', 'From the cabinet <b>1</b> to the first box <b>2</b>, then ' + K('Enter') + '.'], ['fdc', 'fdb1'], 'cable', () => !!dist1(), () => addCableSeq([nid('sk', 'fdc'), nid('bk', 'fdb1')], 'mf4')),
        drawLine(['وكبل تاني من الخزانة <b>1</b> للعلبة التانية <b>2</b>، وبعدها ' + K('Enter') + '.', 'And another from the cabinet <b>1</b> to the second box <b>2</b>, then ' + K('Enter') + '.'], ['fdc', 'fdb2'], 'cable', () => !!cableAB(nid('sk', 'fdc'), nid('bk', 'fdb2')), () => addCableSeq([nid('sk', 'fdc'), nid('bk', 'fdb2')], 'mf4')),
        info(['الكبلات بتظهر لما تكون <b>مقرّب</b>. ومن بعيد بيبيّن خط الأنبوب بس.', 'Cables show when you are <b>zoomed in</b>; from far away you only see the duct line.'], { map: 'look' }),
        ...tree('cable', () => { const c = feeder(); return c && c.id; }, ['الكبلات', 'Cables']),
      ] },
      // ------------------------------------------------------------------ 18
      { icon: '✂️', title: ['اللحام', 'Splicing'], cam: camNet, steps: [
        info(['الكبلات مرسومة، بس <b>الضوء ما بيمرق</b> لحتى نلحم الشعرات ببعض.', 'The cables are drawn, but <b>no light passes</b> until the fibres are spliced.']),
        pick('splice', ['اختار أداة <b>اللحام</b>', 'Pick the <b>splice</b> tool']),
        { text: ['اضغط على الـ <b>OLT</b> لتفتح جدول اللحام تبعو.', 'Click the <b>OLT</b> to open its splice table.'], pts: [P.olt], done: () => has('#spL') && FT.fui.sp && FT.fui.sp.node === nid('olt', 'olt') },
        { text: ['لحام يدوي: اضغط على <b>PON 1</b> (منفذ الجهاز).', 'Splice by hand: click <b>PON 1</b> (the equipment port).'], show: '#modal .dlg', allow: '#modal .fx-end[data-k="o:1"]', done: () => !!$('#modal .fx-end[data-k="o:1"].pick') || (feeder() && F().busy(nid('olt', 'olt'), { o: 1 })) },
        { text: ['وهلأ اضغط على <b>الشعرة رقم 1</b> بكبل التغذية. هيك انلحمو ببعض.', 'Now click <b>strand 1</b> of the feeder cable. The two are joined.'], show: '#modal .dlg', allow: () => '#modal .fx-end[data-k="c:' + (feeder() || {}).id + ':1"]', done: () => F().busy(nid('olt', 'olt'), { o: 1 }),
          auto: () => { FT.commit(); F().connect(nid('olt', 'olt'), { o: 1 }, { c: feeder().id, f: 1 }); FT.changed('splice'); } },
        closeWin(['الوصلة بتنرسم بلون الشعرة الحقيقي. <b>سكّر النافذة</b>.', 'The join is drawn in the real fibre colour. <b>Close the window</b>.']),
        { text: ['هلأ اضغط على <b>الخزانة FDC</b>.', 'Now click the <b>FDC cabinet</b>.'], pts: [P.fdc], done: () => has('#spL') && FT.fui.sp && FT.fui.sp.node === nid('sk', 'fdc') },
        { text: ['وفّر وقتك: اضغط <b>وصّل مقسّمات هالعلبة تلقائياً</b>.', 'Save time: press <b>Auto-join this box</b>.'], show: '#modal .dlg', allow: '#spAuto', done: () => F().busy(nid('sk', 'fdc'), { s: nid('sk', 'fdc') + '#1', p: 0 }), auto: () => { FT.commit(); F().autoSplice(new Set([nid('sk', 'fdc')])); FT.changed('splice'); } },
        closeWin(['انوصل دخل المقسّم بالخزانة. <b>سكّر النافذة</b>.', 'The cabinet splitter is now fed. <b>Close the window</b>.']),
        { text: ['وباقي العلب كلها بضغطة: من اللوحة اليمين <b>وصل تلقائي لكل المقسّمات غير الملحومة</b>.', 'And every other box in one press: <b>Auto-join every unfed splitter</b> in the right panel.'], enter: () => { if (T().tool !== 'splice') T().setTool('splice'); U().tab('tool'); }, allow: '#spAll', done: () => ['fdb1', 'fdb2'].every(k => { const id = nid('bk', k); return id && F().busy(id, { s: id + '#1', p: 0 }); }), auto: () => { FT.commit(); F().autoSplice(); FT.changed('splice'); } },
        closeWin(['بيعطيك كم مقسّم انوصل، وليش ما انوصل الباقي إذا في. <b>سكّر</b>.', 'It reports what was joined and why anything was not. <b>Close</b>.']),
      ] },
      // ------------------------------------------------------------------ 19
      { icon: '🔦', title: ['تتبّع الليف وقوة الإشارة', 'Fibre trace and signal'], cam: camNet, steps: [
        { text: ['اضغط على <b>العلبة FDB المنوّرة</b> لنشوف إذا واصلها ضوء.', 'Click the <b>lit FDB box</b> to see whether light reaches it.'], pts: [P.fdb1], done: () => !!(T().sel && T().sel.id === nid('bk', 'fdb1')), auto: () => T().select('node', nid('bk', 'fdb1')) },
        info(['باللوحة: منافذ المقسّم، ومكتوب <b>«دخله ملحوم»</b>. هيك بتتأكد إنو العلبة موصولة (مو من الشارة).', 'In the panel: the splitter ports and <b>“input fused”</b>. That is how you know the box is fed (not from the badge).'], { show: '#right', enter: () => T().select('node', nid('bk', 'fdb1')) }),
        { text: ['اضغط <b>تتبّع الليف</b>.', 'Press <b>fibre trace</b>.'], enter: () => { if (!T().sel) T().select('node', nid('bk', 'fdb1')); }, allow: '#pTrace', done: () => has('.fx-steps') },
        info(['هون الطريق <b>خطوة بخطوة</b> من الـ OLT: كل كبل وشعرة ولحام ومقسّم. وتحت <b>ميزانية الإشارة</b>: الفقد الكلي و<b>قوة الإشارة عند المستقبل (dBm)</b> والهامش. (نزّل بالنافذة لتشوفها.)', 'Here is the path <b>step by step</b> from the OLT: every cable, strand, splice and splitter. Below it the <b>signal budget</b>: total loss, <b>received power (dBm)</b> and margin. (Scroll the window to see it.)'], { show: '#modal .dlg' }),
        { text: ['اضغط <b>اعرض المسار عالخريطة</b>.', 'Press <b>Show on the map</b>.'], show: '#modal .dlg', allow: '#modal .df .btn.pri', done: () => !modalOn() },
        info(['هاد طريق الضوء من الجهاز لهالعلبة.', 'This is the road of the light from the equipment to this box.'], { map: 'look' }),
      ] },
      // ------------------------------------------------------------------ 20
      { icon: '🛣️', title: ['مسار بين نقطتين', 'Route between two points'], cam: camNet, begin: () => { delete V().routed; }, steps: [
        pick('route', ['أداة <b>المسار</b> بتعطيك طول طريق الكبلات بين أي عنصرين. اختارها', 'The <b>route</b> tool gives the cable distance between any two elements. Pick it']),
        { text: ['اضغط <b>1</b> (الـ OLT) وبعدها <b>2</b> (العلبة). بيطلعلك الطول وعدد العقد.', 'Click <b>1</b> (OLT), then <b>2</b> (box). You get the length and node count.'], pts: [P.olt, P.fdb1], at: () => (V().routed ? 2 : T().draw ? 1 : 0), done: () => !!V().routed, auto: () => { V().routed = 1; } },
        info(['المسار منوّر على الخريطة.', 'The route is highlighted on the map.'], { map: 'look' }),
      ] },
      // ------------------------------------------------------------------ 21
      { icon: '🔗', title: ['إعادة توصيل كبل', 'Reconnecting a cable'], cam: camNet, begin: () => { const c = cableAB(nid('sk', 'fdc'), nid('bk', 'fdb2')); V().c2 = c && c.id; }, steps: [
        pick('reconnect', ['إذا كبل موصول على العنصر الغلط، ما في داعي ترسمو من جديد. اختار <b>إعادة التوصيل</b>', 'A cable on the wrong element need not be redrawn. Pick <b>reconnect</b>']),
        { text: ['اضغط على <b>الكبل قريب من طرفو</b> يلي بدك تنقلو.', 'Click the <b>cable near the end</b> you want to move.'], pts: [{ ll: () => (c2() ? pointNear(c2(), nid('bk', 'fdb2'), 6.5) : null) }], done: () => !!(T().draw && T().draw.line && T().draw.line.id === V().c2) || (c2() && c2().b === nid('bk', 'fdb1')) },
        { text: ['وهلأ اضغط على <b>العلبة الجديدة</b>.', 'Now click the <b>new box</b>.'], pts: [P.fdb1], done: () => !!(c2() && c2().b === nid('bk', 'fdb1')),
          auto: () => { const c = c2(), n = S().nodes[nid('bk', 'fdb1')]; if (!c || !n) return; T().draw = null; FT.commit(); c.b = n.id; c.nodes[c.nodes.length - 1] = n.id; if (c.segs && c.segs.length) { const s = c.segs[c.segs.length - 1]; s[s.length - 1] = n.ll.slice(); } FT.changed('reconnect'); } },
        { text: ['انتقل الكبل. هاد كان للتجربة، فرجّعو: ' + K('Ctrl') + ' + ' + K('Z') + ' أو ↶.', 'The cable moved. That was practice, so undo it: ' + K('Ctrl') + ' + ' + K('Z') + ' or ↶.'], allow: '#bUndo', keys: ['Ctrl+KeyZ'], done: () => !!(c2() && c2().b === nid('bk', 'fdb2')), auto: () => { if (c2() && c2().b !== nid('bk', 'fdb2')) FT.undo(); } },
      ] },
      // ------------------------------------------------------------------ 22
      { icon: '👤', title: ['ربط مشترك', 'Connecting a subscriber'], cam: camNet, steps: [
        pick('sub', ['هلأ منوصل أول زبون. اختار <b>ربط مشترك</b>', 'Let us connect the first customer. Pick <b>connect subscriber</b>']),
        { text: ['أول شي اضغط على <b>العلبة</b> يلي بدو ياخد منها.', 'First click the <b>box</b> that will serve it.'], pts: [P.fdb1], done: () => !!(T().sel && T().sel.id === nid('bk', 'fdb1')) || has('#coGo'), auto: () => { } },
        { text: ['وبعدها على <b>لوغو البيت</b>.', 'Then click the <b>house icon</b>.'], pts: [onHouse('a2')], done: () => has('#coGo') || Object.values(S().subs).some(s => s.bld === 'tr_a2') },
        { text: ['هاي منافذ المقسّم. اختار <b>المنفذ رقم 3</b>.', 'These are the splitter ports. Choose <b>port 3</b>.'], show: '#modal .dlg', allow: '#modal [data-port="1:3"]', done: () => !!$('#modal [data-port="1:3"].pick') || Object.values(S().subs).some(s => s.bld === 'tr_a2') },
        { text: ['تحت فيك تختار كبل أرضي أو هوائي، وتكتب العنوان ورقم المشترك. اضغط <b>اربط</b>.', 'Below you can choose buried or aerial and enter address and subscriber number. Press <b>Connect</b>.'], show: '#modal .dlg', allow: '#coGo', done: () => Object.values(S().subs).some(s => s.bld === 'tr_a2'),
          auto: () => { if (!Object.values(S().subs).some(s => s.bld === 'tr_a2')) FT.fui.addSubscriber(nid('bk', 'fdb1'), 'tr_a2', { spl: 1, port: 3, medium: 'free', autoJoin: true }); } },
        info(['✅ هيك بتعرف إنو <b>البيت موصول</b>: رسمو صار <b>أزرق</b>، وانرسم كبل المشترك من العلبة. (الشارة فوق العلبة لحالها ما بتعني هيك.)', '✅ This is how a <b>connected house</b> looks: its drawing turns <b>blue</b> and a drop cable runs from the box. (The badge above a box alone does not mean that.)'], { map: 'look', enter: () => { T().setTool('select'); T().select(null); } }),
      ] },
      // ------------------------------------------------------------------ 23
      { icon: '🌐', title: ['شبكة PON', 'The PON view'], cam: camNet, steps: [
        { text: ['فوق، افتح تبويب <b>PON</b>.', 'At the top, open the <b>PON</b> tab.'], allow: '#modeTabs button[data-mode=pon]', done: () => U().mode() === 'pon' },
        info(['هون كل منفذ PON كشجرة: المقسّمات، المخارج المستعملة، ونسبة المشتركين. اضغط أي اسم من الشجرة لتتبّعو.', 'Every PON port as a tree: splitters, used outputs and subscriber share. Any name in the tree can be traced.'], { show: '#right', enter: () => { if (U().mode() !== 'pon') { const b = $('#modeTabs button[data-mode=pon]'); if (b) b.click(); } U().tab('analysis'); } }),
        { text: ['ارجع لتبويب <b>البنية التحتية</b>.', 'Go back to the <b>infrastructure</b> tab.'], allow: '#modeTabs button[data-mode=infra]', done: () => U().mode() === 'infra', auto: () => { const b = $('#modeTabs button[data-mode=infra]'); if (b) b.click(); } },
      ] },
      // ------------------------------------------------------------------ 24
      { icon: '✨', title: ['التصميم التلقائي', 'Automatic design'], cam: camEast, end: () => setTimeout(() => { if ($('#drTabs')) U().closeModal(); }, 700), steps: [
        info(['اشتغلنا الغرب بإيدنا لتفهم كل قطعة. <b>الشرق رح تصمّمو الأداة لحالها.</b>', 'We built the west by hand so you know every part. <b>The planner will design the east by itself.</b>']),
        pick('design', ['اختار <b>التصميم التلقائي</b>', 'Pick <b>automatic design</b>']),
        drawArea(['ارسم منطقة حول <b>البيوت الشرقية</b>: <b>1 ← 4</b> وعلى الرابعة ضغطتين.', 'Draw an area around the <b>eastern houses</b>: <b>1 → 4</b>, double-click the fourth.'], W.areaEast, () => has('#dsOlt') || designed()),
        info(['قبل التطبيق بتشوف: عدد العلب والخزائن، أطوال الأنابيب والكبلات، وأسوأ فقد. وفيك تغيّر طريقة التمديد ونسب المقسّمات وسعة الخزانة. (انتظر الحساب يخلص.)', 'Before applying you see boxes, cabinets, lengths and worst loss. You can change construction, split ratios and cabinet size. (Let it finish computing.)'], { show: '#modal .dlg' }),
        { text: ['اضغط <b>تطبيق</b>.', 'Press <b>Apply</b>.'], show: '#modal .dlg', allow: '#modal .df .btn.pri', done: designed,
          auto: async () => { if (designed()) return; if (modalOn()) U().closeModal(); const olt = S().nodes[nid('olt', 'olt')]; await FT.map.ensureTiles(FT.bboxOf(W.areaEast)); const blds = FT.map.buildingsInRing(W.areaEast); FT.design.workerReset(); const plan = await FT.design.planAsync(blds, olt, { s1: 4, s2: 4, cab: 48 }); FT._designHomes = 0; FT.design.apply(plan, { homes: false, aerial: false }); } },
        { text: ['طلعت <b>نتائج التصميم</b>. افتح تبويب <b>خطة اللحام</b>.', 'The <b>design results</b> open. Click the <b>splices</b> tab.'], show: '#modal .dlg', allow: '#drTabs button[data-t=splices]', press: '#drTabs button[data-t=splices]', enter: () => { setTimeout(() => { if (!$('#drTabs')) FT.designResults.open(); }, 700); }, done: () => TR.pressed },
        { text: ['وهلأ تبويب <b>التحذيرات</b>: أي مشكلة بالتصميم بتبيّن هون مع زر «روح» لمكانها.', 'Now the <b>warnings</b> tab: every problem is listed with a button that takes you there.'], show: '#modal .dlg', allow: '#drTabs button[data-t=warn]', press: '#drTabs button[data-t=warn]', done: () => TR.pressed },
        closeWin(['ومن هالنافذة كمان بتنزّل تقرير التصميم ولصاقات الألياف. <b>سكّرها</b>.', 'From here you can also download the design report and fibre labels. <b>Close it</b>.']),
        { text: ['🌳 كل تصميم بينحط بمجلّد لحالو بالشجرة. <b>خفي المجلّد</b> كلو.', '🌳 Each design gets its own folder in the tree. <b>Hide the whole folder</b>.'], enter: showFolderRow, allow: folderRow, done: () => { const l = folderItems(); return !!l.length && l.every(id => T().hidden.has(id)); } },
        { text: ['و<b>رجّعو</b>.', 'And <b>show it again</b>.'], allow: folderRow, done: () => folderItems().every(id => !T().hidden.has(id)), auto: () => { U().hideFolder(folderId(), false); } },
      ] },
      // ------------------------------------------------------------------ 25
      { icon: '⬠', title: ['تحديد منطقة', 'Area selection'], cam: camEast, steps: [
        pick('area', ['لتحدّد أشياء كتيرة مرة وحدة، اختار <b>تحديد منطقة</b>', 'To select many things at once, pick <b>area select</b>']),
        drawArea(['ارسم المنطقة: <b>1 ← 4</b> وضغطتين على الرابعة.', 'Draw the area: <b>1 → 4</b>, double-click the fourth.'], W.areaEast, () => !!(T().multi && T().multi.nodes.size), () => T().selectMulti(T().collectIn(W.areaEast))),
        info(['كل يلي جوّا المنطقة تحدّد، وباللوحة عددهن، ومنها بتطلع <b>تقرير للمنطقة بس</b> أو بتحذفهن.', 'Everything inside is selected. The panel counts it and can <b>report just this area</b> or delete it.'], { show: '#right', map: 'look' }),
        { text: ['اضغط ' + K('Esc') + ' لتلغي.', 'Press ' + K('Esc') + ' to cancel.'], keys: ['Escape'], map: 'look', done: () => !T().multi, auto: () => { T().select(null); FT.map.setDone(null); } },
      ] },
      // ------------------------------------------------------------------ 26
      { icon: '📐', title: ['تخطيط منطقة', 'Area planning estimate'], cam: [W.ll(-146, -30), W.ll(122, 70)], camOpt: { min: 17.1 }, steps: [
        pick('plan', ['قبل ما تصمّم، فيك تاخد <b>تقدير سريع</b> لأي منطقة. اختار <b>تخطيط</b>', 'Before designing you can get a <b>quick estimate</b> of any area. Pick <b>planning</b>']),
        drawArea(['ارسم حول الحي كلو: <b>1 ← 4</b>.', 'Draw around the whole quarter: <b>1 → 4</b>.'], W.areaAll, () => has('.kv')),
        closeWin(['عدد المباني والمساحة وتقدير العلب والخزائن ومنافذ PON. <b>سكّر</b>.', 'Buildings, area and an estimate of boxes, cabinets and PON ports. <b>Close</b>.']),
      ] },
      // ------------------------------------------------------------------ 27
      { icon: '🗂️', title: ['إدارة الطبقات', 'Managing layers'], cam: camAll, steps: [
        press(['اطوي الشجرة كلها بزر <b>⇕</b>.', 'Collapse the whole tree with <b>⇕</b>.'], '#bCollapse'),
        press(['وافتحها مرة تانية بنفس الزر.', 'Open it again with the same button.'], '#bCollapse'),
        { text: ['<b>البحث:</b> اكتب <b>FDB</b> بخانة البحث.', '<b>Search:</b> type <b>FDB</b> in the search box.'], allow: '#lsearch', done: () => /fdb/i.test($('#lsearch').value) },
        { text: ['امسح الكلمة لترجع كل العناصر.', 'Clear it to bring everything back.'], allow: '#lsearch', done: () => !$('#lsearch').value, auto: () => { const q = $('#lsearch'); q.value = ''; q.oninput({ target: q }); } },
        press(['<b>الفلاتر:</b> اضغط <b>العلب</b> لتشوف العلب بس.', '<b>Filters:</b> press <b>boxes</b> to list only boxes.'], '#chips .chip[data-c=box]'),
        press(['ورجّعها على <b>الكل</b>.', 'Back to <b>all</b>.'], '#chips .chip[data-c=all]'),
        { text: ['<b>مجلّد جديد:</b> اضغط زر <b>▣</b>، اكتب اسم، واضغط موافق.', '<b>New folder:</b> press <b>▣</b>, type a name and confirm.'], allow: ['#bNewFolder', '#modal2 .dlg'], keys: ['Enter'], done: () => Object.values(S().folders || {}).some(f => !/^Design-\d+$/.test(f.name)), auto: () => { FT.commit(); (S().folders = S().folders || {}).ftrain = { name: TR.say(['مجلّدي', 'My folder']) }; FT.changed('folder'); } },
        info(['وكمان: <b>اسحب</b> أي عنصر وارميه بالمجلّد، أو غيّر ترتيبو. مرّر عالسطر بتطلعلك أزرار: ▲▼ ترتيب، 🔒 قفل (ما بيتحرّك بالغلط)، 🗑 حذف، ⋯ خيارات.', 'Also <b>drag</b> any element into a folder or reorder it. Hovering a row shows: ▲▼ order, 🔒 lock (no accidental moves), 🗑 delete, ⋯ more.'], { show: '#left' }),
      ] },
      // ------------------------------------------------------------------ 28
      { icon: '👁️', title: ['إظهار وإخفاء الخريطة', 'Showing and hiding on the map'], cam: camAll, begin: () => { V().theme0 = U().theme(); }, end: () => { const q = FT.map; if (q.base !== 'map' && q.base) q.setBase('map'); if (q.netHidden) q.setNetHidden(false); if (q.hideHouses) q.setHousesHidden(false); if (q.hideBld) q.setBldHidden(false); if (U().theme() !== V().theme0) U().setTheme(V().theme0); if ($('#left').style.display === 'none') U().toggleLeft(); if ($('#right').classList.contains('hide')) U().toggleRight(); U().applyLang(); }, steps: [
        ...toggle('#bHideNet', () => !!FT.map.netHidden, ['<b>إخفاء الشبكة:</b> اضغط الزر المنوّر.', '<b>Hide the network:</b> press the lit button.'], ['كل الشبكة اختفت. <b>رجّعها</b> بنفس الزر.', 'The whole network is gone. <b>Bring it back</b> with the same button.']),
        ...toggle('#bHideHouses', () => !!FT.map.hideHouses, ['<b>إخفاء لوغو البيوت.</b>', '<b>Hide the house icons.</b>'], ['ورجّعها.', 'And show them again.']),
        ...toggle('#bHideBld', () => !!FT.map.hideBld, ['<b>إخفاء رسم المباني</b> (بيضل اللوغو).', '<b>Hide the building drawings</b> (icons stay).'], ['ورجّعو.', 'And show them again.']),
        { text: ['<b>ثلاثي الأبعاد:</b> اضغط زر <b>3D</b>.', '<b>3D:</b> press the <b>3D</b> button.'], allow: '#basemap [data-b="3d"]', done: () => FT.map.base === '3d' },
        info(['البيوت والعلب مجسّمات. جرّب لفّ الخريطة بالزر اليمين أو عجلة الماوس.', 'Houses and boxes stand in 3D. Rotate with the right button or the wheel button.'], { map: 'free' }),
        { text: ['<b>القمر الصناعي:</b> اضغط زرّو.', '<b>Satellite:</b> press its button.'], allow: '#basemap [data-b=sat]', done: () => FT.map.base === 'sat' },
        info(['هاد تصوير حقيقي للأرض. حيّنا التدريبي وهمي، فما رح تشوف بيوتو بالصورة. بمشاريعك الحقيقية بتفيدك لتتأكد من الواقع.', 'This is real imagery of the ground. The training quarter is invented, so its houses are not in the picture. On real projects it shows you the truth on site.'], { map: 'free' }),
        { text: ['ارجع على <b>خريطة الشارع</b>.', 'Back to the <b>street map</b>.'], allow: '#basemap [data-b=map]', done: () => FT.map.base === 'map' || !FT.map.base, auto: () => { FT.map.setBase('map'); U().applyLang(); } },
        { text: ['<b>غامق / فاتح:</b> اضغط الزر المنوّر فوق.', '<b>Dark / light:</b> press the lit button at the top.'], allow: () => '#themeSw button[data-th=' + (V().theme0 === 'dark' ? 'light' : 'dark') + ']', done: () => U().theme() !== V().theme0 },
        { text: ['الشكل بيتغيّر للأداة والخريطة سوا. <b>رجّع شكلك</b>.', 'The planner and the map change together. <b>Switch back</b>.'], allow: () => '#themeSw button[data-th=' + V().theme0 + ']', done: () => U().theme() === V().theme0, auto: () => U().setTheme(V().theme0) },
        ...toggle('#bNames', () => $('#bNames').classList.contains('on'), ['زر <b>Aa</b> تحت: بيظهر أسماء العناصر دايماً.', 'The <b>Aa</b> button below: always show element names.'], ['اطفيه.', 'Turn it off.']),
        press(['وسّع الخريطة: <b>خفي لوحة الطبقات</b> (أو ' + K('Ctrl') + ' + ' + K('B') + ').', 'Widen the map: <b>hide the layer panel</b> (or ' + K('Ctrl') + ' + ' + K('B') + ').'], '#bLay', { done: () => $('#left').style.display === 'none' }),
        press(['<b>رجّعها</b>.', '<b>Bring it back</b>.'], '#bLay', { done: () => $('#left').style.display !== 'none' }),
        press(['ونفس الشي <b>للوحة اليمين</b>: خفيها.', 'The same for the <b>right panel</b>: hide it.'], '#bPan', { done: () => $('#right').classList.contains('hide') }),
        press(['رجّعها.', 'Show it again.'], '#bPan', { done: () => !$('#right').classList.contains('hide') }),
      ] },
      // ------------------------------------------------------------------ 29
      { icon: '📊', title: ['التحليل وفحص المواصفة', 'Analysis and compliance'], cam: camAll, steps: [
        press(['باللوحة اليمين افتح تبويب <b>التحليل</b>.', 'Open the <b>analysis</b> tab in the right panel.'], '.tabs button[data-tab=analysis]', { auto: () => U().tab('analysis') }),
        info(['ملخّص المشروع: الأعداد والأطوال و<b>الكلفة</b> وميزانية الإشارة. ومن فوق: جداول التصميم، والوصل التلقائي، وقيم حساب الإشارة.', 'The project summary: counts, lengths, <b>cost</b> and signal budget. At the top: design tables, auto-join and signal values.'], { show: '#right', enter: () => U().tab('analysis') }),
        opens('soc', '.dlg, .db', ['هلأ <b>فحص المواصفة</b>: اضغط زرّو بشريط الأدوات.', 'Now the <b>compliance check</b>: press its toolbar button.']),
        closeWin(['بيفحص المشروع على مواصفة الاتصالات السورية بند بند. <b>سكّر</b>.', 'It checks the project against the Syrian Telecom specification, item by item. <b>Close</b>.']),
      ] },
      // ------------------------------------------------------------------ 30
      { icon: '💱', title: ['الأسعار والعملة', 'Prices and currency'], cam: camAll, begin: () => { V().cur0 = FT.cur(); }, end: () => { if (FT.cur() !== V().cur0) FT.undo(); U().priceBtn(); }, steps: [
        { text: ['فوق، افتح <b>الأسعار</b>.', 'Open <b>prices</b> at the top.'], allow: '#bPrices', done: () => has('#prCur') },
        { text: ['اختار العملة <b>ريال سعودي</b>. الأسعار بتتحوّل لحالها.', 'Choose <b>Saudi riyal</b>. Prices convert themselves.'], show: '#modal .dlg', allow: '#prCur button[data-cur=SAR]', done: () => !!$('#prCur button[data-cur=SAR].on') || FT.cur() === 'SAR' },
        { text: ['وفيك تعدّل أي سعر على كيفك. اضغط <b>حفظ</b>.', 'Any price can be edited. Press <b>save</b>.'], show: '#modal .dlg', allow: '#modal .df .btn.pri', done: () => !modalOn() && FT.cur() === 'SAR' },
        info(['زر الأسعار صار بالريال، والتقرير والكلفة كلهن بيمشو عليه. (بآخر الدرس منرجّع عملتك الأولى.)', 'The button now shows riyals, and the cost and report follow. (Your first currency returns after this lesson.)'], { show: '#bPrices' }),
      ] },
      // ------------------------------------------------------------------ 31
      { icon: '📄', title: ['التقرير PDF', 'The PDF report'], cam: camAll, begin: () => { delete V().report; }, steps: [
        opens('report', '#rpScope', ['صار وقت <b>التقرير</b>. اضغط زرّو.', 'Time for the <b>report</b>. Press its button.']),
        info(['هون جدول الكميات والكلفة. وفيك تختار: <b>المشروع كامل</b>، أو المحدّد، أو <b>منطقة بترسمها</b>. وكمان CSV لإكسل.', 'Quantities and cost. Choose the <b>whole project</b>, the selection, or <b>an area you draw</b>. CSV for Excel too.'], { show: '#modal .dlg' }),
        { text: ['اضغط الزر الأخضر لتنزّل <b>التقرير PDF</b>، وانتظر لحتى يخلص. (بينزل ملف على جهازك فيه بيانات مشروع التدريب بس.)', 'Press the green button to download the <b>PDF report</b> and wait. (A file with training data only is saved to your computer.)'], show: '#modal .dlg', allow: '#modal .df .btn.ok', done: () => !!V().report },
        info(['تقرير رسمي ملوّن بضغطة: ملخّص، خريطة، علب، كبلات، لحام، قوة الإشارة لكل علبة، مواد وكلفة. افتحو من مجلّد التنزيلات.', 'A colour report in one press: summary, map, boxes, cables, splices, signal per box, material and cost. Open it from your downloads.'], { enter: () => { if (modalOn()) U().closeModal(); } }),
      ] },
      // ------------------------------------------------------------------ 32
      { icon: '🌍', title: ['تصدير KMZ لغوغل إيرث', 'KMZ export for Google Earth'], cam: camAll, begin: () => { delete V().kmz; }, steps: [
        opens('kmz', '#kzGo', ['اضغط زر <b>KMZ</b>.', 'Press the <b>KMZ</b> button.']),
        info(['بتختار شو يدخل بالملف، المشروع كامل أو منطقة. والملف <b>بيشرح حالو</b>: صفحة «اقرأني»، ومفتاح رموز، وبطاقة لكل عنصر.', 'Pick what goes in, whole project or an area. The file <b>explains itself</b>: a read-me page, a symbol key and a card for every element.'], { show: '#modal .dlg' }),
        { text: ['اضغط <b>تنزيل KMZ</b>.', 'Press <b>Download KMZ</b>.'], show: '#modal .dlg', allow: ['#kzGo', '#modal [data-kz]'], done: () => !!V().kmz },
      ] },
      // ------------------------------------------------------------------ 33
      { icon: '📐', title: ['تصدير أوتوكاد DXF', 'AutoCAD DXF export'], cam: camAll, steps: [
        opens('dxf', '#dxArea', ['اضغط زر <b>DXF</b>.', 'Press the <b>DXF</b> button.']),
        { text: ['أول شي <b>المنطقة</b>: اختار <b>المشروع كامل</b>. (فيك كمان ترسم مضلّع أو مستطيل.)', 'First the <b>area</b>: choose <b>whole project</b>. (You can also draw a polygon or rectangle.)'], show: '#modal .dlg', allow: '#dxArea button[data-m=all]', done: () => !!$('#dxArea button[data-m=all].on') },
        info(['بعدها المحتوى: الرسم لحالو أو مع خريطة المنطقة، والطبقات يلي بدك ياها. الملف بيفتح بأوتوكاد وكل شي فيه قابل للتعديل.', 'Then the content: drawing only or with the area map, and the layers you want. It is made to stay editable in AutoCAD.'], { show: '#modal .dlg' }),
        { text: ['اضغط زر <b>التصدير</b>.', 'Press <b>export</b>.'], show: '#modal .dlg', allow: '#dxGo:not([disabled])', press: '#dxGo', done: () => TR.pressed, after: () => setTimeout(() => { if (modalOn() && $('#dxArea')) U().closeModal(); }, 1500) },
      ] },
      // ------------------------------------------------------------------ 34
      { icon: '💾', title: ['الملفات والاستيراد', 'Files and import'], cam: camAll, steps: [
        opens('import', '#ioSave', ['اضغط زر <b>الاستيراد والملفات</b>.', 'Press <b>files and import</b>.']),
        closeWin(['من هون: <b>حفظ المشروع</b> كملف وتحميلو، وتصدير GeoJSON و GeoPackage، و<b>استيراد</b> KML / KMZ / GeoJSON / DXF من برامج تانية. <b>سكّر</b>.', 'From here: <b>save</b> the project to a file and load it, export GeoJSON and GeoPackage, and <b>import</b> KML / KMZ / GeoJSON / DXF. <b>Close</b>.']),
      ] },
      // ------------------------------------------------------------------ 35
      { icon: '☁️', title: ['الفريق والسيرفر', 'Team and server'], cam: camAll, steps: [
        info(['<b>مشاركة:</b> بتعطيك رابطين: واحد <b>للتعديل</b> لزملاءك، وواحد <b>للمشاهدة بس</b>. وبتشتغلو على نفس المشروع مباشرة.', '<b>Share</b> gives two links: an <b>edit</b> link for colleagues and a <b>view-only</b> link. You work on the same project live.'], { show: '#bShare' }),
        info(['<b>رفع للسيرفر:</b> النقطة جنبو بتبيّن حالة الحفظ. ولما تضغطو ما بيقلّك «محفوظ» إلا بعد ما <b>يتأكد من السيرفر</b>. ومنو بترفع ملف مشروع من جهازك كمشروع مشترك جديد.<br>(بالتدريب ما منتصل بالسيرفر أبداً.)', '<b>Upload to server:</b> the dot shows the saving state. It only says “saved” after <b>the server confirms it</b>. It can also upload a project file as a new shared project.<br>(Training never contacts the server.)'], { show: '#bCloud' }),
        { text: ['وأخيراً زر <b>تعليمي</b> فوق: اضغطو.', 'Finally the <b>Tutorials</b> button at the top: press it.'], hub: true, allow: '#bLearn', done: () => has('[data-hub=tips]') },
        { text: ['فيه تلات بطاقات: <b>فيديوهات الشرح</b>، <b>التلميحات والاختصارات</b>، و<b>التدريب التفاعلي</b>. اضغط <b>التلميحات</b>.', 'Three cards: <b>videos</b>, <b>tips and shortcuts</b> and <b>interactive training</b>. Press <b>tips</b>.'], hub: true, show: '#modal .dlg', allow: '#modal [data-hub=tips]', done: () => has('.hub-tips') },
        Object.assign(closeWin(['نصائح سريعة وكل الاختصارات. وبتفتحها دايماً بزر ' + K('?') + ' أو ' + K('F1') + '. <b>سكّر</b>.', 'Quick tips and every shortcut. ' + K('?') + ' or ' + K('F1') + ' opens it any time. <b>Close</b>.']), { hub: true }),
        info(['وتحت <b>سطر الأوامر</b>: اكتب <b>help</b> لتشوف الأوامر. وزر <b>EN / عربي</b> فوق بيبدّل لغة الأداة.', 'At the bottom is the <b>command line</b>: type <b>help</b> for the commands. The <b>EN / عربي</b> button at the top switches language.'], { show: ['#cmd', '#bLang'] }),
      ] },
    ];
  };
})(window);
