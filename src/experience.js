  // Sound is synthesized locally and starts only after a player gesture.
  var soundOn = false, soundCtx = null, engine = null, engineGain = null, masterGain = null;
  try { soundOn = localStorage.getItem('cdl.sound') === 'on'; } catch (e) {}
  function initSound() {
    if (!soundOn) return;
    try {
      if (!soundCtx) {
        var Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        soundCtx = new Audio(); masterGain = soundCtx.createGain();
        masterGain.gain.value = 0.22; masterGain.connect(soundCtx.destination);
        engine = soundCtx.createOscillator(); engine.type = 'triangle';
        engineGain = soundCtx.createGain(); engineGain.gain.value = 0;
        engine.connect(engineGain); engineGain.connect(masterGain); engine.start();
      }
      if (soundCtx.state === 'suspended') soundCtx.resume().catch(function () {});
    } catch (e) { soundOn = false; }
  }
  function tone(freq, duration, delay, type) {
    if (!soundOn || !soundCtx || soundCtx.state !== 'running') return;
    var at = soundCtx.currentTime + (delay || 0), osc = soundCtx.createOscillator(), gain = soundCtx.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.3, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain); gain.connect(masterGain); osc.start(at); osc.stop(at + duration + 0.02);
    osc.onended = function () { osc.disconnect(); gain.disconnect(); };
  }
  function chime(kind) {
    if (kind === 'win') [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.35, i * 0.12); });
    else if (kind === 'step') { tone(660, 0.16); tone(880, 0.2, 0.1); }
    else if (kind === 'warn') tone(180, 0.22, 0, 'triangle');
    else { tone(330, 0.2); tone(247, 0.3, 0.16); }
  }
  var reverseBeep = 0;
  function soundTick(dt) {
    if (!soundCtx || !engineGain) return;
    var live = soundOn && mode === 'game' && !paused && !briefing && !finished && !looking && !document.hidden;
    engine.frequency.setTargetAtTime(43 + Math.abs(s.v) * 11, soundCtx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(live ? 0.08 + Math.abs(s.v) * 0.025 : 0, soundCtx.currentTime, 0.06);
    reverseBeep -= dt;
    if (live && s.v < -0.1 && reverseBeep <= 0) { tone(780, 0.13); reverseBeep = 0.85; }
  }
  function updateSoundButton() {
    $('setup-sound').checked = soundOn;
    $('b-sound').textContent = soundOn ? 'Sound on' : 'Sound off';
    $('b-sound').setAttribute('aria-pressed', String(soundOn));
  }

  // A bounded, in-memory recording. Playback never runs scoring or physics.
  var history = [], recordingTime = 0, sampleAt = 0, replay = null, paused = false, wasBoxed = false;
  function snapshot() {
    return { t: recordingTime, s: { x: s.x, y: s.y, t1: s.t1, t2: s.t2, v: s.v },
      steer: steer, hits: cones.map(function (c) { return c.hit; }), dirty: dirty, bumped: bumped };
  }
  function recordTick(dt) {
    recordingTime += dt; sampleAt += dt;
    if (sampleAt < 0.1) return;
    sampleAt = 0; history.push(snapshot());
    if (history.length > 12000) history.shift();
  }
  function applySnapshot(f) {
    s = Object.assign({}, f.s); setSteer(f.steer); dirty = f.dirty; bumped = f.bumped;
    cones.forEach(function (c, i) { c.hit = f.hits[i]; });
  }
  function startReplay() {
    if (!finished || history.length < 2) return;
    releaseControls();
    replay = { final: snapshot(), view: viewMode, time: history[0].t, index: 0, speed: 1 };
    setView('top'); $('sheet').hidden = true; $('replaybar').hidden = false;
    $('replay-speed').textContent = '1×'; $('b-reset').disabled = true; $('b-guide').disabled = true;
    $('replay-seek').max = history.length - 1; applySnapshot(history[0]);
  }
  function stopReplay() {
    if (!replay) return;
    var prior = replay; replay = null; applySnapshot(prior.final); setView(prior.view);
    $('replaybar').hidden = true; $('sheet').hidden = false;
    $('b-reset').disabled = false; $('b-guide').disabled = false;
  }
  function replayTick(dt) {
    replay.time = Math.min(history[history.length - 1].t, replay.time + dt * replay.speed);
    while (replay.index + 1 < history.length && history[replay.index + 1].t <= replay.time) replay.index++;
    applySnapshot(history[replay.index]);
    $('replay-seek').value = replay.index;
    $('replay-time').textContent = clock(replay.time - history[0].t) + ' / ' + clock(history[history.length - 1].t - history[0].t);
  }
  function releaseControls() {
    keys = {}; ptrDrive = 0; keyAmt = 0.35;
    if (typeof pedalRelease !== 'undefined') pedalRelease.forEach(function (fn) { fn(); });
  }
  function pauseGame() {
    releaseControls();
    if (mode !== 'game' || finished || briefing || paused) return;
    paused = true; $('pause-panel').hidden = false; $('b-resume').focus();
    if (engineGain) engineGain.gain.setValueAtTime(0, soundCtx.currentTime);
  }
  function resumeGame() {
    releaseControls(); paused = false; $('pause-panel').hidden = true; initSound();
  }
