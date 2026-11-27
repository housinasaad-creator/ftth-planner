/* Coverage of a radio base station (AP): the sector it can reach with the planned client unit, and a received-signal heat map.
   Free-space loss + antenna roll-off off the main direction + terrain (blocked line of sight or an intruded Fresnel zone).
   A planning estimate: buildings and trees are not in the terrain data. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const W = FT.wl, C = FT.cov = {};
  const ar = () => FT.lang === 'ar', tx = (a, e) => ar() ? a : e;
  const S = () => FT.state;
  C.FADE = 10; C.MAX_KM = 15;
  C.SCALE = [[-55, '#1fbf6b', 'ممتازة', 'excellent'], [-63, '#8fd13a', 'قوية', 'strong'], [-70, '#ffd21f', 'جيدة', 'good'], [-76, '#ff9f1c', 'مقبولة', 'fair'], [-200, '#ef4444', 'ضعيفة', 'weak']];
  C.params = d => ({ az: d.az == null ? 0 : +d.az, bw: Math.max(10, Math.min(360, d.bw == null ? 90 : +d.bw)), cpeGain: d.cpeGain == null ? W.DEF.cpe.gain : +d.cpeGain, cpeH: d.cpeH == null ? W.DEF.cpe.h : +d.cpeH, cpeSens: d.cpeSens == null ? W.DEF.cpe.rxs : +d.cpeSens });
  // how far the signal stays above the client's sensitivity with the fade margin
  C.rangeKm = function (d) {
    const p = C.params(d), f = d.freq || 5.8, maxLoss = d.txp + d.gain + p.cpeGain - 2 - (p.cpeSens + C.FADE);
    return Math.min(C.MAX_KM, Math.pow(10, (maxLoss - 32.44 - 20 * Math.log10(f * 1000)) / 20));
  };
  const move = (ll, km, brg) => { const r = brg * Math.PI / 180; return [ll[0] + km * 1000 * Math.sin(r) / (111320 * Math.cos(ll[1] * Math.PI / 180)), ll[1] + km * 1000 * Math.cos(r) / 110540]; };
  C.sector = function (d) {
    const p = C.params(d), R = C.rangeKm(d), ring = [];
    if (p.bw < 360) ring.push(d.ll);
    for (let i = 0; i <= 48; i++) ring.push(move(d.ll, R, p.az - p.bw / 2 + p.bw * i / 48));
    ring.push(ring[0]); return ring;
  };
  // received level at a point (without terrain): used by the map and by the check
  C.levelAt = function (d, ll) {
    const p = C.params(d), km = FT.dist(d.ll, ll) / 1000, kx = Math.cos(d.ll[1] * Math.PI / 180);
    const brg = (Math.atan2((ll[0] - d.ll[0]) * kx, ll[1] - d.ll[1]) * 180 / Math.PI + 360) % 360;
    let off = Math.abs(((brg - p.az + 540) % 360) - 180);
    if (p.bw < 360 && off > p.bw / 2 + 1e-9) return null;
    const roll = p.bw < 360 ? 3 * Math.pow(off / (p.bw / 2), 2) : 0;
    return d.txp + d.gain + p.cpeGain - 2 - W.fspl(km, d.freq || 5.8) - roll;
  };
  C.colorOf = rx => C.SCALE.find(s => rx >= s[0])[1];

  async function terrain(bb, n) { // heights on an n x n grid over the box (one fetch of the covering tiles, then read from memory)
    const g = new Float32Array(n * n); let missing = 0;
    for (let j = 0; j < n; j++) { const lat = bb[3] - (bb[3] - bb[1]) * j / (n - 1); const row = []; for (let i = 0; i < n; i++) row.push(W.elev(bb[0] + (bb[2] - bb[0]) * i / (n - 1), lat)); const v = await Promise.all(row); v.forEach((e, i) => { if (e == null) missing++; g[j * n + i] = e == null ? 0 : e; }); }
    return { g, n, bb, ok: missing < n * n * 0.2 };
  }
  const high = (t, ll) => { const x = Math.max(0, Math.min(t.n - 1, Math.round((ll[0] - t.bb[0]) / (t.bb[2] - t.bb[0]) * (t.n - 1)))), y = Math.max(0, Math.min(t.n - 1, Math.round((t.bb[3] - ll[1]) / (t.bb[3] - t.bb[1]) * (t.n - 1)))); return t.g[y * t.n + x]; };

  C.compute = async function (d, size) {
    const ring = C.sector(d), bb = FT.bboxOf(ring.concat([d.ll])), n = size || 180, p = C.params(d), f = d.freq || 5.8;
    const t = await terrain(bb, 90), cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d');
    const hA = high(t, d.ll) + d.h, R = C.rangeKm(d), stats = { cells: 0, usable: 0, blocked: 0, bands: C.SCALE.map(() => 0) };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const ll = [bb[0] + (bb[2] - bb[0]) * (i + 0.5) / n, bb[3] - (bb[3] - bb[1]) * (j + 0.5) / n], km = FT.dist(d.ll, ll) / 1000; if (km > R) continue;
      let rx = C.levelAt(d, ll); if (rx == null) continue;
      if (t.ok && km > 0.05) { // line of sight to a client unit standing there
        const hB = high(t, ll) + p.cpeH; let worst = 0;
        for (let k = 1; k < 20; k++) { const u = k / 20, q = [d.ll[0] + (ll[0] - d.ll[0]) * u, d.ll[1] + (ll[1] - d.ll[1]) * u], d1 = km * u, d2 = km - d1, ground = high(t, q) + d1 * d2 / (12.74 * 4 / 3), los = hA + (hB - hA) * u, r1 = 17.31 * Math.sqrt(d1 * d2 / (f * km)); if (ground > los) { worst = 2; break; } if (ground > los - 0.6 * r1) worst = 1; }
        if (worst === 2) { rx -= 24; stats.blocked++; } else if (worst === 1) rx -= 6;
      }
      stats.cells++; if (rx < p.cpeSens) continue; stats.usable++;
      const k = C.SCALE.findIndex(s => rx >= s[0]); stats.bands[k]++;
      g.fillStyle = C.SCALE[k][1]; g.fillRect(i, j, 1, 1);
    }
    return { id: d.id, url: cv.toDataURL(), bb, ring, range: R, stats, terrain: t.ok };
  };

  C.cache = {};
  const keyOf = d => JSON.stringify([d.ll, d.txp, d.gain, d.h, d.freq, C.params(d)]);
  C.render = function () {
    const M = FT.map; if (!M || !M.ready || !M.map.getSource('wd')) return; const map = M.map;
    if (!map.getSource('cov-sec')) {
      map.addSource('cov-sec', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'cov-fill', type: 'fill', source: 'cov-sec', paint: { 'fill-color': '#35e0c9', 'fill-opacity': 0.07 } }, 'wl-line');
      map.addLayer({ id: 'cov-line', type: 'line', source: 'cov-sec', paint: { 'line-color': '#35e0c9', 'line-width': 1.8, 'line-dasharray': [3, 2] } }, 'wl-line');
    }
    const aps = Object.values(S().wdev || {}).filter(d => d.type === 'ap'), shown = aps.filter(d => d.cov || d.heat);
    map.getSource('cov-sec').setData({ type: 'FeatureCollection', features: shown.map(d => ({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'Polygon', coordinates: [C.sector(d)] } })) });
    Object.keys(C.cache).forEach(id => { const d = (S().wdev || {})[id]; if (d && d.heat) return; if (map.getLayer('heat-' + id)) map.removeLayer('heat-' + id); if (map.getSource('heat-' + id)) map.removeSource('heat-' + id); delete C.cache[id]; });
    aps.filter(d => d.heat).forEach(d => {
      const key = keyOf(d); if (C.cache[d.id] && C.cache[d.id].key === key) return;
      C.cache[d.id] = { key };
      C.compute(d).then(r => {
        if (!C.cache[d.id] || C.cache[d.id].key !== key || !(S().wdev[d.id] || {}).heat) return;
        const id = 'heat-' + d.id, coords = [[r.bb[0], r.bb[3]], [r.bb[2], r.bb[3]], [r.bb[2], r.bb[1]], [r.bb[0], r.bb[1]]];
        if (map.getSource(id)) map.getSource(id).updateImage({ url: r.url, coordinates: coords }); else { map.addSource(id, { type: 'image', url: r.url, coordinates: coords }); map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0.55, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, 'cov-fill'); }
        C.cache[d.id] = Object.assign(r, { key }); if (FT.T.sel && FT.T.sel.kind === 'wdev' && FT.T.sel.id === d.id) FT.UI.renderPanel();
      });
    });
  };
  const draw = W.render;
  W.render = function () { draw(); C.render(); };

  // extra settings and buttons in the properties of an access point
  const prop = W.propDev;
  W.propDev = function (body, id) {
    prop(body, id); const d = S().wdev[id]; if (!d || d.type !== 'ap') return;
    const p = C.params(d), r = C.cache[id], field = (l, k, v) => '<div class="f"><label>' + l + '</label><input data-cov="' + k + '" value="' + v + '"></div>';
    const legend = C.SCALE.map((s, i) => '<span><i style="background:' + s[1] + '"></i>' + tx(s[2], s[3]) + (r && r.stats && r.stats.usable ? ' ' + Math.round(r.stats.bands[i] / r.stats.usable * 100) + '%' : '') + '</span>').join('');
    const box = document.createElement('div');
    box.innerHTML = '<h4 class="fx-h">' + tx('التغطية', 'Coverage') + '</h4><div class="two">' + field(tx('اتجاه الهوائي (درجة من الشمال)', 'Azimuth (° from north)'), 'az', p.az) + field(tx('زاوية القطاع (درجة)', 'Beam width (°)'), 'bw', p.bw) + '</div><div class="two">' + field(tx('ربح هوائي المشترك (dBi)', 'Client gain (dBi)'), 'cpeGain', p.cpeGain) + field(tx('ارتفاع المشترك (م)', 'Client height (m)'), 'cpeH', p.cpeH) + '</div>' +
      '<div class="kv"><span>' + tx('المدى المقدّر (هامش ' + C.FADE + ' dB)', 'Estimated range') + '</span><b>' + FT.lt(C.rangeKm(d).toFixed(2) + ' km') + '</b></div>' +
      '<div style="display:grid;gap:6px;margin:6px 0"><button type="button" class="btn full' + (d.cov ? ' pri' : '') + '" id="covSec">' + (d.cov ? tx('إخفاء مجال التغطية', 'Hide the sector') : tx('اعرض مجال التغطية', 'Show the sector')) + '</button><button type="button" class="btn full' + (d.heat ? ' pri' : '') + '" id="covHeat">' + (d.heat ? tx('إخفاء خريطة قوة الإشارة', 'Hide the signal map') : tx('خريطة قوة الإشارة', 'Signal heat map')) + '</button></div>' +
      (d.heat ? (r && r.stats ? '<div class="cov-leg">' + legend + '</div><div class="kv"><span>' + tx('محجوبة بالتضاريس', 'Hidden by terrain') + '</span><b>' + (r.stats.cells ? Math.round(r.stats.blocked / r.stats.cells * 100) : 0) + '%</b></div>' + (r.terrain ? '' : '<div class="warnbox">' + tx('ما وصلت بيانات التضاريس: الخريطة بدون حساب الحجب.', 'No terrain data: obstruction not computed.') + '</div>') + '<p class="d">' + tx('تقدير تخطيطي: المباني والأشجار مو داخلة بالحساب.', 'Planning estimate: buildings and trees are not included.') + '</p>' : '<p class="d">' + tx('عم تنحسب…', 'Computing…') + '</p>') : '');
    body.insertBefore(box, body.querySelector('#pDel'));
    box.querySelectorAll('[data-cov]').forEach(i => i.onchange = () => { const v = parseFloat(String(i.value).replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))); if (isNaN(v)) return; FT.commit(); d[i.dataset.cov] = i.dataset.cov === 'az' ? ((v % 360) + 360) % 360 : v; FT.changed('prop'); W.render(); FT.UI.renderPanel(); });
    const toggle = k => { FT.commit(); d[k] = !d[k]; FT.changed('prop'); W.render(); FT.UI.renderPanel(); };
    box.querySelector('#covSec').onclick = () => toggle('cov'); box.querySelector('#covHeat').onclick = () => toggle('heat');
  };
  // the direction a unit must be aimed to see its partner (for the installer and the report)
  C.bearing = (a, b) => { const kx = Math.cos(a[1] * Math.PI / 180); return (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180 / Math.PI + 360) % 360; };
})(window);
