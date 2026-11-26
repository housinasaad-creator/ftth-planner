/* Team work: several people on the same project at the same time.
   Every drawn element is one row on the server. This file only sends what this user changed and applies what the others changed,
   so nobody can overwrite another person's work with an old copy. It also shows who is online and where they are working. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const Y = FT.sync = { active: false, peers: [], rev: 0, mode: 'edit', online: true, POLL: 1500, HIDDEN_POLL: 6000, BATCH: 1500 };
  const SEP = '\u0001';
  const OBJ = ['nodes', 'pipes', 'cables', 'splices', 'bld', 'subs', 'wdev', 'wlinks', 'imports', 'folders', 'users'];
  const FOLD = { nodes: 'n:', pipes: 'p:', cables: 'c:', splices: 's:' }; // the tree folder travels with its element
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  let cur = null, shadow = new Map(), queue = new Map(), mine = new Set(), gen = 0;
  let pullT = 0, pushT = 0, scanT = 0, safetyT = 0, pushing = false, pulling = false, scanning = false, scanAgain = false, fails = 0, qT = 0;
  const client = Math.random().toString(36).slice(2, 12);
  Y.client = client;

  // ---------------- state <-> items ----------------
  function payload(coll, id) {
    const S = FT.state;
    if (coll === 'ord') { const v = S.ord && S.ord[id]; return v ? JSON.stringify(v) : undefined; }
    if (coll === 'seq') return S.seq[id] ? JSON.stringify(S.seq[id]) : undefined;
    if (coll === 'meta') return JSON.stringify({ name: (S.meta && S.meta.name) || '', type: (S.meta && S.meta.type) || 'gpon' });
    const o = S[coll] && S[coll][id]; if (o === undefined) return undefined;
    return FOLD[coll] ? JSON.stringify({ o, f: (S.fmap && S.fmap[FOLD[coll] + id]) || null }) : JSON.stringify(o);
  }
  function allKeys() {
    const S = FT.state, out = [];
    OBJ.forEach(c => { for (const id in (S[c] || {})) out.push(c + SEP + id); });
    for (const id in (S.ord || {})) out.push('ord' + SEP + id);
    for (const id in S.seq) if (S.seq[id]) out.push('seq' + SEP + id);
    out.push('meta' + SEP + 'meta');
    return out;
  }
  const split = k => { const i = k.indexOf(SEP); return [k.slice(0, i), k.slice(i + 1)]; };
  function put(coll, id, data) { // write one remote item into the state
    const S = FT.state;
    if (coll === 'ord') { S.ord = S.ord || {}; if (data === null) delete S.ord[id]; else S.ord[id] = data; return; }
    if (coll === 'seq') { if (data !== null) S.seq[id] = Math.max(S.seq[id] || 0, data); return; }
    if (coll === 'meta') { if (data) { S.meta = S.meta || {}; S.meta.name = data.name || S.meta.name; S.meta.type = data.type || S.meta.type; } return; }
    const bag = S[coll] = S[coll] || {};
    if (FOLD[coll]) {
      const fk = FOLD[coll] + id; S.fmap = S.fmap || {};
      if (data === null) { delete bag[id]; delete S.fmap[fk]; } else { bag[id] = data.o; if (data.f) S.fmap[fk] = data.f; else delete S.fmap[fk]; }
    } else if (data === null) delete bag[id]; else bag[id] = data;
  }

  // ---------------- what did I change? ----------------
  function note(key) { // compare one item with what the server already knows; queue it if it differs
    const [c, id] = split(key), old = shadow.get(key);
    if (old === undefined && FOLD[c]) { const o = FT.state[c] && FT.state[c][id]; if (o && !o.by) o.by = Y.uid(); } // I created it
    const now = payload(c, id);
    if (now === old) return false;
    if (now === undefined) { shadow.delete(key); queue.set(key, null); mine.delete(id); } else { if (old === undefined && (c === 'nodes' || c === 'pipes')) mine.add(id); shadow.set(key, now); queue.set(key, now); }
    return true;
  }
  const candidates = () => { const set = new Set(allKeys()); shadow.forEach((v, k) => set.add(k)); return [...set]; };
  Y.scanNow = function () { if (!cur || Y.mode !== 'edit') return 0; let n = 0; candidates().forEach(k => { if (note(k)) n++; }); if (n) saveQueueSoon(); return n; };
  function scan() { // the same, in small slices so a big project never freezes the page
    if (!cur || Y.mode !== 'edit') return; if (scanning) { scanAgain = true; return; } scanning = true;
    const keys = candidates(), g = gen; let i = 0, n = 0;
    (function step() {
      if (g !== gen) { scanning = false; return; }
      const end = performance.now() + 10; while (i < keys.length && performance.now() < end) { for (let j = 0; j < 40 && i < keys.length; j++, i++) if (note(keys[i])) n++; }
      if (i < keys.length) return void setTimeout(step, 0);
      scanning = false; if (n) { saveQueueSoon(); pushSoon(0); }
      if (scanAgain) { scanAgain = false; scanSoon(50); }
    })();
  }
  const scanSoon = ms => { clearTimeout(scanT); scanT = setTimeout(scan, ms == null ? 250 : ms); };

  // ---------------- the unsent queue survives a reload or a lost connection ----------------
  const QK = () => 'ft2_q_' + cur.id;
  function saveQueue() { if (!cur) return; if (!queue.size) { try { localStorage.removeItem(QK()); } catch (e) { } return; } jset(QK(), [...queue]); }
  const saveQueueSoon = () => { clearTimeout(qT); qT = setTimeout(saveQueue, 200); };

  // ---------------- send ----------------
  const pushSoon = ms => { clearTimeout(pushT); pushT = setTimeout(push, ms || 0); };
  async function push() {
    if (!cur || Y.mode !== 'edit' || pushing || !queue.size) return; pushing = true; const g = gen, sent = []; let size = 0;
    for (const [k, v] of queue) { sent.push([k, v]); size += v ? v.length : 8; if (sent.length >= Y.BATCH || size > 3000000) break; }
    const ops = sent.map(([k, v]) => { const [c, i] = split(k); return { c, i, d: v === null ? null : JSON.parse(v) }; });
    try {
      await FT.store.rpc('ftth_push', { p_id: cur.id, p_key: cur.key, p_client: client, p_ops: ops });
      if (g !== gen) return;
      sent.forEach(([k, v]) => { if (queue.get(k) === v) queue.delete(k); }); fails = 0; setOnline(true); saveQueue(); pushing = false;
      if (queue.size) pushSoon(30); else if (FT.UI) FT.UI.saved(true);
    } catch (e) {
      if (g !== gen) return; pushing = false; fails++; setOnline(false); if (FT.UI) FT.UI.saved(false); pushSoon(Math.min(15000, 1000 * fails));
    }
  }

  // ---------------- receive ----------------
  function apply(changes, initial) {
    const done = [], fresh = []; let bld = false;
    for (const ch of changes) {
      if (!initial && ch.k === client) continue; // my own echo
      const key = ch.c + SEP + ch.i;
      if (!initial) { if (Y.mode === 'edit') note(key); if (queue.has(key)) continue; } // I changed it too and have not sent it yet: mine goes out after theirs
      const had = payload(ch.c, ch.i);
      put(ch.c, ch.i, ch.d === undefined ? null : ch.d);
      const now = payload(ch.c, ch.i); if (now === undefined) shadow.delete(key); else shadow.set(key, now);
      if (now !== had) { done.push(ch); if (ch.c === 'bld') bld = true; if (had === undefined && (ch.c === 'nodes' || ch.c === 'pipes')) fresh.push(ch); }
    }
    return { done, bld, fresh };
  }
  // two people added elements in the same second and got the same automatic number: one of the two (always the same one) renames itself
  function fixTwins(fresh) {
    if (!fresh.length || !mine.size) return; const S = FT.state;
    ['nodes', 'pipes'].forEach(coll => {
      const theirs = new Map(); fresh.filter(c => c.c === coll && S[coll][c.i]).forEach(c => theirs.set(S[coll][c.i].name, c.i)); if (!theirs.size) return;
      mine.forEach(id => {
        const o = S[coll][id]; if (!o) return; const other = theirs.get(o.name); if (other === undefined || other === id || id < other) return;
        if (coll === 'pipes' && /^Pipe #\d+$/.test(o.name)) { o.no = ++S.seq.pipe; o.name = 'Pipe #' + o.no; }
        else if (coll === 'nodes') { const m = /^([A-Za-z]+)-(\d+)$/.exec(o.name); if (m) { S.seq[o.type] = (S.seq[o.type] || 0) + 1; o.name = m[1] + '-' + S.seq[o.type]; } }
      });
    });
    scanSoon(0);
  }
  function refreshUI(res) {
    if (!res.done.length) return;
    const keys = []; res.done.forEach(c => { keys.push(c.c + '/' + c.i); if (FOLD[c.c]) keys.push('fmap/' + FOLD[c.c] + c.i); });
    FT.noteRemote(keys);
    const T = FT.T;
    if (T && T.sel) { const coll = { node: 'nodes', pipe: 'pipes', cable: 'cables', splice: 'splices' }[T.sel.kind]; if (coll && !FT.state[coll][T.sel.id]) T.select(null); }
    if (T && T.multi) ['nodes', 'pipes', 'cables'].forEach(c => T.multi[c] && T.multi[c].forEach(i => { if (!FT.state[c][i]) T.multi[c].delete(i); }));
    FT.changed(res.bld ? 'remote' : 'remote-net');
    if (T && T.sel && FT.map && res.done.some(c => c.i === T.sel.id)) FT.map.setSelection(T.sel.kind, T.sel.id);
    if (res.done.some(c => c.c === 'meta')) { const el = document.getElementById('projTitle'); if (el) el.textContent = FT.state.meta.name || ''; if (cur) cur.name = FT.state.meta.name; }
  }
  const request = (since, info) => FT.store.rpc('ftth_pull', { p_id: cur.id, p_key: cur.key, p_since: since, p_client: client, p_name: Y.name(), p_info: info || {}, p_limit: 3000 });
  const pullSoon = ms => { clearTimeout(pullT); pullT = setTimeout(pull, ms); };
  async function pull() {
    if (!cur || pulling) return; const g = gen; pulling = true; let wait = document.hidden ? Y.HIDDEN_POLL : Y.POLL;
    try {
      if (FT.T && FT.T.isDragging && FT.T.isDragging()) { pulling = false; return void pullSoon(300); }
      const r = await request(Y.rev, myInfo());
      if (g !== gen) return;
      if (r) {
        const res = apply(r.changes || [], false); Y.rev = Math.max(Y.rev, r.rev || 0); jset('ft2_rev_' + cur.id, Y.rev);
        fixTwins(res.fresh); refreshUI(res); Y.peers = r.peers || []; drawPeers();
        const sig = Y.peers.map(p => ((p.info || {}).u || p.client) + ':' + p.name).sort().join('|'); if (sig !== whoSig) { whoSig = sig; if (FT.UI) FT.UI.refreshTreeSoon(); } setOnline(true); if (r.more) wait = 30;
      }
    } catch (e) { if (g === gen) { setOnline(false); wait = 5000; } }
    if (g === gen) { pulling = false; pullSoon(wait); }
  }
  function setOnline(v) { if (Y.online !== v) { Y.online = v; drawPanel(); } }

  // ---------------- start / stop ----------------
  // returns 'team' (live sync running), 'legacy' (the database has no team functions yet) or 'offline' (live sync starts when the net returns)
  Y.start = async function (project, mode, opts) {
    Y.stop(); opts = opts || {}; cur = project; Y.mode = mode; gen++; const g = gen;
    shadow = new Map(); queue = new Map(); mine = new Set(); Y.peers = []; Y.rev = 0;
    let first;
    try { first = await request(0, {}); }
    catch (e) {
      if (/PGRST202|Could not find the function| 404 /.test(String(e.message))) { cur = null; return 'legacy'; }
      first = undefined;
    }
    if (g !== gen) return 'legacy';
    if (first === null) { cur = null; return 'legacy'; }
    if (first && !(first.changes || []).length && opts.beforeTeam) await opts.beforeTeam(); // not a team project yet: an unsent offline copy may still be saved the old way
    candidates().forEach(k => { const [c, i] = split(k), v = payload(c, i); if (v !== undefined) shadow.set(k, v); });
    let out = 'team';
    if (first) {
      let r = first;
      for (;;) { apply(r.changes || [], true); Y.rev = Math.max(Y.rev, r.rev || 0); if (!r.more) break; r = await request(Y.rev, {}); if (g !== gen) return 'legacy'; }
      Y.peers = first.peers || [];
    } else { Y.rev = jget('ft2_rev_' + cur.id, 0); out = 'offline'; Y.online = false; }
    if (mode === 'edit') jget(QK(), []).forEach(([k, v]) => { const [c, i] = split(k); put(c, i, v === null ? null : JSON.parse(v)); const now = payload(c, i); if (now === undefined) shadow.delete(k); else shadow.set(k, now); queue.set(k, v); });
    jset('ft2_rev_' + cur.id, Y.rev);
    Y.active = true; if (first) Y.online = true; whoSig = ''; Y.hiddenUsers = new Set(jget(HK(), []));
    FT.team = true; FT.clearHistory(); FT.dropPipeIndex(); FT.changed('remote');
    safetyT = setInterval(() => { scanSoon(0); if (queue.size && !pushing) pushSoon(0); }, 20000);
    registerMe(); pushSoon(100); pullSoon(Y.POLL); buildUI(); drawPanel(); drawPeers(); if (FT.UI) FT.UI.refreshTreeSoon();
    return out;
  };
  Y.stop = function () {
    if (cur && Y.active) { Y.scanNow(); saveQueue(); if (queue.size) push(); }
    gen++; clearTimeout(pullT); clearTimeout(pushT); clearTimeout(scanT); clearInterval(safetyT); clearTimeout(qT);
    pushing = pulling = scanning = scanAgain = false; cur = null; Y.active = false; FT.team = false; Y.peers = []; Y.hiddenUsers = new Set(); drawPeers(); drawPanel();
  };
  Y.flush = function () { if (!Y.active) return; Y.scanNow(); saveQueue(); pushSoon(0); };
  Y.pending = () => queue.size;
  FT.onChange(why => { if (Y.active && why !== 'load' && !/^remote/.test(why || '')) scanSoon(250); });

  // ---------------- who am I / who is here ----------------
  const NK = 'ft_name', UK = 'ft_uid';
  let myUid = null;
  Y.uid = () => { if (!myUid) { try { myUid = localStorage.getItem(UK); if (!myUid) { myUid = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem(UK, myUid); } } catch (e) { myUid = 'u' + client; } } return myUid; };
  Y.hiddenUsers = new Set(); // whose work I do not want on MY map (nobody else is affected)
  const HK = () => 'ft2_hu_' + cur.id;
  Y.setUserHidden = function (u, hide) {
    if (hide) Y.hiddenUsers.add(u); else Y.hiddenUsers.delete(u); if (cur) jset(HK(), [...Y.hiddenUsers]);
    if (FT.map && FT.map.renderNet) FT.map.renderNet('lod'); drawPeers(); if (FT.UI) FT.UI.refreshTree();
  };
  function registerMe() { // my name travels with the project so the others can see who made what
    if (!cur || Y.mode !== 'edit') return; const S = FT.state; S.users = S.users || {}; const u = Y.uid(), n = Y.name();
    if (!S.users[u] || S.users[u].name !== n) { S.users[u] = { name: n }; scanSoon(0); }
  }
  // the rows of the "users" section of the tree: everyone who made something here or has the project open now
  Y.userList = function () {
    const S = FT.state, count = {}; ['nodes', 'pipes', 'cables', 'splices'].forEach(c => { for (const id in (S[c] || {})) { const u = S[c][id].by || '-'; count[u] = (count[u] || 0) + 1; } });
    const online = {}; Y.peers.forEach(p => { const u = (p.info || {}).u || p.client; online[u] = p; });
    const me = Y.uid(), ids = new Set(Object.keys(count).concat(Object.keys(online)).concat(Object.keys(S.users || {}), Y.mode === 'edit' ? [me] : []));
    return [...ids].map(u => ({ id: u, me: u === me, old: u === '-', name: u === me ? Y.name() : ((online[u] && online[u].name) || ((S.users || {})[u] || {}).name || ''), count: count[u] || 0, peer: online[u] ? online[u].client : null, hidden: Y.hiddenUsers.has(u), color: u === '-' ? '#9aa1b6' : colorOf(u) }))
      .filter(x => x.count || x.peer || x.me).sort((a, b) => (b.me - a.me) || (a.old - b.old) || String(a.name).localeCompare(String(b.name)));
  };
  let whoSig = '';
  Y.name = () => { let n = localStorage.getItem(NK); if (!n) { n = (FT.lang === 'ar' ? 'مستخدم ' : 'User ') + client.slice(0, 3).toUpperCase(); try { localStorage.setItem(NK, n); } catch (e) { } } return n; };
  Y.hasName = () => !!localStorage.getItem(NK);
  Y.setName = n => { n = String(n || '').trim().slice(0, 40); if (n) localStorage.setItem(NK, n); registerMe(); drawPanel(); if (FT.UI && Y.active) FT.UI.refreshTree(); };
  let mouse = null;
  function myInfo() {
    const m = FT.map && FT.map.map; if (!m) return {}; const c = m.getCenter(), T = FT.T || {}, info = { c: [+c.lng.toFixed(6), +c.lat.toFixed(6)], z: +m.getZoom().toFixed(2) };
    info.u = Y.uid();
    if (document.hidden) info.away = 1;
    if (mouse) info.m = mouse;
    if (Y.mode === 'edit') { if (T.sel) info.s = { k: T.sel.kind, i: T.sel.id }; if (T.draw && T.draw.pts && T.draw.pts.length) info.d = T.draw.pts.slice(-60); info.t = T.tool; }
    return info;
  }
  const COLORS = ['#ff3d81', '#00b3ff', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#6366f1', '#d946ef', '#84cc16'];
  const colorOf = id => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; };
  const marks = new Map();
  function peerShapes() {
    const S = FT.state, out = [];
    Y.peers.forEach(p => {
      const i = p.info || {}, col = colorOf(i.u || p.client); if (Y.hiddenUsers.has(i.u)) return;
      const add = (type, coordinates) => out.push({ type: 'Feature', properties: { col }, geometry: { type, coordinates } });
      if (i.d && i.d.length) { const pts = i.m ? i.d.concat([i.m]) : i.d; if (pts.length > 1) add('LineString', pts); else add('Point', pts[0]); } // the line they are drawing right now
      const s = i.s; if (!s) return;
      if (s.k === 'node' && S.nodes[s.i]) add('Point', S.nodes[s.i].ll);
      else if (s.k === 'pipe' && S.pipes[s.i]) add('LineString', S.pipes[s.i].pts);
      else if (s.k === 'cable' && S.cables[s.i] && S.cables[s.i].pts) add('LineString', S.cables[s.i].pts);
      else if (s.k === 'bld' && FT.map.buildingRing) { const r = FT.map.buildingRing(s.i); if (r) add('LineString', r.concat([r[0]])); }
    });
    return out;
  }
  function drawPeers() {
    const m = FT.map && FT.map.map; if (!m || !FT.map.ready || !G.maplibregl) return;
    if (!m.getSource('peers')) {
      m.addSource('peers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'peers-line', type: 'line', source: 'peers', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': ['get', 'col'], 'line-width': 3.5, 'line-dasharray': [2, 1.4] } });
      m.addLayer({ id: 'peers-pt', type: 'circle', source: 'peers', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'col'] } });
    }
    m.getSource('peers').setData({ type: 'FeatureCollection', features: peerShapes() });
    const seen = new Set();
    Y.peers.forEach(p => {
      const i = p.info || {}, at = i.m || i.c; if (!at || Y.hiddenUsers.has(i.u)) return; seen.add(p.client);
      let mk = marks.get(p.client);
      if (!mk) { const el = document.createElement('div'); el.className = 'peermark'; el.innerHTML = '<i></i><span></span>'; mk = new G.maplibregl.Marker({ element: el, anchor: 'top-left' }).setLngLat(at).addTo(m); marks.set(p.client, mk); }
      const el = mk.getElement(); el.style.setProperty('--pc', colorOf((p.info || {}).u || p.client)); el.querySelector('span').textContent = p.name + (p.mode === 'view' ? ' 👁' : ''); el.classList.toggle('away', !!i.away); mk.setLngLat(at);
    });
    marks.forEach((mk, id) => { if (!seen.has(id)) { mk.remove(); marks.delete(id); } });
    drawPanel();
  }
  Y.goTo = id => { const p = Y.peers.find(x => x.client === id), i = p && p.info; if (i && i.c) FT.map.map.flyTo({ center: i.m || i.c, zoom: Math.max(i.z || 17, 17.6), duration: 800 }); };

  // ---------------- the "team" button and list ----------------
  let btn = null, box = null, wired = false;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function buildUI() {
    if (!btn) {
      const share = document.getElementById('bShare'); if (!share) return;
      btn = document.createElement('button'); btn.id = 'bTeam'; btn.className = 'pill'; share.parentNode.insertBefore(btn, share);
      box = document.createElement('div'); box.id = 'teamBox'; document.body.appendChild(box);
      btn.onclick = e => { e.stopPropagation(); box.classList.toggle('on'); drawPanel(); };
      document.addEventListener('mousedown', e => { if (box.classList.contains('on') && !box.contains(e.target) && e.target !== btn && !btn.contains(e.target)) box.classList.remove('on'); });
      box.addEventListener('click', async e => {
        const go = e.target.closest('[data-go]'); if (go) { Y.goTo(go.dataset.go); return; }
        if (e.target.closest('#teamName')) { const n = await FT.UI.ask(FT.lang === 'ar' ? 'اسمك الذي يراه الفريق' : 'Your name, as the team sees it', Y.name()); if (n) Y.setName(n); }
      });
    }
    if (!wired && FT.map && FT.map.map) {
      wired = true; const m = FT.map.map;
      m.on('mousemove', e => { mouse = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]; });
      m.getCanvas().addEventListener('mouseleave', () => { mouse = null; });
    }
  }
  let lastPanel = '';
  function drawPanel() {
    if (!btn) return; const ar = FT.lang === 'ar'; btn.style.display = Y.active ? '' : 'none'; if (!Y.active) { box.classList.remove('on'); return; }
    const label = (Y.online ? '🟢 ' : '🟠 ') + (ar ? 'الفريق ' : 'Team ') + (Y.peers.length + 1); if (btn.textContent !== label) btn.textContent = label;
    if (!box.classList.contains('on')) return;
    const rows = Y.peers.map(p => '<div class="tm"><i style="background:' + colorOf((p.info || {}).u || p.client) + '"></i><span>' + esc(p.name) + (p.mode === 'view' ? ' <small>' + (ar ? 'يشاهد' : 'watching') + '</small>' : '') + ((p.info || {}).away ? ' <small>' + (ar ? 'بتبويب آخر' : 'another tab') + '</small>' : '') + '</span><button data-go="' + esc(p.client) + '">' + (ar ? 'روح لعنده' : 'Go there') + '</button></div>').join('');
    const html = '<div class="tm me"><i style="background:' + colorOf(Y.uid()) + '"></i><span>' + esc(Y.name()) + ' <small>' + (ar ? 'أنت' : 'you') + '</small></span><button id="teamName">' + (ar ? 'تغيير الاسم' : 'Rename') + '</button></div>' +
      (rows || '<div class="tm none">' + (ar ? 'ما في حدا غيرك فاتح المشروع هلأ. ابعت رابط التعديل أو المشاهدة من زر المشاركة.' : 'Nobody else has the project open. Send the edit or view link from Share.') + '</div>') +
      (Y.online ? '' : '<div class="tm none">' + (ar ? 'الاتصال مقطوع: تعديلاتك محفوظة على جهازك وبتنبعت لما يرجع النت.' : 'Offline: your changes are kept and sent when the connection returns.') + '</div>');
    if (html !== lastPanel || !box.firstChild) { box.innerHTML = html; lastPanel = html; }
  }

  const flushOnLeave = () => { if (Y.active && Y.mode === 'edit') { Y.scanNow(); saveQueue(); push(); } };
  G.addEventListener('pagehide', flushOnLeave); G.addEventListener('beforeunload', flushOnLeave);
  document.addEventListener('visibilitychange', () => { if (!Y.active) return; if (document.visibilityState === 'hidden') flushOnLeave(); else pullSoon(0); });
})(window);
