/* The training neighbourhood: an invented quarter on empty ground, with its own streets and twenty houses (two of the
   twenty are left as empty lots that the trainee adds himself). All positions are metres east / north of one centre. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const W = FT.trainWorld = {};
  const C = W.C = [37.2, 34.6], KX = Math.cos(C[1] * Math.PI / 180) * 111320, KY = 110540;
  const ll = W.ll = (x, y) => [+(C[0] + x / KX).toFixed(7), +(C[1] + y / KY).toFixed(7)];

  const STREETS = [
    ['شارع المدرسة', 'School Street', [[-150, 0], [-110, 0], [0, 0], [110, 0], [150, 0]]],
    ['شارع الياسمين', 'Jasmine Street', [[-110, 62], [0, 62], [110, 62]]],
    ['شارع النبع', 'Spring Street', [[-110, 0], [-110, 62]]],
    ['شارع الساحة', 'Square Street', [[0, 0], [0, 62]]],
    ['شارع الكرم', 'Vineyard Street', [[110, 0], [110, 62]]],
  ];
  W.streets = () => STREETS.map(([ar, en, pts]) => ({ type: 'Feature', properties: { class: 'minor', ar, en, name: FT.lang === 'en' ? en : ar }, geometry: { type: 'LineString', coordinates: pts.map(p => ll(p[0], p[1])) } }));

  // houses: [key, centre x, centre y, icon y] — the icon stands on the side that faces the street
  const HOUSES = [];
  [-90, -68, -46, -24].forEach((x, i) => HOUSES.push(['a' + (i + 1), x, 16, 12.5]));
  [-90, -68, -46, -24].forEach((x, i) => HOUSES.push(['a' + (i + 5), x, 46, 49.5]));
  [22, 44, 66, 88].forEach((x, i) => HOUSES.push(['b' + (i + 1), x, 16, 12.5]));
  [22, 44, 66, 88].forEach((x, i) => HOUSES.push(['b' + (i + 5), x, 46, 49.5]));
  [-66, -38].forEach((x, i) => HOUSES.push(['c' + (i + 1), x, -17, -13.5]));
  const HW = 6.5, HH = 5.5;
  const rect = (x, y, w, h) => [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
  const FLOORS = { a2: 3, a4: 1, a6: 3, a7: 4, b2: 3, b3: 1, b6: 3, b8: 4, c2: 3 };

  // everything the lessons point at
  const P = W.P = {
    // the two empty lots
    lot1: ll(18, -14), lot2: ll(48, -17), lot2ring: rect(48, -17, HW, HH).map(p => ll(p[0], p[1])),
    // the cabinets, chambers and boxes of the hand-made part
    olt: ll(-134, 0), mh1: ll(-110, 0), hh1: ll(-80, 0), fdc: ll(-57, 0), mh2: ll(0, 0),
    pole1: ll(-86, 62), pole2: ll(-44, 62), idfc: ll(-16, 62),
    fdb1: ll(-79.5, 10), fdb2: ll(-35, 10),
  };
  W.ring = pts => pts.map(p => ll(p[0], p[1]));
  W.areaNorth = W.ring([[-103, 4], [103, 4], [103, 58], [-103, 58]]);   // the sixteen northern houses
  W.areaEast = W.ring([[6, 4], [104, 4], [104, 58], [6, 58]]);          // the eight eastern houses (automatic design)
  W.areaAll = W.ring([[-146, -30], [122, -30], [122, 70], [-146, 70]]);
  W.house = {}; HOUSES.forEach(([k, x, , iy]) => { W.house[k] = { id: 'tr_' + k, ll: ll(x, iy) }; });
  W.lotOutline = which => { const r = which === 1 ? rect(18, -17, HW, HH).map(p => ll(p[0], p[1])) : P.lot2ring; return r.concat([r[0]]); };

  W.state = function () {
    const st = FT.blank(); st.meta = { name: FT.lang === 'en' ? 'Training project' : 'مشروع التدريب', type: 'gpon', created: Date.now() };
    HOUSES.forEach(([k, x, y]) => { st.bld['tr_' + k] = { custom: 1, fp: rect(x, y, HW, HH).map(p => ll(p[0], p[1])), pt: W.house[k].ll.slice(), floors: FLOORS[k] || 2 }; });
    return st;
  };
})(window);
