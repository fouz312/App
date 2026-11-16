/* BrowGames part 2: first-person shooters, driving and football. All original. Not affiliated with any game company. */
(function () {
  const OS = window.BrowOS, L = OS.gameLib, { R, RI, clamp, dist, mk, run, ctl, both } = L, G = OS.games;
  const TAU = Math.PI * 2, norm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  /* =====================================================================
     First-person shooter engine (ray casting). Two modes:
       royale = Island Drop: 16 players, shrinking storm, last one standing wins
       ops    = Strike Force: 4 vs 4 team deathmatch, first team to 20 wins
     ===================================================================== */
  function makeMap(n, royale) {
    const m = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) m[0][i] = m[n - 1][i] = m[i][0] = m[i][n - 1] = 1;
    if (royale) {
      for (let k = 0; k < Math.round(n / 4); k++) {
        const w = RI(5, 8), h = RI(5, 8), x0 = RI(2, n - w - 3), y0 = RI(2, n - h - 3);
        for (let x = x0; x < x0 + w; x++) { m[y0][x] = 3; m[y0 + h - 1][x] = 3; }
        for (let y = y0; y < y0 + h; y++) { m[y][x0] = 3; m[y][x0 + w - 1] = 3; }
        const side = RI(0, 3), mid = side < 2 ? x0 + RI(1, w - 3) : y0 + RI(1, h - 3);
        for (let d = 0; d < 2; d++) { if (side === 0) m[y0][mid + d] = 0; else if (side === 1) m[y0 + h - 1][mid + d] = 0; else if (side === 2) m[mid + d][x0] = 0; else m[mid + d][x0 + w - 1] = 0; }
      }
      for (let k = 0; k < n * n * .035; k++) { const x = RI(2, n - 3), y = RI(2, n - 3); if (!m[y][x]) m[y][x] = 2; }
    } else {
      for (let k = 0; k < Math.round(n * 1.1); k++) {
        const len = RI(3, 7), t = Math.random() < .6 ? 1 : 3, hz = Math.random() < .5, x0 = RI(2, n - 9), y0 = RI(2, n - 9);
        for (let i = 0; i < len; i++) { if (hz) m[y0][x0 + i] = t; else m[y0 + i][x0] = t; }
      }
      for (let k = 0; k < 14; k++) m[RI(2, n - 3)][RI(2, n - 3)] = 1;
    }
    const c = n >> 1; for (let y = c - 1; y <= c + 1; y++) for (let x = c - 1; x <= c + 1; x++) m[y][x] = 0;
    const seen = Array.from({ length: n }, () => new Array(n).fill(false)), st = [[c, c]]; seen[c][c] = true;
    while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < n && b < n && !m[b][a] && !seen[b][a]) { seen[b][a] = true; st.push([a, b]); } } }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!m[y][x] && !seen[y][x]) m[y][x] = 1;
    return m;
  }
  function cast(map, n, ox, oy, rdx, rdy) {
    let mx = Math.floor(ox), my = Math.floor(oy);
    const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
    let sx, sy, sdx, sdy, side = 0;
    if (rdx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
    for (let i = 0; i < 120; i++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= n || my >= n) return { d: 99, side, type: 1, wx: 0 };
      const t = map[my][mx];
      if (t) { const d = side === 0 ? sdx - ddx : sdy - ddy, h = side === 0 ? oy + d * rdy : ox + d * rdx; return { d, side, type: t, wx: h - Math.floor(h) }; }
    }
    return { d: 99, side, type: 1, wx: 0 };
  }
  const WP = [
    { n: 'Rifle', dmg: 12, rate: .1, mag: 30, spread: .03, pel: 1, reload: 1.3, auto: true },
    { n: 'Shotgun', dmg: 11, rate: .75, mag: 6, spread: .13, pel: 6, reload: 1.6, auto: false },
    { n: 'Pistol', dmg: 24, rate: .3, mag: 12, spread: .012, pel: 1, reload: 1.0, auto: false }
  ];
  const WALL = { 1: [150, 150, 165], 2: [46, 140, 66], 3: [196, 160, 118] };

  function fps(box, api, mode) {
    const royale = mode === 'royale', N = royale ? 48 : 28;
    const cv = mk(box), g = cv.getContext('2d'), c = ctl(box, ['Fire', 'Swap', 'Reload']);
    const W = 400, H = clamp(Math.round(400 * ((cv.height || 300) / Math.max(1, cv.width || 400))), 190, 300);
    cv.width = W; cv.height = H; cv.style.imageRendering = 'pixelated';
    const map = makeMap(N, royale), zb = new Array(W).fill(99);
    const free = () => { for (let k = 0; k < 400; k++) { const x = RI(2, N - 3) + .5, y = RI(2, N - 3) + .5; if (!map[Math.floor(y)][Math.floor(x)]) return [x, y]; } return [N / 2 + .5, N / 2 + .5]; };
    const solid = (x, y) => x < 0 || y < 0 || x >= N || y >= N || !!map[Math.floor(y)][Math.floor(x)];
    const mkEnt = (i, team, me) => { const [x, y] = free(); return { i, team, me, x, y, a: R(0, TAU), hp: 100, sh: 0, alive: true, cd: 0, react: 0, fl: 0, flash: 0, tt: R(0, .4), sw: 0, sd: 1, stuck: 0, rt: 0, k: 0, tgt: null, wx: undefined, wy: undefined, name: me ? 'You' : 'Bot ' + i,
      wp: 0, mag: WP.map(w => w.mag), res: WP.map(w => royale ? w.mag * 2 : 999), reload: 0 }; };
    const ents = [];
    if (royale) { for (let i = 0; i < 16; i++) ents.push(mkEnt(i, i, i === 0)); }
    else { for (let i = 0; i < 8; i++) ents.push(mkEnt(i, i < 4 ? 0 : 1, i === 0)); }
    const me = ents[0], score = [0, 0];
    let t = 0, over = false, endT = 0, stormR = N, alive = ents.length, place = 0, dmgT = 0, hitT = 0, muz = 0, feed = [], tid = null, lx = 0, prevB = 0, prevC = 0, bob = 0, msgT = 2.5;
    const msg0 = royale ? 'Last player standing wins. Stay inside the circle!' : 'Team deathmatch. First to 20 wins, or the leader after 3:00.';
    let msg = msg0;
    const pick = [], addPk = type => { const [x, y] = free(); pick.push({ x, y, type, on: true, rt: 0 }); };
    for (let i = 0; i < (royale ? 26 : 6); i++) addPk(royale ? ['ammo', 'med', 'shield'][i % 3] : 'med');
    const log = s => { feed.unshift({ s, t: 4 }); if (feed.length > 3) feed.pop(); };
    const los = (a, b) => { const d = dist(a.x, a.y, b.x, b.y) || .01, dx = (b.x - a.x) / d, dy = (b.y - a.y) / d; return cast(map, N, a.x, a.y, dx, dy).d >= d - .2; };
    const move = (e, vx, vy, dt) => { const r = .24, nx = e.x + vx * dt, ny = e.y + vy * dt; if (!solid(nx + Math.sign(vx) * r, e.y)) e.x = nx; if (!solid(e.x, ny + Math.sign(vy) * r)) e.y = ny; };
    function hurt(o, dmg, from) {
      if (!o.alive || over) return;
      if (o.sh > 0) { const a = Math.min(o.sh, dmg); o.sh -= a; dmg -= a; }
      o.hp -= dmg; o.flash = .15; if (o.me) dmgT = .35;
      if (o.hp <= 0) {
        o.hp = 0; o.alive = false; o.rt = 3;
        if (from) { from.k++; if (!royale) score[from.team]++; log(from.name + ' eliminated ' + o.name); } else log(o.name + ' was lost in the storm');
        if (royale) { alive--; if (o.me) place = alive + 1; }
      }
    }
    function respawn(e) {
      let best = null, bd = -1;
      for (let k = 0; k < 14; k++) { const p = free(); let m = 99; for (const o of ents) if (o.alive && o.team !== e.team) m = Math.min(m, dist(p[0], p[1], o.x, o.y)); if (m > bd) { bd = m; best = p; } }
      e.x = best[0]; e.y = best[1]; e.hp = 100; e.sh = 0; e.alive = true; e.tgt = null; e.mag = WP.map(w => w.mag); e.reload = 0;
    }
    function pickWP(e) {
      if (!royale && Math.random() < .85) { const foes = ents.filter(o => o.alive && o.team !== e.team); if (foes.length) { const f = foes[RI(0, foes.length - 1)]; e.wx = clamp(f.x + R(-3, 3), 2, N - 2); e.wy = clamp(f.y + R(-3, 3), 2, N - 2); return; } }
      const p = free(); e.wx = p[0]; e.wy = p[1];
    }
    function botShoot(e, o, d) {
      const hit = clamp(.9 - d * .045, .2, .8) * (o.me ? .7 : 1);
      if (Math.random() < hit) hurt(o, RI(7, 12), e);
      e.cd = R(.18, .4); e.fl = .08;
    }
    function think(e, dt) {
      if (!e.alive) { if (!royale) { e.rt -= dt; if (e.rt <= 0) respawn(e); } return; }
      e.cd -= dt; e.react -= dt; e.fl -= dt; e.flash -= dt; e.tt -= dt;
      if (e.tt <= 0) {
        e.tt = R(.2, .45); const old = e.tgt; e.tgt = null; let bd = 1e9;
        for (const o of ents) if (o.alive && o.team !== e.team) { const d = dist(e.x, e.y, o.x, o.y); if (d < bd && d < 20 && los(e, o)) { bd = d; e.tgt = o; } }
        if (e.tgt && e.tgt !== old) e.react = R(.25, .6);
      }
      let vx = 0, vy = 0; const sp = 2.3, T = e.tgt;
      if (T && T.alive) {
        const df = norm(Math.atan2(T.y - e.y, T.x - e.x) - e.a); e.a += clamp(df, -4 * dt, 4 * dt);
        const d = dist(e.x, e.y, T.x, T.y);
        if (Math.abs(df) < .25 && e.cd <= 0 && e.react <= 0) botShoot(e, T, d);
        e.sw -= dt; if (e.sw <= 0) { e.sw = R(.6, 1.4); e.sd = Math.random() < .5 ? -1 : 1; }
        const f = d > 7 ? 1 : d < 3 ? -.6 : 0;
        vx = Math.cos(e.a) * f * sp - Math.sin(e.a) * e.sd * sp * .6; vy = Math.sin(e.a) * f * sp + Math.cos(e.a) * e.sd * sp * .6;
      } else {
        let gx = e.wx, gy = e.wy;
        if (royale && dist(e.x, e.y, N / 2, N / 2) > stormR - 3) { gx = N / 2; gy = N / 2; }
        else if (gx === undefined || dist(e.x, e.y, gx, gy) < .8 || e.stuck > 1.2) { pickWP(e); gx = e.wx; gy = e.wy; e.stuck = 0; }
        e.a += clamp(norm(Math.atan2(gy - e.y, gx - e.x) - e.a), -3 * dt, 3 * dt);
        vx = Math.cos(e.a) * sp; vy = Math.sin(e.a) * sp;
      }
      const ox = e.x, oy = e.y; move(e, vx, vy, dt);
      if (!T && dist(ox, oy, e.x, e.y) < sp * dt * .3) e.stuck += dt; else e.stuck = 0;
    }
    const startReload = () => { const w = WP[me.wp]; if (me.reload > 0 || me.mag[me.wp] >= w.mag || me.res[me.wp] <= 0) return; me.reload = w.reload; };
    function fire() {
      const w = WP[me.wp]; if (me.cd > 0 || me.reload > 0 || !me.alive) return;
      if (me.mag[me.wp] <= 0) { startReload(); return; }
      me.mag[me.wp]--; me.cd = w.rate; muz = .06;
      for (let p = 0; p < w.pel; p++) {
        const ang = me.a + (Math.random() - .5) * 2 * w.spread, dx = Math.cos(ang), dy = Math.sin(ang), wd = cast(map, N, me.x, me.y, dx, dy).d;
        let best = null, bd = wd;
        for (const o of ents) if (o !== me && o.alive && o.team !== me.team) { const rx = o.x - me.x, ry = o.y - me.y, pr = rx * dx + ry * dy; if (pr > 0 && pr < bd && Math.abs(-rx * dy + ry * dx) < .32) { best = o; bd = pr; } }
        if (best) { hurt(best, w.dmg * (w.pel > 1 ? clamp(1.4 - bd / 7, .3, 1) : 1), me); hitT = .15; }
      }
      if (me.mag[me.wp] === 0) startReload();
    }
    cv.addEventListener('pointerdown', e => { tid = e.pointerId; lx = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (x) { } });
    cv.addEventListener('pointermove', e => { if (e.pointerId === tid) { me.a += (e.clientX - lx) * .0065; lx = e.clientX; } });
    ['pointerup', 'pointercancel'].forEach(k => cv.addEventListener(k, e => { if (e.pointerId === tid) tid = null; }));
    const keys = {}, kd = e => { keys[(e.key || '').toLowerCase()] = 1; }, ku = e => { delete keys[(e.key || '').toLowerCase()]; };
    document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);

    function update(dt) {
      t += dt; msgT -= dt; dmgT -= dt; hitT -= dt; muz -= dt; bob += dt;
      feed.forEach(f => { f.t -= dt; }); feed = feed.filter(f => f.t > 0);
      if (over) { endT -= dt; if (endT <= 0 && endT > -1) { endT = -5; api.end(msg, Math.max(0, Math.round(me.k * 100 + (royale ? (17 - place) * 20 + (place === 1 ? 500 : 0) : (score[0] > score[1] ? 300 : 0))))); } return; }
      if (me.alive) {
        me.cd -= dt; if (me.reload > 0) { me.reload -= dt; if (me.reload <= 0) { const w = WP[me.wp], need = w.mag - me.mag[me.wp], take = Math.min(need, me.res[me.wp]); me.mag[me.wp] += take; me.res[me.wp] -= take; } }
        me.flash -= dt;
        me.a += ((keys.e ? 1 : 0) - (keys.q ? 1 : 0)) * 2.2 * dt;
        const fw = -c.Y(), st = c.X(), m = Math.hypot(fw, st), k = m > 1 ? 1 / m : 1, sp = 3.1;
        move(me, (Math.cos(me.a) * fw - Math.sin(me.a) * st) * k * sp, (Math.sin(me.a) * fw + Math.cos(me.a) * st) * k * sp, dt);
        if (c.A() && (WP[me.wp].auto || !me._f)) { fire(); me._f = 1; } if (!c.A()) me._f = 0;
        const B = c.B() ? 1 : 0, C = c.C() ? 1 : 0;
        if (B && !prevB) { me.wp = (me.wp + 1) % WP.length; me.reload = 0; } if (C && !prevC) startReload(); prevB = B; prevC = C;
        for (const p of pick) {
          if (!p.on) { p.rt -= dt; if (p.rt <= 0) p.on = true; continue; }
          if (dist(p.x, p.y, me.x, me.y) < .7) {
            if (p.type === 'med') { if (me.hp >= 100) continue; me.hp = Math.min(100, me.hp + 35); log('Medkit +35'); }
            else if (p.type === 'shield') { me.sh = Math.min(100, me.sh + 40); log('Shield +40'); }
            else { WP.forEach((w, i) => { me.res[i] += w.mag; }); log('Ammo'); }
            p.on = false; p.rt = 25;
          }
        }
      } else if (!royale) { me.rt -= dt; if (me.rt <= 0) respawn(me); }
      for (const e of ents) if (e !== me) think(e, dt);
      if (royale) {
        stormR = Math.max(2.5, N * .72 - Math.max(0, t - 12) * .45);
        for (const e of ents) if (e.alive && dist(e.x, e.y, N / 2, N / 2) > stormR) hurt(e, (1.5 + (N * .72 - stormR) * .1) * dt, null);
        if (me.alive && alive === 1) { over = true; endT = 1.2; msg = 'Victory! You are the last one standing.'; }
        else if (!me.alive) { over = true; endT = 1.6; msg = 'Eliminated. You finished #' + place + '.'; }
      } else if (score[0] >= 20 || score[1] >= 20 || t >= 180) { over = true; endT = 1.2; msg = score[0] > score[1] ? 'Victory! Your team wins ' + score[0] + ' to ' + score[1] : score[0] < score[1] ? 'Defeat. The enemy team wins ' + score[1] + ' to ' + score[0] : 'Draw ' + score[0] + ' to ' + score[1]; }
      api.score(me.k * 100);
    }

    function draw() {
      const sky = royale ? '#6bb6ff' : '#3a3f55', flo = royale ? '#3a7d44' : '#4a4a52';
      g.fillStyle = sky; g.fillRect(0, 0, W, H / 2); g.fillStyle = flo; g.fillRect(0, H / 2, W, H / 2);
      const bobY = me.alive ? Math.sin(bob * 9) * (Math.hypot(c.X(), c.Y()) > .1 ? 2 : 0) : 0;
      const dx = Math.cos(me.a), dy = Math.sin(me.a), px = -dy * .66, py = dx * .66, far = royale ? 30 : 16;
      for (let x = 0; x < W; x++) {
        const cx = 2 * x / W - 1, h = cast(map, N, me.x, me.y, dx + px * cx, dy + py * cx);
        zb[x] = h.d; const lh = Math.min(H * 3, H / Math.max(.05, h.d)), col = WALL[h.type] || WALL[1];
        let sh = clamp(1.1 - h.d / far, .25, 1) * (h.side ? .72 : 1); if (h.type === 3 && Math.floor(h.wx * 4) % 2) sh *= .9; if (h.type === 2) sh *= .85 + .15 * Math.sin(h.wx * 20);
        g.fillStyle = 'rgb(' + (col[0] * sh | 0) + ',' + (col[1] * sh | 0) + ',' + (col[2] * sh | 0) + ')';
        g.fillRect(x, (H - lh) / 2 + bobY, 1, lh);
      }
      const spr = [];
      for (const e of ents) if (e !== me && e.alive) spr.push({ x: e.x, y: e.y, e, kind: 0 });
      for (const p of pick) if (p.on) spr.push({ x: p.x, y: p.y, p, kind: 1 });
      const inv = 1 / (px * dy - dx * py);
      for (const s of spr) { const sx = s.x - me.x, sy = s.y - me.y; s.tx = inv * (dy * sx - dx * sy); s.ty = inv * (-py * sx + px * sy); }
      spr.filter(s => s.ty > .15).sort((a, b) => b.ty - a.ty).forEach(s => {
        const scr = W / 2 * (1 + s.tx / s.ty), size = H / s.ty, hw = size * (s.kind ? .22 : .26), mid = H / 2 + bobY, x0 = Math.floor(scr - hw), x1 = Math.ceil(scr + hw);
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
          if (s.ty >= zb[x]) continue;
          const u = (x - x0) / (x1 - x0);
          if (s.kind) { const col = s.p.type === 'med' ? '#ef4444' : s.p.type === 'shield' ? '#38bdf8' : '#facc15'; g.fillStyle = col; g.fillRect(x, mid + size * .18, 1, size * .3); g.fillStyle = '#ffffff88'; g.fillRect(x, mid + size * .18, 1, size * .05); continue; }
          const e = s.e, f = e.flash > 0, body = f ? '#ffffff' : (!royale ? (e.team === me.team ? '#3b82f6' : '#ef4444') : 'hsl(' + (e.i * 47 % 360) + ',65%,50%)');
          g.fillStyle = f ? '#fff' : '#27303f';
          if ((u > .18 && u < .45) || (u > .55 && u < .82)) g.fillRect(x, mid + size * .1, 1, size * .4);
          if (u > .1 && u < .9) { g.fillStyle = body; g.fillRect(x, mid - size * .25, 1, size * .37); }
          if (u > .3 && u < .7) { g.fillStyle = f ? '#fff' : '#e8b88a'; g.fillRect(x, mid - size * .43, 1, size * .17); }
          if (e.fl > 0 && u > .6 && u < .75) { g.fillStyle = '#ffe066'; g.fillRect(x, mid - size * .08, 1, size * .06); }
        }
      });
      if (muz > 0) { g.fillStyle = '#ffd86655'; g.fillRect(W / 2 - 18, H - 80, 36, 60); }
      const w = WP[me.wp]; g.fillStyle = '#1f2937'; g.fillRect(W / 2 - 7, H - 44 + (me.cd > 0 ? 4 : 0), 14, 44); g.fillStyle = '#4b5563'; g.fillRect(W / 2 - 4, H - 54 + (me.cd > 0 ? 4 : 0), 8, 14);
      g.strokeStyle = hitT > 0 ? '#ff4040' : '#ffffffcc'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 7, H / 2); g.lineTo(W / 2 - 2, H / 2); g.moveTo(W / 2 + 2, H / 2); g.lineTo(W / 2 + 7, H / 2); g.moveTo(W / 2, H / 2 - 7); g.lineTo(W / 2, H / 2 - 2); g.moveTo(W / 2, H / 2 + 2); g.lineTo(W / 2, H / 2 + 7); g.stroke();
      if (dmgT > 0) { g.fillStyle = 'rgba(220,0,0,' + (dmgT * .8).toFixed(2) + ')'; g.fillRect(0, 0, W, H); }
      if (!me.alive) { g.fillStyle = '#000a'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText(over ? 'ELIMINATED' : 'Respawning in ' + Math.max(1, Math.ceil(me.rt)), W / 2, H / 2); }
      g.textAlign = 'left'; g.font = 'bold 12px sans-serif';
      g.fillStyle = '#0008'; g.fillRect(6, H - 118, 112, 30); g.fillStyle = '#ef4444'; g.fillRect(8, H - 114, 108 * me.hp / 100, 9); g.fillStyle = '#38bdf8'; g.fillRect(8, H - 103, 108 * me.sh / 100, 6);
      g.fillStyle = '#fff'; g.fillText(Math.ceil(me.hp) + (me.sh > 0 ? ' +' + Math.ceil(me.sh) : ''), 10, H - 122 + 3);
      g.fillStyle = '#0008'; g.fillRect(W - 126, H - 118, 120, 30); g.fillStyle = '#fff'; g.textAlign = 'right';
      g.fillText(w.n + (me.reload > 0 ? '  reloading' : ''), W - 10, H - 104); g.font = 'bold 15px sans-serif'; g.fillText(me.mag[me.wp] + ' / ' + (me.res[me.wp] > 900 ? '\u221E' : me.res[me.wp]), W - 10, H - 91);
      g.textAlign = 'center'; g.font = 'bold 14px sans-serif'; g.fillStyle = '#0008'; g.fillRect(W / 2 - 100, 4, 200, 22); g.fillStyle = '#fff';
      g.fillText(royale ? 'ALIVE ' + alive + '   KILLS ' + me.k : 'YOU ' + score[0] + ' - ' + score[1] + ' ENEMY  ' + Math.floor(Math.max(0, 180 - t) / 60) + ':' + String(Math.floor(Math.max(0, 180 - t) % 60)).padStart(2, '0'), W / 2, 20);
      g.textAlign = 'left'; g.font = '11px sans-serif'; feed.forEach((f, i) => { g.fillStyle = '#0007'; g.fillRect(6, 32 + i * 14, Math.max(60, f.s.length * 6.2), 13); g.fillStyle = '#fff'; g.fillText(f.s, 9, 42 + i * 14); });
      if (msgT > 0) { g.textAlign = 'center'; g.font = 'bold 13px sans-serif'; g.fillStyle = '#000a'; g.fillRect(10, H / 2 - 60, W - 20, 24); g.fillStyle = '#fff'; g.fillText(msg0, W / 2, H / 2 - 43); g.textAlign = 'left'; }
      const ms = 4, mr = 9, mx = W - mr * ms - 6, my = 32 + mr * ms; g.fillStyle = '#0009'; g.fillRect(mx - mr * ms, my - mr * ms, mr * 2 * ms, mr * 2 * ms);
      for (let yy = -mr; yy < mr; yy++) for (let xx = -mr; xx < mr; xx++) { const X = Math.floor(me.x) + xx, Y = Math.floor(me.y) + yy; if (X >= 0 && Y >= 0 && X < N && Y < N && map[Y][X]) { g.fillStyle = map[Y][X] === 2 ? '#2e8c42' : '#9aa0b0'; g.fillRect(mx + (X - me.x) * ms, my + (Y - me.y) * ms, ms - .5, ms - .5); } }
      for (const e of ents) if (e !== me && e.alive) { const ex = (e.x - me.x) * ms, ey = (e.y - me.y) * ms; if (Math.abs(ex) < mr * ms && Math.abs(ey) < mr * ms && ((!royale && e.team === me.team) || dist(e.x, e.y, me.x, me.y) < 7)) { g.fillStyle = !royale && e.team === me.team ? '#60a5fa' : '#f87171'; g.fillRect(mx + ex - 1, my + ey - 1, 3, 3); } }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 2.5, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(me.a) * 8, my + Math.sin(me.a) * 8); g.stroke();
      if (royale) { g.strokeStyle = '#a855f7'; g.lineWidth = 1.5; g.beginPath(); g.arc(mx + (N / 2 - me.x) * ms, my + (N / 2 - me.y) * ms, stormR * ms, 0, TAU); g.stroke(); if (dist(me.x, me.y, N / 2, N / 2) > stormR) { g.fillStyle = 'rgba(168,85,247,.22)'; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.fillStyle = '#e9d5ff'; g.font = 'bold 13px sans-serif'; g.fillText('IN THE STORM! Run to the centre', W / 2, 44); } }
    }
    const stop = run(update, draw);
    return both(stop, c.off, () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); });
  }
  G.royale = { name: 'Island Drop', icon: '🏝️', cat: 'Shooters', desc: '16 players, one island, a shrinking storm. Last one standing wins.', start: (b, a) => fps(b, a, 'royale') };
  G.ops = { name: 'Strike Force', icon: '🎯', cat: 'Shooters', desc: '4 vs 4 team deathmatch. First to 20 kills, or the leader after 3 minutes.', start: (b, a) => fps(b, a, 'ops') };

  /* =====================================================================
     Turbo Drive: open road driving with traffic, nitro and a garage
     ===================================================================== */
  function drive(box, api) {
    const cv = mk(box), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const SEGL = 200, ROAD = 2000, CAMH = 1000, CAMD = .84, DRAW = 110, N = 900, TOTAL = N * SEGL, MAXS = 12000, PZ = CAMH * CAMD, LIM = 120;
    const Y = i => 600 * Math.sin(TAU * 7 * i / N) + 420 * Math.sin(TAU * 13 * i / N + 1);
    const segs = []; for (let i = 0; i < N; i++) segs.push({ i, y1: Y(i), y2: Y(i + 1), curve: 0, spr: [], vis: false, sx: 0, sy: 0, sw: 0 });
    for (let i = 0; i < N;) { const len = RI(35, 100), cu = Math.random() < .35 ? 0 : R(-3.2, 3.2); for (let k = 0; k < len && i < N; k++, i++) { const e = Math.min(1, k / 12, (len - k) / 12); segs[i].curve = cu * e; } }
    for (let i = 8; i < N; i += RI(3, 7)) segs[i].spr.push({ off: (Math.random() < .5 ? -1 : 1) * R(1.35, 2.8), k: Math.random() < .7 ? 0 : 1 });
    const cars = []; for (let i = 0; i < 26; i++) cars.push({ z: R(2000, TOTAL - 2000), off: [-.62, 0, .62][RI(0, 2)], spd: R(.16, .42) * MAXS, col: ['#ef4444', '#f59e0b', '#22c55e', '#e5e7eb', '#a855f7', '#0ea5e9'][RI(0, 5)], ahead: false });
    let col = OS.store.get('carColor', '#e11d48'), started = false, pos = 0, px = 0, speed = 0, nitro = 100, dist0 = 0, passes = 0, crashes = 0, time = LIM, shake = 0, over = false, flash = 0;
    const colors = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#a855f7', '#111827', '#e5e7eb'];
    const gar = document.createElement('div'); gar.className = 'ggarage';
    gar.innerHTML = '<h2>Garage</h2><p>Pick your car colour</p><div class="gsw">' + colors.map(k => '<button data-c="' + k + '" style="background:' + k + (k === col ? ';outline:3px solid #fff' : '') + '"></button>').join('') + '</div><button class="btn pri" data-go="1">Start driving (2:00)</button><small>Stick steers. Gas, Brake, Nitro. Pass traffic for points.</small>';
    box.append(gar);
    gar.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.c) { col = b.dataset.c; OS.store.set('carColor', col); gar.querySelectorAll('[data-c]').forEach(x => { x.style.outline = x.dataset.c === col ? '3px solid #fff' : ''; }); } if (b.dataset.go) { started = true; gar.remove(); } };
    const c = ctl(box, ['Gas', 'Brake', 'Nitro']);
    const segAt = z => segs[Math.floor(((z % TOTAL) + TOTAL) % TOTAL / SEGL) % N];
    const poly = (x1, y1, x2, y2, x3, y3, x4, y4, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); g.fill(); };
    const km = () => dist0 * .0074 / 1000, pts = () => Math.max(0, Math.round(km() * 100 + passes * 10 - crashes * 20));
    function update(dt) {
      if (!started || over) return;
      time -= dt; if (time <= 0) { over = true; api.end('Time up! ' + km().toFixed(1) + ' km driven, ' + passes + ' cars passed', pts()); return; }
      const sp = speed / MAXS, dx = dt * 2.2 * Math.min(1, sp * 1.5), seg = segAt(pos + PZ);
      const nit = c.C() && nitro > 0 && speed > 1500, cap = nit ? MAXS * 1.3 : MAXS;
      let acc = c.A() ? MAXS / 4.2 : c.B() ? -MAXS / 1.5 : -MAXS / 7;
      if (nit) { acc += MAXS / 2; nitro = Math.max(0, nitro - 34 * dt); } else nitro = Math.min(100, nitro + 7 * dt);
      if (Math.abs(px) > 1.08 && speed > MAXS * .25) acc = -MAXS / 2.2;
      let ns = speed + acc * dt; if (ns > cap) ns = speed > cap ? Math.max(cap, speed - MAXS / 2 * dt) : cap; speed = Math.max(0, ns);
      px += c.X() * dx; px -= dx * sp * seg.curve * .3; px = clamp(px, -2.4, 2.4);
      pos = (pos + speed * dt) % TOTAL; dist0 += speed * dt; shake = Math.max(0, shake - dt * 3); flash = Math.max(0, flash - dt * 2);
      for (const s of seg.spr) if (Math.abs(px - s.off) < .2) { speed *= .35; shake = 1; crashes++; s.off += s.off > 0 ? 2 : -2; flash = 1; }
      const pz = pos + PZ;
      for (const k of cars) {
        k.z = (k.z + k.spd * dt) % TOTAL;
        const rel = ((k.z - pz) % TOTAL + TOTAL) % TOTAL, rb = rel > TOTAL / 2 ? rel - TOTAL : rel;
        if (rb > -200 && rb < 260 && Math.abs(px - k.off) < .3) { speed = Math.min(speed, k.spd * .6); shake = 1; flash = 1; crashes++; k.z += 900; k.ahead = true; continue; }
        if (rb > 0) k.ahead = true;
        else if (rb < -120 && k.ahead) { if (Math.abs(px - k.off) < .75) passes++; k.ahead = false; }
      }
      api.score(pts());
    }
    function draw() {
      const sky = g.createLinearGradient(0, 0, 0, H * .6); sky.addColorStop(0, '#3b8fe8'); sky.addColorStop(1, '#bfe3ff'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = '#5a7fa8'; g.beginPath(); g.moveTo(0, H * .52); for (let x = 0; x <= W; x += 20) g.lineTo(x, H * .52 - 30 - 22 * Math.sin(x / 55 + px) - 14 * Math.sin(x / 23)); g.lineTo(W, H * .52); g.fill();
      const base = Math.floor(pos / SEGL) % N, bp = (pos % SEGL) / SEGL, b0 = segs[base], camY = CAMH + (b0.y1 + (b0.y2 - b0.y1) * bp);
      let x = 0, dx = -(b0.curve * bp), maxy = H;
      for (let n = 0; n < DRAW; n++) {
        const idx = (base + n) % N, sg = segs[idx], loop = base + n >= N ? TOTAL : 0, z1 = sg.i * SEGL + loop, z2 = z1 + SEGL, cx1 = px * ROAD - x, cx2 = px * ROAD - x - dx;
        const cz1 = z1 - pos, cz2 = z2 - pos; sg.vis = false;
        if (cz1 <= CAMD) { x += dx; dx += sg.curve; continue; }
        const s1 = CAMD / cz1, s2 = CAMD / cz2, sx1 = W / 2 - s1 * cx1 * W / 2, sy1 = Math.round(H / 2 + s1 * (camY - sg.y1) * H / 2), sw1 = s1 * ROAD * W / 2, sx2 = W / 2 - s2 * cx2 * W / 2, sy2 = Math.round(H / 2 + s2 * (camY - sg.y2) * H / 2), sw2 = s2 * ROAD * W / 2;
        x += dx; dx += sg.curve;
        if (sy2 >= maxy || sy2 >= sy1) continue;
        sg.vis = true; sg.sx = sx1; sg.sy = sy1; sg.sw = sw1;
        const dk = Math.floor(sg.i / 3) % 2, r1 = sw1 * .1, r2 = sw2 * .1;
        g.fillStyle = dk ? '#2f8f3f' : '#36a047'; g.fillRect(0, sy2, W, sy1 - sy2);
        const rc = dk ? '#e5e7eb' : '#dc2626';
        poly(sx1 - sw1 - r1, sy1, sx1 - sw1, sy1, sx2 - sw2, sy2, sx2 - sw2 - r2, sy2, rc); poly(sx1 + sw1, sy1, sx1 + sw1 + r1, sy1, sx2 + sw2 + r2, sy2, sx2 + sw2, sy2, rc);
        poly(sx1 - sw1, sy1, sx1 + sw1, sy1, sx2 + sw2, sy2, sx2 - sw2, sy2, dk ? '#585863' : '#52525c');
        if (!dk) for (const k of [-1 / 3, 1 / 3]) { const l1 = sw1 * .02, l2 = sw2 * .02; poly(sx1 + sw1 * k - l1, sy1, sx1 + sw1 * k + l1, sy1, sx2 + sw2 * k + l2, sy2, sx2 + sw2 * k - l2, sy2, '#f1f5f9'); }
        maxy = sy1;
      }
      const by = {}; for (const k of cars) { const i = Math.floor(k.z / SEGL) % N; (by[i] || (by[i] = [])).push(k); }
      for (let n = DRAW - 1; n >= 0; n--) {
        const idx = (base + n) % N, sg = segs[idx]; if (!sg.vis) continue;
        for (const s of sg.spr) { const sx = sg.sx + sg.sw * s.off, w = sg.sw * (s.k ? .5 : .35), h = w * (s.k ? 1.3 : 2.2); g.fillStyle = '#5b3a1e'; g.fillRect(sx - w * .08, sg.sy - h * .45, w * .16, h * .45); g.fillStyle = s.k ? '#7c8da6' : '#1f7a33'; if (s.k) g.fillRect(sx - w / 2, sg.sy - h, w, h * .75); else { g.beginPath(); g.moveTo(sx - w / 2, sg.sy - h * .3); g.lineTo(sx, sg.sy - h); g.lineTo(sx + w / 2, sg.sy - h * .3); g.fill(); } }
        for (const k of by[idx] || []) { const sx = sg.sx + sg.sw * k.off, w = sg.sw * .38, h = w * .55; g.fillStyle = k.col; g.fillRect(sx - w / 2, sg.sy - h, w, h); g.fillStyle = '#111827cc'; g.fillRect(sx - w * .38, sg.sy - h * .95, w * .76, h * .35); g.fillStyle = '#ff2a2a'; g.fillRect(sx - w * .46, sg.sy - h * .45, w * .16, h * .14); g.fillRect(sx + w * .3, sg.sy - h * .45, w * .16, h * .14); g.fillStyle = '#000'; g.fillRect(sx - w * .5, sg.sy - h * .12, w * .18, h * .14); g.fillRect(sx + w * .32, sg.sy - h * .12, w * .18, h * .14); }
      }
      const cw = Math.min(W * .26, 120), ch = cw * .5, cx = W / 2 + c.X() * 6 + (Math.random() - .5) * 6 * shake, cy = H - 128 - ch + (Math.random() - .5) * 5 * shake;
      g.fillStyle = '#0006'; g.fillRect(cx - cw * .55, cy + ch * .92, cw * 1.1, 5);
      if (c.C() && nitro > 0 && speed > 1500) { g.fillStyle = '#38bdf8'; g.fillRect(cx - cw * .3, cy + ch * .85, cw * .12, ch * (.4 + Math.random() * .4)); g.fillRect(cx + cw * .18, cy + ch * .85, cw * .12, ch * (.4 + Math.random() * .4)); }
      g.fillStyle = '#111'; g.fillRect(cx - cw * .5, cy + ch * .55, cw * .18, ch * .45); g.fillRect(cx + cw * .32, cy + ch * .55, cw * .18, ch * .45);
      g.fillStyle = col; g.fillRect(cx - cw * .5, cy + ch * .2, cw, ch * .62); g.fillRect(cx - cw * .38, cy - ch * .1, cw * .76, ch * .4);
      g.fillStyle = '#0f172acc'; g.fillRect(cx - cw * .3, cy - ch * .03, cw * .6, ch * .26); g.fillStyle = '#ff2a2a'; g.fillRect(cx - cw * .45, cy + ch * .32, cw * .2, ch * .12); g.fillRect(cx + cw * .25, cy + ch * .32, cw * .2, ch * .12);
      if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (flash * .4).toFixed(2) + ')'; g.fillRect(0, 0, W, H); }
      const kmh = Math.round(speed / MAXS * 320), gear = 1 + Math.min(5, Math.floor(speed / MAXS * 6));
      g.fillStyle = '#0009'; g.fillRect(6, 6, 118, 46); g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'left'; g.fillText(kmh, 12, 34); g.font = '11px sans-serif'; g.fillText('km/h   gear ' + gear, 12, 47);
      g.fillStyle = '#0009'; g.fillRect(W - 124, 6, 118, 46); g.fillStyle = '#fff'; g.textAlign = 'right'; g.font = 'bold 14px sans-serif'; g.fillText(km().toFixed(2) + ' km', W - 12, 24); g.font = '11px sans-serif'; g.fillText('passes ' + passes + '  crashes ' + crashes, W - 12, 40);
      g.textAlign = 'center'; g.font = 'bold 15px sans-serif'; g.fillStyle = '#0009'; g.fillRect(W / 2 - 34, 6, 68, 22); g.fillStyle = time < 15 ? '#fca5a5' : '#fff'; g.fillText(Math.floor(Math.max(0, time) / 60) + ':' + String(Math.floor(Math.max(0, time) % 60)).padStart(2, '0'), W / 2, 22);
      g.fillStyle = '#0009'; g.fillRect(W / 2 - 50, 32, 100, 8); g.fillStyle = '#38bdf8'; g.fillRect(W / 2 - 50, 32, nitro, 8);
    }
    const stop = run(update, draw);
    return both(stop, c.off);
  }
  G.drive = { name: 'Turbo Drive', icon: '🏎️', cat: 'Driving', desc: 'Open road. Pick a car colour, dodge traffic, use nitro. 2:00 time attack.', start: drive };

  /* =====================================================================
     Pitch Pro: 5-a-side football. Pass, Shoot (hold to charge), Dash. You attack to the right.
     ===================================================================== */
  function pitch(box, api) {
    const cv = mk(box), g = cv.getContext('2d'), c = ctl(box, ['Pass', 'Shoot', 'Dash']);
    const CW = cv.width, CH = cv.height, WW = 900, HH = 520, GH = 64, MATCH = 120, VW = 560, S = CW / VW, vh = Math.max(160, CH - 120), midY = vh / 2;
    const AN = [{ r: 'GK', x: .04, y: .5 }, { r: 'DF', x: .2, y: .28 }, { r: 'DF', x: .2, y: .72 }, { r: 'MF', x: .4, y: .5 }, { r: 'FW', x: .58, y: .5 }];
    const ps = []; for (let t = 0; t < 2; t++) AN.forEach(a => ps.push({ t, r: a.r, ax: a.x, ay: a.y, x: 0, y: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, face: t ? Math.PI : 0, cd: 0, st: 1, think: 0, hold: 0 }));
    const ball = { x: WW / 2, y: HH / 2, vx: 0, vy: 0, o: null };
    const score = [0, 0]; let clock = 0, state = 'play', gt = 0, charge = 0, prevA = 0, ctrl = ps[3], over = false, banner = '', kickT = 0; const cam = { x: WW / 2, y: HH / 2 };
    const nearOpp = (x, y, t) => { let m = 1e9; for (const o of ps) if (o.t !== t) m = Math.min(m, dist(x, y, o.x, o.y)); return m; };
    function reset(kick) {
      ps.forEach(p => { p.x = (p.t ? 1 - p.ax : p.ax) * WW; p.y = p.ay * HH; p.vx = p.vy = p.dvx = p.dvy = 0; p.cd = 0; p.face = p.t ? Math.PI : 0; });
      const k = ps.find(p => p.t === kick && p.r === 'FW'); k.x = WW / 2 + (kick ? 16 : -16); k.y = HH / 2; ball.o = k; ball.vx = ball.vy = 0; ctrl = kick ? ps[3] : k; charge = 0;
    }
    function kick(p, tx, ty, spd) { const a = Math.atan2(ty - p.y, tx - p.x); ball.o = null; ball.x = p.x + Math.cos(a) * 16; ball.y = p.y + Math.sin(a) * 16; ball.vx = Math.cos(a) * spd; ball.vy = Math.sin(a) * spd; p.cd = .35; p.face = a; }
    function bestPass(p, face) {
      let best = null, bs = -9;
      for (const q of ps) if (q.t === p.t && q !== p) {
        const d = dist(p.x, p.y, q.x, q.y); if (d < 50 || d > 430) continue;
        const ang = Math.abs(norm(Math.atan2(q.y - p.y, q.x - p.x) - face)), adv = (q.t ? p.x - q.x : q.x - p.x) / 400, open = clamp(nearOpp(q.x, q.y, q.t) / 100, 0, 1);
        const s = (1 - ang / 1.2) + adv * .4 + open * .5 - d / 900 - (q.r === 'GK' ? 1 : 0); if (s > bs) { bs = s; best = q; }
      }
      return best;
    }
    function doPass(p, q) { const tx = q.x + q.vx * .4, ty = q.y + q.vy * .4, d = dist(p.x, p.y, tx, ty); kick(p, tx, ty, clamp(200 + d * 1.2, 240, 560)); }
    function tackle(p, user) {
      if (p.cd > 0) return; const o = ball.o; if (!o || o.t === p.t || dist(p.x, p.y, o.x, o.y) > 30) return;
      if (Math.random() < (user ? .62 : .33)) { o.cd = .6; ball.o = p; p.cd = .3; } else p.cd = .7;
    }
    function goal(team) { score[team]++; state = 'goal'; gt = 2.3; kickT = 1 - team; banner = team === 0 ? 'GOAL! You score!' : 'GOAL for the opponent'; ball.o = null; ball.vx = ball.vy = 0; }
    const goTo = (p, tx, ty, sp) => { const d = dist(p.x, p.y, tx, ty); if (d < 4) { p.dvx = p.dvy = 0; return; } const k = Math.min(sp, d * 4) / d; p.dvx = (tx - p.x) * k; p.dvy = (ty - p.y) * k; };
    function ai(p, dt, chase) {
      const goalX = p.t ? 0 : WW, own = p.t ? WW : 0; p.think -= dt;
      if (p.r === 'GK') {
        const gx = own + (p.t ? -22 : 22);
        if (ball.o === p) { p.hold += dt; if (p.hold > .7) { p.hold = 0; const q = bestPass(p, p.t ? Math.PI : 0); if (q) doPass(p, q); else kick(p, WW / 2, HH / 2, 420); } goTo(p, gx, HH / 2, 90); return; }
        p.hold = 0; let tx = gx, ty = clamp(ball.y, HH / 2 - 50, HH / 2 + 50);
        if (!ball.o && Math.abs(ball.x - own) < 110 && Math.abs(ball.y - HH / 2) < 120) { tx = ball.x; ty = ball.y; }
        goTo(p, tx, ty, 140); return;
      }
      if (ball.o === p) {
        const dg = dist(p.x, p.y, goalX, HH / 2); let ty = HH / 2, near = null, nd = 1e9;
        for (const o of ps) if (o.t !== p.t) { const d = dist(p.x, p.y, o.x, o.y); if (d < nd) { nd = d; near = o; } }
        if (near && nd < 70) ty = p.y - (Math.sign(near.y - p.y) || 1) * 80;
        p.face = Math.atan2(ty - p.y, goalX - p.x); goTo(p, p.x + Math.cos(p.face) * 100, p.y + Math.sin(p.face) * 100, 125);
        if (p.think <= 0) {
          if (dg < 270 && Math.random() < .08) { kick(p, goalX, HH / 2 + R(-45, 45), 380 + R(0, 280)); p.think = .6; }
          else if (nd < 40 && Math.random() < .15) { const q = bestPass(p, p.face); if (q) { doPass(p, q); p.think = .7; } }
        }
        return;
      }
      const mine = ball.o && ball.o.t === p.t;
      if (chase[p.t] === p && !mine) {
        goTo(p, ball.o ? ball.o.x : ball.x, ball.o ? ball.o.y : ball.y, 145);
        if (ball.o && dist(p.x, p.y, ball.o.x, ball.o.y) < 26 && p.think <= 0) { tackle(p, 0); p.think = .5; }
        return;
      }
      let ax = (p.t ? 1 - p.ax : p.ax) * WW, ay = p.ay * HH; ax += (ball.x - ax) * (mine ? .5 : .3); ay += (ball.y - ay) * .25; if (mine) ax += (p.t ? -1 : 1) * 90;
      goTo(p, ax, ay, 125);
    }
    function update(dt) {
      if (over) return;
      if (state === 'goal') { gt -= dt; if (gt <= 0) { state = 'play'; reset(kickT); } return; }
      clock += dt; if (clock >= MATCH) { over = true; const a = score[0], b = score[1]; api.end('Full time ' + a + ' - ' + b + (a > b ? ': you win!' : a < b ? ': you lose' : ': a draw'), Math.max(0, a * 150 + (a > b ? 300 : a === b ? 100 : 0) - b * 20)); return; }
      ps.forEach(p => { p.cd -= dt; });
      if (ball.o && ball.o.t === 0) ctrl = ball.o;
      else { let nb = null, bd = 1e9; for (const p of ps) if (p.t === 0 && p.r !== 'GK') { const d = dist(p.x, p.y, ball.x, ball.y); if (d < bd) { bd = d; nb = p; } } if (nb && nb !== ctrl && bd + 30 < dist(ctrl.x, ctrl.y, ball.x, ball.y)) ctrl = nb; }
      const chase = [null, null]; for (let t = 0; t < 2; t++) { let bd = 1e9; for (const p of ps) if (p.t === t && p.r !== 'GK' && p !== ctrl) { const d = dist(p.x, p.y, ball.x, ball.y); if (d < bd) { bd = d; chase[t] = p; } } }
      const ix = c.X(), iy = c.Y(), m = Math.hypot(ix, iy), k = m > 1 ? 1 / m : 1, sprint = c.C() && ctrl.st > 0 && m > .2, sp = (sprint ? 215 : 150) * (ctrl.cd > 0 && !ball.o ? .6 : 1);
      ctrl.vx = ix * k * sp; ctrl.vy = iy * k * sp; if (m > .15) ctrl.face = Math.atan2(iy, ix); ctrl.st = clamp(ctrl.st + (sprint ? -.5 : .25) * dt, 0, 1);
      const A = c.A() ? 1 : 0;
      if (A && !prevA) { if (ball.o === ctrl) { const q = bestPass(ctrl, ctrl.face); if (q) doPass(ctrl, q); } else tackle(ctrl, 1); } prevA = A;
      if (c.B() && ball.o === ctrl) charge = Math.min(1, charge + dt / .7);
      else if (charge > 0) { if (ball.o === ctrl) kick(ctrl, WW, HH / 2 + iy * 60 + R(-18, 18) * (1 - charge), 340 + charge * 360); charge = 0; }
      for (const p of ps) {
        if (p !== ctrl) { ai(p, dt, chase); const f = Math.min(1, dt * 7); p.vx += (p.dvx - p.vx) * f; p.vy += (p.dvy - p.vy) * f; if (Math.hypot(p.vx, p.vy) > 20 && ball.o !== p) p.face = Math.atan2(p.vy, p.vx); }
        p.x = clamp(p.x + p.vx * dt, 10, WW - 10); p.y = clamp(p.y + p.vy * dt, 10, HH - 10);
      }
      if (ball.o) { const o = ball.o; ball.x = o.x + Math.cos(o.face) * 13; ball.y = o.y + Math.sin(o.face) * 13; ball.vx = ball.vy = 0; }
      else {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt; const f = Math.pow(.35, dt); ball.vx *= f; ball.vy *= f;
        if (ball.y < 5) { ball.y = 5; ball.vy = Math.abs(ball.vy) * .7; } if (ball.y > HH - 5) { ball.y = HH - 5; ball.vy = -Math.abs(ball.vy) * .7; }
        const mouth = Math.abs(ball.y - HH / 2) < GH;
        if (ball.x < 0) { if (mouth) { if (ball.x < -8) { goal(1); return; } } else { ball.x = 0; ball.vx = Math.abs(ball.vx) * .7; } }
        if (ball.x > WW) { if (mouth) { if (ball.x > WW + 8) { goal(0); return; } } else { ball.x = WW; ball.vx = -Math.abs(ball.vx) * .7; } }
        const spd = Math.hypot(ball.vx, ball.vy);
        for (const p of ps) {
          if (p.cd > 0) continue; const d = dist(p.x, p.y, ball.x, ball.y);
          if (d < (p.r === 'GK' ? 22 : 13)) {
            if (spd < (p.r === 'GK' ? 560 : 330)) { ball.o = p; ball.vx = ball.vy = 0; p.hold = 0; break; }
            else if (p.r === 'GK') { ball.vx *= -.45; ball.vy *= .6; p.cd = .3; break; }
          }
        }
      }
      api.score(score[0] * 150);
    }
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10401f'; g.fillRect(0, 0, CW, CH);
      const viewH = vh / S; cam.x += (clamp(ball.x, VW / 2 - 40, WW - VW / 2 + 40) - cam.x) * .12; cam.y += ((viewH >= HH ? HH / 2 : clamp(ball.y, viewH / 2 - 20, HH - viewH / 2 + 20)) - cam.y) * .12;
      g.save(); g.beginPath(); g.rect(0, 0, CW, vh); g.clip(); g.setTransform(S, 0, 0, S, CW / 2 - cam.x * S, midY - cam.y * S);
      g.fillStyle = '#14532d'; g.fillRect(-120, -120, WW + 240, HH + 240);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#2f8f46' : '#2a8040'; g.fillRect(i * WW / 12, 0, WW / 12 + 1, HH); }
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 3; g.strokeRect(0, 0, WW, HH); g.beginPath(); g.moveTo(WW / 2, 0); g.lineTo(WW / 2, HH); g.stroke(); g.beginPath(); g.arc(WW / 2, HH / 2, 60, 0, TAU); g.stroke();
      g.strokeRect(0, HH / 2 - 110, 130, 220); g.strokeRect(WW - 130, HH / 2 - 110, 130, 220); g.strokeRect(0, HH / 2 - 60, 45, 120); g.strokeRect(WW - 45, HH / 2 - 60, 45, 120);
      g.fillStyle = '#ffffff33'; g.fillRect(-26, HH / 2 - GH, 26, GH * 2); g.fillRect(WW, HH / 2 - GH, 26, GH * 2); g.strokeRect(-26, HH / 2 - GH, 26, GH * 2); g.strokeRect(WW, HH / 2 - GH, 26, GH * 2);
      for (const p of ps) {
        g.fillStyle = '#0004'; g.beginPath(); g.ellipse(p.x, p.y + 8, 10, 5, 0, 0, TAU); g.fill();
        g.fillStyle = p.r === 'GK' ? (p.t ? '#f472b6' : '#facc15') : p.t ? '#ef4444' : '#3b82f6'; g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.fill();
        g.fillStyle = '#fde2c8'; g.beginPath(); g.arc(p.x + Math.cos(p.face) * 6, p.y + Math.sin(p.face) * 6, 4, 0, TAU); g.fill();
        if (p === ctrl) { g.strokeStyle = '#fde047'; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 15, 0, TAU); g.stroke(); }
      }
      g.fillStyle = '#0005'; g.beginPath(); g.ellipse(ball.x, ball.y + 5, 6, 3, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.arc(ball.x, ball.y, 6, 0, TAU); g.fill(); g.stroke();
      g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0); g.textAlign = 'center';
      g.fillStyle = '#000a'; g.fillRect(CW / 2 - 90, 4, 180, 24); g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif';
      g.fillText('BLUE ' + score[0] + ' - ' + score[1] + ' RED   ' + Math.min(90, Math.floor(clock / MATCH * 90)) + "'", CW / 2, 21);
      if (charge > 0) { g.fillStyle = '#0008'; g.fillRect(CW / 2 - 60, vh - 16, 120, 8); g.fillStyle = '#facc15'; g.fillRect(CW / 2 - 60, vh - 16, 120 * charge, 8); }
      g.fillStyle = '#0008'; g.fillRect(8, vh - 16, 70, 8); g.fillStyle = '#38bdf8'; g.fillRect(8, vh - 16, 70 * ctrl.st, 8);
      if (state === 'goal') { g.fillStyle = '#000a'; g.fillRect(0, midY - 28, CW, 56); g.fillStyle = '#fde047'; g.font = 'bold 26px sans-serif'; g.fillText(banner, CW / 2, midY + 9); }
    }
    reset(0);
    const stop = run(update, draw);
    return both(stop, c.off);
  }
  G.pitch = { name: 'Pitch Pro', icon: '⚽', cat: 'Sports', desc: '5-a-side football. Pass, charge your shot, dash. 2 minute match.', start: pitch };
})();
