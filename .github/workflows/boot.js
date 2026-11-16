/* BrowOS startup loader. It loads the app (app.html), or the update zip you installed in Settings > App update. */
(function () {
  window.__NATIVE_BUILT = 5;
  if (window.__bootDone) return;
  window.__bootDone = 1;
  var LS = null, update = null, sig = '';
  try { LS = window.localStorage; } catch (e) {}
  function dropUpdate(v) {
    try { LS.removeItem('browos.update2'); LS.removeItem('browos.updTry'); if (v) LS.setItem('browos.updFailed', String(v)); } catch (e) {}
  }
  try {
    if (LS) {
      LS.removeItem('browos.update');            // an older update format that could freeze the loading screen
      var raw = LS.getItem('browos.update2');
      if (raw) {
        var u = JSON.parse(raw);
        sig = u.v + ':' + u.t;
        if (LS.getItem('browos.updTry') === sig) dropUpdate(u.v);   // last start with this update never finished
        else if (u && u.html) {
          update = u; LS.setItem('browos.updTry', sig); window.__BOOT_UPDATE = u.v;
          setTimeout(function () { if (LS.getItem('browos.updTry') === sig) { dropUpdate(u.v); location.reload(); } }, 12000);
        }
      }
    }
  } catch (e) { dropUpdate(''); update = null; }
  function fail(msg) {
    if (update) { dropUpdate(update.v); location.reload(); return; }
    document.body.textContent = 'BrowOS could not start: ' + msg;
  }
  function run(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var scripts = [].slice.call(doc.querySelectorAll('script'));
    scripts.forEach(function (s) { s.parentNode.removeChild(s); });
    [].slice.call(doc.head.querySelectorAll('style,link[rel=stylesheet]')).forEach(function (n) { document.head.appendChild(document.importNode(n, true)); });
    document.body.innerHTML = doc.body.innerHTML;
    var i = 0;
    (function next() {
      if (i >= scripts.length) return;
      var s = scripts[i++], n = document.createElement('script'), src = s.getAttribute('src');
      if (src) { n.async = false; n.onload = next; n.onerror = function () { fail('could not load ' + src); }; n.src = src; document.body.appendChild(n); }
      else { n.textContent = s.textContent; document.body.appendChild(n); next(); }
    })();
  }
  function ready(f) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', f); else f(); }
  ready(function () {
    try {
      if (update) run(update.html);
      else fetch('app.html').then(function (r) { if (!r.ok) throw new Error('app.html ' + r.status); return r.text(); }).then(run).catch(function (e) { fail(e.message); });
    } catch (e) { fail(e.message); }
  });
})();
