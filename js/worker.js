/* Background worker: street graph + auto-design planning run here, on another CPU thread, so the map and the panels never freeze.
   It lives inside the same browser tab on the same computer (no server, no network). It only computes: it never touches the screen. */
self.window = self;
importScripts('model.js', 'roads.js', 'design.js');
const FT = self.FT;
self.onmessage = e => {
  const m = e.data;
  try {
    if (m.t === 'load') { // raw street lines + building footprints from the main page -> graph
      FT.roads._lines = m.lines; FT.roads._blds = m.blds; FT.roads.on = m.on; FT.roads.dirty = true;
      const g = FT.roads.build(); self.postMessage({ id: m.id, t: 'loaded', nodes: g ? g.nodes.length : 0 });
    } else if (m.t === 'plan') {
      FT.roads.on = m.on; const plan = FT.design.plan(m.blds, m.olt, m.opt); self.postMessage({ id: m.id, t: 'plan', plan });
    }
  } catch (err) { self.postMessage({ id: m.id, err: String(err && err.stack || err) }); }
};
