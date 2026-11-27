/* Direct PDF download, no print window and no outside library: every report page (a fixed A4 box of HTML) is drawn by the
   browser itself, so Arabic letters join and the fonts stay exact, then placed as a sharp picture on an A4 page of a PDF
   written here. */
(function (G) {
  'use strict';
  const FT = G.FT = G.FT || {};
  const P = FT.pdf = {};
  P.W = 794; P.H = 1123; // A4 at 96 dpi
  const toB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const dataUrl = async (url, mime) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return 'data:' + mime + ';base64,' + toB64(await r.arrayBuffer()); };
  let fontCss = null;
  // pictures drawn from HTML cannot load files, so the fonts travel inside them
  P.fonts = async function () {
    if (fontCss) return fontCss;
    const ar = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F', lat = 'U+0000-024F,U+2000-206F,U+20A0-20CF,U+2190-21FF,U+2200-22FF';
    const out = [];
    for (const w of [400, 500, 700]) for (const [sub, rng] of [['arabic', ar], ['latin', lat]]) {
      try { out.push("@font-face{font-family:'RPlex';font-weight:" + w + ';src:url(' + (await dataUrl('fonts/ibm-plex-sans-arabic-' + w + '-' + sub + '.woff2', 'font/woff2')) + ") format('woff2');unicode-range:" + rng + '}'); } catch (e) { console.warn(e); }
    }
    return (fontCss = out.join(''));
  };
  P.image = url => dataUrl(url, 'image/png').catch(() => '');
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('page picture failed')); im.src = src; });
  // one page (inner HTML of the A4 box) -> JPEG bytes
  P.render = async function (inner, css, dir, scale) {
    const holder = document.implementation.createHTMLDocument('p'), box = holder.createElement('div');
    box.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); box.setAttribute('dir', dir || 'rtl'); box.className = 'page'; box.innerHTML = '<style>' + css + '</style>' + inner;
    const xml = new XMLSerializer().serializeToString(box), s = scale || 2;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.W * s + '" height="' + P.H * s + '" viewBox="0 0 ' + P.W + ' ' + P.H + '"><foreignObject x="0" y="0" width="' + P.W + '" height="' + P.H + '">' + xml + '</foreignObject></svg>';
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    let im = await load(url); try { await im.decode(); } catch (e) { }
    // fonts inside the picture are ready only after it has been laid out once
    await new Promise(r => setTimeout(r, 30)); im = await load(url);
    const cv = document.createElement('canvas'); cv.width = P.W * s; cv.height = P.H * s; const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
    const bin = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { jpg: out, w: cv.width, h: cv.height };
  };
  // pictures -> a PDF file (one full A4 page each)
  P.build = function (pages, title) {
    const enc = new TextEncoder(), parts = [], offs = []; let at = 0;
    const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); at += b.length; };
    const obj = (n, body) => { offs[n] = at; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); };
    put('%PDF-1.5\n'); put(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const hex = s => '<FEFF' + Array.from(String(s)).map(c => { const u = c.codePointAt(0); return u > 0xffff ? '003F' : u.toString(16).padStart(4, '0'); }).join('').toUpperCase() + '>';
    obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => put('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (4 + i * 3) + ' 0 R').join(' ') + '] >>'));
    obj(3, () => put('<< /Title ' + hex(title || 'FTTH report') + ' /Producer (FTTH Planner) >>'));
    pages.forEach((pg, i) => {
      const n = 4 + i * 3, content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      obj(n, () => put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ' + (n + 2) + ' 0 R >> >> /Contents ' + (n + 1) + ' 0 R >>'));
      obj(n + 1, () => put('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'));
      obj(n + 2, () => { put('<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpg.length + ' >>\nstream\n'); put(pg.jpg); put('\nendstream'); });
    });
    const count = 4 + pages.length * 3, xref = at;
    put('xref\n0 ' + count + '\n0000000000 65535 f \n'); for (let i = 1; i < count; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    put('trailer\n<< /Size ' + count + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  };
})(window);
