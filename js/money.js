/* Currencies: every price in a project is kept in the project's own currency. The built-in starting prices are US-dollar estimates and
   are converted with the project's exchange rate, which the user can edit (the riyal is pegged to the dollar; the euro rate moves). */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  FT.CURRENCIES = {
    USD: { code: 'USD', sym: '$', rate: 1, ar: 'دولار أمريكي', en: 'US dollar' },
    EUR: { code: 'EUR', sym: '€', rate: 0.86, ar: 'يورو', en: 'Euro' },
    SAR: { code: 'SAR', sym: 'SAR', rate: 3.75, ar: 'ريال سعودي', en: 'Saudi riyal' },
  };
  const saved = () => (FT.state.cfg && FT.state.cfg.money) || {};
  FT.cur = () => (FT.CURRENCIES[saved().cur] ? saved().cur : 'USD');
  FT.rate = code => { if (code === 'USD') return 1; const r = saved().rates && +saved().rates[code]; return r > 0 ? r : FT.CURRENCIES[code].rate; };
  FT.priceBook = () => (FT.state.cfg && FT.state.cfg.prices) || FT.state.prices || null;
  FT.hasPrices = () => !!FT.priceBook();
  const round = v => Math.round(v * 10000) / 10000;
  FT.scalePrices = function (book, k) { const out = {}; Object.keys(book || {}).forEach(key => { const v = book[key]; out[key] = v && typeof v === 'object' ? FT.scalePrices(v, k) : round((+v || 0) * k); }); return out; };
  FT.prices = function () {
    const D = FT.scalePrices(FT.DEFAULT_PRICES, FT.rate(FT.cur())), P = FT.priceBook() || {}, out = {};
    Object.keys(D).forEach(k => { out[k] = typeof D[k] === 'object' ? Object.assign({}, D[k], P[k] || {}) : (P[k] != null ? P[k] : D[k]); });
    return out;
  };
  // plain text for reports and files; FT.money adds the left-to-right isolate for use inside Arabic screens
  FT.moneyPlain = function (v, code) {
    const c = FT.CURRENCIES[code || FT.cur()], n = (Math.round((+v || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c.sym.length === 1 ? c.sym + n : n + ' ' + c.sym;
  };
  FT.money = (v, code) => FT.lt(FT.moneyPlain(v, code));
  FT.setMoney = function (cur, rates, book) {
    FT.state.cfg = FT.state.cfg || {};
    FT.state.cfg.money = { cur, rates: Object.assign({}, rates) };
    if (book) { FT.state.cfg.prices = book; delete FT.state.prices; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
