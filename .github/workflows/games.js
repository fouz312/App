/* BrowGames part 1: hub, helpers and chess. Original games inspired by popular game styles. Not affiliated with any game company. */
(function () {
  const OS = window.BrowOS, esc = OS.esc;
  const R = (a, b) => a + Math.random() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1)), clamp = (v, a, b) => Math.max(a, Math.min(b, v)), dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const both = (...f) => () => f.forEach(x => x && x());
  const lib = { R, RI, clamp, dist, both };
  function mk(box) { const cv = document.createElement('canvas'); cv.width = Math.max(300, box.clientWidth || 360); cv.height = Math.max(240, box.clientHeight || 420); cv.className = 'gcv'; box.append(cv); lib.lastCanvas = cv; return cv; }
  function run(update, draw) {
    let last = null, raf, dead = false;
    const f = t => { if (dead) return; if (last === null) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); draw(); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => { dead = true; cancelAnimationFrame(raf); };
  }
  function ctl(box, labels) {
    const s = { dx: 0, dy: 0, a: 0, b: 0, c: 0 }, keys = {};
    box.insertAdjacentHTML('beforeend', `<div class="gpad"><div class="gstick"><i></i></div><div class="gbtns">${labels[2] ? `<button data-k="c">${labels[2]}</button>` : ''}<button data-k="b">${labels[1] || 'B'}</button><button data-k="a">${labels[0] || 'A'}</button></div></div>`);
    const st = box.querySelector('.gstick'), knob = st.firstChild; let id = null, ox = 0, oy = 0;
    const mv = e => { const x = e.clientX - ox, y = e.clientY - oy, d = Math.hypot(x, y) || 1, m = Math.min(1, d / 40); s.dx = x / d * m; s.dy = y / d * m; knob.style.transform = `translate(${s.dx * 30}px,${s.dy * 30}px)`; };
    st.addEventListener('pointerdown', e => { id = e.pointerId; if (st.setPointerCapture) st.setPointerCapture(e.pointerId); const r = st.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; mv(e); });
    st.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
    const up = e => { if (e.pointerId === id) { id = null; s.dx = s.dy = 0; knob.style.transform = ''; } };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    box.querySelectorAll('[data-k]').forEach(b => { b.addEventListener('pointerdown', e => { s[b.dataset.k] = 1; if (e.preventDefault) e.preventDefault(); }); const off = () => { s[b.dataset.k] = 0; }; ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => b.addEventListener(t, off)); });
    const kd = e => { keys[(e.key || '').toLowerCase()] = 1; }, ku = e => { delete keys[(e.key || '').toLowerCase()]; };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
    s.X = () => Math.abs(s.dx) > 0.05 ? s.dx : (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    s.Y = () => Math.abs(s.dy) > 0.05 ? s.dy : (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    s.A = () => s.a || keys[' '] || keys.z; s.B = () => s.b || keys.x; s.C = () => s.c || keys.c || keys.shift;
    s.off = () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); };
    lib.last = s; return s;
  }
  /* Runs a complete HTML game inside a frame. Saves work because the frame shares BrowOS storage. */
  function frame(html) {
    return function (box) {
      const f = document.createElement('iframe');
      f.className = 'gframe'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-popups');
      f.setAttribute('allow', 'fullscreen; autoplay; gamepad'); f.allowFullscreen = true; f.srcdoc = html; box.append(f);
      const b = document.createElement('button'); b.className = 'gfs'; b.textContent = '\u26F6'; b.title = 'Full screen';
      b.onclick = () => { try { (f.requestFullscreen || f.webkitRequestFullscreen).call(f); } catch (e) {} }; box.append(b);
      return () => { try { f.srcdoc = ''; } catch (e) {} f.remove(); b.remove(); };
    };
  }
  Object.assign(lib, { mk, run, ctl, frame }); OS.gameLib = lib;
  const G = {}; OS.games = G;

  /* ---------- Chess (full rules: check, checkmate, stalemate, castling, en passant, promotion) ---------- */
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]], KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  function fen(s) {
    const [pl, tn, ca, ep] = s.split(' '), b = new Array(64).fill(0); let i = 0;
    for (const ch of pl) { if (ch === '/') continue; if (/\d/.test(ch)) { i += +ch; continue; } const v = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1; b[i++] = ch === ch.toLowerCase() ? -v : v; }
    return { b, t: tn === 'w' ? 1 : -1, c: { K: ca.includes('K'), Q: ca.includes('Q'), k: ca.includes('k'), q: ca.includes('q') }, ep: ep && ep !== '-' ? (8 - +ep[1]) * 8 + 'abcdefgh'.indexOf(ep[0]) : -1 };
  }
  function attacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7, pr = r + (by === 1 ? 1 : -1);
    if (pr >= 0 && pr < 8) for (const dc of [-1, 1]) { const cc = c + dc; if (cc >= 0 && cc < 8 && b[pr * 8 + cc] === by) return true; }
    for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 2 * by) return true; }
    for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === 6 * by) return true; }
    for (const [dr, dc] of KG) {
      let rr = r + dr, cc = c + dc; const diag = dr !== 0 && dc !== 0;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const p = b[rr * 8 + cc]; if (p) { if (p * by > 0) { const a = Math.abs(p); if (a === 5 || (diag && a === 3) || (!diag && a === 4)) return true; } break; } rr += dr; cc += dc; }
    }
    return false;
  }
  function gen(s) {
    const { b, t } = s, out = [], add = (f, to, x) => out.push(Object.assign({ f, t: to }, x));
    for (let f = 0; f < 64; f++) {
      const p = b[f]; if (!p || p * t < 0) continue; const a = Math.abs(p), r = f >> 3, c = f & 7;
      if (a === 1) {
        const dir = -t, r1 = r + dir, start = t === 1 ? 6 : 1, last = t === 1 ? 0 : 7;
        if (r1 >= 0 && r1 < 8 && !b[r1 * 8 + c]) { const to = r1 * 8 + c; if (r1 === last) for (const pr of [5, 4, 3, 2]) add(f, to, { pr }); else { add(f, to); if (r === start && !b[(r + 2 * dir) * 8 + c]) add(f, (r + 2 * dir) * 8 + c, { dp: 1 }); } }
        for (const dc of [-1, 1]) { const cc = c + dc; if (cc < 0 || cc > 7 || r1 < 0 || r1 > 7) continue; const to = r1 * 8 + cc, q = b[to]; if (q && q * t < 0) { if (r1 === last) for (const pr of [5, 4, 3, 2]) add(f, to, { pr }); else add(f, to); } else if (to === s.ep) add(f, to, { ep: 1 }); }
      } else if (a === 2 || a === 6) {
        for (const [dr, dc] of a === 2 ? KN : KG) { const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue; const q = b[rr * 8 + cc]; if (!q || q * t < 0) add(f, rr * 8 + cc); }
        if (a === 6) {
          const home = t === 1 ? 60 : 4, rk = t === 1 ? 'K' : 'k', qk = t === 1 ? 'Q' : 'q';
          if (f === home && !attacked(b, f, -t)) {
            if (s.c[rk] && !b[f + 1] && !b[f + 2] && b[f + 3] === 4 * t && !attacked(b, f + 1, -t) && !attacked(b, f + 2, -t)) add(f, f + 2, { cs: 1 });
            if (s.c[qk] && !b[f - 1] && !b[f - 2] && !b[f - 3] && b[f - 4] === 4 * t && !attacked(b, f - 1, -t) && !attacked(b, f - 2, -t)) add(f, f - 2, { cs: -1 });
          }
        }
      } else {
        for (const [dr, dc] of KG) { const diag = dr !== 0 && dc !== 0; if (a === 3 && !diag) continue; if (a === 4 && diag) continue; let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const q = b[rr * 8 + cc]; if (!q) add(f, rr * 8 + cc); else { if (q * t < 0) add(f, rr * 8 + cc); break; } rr += dr; cc += dc; } }
      }
    }
    return out;
  }
  function make(s, m) {
    const b = s.b.slice(), t = s.t, p = b[m.f], c = { ...s.c }; let ep = -1;
    b[m.t] = m.pr ? m.pr * t : p; b[m.f] = 0;
    if (m.ep) b[m.t + (t === 1 ? 8 : -8)] = 0;
    if (m.dp) ep = (m.f + m.t) / 2;
    if (m.cs === 1) { b[m.f + 1] = b[m.f + 3]; b[m.f + 3] = 0; } else if (m.cs === -1) { b[m.f - 1] = b[m.f - 4]; b[m.f - 4] = 0; }
    if (Math.abs(p) === 6) { if (t === 1) c.K = c.Q = false; else c.k = c.q = false; }
    for (const sq of [m.f, m.t]) { if (sq === 63) c.K = false; if (sq === 56) c.Q = false; if (sq === 7) c.k = false; if (sq === 0) c.q = false; }
    return { b, t: -t, c, ep };
  }
  const legal = s => gen(s).filter(m => { const n = make(s, m); return !attacked(n.b, n.b.indexOf(6 * s.t), -s.t); });
  const inCheck = s => attacked(s.b, s.b.indexOf(6 * s.t), -s.t);
  function perft(s, d) { if (d === 0) return 1; const ms = legal(s); if (d === 1) return ms.length; let n = 0; for (const m of ms) n += perft(make(s, m), d - 1); return n; }
  const PV = [0, 100, 320, 330, 500, 900, 0];
  const evalS = s => { let v = 0; for (let i = 0; i < 64; i++) { const p = s.b[i]; if (p) { const a = Math.abs(p), r = i >> 3, c = i & 7, cen = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)) + 0; v += Math.sign(p) * (PV[a] + (a < 6 ? cen * 4 : 0)); } } return v; };
  function search(s, d, al, be) {
    const ms = legal(s);
    if (!ms.length) return inCheck(s) ? -100000 - d : 0;
    if (d === 0) return evalS(s) * s.t;
    ms.sort((x, y) => (Math.abs(s.b[y.t]) - Math.abs(s.b[x.t])));
    let best = -1e9;
    for (const m of ms) { const v = -search(make(s, m), d - 1, -be, -al); if (v > best) best = v; if (best > al) al = best; if (al >= be) break; }
    return best;
  }
  function bestMove(s, depth) { let bm = null, bv = -1e9; const ms = legal(s); ms.sort(() => Math.random() - .5); for (const m of ms) { const v = -search(make(s, m), depth - 1, -1e9, 1e9); if (v > bv) { bv = v; bm = m; } } return bm; }
  OS.chess = { fen, legal, make, perft, inCheck, bestMove, start: () => fen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -') };
  const GL = ['', '♙♘♗♖♕♔', '', '', '', '', ''], PIECE = { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔', '-1': '♟', '-2': '♞', '-3': '♝', '-4': '♜', '-5': '♛', '-6': '♚' };
  G.chess = { name: 'Chess', icon: '♟️', cat: 'Classic', desc: 'Full chess against the computer. You are White.', start(box, api) {
    let s = OS.chess.start(), sel = -1, targets = [], over = false, think = false, msg = 'Your move';
    const draw = () => { box.innerHTML = `<div class="gchess"><div class="gstat">${msg}</div><div class="gboard chess">${s.b.map((p, i) => { const dark = ((i >> 3) + (i & 7)) % 2; const tg = targets.some(m => m.t === i); return `<button data-i="${i}" class="${dark ? 'dk' : 'lt'} ${i === sel ? 'sel' : ''} ${tg ? 'tg' : ''}">${p ? PIECE[p] : ''}</button>`; }).join('')}</div></div>`; };
    const finish = () => { const ms = legal(s); if (!ms.length) { over = true; msg = inCheck(s) ? (s.t === 1 ? 'Checkmate. The computer wins.' : 'Checkmate. You win!') : 'Stalemate. Draw.'; draw(); api.end(msg, s.t === -1 && inCheck(s) ? 100 : 0); return true; } msg = inCheck(s) ? 'Check!' : (s.t === 1 ? 'Your move' : 'Computer is thinking...'); return false; };
    box.onclick = e => {
      const i = e.target.dataset.i; if (i === undefined || over || think || s.t !== 1) return; const k = +i;
      const mv = targets.find(m => m.t === k && (!m.pr || m.pr === 5));
      if (mv) { s = make(s, mv); sel = -1; targets = []; if (finish()) return; draw(); think = true; setTimeout(() => { const m = bestMove(s, 2); if (m) s = make(s, m); think = false; if (!finish()) draw(); }, 60); return; }
      if (s.b[k] > 0) { sel = k; targets = legal(s).filter(m => m.f === k); } else { sel = -1; targets = []; } draw();
    };
    draw(); return () => { box.onclick = null; };
  } };

  /* ---------- The BrowGames app (hidden until the secret command is typed in Terminal) ---------- */
  OS.register({
    id: 'browgames', name: 'BrowGames', icon: '🎮', color: '#f43f5e', cat: 'Games', hidden: 'gamesUnlocked', w: 760, h: 620,
    build(el, ctx) {
      let stop = null, cur = null;
      const best = id => ctx.store.get('gameBest', {})[id] || 0;
      function hub() {
        if (stop) { try { stop(); } catch (e) {} stop = null; } cur = null;
        const cats = [...new Set(Object.values(OS.games).map(g => g.cat))];
        el.innerHTML = `<div class="ghub"><p class="muted small">Original games in the style of popular ones. Not affiliated with or endorsed by any game company. Touch stick and buttons, or arrow keys with Z, X and C.</p>${cats.map(c => `<h3 class="shead">${esc(c)}</h3><div class="gcards">${Object.entries(OS.games).filter(([, g]) => g.cat === c).map(([id, g]) => `<button class="gcard" data-g="${id}"><span class="gi">${g.icon}</span><b>${esc(g.name)}</b><small>${esc(g.desc)}</small><em>Best: ${best(id)}</em></button>`).join('')}</div>`).join('')}</div>`;
      }
      function launch(id) {
        const g = OS.games[id]; cur = id;
        el.innerHTML = `<div class="gm"><div class="gbar"><button class="btn" data-a="back">&#8249; Games</button><b>${esc(g.name)}</b><span class="muted" data-sc></span></div><div class="garea"></div></div>`;
        const area = el.querySelector('.garea'), sc = el.querySelector('[data-sc]');
        const api = {
          score: n => { sc.textContent = 'Score ' + n; },
          end: (msg, score) => {
            const b = ctx.store.get('gameBest', {}); if ((score || 0) > (b[id] || 0)) { b[id] = score; ctx.store.set('gameBest', b); }
            area.insertAdjacentHTML('beforeend', `<div class="gover"><h2>${esc(msg)}</h2><p>Score ${score || 0}</p><button class="btn pri" data-a="retry">Play again</button><button class="btn" data-a="back">Menu</button></div>`);
          }
        };
        stop = g.start(area, api);
      }
      el.onclick = e => {
        const t = e.target.closest('[data-g],[data-a]'); if (!t) return;
        if (t.dataset.g) return launch(t.dataset.g);
        if (t.dataset.a === 'back') return hub();
        if (t.dataset.a === 'retry') { if (stop) { try { stop(); } catch (x) {} } launch(cur); }
      };
      hub();
      return () => { if (stop) try { stop(); } catch (e) {} };
    }
  });
})();
