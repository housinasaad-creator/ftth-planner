/* Illustration of a building for the right panel: the FDB that serves it, the fibre strands reaching it (one coloured strand per fibre,
   TIA-598-C colours), the floors of the building. A drawing, so the engineer understands the building at a glance. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const DG = FT.diagram = {};
  const ratioN = r => r ? (parseInt(String(r).split(':')[1], 10) || 1) : 0;

  DG.info = function (id) {
    const S = FT.state, o = S.bld[id] || {}, f = (FT.map.bldFeats || []).find(x => x.properties.id === id), pr = f ? f.properties : {};
    const ring = (FT.bedit && FT.bedit.ringOf(id)) || null, c = FT.map.housePoint(id) || o.ll || (ring ? FT.centroid(ring) : null);
    const floors = FT.houses.floorsOf(o); // the floors drawn on the house icon
    const subs = Object.values(S.subs || {}).filter(s => s.bld === id);
    let fdb = (o.fdb && S.nodes[o.fdb]) || (subs[0] && S.nodes[subs[0].node]) || null, dist = null;
    if (!fdb && c) { let bd = 40; Object.values(S.nodes).forEach(n => { if (n.type !== 'bk') return; const d = FT.dist(n.ll, c); if (d < bd) { bd = d; fdb = n; } }); }
    let near = null; if (!fdb && c) { let bd = 120; Object.values(S.nodes).forEach(n => { const d = FT.dist(n.ll, c); if (d < bd) { bd = d; near = n; } }); dist = near ? bd : null; }
    const feed = fdb ? Object.values(S.cables).find(k => k.nodes.includes(fdb.id) && ((FT.CABLE_CAT.find(x => x.id === k.cat) || {}).group !== 'Drop') && k.nodes[k.nodes.length - 1] === fdb.id) || Object.values(S.cables).find(k => k.nodes.includes(fdb.id) && ((FT.CABLE_CAT.find(x => x.id === k.cat) || {}).group !== 'Drop')) : null;
    const boxes = fdb ? Object.values(S.nodes).filter(n => n.type === 'bk' && (n.id === fdb.id || n.bld === id)) : [];
    const ports = boxes.reduce((a, n) => a + (ratioN(n.ratio) || 4) * Math.max(1, n.nsplit || 1), 0), used = Math.min(ports, subs.length);
    return { boxes: boxes.length, flats: FT.houses.homesOf(o), flatsKnown: o.flats > 0, id, o, floors, num: o.num ? FT.num.label(o) : '', subs, fdb, near, dist, feed, ports, used, area: null };
  };

  const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  DG.bld = function (id) {
    const I = DG.info(id), W = 300, H = 214, gy = 192, fw = 66, bx = 196, fh = 15, shown = Math.min(I.floors, 9), top = gy - shown * fh;
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0b0e14;border:1px solid #232a38;border-radius:12px" direction="ltr">';
    g += '<line x1="8" y1="' + gy + '" x2="292" y2="' + gy + '" stroke="#2c3550" stroke-width="2"/>';
    // building
    g += '<rect x="' + bx + '" y="' + top + '" width="' + fw + '" height="' + (shown * fh) + '" rx="3" fill="#1b2130" stroke="#46527a" stroke-width="1.6"/>';
    for (let f = 0; f < shown; f++) for (let k = 0; k < 3; k++) { const wx = bx + 8 + k * 19, wy = top + f * fh + 3, lit = (f * 3 + k + (I.num ? I.num.length : 1)) % 3 !== 0; g += '<rect x="' + wx + '" y="' + wy + '" width="11" height="8" rx="1.5" fill="' + (lit ? '#f2b28c' : '#2c3550') + '" opacity="' + (lit ? 0.85 : 1) + '"/>'; }
    g += '<rect x="' + (bx + fw / 2 - 6) + '" y="' + (gy - 11) + '" width="12" height="11" rx="1.5" fill="#07090d" stroke="#ff8a62" stroke-width="1.2"/>';
    g += '<path d="M' + (bx - 3) + ' ' + top + ' L' + (bx + fw / 2) + ' ' + (top - 9) + ' L' + (bx + fw + 3) + ' ' + top + ' Z" fill="#232a38" stroke="#46527a" stroke-width="1.4"/>';
    if (I.floors > shown) g += '<text x="' + (bx + fw / 2) + '" y="' + (top - 13) + '" fill="#9aa1b6" font-size="10" text-anchor="middle" font-weight="700">+' + (I.floors - shown) + '</text>';
    // floors scale (right side)
    g += '<line x1="' + (bx + fw + 9) + '" y1="' + top + '" x2="' + (bx + fw + 9) + '" y2="' + gy + '" stroke="#5d667d" stroke-width="1"/><path d="M' + (bx + fw + 6) + ' ' + (top + 5) + ' L' + (bx + fw + 9) + ' ' + top + ' L' + (bx + fw + 12) + ' ' + (top + 5) + ' M' + (bx + fw + 6) + ' ' + (gy - 5) + ' L' + (bx + fw + 9) + ' ' + gy + ' L' + (bx + fw + 12) + ' ' + (gy - 5) + '" fill="none" stroke="#5d667d" stroke-width="1"/>';
    g += '<text x="' + (bx + fw + 17) + '" y="' + ((top + gy) / 2 + 5) + '" fill="#eceff6" font-size="13" font-weight="800">' + I.floors + '</text>';
    if (I.num) g += '<g><rect x="' + (bx + fw / 2 - 22) + '" y="' + (Math.max(4, top - 36)) + '" width="44" height="18" rx="9" fill="#ff6a3d"/><text x="' + (bx + fw / 2) + '" y="' + (Math.max(4, top - 36) + 13) + '" fill="#07090d" font-size="12" font-weight="800" text-anchor="middle">' + esc(I.num) + '</text></g>';
    if (I.fdb) {
      const x0 = 14, y0 = 84, bw = 60, bh = 74, n = Math.max(1, Math.min(8, I.ports));
      // FDB box with splitter symbol
      g += '<rect x="' + x0 + '" y="' + y0 + '" width="' + bw + '" height="' + bh + '" rx="8" fill="#3a1722" stroke="#ff4f7a" stroke-width="2"/>';
      g += '<text x="' + (x0 + bw / 2) + '" y="' + (y0 + 14) + '" fill="#ffb3c6" font-size="11" font-weight="800" text-anchor="middle">FDB</text>';
      const sx = x0 + 22, sy = y0 + bh / 2 + 6; g += '<path d="M' + x0 + ' ' + sy + ' H' + sx + '" stroke="#ffd2dd" stroke-width="2"/><circle cx="' + sx + '" cy="' + sy + '" r="3.2" fill="#ffd2dd"/>';
      for (let k = 0; k < n; k++) { const yy = y0 + 24 + k * ((bh - 34) / Math.max(1, n - 1)); g += '<path d="M' + sx + ' ' + sy + ' L' + (x0 + bw - 8) + ' ' + (n === 1 ? sy : yy) + '" stroke="#ffd2dd" stroke-width="1.2" opacity=".8"/>'; }
      g += '<text x="' + (x0 + bw / 2) + '" y="' + (y0 + bh + 14) + '" fill="#eceff6" font-size="12" font-weight="800" text-anchor="middle">' + esc(I.fdb.ratio || '1:' + n) + '</text>';
      // feeding fibre (from above)
      g += '<path d="M' + x0 + ' ' + (y0 + bh / 2 + 6) + ' H8" stroke="#2bd18b" stroke-width="2.4"/>';
      g += '<path d="M8 ' + (y0 + bh / 2 + 6) + ' V30" stroke="#2bd18b" stroke-width="2.4" fill="none"/>';
      g += '<rect x="4" y="8" width="38" height="22" rx="5" fill="#2bd18b"/><text x="23" y="24" fill="#07090d" font-size="11" font-weight="800" text-anchor="middle">OLT</text>';
      g += '<text x="14" y="62" fill="#2bd18b" font-size="11" font-weight="800">' + (I.feed ? Math.max(1, I.fdb.nsplit || 1) + '/' + I.feed.core : String(Math.max(1, I.fdb.nsplit || 1))) + '</text>';
      // strands to the building
      for (let k = 0; k < n; k++) {
        const y1 = n === 1 ? y0 + 36 : y0 + 24 + k * ((bh - 34) / (n - 1)), y2 = gy - 14 - k * (n === 1 ? 0 : Math.min(8, 70 / n)), col = FT.FIBER_COLORS[k % 12].hex, on = k < I.used;
        g += '<path d="M' + (x0 + bw - 8) + ' ' + y1 + ' L' + (x0 + bw) + ' ' + y1 + ' C128 ' + y1 + ' 150 ' + y2 + ' ' + bx + ' ' + y2 + '" fill="none" stroke="' + col + '" stroke-width="' + (on ? 3 : 2) + '" stroke-linecap="round"' + (on ? '' : ' stroke-dasharray="4 4" opacity=".45"') + '/>';
        g += '<circle cx="' + bx + '" cy="' + y2 + '" r="' + (on ? 4.2 : 3) + '" fill="' + (on ? col : '#0b0e14') + '" stroke="' + col + '" stroke-width="1.6"' + (on ? '' : ' opacity=".6"') + '/>';
      }
      g += '<text x="' + (x0 + bw + 52) + '" y="' + (y0 - 8) + '" fill="#eceff6" font-size="13" font-weight="800" text-anchor="middle">' + I.used + ' / ' + I.ports + '</text>';
    } else {
      g += '<rect x="14" y="84" width="60" height="74" rx="8" fill="none" stroke="#ff4f7a" stroke-width="2" stroke-dasharray="6 5" opacity=".55"/><text x="44" y="116" fill="#ff4f7a" font-size="12" font-weight="800" text-anchor="middle" opacity=".7">FDB</text><text x="44" y="142" fill="#ff4f7a" font-size="22" font-weight="800" text-anchor="middle" opacity=".7">?</text>';
      g += '<path d="M74 121 C120 121 150 ' + (gy - 14) + ' ' + bx + ' ' + (gy - 14) + '" fill="none" stroke="#5d667d" stroke-width="2" stroke-dasharray="5 5"/><g stroke="#ff4f7a" stroke-width="3.2" stroke-linecap="round"><path d="M122 ' + (gy - 36) + ' l14 14 M136 ' + (gy - 36) + ' l-14 14"/></g>';
      if (I.near) g += '<circle cx="24" cy="' + (gy - 8) + '" r="9" fill="#171b25" stroke="' + (FT.NODE_TYPES[I.near.type] || {}).color + '" stroke-width="2.4"/><text x="24" y="' + (gy + 5) + '" fill="#9aa1b6" font-size="9" text-anchor="middle" font-weight="700">' + esc((FT.NODE_TYPES[I.near.type] || {}).short || '') + '</text>';
    }
    return g + '</svg>';
  };
  DG.caption = function (id) {
    const I = DG.info(id), ar = FT.lang === 'ar', ln = [];
    if (I.fdb) {
      ln.push((ar ? 'العلبة: ' : 'Box: ') + (I.fdb.code || I.fdb.name) + (I.fdb.ratio ? ' · ' + I.fdb.ratio : ''));
      ln.push((ar ? 'منافذ مستعملة: ' : 'Ports used: ') + I.used + ' / ' + I.ports + (I.boxes > 1 ? (ar ? ' · ' + I.boxes + ' علب' : ' · ' + I.boxes + ' boxes') : '') + (I.feed ? ' · ' + (ar ? 'كبل التغذية ' : 'feed cable ') + I.feed.core + 'C' : ''));
      ln.push((ar ? 'الشقق: ' : 'Flats: ') + I.flats + (I.flatsKnown ? '' : (ar ? ' (مقدّر)' : ' (estimated)')) + (I.ports < I.flats ? (ar ? ' — المنافذ ما بتكفّي' : ' — not enough ports') : ''));
    } else ln.push(I.near ? (ar ? 'غير موصول — أقرب عقدة ' + I.near.name + ' على بعد ' + Math.round(I.dist) + ' م' : 'Not connected — nearest ' + I.near.name + ' at ' + Math.round(I.dist) + ' m') : (ar ? 'غير موصول — لا توجد علبة FDB قريبة' : 'Not connected — no FDB nearby'));
    return ln;
  };
})(window);
