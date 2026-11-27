/* "Tutorials": the one header button. It opens three cards - the videos, the tips and shortcuts, and the interactive
   training - and each of them opens in the same window with a way back. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const H = FT.hub = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => (ar() ? a : e);
  const S = p => '<svg viewBox="0 0 24 24">' + p + '</svg>';
  const ICON = {
    videos: S('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>'),
    tips: S('<path d="M12 3a6 6 0 00-3.500 10.900c.700.500 1 1.200 1 2.100h5c0-.900.300-1.600 1-2.100A6 6 0 0012 3z"/><path d="M9.800 19h4.400M10.500 21.500h3"/>'),
    lessons: S('<path d="M2 9l10-4.500L22 9l-10 4.500z"/><path d="M6.500 11.200V16c0 1.400 2.500 2.800 5.500 2.800s5.500-1.400 5.500-2.800v-4.800M22 9v5.500"/>'),
  };
  const seenCount = () => { try { return Object.keys(JSON.parse(localStorage.getItem('ft2_videos_seen')) || {}).length; } catch (e) { return 0; } };

  function home() {
    const seen = seenCount(), n = FT.videos.list.length, at = FT.train.progress();
    const card = (id, title, text, state, flag) => '<button type="button" class="hub-card" data-hub="' + id + '">' + (flag ? '<em>' + flag + '</em>' : '') + '<i>' + ICON[id] + '</i><b>' + title + '</b><span>' + text + '</span><small>' + state + '</small></button>';
    return '<div class="hub-home">' +
      card('videos', tx('فيديوهات الشرح', 'Tutorial videos'), tx('درس فيديو لكل مجموعة أدوات، متصوّر من الأداة نفسها', 'One video per tool group, recorded from the planner itself'), seen ? tx('شفت ' + Math.min(seen, n) + ' من ' + n, 'Watched ' + Math.min(seen, n) + ' of ' + n) : tx(n + ' فيديوهات', n + ' videos'), seen ? '' : tx('ابدأ من هون', 'Start here')) +
      card('tips', tx('التلميحات والاختصارات', 'Tips and shortcuts'), tx('نصائح سريعة وكل اختصارات الكيبورد', 'Quick advice and every keyboard shortcut'), tx('تفتح كمان بزر <kbd>?</kbd> أو <kbd>F1</kbd>', 'Also opens with <kbd>?</kbd> or <kbd>F1</kbd>')) +
      card('lessons', tx('التدريب التفاعلي', 'Interactive training'), tx('بتبني شبكة كاملة بإيدك خطوة بخطوة، بمكان معزول عن مشاريعك', 'Build a whole network yourself, step by step, sealed off from your projects'), at ? tx('كمّل من الأداة ' + (at + 1), 'Continue at tool ' + (at + 1)) : tx('35 درس على حي تدريبي', '35 lessons on a practice quarter')) +
      '</div>';
  }
  const TIPS = [
    ['العناصر بتتحدّد وبتتحرّك لما تكون <b>مقرّب</b> بس، مشان ما تتحرّك بالغلط.', 'Elements can be selected and moved only when you are <b>zoomed in</b>, so nothing moves by accident.'],
    ['<b>Esc</b> بيلغي أي شي: الرسم، التحديد، أو بيسكّر النافذة.', '<b>Esc</b> cancels anything: a drawing, a selection, or closes a window.'],
    ['<b>Ctrl + Z</b> بيرجّع أي خطوة، حتى التصميم التلقائي كلو.', '<b>Ctrl + Z</b> undoes any step, even a whole automatic design.'],
    ['<b>Shift</b> مع الضغط بيحدّد أكتر من عنصر. و<b>الزر اليمين</b> بيفتح قائمة سريعة.', '<b>Shift</b> + click selects several elements. <b>Right click</b> opens a quick menu.'],
    ['المستطيل «1:4» فوق البيت معناه إنو في مقسّم، <b>مو إنو موصول</b>. للتأكد: «دخله ملحوم» بالخصائص، أو «تتبّع الليف».', 'The “1:4” rectangle means there is a splitter, <b>not that it is connected</b>. Check “input fused” in the properties, or trace the fibre.'],
    ['العنصر الجديد القريب من شارع بينسحب عالشارع. لحيط البيت: اسحبو بأداة التحديد.', 'A new element near a street is pulled onto it. For a house wall, drag it with the select tool.'],
  ];
  const tips = () => '<h4 class="fx-h">' + tx('نصائح سريعة', 'Quick tips') + '</h4><ul class="hub-tips">' + TIPS.map(t => '<li>' + t[ar() ? 0 : 1] + '</li>').join('') + '</ul><h4 class="fx-h">' + tx('كل الاختصارات', 'Every shortcut') + '</h4>' + FT.UI.helpBody();

  H.open = function (view) {
    view = ['videos', 'tips', 'lessons'].includes(view) ? view : 'home';
    H.view = view;
    const TR = FT.train;
    const title = { home: tx('تعليمي', 'Tutorials'), videos: tx('فيديوهات الشرح', 'Tutorial videos'), tips: tx('التلميحات والاختصارات', 'Tips and shortcuts'), lessons: tx('التدريب التفاعلي', 'Interactive training') }[view];
    const body = view === 'home' ? home() : view === 'videos' ? '<p class="d">' + tx('الفيديوهات بلغة الأداة الحالية. ابدأ بالأول.', 'The videos follow the planner\'s language. Start with the first.') + '</p>' + FT.videos.cardsHtml() : view === 'tips' ? tips() : TR.lessonsHtml();
    const btns = view === 'home' ? [{ label: FT.t('close') }] : [{ label: tx('→ رجوع', '← Back'), keep: true, fn: () => H.open('home') }, { label: FT.t('close') }];
    FT.UI.modal(title, body, btns, root => {
      root.dir = ar() ? 'rtl' : 'ltr';
      const dlg = root.closest('.dlg'); dlg.classList.add('hub-dlg', 'hv-' + view); // (not 'hub-...': those class names belong to the content)
      root.querySelectorAll('[data-hub]').forEach(b => b.onclick = () => H.open(b.dataset.hub));
      if (view === 'videos') FT.videos.wire(root);
      if (view === 'lessons') TR.wireLessons(root);
    }, () => { TR.menu = false; });
    // inside the training the window is a pause menu, except when a lesson step itself is pointing into it
    const st = TR.active && !TR.finished && TR.step();
    TR.menu = !!(TR.active && !(st && st.hub));
  };
})(window);
