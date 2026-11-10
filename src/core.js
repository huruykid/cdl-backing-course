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
    var bd = o.boxDepth || 6;
    o.box = [x0, yb - bd, x1, yb];
    o.walls = [[x0 - 4, yb, x1 + 4, H]];
    o.lineX = (x0 + x1) / 2;
    o.lines.push([x0, yb - bd, x1, yb - bd]);
    return o;
  }
  function dockLevel(o) {
    var yc = 105, y0 = yc - o.width / 2, y1 = yc + o.width / 2, m = 42, d = 2, b = d + o.boxDepth;
    o.kind = 'dock'; o.looksFree = 2;
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
  // Forward Offset: where the tractor's front should be aimed, so the trailer ends up in the left lane
  function offsetPath(st) {
    // swing the cab wide left of the zone's centre, then settle on it so the trailer straightens
    return 54 - 7 * Math.max(0, Math.min(1, (st.y - 52) / 6));
  }
  var LEVELS = [
    {
      id: 'fstop', group: 'Core control drills', name: 'Forward Stop', sub: 'Drive down the lane and stop with the front bumper in the box.',
      brief: 'Drive forward down the lane and stop with the front bumper in the yellow box. You get one stop.',
      kind: 'lane', dir: 'fwd', finish: 'front', count: 'stops', free: 1, lineX: 70,
      start: { x: 70.6, y: 82, t1: -PI / 2 + 0.05, t2: -PI / 2 - 0.03 },
      zones: [[62, 4, 78, 118]],
      lines: [[62, 4, 62, 118], [78, 4, 78, 118], [62, 4, 78, 4], [62, 118, 78, 118], [62, 9, 78, 9]],
      cones: row(62, 4, 62, 44, 4).concat(row(78, 4, 78, 44, 4)),
      box: [62, 4, 78, 9], dockZone: [62, 4, 78, 118], walls: [],
      notIn: 'The truck is outside the lane.', posOk: 'front in stop box', posBad: 'front not in box',
      labels: [{ t: 'STOP BOX  5 FT', x: 70, y: 1.6 }]
    },
    laneLevel({
      id: 'straight', group: 'Core control drills', name: 'Straight Back', sub: 'Back down a wide lane and stop in the box.',
      brief: 'Back straight down the lane and stop with the trailer rear in the yellow box.',
      free: 1, looksFree: 1, lane: [61, 79],
      start: { x: 71, y: 30, t1: -PI / 2 - 0.05, t2: -PI / 2 + 0.06 },
      zones: [[61, 2, 79, 118]],
      lines: [[61, 2, 61, 118], [79, 2, 79, 118], [61, 2, 79, 2], [61, 118, 79, 118]],
      cones: row(61, 70, 61, 118, 4).concat(row(79, 70, 79, 118, 4)),
      dockZone: [61, 60, 79, 118.01],
      labels: [{ t: 'LANE  18 FT', x: 70, y: 124, hide: 1 }]
    }),
    {
      id: 'foffset', group: 'Core control drills', name: 'Forward Offset', sub: 'Drive forward and move over one lane without cutting the corner.',
      brief: 'Drive forward and move into the left lane. Keep the trailer wheels right of the white line until they pass the cone, then stop in the yellow zone.',
      kind: 'lane', dir: 'fwd', finish: 'park', count: 'backups', free: 0, lineX: 54, path: offsetPath, look: 20,
      start: { x: 66, y: 86, t1: -PI / 2, t2: -PI / 2 },
      zones: [[59, 96, 73, 120], [38, 4, 73, 96]],
      lines: [[59, 120, 59, 96], [59, 96, 38, 96], [38, 96, 38, 4], [38, 4, 73, 4], [73, 4, 73, 120], [73, 120, 59, 120], [63, 4, 63, 80], [45, 80, 63, 80], [45, 4, 45, 80]],
      cones: [{ x: 59, y: 96 }, { x: 73, y: 96 }, { x: 59, y: 108 }, { x: 45, y: 4 }, { x: 63, y: 4 }],
      box: [45, 4, 63, 80], dockZone: [45, 4, 63, 80], walls: [],
      gate: { y: 96, x0: 68 },
      notIn: 'The whole truck has to be inside the yellow zone first.', posOk: 'in the lane', posBad: 'out of position',
      labels: [{ t: 'STOP ZONE', x: 54, y: 83.5 }, { t: 'TRACKING LINE', x: 66, y: 123.5, hide: 1 }]
    },
    laneLevel({
      id: 'offset', group: 'Core control drills', name: 'Reverse Offset', sub: 'Back from the right lane into the left one and stop in the 3-foot box.',
      brief: 'Back out of the right lane and into the left lane. Stop with the trailer rear in the 3-foot yellow box.',
      free: 2, looksFree: 2, lane: [53, 71], boxDepth: 3,
      start: { x: 77, y: 20, t1: -PI / 2, t2: -PI / 2 },
      zones: [[53, 2, 98, 84], [53, 84, 71, 118]],
      lines: [[53, 2, 53, 118], [53, 2, 98, 2], [98, 2, 98, 84], [98, 84, 71, 84], [71, 84, 71, 118], [53, 118, 71, 118]],
      cones: row(71, 84, 98, 84, 3).concat(row(71, 95.3, 71, 118, 2)),
      dockZone: [53, 60, 71, 118.01],
      labels: []
    }),
    dockLevel({ id: 'wide', group: 'Docking challenges', name: 'Wide Dock', sub: 'A 90° back into a 20-foot alley.', brief: 'Back the trailer into the alley on your left and stop with its rear in the yellow box.', free: 4, width: 20, boxDepth: 6 }),
    dockLevel({ id: 'alley', group: 'Docking challenges', name: 'Alley Dock', sub: 'A 90° back into a 12-foot alley with a 3-foot stop box.', brief: 'Back the trailer into the alley on your left and stop with its rear in the yellow box.', free: 2, width: 12, boxDepth: 3 })
  ];

  function inBounds(L, p) { return L.zones.some(function (r) { return inRect(p, r); }); }
  function hardStop(L, p) {
    return p.x < 0 || p.x > W || p.y < 0 || p.y > H || L.walls.some(function (r) { return inRect(p, r); });
  }
  function allCorners(st) { return corners(st.x, st.y, st.t1, TR).concat(corners(st.x, st.y, st.t2, TL)); }
  function frontPoint(st) { return { x: st.x + TR.f * Math.cos(st.t1), y: st.y + TR.f * Math.sin(st.t1) }; }
  // Backing drills finish on the trailer; forward drills finish on the whole truck.
  function isDocked(L, st) {
    var pts = L.dir === 'fwd' ? allCorners(st) : corners(st.x, st.y, st.t2, TL);
    return pts.every(function (p) { return inRect(p, L.dockZone); });
  }
  function isBoxed(L, st) {
    if (!isDocked(L, st)) return false;
    if (L.finish === 'park') return Math.abs(norm(st.t2 + PI / 2)) < 0.14 && Math.abs(norm(st.t1 + PI / 2)) < 0.14;      // parked parallel, within 8 degrees
    var r = L.finish === 'front' ? frontPoint(st) : rearPoint(st);
    return inRect(r, [L.box[0] - 0.5, L.box[1] - 0.5, L.box[2] + 0.5, L.box[3] + 0.5]);
  }
  // The outer edge of the trailer's right rear tyre, for the tracking line.
  function rightTire(st) { var a = axle(st); return { x: a.x - 4.25 * Math.sin(st.t2), y: a.y + 4.25 * Math.cos(st.t2) }; }

  // ---- coach: the steering a good backer would hold right now ----
  function needPullUp(L, st) {
    if (L.kind !== 'dock') return false;
    var a = axle(st);
    return norm(st.t2) < -1.48 && Math.abs(norm(st.t1 - st.t2)) < 0.1 && a.y > L.turnY + 6 && a.x > 60;
  }
  function recSteer(L, st) {
    if (L.dir === 'fwd') {      // aim the tractor's front axle at the line
      var fx = st.x + L1 * Math.cos(st.t1), tx = L.path ? L.path(st) : L.lineX;
      var wantF = -PI / 2 - Math.atan2(fx - tx, L.look || 22);
      return Math.max(-1, Math.min(1, 2.2 * norm(wantF - st.t1) / MAXD));
    }
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
