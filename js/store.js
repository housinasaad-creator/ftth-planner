/* Project storage: Supabase (schema `ftth`, via ftth_* RPC) with a local browser cache; works offline too.
   Access model (no passwords): each project has a secret EDIT key and a VIEW key. The browser remembers the keys of
   projects it created/opened; sharing = a link containing id + key (?p=<id>&k=<key>). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const S = FT.store = { cur: null, mode: 'edit', online: true, saveTimer: 0 };
  const REG = 'ft2_cloud', CACHE = id => 'ft2_p_' + id;
  const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const reg = () => jget(REG, []), setReg = l => localStorage.setItem(REG, JSON.stringify(l));
  const C = () => G.FT_CFG;

  async function rpc(fn, body) {
    const r = await fetch(C().url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: C().anonKey, Authorization: 'Bearer ' + C().anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text(); throw new Error(fn + ' ' + r.status + ' ' + t.slice(0, 120)); }
    return r.json();
  }
  S.rpc = rpc;

  function upsertReg(e) { const l = reg(), i = l.findIndex(x => x.id === e.id); if (i >= 0) l[i] = Object.assign(l[i], e); else l.push(e); setReg(l); }

  S.list = async function () {
    const l = reg(); if (!l.length) return [];
    try {
      const rows = await rpc('ftth_list_projects', { p_ids: l.map(x => x.id), p_keys: l.map(x => x.key) });
      S.online = true; const by = {}; rows.forEach(r => by[r.id] = r);
      return l.map(x => by[x.id] ? { id: x.id, name: by[x.id].name, type: by[x.id].type, updated: Date.parse(by[x.id].updated_at), mode: by[x.id].mode } : Object.assign({ offline: 1 }, x)).filter(x => !x.gone);
    } catch (e) { S.online = false; return l.map(x => ({ id: x.id, name: x.name, type: x.type, updated: x.updated, mode: x.mode || 'edit', offline: 1 })); }
  };
  S.create = async function (name, type) {
    const st = Object.assign(FT.blank(), { meta: { name, type: type || 'gpon', created: Date.now() } });
    let c; try { c = await rpc('ftth_create_project', { p_name: name, p_type: type || 'gpon', p_state: st }); S.online = true; } catch (e) { S.online = false; c = { id: 'L' + FT.uid(''), edit_key: 'local', view_key: 'local' }; FT.UI && FT.UI.toast('Offline — saved on this device only'); }
    if (FT.sync) FT.sync.stop(); FT.setState(st); S.cur = { id: c.id, key: c.edit_key, viewKey: c.view_key, name, type: type || 'gpon' }; S.mode = 'edit';
    upsertReg({ id: c.id, key: c.edit_key, viewKey: c.view_key, name, type: type || 'gpon', updated: Date.now(), mode: 'edit' });
    localStorage.setItem(CACHE(c.id), JSON.stringify(st)); localStorage.setItem('ft2_last', c.id); await S.goLive(); return c.id;
  };
  S.open = async function (id, keyOverride) {
    const e = reg().find(x => x.id === id), owned = e && e.key && e.key !== 'local' && (e.mode || 'edit') === 'edit', key = (owned ? e.key : keyOverride) || (e && e.key); if (!key) return false;
    let st = null, mode = 'edit', name = e ? e.name : '', type = e ? e.type : 'gpon';
    let newer = null;
    try { const r = await rpc('ftth_get_project', { p_id: id, p_key: key }); if (r) { st = r.state; mode = r.mode; name = r.name; type = r.type; S.online = true; const lt = +localStorage.getItem('ft2_t_' + id) || 0, cache = jget(CACHE(id), null); if (cache && mode === 'edit' && lt > (Date.parse(r.updated_at) || 0) + 1500) newer = cache; } else if (!keyOverride) { upsertReg({ id, gone: 1 }); } } catch (x) { S.online = false; st = jget(CACHE(id), null); }
    if (!st) return false;
    if (FT.sync) FT.sync.stop(); // sends what is left of the previous project, before its state is replaced
    FT.setState(st); st = FT.state; S.mode = mode; S.cur = { id, key, name: name || (st.meta && st.meta.name) || '', type: type || (st.meta && st.meta.type) || 'gpon', viewKey: e && e.viewKey };
    st.meta = st.meta || {}; st.meta.name = S.cur.name; st.meta.type = S.cur.type;
    upsertReg({ id, key, name: S.cur.name, type: S.cur.type, mode, updated: Date.now(), gone: 0 }); localStorage.setItem('ft2_last', id);
    const oldWay = async () => { if (!newer) return; FT.setState(newer); newer = null; await S.saveNow(); };
    const live = await S.goLive(oldWay); if (live === 'legacy') await oldWay();
    return true;
  };
  S.goLive = async function (beforeTeam) {
    if (!FT.sync || !S.cur || S.cur.key === 'local') return 'legacy';
    const res = await FT.sync.start(S.cur, S.mode, { beforeTeam });
    if (res !== 'legacy' && FT.state.meta && FT.state.meta.name) S.cur.name = FT.state.meta.name;
    return res;
  };
  S.openFromUrl = async function () {
    const q = new URLSearchParams(location.search), id = q.get('p'), k = q.get('k'); if (!id || !k) return false;
    const ok = await S.open(id, k); history.replaceState(null, '', location.pathname); return ok;
  };
  S.rename = function (name) { if (!S.cur || S.mode !== 'edit') return; FT.state.meta.name = name; S.cur.name = name; S.saveNow(); if (FT.sync) FT.sync.flush(); };
  S.remove = async function (id) {
    const e = reg().find(x => x.id === id);
    if (e && e.key && e.key !== 'local' && (e.mode || 'edit') === 'edit') { try { await rpc('ftth_delete_project', { p_id: id, p_key: e.key }); } catch (x) { /* offline: just forget locally */ } }
    if (FT.sync && S.cur && S.cur.id === id) FT.sync.stop();
    setReg(reg().filter(x => x.id !== id)); localStorage.removeItem(CACHE(id)); if (S.cur && S.cur.id === id) S.cur = null; if (localStorage.getItem('ft2_last') === id) localStorage.removeItem('ft2_last');
  };
  const cacheSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }; // the browser cache is optional: a full storage must not stop the save
  let cachedAt = 0;
  S.saveNow = async function () {
    if (!S.cur) return; const team = !!(FT.sync && FT.sync.active);
    if (team) { if (Date.now() - cachedAt < 15000) return; cachedAt = Date.now(); }
    const st = FT.state; st.meta = st.meta || {}; st.meta.name = st.meta.name || S.cur.name; st.meta.type = st.meta.type || S.cur.type;
    cacheSet(CACHE(S.cur.id), JSON.stringify(st)); cacheSet('ft2_t_' + S.cur.id, String(Date.now())); try { upsertReg({ id: S.cur.id, name: st.meta.name, type: st.meta.type, updated: Date.now() }); } catch (e) { }
    if (team || S.mode !== 'edit' || S.cur.key === 'local') return;
    try { await rpc('ftth_save_project', { p_id: S.cur.id, p_key: S.cur.key, p_name: st.meta.name, p_type: st.meta.type, p_state: st }); S.online = true; if (FT.UI) FT.UI.saved(true); }
    catch (e) { S.online = false; if (FT.UI) FT.UI.saved(false); }
  };
  S.autosave = function () { if (S.mode !== 'edit') return; clearTimeout(S.saveTimer); S.saveTimer = setTimeout(S.saveNow, 1200); };
  S.links = function () { const base = location.origin + location.pathname, c = S.cur; if (!c || c.key === 'local') return null; const e = reg().find(x => x.id === c.id) || {}; return { edit: base + '?p=' + c.id + '&k=' + c.key, view: (c.viewKey || e.viewKey) ? base + '?p=' + c.id + '&k=' + (c.viewKey || e.viewKey) : null }; };
  FT.onChange(why => { if (why !== 'load') S.autosave(); });
  const flush = () => { if (S.cur && S.mode === 'edit') { try { S.saveNow(); } catch (e) { } } };
  G.addEventListener('beforeunload', flush); G.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
})(window);
