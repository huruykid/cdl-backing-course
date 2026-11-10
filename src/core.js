  // ---- world, in feet ----
  var W = 100, H = 122, PI = Math.PI;
  var L1 = 11, L2 = 28, MAXD = 0.7, SPEED = 3.5, FWD_SPEED = 5,      // ft/s: backing is near idle; pulling up is a little quicker
       JACK = 1.4, CONE_R = 0.8, PASS_AT = 6;
  var TR = { f: 14, r: -2, w: 8 };       // tractor body, measured from the drive axle
  var TL = { f: 3, r: -33, w: 8.5 };     // trailer body, measured from the kingpin

  function norm(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }
  function corners(x, y, t, b) {
    var c = Math.cos(t), n = Math.sin(t), h = b.w / 2;
    return [[b.f, h], [b.f, -h], [b.r, -h], [b.r, h]].map(function (p) {
      return { x: x + p[0] * c - p[1] * n, y: y + p[0] * n + p[1] * c };
    });
  }
  function inRect(p, r) { return p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3]; }
  function coneIn(k, x, y, t, b) {
    var dx = k.x - x, dy = k.y - y, c = Math.cos(t), n = Math.sin(t);
    var a = dx * c + dy * n, q = -dx * n + dy * c;
    return a >= b.r - CONE_R && a <= b.f + CONE_R && Math.abs(q) <= b.w / 2 + CONE_R;
  }
  function axle(st) { return { x: st.x - L2 * Math.cos(st.t2), y: st.y - L2 * Math.sin(st.t2) }; }
  function rearPoint(st) { return { x: st.x + TL.r * Math.cos(st.t2), y: st.y + TL.r * Math.sin(st.t2) }; }
  function advance(st, v, d, dt) {
    st.x += v * Math.cos(st.t1) * dt;
    st.y += v * Math.sin(st.t1) * dt;
    st.t1 += v / L1 * Math.tan(d) * dt;
    st.t2 += v / L2 * Math.sin(st.t1 - st.t2) * dt;
  }

  // ---- levels ----
  function row(x1, y1, x2, y2, n) {
    var out = [];
    for (var i = 0; i <= n; i++) out.push({ x: x1 + (x2 - x1) * i / n, y: y1 + (y2 - y1) * i / n });
    return out;
  }
  function laneLevel(o) {
    var x0 = o.lane[0], x1 = o.lane[1], yb = 118;
    o.kind = 'lane';
    o.box = [x0, yb - 6, x1, yb];
    o.walls = [[x0 - 4, yb, x1 + 4, H]];
    o.lineX = (x0 + x1) / 2;
    o.lines.push([x0, yb - 6, x1, yb - 6]);
    return o;
  }
  function dockLevel(o) {
    var yc = 105, y0 = yc - o.width / 2, y1 = yc + o.width / 2, m = 42, d = 2, b = d + o.boxDepth;
    o.kind = 'dock';
    o.start = { x: 70, y: 44, t1: -PI / 2, t2: -PI / 2 };
    o.zones = [[m, 2, 98, 120], [d, y0, m, y1]];
    o.lines = [[m, y0, m, 2], [m, 2, 98, 2], [98, 2, 98, 120], [98, 120, m, 120], [m, 120, m, y1], [m, y1, d, y1], [m, y0, d, y0], [b, y0, b, y1]];
    o.cones = row(m, y0, 10, y0, 4).concat(row(m, y1, 10, y1, 4));
    o.box = [d, y0, b, y1];
    o.dockZone = [d - 0.01, y0, m, y1];
    o.walls = [[0, y0 - 3, d, y1 + 3]];
    o.yc = yc; o.turnY = yc - 29; o.laneX = 70;
    o.marks = [{ line: [m + 2, o.turnY, 92, o.turnY], t: 'TURN POINT' }];
    o.labels = [{ t: 'ALLEY  ' + o.width + ' × 40 FT', x: 23, y: y0 - 3.2 }, { t: 'STOP BOX  ' + o.boxDepth + ' FT', x: 13, y: y1 + 3.2 }];
    return o;
  }
  var LEVELS = [
    laneLevel({
      id: 'straight', name: 'Straight Back', sub: 'Back down a wide lane and stop in the box.',
      brief: 'Back straight down the lane and stop with the trailer rear in the yellow box.',
      free: 1, lane: [61, 79],
      start: { x: 71, y: 30, t1: -PI / 2 - 0.05, t2: -PI / 2 + 0.06 },
      zones: [[61, 2, 79, 118]],
      lines: [[61, 2, 61, 118], [79, 2, 79, 118], [61, 2, 79, 2], [61, 118, 79, 118]],
      cones: row(61, 70, 61, 118, 4).concat(row(79, 70, 79, 118, 4)),
      dockZone: [61, 60, 79, 118.01],
      labels: [{ t: 'LANE  18 FT', x: 70, y: 124, hide: 1 }]
    }),
    laneLevel({
      id: 'offset', name: 'Offset Back', sub: 'Start in the right lane, back into the left one.',
      brief: 'Back out of the right lane and into the left lane. Stop with the trailer rear in the yellow box.',
      free: 2, lane: [53, 71],
      start: { x: 77, y: 20, t1: -PI / 2, t2: -PI / 2 },
      zones: [[53, 2, 98, 84], [53, 84, 71, 118]],
      lines: [[53, 2, 53, 118], [53, 2, 98, 2], [98, 2, 98, 84], [98, 84, 71, 84], [71, 84, 71, 118], [53, 118, 71, 118]],
      cones: row(71, 84, 98, 84, 3).concat(row(71, 95.3, 71, 118, 2)),
      dockZone: [53, 60, 71, 118.01],
      labels: []
    }),
    dockLevel({ id: 'wide', name: 'Wide Dock', sub: 'A 90° back into a 20-foot alley.', brief: 'Back the trailer into the alley on your left and stop with its rear in the yellow box.', free: 4, width: 20, boxDepth: 6 }),
    dockLevel({ id: 'alley', name: 'Alley Dock', sub: 'The real thing: 12 feet wide, 3-foot stop box.', brief: 'Back the trailer into the alley on your left and stop with its rear in the yellow box.', free: 2, width: 12, boxDepth: 3 })
  ];

  function inBounds(L, p) { return L.zones.some(function (r) { return inRect(p, r); }); }
  function hardStop(L, p) {
    return p.x < 0 || p.x > W || p.y < 0 || p.y > H || L.walls.some(function (r) { return inRect(p, r); });
  }
  function isDocked(L, st) { return corners(st.x, st.y, st.t2, TL).every(function (p) { return inRect(p, L.dockZone); }); }
  function isBoxed(L, st) { var r = rearPoint(st); return isDocked(L, st) && inRect(r, [L.box[0] - 0.5, L.box[1] - 0.5, L.box[2] + 0.5, L.box[3] + 0.5]); }

  // ---- coach: the steering a good backer would hold right now ----
  function needPullUp(L, st) {
    if (L.kind !== 'dock') return false;
    var a = axle(st);
    return norm(st.t2) < -1.48 && Math.abs(norm(st.t1 - st.t2)) < 0.1 && a.y > L.turnY + 6 && a.x > 60;
  }
  function recSteer(L, st) {
    if (needPullUp(L, st)) return 0;
    var a = axle(st), want;
    if (L.kind === 'dock') {
      want = Math.atan2(a.y - L.yc, 18);
      if (a.y < L.turnY) want = -PI / 2 + Math.atan2(a.x - L.laneX, 20);
    } else {
      want = -PI / 2 + Math.atan2(a.x - L.lineX, L.id === 'offset' ? 22 : 18);
    }
    var err = norm(want - st.t2), phi = norm(st.t1 - st.t2);
    var aim = Math.max(-1, Math.min(1, -3 * err));
    var d = Math.atan(L1 * (Math.sin(phi) / L2 + 0.25 * (phi - aim)));
    return Math.max(-1, Math.min(1, d / MAXD));
  }
