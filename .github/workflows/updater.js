/* BrowOS updater: reads the BrowOS zip you choose, checks it, and installs it as the running app. */
(function () {
  const OS = typeof window !== 'undefined' ? window.BrowOS : null;
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('That is not a zip file.');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The zip is damaged.');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const ln = dv.getUint16(lho + 26, true), lx = dv.getUint16(lho + 28, true), start = lho + 30 + ln + lx, data = u8.subarray(start, start + csize);
      if (method === 0) out[name] = data;
      else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    return out;
  }
  function build(files) {
    const names = Object.keys(files);
    const idx = names.find(n => /(^|\/)www\/app\.html$/.test(n)) || names.find(n => /(^|\/)www\/index\.html$/.test(n)) || names.find(n => /(^|\/)index\.html$/.test(n));
    if (!idx) throw new Error('This zip has no www/app.html. Choose the BrowOS zip.');
    const page = /app\.html$/.test(idx) ? 'app.html' : 'index.html', base = idx.slice(0, idx.length - page.length), root = base.replace(/www\/$/, '');
    const text = n => { const f = files[base + n]; if (!f) throw new Error('The zip is missing ' + n); return new TextDecoder().decode(f); };
    let html = text(page);
    html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, src) => /(^|\/)boot\.js$/.test(src) ? '' : '<script>' + text(src).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--') + '</script>');
    html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g, (m, href) => '<style>' + text(href) + '</style>');
    if (!/BrowOS\.start/.test(html) || !/window\.BrowOS/.test(html)) throw new Error('This zip does not look like BrowOS.');
    const v = /VERSION = '([\d.]+)'/.exec(text('js/os.js')), nf = files[root + 'android-patch/NATIVE_VERSION'];
    return { html, version: v ? v[1] : 'unknown', native: nf ? parseInt(new TextDecoder().decode(nf), 10) || 0 : 0 };
  }
  /* Version library: keeps up to 3 installed zips so you can switch between them. */
  const LIBK = 'browos.vers', vk = v => 'browos.ver.' + v, MAXV = 3;
  const libList = () => { try { return JSON.parse(localStorage.getItem(LIBK) || '[]'); } catch (e) { return []; } };
  function adopt() {
    try { const raw = localStorage.getItem('browos.update2'); if (!raw) return; const u = JSON.parse(raw), l = libList(); if (!l.some(x => x.v === u.v)) { localStorage.setItem(vk(u.v), raw); l.push({ v: u.v, t: u.t }); localStorage.setItem(LIBK, JSON.stringify(l)); } } catch (e) {}
  }
  function store(r) {
    adopt(); const l = libList().filter(x => x.v !== r.version), t = Date.now();
    while (l.length >= MAXV) { const old = l.shift(); localStorage.removeItem(vk(old.v)); }
    localStorage.setItem(vk(r.version), JSON.stringify({ v: r.version, t, html: r.html })); l.push({ v: r.version, t }); localStorage.setItem(LIBK, JSON.stringify(l));
  }
  function activate(v) {
    localStorage.removeItem('browos.updTry'); localStorage.removeItem('browos.updFailed');
    if (!v || v === 'builtin') { localStorage.removeItem('browos.update2'); return; }
    const raw = localStorage.getItem(vk(v)); if (!raw) throw new Error('That version is no longer saved.');
    const u = JSON.parse(raw); localStorage.setItem('browos.update2', JSON.stringify({ v: u.v, t: Date.now(), html: u.html }));
  }
  function remove(v) {
    try { const a = JSON.parse(localStorage.getItem('browos.update2') || 'null'); if (a && a.v === v) activate('builtin'); } catch (e) {}
    localStorage.removeItem(vk(v)); localStorage.setItem(LIBK, JSON.stringify(libList().filter(x => x.v !== v)));
  }
  const list = () => { adopt(); return libList(); };
  async function install(file) {
    const r = build(await unzip(await file.arrayBuffer()));
    if (r.html.length > 3500000) throw new Error('The update is too large.');
    try { store(r); activate(r.version); } catch (e) { throw new Error('Not enough storage space for the update. Delete an old saved version in Settings > App update and try again.'); }
    return { version: r.version, native: r.native };
  }
  if (OS) OS.updater = { unzip, build, install, list, activate, remove };
  if (typeof module !== 'undefined') module.exports = { unzip, build, install };
})();
