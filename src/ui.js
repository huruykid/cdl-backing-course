
  var css = getComputedStyle(document.documentElement);
  function tok(n) { return css.getPropertyValue(n).trim(); }
  var C = { pad: tok('--pad'), off: tok('--off'), paint: tok('--paint'), cone: tok('--cone'),
            cab: tok('--cab'), trailer: tok('--trailer'), bad: tok('--bad') };
  function $(id) { return document.getElementById(id); }

  // ---- saved progress ----
  var prog = {}, guideOn = true, viewMode = 'top';
  try {
    prog = JSON.parse(localStorage.getItem('cdl.progress')) || {};
    if (localStorage.getItem('cdl.coach') === 'off') guideOn = false;
    var sv = localStorage.getItem('alleydock.view'); if (sv === 'cab' || sv === 'seat') viewMode = sv;
  } catch (e) { prog = {}; }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function unlocked(i) { return i === 0 || !!prog[LEVELS[i - 1].id]; }
  function starStr(n) { return '★★★'.slice(0, n) + '<i>' + '★★★'.slice(n) + '</i>'; }

  // ---- run state ----
  var mode = 'menu', li = 0, L = LEVELS[0];
  var s, cones, steer = 0, pullups, enc, elapsed, started, finished, hasReversed, lastDir,
      dirty, bumped, jack, coachHold = null, coachedRun = false;
  var ptrDrive = 0, keys = {};

  function reset() {
    s = { x: L.start.x, y: L.start.y, t1: L.start.t1, t2: L.start.t2, v: 0 };
    cones = L.cones.map(function (k) { return { x: k.x, y: k.y, hit: false }; });
    pullups = 0; enc = 0; elapsed = 0;
    started = false; finished = false; hasReversed = false; lastDir = 0;
    dirty = false; bumped = false; jack = false; coachHold = null; coachedRun = guideOn;
    camYaw = 0.3;
    $('sheet').hidden = true;
    setSteer(0);
  }
  function showMenu() {
    mode = 'menu'; ptrDrive = 0;
    $('menu').hidden = false; $('game').hidden = true; $('stats').hidden = true;
    $('eyebrow').hidden = false; $('b-levels').hidden = true;
    $('title').textContent = 'Backing Course';
    var next = -1, html = '';
    LEVELS.forEach(function (lv, i) { if (next < 0 && !prog[lv.id]) next = i; });
    LEVELS.forEach(function (lv, i) {
      var open = unlocked(i), p = prog[lv.id];
      var right = !open ? '<span class="tag">Locked</span>'
        : p ? '<span class="stars" aria-label="' + p.stars + ' of 3 stars">' + starStr(p.stars) + '</span>'
        : '<span class="tag">' + (i === next ? 'Start' : 'Open') + '</span>';
      html += '<button type="button" class="lvl' + (i === next && open ? ' up' : '') + '" data-i="' + i + '"' + (open ? '' : ' disabled') + '>' +
        '<span class="n">' + (i + 1) + '</span>' +
        '<span><strong>' + lv.name + '</strong><span class="sub">' + (open ? lv.sub : 'Pass ' + LEVELS[i - 1].name + ' to unlock.') + '</span></span>' +
        right + '</button>';
    });
    var box = $('levels'); box.innerHTML = html;
    box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.gap = '8px';
  }
  function startLevel(i) {
    li = i; L = LEVELS[i]; mode = 'game';
    $('menu').hidden = true; $('game').hidden = false; $('stats').hidden = false;
    $('eyebrow').hidden = true; $('b-levels').hidden = false;
    $('b-levels').textContent = '‹ Levels · ' + (i + 1) + ' of ' + LEVELS.length;
    $('title').textContent = L.name;
    buildLevel(); reset(); fit();
  }

  function docked() { return isDocked(L, s); }
  function inBox() { return isBoxed(L, s); }

  // ---- simulation ----
  function step(dt) {
    var kd = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    var drive = finished ? 0 : (ptrDrive || kd);
    var ks = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    if (ks && !finished) setSteer(steer + ks * 1.6 * dt);

    var top = SPEED;
    if (guideOn && drive < 0) top = SPEED * coachSpeed(Math.abs(recSteer(L, s) - steer));
    s.v += (drive * top - s.v) * Math.min(1, dt * 6);
    if (Math.abs(s.v) < 0.02) { s.v = 0; return; }

    var prev = { x: s.x, y: s.y, t1: s.t1, t2: s.t2 };
    var phi0 = Math.abs(norm(s.t1 - s.t2));
    advance(s, s.v, steer * MAXD, dt);
    var phi = Math.abs(norm(s.t1 - s.t2));
    if (phi > JACK && phi > phi0) { restore(prev); jack = true; return; }
    jack = false;

    var all = corners(s.x, s.y, s.t1, TR).concat(corners(s.x, s.y, s.t2, TL));
    if (all.some(function (p) { return hardStop(L, p); })) {
      restore(prev);
      if (!bumped) { bumped = true; enc++; }
      return;
    }
    bumped = false;

    if (!started) started = true;
    var dir = s.v > 0 ? 1 : -1;
    if (Math.abs(s.v) > 0.4 && dir !== lastDir) {
      if (dir > 0 && hasReversed) pullups++;
      if (dir < 0) hasReversed = true;
      lastDir = dir;
    }
    var touching = false;
    cones.forEach(function (k) {
      if (coneIn(k, s.x, s.y, s.t1, TR) || coneIn(k, s.x, s.y, s.t2, TL)) { k.hit = true; touching = true; }
    });
    var now = touching || all.some(function (p) { return !inBounds(L, p); });
    if (now && !dirty) enc++;
    dirty = now;
  }
  function restore(p) { s.x = p.x; s.y = p.y; s.t1 = p.t1; s.t2 = p.t2; s.v = 0; }

  // ---- coach ----
  function coachLine() {
    if (coachHold && performance.now() < coachHold.until) return coachHold;
    if (finished) return { t: 'Brake set. Your sheet is up.' };
    if (jack) return { t: 'Jackknifed. Pull forward to straighten out.', w: 1, cue: 'fwd' };
    if (bumped) return { t: 'You hit the stop. Ease forward a foot.', w: 1, cue: 'fwd' };
    if (dirty) return { t: 'Over the line. That is an encroachment. Pull up and fix it.', w: 1 };
    if (inBox()) return { t: 'Stop. Rear is in the box. Set the brake to finish.', cue: 'brake' };
    var phi = Math.abs(norm(s.t1 - s.t2)) * 180 / PI;
    if (!guideOn) {
      if (!hasReversed) return { t: L.brief };
      if (docked()) return { t: 'Keep it straight and ease back to the yellow box.' };
      if (phi > 55) return { t: 'Sharp angle. Steer the other way to chase the trailer, or pull up before it jackknifes.', w: 1 };
      return { t: 'Watch the trailer tail, not the cab. Small corrections.' };
    }
    if (needPullUp(L, s)) return { t: 'Not enough room to turn. Center the wheel and hold FWD until the trailer wheels pass the white line.', cue: 'fwd' };
    var a = axle(s), r = recSteer(L, s), diff = r - steer, near = Math.abs(diff) < 0.15;
    var turn = near ? 'Hold the wheel there.' : (diff > 0 ? 'Turn right, to the white mark.' : 'Turn left, to the white mark.');
    var why;
    if (L.kind === 'dock') {
      var upright = norm(s.t2) < -1.3;
      if (a.y < L.turnY - 0.5 && upright)
        return { t: (near ? '' : turn + ' ') + 'Hold REV and back straight until the trailer wheels reach the white line.', cue: 'rev' };
      if (upright && steer < 0.6) return { t: 'Wheels are on the line. Turn the wheel hard right now.', cue: 'rev', w: 1 };
      why = docked() ? 'Ease back to the yellow box.'
        : r > 0.25 ? 'Wheel right pushes the trailer tail left.'
        : r < -0.25 ? 'Now chase the trailer so the cab follows it in.'
        : 'Small corrections. Keep backing.';
    } else if (L.id === 'offset' && a.x > L.lineX + 3) {
      why = r > 0.2 ? 'Wheel right swings the trailer tail left, toward the open lane.'
        : r < -0.2 ? 'Now turn left so the trailer straightens up in the lane.'
        : 'Let it slide over. Keep backing.';
    } else {
      why = r > 0.2 ? 'Wheel right pushes the trailer tail left.'
        : r < -0.2 ? 'Wheel left pushes the trailer tail right.'
        : 'Small corrections. Keep backing to the yellow box.';
    }
    if (!hasReversed && near) return { t: 'Hold REV to back up. Keep the yellow tick on the white mark.', cue: 'rev' };
    return { t: turn + ' ' + why, cue: 'rev' };
  }

  // ---- finish ----
  function setBrake() {
    if (finished || mode !== 'game') return;
    if (!docked()) {
      coachHold = { t: L.kind === 'dock' ? 'Not yet. The whole trailer has to be inside the alley before you set the brake.'
        : 'Not yet. Get the whole trailer into the lane and back to the yellow box.', w: 1, until: performance.now() + 3200 };
      return;
    }
    finished = true; s.v = 0;
    var extra = Math.max(0, pullups - L.free);
    var boxed = inBox();
    var pts = extra + enc * 2 + (boxed ? 0 : 4);
    var deg = Math.abs(norm(L.kind === 'dock' ? s.t2 : s.t2 + PI / 2)) * 180 / PI;
    var pass = pts <= PASS_AT;
    var stars = !pass ? 0 : coachedRun ? 1 : pts <= 1 ? 3 : 2;
    var old = prog[L.id], note;
    if (pass) {
      var rec = old || { stars: 0 };
      if (stars > rec.stars) rec.stars = stars;
      if (!coachedRun && (rec.pts == null || pts < rec.pts || (pts === rec.pts && elapsed < rec.time))) { rec.pts = pts; rec.time = elapsed; }
      prog[L.id] = rec; save('cdl.progress', JSON.stringify(prog));
    }
    var hasNext = li + 1 < LEVELS.length;
    if (!pass) note = 'Pass at ' + PASS_AT + ' points or under. Fewer points is better.';
    else if (coachedRun) note = (old ? '' : hasNext ? LEVELS[li + 1].name + ' is unlocked. ' : '') + 'Turn Coach off and run it solo for more stars.';
    else if (stars < 3) note = 'Solo pass. Get it to 1 point or less for the third star.';
    else note = 'Clean solo run.';

    $('sheet').innerHTML =
      '<div class="sheet-head"><div><h2>Score sheet</h2><small>' + L.name + (coachedRun ? ' · coached' : ' · solo') + '</small></div>' +
      '<div class="stamp ' + (pass ? 'pass' : 'retry') + '">' + (pass ? 'PASS' : 'RETRY') + '</div></div>' +
      '<table>' +
      tr('Pull-ups', pullups + ' (' + L.free + ' free)', extra) +
      tr('Encroachments', enc + ' × 2', enc * 2) +
      tr('Final position', boxed ? 'in stop box' : 'short of box', boxed ? 0 : 4) +
      tr('Trailer angle', deg.toFixed(1) + '° off straight', '') +
      tr('Time', clock(elapsed), '') +
      '<tr class="total"><td>Points</td><td></td><td>' + pts + '</td></tr></table>' +
      '<p class="earned" aria-label="' + stars + ' of 3 stars">' + starStr(stars) + '</p>' +
      '<p class="note">' + note + '</p>' +
      '<div class="btns"><button type="button" id="again"' + (pass && hasNext ? '' : ' class="go"') + '>Again</button>' +
      (pass && hasNext ? '<button type="button" id="next" class="go">Next level</button>' : '<button type="button" id="tomenu">Levels</button>') + '</div>';
    $('sheet').hidden = false;
    $('again').addEventListener('click', reset);
    if ($('next')) $('next').addEventListener('click', function () { startLevel(li + 1); });
    if ($('tomenu')) $('tomenu').addEventListener('click', showMenu);
  }
  function tr(a, b, c) { return '<tr><td>' + a + '</td><td>' + b + '</td><td>' + c + '</td></tr>'; }
  function clock(t) { var m = Math.floor(t / 60), x = Math.floor(t % 60); return m + ':' + (x < 10 ? '0' : '') + x; }

  // ---- drawing: a 3D scene (three.js) with a 2D overlay canvas for labels and the cab interior ----
  var cv = $('cv'), ctx = cv.getContext('2d'), yard = $('yard');
  var view = { w: 1, h: 1, dpr: 1 };
  var T = THREE, renderer = new T.WebGLRenderer({ canvas: $('gl'), antialias: true });
  renderer.autoClear = false; renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  function col(c) { return new T.Color(c).convertSRGBToLinear(); }
  var HORIZON = '#cfdbe0', GROUND_C = col('#2c2f31');
  var world = new T.Scene(), fog = new T.Fog(col(HORIZON), 200, 760), SKY = col(HORIZON);
  world.background = SKY;
  world.add(new T.HemisphereLight(col('#dce8ef'), col('#77726a'), 0.72));
  var sun = new T.DirectionalLight(col('#fff0d6'), 0.95);
  sun.position.set(W / 2 - 60, 115, H / 2 - 80); sun.target.position.set(W / 2, 0, H / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06;
  var sc = sun.shadow.camera; sc.left = -105; sc.right = 105; sc.top = 105; sc.bottom = -105; sc.near = 20; sc.far = 340;
  world.add(sun); world.add(sun.target);

  // ---- materials and painted-on-canvas textures (no image files to host) ----
  var seed = 11;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function canvasTex(w, h, paint) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function speckle(g, w, h, base, n, a) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (var i = 0; i < n; i++) {
      g.fillStyle = (rnd() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (a * (0.4 + rnd())).toFixed(3) + ')';
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  function cracks(g, w, h, n, color) {
    g.strokeStyle = color; g.lineWidth = 1;
    for (var i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y);
      for (var j = 0; j < 6; j++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  }
  var texGround = canvasTex(256, 256, function (g, w, h) { speckle(g, w, h, '#2e3133', 5000, 0.06); cracks(g, w, h, 3, 'rgba(0,0,0,.16)'); });
  texGround.repeat.set(36, 36);
  var texPad = canvasTex(256, 256, function (g, w, h) {
    speckle(g, w, h, '#50555a', 6000, 0.05); cracks(g, w, h, 2, 'rgba(0,0,0,.1)');
    for (var i = 0; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(rnd() * w, 0, 5 + rnd() * 6, h); }      // tyre streaks
  });
  var texSide = canvasTex(512, 128, function (g, w, h) {
    g.fillStyle = '#eef0ee'; g.fillRect(0, 0, w, h);
    for (var x = 0; x < w; x += w / 18) { g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + 2, 0, 2, h); }
    g.fillStyle = '#b9bfc2'; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 9, w, 9);
    var gr = g.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(70,60,45,0)'); gr.addColorStop(1, 'rgba(70,60,45,.22)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.3)'; for (var r = 4; r < w; r += 9) { g.fillRect(r, 3, 1.5, 1.5); g.fillRect(r, h - 5, 1.5, 1.5); }
  });
  var texRear = canvasTex(128, 128, function (g, w, h) {
    g.fillStyle = '#e4e7e5'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8f979b'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#6f777b'; g.fillRect(w / 2 - 1, 0, 2, h);
    [22, 46, 82, 106].forEach(function (x) { g.fillStyle = '#9aa2a6'; g.fillRect(x - 1.5, 6, 3, h - 12); g.fillStyle = '#5d6569'; g.fillRect(x - 4, h * 0.55, 8, 5); });
    [8, 120].forEach(function (x) { for (var y = 14; y < h; y += 26) { g.fillStyle = '#5d6569'; g.fillRect(x - 3, y, 6, 9); } });
  });
  var texShed = canvasTex(256, 256, function (g, w, h) {
    g.fillStyle = '#98a2a6'; g.fillRect(0, 0, w, h);
    for (var x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 3, 0, 1, h); }
    g.fillStyle = '#31566b'; g.fillRect(0, 0, w, 34);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, h - 26, w, 26);
  });
  var texConc = canvasTex(128, 128, function (g, w, h) { speckle(g, w, h, '#9a9d9b', 1500, 0.08); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, 2, h); });
  var texHub = canvasTex(64, 64, function (g) {
    g.fillStyle = '#121416'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#c3c9cc'; g.beginPath(); g.arc(32, 32, 19, 0, 6.3); g.fill();
    g.fillStyle = '#7d8589'; g.beginPath(); g.arc(32, 32, 8, 0, 6.3); g.fill();
    g.fillStyle = '#4b5256'; for (var i = 0; i < 8; i++) { g.beginPath(); g.arc(32 + Math.cos(i * 0.785) * 13.5, 32 + Math.sin(i * 0.785) * 13.5, 1.8, 0, 6.3); g.fill(); }
  });
  var texFence = canvasTex(64, 64, function (g) {
    g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(190,198,202,.95)'; g.lineWidth = 1.2; g.beginPath();
    for (var i = -64; i < 128; i += 8) { g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); }
    g.stroke(); g.fillStyle = '#9aa1a5'; g.fillRect(0, 0, 3, 64); g.fillRect(0, 0, 64, 3);
  });
  var texSky = canvasTex(4, 256, function (g, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#2f6fb3'); gr.addColorStop(0.3, '#6fa3d4'); gr.addColorStop(0.44, '#a9c8e2'); gr.addColorStop(0.5, HORIZON); gr.addColorStop(1, HORIZON);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  function mat(c, o) { var p = { color: col(c), side: T.DoubleSide }; for (var k in (o || {})) p[k] = o[k]; return new T.MeshLambertMaterial(p); }
  function gloss(c, shine, spec) { return new T.MeshPhongMaterial({ color: col(c), shininess: shine, specular: col(spec || '#666666'), side: T.DoubleSide }); }
  function lit(c) { return new T.MeshBasicMaterial({ color: col(c) }); }
  function mapped(t, o) { var p = { map: t, side: T.DoubleSide }; for (var k in (o || {})) p[k] = o[k]; return new T.MeshLambertMaterial(p); }
  var M = {
    ground: mapped(texGround), paint: mat('#f2c230'), white: mat('#f4f5f3'), red: mat('#d8343a'),
    tire: mat('#141618'), hub: mapped(texHub), steel: mat('#3a3f44'), chrome: gloss('#c9d0d4', 90, '#ffffff'),
    cab: gloss('#1f7a6d', 50, '#2a2a2a'), cabDark: gloss('#17594f', 30, '#222222'), glass: gloss('#0d1a21', 120, '#cfe6f5'),
    cone: mat('#ff6a1a'), wall: mapped(texConc), shed: mapped(texShed), door: mat('#2a3034'), mark: mat('#ffffff'), axle: mat('#1f7a6d'),
    amber: lit('#ffb020'), tail: lit('#c81e24'), lamp: lit('#fff6dc'), rubber: mat('#1b1d1f'),
    box: new T.MeshBasicMaterial({ color: col('#f2c230'), transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })
  };
  function padMat(w, d) { var t = texPad.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, w / 32), Math.max(1, d / 32)); return mapped(t); }

  // Model space: x forward, y up, z toward the passenger side. World: x across the pad, z down the pad.
  function bx(parent, lx, ly, lz, x, y, z, m, cast) {
    var g = new T.Mesh(new T.BoxGeometry(lx, ly, lz), m); g.position.set(x, y, z);
    g.castShadow = cast !== false; g.receiveShadow = true; parent.add(g); return g;
  }
  function span(parent, a0, a1, y0, y1, w, z, m, cast) { return bx(parent, a1 - a0, y1 - y0, w, (a0 + a1) / 2, (y0 + y1) / 2, z, m, cast); }
  function prism(parent, pts, width, m) {      // a side profile (x forward, y up) pushed across the body's width
    var sh = new T.Shape(); pts.forEach(function (p, i) { if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); });
    var g = new T.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false }); g.translate(0, 0, -width / 2);
    var me = new T.Mesh(g, m); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me;
  }
  function tube(parent, r, len, x, y, z, m, axis) {
    var g = new T.Mesh(new T.CylinderGeometry(r, r, len, 16), m); g.position.set(x, y, z);
    if (axis === 'x') g.rotation.z = PI / 2; if (axis === 'z') g.rotation.x = PI / 2;
    g.castShadow = true; parent.add(g); return g;
  }
  var wheels = [], spin = 0;
  function tyre(parent, a, b, r, w) {
    var g = new T.Mesh(new T.CylinderGeometry(r, r, w, 22), [M.tire, M.hub, M.hub]); g.rotation.x = PI / 2; g.position.set(a, r, b);
    g.castShadow = true; parent.add(g); wheels.push(g); return g;
  }
  var ground = new T.Mesh(new T.PlaneGeometry(1500, 1500), M.ground); ground.rotation.x = -PI / 2; ground.position.set(W / 2, 0, H / 2);
  ground.receiveShadow = true; world.add(ground);

  // tractor
  var trac = new T.Group(), cabG = new T.Group(), pivots = [];
  [-1.3, 1.3].forEach(function (b) { span(trac, -2.4, 10.5, 2.2, 3, 0.5, b, M.steel); });        // frame rails
  [-3.3, 3.3].forEach(function (b) {
    tyre(trac, 0, b, 1.75, 2);
    span(trac, -2.45, -2.35, 0.5, 2.7, 2, b, M.rubber, false);                                    // mud flaps
    tube(trac, 1.05, 3.4, 7.1, 2.25, b * 0.98, M.chrome, 'x');                                    // fuel tanks
    span(trac, 6.2, 8, 0.9, 1.15, 1.2, b * 1.12, M.steel);                                        // steps
  });
  tube(trac, 1.5, 0.25, 0, 3.25, 0, M.steel);                                                     // fifth wheel
  prism(trac, [[10.5, 2.3], [14.1, 2.3], [14.1, 5], [10.5, 6.2]], 6.6, M.cab);                     // hood
  span(trac, 14.1, 14.22, 2.8, 4.8, 4.4, 0, M.chrome);                                            // grille
  for (var gb = 0; gb < 5; gb++) span(trac, 14.22, 14.26, 2.8, 4.8, 0.12, -1.8 + gb * 0.9, M.steel, false);
  span(trac, 13.9, 14.75, 1.4, 2.45, 8.3, 0, M.chrome);                                           // bumper
  [-2.75, 2.75].forEach(function (b) { span(trac, 14.1, 14.2, 3.2, 3.95, 0.9, b, M.lamp, false); });
  [-3.5, 3.5].forEach(function (b) {
    var p = new T.Group(); p.position.set(L1, 0, b); tyre(p, 0, 0, 1.75, 1.2); trac.add(p); pivots.push(p);
    span(trac, 9.2, 12.9, 3.6, 4.05, 1.7, b, M.cabDark);                                          // fenders
  });
  prism(cabG, [[5, 2.3], [10.5, 2.3], [10.5, 6.3], [10, 9.9], [9.2, 10.5], [5, 11.4]], 8, M.cab);
  span(cabG, 4.75, 5, 2.3, 11.4, 7.4, 0, M.cabDark);
  var ws = bx(cabG, 0.07, 3.1, 7, 10.3, 8.15, 0, M.glass, false); ws.rotation.z = 0.138;           // windshield
  [-4.03, 4.03].forEach(function (b) {
    span(cabG, 7.4, 10, 6.6, 9.5, 0.06, b, M.glass, false);
    span(cabG, 7.2, 7.3, 3, 9.6, 0.05, b, M.cabDark, false);                                      // door seam
    span(cabG, 7.5, 7.9, 5.6, 5.75, 0.1, b, M.chrome, false);                                     // door handle
  });
  [-3.6, 3.6].forEach(function (b) { tube(cabG, 0.28, 10.2, 4.35, 7.4, b, M.chrome); });           // exhaust stacks
  [-4.9, 4.9].forEach(function (b) {
    span(cabG, 10.3, 10.5, 7, 9.2, 0.75, b, M.steel);                                             // mirrors
    span(cabG, 10.36, 10.44, 8.4, 8.5, Math.abs(b) - 4, b * 0.91, M.steel, false);
  });
  for (var ml = 0; ml < 5; ml++) span(cabG, 9.1, 9.3, 10.5, 10.68, 0.35, -2.4 + ml * 1.2, M.amber, false);
  trac.add(cabG); world.add(trac);

  // trailers: the one you pull, and a few parked for scenery
  var trlMats = [], revMat = new T.MeshBasicMaterial({ color: col('#3a3d3f') });
  function buildTrailer(live) {
    var g = new T.Group();
    var side = mapped(texSide), plain = mat('#e3e6e4'), roof = mat('#cfd4d1'), rear = mapped(texRear);
    if (live) trlMats = [side, plain, roof, rear];
    span(g, TL.r, TL.f, 4, 13.5, TL.w, 0, [plain, rear, roof, plain, side, side]);
    [-2.4, 2.4].forEach(function (b) { span(g, TL.r + 0.5, TL.f - 2, 3.4, 4, 0.5, b, M.steel); });
    span(g, -L2 - 6, -L2 + 6, 3.1, 3.4, 4.6, 0, M.steel);                                         // tandem slider
    [-L2 - 2.2, -L2 + 2.2].forEach(function (a) { [-3.3, 3.3].forEach(function (b) { tyre(g, a, b, 1.75, 2); }); });
    [-3.3, 3.3].forEach(function (b) { span(g, -L2 - 4.35, -L2 - 4.25, 0.5, 2.9, 2, b, M.rubber, false); });
    [-2.6, 2.6].forEach(function (b) { span(g, -6.3, -5.9, 0.35, 3.4, 0.4, b, M.steel); span(g, -6.7, -5.5, live ? 1.2 : 0, live ? 1.4 : 0.2, 1, b, M.steel); });
    span(g, -6.2, -6, 2, 2.2, 5.2, 0, M.steel, false);
    span(g, TL.r - 0.25, TL.r + 0.05, 1.9, 2.4, 8, 0, M.steel);                                   // underride bar
    [-1, 1].forEach(function (sd) {
      var z = sd * (TL.w / 2 + 0.03);
      for (var j = 0; j < 12; j++) span(g, TL.r + j * 3, TL.r + j * 3 + 3, 4.05, 4.6, 0.05, z, j % 2 ? M.white : M.red, false);
      span(g, TL.f - 0.5, TL.f - 0.2, 13.1, 13.3, 0.06, z, M.amber, false);
      span(g, TL.r - 0.06, TL.r, 4.6, 5.3, 0.7, sd * 3.6, M.tail, false);                         // tail lights
      span(g, TL.r - 0.06, TL.r, 4.6, 5.3, 0.6, sd * 2.8, live ? revMat : M.white, false);        // reverse lights
    });
    for (var q = 0; q < 6; q++) span(g, TL.r - 0.05, TL.r, 4, 4.5, TL.w / 6, -TL.w / 2 + (q + 0.5) * TL.w / 6, q % 2 ? M.white : M.red, false);
    for (var id = -1; id <= 1; id++) span(g, TL.r - 0.05, TL.r, 13.15, 13.35, 0.3, id * 0.6, M.tail, false);
    return g;
  }
  var trl = buildTrailer(true);
  var axleMark = span(trl, -L2 - 0.5, -L2 + 0.5, 13.5, 13.56, TL.w, 0, M.axle, false);
  world.add(trl);

  // the yard around the pad: sky, warehouse, fence, light poles, parked trailers
  (function () {
    var live = wheels.length;
    var dome = new T.Mesh(new T.SphereGeometry(1000, 24, 12), new T.MeshBasicMaterial({ map: texSky, side: T.BackSide, fog: false }));
    dome.position.set(W / 2, 0, H / 2); world.add(dome);
    var st = texShed.clone(); st.needsUpdate = true; st.repeat.set(7, 1);
    var shed = bx(world, 60, 26, 200, -30, 13, 105, mapped(st));
    for (var k = -4; k <= 4; k++) {
      bx(world, 0.3, 11, 9, 0.12, 9.5, 105 + k * 18, M.door, false);
      bx(world, 0.34, 0.5, 10, 0.14, 15.3, 105 + k * 18, M.paint, false);
    }
    [8, 62, 116].forEach(function (z) {
      tube(world, 0.45, 34, 106, 17, z, M.steel); bx(world, 7, 0.4, 0.4, 102.8, 33.6, z, M.steel);
      bx(world, 2.4, 0.5, 1.4, 99.8, 33.3, z, M.lamp, false); bx(world, 2.2, 1.6, 2.2, 106, 0.8, z, M.wall);
    });
    [16, 32, 64, 80].forEach(function (z, i) {
      var p = buildTrailer(false); p.position.set(150 + (i % 2) * 3, 0, z); p.rotation.y = PI; world.add(p);
    });
    wheels.length = live;      // parked trailers do not roll
    var fm = function (len) { var t = texFence.clone(); t.needsUpdate = true; t.repeat.set(len / 8, 1); return new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.25, side: T.DoubleSide }); };
    [[-60, -70, 190, -70], [190, -70, 190, 200], [190, 200, -60, 200]].forEach(function (f) {
      var len = Math.hypot(f[2] - f[0], f[3] - f[1]), g = new T.Mesh(new T.PlaneGeometry(len, 9), fm(len));
      g.position.set((f[0] + f[2]) / 2, 4.5, (f[1] + f[3]) / 2); g.rotation.y = -Math.atan2(f[3] - f[1], f[2] - f[0]); world.add(g);
    });
    [[260, 30, 70, 30, 120, '#8b8f8a'], [40, -170, 150, 24, 60, '#7f8a90'], [230, -150, 90, 40, 70, '#9a938a'], [270, 190, 110, 22, 90, '#858d92'], [60, 300, 180, 28, 70, '#8f8a84']]
      .forEach(function (d) { bx(world, d[2], d[3], d[4], d[0], d[3] / 2, d[1], mat(d[5]), false); });
  })();

  // tail path: where the trailer tail goes if you hold REV at this steering angle
  var pathG = new T.Group(), dots = [];
  for (var d = 0; d < 22; d++) dots.push(bx(pathG, 1, 0.03, 0.4, 0, 0.09, 0, M.mark, false));
  world.add(pathG);
  function tailPath() {
    var g = { x: s.x, y: s.y, t1: s.t1, t2: s.t2 }, out = [rearPoint(g)];
    for (var i = 0; i < 44; i++) {
      advance(g, -SPEED, steer * MAXD, 0.08);
      if (Math.abs(norm(g.t1 - g.t2)) > JACK) break;
      out.push(rearPoint(g));
    }
    return out;
  }

  // level scenery, rebuilt on every level change
  var levelG = new T.Group(), marksG = new T.Group(), coneM = [];
  world.add(levelG);
  function flat(parent, r, y, m) { var g = bx(parent, r[2] - r[0], 0.02, r[3] - r[1], (r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2, m, false); return g; }
  function stripe(parent, x1, y1, x2, y2, wid, y, m) {
    var len = Math.hypot(x2 - x1, y2 - y1), g = bx(parent, len + wid, 0.02, wid, (x1 + x2) / 2, y, (y1 + y2) / 2, m, false);
    g.rotation.y = -Math.atan2(y2 - y1, x2 - x1); return g;
  }
  function buildLevel() {
    while (levelG.children.length) levelG.remove(levelG.children[0]);
    marksG = new T.Group(); levelG.add(marksG); coneM = [];
    L.zones.forEach(function (r) { flat(levelG, r, 0.02, padMat(r[2] - r[0], r[3] - r[1])).receiveShadow = true; });
    flat(levelG, L.box, 0.05, M.box).receiveShadow = false;
    L.lines.forEach(function (l) { stripe(levelG, l[0], l[1], l[2], l[3], 0.45, 0.06, M.paint); });
    L.walls.forEach(function (r) { bx(levelG, r[2] - r[0], 4.5, r[3] - r[1], (r[0] + r[2]) / 2, 2.25, (r[1] + r[3]) / 2, M.wall); });
    (L.marks || []).forEach(function (mk) {
      var l = mk.line, len = Math.hypot(l[2] - l[0], l[3] - l[1]), n = Math.floor(len / 3.4);
      for (var i = 0; i < n; i++) {
        var a = (i * 3.4) / len, b = (i * 3.4 + 2) / len;
        stripe(marksG, l[0] + (l[2] - l[0]) * a, l[1] + (l[3] - l[1]) * a, l[0] + (l[2] - l[0]) * b, l[1] + (l[3] - l[1]) * b, 0.5, 0.07, M.mark);
      }
    });
    L.cones.forEach(function (k) {
      var g = new T.Group(); g.position.set(k.x, 0, k.y);
      bx(g, 1.7, 0.14, 1.7, 0, 0.07, 0, M.cone);
      var body = new T.Mesh(new T.CylinderGeometry(0.12, 0.7, 2.3, 14), M.cone); body.position.y = 1.25; body.castShadow = true; g.add(body);
      var band = new T.Mesh(new T.CylinderGeometry(0.34, 0.47, 0.5, 14), M.white); band.position.y = 1.35; g.add(band);
      levelG.add(g); coneM.push(g);
    });
    if (L.kind === 'dock') {      // the warehouse the dock belongs to
      [-1, 1].forEach(function (sd) { bx(levelG, 0.5, 1.4, 1, 2.2, 3.6, L.yc + sd * 3, M.rubber, false); });
    }
  }

  // cameras
  var camTop = new T.OrthographicCamera(-50, 50, 61, -61, 1, 600);
  camTop.up.set(0, 0, -1); camTop.position.set(W / 2, 300, H / 2); camTop.lookAt(W / 2, 0, H / 2);
  var camP = new T.PerspectiveCamera(60, 1, 0.3, 900), camYaw = 0.3;
  function seatPos(a, b) { var c = Math.cos(s.t1), n = Math.sin(s.t1); return { x: s.x + a * c - b * n, y: s.y + a * n + b * c }; }
  function topFit(w, h) {
    var asp = w / h, hh = H / 2, hw = hh * asp;
    if (hw < W / 2) { hw = W / 2; hh = hw / asp; }
    camTop.left = -hw; camTop.right = hw; camTop.top = hh; camTop.bottom = -hh; camTop.updateProjectionMatrix();
    return h / (2 * hh);
  }
  function pass(cam, x, y, w, h) {      // rectangle in CSS pixels, y measured from the top
    renderer.setViewport(x, view.h - y - h, w, h); renderer.setScissor(x, view.h - y - h, w, h);
    renderer.setScissorTest(true); renderer.clearDepth(); renderer.render(world, cam);
  }
  // Perspective pass from an eye point. F is the focal length in pixels; flip gives a mirror image.
  function eyePass(p, height, fa, pitch, F, x, y, w, h, flip) {
    camP.position.set(p.x, height, p.y); camP.up.set(0, 1, 0);
    camP.lookAt(p.x + Math.cos(fa), height - Math.tan(pitch), p.y + Math.sin(fa));
    camP.fov = 2 * Math.atan(h / (2 * F)) * 180 / PI; camP.aspect = w / h; camP.updateProjectionMatrix();
    if (flip) { camP.projectionMatrix.elements[0] *= -1; camP.projectionMatrixInverse.copy(camP.projectionMatrix).invert(); }
    world.fog = fog; pass(camP, x, y, w, h); world.fog = null;
  }
  function topPass(x, y, w, h) { world.background = GROUND_C; var k = topFit(w, h); pass(camTop, x, y, w, h); world.background = SKY; return k; }

  function fit() {
    var r = yard.getBoundingClientRect();
    view.w = Math.max(1, Math.round(r.width)); view.h = Math.max(1, Math.round(r.height));
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(view.dpr); renderer.setSize(view.w, view.h, false);
    cv.width = view.w * view.dpr; cv.height = view.h * view.dpr;
  }
  function sync() {
    trac.position.set(s.x, 0, s.y); trac.rotation.y = -s.t1;
    trl.position.set(s.x, 0, s.y); trl.rotation.y = -s.t2;
    pivots.forEach(function (p) { p.rotation.y = -steer * MAXD; });
    var glow = dirty || bumped ? 0x5a0c10 : 0x000000;
    trlMats.forEach(function (tm) { tm.emissive.setHex(glow); });
    revMat.color.copy(col(s.v < -0.05 ? '#ffffff' : '#3a3d3f'));
    spin -= s.v * 0.0095; wheels.forEach(function (wh) { wh.rotation.y = spin; });
    cones.forEach(function (k, i) {
      var g = coneM[i]; if (!g) return;
      g.rotation.x = k.hit ? PI / 2 : 0; g.position.y = k.hit ? 0.7 : 0;
    });
    var show = guideOn && !finished;
    marksG.visible = show; pathG.visible = show; axleMark.visible = show;
    if (show) {
      var tp = tailPath();
      dots.forEach(function (m, i) {
        var a = tp[i * 2], b = tp[i * 2 + 1];
        m.visible = !!(a && b); if (!m.visible) return;
        m.position.set((a.x + b.x) / 2, 0.09, (a.y + b.y) / 2);
        m.scale.x = Math.max(0.1, Math.hypot(b.x - a.x, b.y - a.y)); m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      });
    }
  }
  function draw() {
    var w = view.w, h = view.h, dpr = view.dpr, vw = cv.width, vh = cv.height;
    sync();
    renderer.setScissorTest(false); renderer.clear(); renderer.shadowMap.needsUpdate = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, vw, vh);
    var coached = guideOn && !finished;

    if (viewMode === 'top') {
      cabG.visible = true;
      var k = topPass(0, 0, w, h) * dpr, ox = vw / 2 - W / 2 * k, oy = vh / 2 - H / 2 * k;
      ctx.setTransform(k, 0, 0, k, ox, oy);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 2.6px "Barlow Condensed", "Arial Narrow", sans-serif';
      (L.labels || []).forEach(function (t) { if (!t.hide) ctx.fillText(t.t, t.x, t.y); });
      if (coached) (L.marks || []).forEach(function (mk) { ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(mk.t, mk.line[0], mk.line[1] - 2); });
      return;
    }
    var seat = viewMode === 'seat', m = 8;
    if (!seat) {
      // head out the driver's window, looking back down the trailer
      var e = seatPos(10, -5.3), c2 = Math.cos(s.t2), n2 = Math.sin(s.t2);
      var rcx = s.x + TL.r * c2 + (TL.w / 2) * n2, rcy = s.y + TL.r * n2 - (TL.w / 2) * c2;
      var want = norm(Math.atan2(rcy - e.y, rcx - e.x) - (s.t1 + PI)) + 0.3;
      want = Math.max(-0.02, Math.min(1.65, want));      // the head cannot follow to the blind side
      camYaw += (want - camYaw) * 0.08;
      cabG.visible = true;
      eyePass(e, 7.6, s.t1 + PI + camYaw, 0.2, w * 0.62, 0, 0, w, h);
      caption('DRIVER WINDOW, LOOKING BACK');
      var r = Math.min(vw, vh) * 0.14;
      wheelGfx(vw - r * 1.3 - 14 * dpr, vh - r * 1.1 - 14 * dpr, r);
    } else {
      // in the seat: windshield ahead, a mirror on each side for what is behind
      cabG.visible = false;
      eyePass(seatPos(8.6, -2), 8.3, s.t1, 0.1, w * 0.55, 0, 0, w, h);
      var dashY = vh * 0.76;
      ctx.fillStyle = '#131517'; ctx.fillRect(0, dashY, vw, vh - dashY);
      ctx.fillStyle = '#2a2e32'; ctx.fillRect(0, dashY, vw, 3 * dpr);
      ctx.fillStyle = '#0b0d0e';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vw * 0.035, 0); ctx.lineTo(vw * 0.015, dashY); ctx.lineTo(0, dashY); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(vw, 0); ctx.lineTo(vw * 0.965, 0); ctx.lineTo(vw * 0.985, dashY); ctx.lineTo(vw, dashY); ctx.closePath(); ctx.fill();
      [{ x: 0.045, y: 0.15, w: 0.3, h: 0.46, b: -5.4, yaw: 0.14, t: 'LEFT MIRROR' },
       { x: 0.725, y: 0.15, w: 0.23, h: 0.38, b: 5.4, yaw: -0.14, t: 'RIGHT' }].forEach(function (mr) {
        var mx = Math.round(w * mr.x), my = Math.round(h * mr.y), mw = Math.round(w * mr.w), mh = Math.round(h * mr.h);
        eyePass(seatPos(10.6, mr.b), 7.4, s.t1 + PI + mr.yaw, 0.14, mw * 1.05, mx, my, mw, mh, true);
        ctx.strokeStyle = '#0b0d0e'; ctx.lineWidth = 5 * dpr; ctx.strokeRect(mx * dpr, my * dpr, mw * dpr, mh * dpr);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = '600 ' + Math.round(10 * dpr) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(mr.t, (mx + 5) * dpr, (my + mh - 6) * dpr);
      });
      wheelGfx(vw * 0.36, vh * 0.99, vh * 0.2);
    }
    if (coached) {      // coached: keep a small overhead map in view
      var ph = seat ? Math.round(h * 0.22) : Math.round(Math.min(w * 0.28, 150) * H / W), pw = Math.round(ph * W / H);
      var px = w - pw - m, py = seat ? h - ph - m : m;
      cabG.visible = true; topPass(px, py, pw, ph);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(px * dpr, py * dpr, pw * dpr, ph * dpr);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = dpr; ctx.strokeRect(px * dpr, py * dpr, pw * dpr, ph * dpr);
    }
  }
  // The steering wheel, drawn on the overlay. The white notch is where the coach wants the yellow mark.
  function wheelGfx(x, y, r) {
    var K = 120 * PI / 180;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, x, y); ctx.lineCap = 'round';
    if (guideOn && !finished) {
      var ta = recSteer(L, s) * K - PI / 2;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.1; ctx.beginPath();
      ctx.moveTo(Math.cos(ta) * r * 1.06, Math.sin(ta) * r * 1.06); ctx.lineTo(Math.cos(ta) * r * 1.3, Math.sin(ta) * r * 1.3); ctx.stroke();
    }
    ctx.rotate(steer * K);
    ctx.strokeStyle = '#0b0d0e'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = '#3a4046'; ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 6.3); ctx.stroke();
    ctx.strokeStyle = '#0b0d0e'; ctx.lineWidth = r * 0.17; ctx.beginPath();
    ctx.moveTo(-r * 0.84, 0); ctx.lineTo(r * 0.84, 0); ctx.moveTo(0, 0); ctx.lineTo(0, r * 0.84); ctx.stroke();
    ctx.fillStyle = '#0b0d0e'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, 6.3); ctx.fill();
    ctx.fillStyle = C.paint; ctx.fillRect(-r * 0.07, -r * 1.02, r * 0.14, r * 0.24);
    ctx.restore(); ctx.lineCap = 'butt';
  }
  function caption(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + Math.round(12 * view.dpr) + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(t, 10 * view.dpr, cv.height - 10 * view.dpr);
  }
  function setView(m) {
    viewMode = m;
    $('v-top').setAttribute('aria-pressed', m === 'top');
    $('v-cab').setAttribute('aria-pressed', m === 'cab');
    $('v-seat').setAttribute('aria-pressed', m === 'seat');
    save('alleydock.view', m);
  }
  function setCoach(on) {
    guideOn = on;
    var b = $('b-guide'); b.setAttribute('aria-pressed', on); b.textContent = on ? 'Coach on' : 'Coach off';
    save('cdl.coach', on ? 'on' : 'off');
    if (mode === 'game') { if (!started) coachedRun = on; else if (on) coachedRun = true; }
  }

  // ---- HUD ----
  var el = { pull: $('s-pull'), enc: $('s-enc'), time: $('s-time'), coach: $('coach'), wheel: $('wheel'), gauge: $('gauge'),
             steer: $('steer'), target: $('target'), rev: $('p-rev'), fwd: $('p-fwd'), brake: $('b-brake') };
  function put(node, v) { if (node.textContent !== v) node.textContent = v; }
  function hud() {
    put(el.pull, String(pullups)); el.pull.classList.toggle('hot', pullups > L.free);
    put(el.enc, String(enc)); el.enc.classList.toggle('hot', enc > 0);
    put(el.time, clock(elapsed));
    var c = coachLine(); put(el.coach, c.t); el.coach.classList.toggle('warn', !!c.w);
    var show = guideOn && !finished;
    el.target.hidden = !show;
    if (show) el.target.style.left = (50 + recSteer(L, s) * 47).toFixed(1) + '%';
    el.rev.classList.toggle('cue', show && c.cue === 'rev' && ptrDrive !== -1 && !keys.ArrowDown);
    el.fwd.classList.toggle('cue', show && c.cue === 'fwd' && ptrDrive !== 1 && !keys.ArrowUp);
    el.brake.classList.toggle('cue', !finished && c.cue === 'brake');
  }
  function setSteer(v) {
    steer = Math.max(-1, Math.min(1, v));
    el.wheel.style.transform = 'rotate(' + (steer * 200).toFixed(1) + 'deg)';
    el.gauge.style.left = (50 + steer * 47).toFixed(1) + '%';
    el.steer.setAttribute('aria-valuenow', Math.round(steer * 100));
  }

  // ---- input ----
  (function () {
    var drag = null;
    el.steer.addEventListener('pointerdown', function (e) {
      if (finished) return;
      e.preventDefault(); el.steer.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, v: steer, w: el.steer.getBoundingClientRect().width };
    });
    el.steer.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      setSteer(drag.v + (e.clientX - drag.x) / (drag.w * 0.36));
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) {
      el.steer.addEventListener(n, function (e) { if (drag && e.pointerId === drag.id) drag = null; });
    });
  })();
  function hold(node, dir) {
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault(); node.setPointerCapture(e.pointerId); ptrDrive = dir; node.classList.add('down');
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) {
      node.addEventListener(n, function () { if (ptrDrive === dir) ptrDrive = 0; node.classList.remove('down'); });
    });
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  hold(el.rev, -1);
  hold(el.fwd, 1);
  $('v-top').addEventListener('click', function () { setView('top'); });
  $('v-cab').addEventListener('click', function () { setView('cab'); });
  $('v-seat').addEventListener('click', function () { setView('seat'); });
  $('b-brake').addEventListener('click', setBrake);
  $('b-center').addEventListener('click', function () { if (!finished) setSteer(0); });
  $('b-reset').addEventListener('click', reset);
  $('b-guide').addEventListener('click', function () { setCoach(!guideOn); });
  $('b-levels').addEventListener('click', showMenu);
  $('levels').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.lvl') : null;
    if (b && !b.disabled) startLevel(+b.getAttribute('data-i'));
  });
  window.addEventListener('keydown', function (e) {
    if (mode !== 'game') return;
    if (e.key.indexOf('Arrow') === 0) { keys[e.key] = true; e.preventDefault(); }
    else if (e.key === ' ') { e.preventDefault(); if (!e.repeat) setBrake(); }
    else if (e.key === 'c' || e.key === 'C') { if (!finished) setSteer(0); }
    else if (e.key === 'r' || e.key === 'R') { reset(); }
    else if (e.key === 'v' || e.key === 'V') { setView(viewMode === 'top' ? 'cab' : viewMode === 'cab' ? 'seat' : 'top'); }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });
  window.addEventListener('blur', function () { keys = {}; ptrDrive = 0; });

  // ---- loop ----
  function start() {
    reset(); setView(viewMode); setCoach(guideOn); showMenu();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(yard); else window.addEventListener('resize', fit);
    var last = performance.now();
    (function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (mode === 'game') {
        step(dt);
        if (started && !finished) elapsed += dt;
        draw(); hud();
      }
      requestAnimationFrame(frame);
    })(last);
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
