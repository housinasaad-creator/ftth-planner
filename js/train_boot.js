/* Training sandbox. Loaded before everything else. With ?train=1 the page works on a throw-away copy of the browser
   storage and never contacts the team server: nothing done in training can reach a real project or the saved settings. */
(function (G) {
  'use strict';
  const on = /[?&]train=1\b/.test(location.search);
  G.FT_TRAIN = on;
  if (!on) return;
  const P = Storage.prototype, real = { get: P.getItem, set: P.setItem, del: P.removeItem, clear: P.clear };
  const mem = new Map(), readThrough = { ft2_theme: 1, ft2_lang: 1 }; // the chosen look and language are the only real values training reads
  const mine = s => s === G.localStorage;
  P.getItem = function (k) { if (!mine(this)) return real.get.call(this, k); if (mem.has(k)) return mem.get(k); return readThrough[k] ? real.get.call(this, k) : null; };
  P.setItem = function (k, v) { if (!mine(this)) return real.set.call(this, k, v); mem.set(String(k), String(v)); };
  P.removeItem = function (k) { if (!mine(this)) return real.del.call(this, k); mem.set(String(k), null); };
  P.clear = function () { if (!mine(this)) return real.clear.call(this); mem.clear(); };
  // the single value training keeps for real: where the trainee stopped
  G.FT_TRAIN_STORE = {
    get: () => { try { return JSON.parse(real.get.call(G.localStorage, 'ft2_train')); } catch (e) { return null; } },
    set: v => { try { real.set.call(G.localStorage, 'ft2_train', JSON.stringify(v)); } catch (e) { } },
    del: () => { try { real.del.call(G.localStorage, 'ft2_train'); } catch (e) { } },
  };
  const SERVER = /supabase\.co|\/rest\/v1\//i, f = G.fetch.bind(G);
  G.fetch = (u, o) => SERVER.test(String((u && u.url) || u)) ? Promise.reject(new TypeError('training: the server is never contacted')) : f(u, o);
  const WS = G.WebSocket;
  if (WS) { const Guard = function (url, p) { if (SERVER.test(String(url))) throw new Error('training: the server is never contacted'); return p === undefined ? new WS(url) : new WS(url, p); }; Guard.prototype = WS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => Guard[k] = WS[k]); G.WebSocket = Guard; }
})(window);
