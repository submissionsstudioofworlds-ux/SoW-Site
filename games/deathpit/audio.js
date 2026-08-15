/* The Death Pit of Shem — procedural audio. Nothing is loaded; every sound is
 * synthesised on the fly. The context stays suspended until a real user
 * gesture, per browser autoplay policy.
 *
 * The music is a two-layer loop: a slow dorian bass pulse for the caverns and
 * a faster, dirtier variant for the Plancktopus fight. `setMode` crossfades
 * between them by swapping patterns at the next bar rather than restarting,
 * so walking into the arena does not cut the music off mid-note.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master, sfxBus, musicBus;
  var noiseBuf = null;
  var enabled = true;
  var started = false;
  var voices = 0;
  var VOICE_CAP = 18;

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
    musicBus.gain.value = 0.3;
    musicBus.connect(master);

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
  function ready() { return enabled && started && ctx && ctx.state === 'running'; }

  function track(node, stopAt) {
    voices++;
    node.onended = function () { voices--; };
    node.stop(stopAt);
  }

  /* ---------- primitive voices ------------------------------------------ */
  function tone(opts) {
    if (!ready() || voices > VOICE_CAP) return;
    var t = now() + (opts.delay || 0);
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
    var t = now() + (opts.delay || 0);
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

  // Short melodic runs, used for pickups and fanfares.
  function arp(seq, step, opts) {
    opts = opts || {};
    for (var i = 0; i < seq.length; i++) {
      tone({
        type: opts.type || 'square',
        f0: seq[i], f1: seq[i],
        dur: opts.dur || 0.12,
        gain: opts.gain == null ? 0.13 : opts.gain,
        delay: i * step
      });
    }
  }

  /* ---------- game sound effects ---------------------------------------- */
  var SFX = {
    jump: function () {
      tone({ type: 'square', f0: 300, f1: 640, dur: 0.13, gain: 0.1 });
    },
    land: function () {
      noise({ fc0: 500, fc1: 140, q: 0.7, dur: 0.09, gain: 0.09, filter: 'lowpass' });
    },
    swing: function () {
      noise({ fc0: 2600, fc1: 700, q: 1.4, dur: 0.13, gain: 0.11 });
      tone({ type: 'sawtooth', f0: 520, f1: 180, dur: 0.1, gain: 0.04 });
    },
    // Blade on rock: bright, short, and unrewarding on purpose.
    clang: function () {
      tone({ type: 'square', f0: 2100, f1: 1400, dur: 0.07, gain: 0.06 });
      noise({ fc0: 5200, fc1: 2400, q: 4, dur: 0.08, gain: 0.06 });
    },
    hit: function () {
      noise({ fc0: 1700, fc1: 420, q: 1.2, dur: 0.1, gain: 0.15, filter: 'bandpass' });
      tone({ type: 'square', f0: 260, f1: 120, dur: 0.09, gain: 0.07 });
    },
    // Wet, low, and satisfying — a tentacle coming off.
    sever: function () {
      noise({ fc0: 1200, fc1: 90, q: 0.6, dur: 0.5, gain: 0.26, filter: 'lowpass' });
      tone({ type: 'sawtooth', f0: 300, f1: 40, dur: 0.45, gain: 0.13 });
      arp([740, 880], 0.07, { type: 'triangle', dur: 0.1, gain: 0.09 });
    },
    // Rising slither: a severed arm coming back.
    regrow: function () {
      tone({ type: 'triangle', f0: 90, f1: 420, dur: 0.55, gain: 0.11 });
      noise({ fc0: 300, fc1: 1800, q: 2, dur: 0.5, gain: 0.07 });
    },
    squish: function () {
      noise({ fc0: 900, fc1: 200, q: 0.9, dur: 0.22, gain: 0.16, filter: 'lowpass' });
      tone({ type: 'triangle', f0: 200, f1: 60, dur: 0.2, gain: 0.07 });
    },
    bounce: function () {
      tone({ type: 'triangle', f0: 220, f1: 900, dur: 0.16, gain: 0.14 });
      tone({ type: 'sine', f0: 440, f1: 1400, dur: 0.14, gain: 0.07 });
    },
    spit: function () {
      tone({ type: 'sawtooth', f0: 700, f1: 200, dur: 0.14, gain: 0.06 });
      noise({ fc0: 1600, fc1: 500, q: 2, dur: 0.13, gain: 0.07 });
    },
    // Bright ascending fifth: the blade being re-forged.
    keen: function () {
      arp([523, 784, 1046, 1568], 0.06, { type: 'square', dur: 0.16, gain: 0.13 });
      noise({ fc0: 6000, fc1: 2200, q: 4, dur: 0.3, gain: 0.07 });
    },
    shieldUp: function () {
      arp([392, 523, 659], 0.06, { type: 'triangle', dur: 0.2, gain: 0.13 });
      tone({ type: 'sine', f0: 180, f1: 620, dur: 0.35, gain: 0.1 });
    },
    // Glassy crack, clearly not the sound of losing a heart.
    shieldBreak: function () {
      noise({ fc0: 5200, fc1: 900, q: 3, dur: 0.28, gain: 0.16 });
      tone({ type: 'triangle', f0: 1100, f1: 240, dur: 0.24, gain: 0.09 });
    },
    extraLife: function () {
      arp([523, 659, 784, 1046, 1318, 1568], 0.085, { type: 'square', dur: 0.15, gain: 0.15 });
    },
    glimmer: function () {
      arp([1046, 1568], 0.05, { dur: 0.08, gain: 0.08 });
    },
    heal: function () {
      arp([523, 659, 784, 1046], 0.07, { dur: 0.12, gain: 0.12 });
    },
    /* Bob's voice. A falling pitch under two band-passed formants is what
     * turns a buzz into a vowel, and the drop from an "aa" formant to an "oo"
     * one over 200ms is heard as "ow". Pitch is jittered per call so taking
     * three hits in a row does not sound like a machine. */
    ouch: function () {
      var base = 300 * (0.88 + Math.random() * 0.28);
      // Larynx: the falling pitch that carries the complaint.
      tone({ type: 'sawtooth', f0: base * 1.25, f1: base * 0.6, dur: 0.22, gain: 0.1,
             filter: 'bandpass', fc0: 820, fc1: 480 });
      // Second formant, sweeping down to round the vowel off into "oh".
      tone({ type: 'square', f0: base * 2.5, f1: base * 1.15, dur: 0.19, gain: 0.045,
             filter: 'bandpass', fc0: 1500, fc1: 900 });
      // The little breath at the front, so it starts on a consonant.
      noise({ fc0: 1900, fc1: 700, q: 1.6, dur: 0.06, gain: 0.06 });
    },

    hurt: function () {
      // Impact first, then Bob's opinion of it a beat later.
      tone({ type: 'sawtooth', f0: 380, f1: 90, dur: 0.3, gain: 0.13 });
      noise({ fc0: 900, fc1: 200, q: 0.8, dur: 0.24, gain: 0.1, filter: 'lowpass' });
      setTimeout(function () { SFX.ouch(); }, 55);
    },
    death: function () {
      SFX.ouch();
      setTimeout(function () {
        // A drawn-out, descending second cry: the sound of giving up.
        tone({ type: 'sawtooth', f0: 300, f1: 110, dur: 0.55, gain: 0.11,
               filter: 'bandpass', fc0: 780, fc1: 380 });
        tone({ type: 'square', f0: 640, f1: 240, dur: 0.5, gain: 0.04,
               filter: 'bandpass', fc0: 1400, fc1: 700 });
      }, 260);
      tone({ type: 'sawtooth', f0: 440, f1: 40, dur: 1.2, gain: 0.2 });
      noise({ fc0: 1100, fc1: 50, q: 0.7, dur: 1.1, gain: 0.16, filter: 'lowpass' });
      arp([392, 349, 311, 262, 196], 0.16, { type: 'triangle', dur: 0.2, gain: 0.1 });
    },
    // Three descending blasts: the Plancktopus noticing you.
    roar: function () {
      for (var i = 0; i < 3; i++) {
        tone({ type: 'sawtooth', f0: 120 - i * 12, f1: 44, dur: 0.5, gain: 0.18, delay: i * 0.24 });
        noise({ fc0: 420, fc1: 70, q: 0.6, dur: 0.5, gain: 0.16, filter: 'lowpass', delay: i * 0.24 });
      }
    },
    // The eye opening: the window is open, go hit it.
    expose: function () {
      arp([440, 587, 740, 880, 1174], 0.08, { type: 'square', dur: 0.16, gain: 0.15 });
      tone({ type: 'sine', f0: 60, f1: 240, dur: 0.7, gain: 0.14 });
    },
    eyeHit: function () {
      noise({ fc0: 2400, fc1: 120, q: 0.8, dur: 0.7, gain: 0.3, filter: 'lowpass' });
      tone({ type: 'sawtooth', f0: 500, f1: 30, dur: 0.8, gain: 0.18 });
    },
    victory: function () {
      arp([392, 523, 659, 784, 1046, 784, 1046, 1318], 0.11, { dur: 0.17, gain: 0.14 });
    },
    gate: function () {
      tone({ type: 'triangle', f0: 160, f1: 640, dur: 0.4, gain: 0.12 });
      noise({ fc0: 400, fc1: 2200, q: 2, dur: 0.4, gain: 0.06 });
    },
    select: function () {
      tone({ type: 'square', f0: 880, f1: 1320, dur: 0.07, gain: 0.1 });
    },
    start: function () {
      arp([196, 262, 311, 392, 523], 0.09, { dur: 0.14, gain: 0.14 });
    },
    // A drip, for the cavern ambience. Pitch varies so it never loops audibly.
    drip: function () {
      var f = 900 + Math.random() * 1400;
      tone({ type: 'sine', f0: f, f1: f * 0.35, dur: 0.18, gain: 0.05 });
    }
  };

  /* ---------- music ------------------------------------------------------
   * 16th-note scheduler running ahead of the audio clock. Two patterns share
   * the scheduler; `mode` picks which one plays and only takes effect on a
   * bar line, so transitions never clip a note.
   */
  var music = {
    playing: false,
    step: 0,
    nextTime: 0,
    timer: null,
    mode: 'cave',
    pending: null,
    intensity: 0,
    root: 43              // G1 — low enough to feel like being underground
  };

  var PATTERNS = {
    cave: {
      tempo: 104,
      scale: [0, 2, 3, 5, 7, 9, 10],                 // dorian: eerie, not evil
      bass: [0, null, null, 0, null, 7, null, null, 5, null, null, 5, null, 3, null, null],
      lead: [12, null, 15, null, 19, null, 15, null, 17, null, 15, null, 12, null, 10, null],
      hatEvery: 8,
      leadType: 'triangle',
      leadGain: 0.08
    },
    boss: {
      tempo: 152,
      scale: [0, 1, 3, 5, 6, 8, 10],                 // locrian-ish: properly nasty
      bass: [0, 0, null, 0, 6, null, 0, null, 0, 0, null, 3, 1, null, 0, null],
      lead: [12, 13, 15, 13, 18, null, 15, 13, 12, 13, 15, 18, 19, 18, 15, 13],
      hatEvery: 2,
      leadType: 'square',
      leadGain: 0.11
    }
  };

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scheduleStep(step, time) {
    var pat = PATTERNS[music.mode];
    var beat = 60 / pat.tempo / 4;

    var b = pat.bass[step % 16];
    if (b !== null && b !== undefined) {
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(midiToFreq(music.root + b), time);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(420 + music.intensity * 900, time);
      f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.4, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 2.4);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(time); o.stop(time + beat * 2.5);
    }

    var l = pat.lead[step % 16];
    if (l !== null && l !== undefined) {
      var o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = pat.leadType;
      o2.frequency.setValueAtTime(midiToFreq(music.root + l + 12), time);
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(pat.leadGain + music.intensity * 0.06, time + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + beat * 1.4);
      o2.connect(g2); g2.connect(musicBus);
      o2.start(time); o2.stop(time + beat * 1.5);
    }

    // A sparse upper voice that only appears when things get tense.
    if (music.intensity > 0.55 && step % 4 === 3) {
      var deg = pat.scale[(step * 5) % pat.scale.length];
      var o3 = ctx.createOscillator(), g3 = ctx.createGain();
      o3.type = 'square';
      o3.frequency.setValueAtTime(midiToFreq(music.root + deg + 36), time);
      g3.gain.setValueAtTime(0.0001, time);
      g3.gain.exponentialRampToValueAtTime(0.05, time + 0.006);
      g3.gain.exponentialRampToValueAtTime(0.0001, time + beat * 0.7);
      o3.connect(g3); g3.connect(musicBus);
      o3.start(time); o3.stop(time + beat * 0.8);
    }

    if (step % pat.hatEvery === (pat.hatEvery > 2 ? 4 : 0)) {
      var s = ctx.createBufferSource(), hf = ctx.createBiquadFilter(), g4 = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true;
      hf.type = 'highpass'; hf.frequency.value = 6800;
      g4.gain.setValueAtTime(0.0001, time);
      g4.gain.exponentialRampToValueAtTime(0.08, time + 0.004);
      g4.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
      s.connect(hf); hf.connect(g4); g4.connect(musicBus);
      s.start(time); s.stop(time + 0.08);
    }

    // Kick on the downbeats — the only thing keeping the caverns walkable.
    if (step % 8 === 0) {
      var k = ctx.createOscillator(), gk = ctx.createGain();
      k.type = 'sine';
      k.frequency.setValueAtTime(150, time);
      k.frequency.exponentialRampToValueAtTime(40, time + 0.11);
      gk.gain.setValueAtTime(0.0001, time);
      gk.gain.exponentialRampToValueAtTime(0.5, time + 0.006);
      gk.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
      k.connect(gk); gk.connect(musicBus);
      k.start(time); k.stop(time + 0.2);
    }
  }

  function musicTick() {
    if (!music.playing || !ready()) return;
    var pat = PATTERNS[music.mode];
    var beat = 60 / pat.tempo / 4;
    while (music.nextTime < now() + 0.15) {
      // Mode changes land on a bar line so nothing gets cut off mid-phrase.
      if (music.pending && music.step % 16 === 0) {
        music.mode = music.pending;
        music.pending = null;
        pat = PATTERNS[music.mode];
        beat = 60 / pat.tempo / 4;
      }
      scheduleStep(music.step, music.nextTime);
      music.step = (music.step + 1) % 64;
      music.nextTime += beat;
    }
  }

  var Sound = {
    unlock: unlock,

    isEnabled: function () { return enabled; },

    setEnabled: function (on) {
      enabled = !!on;
      if (master) master.gain.value = enabled ? 0.5 : 0;
      if (!enabled) Sound.stopMusic();
    },

    toggle: function () {
      Sound.setEnabled(!enabled);
      if (enabled) { unlock(); Sound.startMusic(); }
      return enabled;
    },

    play: function (name, arg) {
      if (!ready()) return;
      var fn = SFX[name];
      if (fn) fn(arg);
    },

    // 'cave' or 'boss'; applied at the next bar line.
    setMode: function (mode) {
      if (!PATTERNS[mode] || mode === music.mode) { music.pending = null; return; }
      music.pending = mode;
    },

    setIntensity: function (v) {
      music.intensity = Math.max(0, Math.min(1, v));
    },

    // Each level drops the root a semitone: the pit keeps getting deeper.
    setDepth: function (level) {
      music.root = 43 - Math.min(6, level - 1);
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

  global.PitSound = Sound;
})(window);
