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
    document: { documentElement: {}, getElementById: node, hidden: false }, window: {},
    getComputedStyle: () => ({ getPropertyValue: () => '#000000' }) });
  vm.runInContext(source('core.js') + source('experience.js') + source('ui.js').split('  // ---- drawing:')[0], g);
  g.setSteer = value => { g.steer = Math.max(-1, Math.min(1, value)); };
  g.setView = value => { g.viewMode = value; };
  g.buildLevel = () => {}; g.fit = () => {};
  g.nodes = nodes; g.storage = storage;
  g.startLevel(0);
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
  const g = game(); g.startLevel(1); g.setBrake(); assert.equal(g.finished, false);
  g.setBrake(); assert.equal(g.finished, true); assert.equal(g.prog.straight, undefined);
});
test('short throttle taps do not count as a pull-up, sustained forward travel does', () => {
  const g = game(); g.startLevel(1); drive(g, -1, 2); drive(g, 1, 0.1);
  assert.equal(g.pullups, 0); drive(g, 1, 2); assert.equal(g.pullups, 1);
  drive(g, 1, 2); assert.equal(g.pullups, 1);
});
test('get out requires a stop and blocks steering and driving', () => {
  const g = game(); g.startLevel(1); g.ptrDrive = 1; g.toggleLook(); assert.equal(g.looking, false);
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
    const g = game(); g.startLevel(level);
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
