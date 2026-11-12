
  // ---- sound: everything is synthesised in the browser, so there are no audio files to host ----
  var AC = null, soundOn = true, eng = null, beepAt = 0;
  try { soundOn = localStorage.getItem('cdl.sound') !== 'off'; } catch (e) {}
  function audio() {
    if (!soundOn) return null;
    if (!AC) {
      var K = window.AudioContext || window.webkitAudioContext; if (!K) return null;
      try { AC = new K(); } catch (e) { return null; }
      var o1 = AC.createOscillator(), o2 = AC.createOscillator(), lp = AC.createBiquadFilter(), g = AC.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 42; o2.frequency.value = 63;
      lp.type = 'lowpass'; lp.frequency.value = 520; g.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(AC.destination); o1.start(); o2.start();
      eng = { o1: o1, o2: o2, g: g };
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type, vol, delay) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur, freq, vol, delay) {
    var a = audio(); if (!a) return;
    var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + (delay || 0);
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.7;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(a.destination); src.start(t);
  }
  function buzz(ms) { if (soundOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }
  var sfx = {
    brake: function () { hiss(0.7, 3200, 0.16); },                                     // air brake
    hit: function () { tone(70, 0.22, 'sine', 0.3); hiss(0.12, 900, 0.18); buzz(60); },  // cone or dock
    pass: function () { tone(110, 0.12, 'square', 0.12, 0.45); tone(660, 0.18, 'sine', 0.12, 0.6); tone(880, 0.3, 'sine', 0.12, 0.76); },
    fail: function () { tone(196, 0.25, 'sine', 0.12, 0.45); tone(147, 0.4, 'sine', 0.12, 0.66); },
    step: function () { tone(740, 0.08, 'sine', 0.06); }
  };
  // called every frame: the engine note follows speed, and the backup alarm beeps while reversing
  function engineTick(running, v) {
    if (!AC || !eng) return;
    var t = AC.currentTime, sp = Math.abs(v), on = running && soundOn;
    eng.g.gain.setTargetAtTime(on ? 0.045 + sp * 0.01 : 0, t, 0.15);
    eng.o1.frequency.setTargetAtTime(42 + sp * 4, t, 0.2); eng.o2.frequency.setTargetAtTime(63 + sp * 6, t, 0.2);
    if (on && v < -0.15 && t > beepAt) { tone(1050, 0.3, 'square', 0.035); beepAt = t + 0.8; }
  }
  function setSound(on) {
    soundOn = on; save('cdl.sound', on ? 'on' : 'off');
    if (on) audio(); else if (eng) eng.g.gain.value = 0;
  }
