/* House numbering + building tools (floors, manual footprints). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const N = FT.num = {};
  const U = () => FT.UI;
  const lab = o => o && o.num ? (o.pfx || '') + o.num : '';
  N.label = lab;

  function ensure(id) { const S = FT.state; return S.bld[id] = S.bld[id] || {}; }
  // next number = the highest number really on the map (same prefix) + 1, and never below a start number the user typed.
  // Computed from the project itself, so undo, delete and teammates' numbering are always taken into account.
  N.syncNext = function () {
    const o = FT.T.num, pfx = o.prefix || '', bld = FT.state.bld || {}; let max = 0;
    for (const id in bld) { const b = bld[id]; if (b.num && !b.deleted && (b.pfx || '') === pfx && +b.num > max) max = +b.num; }
    o.next = Math.max(max + 1, o.from && (o.fromPfx || '') === pfx ? o.from : 1); return o.next;
  };
  FT.onChange(why => { if (why !== 'move' && FT.T.num) { const before = FT.T.num.next; if (N.syncNext() !== before && FT.UI && FT.UI.numChanged) FT.UI.numChanged(); } });

  N.clickBuilding = function (e, p) {
    const h = FT.T.hit(e); const id = h && h.kind === 'bld' ? h.id : null; if (!id) { U().toast(FT.lang === 'ar' ? 'انقر على لوغو البيت' : 'Click a house icon'); return; }
    const o = FT.T.num;
    if (!e.originalEvent.shiftKey && (FT.state.bld[id] || {}).num) { FT.T.select('bld', id); U().tab('tool'); return; } // already numbered: it keeps its number
    FT.commit();
    if (e.originalEvent.shiftKey) { const had = (FT.state.bld[id] || {}).num; const re = FT.bedit.unnumber(id); if (had) U().toast((FT.lang === 'ar' ? 'أُزيل الرقم ' + had + ' · أُعيد ترقيم ' : 'Number ' + had + ' removed · renumbered ') + re); return; }
    N.syncNext(); const b = FT.houses.pin(id); b.num = o.next++; b.pfx = o.prefix || ''; const hp = FT.map.housePoint(id); if (hp) b.ll = hp.slice(); /* the number belongs to the house marker */ FT.changed('num'); U().numChanged(); FT.T.select('bld', id); U().tab('tool'); // stay on the numbering panel
  };
  N.clickFloors = function (e, p) {
    const h = FT.T.hit(e); const id = h && h.kind === 'bld' ? h.id : null; if (!id) return;
    const fl = FT.T.opt && FT.T.opt.floors || U().floorsValue(); FT.commit(); FT.houses.pin(id).floors = fl; FT.changed('floors'); FT.T.select('bld', id);
  };
  N.addBuilding = function (ring) {
    FT.commit(); const id = 'u' + FT.uid('').slice(0, 7); const b = ensure(id); b.fp = ring; b.floors = U().floorsValue(); b.custom = 1;
    FT.changed('bld'); FT.T.select('bld', id); U().toast(FT.t('toast_added'));
  };
  N.setProp = function (id, k, v) { FT.commit(); const b = ensure(id); if (v === '' || v == null || v === 0) delete b[k]; else b[k] = v; FT.changed('bld'); };
  N.clear = function (id) { const b = FT.state.bld[id]; if (b && b.num) { const had = b.num, re = FT.bedit.unnumber(id); U().toast((FT.lang === 'ar' ? 'أُزيل الرقم ' + had + ' · أُعيد ترقيم ' : 'Number ' + had + ' removed · renumbered ') + re); } };

  // ---- automatic numbering inside an area ----
  N.autoNumber = function (ring) {
    FT.map.ensureTiles(FT.bboxOf(ring)).then(() => {
      const list = FT.map.buildingsInRing(ring); if (!list.length) { U().toast(FT.t('dxf_none')); return; }
      const o = FT.T.num, lat0 = ring[0][1], kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
      const P = list.map(b => ({ id: b.id, c: b.c, x: b.c[0] * kx, y: b.c[1] * ky }));
      const minX = Math.min(...P.map(p => p.x)), minY = Math.min(...P.map(p => p.y));
      let order = [];
      if (o.order === 'rows') {
        const band = 28; const rows = {}; P.forEach(p => { const r = Math.floor((p.y - minY) / band); (rows[r] = rows[r] || []).push(p); });
        Object.keys(rows).map(Number).sort((a, b) => a - b).forEach((r, i) => { const row = rows[r].sort((a, b) => a.x - b.x); order = order.concat(i % 2 ? row.reverse() : row); });
      } else {
        // nearest-neighbour walk from the south-west most building; 'street' keeps heading
        let cur = P.reduce((a, b) => (a.x - minX) + (a.y - minY) <= (b.x - minX) + (b.y - minY) ? a : b), left = new Set(P); left.delete(cur); order = [cur]; let hx = 1, hy = 0;
        while (left.size) {
          let best = null, bs = 1e18;
          for (const q of left) { const dx = q.x - cur.x, dy = q.y - cur.y, d = Math.hypot(dx, dy); let s = d; if (o.order === 'street' && d > 0) { const cos = (dx * hx + dy * hy) / d; s = d * (1.6 - 0.6 * cos); } if (s < bs) { bs = s; best = q; } }
          const dx = best.x - cur.x, dy = best.y - cur.y, d = Math.hypot(dx, dy) || 1; hx = dx / d; hy = dy / d; left.delete(best); order.push(best); cur = best;
        }
      }
      FT.commit(); N.syncNext(); order.forEach(p => { const b = FT.houses.pin(p.id); b.num = o.next++; b.pfx = o.prefix || ''; b.ll = (b.pt || p.c).slice(); });
      FT.changed('num'); U().numChanged(); U().toast(FT.t('num_done') + ' ' + order.length + ' ' + FT.t('bld_n'));
    });
  };
  N.clearIn = function (ring) {
    FT.map.ensureTiles(FT.bboxOf(ring)).then(() => { const list = FT.map.buildingsInRing(ring); FT.commit(); let n = 0; list.forEach(b => { const o = FT.state.bld[b.id]; if (o && o.num) { delete o.num; delete o.pfx; n++; } }); FT.changed('num'); U().toast(n + ' ' + FT.t('bld_n')); });
  };
})(window);
