/* Fibre engine: what is joined to what inside every node, the strand-level trace (up to the OLT and down to the subscribers),
   the physical optical budget along the walked path, and a splice helper for hand-drawn networks. Pure data, no DOM.
   An "end" is one of:  {c: cableId, f: strandNo}   a strand of a cable that passes the node
                        {s: 'nodeId#i', p: n}        splitter i of that node, p = 0 input, 1..N output
                        {o: ponPort}                 a PON port (OLT nodes only)
                        {t: 1}                       terminated
   A splice record {id, node, label, links: [[end, end], ...]}. Old records (one in-cable / out-cable pair) are still read. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const F = FT.fiber = {};

  // ---------------- planning values (Syrian Telecom maxima first; every one is shown to the engineer and can be changed per project) ----------------
  F.DEFAULTS = {
    att1310: 0.40, att1490: 0.30, fusion: 0.1, connector: 0.5, connectors: 2, dropM: 100,
    oltTx: 3, onuSens: -27, onuTx: 0.5, oltSens: -28, maxLoss: 28, warnMargin: 3,
  };
  F.cfg = function () { return Object.assign({}, F.DEFAULTS, (FT.state.cfg && FT.state.cfg.budget) || {}); };
  F.splitterLoss = r => { const own = FT.state.cfg && FT.state.cfg.splitterLoss; return own && own[r] != null ? +own[r] : (FT.SPLITTER_LOSS[r] || 0); };

  // ---------------- ends ----------------
  F.key = e => !e ? '' : e.c != null ? 'c:' + e.c + ':' + e.f : e.s != null ? 's:' + e.s + ':' + e.p : e.o != null ? 'o:' + e.o : 't';
  F.same = (a, b) => F.key(a) === F.key(b);
  F.ratioN = r => r ? (parseInt(String(r).split(':')[1], 10) || 0) : 0;
  F.splittersOf = function (nodeId) {
    const n = FT.state.nodes[nodeId]; if (!n || !F.ratioN(n.ratio)) return [];
    const count = Math.max(1, Math.min(64, parseInt(n.nsplit, 10) || 1));
    return Array.from({ length: count }, (_, i) => ({ key: nodeId + '#' + (i + 1), node: nodeId, i: i + 1, ratio: n.ratio, n: F.ratioN(n.ratio) }));
  };
  F.splitter = key => { const at = String(key).lastIndexOf('#'); return F.splittersOf(String(key).slice(0, at)).find(x => x.key === key) || null; };
  F.strandName = (c, f) => { const cpt = c && c.cpt ? c.cpt : 12; return FT.fiberLabel(Math.floor((f - 1) / cpt) + 1, (f - 1) % cpt + 1); };
  F.strandColor = (c, f) => { const cpt = c && c.cpt ? c.cpt : 12; return FT.FIBER_COLORS[((f - 1) % cpt) % 12]; };

  function recordLinks(r) {
    if (Array.isArray(r.links)) return r.links;
    const out = []; Object.keys(r.fus || {}).forEach(k => { const v = r.fus[k]; if (!v || !r.inCable) return; if (v === 'T') out.push([{ c: r.inCable, f: +k }, { t: 1 }]); else if (r.outCable) out.push([{ c: r.inCable, f: +k }, { c: r.outCable, f: +v }]); });
    return out;
  }
  F.recordLinks = recordLinks;
  const recordsOf = nodeId => Object.values(FT.state.splices).filter(r => r.node === nodeId);
  F.links = nodeId => [].concat(...recordsOf(nodeId).map(r => recordLinks(r).map((l, i) => ({ a: l[0], b: l[1], rec: r.id, i }))));

  // the record of a node in the current format (made if wanted; an old-format record is converted the first time it is edited)
  F.record = function (nodeId, create) {
    const S = FT.state; let r = recordsOf(nodeId)[0];
    if (!r && create) { S.seq.splice = (S.seq.splice || 0) + 1; r = { id: FT.uid('e'), node: nodeId, label: '', links: [] }; S.splices[r.id] = r; }
    if (r && !Array.isArray(r.links)) { r.links = recordLinks(r); delete r.fus; delete r.inCable; delete r.outCable; }
    return r || null;
  };

  // ---------------- index of the whole network ----------------
  F.index = function () {
    const S = FT.state, at = {}, strand = {}, used = {}, drops = {};
    Object.values(S.splices).forEach(r => {
      if (!S.nodes[r.node]) return;
      recordLinks(r).forEach(l => {
        const a = l[0], b = l[1];
        [[a, b], [b, a]].forEach(([me, other]) => {
          if (!me || me.t) return;
          const k = F.key(me); (at[r.node] = at[r.node] || {}); (at[r.node][k] = at[r.node][k] || []).push(other);
          if (me.c != null) { const sk = me.c + ':' + me.f; (strand[sk] = strand[sk] || []).push({ node: r.node, other }); used[sk] = 1; }
        });
      });
    });
    Object.values(S.cables).forEach(c => { if (c.sub && S.subs[c.sub]) drops[c.id] = S.subs[c.sub]; });
    const subAt = {}; Object.values(S.subs).forEach(s => { (subAt[s.node] = subAt[s.node] || []).push(s); });
    const spanCache = {};
    const spans = cid => { if (!spanCache[cid]) { const c = S.cables[cid]; spanCache[cid] = c ? FT.cableSpans(c) : []; } return spanCache[cid]; };
    return { at, strand, used, drops, subAt, spans };
  };
  const other = (ix, nodeId, end) => { const l = ix.at[nodeId] && ix.at[nodeId][F.key(end)]; return l && l.length ? l[0] : null; };

  // metres and map points along a cable between two of its nodes
  function stretch(ix, cid, fromNode, toNode) {
    const c = FT.state.cables[cid]; if (!c) return { len: 0, pts: [] };
    const sp = ix.spans(cid); if (fromNode === toNode || toNode == null) return { len: sp.reduce((s, x) => s + x.len, 0), pts: [].concat(...sp.map(x => x.pts)) };
    const ids = c.nodes || [c.a, c.b], i = ids.indexOf(fromNode), j = ids.indexOf(toNode);
    if (i < 0 || j < 0) return { len: sp.reduce((s, x) => s + x.len, 0), pts: [].concat(...sp.map(x => x.pts)) };
    const lo = Math.min(i, j), hi = Math.max(i, j); let len = 0, pts = [], k = 0;
    for (let s = 1; s < ids.length; s++) { if (!FT.state.nodes[ids[s - 1]] || !FT.state.nodes[ids[s]]) continue; const x = sp[k++]; if (!x) continue; if (s - 1 >= lo && s <= hi) { len += x.len; pts = pts.concat(x.pts); } }
    return { len, pts: i <= j ? pts : pts.reverse() };
  }

  // follow one strand away from a node: where does it come out?
  function ride(ix, fromNode, cid, f) {
    const S = FT.state, c = S.cables[cid];
    if (!c) return { problem: 'no_cable', node: fromNode };
    if (f < 1 || f > c.core) return { problem: 'no_strand', node: fromNode, cable: c };
    const ends = (ix.strand[cid + ':' + f] || []).filter(x => x.node !== fromNode);
    if (ends.length > 1) return { problem: 'ambiguous', node: fromNode, cable: c };
    if (ends.length === 1) { const e = ends[0], s = stretch(ix, cid, fromNode, e.node); return { cable: c, to: e.node, next: e.other, len: s.len, pts: s.pts }; }
    const ids = c.nodes || [c.a, c.b], i = ids.indexOf(fromNode);
    if (ix.drops[cid]) { const s = stretch(ix, cid, fromNode, null); return { cable: c, onu: ix.drops[cid], len: s.len, pts: s.pts }; }
    const far = i <= (ids.length - 1) / 2 ? ids[ids.length - 1] : ids[0], s = stretch(ix, cid, fromNode, far);
    return { problem: 'open', cable: c, node: far, len: s.len, pts: s.pts };
  }
  const issue = (list, code, node, extra) => list.push(Object.assign({ code, node: node || null }, extra || {}));

  // ---------------- upstream: from an end held at a node to the OLT ----------------
  // `end` is what must be fed (a splitter input, or a strand arriving at that node)
  function goUp(ix, nodeId, end, steps, issues, seen) {
    let node = nodeId, cur = end;
    for (let guard = 0; guard < 400; guard++) {
      const nb = other(ix, node, cur);
      if (!nb) { issue(issues, cur.s != null ? 'no_input' : 'open', node, { end: cur }); return { reached: false, node }; }
      const joined = !(nb.o != null); if (joined && !nb.t) steps.push({ type: 'fusion', node });
      if (nb.o != null) { steps.push({ type: 'olt', node, port: nb.o }); return { reached: true, olt: node, port: nb.o }; }
      if (nb.t) { issue(issues, 'terminated', node, { end: cur }); return { reached: false, node }; }
      if (nb.s != null) {
        const sp = F.splitter(nb.s); if (!sp) { issue(issues, 'no_splitter', node); return { reached: false, node }; }
        if (nb.p === 0) { issue(issues, 'wrong_way', node); return { reached: false, node }; }
        if (nb.p > sp.n) issue(issues, 'no_port', node, { port: nb.p });
        if (seen[sp.key]) { issue(issues, 'loop', node); return { reached: false, node }; } seen[sp.key] = 1;
        steps.push({ type: 'splitter', node, key: sp.key, ratio: sp.ratio, port: nb.p }); cur = { s: sp.key, p: 0 }; continue;
      }
      const sk = nb.c + ':' + nb.f; if (seen[sk]) { issue(issues, 'loop', node); return { reached: false, node }; } seen[sk] = 1;
      const r = ride(ix, node, nb.c, nb.f);
      if (r.problem) {
        if (r.cable) steps.push({ type: 'strand', cable: r.cable.id, f: nb.f, from: node, to: r.node, len: r.len || 0, pts: r.pts || [] });
        issue(issues, r.problem === 'open' && FT.state.nodes[r.node] && FT.state.nodes[r.node].type === 'olt' ? 'no_patch' : r.problem, r.node, { cable: nb.c, f: nb.f }); return { reached: false, node: r.node };
      }
      if (r.onu) { steps.push({ type: 'strand', cable: nb.c, f: nb.f, from: node, to: null, len: r.len, pts: r.pts }); issue(issues, 'wrong_way', node); return { reached: false, node }; }
      steps.push({ type: 'strand', cable: nb.c, f: nb.f, from: node, to: r.to, len: r.len, pts: r.pts });
      node = r.to; cur = { c: nb.c, f: nb.f };
    }
    issue(issues, 'loop', node); return { reached: false, node };
  }

  // ---------------- downstream: everything fed by a splitter ----------------
  function goDown(ix, nodeId, end, steps, issues, seen, depth) {
    let node = nodeId, cur = end;
    for (let guard = 0; guard < 400; guard++) {
      const nb = other(ix, node, cur);
      if (!nb) return cur.c != null ? (issue(issues, 'open', node, { cable: cur.c, f: cur.f }), { state: 'open', node }) : { state: 'free', node };
      if (nb.t) return { state: 'term', node };
      if (nb.o != null) { issue(issues, 'wrong_way', node); return { state: 'bad', node }; }
      steps.push({ type: 'fusion', node });
      if (nb.s != null) {
        const sp = F.splitter(nb.s); if (!sp) { issue(issues, 'no_splitter', node); return { state: 'bad', node }; }
        if (nb.p !== 0) { issue(issues, 'wrong_way', node); return { state: 'bad', node }; }
        return { state: 'split', node, child: tree(ix, sp, issues, seen, depth + 1) };
      }
      const sk = nb.c + ':' + nb.f; if (seen[sk]) { issue(issues, 'loop', node); return { state: 'bad', node }; } seen[sk] = 1;
      const r = ride(ix, node, nb.c, nb.f);
      if (r.problem) {
        if (r.cable) steps.push({ type: 'strand', cable: r.cable.id, f: nb.f, from: node, to: r.node, len: r.len || 0, pts: r.pts || [] });
        issue(issues, r.problem, r.node, { cable: nb.c, f: nb.f }); return { state: 'open', node: r.node };
      }
      if (r.onu) { steps.push({ type: 'strand', cable: nb.c, f: nb.f, from: node, to: null, len: r.len, pts: r.pts }); return { state: 'onu', node, sub: r.onu }; }
      steps.push({ type: 'strand', cable: nb.c, f: nb.f, from: node, to: r.to, len: r.len, pts: r.pts });
      node = r.to; cur = { c: nb.c, f: nb.f };
    }
    issue(issues, 'loop', node); return { state: 'bad', node };
  }
  function tree(ix, sp, issues, seen, depth) {
    const t = { key: sp.key, node: sp.node, ratio: sp.ratio, n: sp.n, out: [] };
    if (depth > 8 || seen['T' + sp.key]) { issue(issues, 'loop', sp.node); return t; } seen['T' + sp.key] = 1;
    const subs = (ix.subAt[sp.node] || []).filter(s => (s.spl || 1) === sp.i);
    for (let p = 1; p <= sp.n; p++) {
      const steps = [], res = goDown(ix, sp.node, { s: sp.key, p }, steps, issues, seen, depth);
      if (res.state === 'free') { const s = subs.find(x => x.port === p); if (s) { res.state = 'onu_unspliced'; res.sub = s; issue(issues, 'onu_unspliced', sp.node, { port: p, sub: s.id }); } }
      t.out.push(Object.assign({ port: p, steps }, res));
    }
    return t;
  }

  // ---------------- budget ----------------
  F.budget = function (steps, opt) {
    const C = F.cfg(); opt = opt || {};
    let m = 0, fus = 0; const ratios = []; let splitterDb = 0;
    steps.forEach(s => { if (s.type === 'strand') m += s.len; else if (s.type === 'fusion') fus++; else if (s.type === 'splitter') { ratios.push(s.ratio); splitterDb += F.splitterLoss(s.ratio); } });
    const dropM = opt.assumeDrop ? C.dropM : 0, km = (m + dropM) / 1000, conn = C.connectors;
    const dir = att => { const fibre = km * att, splice = fus * C.fusion, connector = conn * C.connector; return { fibre, splice, connector, splitter: splitterDb, total: fibre + splice + connector + splitterDb }; };
    const down = dir(C.att1490), up = dir(C.att1310);
    down.tx = C.oltTx; down.rx = C.oltTx - down.total; down.sens = C.onuSens; down.margin = down.rx - C.onuSens;
    up.tx = C.onuTx; up.rx = C.onuTx - up.total; up.sens = C.oltSens; up.margin = up.rx - C.oltSens;
    const worstLoss = Math.max(down.total, up.total), sensMargin = Math.min(down.margin, up.margin), lossMargin = C.maxLoss - worstLoss;
    const status = lossMargin < 0 || sensMargin < 0 ? 'bad' : lossMargin < C.warnMargin || sensMargin < C.warnMargin ? 'warn' : 'ok';
    return { fibreM: m, dropM, km, fusions: fus, connectors: conn, ratios: ratios.slice().reverse(), split: ratios.reduce((a, r) => a * (F.ratioN(r) || 1), 1), down, up, worstLoss, lossMargin, sensMargin, critical: up.margin < down.margin ? 'up' : 'down', status };
  };

  // ---------------- traces ----------------
  const status = (reached, upIssues, downIssues) => !reached ? 'broken' : (upIssues.length || downIssues.length) ? 'partial' : 'ok';
  // everything about one splitter: the way to the OLT, what hangs below it, and the budget at its outputs
  F.traceSplitter = function (key, ix) {
    ix = ix || F.index(); const sp = F.splitter(key); if (!sp) return null;
    const up = [], upI = [], downI = [], seen = {}; seen[key] = 1;
    const res = goUp(ix, sp.node, { s: key, p: 0 }, up, upI, seen);
    const own = { type: 'splitter', node: sp.node, key, ratio: sp.ratio, port: 0 };
    const t = tree(ix, sp, downI, {}, 0);
    const b = res.reached ? F.budget(up.concat([own]), { assumeDrop: true }) : null;
    return { kind: 'splitter', splitter: sp, reached: res.reached, olt: res.reached ? res.olt : null, port: res.reached ? res.port : null, stop: res.reached ? null : res.node, up, own, tree: t, issues: upI.concat(downI), upIssues: upI, status: status(res.reached, upI, downI), budget: b };
  };
  F.traceSub = function (subId, ix) {
    ix = ix || F.index(); const sub = FT.state.subs[subId]; if (!sub) return null;
    const sp = F.splittersOf(sub.node)[(sub.spl || 1) - 1];
    if (!sp) return { kind: 'sub', sub, reached: false, up: [], issues: [{ code: 'no_splitter', node: sub.node }], status: 'broken', budget: null };
    const up = [], upI = [], seen = {}; seen[sp.key] = 1;
    const res = goUp(ix, sp.node, { s: sp.key, p: 0 }, up, upI, seen);
    const down = [], downI = [], r = goDown(ix, sp.node, { s: sp.key, p: sub.port }, down, downI, {}, 0);
    const own = { type: 'splitter', node: sp.node, key: sp.key, ratio: sp.ratio, port: sub.port };
    const toOnu = r.state === 'onu' && r.sub.id === sub.id;
    if (!toOnu) downI.push({ code: r.state === 'free' ? 'onu_unspliced' : 'wrong_onu', node: sp.node, port: sub.port });
    let extra = down;
    if (!toOnu) { const c = Object.values(FT.state.cables).find(x => x.sub === sub.id); if (c) extra = [{ type: 'strand', cable: c.id, f: 1, from: sub.node, to: null, len: FT.cableLength(c), pts: [] }, { type: 'fusion', node: sub.node }]; }
    const b = res.reached ? F.budget(up.concat([own], extra), { assumeDrop: !toOnu && !extra.length }) : null;
    return { kind: 'sub', sub, splitter: sp, reached: res.reached, olt: res.reached ? res.olt : null, port: res.reached ? res.port : null, up, own, drop: extra, issues: upI.concat(downI), status: status(res.reached, upI, downI), budget: b };
  };
  F.tracePon = function (oltId, port, ix) {
    ix = ix || F.index(); const steps = [], issues = [];
    const res = goDown(ix, oltId, { o: port }, steps, issues, {}, 0);
    return { kind: 'pon', olt: oltId, port, steps: [{ type: 'olt', node: oltId, port }].concat(steps), result: res, issues, reached: true, status: issues.length || res.state === 'free' ? 'partial' : 'ok' };
  };
  // one strand: whichever side leads to the OLT is "up", the other side is "down"
  F.traceStrand = function (cableId, f, ix) {
    ix = ix || F.index(); const c = FT.state.cables[cableId]; if (!c) return null;
    const ends = ix.strand[cableId + ':' + f] || [], self = { c: cableId, f };
    if (!ends.length) return { kind: 'strand', cable: cableId, f, reached: false, up: [], down: null, issues: [{ code: 'unused', node: (c.nodes || [])[0] || null }], status: 'broken', budget: null };
    let best = null;
    ends.forEach(e => { const up = [], upI = [], seen = {}; seen[cableId + ':' + f] = 1; const res = goUp(ix, e.node, self, up, upI, seen); if (!best || (res.reached && !best.res.reached)) best = { e, up, upI, res }; });
    const downSteps = [], downI = [], r = ride(ix, best.e.node, cableId, f); let down;
    const mine = { type: 'strand', cable: cableId, f, from: best.e.node, to: r.to || r.node || null, len: r.len || 0, pts: r.pts || [] };
    if (r.problem) { issue(downI, r.problem, r.node, { cable: cableId, f }); down = { state: 'open', node: r.node }; }
    else if (r.onu) down = { state: 'onu', node: best.e.node, sub: r.onu };
    else { const nb = r.next; if (nb.s != null && nb.p === 0 && F.splitter(nb.s)) { downSteps.push({ type: 'fusion', node: r.to }); down = { state: 'split', node: r.to, child: tree(ix, F.splitter(nb.s), downI, {}, 1) }; } else down = goDown(ix, r.to, self, downSteps, downI, {}, 0); }
    const b = best.res.reached ? F.budget(best.up.concat([mine], downSteps), { assumeDrop: down.state !== 'onu' }) : null;
    return { kind: 'strand', cable: cableId, f, reached: best.res.reached, olt: best.res.reached ? best.res.olt : null, port: best.res.reached ? best.res.port : null, up: best.up, mine, downSteps, down, issues: best.upI.concat(downI), status: status(best.res.reached, best.upI, downI), budget: b };
  };
  // map line of a trace
  F.tracePoints = function (tr) {
    const lines = [], add = steps => (steps || []).forEach(s => { if (s.type === 'strand' && s.pts && s.pts.length > 1) lines.push(s.pts); });
    const walk = t => { if (!t) return; t.out.forEach(o => { add(o.steps); if (o.child) walk(o.child); }); };
    add(tr.up); add(tr.drop); add(tr.steps); add(tr.downSteps); if (tr.mine) add([tr.mine]); walk(tr.tree); if (tr.result && tr.result.child) walk(tr.result.child); if (tr.down && tr.down.child) walk(tr.down.child);
    return lines;
  };

  // one budget row for every splitter that is meant to serve homes (boxes with no further splitter below) and for every subscriber
  F.analyze = function () {
    const ix = F.index(), boxes = [], subs = [];
    Object.values(FT.state.nodes).forEach(n => F.splittersOf(n.id).forEach(sp => {
      const up = [], upI = [], seen = {}; seen[sp.key] = 1; const res = goUp(ix, sp.node, { s: sp.key, p: 0 }, up, upI, seen);
      let feedsSplitter = false, spliced = 0;
      for (let p = 1; p <= sp.n; p++) { const l = ix.at[sp.node] && ix.at[sp.node]['s:' + sp.key + ':' + p]; if (l) spliced++; }
      if (n.type !== 'bk') { const t = tree(ix, sp, [], {}, 0); feedsSplitter = t.out.some(o => o.state === 'split'); }
      const own = { type: 'splitter', node: sp.node, key: sp.key, ratio: sp.ratio, port: 0 };
      boxes.push({ node: n, splitter: sp, reached: res.reached, olt: res.reached ? res.olt : null, port: res.reached ? res.port : null, steps: up, issues: upI, spliced, onus: (ix.subAt[n.id] || []).filter(s => (s.spl || 1) === sp.i).length, last: !feedsSplitter, budget: res.reached ? F.budget(up.concat([own]), { assumeDrop: true }) : null });
    }));
    Object.keys(FT.state.subs).forEach(id => subs.push(F.traceSub(id, ix)));
    return { boxes, subs, ix };
  };

  // ---------------- editing ----------------
  F.valid = function (nodeId, e) {
    const S = FT.state, n = S.nodes[nodeId]; if (!n || !e) return false;
    if (e.t) return true;
    if (e.o != null) return n.type === 'olt' && e.o >= 1;
    if (e.s != null) { const sp = F.splitter(e.s); return !!sp && sp.node === nodeId && e.p >= 0 && e.p <= sp.n; }
    const c = S.cables[e.c]; return !!c && (c.nodes || []).includes(nodeId) && e.f >= 1 && e.f <= c.core;
  };
  F.busy = (nodeId, e) => F.links(nodeId).some(l => F.same(l.a, e) || F.same(l.b, e));
  F.connect = function (nodeId, a, b) {
    if (!F.valid(nodeId, a) || !F.valid(nodeId, b) || F.same(a, b)) return { ok: false, why: 'invalid' };
    if (a.t) { const x = a; a = b; b = x; }
    if (a.t) return { ok: false, why: 'invalid' };
    if (a.c != null && b.c != null && a.c === b.c) return { ok: false, why: 'same_cable' };
    if (a.s != null && b.s != null && a.s === b.s) return { ok: false, why: 'invalid' };
    if (a.o != null && b.o != null) return { ok: false, why: 'invalid' };
    if (F.busy(nodeId, a) || (!b.t && F.busy(nodeId, b))) return { ok: false, why: 'busy' };
    F.record(nodeId, true).links.push([a, b]); return { ok: true };
  };
  F.disconnect = function (nodeId, e) {
    let n = 0;
    recordsOf(nodeId).forEach(r => { const links = recordLinks(r), keep = links.filter(l => !F.same(l[0], e) && !F.same(l[1], e)); if (keep.length !== links.length) { n += links.length - keep.length; r.links = keep; delete r.fus; delete r.inCable; delete r.outCable; } });
    return n;
  };
  // drop joins that point at something that no longer exists (called after deletes)
  F.prune = function () {
    const S = FT.state; let n = 0;
    Object.values(S.splices).forEach(r => {
      if (!S.nodes[r.node]) { delete S.splices[r.id]; return; }
      const links = recordLinks(r), keep = links.filter(l => l.every(e => !e || e.c == null || S.cables[e.c]));
      if (keep.length !== links.length) { n += links.length - keep.length; r.links = keep; delete r.fus; delete r.inCable; delete r.outCable; }
    });
    return n;
  };
  F.freeStrand = function (cableId, ix) { const c = FT.state.cables[cableId]; if (!c) return 0; for (let f = 1; f <= c.core; f++) if (!ix.used[cableId + ':' + f]) return f; return 0; };
  F.usedPon = oltId => F.links(oltId).reduce((l, x) => { [x.a, x.b].forEach(e => { if (e && e.o != null) l.push(+e.o); }); return l; }, []);
  F.nextPon = function (oltId) { const u = new Set(F.usedPon(oltId)); let p = 1; while (u.has(p)) p++; return p; };

  // ---------------- splice helper for hand-drawn networks ----------------
  // every splitter without a feed gets: a free strand along the cable route from the nearest upstream splitter output (or a new PON port)
  F.autoSplice = function (only) {
    const S = FT.state, adj = {};
    Object.values(S.cables).forEach(c => { if (c.sub) return; FT.cableSpans(c).forEach(s => { if (s.from === s.to) return; (adj[s.from] = adj[s.from] || []).push([s.to, s.len, c.id]); (adj[s.to] = adj[s.to] || []).push([s.from, s.len, c.id]); }); });
    const trees = Object.values(S.nodes).filter(n => n.type === 'olt').map(o => ({ olt: o, t: FT.spec.tree(o.id, adj) }));
    const todo = [];
    Object.values(S.nodes).forEach(n => { if (only && !only.has(n.id)) return; F.splittersOf(n.id).forEach(sp => { if (F.busy(n.id, { s: sp.key, p: 0 })) return; let best = null; trees.forEach(x => { if (x.t.dist[n.id] != null && (!best || x.t.dist[n.id] < best.t.dist[n.id])) best = x; }); todo.push({ sp, best, d: best ? best.t.dist[n.id] : Infinity }); }); });
    todo.sort((a, b) => a.d - b.d || a.sp.key.localeCompare(b.sp.key, undefined, { numeric: true }));
    const out = { done: 0, joins: 0, failed: [] };
    let ix = F.index();
    todo.forEach(({ sp, best }) => {
      // a cable that ENDS here may already bring a strand that is fed from above and still loose at this end: use it, lay nothing new
      let waiting = null;
      Object.values(S.cables).some(c => { const ids = c.nodes || []; if (c.sub || (ids[0] !== sp.node && ids[ids.length - 1] !== sp.node)) return false; for (let f = 1; f <= c.core; f++) { const conns = ix.strand[c.id + ':' + f]; if (!conns || conns.length !== 1 || conns[0].node === sp.node) continue; const seen = {}; seen[c.id + ':' + f] = 1; if (goUp(ix, conns[0].node, { c: c.id, f }, [], [], seen).reached) { waiting = { c: c.id, f }; return true; } } return false; });
      if (waiting && F.connect(sp.node, waiting, { s: sp.key, p: 0 }).ok) { out.joins++; out.done++; ix = F.index(); return; }
      if (!best) { out.failed.push({ node: sp.node, why: 'no_path' }); return; }
      const path = FT.spec.pathTo(best.t, sp.node); // [olt, ..., box]
      // the source: the nearest node before this one that has a fed splitter with a free output, else a PON port on the OLT
      let from = 0, source = null;
      for (let i = path.length - 2; i > 0 && !source; i--) {
        for (const up of F.splittersOf(path[i])) { if (!F.busy(path[i], { s: up.key, p: 0 })) continue; let p = 1; while (p <= up.n && (F.busy(path[i], { s: up.key, p }) || (ix.subAt[path[i]] || []).some(s => (s.spl || 1) === up.i && s.port === p))) p++; if (p <= up.n) { source = { s: up.key, p }; from = i; break; } }
      }
      if (!source && path.length < 2) { out.failed.push({ node: sp.node, why: 'no_path' }); return; }
      if (!source) source = { o: F.nextPon(path[0]) };
      // one strand per cable section of the route
      const legs = []; for (let i = from + 1; i < path.length; i++) { const cid = best.t.prev[path[i]][1]; if (legs.length && legs[legs.length - 1].c === cid) legs[legs.length - 1].to = path[i]; else legs.push({ c: cid, from: path[i - 1], to: path[i] }); }
      for (const leg of legs) { leg.f = F.freeStrand(leg.c, ix); if (!leg.f) { out.failed.push({ node: sp.node, why: 'no_strand', cable: leg.c }); return; } }
      let hold = source;
      for (const leg of legs) { const r = F.connect(leg.from, hold, { c: leg.c, f: leg.f }); if (!r.ok) { out.failed.push({ node: leg.from, why: r.why }); return; } out.joins++; hold = { c: leg.c, f: leg.f }; }
      const r = F.connect(sp.node, hold, { s: sp.key, p: 0 }); if (!r.ok) { out.failed.push({ node: sp.node, why: r.why }); return; }
      out.joins++; out.done++; ix = F.index();
    });
    return out;
  };

  // one line per used strand of every cable, with where it ends (labels for the field team)
  F.labels = function () {
    const S = FT.state, ix = F.index(), rows = [], name = id => { const n = S.nodes[id]; return n ? (n.code || n.name) : ''; };
    FT.ordered('cables').forEach(c => {
      for (let f = 1; f <= c.core; f++) {
        const conns = ix.strand[c.id + ':' + f]; if (!conns) continue;
        const tr = F.traceStrand(c.id, f, ix);
        let dest = '';
        if (tr.down) { if (tr.down.state === 'split') dest = name(tr.down.node) + ' · ' + tr.down.child.ratio; else if (tr.down.state === 'onu') dest = tr.down.sub.name; else if (tr.down.state === 'term') dest = 'TERMINATED'; else dest = 'OPEN @ ' + name(tr.down.node); }
        rows.push({ cable: c, f, tube: Math.floor((f - 1) / c.cpt) + 1, color: F.strandColor(c, f), from: conns.map(x => name(x.node)).join(' / '), dest, olt: tr.reached ? name(tr.olt) : '', pon: tr.reached ? tr.port : '', len: FT.cableLength(c), status: tr.status });
      }
    });
    return rows;
  };
})(typeof window !== 'undefined' ? window : globalThis);
