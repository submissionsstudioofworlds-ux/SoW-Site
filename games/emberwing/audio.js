/* Emberwing — procedural chiptune audio. No files, everything is synthesised.
 * The context stays suspended until the first real user gesture (autoplay policy).
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master, sfxBus, musicBus;
  var noiseBuf = null;
  var enabled = true;
  var started = false;
  var voices = 0;          // crude polyphony cap so rapid fire cannot clip
  var VOICE_CAP = 16;

  function init() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.32;
    musicBus.connect(master);

    // one second of white noise, reused by every noise voice
    var len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function now() { return ctx.currentTime; }

  function ready() {
    return enabled && started && ctx && ctx.state === 'running';
  }

  function track(node, stopAt) {
    voices++;
    node.onended = function () { voices--; };
    node.stop(stopAt);
  }

  /* ---------- primitive voices ------------------------------------------ */
  function tone(opts) {
    if (!ready() || voices > VOICE_CAP) return;
    var t = now();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1 != null) {
      if (opts.exp === false) o.frequency.linearRampToValueAtTime(opts.f1, t + opts.dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t + opts.dur);
    }
    var peak = opts.gain == null ? 0.2 : opts.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

    var dest = opts.dest || sfxBus;
    o.connect(g);
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.setValueAtTime(opts.fc0 || 1200, t);
      if (opts.fc1) f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.fc1), t + opts.dur);
      g.connect(f); f.connect(dest);
    } else {
      g.connect(dest);
    }
    o.start(t);
    track(o, t + opts.dur + 0.02);
  }

  function noise(opts) {
    if (!ready() || voices > VOICE_CAP) return;
    var t = now();
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    if (opts.rate) s.playbackRate.value = opts.rate;

    var f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.Q.value = opts.q == null ? 1 : opts.q;
    f.frequency.setValueAtTime(opts.fc0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, opts.fc1 || opts.fc0), t + opts.dur);

    var g = ctx.createGain();
    var peak = opts.gain == null ? 0.2 : opts.gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

    s.connect(f); f.connect(g); g.connect(opts.dest || sfxBus);
    s.start(t);
    track(s, t + opts.dur + 0.02);
  }

  /* ---------- game sound effects ---------------------------------------- */
  var SFX = {
    fire: function () {
      noise({ fc0: 900, fc1: 260, q: 0.8, dur: 0.16, gain: 0.13, filter: 'lowpass' });
      tone({ type: 'sawtooth', f0: 320, f1: 90, dur: 0.12, gain: 0.05 });
    },
    frost: function () {
      noise({ fc0: 5200, fc1: 2600, q: 3, dur: 0.2, gain: 0.1 });
      tone({ type: 'triangle', f0: 1500, f1: 700, dur: 0.18, gain: 0.06 });
    },
    zap: function () {
      tone({ type: 'square', f0: 1800, f1: 220, dur: 0.14, gain: 0.09 });
      noise({ fc0: 3800, fc1: 800, q: 2, dur: 0.14, gain: 0.1 });
    },
    hit: function () {
      noise({ fc0: 1800, fc1: 500, q: 1.2, dur: 0.09, gain: 0.14, filter: 'bandpass' });
    },
    explode: function (big) {
      noise({
        fc0: big ? 1400 : 1000, fc1: big ? 60 : 120, q: 0.6,
        dur: big ? 0.75 : 0.38, gain: big ? 0.32 : 0.22, filter: 'lowpass'
      });
      tone({ type: 'sawtooth', f0: big ? 160 : 220, f1: 30, dur: big ? 0.6 : 0.3, gain: big ? 0.14 : 0.08 });
    },
    freeze: function () {
      tone({ type: 'sine', f0: 2400, f1: 400, dur: 0.3, gain: 0.07 });
      noise({ fc0: 6000, fc1: 1200, q: 4, dur: 0.3, gain: 0.06 });
    },
    rescue: function () {
      var seq = [660, 880, 1320];
      for (var i = 0; i < seq.length; i++) {
        (function (f, d) {
          setTimeout(function () {
            tone({ type: 'square', f0: f, f1: f, dur: 0.1, gain: 0.12 });
          }, d);
        })(seq[i], i * 70);
      }
    },
    extraLife: function () {
      var seq = [523, 659, 784, 1046, 1318];
      for (var i = 0; i < seq.length; i++) {
        (function (f, d) {
          setTimeout(function () {
            tone({ type: 'square', f0: f, f1: f, dur: 0.13, gain: 0.14 });
          }, d);
        })(seq[i], i * 80);
      }
    },
    death: function () {
      tone({ type: 'sawtooth', f0: 420, f1: 40, dur: 1.1, gain: 0.2 });
      noise({ fc0: 1200, fc1: 60, q: 0.7, dur: 1.0, gain: 0.18, filter: 'lowpass' });
    },
    bossWarn: function () {
      for (var i = 0; i < 3; i++) {
        (function (d) {
          setTimeout(function () {
            tone({ type: 'square', f0: 150, f1: 150, dur: 0.22, gain: 0.16 });
            tone({ type: 'square', f0: 75, f1: 75, dur: 0.26, gain: 0.14 });
          }, d);
        })(i * 260);
      }
    },
    realmClear: function () {
      var seq = [392, 523, 659, 784, 1046, 784, 1046];
      for (var i = 0; i < seq.length; i++) {
        (function (f, d) {
          setTimeout(function () {
            tone({ type: 'square', f0: f, f1: f, dur: 0.16, gain: 0.13 });
          }, d);
        })(seq[i], i * 110);
      }
    },
    select: function () {
      tone({ type: 'square', f0: 880, f1: 1320, dur: 0.07, gain: 0.1 });
    },
    swap: function () {
      tone({ type: 'triangle', f0: 500, f1: 1000, dur: 0.08, gain: 0.09 });
    },
    empty: function () {
      tone({ type: 'square', f0: 180, f1: 120, dur: 0.07, gain: 0.06 });
    },
    start: function () {
      var seq = [261, 329, 392, 523];
      for (var i = 0; i < seq.length; i++) {
        (function (f, d) {
          setTimeout(function () {
            tone({ type: 'square', f0: f, f1: f, dur: 0.12, gain: 0.14 });
          }, d);
        })(seq[i], i * 90);
      }
    }
  };

  /* ---------- music: 16-step loop, scheduled ahead of the clock --------- */
  var music = {
    playing: false,
    step: 0,
    nextTime: 0,
    tempo: 132,
    timer: null,
    scale: [0, 3, 5, 7, 10],   // minor pentatonic
    root: 55,                  // A1
    intensity: 0
  };

  var BASS_PATTERN = [0, null, 0, null, 3, null, 0, null, 5, null, 0, null, 3, null, 7, null];

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleStep(step, time) {
    var beat = 60 / music.tempo / 4; // 16th notes

    // bass
    var b = BASS_PATTERN[step % 16];
    if (b !== null) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(midiToFreq(music.root + b), time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 1.6);
      o.connect(g); g.connect(musicBus);
      o.start(time); o.stop(time + beat * 1.7);
    }

    // arpeggio — thickens as the realm heats up
    if (step % 2 === 0 || music.intensity > 0.5) {
      var deg = music.scale[(step * 3 + Math.floor(step / 8)) % music.scale.length];
      var oct = 24 + (step % 8 < 4 ? 12 : 24);
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'square';
      o2.frequency.setValueAtTime(midiToFreq(music.root + deg + oct), time);
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(0.12 + music.intensity * 0.1, time + 0.008);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + beat * 0.9);
      o2.connect(g2); g2.connect(musicBus);
      o2.start(time); o2.stop(time + beat);
    }

    // hat
    if (step % 4 === 2) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g3 = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true;
      f.type = 'highpass'; f.frequency.value = 7000;
      g3.gain.setValueAtTime(0.0001, time);
      g3.gain.exponentialRampToValueAtTime(0.1, time + 0.004);
      g3.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      s.connect(f); f.connect(g3); g3.connect(musicBus);
      s.start(time); s.stop(time + 0.08);
    }
  }

  function musicTick() {
    if (!music.playing || !ready()) return;
    var beat = 60 / music.tempo / 4;
    while (music.nextTime < now() + 0.15) {
      scheduleStep(music.step, music.nextTime);
      music.step = (music.step + 1) % 64;
      music.nextTime += beat;
    }
  }

  var Audio = {
    unlock: unlock,

    isEnabled: function () { return enabled; },

    setEnabled: function (on) {
      enabled = !!on;
      if (master) master.gain.value = enabled ? 0.5 : 0;
      if (!enabled) Audio.stopMusic();
    },

    toggle: function () {
      Audio.setEnabled(!enabled);
      if (enabled) { unlock(); Audio.startMusic(); }
      return enabled;
    },

    play: function (name, arg) {
      if (!ready()) return;
      var fn = SFX[name];
      if (fn) fn(arg);
    },

    // Per-realm musical colour.
    setRealm: function (index) {
      var roots = [55, 53, 58, 51];  // A1, F1, A#1, D#1
      music.root = roots[index % roots.length];
      music.tempo = 132 + (index % 4) * 6;
    },

    setIntensity: function (v) {
      music.intensity = Math.max(0, Math.min(1, v));
    },

    startMusic: function () {
      if (!enabled) return;
      unlock();
      if (!ready() || music.playing) return;
      music.playing = true;
      music.step = 0;
      music.nextTime = now() + 0.06;
      music.timer = setInterval(musicTick, 40);
    },

    stopMusic: function () {
      music.playing = false;
      if (music.timer) { clearInterval(music.timer); music.timer = null; }
    }
  };

  global.Sound = Audio;
})(window);
