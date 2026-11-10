const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
function game(saved = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, textContent: '', innerHTML: '', style: {},
      classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, focus() {} });
    return nodes.get(id);
  };
  const storage = { ...saved };
  const g = vm.createContext({ console, Math, performance: { now: () => 1000 },
    localStorage: { getItem: k => storage[k] || null, setItem: (k, v) => storage[k] = v },
    document: { documentElement: {}, body: { classList: { add() {}, remove() {} } }, getElementById: node, querySelector: () => ({ value: 'new' }), hidden: false }, window: { scrollTo() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '#000000' }) });
  vm.runInContext(source('core.js') + source('experience.js') + source('ui.js').split('  // ---- drawing:')[0], g);
  g.setSteer = value => { g.steer = Math.max(-1, Math.min(1, value)); };
  g.setView = value => { g.viewMode = value; };
  g.buildLevel = () => {}; g.fit = () => {};
  g.nodes = nodes; g.storage = storage;
  g.startLevel(0); g.beginDrill();
  return g;
}
function drive(g, direction, seconds, autoSteer = false) {
  g.ptrDrive = direction;
  for (let i = 0; i < seconds * 60; i++) {
    if (autoSteer) g.setSteer(g.recSteer(g.L, g.s));
    g.step(1 / 60); g.elapsed += 1 / 60; g.recordTick(1 / 60);
  }
  g.ptrDrive = 0;
}

test('reset clears held keys, throttle, replay and tutorial position', () => {
  const g = game(); g.startTutorial(); g.tut.i = 5; g.keys.ArrowUp = true; g.ptrDrive = 1;
  g.reset(); assert.equal(g.tut.i, 0); assert.equal(g.ptrDrive, 0); assert.equal(Object.keys(g.keys).length, 0);
  assert.equal(g.history.length, 1); assert.equal(g.s.v, 0);
});
test('parking brake counts the final Forward Stop exactly once', () => {
  const g = game();
  g.s = { x: 70, y: 21, t1: -Math.PI / 2, t2: -Math.PI / 2, v: 1 };
  g.started = true; g.moving = true; g.setBrake();
  assert.equal(g.pullups, 1); assert.equal(g.finished, true); assert.equal(g.prog.fstop.stars, 1);
  g.setBrake(); assert.equal(g.pullups, 1);
});
test('a stopped truck is not counted a second time by parking brake', () => {
  const g = game(); g.s = { x: 70, y: 21, t1: -Math.PI / 2, t2: -Math.PI / 2, v: 0.01 };
  g.started = true; g.moving = true; g.step(1 / 60); assert.equal(g.pullups, 1);
  g.setBrake(); assert.equal(g.pullups, 1);
});
test('incomplete backing attempt requires confirmation and cannot unlock a level', () => {
  const g = game(); g.startLevel(1); g.beginDrill(); g.setBrake(); assert.equal(g.finished, false);
  g.setBrake(); assert.equal(g.finished, true); assert.equal(g.prog.straight, undefined);
});
test('short throttle taps do not count as a pull-up, sustained forward travel does', () => {
  const g = game(); g.startLevel(1); g.beginDrill(); drive(g, -1, 2); drive(g, 1, 0.1);
  assert.equal(g.pullups, 0); drive(g, 1, 2); assert.equal(g.pullups, 1);
  drive(g, 1, 2); assert.equal(g.pullups, 1);
});
test('get out requires a stop and blocks steering and driving', () => {
  const g = game(); g.startLevel(1); g.beginDrill(); g.ptrDrive = 1; g.toggleLook(); assert.equal(g.looking, false);
  g.releaseControls(); g.toggleLook(); assert.equal(g.looking, true); assert.equal(g.looks, 1);
  g.keys.ArrowRight = true; g.keys.ArrowUp = true; const old = JSON.stringify(g.s); g.step(1 / 60);
  assert.equal(JSON.stringify(g.s), old); assert.equal(g.steer, 0);
});
test('replay restores final vehicle, cones, view and score without saving progress again', () => {
  const g = game(); drive(g, 1, 3, true); g.finished = true; g.s.v = 0; g.viewMode = 'seat';
  const final = JSON.stringify(g.snapshot()); const progress = JSON.stringify(g.prog);
  g.startReplay(); assert.equal(g.viewMode, 'top'); assert.ok(g.replay);
  g.replayTick(0.5); assert.notEqual(JSON.stringify(g.snapshot()), final);
  g.stopReplay(); assert.equal(JSON.stringify(g.snapshot()), final);
  assert.equal(g.viewMode, 'seat'); assert.equal(JSON.stringify(g.prog), progress);
});
test('pause clears inputs and resume does not restore held throttle', () => {
  const g = game(); g.ptrDrive = 1; g.keys.ArrowUp = true; g.pauseGame();
  assert.equal(g.paused, true); assert.equal(g.ptrDrive, 0); g.resumeGame();
  assert.equal(g.paused, false); assert.equal(g.ptrDrive, 0); assert.equal(Object.keys(g.keys).length, 0);
});
test('replay memory is bounded to twenty minutes at ten samples per second', () => {
  const g = game(); for (let i = 0; i < 12500; i++) g.recordTick(0.1);
  assert.equal(g.history.length, 12000);
});
for (let level = 0; level < 6; level++) {
  test('coach can reach the finish in ' + ['Forward Stop','Straight Back','Forward Offset','Reverse Offset','Wide Dock','Alley Dock'][level], () => {
    const g = game(); g.startLevel(level); g.beginDrill();
    let ticks = 0;
    while (!g.inBox() && ticks < 60 * 180) {
      g.setSteer(g.recSteer(g.L, g.s));
      g.ptrDrive = g.L.dir === 'fwd' || g.needPullUp(g.L, g.s) ? 0.6 : -0.6;
      g.step(1 / 60); ticks++;
    }
    assert.ok(g.inBox(), `never reached finish: ${JSON.stringify(g.s)}, encroachments ${g.enc}`);
    g.setBrake(); assert.ok(g.prog[g.L.id], 'coached run must pass, encroachments: ' + g.enc);
  });
}

test('setting the brake at the starting line never awards a pass', () => {
  const g = game(); g.setBrake(); assert.equal(g.finished, true); assert.equal(g.prog.fstop, undefined);
});
test('stopping outside the yellow box fails even with points below the threshold', () => {
  const g = game(); drive(g, 1, 3, true); g.setBrake();
  assert.equal(g.finished, true); assert.equal(g.prog.fstop, undefined);
});

test('pedals only accept their captured pointer and canceled holds cannot resume on hover', () => {
  const g = game();
  vm.runInContext(source('ui.js').split('  var pedalRelease = [];')[1].split('  (function () {      // drag on the pad')[0].replace(/^/, 'var pedalRelease = [];'), g);
  function pedal() {
    const handlers = {}, fill = { style: {} };
    const node = { querySelector: () => fill, classList: { add() {}, remove() {} }, setPointerCapture() {},
      getBoundingClientRect: () => ({ top: 0, height: 100 }), addEventListener: (type, fn) => handlers[type] = fn };
    return { node, send: (type, pointerId, y = 10) => handlers[type]({pointerId, clientY: y, pointerType: 'touch', preventDefault() {}}) };
  }
  const fwd = pedal(), rev = pedal(); g.hold(fwd.node, 1); g.hold(rev.node, -1);
  fwd.send('pointerdown', 1); assert.ok(g.ptrDrive > 0);
  fwd.send('pointermove', 2, 100); assert.equal(g.ptrDrive, 1);
  rev.send('pointerdown', 2); assert.ok(g.ptrDrive < 0);
  fwd.send('pointerup', 1); assert.ok(g.ptrDrive < 0);
  rev.send('pointercancel', 2); assert.equal(g.ptrDrive, 0);
  rev.send('pointermove', 2); assert.equal(g.ptrDrive, 0);
  g.pauseGame(); fwd.send('pointerdown', 3); assert.equal(g.ptrDrive, 0);
});

test('three-star progress survives a later coached pass and reload', () => {
  const g = game(); g.guideOn = false; g.reset();
  g.s = { x:70,y:21,t1:-Math.PI/2,t2:-Math.PI/2,v:0 }; g.started = true; g.setBrake();
  assert.equal(g.prog.fstop.stars, 3);
  g.guideOn = true; g.reset(); g.s = { x:70,y:21,t1:-Math.PI/2,t2:-Math.PI/2,v:0 }; g.started = true; g.setBrake();
  assert.equal(g.prog.fstop.stars, 3);
  const reload = game(g.storage); assert.equal(reload.prog.fstop.stars, 3); assert.equal(reload.unlocked(1), true);
});


test('entering or skipping setup does not mark the first drive complete', () => {
  const g = game(); g.showWelcome(); assert.equal(g.mode, 'setup');
  g.setupNext(); assert.equal(g.nodes.get('setup-controls').hidden, false);
  g.showMenu(); assert.equal(g.onboarded, false); assert.equal(g.storage['cdl.tutorial.v2'], undefined);
  assert.equal(g.nodes.get('learning-reminder').hidden, false);
});
test('old skipped-onboarding flag does not bypass the new first drive', () => {
  const g = game({'cdl.onboarded':'1'}); g.enterYard(); assert.equal(g.mode, 'setup');
});
test('returning players go straight to their saved drills', () => {
  const g = game({'cdl.tutorial.v2':'complete'}); g.enterYard(); assert.equal(g.mode, 'menu');
  assert.equal(g.nodes.get('welcome').hidden, true);
});
test('drill briefing blocks movement and scoring until Start driving', () => {
  const g = game(); g.startLevel(0); const before = JSON.stringify(g.s);
  g.ptrDrive = 1; g.step(1); g.setBrake();
  assert.equal(JSON.stringify(g.s), before); assert.equal(g.finished, false); assert.equal(g.started, false);
  g.beginDrill(); assert.equal(g.ptrDrive, 0); assert.equal(g.briefing, false);
});
test('guided first drive completes through real inputs, stops at checkpoints and persists only at the end', () => {
  const g = game(); g.startTutorial();
  function untilNext(direction, steer, maxSeconds = 45) {
    const step = g.tut.i;
    for (let i = 0; i < 60 * maxSeconds && g.tut.i === step; i++) {
      g.ptrDrive = direction; g.setSteer(steer); g.step(1/60); g.tutTick();
    }
    assert.equal(g.tut.i, step + 1, 'lesson stuck: ' + step + ' state ' + JSON.stringify(g.s));
    assert.equal(g.s.v, 0); assert.equal(g.ptrDrive, 0);
    assert.equal(g.storage['cdl.tutorial.v2'], undefined);
  }
  untilNext(0.6, 0); // forward
  untilNext(0, 0.9); // right steering
  untilNext(0, -0.9); // left steering
  untilNext(0, 0); // center
  untilNext(-0.6, 0.85); // reverse with right steering
  untilNext(0.6, 0); // center and pull forward
  g.setView('seat'); g.tutTick(); assert.equal(g.tut.i, 7);
  g.setBrake(); assert.equal(g.finished, true); assert.equal(g.onboarded, true);
  assert.equal(g.storage['cdl.tutorial.v2'], 'complete');
});
test('backing lesson requires the instructed direction, not just any large angle', () => {
  const g = game(); g.startTutorial(); g.tut.i = 4;
  g.s.v = -1; g.s.t1 = g.s.t2 + 0.6; assert.equal(g.STEPS[4].done(), false);
  g.s.t1 = g.s.t2 - 0.6; assert.equal(g.STEPS[4].done(), true);
});
test('keyboard and touch instructions match the selected help mode', () => {
  const g = game(); g.setControlHelp('touch'); assert.match(g.STEPS[0].t(), /FWD/);
  g.setControlHelp('keyboard'); assert.match(g.STEPS[0].t(), /↑/);
});
