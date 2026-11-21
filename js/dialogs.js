/* FTTH planner — menu drawer, dialogs, reports and exports. */
(function () {
  'use strict';
  const A = window.FTAPP, $ = (s, r) => (r || document).querySelector(s), t = A.t, esc = A.esc;

  /* ------------------------------------------------------------ drawer */
  const MENU = [
    ['m_g_project', [['info', 'project', 'm_project', 'm_project_s'], ['dash', 'dashboard', 'm_dashboard', 'm_dashboard_s'], ['check', 'checks', 'm_checks', 'm_checks_s']]],
    ['m_g_design', [['settings', 'settings', 'm_settings', 'm_settings_s'], ['lib', 'library', 'm_library', 'm_library_s'], ['color', 'colors', 'm_colors', 'm_colors_s'], ['layers', 'display', 'm_display', 'm_display_s']]],
    ['m_g_output', [['report', 'reports', 'm_reports', 'm_reports_s'], ['io', 'io', 'm_io', 'm_io_s']]],
    ['m_g_help', [['keys', 'help', 'm_help', 'm_help_s'], ['info', 'about', 'm_about', 'm_about_s']]]
  ];
  A.openDrawer = function () {
    const d = $('#drawer'); d.innerHTML = '<div class="dh"><b>FTTH Planner</b><small>' + esc(t('menu_sub')) + '</small></div>' + MENU.map(g => '<div class="mg">' + esc(t(g[0])) + '</div>' + g[1].map(i => '<button class="mi" data-d="' + i[1] + '">' + A.ic(i[0]) + '<span>' + esc(t(i[2])) + '<small>' + esc(t(i[3])) + '</small></span></button>').join('')).join('');
    d.classList.add('open'); $('#scrim').style.display = 'block';
  };
  A.closeDrawer = function () { $('#drawer').classList.remove('open'); $('#scrim').style.display = 'none'; };
  $('#scrim').onclick = A.closeDrawer;
  $('#drawer').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; A.closeDrawer(); A.dialog(b.dataset.d); });

  /* ------------------------------------------------------------ modal */
  function openModal(title, body, foot, after) {
    $('#mtitle').textContent = title; $('#mbody').innerHTML = body; $('#mfoot').innerHTML = foot || ''; $('#modal').classList.add('open'); if (after) after($('#mbody')); $('#mbody').scrollTop = 0;
  }
  A.openModal = openModal; A.closeModal = function () { $('#modal').classList.remove('open'); };
  $('#mclose').onclick = A.closeModal; $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') A.closeModal(); });
  A.onLang = function () { if ($('#modal').classList.contains('open') && cur) A.dialog(cur.name, cur.arg); };
  let cur = null;
  A.dialog = function (name, arg) {
    cur = { name, arg }; const fn = D[name]; if (fn) fn(arg);
  };
  const S = () => FT.state.settings, nf = (v, d) => (isNaN(v) ? '—' : (+v).toFixed(d == null ? 0 : d));
  const money = v => v ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0';
  const wrapHead = () => { const m = FT.state.meta; return '<div class="phead" style="margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:8px"><b style="font-size:16px">' + esc(m.name) + '</b><div class="tip">' + [m.area, m.client && t('f_client') + ': ' + m.client, m.designer && t('f_designer') + ': ' + m.designer, m.company, m.date, 'v' + m.version].filter(Boolean).map(esc).join(' · ') + '</div></div>'; };
  const setPath = (obj, path, val) => { const p = path.split('.'); let o = obj; for (let i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = val; };
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function inp(label, path, kind, extra) {
    extra = extra || {}; const v = getPath(path.startsWith('meta.') ? FT.state : FT.state, path), base = ' data-p="' + path + '" data-ty="' + (kind || 'text') + '"';
    let h; if (kind === 'select') h = '<select' + base + '>' + extra.options.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>'; else if (kind === 'check') h = '<input type="checkbox"' + base + (v ? ' checked' : '') + '>'; else if (kind === 'area') h = '<textarea' + base + '>' + esc(v) + '</textarea>'; else h = '<input lang="en" type="' + (kind === 'date' ? 'date' : 'text') + '"' + (kind === 'num' ? ' inputmode="decimal" dir="ltr"' : '') + base + ' value="' + esc(v == null ? '' : v) + '"' + (extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + '>';
    return '<div class="row"><label>' + esc(label) + '</label><div class="v">' + h + '</div></div>';
  }
  function bindForm(root) {
    root.addEventListener('change', e => { const el = e.target, p = el.dataset.p; if (!p) return; let v = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.ty === 'num') v = A.numVal(v); if (p === 'settings.txOverride' && v === '') v = null; setPath(FT.state, p, v); A.commit(); A.renderHeader(); });
  }

  /* ------------------------------------------------------------ dialogs */
  const D = {};
  D.project = function () {
    openModal(t('m_project'), '<div class="grid2">' + [['name', 'f_pname', 'text'], ['area', 'f_area', 'text'], ['client', 'f_client', 'text'], ['designer', 'f_designer', 'text'], ['company', 'f_company', 'text'], ['date', 'f_date', 'date'], ['version', 'f_version', 'text']].map(x => inp(t(x[1]), 'meta.' + x[0], x[2])).join('') + '</div>' + inp(t('f_notes'), 'meta.notes', 'area'), '', bindForm);
  };
  D.display = function () { A.closeModal(); const ui = A.ui; if (!ui.panel) $('#btnPanel').click(); A.select([]); };
  D.dashboard = function () {
    const st = FT.stats(), D_ = FT.derive(), items = FT.bom(), total = items.reduce((s, i) => s + i.total, 0), P = FT.profile();
    const fdhs = FT.state.nodes.filter(n => n.type === 'fdh'), fats = FT.state.nodes.filter(n => n.type === 'fat'), co = FT.state.nodes.filter(n => n.type === 'co');
    const card = (n, l, c) => '<div class="card"><div class="n"' + (c ? ' style="color:' + c + '"' : '') + '>' + n + '</div><div class="l">' + esc(l) + '</div></div>';
    let h = wrapHead() + '<div class="cards">' + card(st.homes, t('db_homes')) + card(st.assigned, t('db_assigned'), 'var(--ok)') + card(st.connected, t('db_connected')) + card(fdhs.length, t('db_fdh')) + card(fats.length, t('db_fat')) + card((st.totalCable / 1000).toFixed(2) + ' km', t('db_cable')) + card(nf(st.avg, 1) + ' dB', t('db_avg')) + card(st.worst ? nf(st.worst.loss, 1) + ' dB' : '—', t('db_worst'), 'var(--warn)') + card(st.ok, t('lg_ok'), 'var(--ok)') + card(st.warn, t('lg_warn'), 'var(--warn)') + card(st.fail, t('lg_fail'), 'var(--bad)') + card('$' + money(total), t('db_cost') + ' *') + '</div>';
    h += '<h3 class="mh">' + t('db_by_fdh') + '</h3><table class="t"><tr><th>' + t('nt_fdh') + '</th><th>' + t('f_zone_color') + '</th><th>FATs</th><th>' + t('db_homes') + '</th><th>' + t('d_splitters') + '</th><th>' + t('d_util') + '</th></tr>' + fdhs.map(f => { const fa = fats.filter(x => FT.zoneColor(x) === (f.color || '') && true); const homes = FT.state.buildings.filter(b => { const n = b.fat && FT.node(b.fat); return n && FT.zoneColor(n) === (f.color || FT.ZONE_COLORS[0]) && (function () { let c = n, g = 0; while (c && g++ < 20) { if (c.id === f.id) return true; const pc = D_.parent[c.id]; c = pc && pc.a ? FT.node(pc.a.id) : null; } return false; })(); }).length; const need = D_.splittersNeeded[f.id] || 0, cap = +f.props.slots || 0; return '<tr><td>' + esc(f.name) + '</td><td><span class="sw" style="background:' + (f.color || '#3b9cff') + '"></span></td><td class="n">' + D_.children[f.id].length + '</td><td class="n">' + homes + '</td><td class="n">' + need + ' / ' + cap + '</td><td style="min-width:90px"><div class="bar"><i style="width:' + (cap ? Math.min(100, need / cap * 100) : 0) + '%"></i></div></td></tr>'; }).join('') + '</table>';
    h += '<h3 class="mh">' + t('db_cables') + '</h3><table class="t"><tr><th>' + t('f_kind') + '</th><th>' + t('db_count') + '</th><th>' + t('d_total') + '</th></tr>' + ['feeder', 'distribution', 'drop'].map(k => '<tr><td>' + t('ck_' + k) + '</td><td class="n">' + (st.cableN[k] || 0) + '</td><td class="n">' + nf(st.cableM[k] || 0) + ' m</td></tr>').join('') + '</table>';
    h += '<div class="tip">* ' + t('prices_note') + '<br>' + t('db_pon') + ': ' + esc(P.name) + ' — Tx ' + P.txMin + ' dBm, Rx sens ' + P.rxSens + ' dBm</div>';
    openModal(t('m_dashboard'), h, '<button class="btn" onclick="window.print()">' + t('print') + '</button>');
  };
  D.checks = function () {
    const ch = FT.checks(), c = { error: 0, warn: 0, info: 0 }; ch.forEach(x => c[x.sev]++);
    let h = '<div class="cards"><div class="card"><div class="n" style="color:var(--bad)">' + c.error + '</div><div class="l">' + t('sev_error') + '</div></div><div class="card"><div class="n" style="color:var(--warn)">' + c.warn + '</div><div class="l">' + t('sev_warn') + '</div></div><div class="card"><div class="n" style="color:var(--ac2)">' + c.info + '</div><div class="l">' + t('sev_info') + '</div></div></div>';
    if (!ch.length) h += '<div class="empty">✓ ' + t('chk_all_ok') + '</div>';
    const order = { error: 0, warn: 1, info: 2 }; h += ch.slice().sort((a, b) => order[a.sev] - order[b.sev]).slice(0, 300).map((x, i) => '<div class="issue sev-' + x.sev + '" data-i="' + ch.indexOf(x) + '"><i></i><div>' + esc(t.apply(null, [x.key].concat(x.args))) + '</div></div>').join('');
    openModal(t('m_checks'), h, '', root => root.addEventListener('click', e => { const d = e.target.closest('.issue'); if (!d) return; const x = ch[+d.dataset.i]; if (x.target) { A.closeModal(); A.selectAndShow(x.target.t, x.target.id); } }));
  };

  /* ---------- settings (tabs) */
  D.settings = function (tab) {
    tab = tab || 'general'; const tabs = ['general', 'optical', 'fibre', 'naming', 'prices', 'geo'];
    let b = '';
    if (tab === 'general') b = '<div class="grid2">' + inp(t('s_scale'), 'settings.scale', 'num', { step: '0.0001' }) + inp(t('s_slack'), 'settings.slack', 'num') + inp(t('s_maxdrop'), 'settings.maxDrop', 'num') + inp(t('s_snap'), 'settings.snapStreet', 'check') + '</div><div class="tip">' + t('s_scale_tip') + '</div><h3 class="mh">' + t('s_loops') + '</h3><div class="grid2">' + Object.keys(S().loops).map(k => inp(t(k === 'b' ? 'f_house' : 'nt_' + k), 'settings.loops.' + k, 'num')).join('') + '</div>';
    if (tab === 'optical') b = '<div class="grid2">' + inp(t('pon_profile'), 'settings.ponProfile', 'select', { options: Object.keys(FT.PON).map(k => [k, FT.PON[k].name]) }) + inp(t('s_tx'), 'settings.txOverride', 'num', { ph: FT.profile().txMin }) + inp(t('s_att1310'), 'settings.att1310', 'num') + inp(t('s_att1490'), 'settings.att1490', 'num') + inp(t('s_att1550'), 'settings.att1550', 'num') + inp(t('s_conn'), 'settings.connLoss', 'num') + inp(t('s_splice'), 'settings.spliceLoss', 'num') + inp(t('s_margin'), 'settings.margin', 'num') + inp(t('s_ontconn'), 'settings.ontConn', 'num') + '</div><h3 class="mh">' + t('s_split_table') + '</h3><div class="grid2">' + Object.keys(S().splitterLoss).filter(k => k !== 'none').map(k => inp(k + ' (dB)', 'settings.splitterLoss.' + k.replace(':', '\u0001'), 'num')).join('') + '</div><div class="tip">' + t('s_optical_tip') + '</div>';
    if (tab === 'fibre') b = '<div class="grid2">' + inp(t('s_colorstd'), 'settings.colorStd', 'select', { options: [['TIA598', 'TIA-598 / IEC 60304'], ['DIN', 'DIN VDE 0888']] }) + inp(t('s_tubesize'), 'settings.tubeSize', 'select', { options: [[4, '4'], [6, '6'], [8, '8'], [12, '12']] }) + '</div><div class="tip">' + t('s_fibre_tip') + '</div>';
    if (tab === 'naming') b = '<div class="grid2">' + Object.keys(S().prefixes).map(k => inp(t('pf_' + k), 'settings.prefixes.' + k, 'text')).join('') + '</div>';
    if (tab === 'prices') b = '<div class="tip">' + t('prices_note') + '</div><div class="grid2">' + Object.keys(S().prices).map(k => inp(priceLabel(k), 'settings.prices.' + k.replace(/:/g, '\u0001'), 'num')).join('') + '</div>';
    if (tab === 'geo') b = '<div class="tip">' + t('geo_tip') + '</div><div class="grid2">' + inp(t('geo_lat'), 'settings.geo.lat', 'text', { ph: '34.55' }) + inp(t('geo_lon'), 'settings.geo.lon', 'text', { ph: '38.27' }) + inp(t('geo_rot'), 'settings.geo.rot', 'num') + '</div>';
    openModal(t('m_settings'), '<div class="tabs" style="margin:-14px -16px 12px">' + tabs.map(x => '<button data-tab="' + x + '" class="' + (x === tab ? 'on' : '') + '">' + t('s_tab_' + x) + '</button>').join('') + '</div>' + b, '<button class="btn" id="btnResetSet">' + t('s_reset') + '</button>', root => {
      root.addEventListener('change', e => { const el = e.target, p = el.dataset.p; if (!p) return; let v = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.ty === 'num') v = A.numVal(v); if (p === 'settings.txOverride' && v === '') v = null; if (p === 'settings.tubeSize') v = +v; setPathKeys(p, v); A.commit(); });
      root.querySelectorAll('.tabs button').forEach(bt => bt.onclick = () => D.settings(bt.dataset.tab));
      $('#btnResetSet').onclick = () => { if (confirm(t('s_reset_q'))) { FT.state.settings = FT.defaultSettings(); A.commit(); D.settings(tab); } };
    });
  };
  function priceLabel(k) { const [a, b] = k.split(/:(.+)/); if (a === 'cable') return t('pr_cable') + ' — ' + A.tl(FT.CABLE_TYPES[b]) + ' ($/m)'; if (a === 'node') return t('nt_' + b) + ' ($)'; if (a === 'split') return t('pr_split') + ' ' + b + ' ($)'; return t('pr_' + k) + (k === 'trench' || k === 'install' ? ' ($/m)' : ' ($)'); }
  function setPathKeys(p, v) { const parts = p.split('.').map(x => x.replace(/\u0001/g, ':')); let o = FT.state; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = v; }

  /* ---------- reference: colours, connectors, losses */
  D.colors = function () {
    const chips = code => code.map((c, i) => '<span class="codechip"><i style="background:' + c.hex + '">' + (i + 1) + '</i>' + esc(A.tl(c)) + '</span>').join('');
    let h = '<h3 class="mh">' + t('cr_tia') + '</h3>' + chips(FT.COLOR_CODES.TIA598) + '<h3 class="mh">' + t('cr_din') + '</h3>' + chips(FT.COLOR_CODES.DIN) + '<div class="tip">' + t('cr_tube') + '</div>';
    h += '<h3 class="mh">' + t('cr_example') + '</h3><table class="t"><tr><th>' + t('fibre') + ' #</th><th>' + t('tube') + '</th><th>' + t('tube') + ' ' + t('cr_colour') + '</th><th>' + t('fibre') + ' ' + t('cr_colour') + '</th></tr>' + [1, 2, 12, 13, 24, 25, 48, 49, 72, 144].map(i => { const f = FT.fibreInfo(i); return '<tr><td class="n">' + i + '</td><td class="n">' + f.tube + ' / ' + f.fibreInTube + '</td><td><span class="sw" style="background:' + f.tubeCol.hex + '"></span>' + esc(A.tl(f.tubeCol)) + (f.ring ? ' ★' : '') + '</td><td><span class="sw" style="background:' + f.fibre.hex + '"></span>' + esc(A.tl(f.fibre)) + '</td></tr>'; }).join('') + '</table><div class="tip">' + t('cr_ring') + '</div>';
    h += '<h3 class="mh">' + t('cr_conn') + '</h3>' + FT.CONNECTORS.map(c => '<div class="row"><span class="sw" style="background:' + c.hex + '"></span>' + esc(A.tl(c)) + '</div>').join('') + '<div class="tip">' + t('cr_jacket') + '</div>';
    h += '<h3 class="mh">' + t('cr_loss') + '</h3><table class="t"><tr><th>' + t('cr_item') + '</th><th>' + t('cr_value') + '</th></tr>' + [['G.652.D @1310 nm', '≤ 0.35 dB/km'], ['G.652.D @1490 nm', '≤ 0.30 dB/km'], ['G.652.D @1550 nm', '≤ 0.25 dB/km'], [t('cr_fusion'), '≤ 0.1 dB (typ. 0.05)'], [t('cr_mech'), '≤ 0.3 dB'], [t('cr_apc'), '≤ 0.3 dB (SC/APC)'], ['1:2 / 1:4 / 1:8', '3.8 / 7.3 / 10.7 dB'], ['1:16 / 1:32 / 1:64', '14.0 / 17.4 / 21.0 dB']].map(r => '<tr><td>' + esc(r[0]) + '</td><td class="n">' + esc(r[1]) + '</td></tr>').join('') + '</table>';
    h += '<h3 class="mh">' + t('cr_pon') + '</h3><table class="t"><tr><th>' + t('pon_profile') + '</th><th>Tx min</th><th>Rx sens.</th><th>' + t('cr_overload') + '</th><th>λ ↓/↑ (nm)</th></tr>' + Object.values(FT.PON).map(p => '<tr><td>' + esc(p.name) + '</td><td class="n">' + p.txMin + ' dBm</td><td class="n">' + p.rxSens + ' dBm</td><td class="n">' + p.ovl + ' dBm</td><td class="n">' + p.down + ' / ' + p.up + '</td></tr>').join('') + '</table><div class="tip">' + t('s_optical_tip') + '</div>';
    openModal(t('m_colors'), h);
  };
  D.library = function () {
    const D_ = FT.state; let h = '<h3 class="mh">' + t('lib_cables') + '</h3><table class="t"><tr><th>' + t('f_ctype') + '</th><th>' + t('cr_fibretype') + '</th><th>OD (mm)</th><th>' + t('f_install') + '</th></tr>' + Object.keys(FT.CABLE_TYPES).map(k => { const c = FT.CABLE_TYPES[k]; return '<tr><td>' + esc(A.tl(c)) + '</td><td class="n">' + c.fibreType + '</td><td class="n">' + c.od + '</td><td>' + esc(A.tl(FT.INSTALL_LABEL[c.install])) + '</td></tr>'; }).join('') + '</table><div class="tip">' + t('lib_counts') + ': ' + FT.FIBRE_COUNTS.join(' / ') + '</div>';
    h += '<h3 class="mh">' + t('lib_nodes') + '</h3><table class="t"><tr><th>' + t('f_type') + '</th><th>' + t('f_conn') + '</th><th>' + t('f_splice') + '</th><th>' + t('f_split') + '</th></tr>' + Object.keys(FT.NODE_TYPES).map(k => { const p = FT.NODE_TYPES[k].props; return '<tr><td><span class="sw" style="background:' + FT.NODE_TYPES[k].color + '"></span>' + t('nt_' + k) + '</td><td class="n">' + p.conn + '</td><td class="n">' + p.splice + '</td><td class="n">' + (p.split === 'none' ? '—' : p.split) + '</td></tr>'; }).join('') + '</table>';
    h += '<h3 class="mh">' + t('lib_arch') + '</h3><div class="tip">' + t('lib_arch_txt') + '</div>';
    openModal(t('m_library'), h);
  };
  D.help = function () {
    const rows = [['V', 'tool_select'], ['H / Space', 'tool_pan'], ['1…7', 'sc_nodes'], ['Q', 'tool_cable_feeder'], ['E', 'tool_cable_distribution'], ['R', 'tool_drop'], ['B', 'tool_addb'], ['M', 'tool_measure'], ['Shift + drag', 'sc_box'], ['Del', 'delete'], ['Esc', 'sc_esc'], ['Ctrl+Z / Ctrl+Y', 'sc_undo'], ['Ctrl+S', 'sc_save'], ['F', 'fit'], ['/', 'sc_search'], ['+ / −', 'sc_zoom'], ['Alt', 'sc_alt']];
    openModal(t('m_help'), '<h3 class="mh">' + t('help_how') + '</h3><div class="tip" style="font-size:13.5px">' + t('help_steps') + '</div><h3 class="mh">' + t('m_help') + '</h3><table class="t">' + rows.map(r => '<tr><td class="n" style="direction:ltr"><b>' + esc(r[0]) + '</b></td><td>' + esc(t(r[1])) + '</td></tr>').join('') + '</table>');
  };
  D.about = function () { openModal(t('m_about'), '<div class="tip" style="font-size:13.5px">' + t('about_txt') + '</div>'); };

  /* ---------- reports */
  const REPORTS = ['bom', 'cables', 'nodes', 'homes', 'budget', 'fibres', 'ports'];
  D.reports = function (which) {
    which = which && REPORTS.includes(which) ? which : 'bom'; const R = reportBuild(which);
    openModal(t('m_reports'), '<div class="tabs" style="margin:-14px -16px 12px">' + REPORTS.map(x => '<button data-r="' + x + '" class="' + (x === which ? 'on' : '') + '">' + t('rp_' + x) + '</button>').join('') + '</div>' + wrapHead() + '<div id="rpBody">' + R.html + '</div>', '<button class="btn" id="rpCsv">CSV</button><button class="btn pri" onclick="window.print()">' + t('print') + ' / PDF</button>', root => {
      root.querySelectorAll('.tabs button').forEach(b => b.onclick = () => D.reports(b.dataset.r));
      $('#rpCsv').onclick = () => download('ftth_' + which + '.csv', FT.csv(R.csv), 'text/csv;charset=utf-8');
    });
  };
  const th = a => '<tr>' + a.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr>';
  function reportBuild(w) {
    const st = FT.state, Dv = FT.derive(), S_ = st.settings; let html = '', csv = [];
    if (w === 'bom') {
      const items = FT.bom(); let total = 0; const head = [t('rp_item'), t('rp_spec'), t('rp_qty'), t('rp_unit'), t('rp_uprice'), t('rp_total')]; csv.push(head);
      html = '<table class="t">' + th(head) + items.map(i => { const nm = i.cat === 'cable' ? t('ck_' + i.g.kind) + ' — ' + A.tl(FT.CABLE_TYPES[i.g.type]) : i.cat === 'node' ? t('nt_' + i.type) : i.cat === 'split' ? t('pr_split') + ' ' + i.ratio : t('pr_' + i.k); const sp = i.cat === 'cable' ? i.g.fibres + ' F × ' + i.g.n : ''; total += i.total; csv.push([nm, sp, i.qty, i.unit, i.price.toFixed(2), i.total.toFixed(2)]); return '<tr><td>' + esc(nm) + '</td><td class="n">' + esc(sp) + '</td><td class="n">' + i.qty + '</td><td>' + i.unit + '</td><td class="n">' + i.price.toFixed(2) + '</td><td class="n">' + money(i.total) + '</td></tr>'; }).join('') + '<tr><td colspan="5"><b>' + t('rp_grand') + '</b></td><td class="n"><b>$' + money(total) + '</b></td></tr></table><div class="tip">* ' + t('prices_note') + '</div>'; csv.push(['', '', '', '', t('rp_grand'), total.toFixed(2)]);
    }
    if (w === 'cables') {
      const head = ['ID', t('f_kind'), t('f_ctype'), t('f_fibres'), t('d_from'), t('d_to'), t('f_install'), t('f_status'), t('d_geo') + ' (m)', t('d_slack') + ' (m)', t('d_loops') + ' (m)', t('d_total') + ' (m)', t('d_fibre_use')]; csv.push(head); let rows = '';
      st.cables.filter(c => c.kind !== 'drop').concat(st.cables.filter(c => c.kind === 'drop')).forEach(c => { const l = Dv.len[c.id], a = c.a.t === 'n' ? (FT.node(c.a.id) || {}).name : '#' + c.a.id, b = c.b.t === 'n' ? (FT.node(c.b.id) || {}).name : '#' + c.b.id, r = [c.name, t('ck_' + c.kind), A.tl(FT.CABLE_TYPES[c.cableType]), c.fibres, a, b, A.tl(FT.INSTALL_LABEL[c.install]), t('st_' + c.status), l.geo.toFixed(1), l.slack.toFixed(1), l.loops.toFixed(0), l.total.toFixed(1), (Dv.cableUsed[c.id] || 0) + '/' + c.fibres]; csv.push(r); rows += '<tr><td><span class="sw" style="background:' + esc(c.color) + '"></span>' + esc(r[0]) + '</td>' + r.slice(1).map((v, i) => '<td' + (i >= 7 ? ' class="n"' : '') + '>' + esc(v) + '</td>').join('') + '</tr>'; });
      html = '<table class="t">' + th(head) + rows + '</table>';
    }
    if (w === 'nodes') {
      const head = ['ID', t('f_type'), t('f_status'), 'X (m)', 'Y (m)', t('f_equipment'), t('f_split'), t('d_util'), t('d_feed')]; csv.push(head); let rows = '';
      st.nodes.forEach(n => { const util = n.type === 'fat' ? Dv.portsUsed[n.id] + '/' + n.props.ports : n.type === 'fdh' ? (Dv.splittersNeeded[n.id] || 0) + '/' + n.props.slots + ' spl' : n.type === 'co' ? D_pon(n) + '/' + n.props.ponPorts + ' PON' : '', pc = Dv.parent[n.id], r = [n.name, t('nt_' + n.type), t('st_' + n.status), (n.x * S_.scale).toFixed(1), (n.y * S_.scale).toFixed(1), n.props.olt || '', n.props.split && n.props.split !== 'none' ? n.props.split : '', util, pc ? pc.name : '']; csv.push(r); rows += '<tr>' + r.map((v, i) => '<td' + (i === 3 || i === 4 ? ' class="n"' : '') + '>' + esc(v) + '</td>').join('') + '</tr>'; });
      html = '<table class="t">' + th(head) + rows + '</table>';
    }
    if (w === 'homes') {
      const head = [t('f_house'), t('f_owner'), t('f_units'), t('f_status'), t('f_fat'), t('f_port'), t('b_len') + ' (m)', t('b_total') + ' (dB)', t('b_rx') + ' (dBm)', t('b_margin') + ' (dB)', t('budget')]; csv.push(head); let rows = '';
      st.buildings.forEach(b => { const bu = Dv.budget[b.id], f = b.fat && FT.node(b.fat), r = [b.id, b.name || '', b.units, t('bst_' + b.status), f ? f.name : '—', b.port || '', bu ? bu.lenM.toFixed(0) : '', bu ? bu.loss.toFixed(2) : '', bu ? bu.rx.toFixed(1) : '', bu ? bu.margin.toFixed(1) : '', bu ? t('bs_' + bu.status) : '—']; csv.push(r); rows += '<tr><td class="n">' + r[0] + '</td>' + r.slice(1).map((v, i) => '<td' + (i >= 4 ? ' class="n"' : '') + '>' + esc(v) + '</td>').join('') + '</tr>'; });
      html = '<table class="t">' + th(head) + rows + '</table>';
    }
    if (w === 'budget') {
      const P = FT.profile(), sx = FT.stats(); html = '<div class="cards"><div class="card"><div class="n">' + esc(S_.ponProfile) + '</div><div class="l">' + t('pon_profile') + '</div></div><div class="card"><div class="n">' + (S_.txOverride != null && S_.txOverride !== '' ? S_.txOverride : P.txMin) + ' dBm</div><div class="l">' + t('b_tx') + '</div></div><div class="card"><div class="n">' + P.rxSens + ' dBm</div><div class="l">' + t('cr_sens') + '</div></div><div class="card"><div class="n">' + (P.txMin - P.rxSens) + ' dB</div><div class="l">' + t('cr_budget') + '</div></div><div class="card"><div class="n">' + S_.margin + ' dB</div><div class="l">' + t('s_margin') + '</div></div></div>';
      html += '<h3 class="mh">' + t('rp_assump') + '</h3><div class="tip">1490 nm: ' + S_.att1490 + ' dB/km · 1310 nm: ' + S_.att1310 + ' dB/km · ' + t('s_conn') + ': ' + S_.connLoss + ' · ' + t('s_splice') + ': ' + S_.spliceLoss + ' · ' + Object.keys(S_.splitterLoss).filter(k => k !== 'none').map(k => k + '=' + S_.splitterLoss[k]).join(' · ') + '</div>';
      const arr = st.buildings.map(b => ({ b, bu: Dv.budget[b.id] })).filter(x => x.bu).sort((a, b) => b.bu.loss - a.bu.loss), head = [t('rank'), t('f_house'), t('f_fat'), t('b_len') + ' (m)', t('b_fibre'), t('b_conn'), t('b_splice'), t('b_split'), t('b_total') + ' (dB)', 'Rx (dBm)', t('b_margin'), t('budget')]; csv.push(head);
      html += '<h3 class="mh">' + t('rp_worst') + '</h3><table class="t">' + th(head) + arr.map((x, i) => { const bu = x.bu, f = FT.node(x.b.fat), r = [i + 1, x.b.id, f ? f.name : '', bu.lenM.toFixed(0), bu.fibre.toFixed(2), bu.connLoss.toFixed(2), bu.spliceLossT.toFixed(2), bu.splitLoss.toFixed(1), bu.loss.toFixed(2), bu.rx.toFixed(1), bu.margin.toFixed(1), t('bs_' + bu.status)]; csv.push(r); return '<tr>' + r.map(v => '<td class="n">' + esc(v) + '</td>').join('') + '</tr>'; }).join('') + '</table>';
    }
    if (w === 'fibres') {
      const head = [t('f_name'), '#', t('tube'), t('fibre'), t('f_status'), t('f_label')]; csv.push(head);
      st.cables.filter(c => c.kind !== 'drop').forEach(c => { const used = Dv.cableUsed[c.id] || 0, ov = c.fibOv || {}; let rows = ''; for (let i = 1; i <= c.fibres; i++) { const f = FT.fibreInfo(i), o = ov[i] || {}, s = o.status || (i <= used ? 'used' : 'spare'), lab = o.label != null ? o.label : A.fibreLabel(c, i, used); csv.push([c.name, i, f.tube, A.tl(f.fibre), t('fs_' + s), lab]); rows += '<tr><td class="n">' + i + '</td><td><span class="sw" style="background:' + f.tubeCol.hex + '"></span>' + f.tube + '</td><td><span class="sw" style="background:' + f.fibre.hex + '"></span>' + esc(A.tl(f.fibre)) + '</td><td>' + t('fs_' + s) + '</td><td>' + esc(lab) + '</td></tr>'; } html += '<h3 class="mh"><span class="sw" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + ' — ' + c.fibres + ' F (' + used + ' ' + t('fs_used') + ')</h3><table class="t">' + th(['#', t('tube'), t('fibre'), t('f_status'), t('f_label')]) + rows + '</table>'; });
    }
    if (w === 'fibres') {
      const rows = []; st.nodes.forEach(n => (n.splices || []).forEach(r => { const ca = FT.cable(r.a), cb = FT.cable(r.b); rows.push([n.name, ca ? ca.name : '', r.fa, cb ? cb.name : '', r.fb, r.loss]); }));
      if (rows.length) { const head = [t('f_name'), t('rp_cable') + ' A', '#', t('rp_cable') + ' B', '#', 'dB']; csv.push([]); csv.push([t('splice_records')]); csv.push(head); rows.forEach(r => csv.push(r)); html += '<h3 class="mh">' + t('splice_records') + '</h3><table class="t">' + th(head) + rows.map(r => '<tr>' + r.map(v => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</table>'; }
    }
    if (w === 'ports') {
      const head = [t('f_name'), t('f_type'), t('f_port'), t('f_house'), t('f_status'), 'Rx (dBm)']; csv.push(head);
      st.nodes.filter(n => n.type === 'fat').forEach(n => { const hs = st.buildings.filter(b => b.fat === n.id).sort((a, b) => (+a.port || 99) - (+b.port || 99)), cap = +n.props.ports || 0; let rows = ''; for (let p = 1; p <= Math.max(cap, 0); p++) { const b = hs.find(x => +x.port === p), bu = b && Dv.budget[b.id]; csv.push([n.name, 'FAT', p, b ? b.id : '', b ? t('bst_' + b.status) : t('fs_spare'), bu ? bu.rx.toFixed(1) : '']); rows += '<tr><td class="n">' + p + '</td><td>' + (b ? '#' + b.id + (b.name ? ' ' + esc(b.name) : '') : '<span style="color:var(--tx3)">' + t('fs_spare') + '</span>') + '</td><td>' + (b ? t('bst_' + b.status) : '') + '</td><td class="n">' + (bu ? bu.rx.toFixed(1) : '') + '</td></tr>'; } html += '<h3 class="mh">' + esc(n.name) + ' — ' + (Dv.portsUsed[n.id]) + '/' + cap + ' (' + (n.props.split || 'none') + ')</h3><table class="t">' + th([t('f_port'), t('f_house'), t('f_status'), 'Rx (dBm)']) + rows + '</table>'; });
      st.nodes.filter(n => n.type === 'fdh').forEach(n => { const need = Dv.splittersNeeded[n.id] || 0, N = FT.splitN(n.props.split); let rows = '', k = 0; Dv.children[n.id].forEach(c => { k++; rows += '<tr><td>' + esc(c.name) + '</td><td class="n">SPL-' + (Math.floor((k - 1) / N) + 1) + ' / out ' + (((k - 1) % N) + 1) + '</td><td>' + esc(c.b.t === 'n' ? (FT.node(c.b.id) || {}).name : '') + '</td></tr>'; csv.push([n.name, 'FDH', 'SPL-' + (Math.floor((k - 1) / N) + 1) + '/' + (((k - 1) % N) + 1), c.name, '', '']); }); html += '<h3 class="mh">' + esc(n.name) + ' — ' + need + ' ' + t('d_splitters') + ' (' + (n.props.split || 'none') + ')</h3><table class="t">' + th([t('rp_cable'), t('rp_splitter_out'), t('d_to')]) + rows + '</table>'; });
    }
    return { html, csv };
  }
  function D_pon(n) { let need = 0; FT.derive().children[n.id].forEach(c => need += FT.derive().cableUsed[c.id] || 0); return need; }

  /* ---------- import / export */
  function download(name, text, mime) { const b = new Blob([text], { type: mime || 'application/octet-stream' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  A.exportJSON = function () { download('ftth_' + (FT.state.meta.name || 'project').replace(/[^\w؀-ۿ-]+/g, '_') + '.json', JSON.stringify(FT.state, null, 1), 'application/json'); A.toast(t('exported')); };
  function exportGeo() {
    const st = FT.state, feats = []; if (FT.toLatLon(0, 0) == null) { alert(t('geo_need')); return; }
    st.nodes.forEach(n => feats.push({ type: 'Feature', properties: { name: n.name, type: n.type }, geometry: { type: 'Point', coordinates: FT.toLatLon(n.x, n.y) } }));
    st.cables.forEach(c => { const p = FT.cablePts(c); if (p) feats.push({ type: 'Feature', properties: { name: c.name, kind: c.kind, fibres: c.fibres, length_m: +FT.derive().len[c.id].total.toFixed(1) }, geometry: { type: 'LineString', coordinates: p.map(q => FT.toLatLon(q[0], q[1])) } }); });
    st.buildings.forEach(b => feats.push({ type: 'Feature', properties: { house: b.id, status: b.status }, geometry: { type: 'Polygon', coordinates: [[[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2], [b.x1, b.y1]].map(q => FT.toLatLon(q[0], q[1]))] } }));
    download('ftth_network.geojson', JSON.stringify({ type: 'FeatureCollection', features: feats }), 'application/geo+json');
  }
  async function exportPNG() {
    const svg = $('#map'), B = FT.BOUNDS, W = Math.round((B.x1 - B.x0) * 2.2), H = Math.round((B.y1 - B.y0) * 2.2), k = W / (B.x1 - B.x0), view0 = A.getView(), keep = { k: view0.k, tx: view0.tx, ty: view0.ty };
    view0.k = k; view0.tx = -B.x0 * k; view0.ty = -B.y0 * k; A.render(); let s = new XMLSerializer().serializeToString(svg); view0.k = keep.k; view0.tx = keep.tx; view0.ty = keep.ty; A.render();
    if (A.ui.img) { const blob = await (await fetch(window.SURVEY.image.src)).blob(), data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); s = s.replace(window.SURVEY.image.src, data); }
    s = s.replace('<svg ', '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" '); const img = new Image(); img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.fillStyle = '#0f1620'; cx.fillRect(0, 0, W, H); cx.drawImage(img, 0, 0); cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ftth_map.png'; a.click(); }); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }
  D.io = function () {
    const h = '<h3 class="mh">' + t('io_project') + '</h3><div class="btns"><button class="btn pri" id="ioSave">' + t('io_save') + '</button><button class="btn" id="ioLoad">' + t('io_load') + '</button><input type="file" id="ioFile" accept=".json,application/json" hidden></div><div class="tip">' + t('io_tip') + '</div>' +
      '<h3 class="mh">' + t('io_export') + '</h3><div class="btns"><button class="btn" id="ioPng">' + t('io_png') + '</button><button class="btn" id="ioGeo">GeoJSON</button><button class="btn" id="ioRep">' + t('m_reports') + ' (CSV / PDF)</button></div>' +
      '<h3 class="mh">' + t('io_reset') + '</h3><div class="btns"><button class="btn danger" id="ioDemo">' + t('io_demo') + '</button><button class="btn danger" id="ioBlank">' + t('io_blank') + '</button></div>';
    openModal(t('m_io'), h, '', () => {
      $('#ioSave').onclick = A.exportJSON; $('#ioLoad').onclick = () => $('#ioFile').click(); $('#ioPng').onclick = exportPNG; $('#ioGeo').onclick = exportGeo; $('#ioRep').onclick = () => A.dialog('reports');
      $('#ioFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o.nodes || !o.buildings) throw 0; A.replaceProject(o); A.closeModal(); A.toast(t('imported')); } catch (x) { alert(t('import_bad')); } }; r.readAsText(f); };
      $('#ioDemo').onclick = () => { if (confirm(t('confirm_demo'))) { A.resetDemo(); A.closeModal(); } }; $('#ioBlank').onclick = () => { if (confirm(t('confirm_blank'))) { A.blank(); A.closeModal(); } };
    });
  };
  A.onFirstRun = function () { setTimeout(() => A.toast(t('welcome')), 600); };
})();
